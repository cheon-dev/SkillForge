-- Report triage, project activity and cancellation notifications, and
-- authenticated Firebase web-push registrations.

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'session_request',
    'session_accepted',
    'session_declined',
    'session_completed',
    'session_cancelled',
    'session_reminder',
    'challenge_submitted',
    'challenge_reviewed',
    'achievement_unlocked',
    'new_message',
    'activity_reviewed',
    'project_added',
    'project_task_assigned',
    'project_activity',
    'duel_challenged',
    'duel_completed'
  ));

create table public.student_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in (
    'harassment',
    'spam',
    'inappropriate_content',
    'impersonation',
    'other'
  )),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open'
    check (status in ('open', 'resolved', 'dismissed')),
  moderator_id uuid references public.profiles(id) on delete set null,
  moderator_note text check (moderator_note is null or char_length(moderator_note) <= 1000),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (reporter_id <> target_user_id)
);

create index student_reports_status_created_idx
  on public.student_reports (status, created_at desc);
create unique index student_reports_one_open_per_reporter_target
  on public.student_reports (reporter_id, target_user_id)
  where status = 'open';

alter table public.student_reports enable row level security;
revoke all on public.student_reports from public, anon, authenticated;

create or replace function public.submit_student_report(
  p_target_user_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporter_id uuid := auth.uid();
  v_report_id uuid;
begin
  if v_reporter_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if p_target_user_id is null or p_target_user_id = v_reporter_id then
    raise exception using errcode = '22023', message = 'Choose another student to report';
  end if;

  if p_reason is null or p_reason not in ('harassment', 'spam', 'inappropriate_content', 'impersonation', 'other') then
    raise exception using errcode = '22023', message = 'Choose a valid report reason';
  end if;

  if p_details is not null and char_length(pg_catalog.btrim(p_details)) > 1000 then
    raise exception using errcode = '22023', message = 'Report details must be 1000 characters or fewer';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = p_target_user_id
  ) then
    raise exception using errcode = 'P0002', message = 'The student was not found';
  end if;

  insert into public.student_reports (reporter_id, target_user_id, reason, details)
  values (
    v_reporter_id,
    p_target_user_id,
    p_reason,
    nullif(pg_catalog.btrim(coalesce(p_details, '')), '')
  )
  returning id into v_report_id;

  return v_report_id;
end;
$$;

create or replace function public.admin_list_student_reports(p_status text default 'open')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reports jsonb;
begin
  if not public.is_moderator() then
    raise exception using errcode = '42501', message = 'Moderator access is required';
  end if;

  if p_status is null or p_status not in ('open', 'resolved', 'dismissed', 'all') then
    raise exception using errcode = '22023', message = 'Choose a valid report status';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'reporter_id', r.reporter_id,
        'reporter_name', coalesce(nullif(pg_catalog.btrim(reporter.full_name), ''), 'SkillForge student'),
        'target_user_id', r.target_user_id,
        'target_name', coalesce(nullif(pg_catalog.btrim(target.full_name), ''), 'SkillForge student'),
        'reason', r.reason,
        'details', r.details,
        'status', r.status,
        'moderator_note', r.moderator_note,
        'created_at', r.created_at,
        'reviewed_at', r.reviewed_at
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_reports
  from public.student_reports r
  join public.profiles reporter on reporter.id = r.reporter_id
  join public.profiles target on target.id = r.target_user_id
  where p_status = 'all' or r.status = p_status;

  return v_reports;
end;
$$;

create or replace function public.admin_resolve_student_report(
  p_report_id uuid,
  p_status text,
  p_moderator_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moderator_id uuid := auth.uid();
begin
  if v_moderator_id is null or not public.is_moderator() then
    raise exception using errcode = '42501', message = 'Moderator access is required';
  end if;

  if p_status is null or p_status not in ('resolved', 'dismissed') then
    raise exception using errcode = '22023', message = 'Choose resolved or dismissed';
  end if;

  if p_moderator_note is not null and char_length(pg_catalog.btrim(p_moderator_note)) > 1000 then
    raise exception using errcode = '22023', message = 'Moderator notes must be 1000 characters or fewer';
  end if;

  update public.student_reports
  set status = p_status,
      moderator_id = v_moderator_id,
      moderator_note = nullif(pg_catalog.btrim(coalesce(p_moderator_note, '')), ''),
      reviewed_at = pg_catalog.now()
  where id = p_report_id and status = 'open';

  if not found then
    raise exception using errcode = 'P0002', message = 'The open report was not found';
  end if;
end;
$$;

create table public.push_tokens (
  token text primary key check (char_length(token) between 20 and 4096),
  student_id uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create index push_tokens_student_id_idx on public.push_tokens (student_id);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from public, anon, authenticated;

create table public.session_reminders (
  session_id uuid not null references public.learning_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (session_id, student_id)
);

alter table public.session_reminders enable row level security;
revoke all on public.session_reminders from public, anon, authenticated;

create or replace function public.register_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_rows integer;
begin
  if v_student_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;
  if p_token is null or char_length(p_token) not between 20 and 4096 then
    raise exception using errcode = '22023', message = 'A valid push token is required';
  end if;

  insert into public.push_tokens (token, student_id)
  values (p_token, v_student_id)
  on conflict (token) do update
  set student_id = excluded.student_id,
      updated_at = pg_catalog.now()
  where public.push_tokens.student_id = excluded.student_id;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception using errcode = '23505', message = 'This push token is registered to another account';
  end if;
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  delete from public.push_tokens
  where token = p_token and student_id = auth.uid();
end;
$$;

create or replace function public.notify_session_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_recipient_id uuid;
  v_skill_name text;
  v_actor_name text;
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return new;
  end if;

  if v_actor_id = new.learner_id then
    v_recipient_id := new.teacher_id;
  else
    v_recipient_id := new.learner_id;
  end if;

  select s.name into v_skill_name
  from public.skills s where s.id = new.skill_id;
  select coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'A participant')
  into v_actor_name
  from public.profiles p where p.id = v_actor_id;

  insert into public.notifications (
    recipient_id, actor_id, notification_type, title, body, entity_id
  ) values (
    v_recipient_id,
    v_actor_id,
    'session_cancelled',
    'Learning session cancelled',
    v_actor_name || ' cancelled the ' || coalesce(v_skill_name, 'learning') || ' session.',
    new.id
  );
  return new;
end;
$$;

drop trigger if exists learning_session_cancelled_notification on public.learning_sessions;
create trigger learning_session_cancelled_notification
after update of status on public.learning_sessions
for each row execute function public.notify_session_cancelled();

create or replace function public.notify_project_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_name text;
begin
  select p.name into v_project_name
  from public.projects p where p.id = new.project_id;

  insert into public.notifications (
    recipient_id, actor_id, notification_type, title, body, entity_id
  )
  select recipients.student_id,
         new.actor_id,
         'project_activity',
         'Project update',
         coalesce(v_project_name, 'A project') || ': ' || new.summary,
         new.project_id
  from (
    select p.owner_id as student_id
    from public.projects p
    where p.id = new.project_id
    union
    select pm.student_id
    from public.project_members pm
    where pm.project_id = new.project_id
  ) recipients
  where recipients.student_id is distinct from new.actor_id;

  return new;
end;
$$;

drop trigger if exists project_event_notification on public.project_events;
create trigger project_event_notification
after insert on public.project_events
for each row execute function public.notify_project_activity();

revoke all on function public.submit_student_report(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_student_report(uuid, text, text)
  to authenticated;

revoke all on function public.admin_list_student_reports(text)
  from public, anon, authenticated;
grant execute on function public.admin_list_student_reports(text)
  to authenticated;

revoke all on function public.admin_resolve_student_report(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_resolve_student_report(uuid, text, text)
  to authenticated;

revoke all on function public.register_push_token(text)
  from public, anon, authenticated;
grant execute on function public.register_push_token(text)
  to authenticated;

revoke all on function public.unregister_push_token(text)
  from public, anon, authenticated;
grant execute on function public.unregister_push_token(text)
  to authenticated;

revoke all on function public.notify_session_cancelled()
  from public, anon, authenticated;
revoke all on function public.notify_project_activity()
  from public, anon, authenticated;
