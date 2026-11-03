create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  notification_type text not null check (
    notification_type in ('session_request', 'session_accepted', 'session_declined', 'activity_reviewed')
  ),
  title text not null,
  body text not null,
  entity_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_recipient_created_at_idx
  on public.notifications (recipient_id, created_at desc);
create index notifications_unread_recipient_idx
  on public.notifications (recipient_id)
  where read_at is null;

alter table public.notifications enable row level security;

create policy notifications_select_own
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

create policy notifications_update_own_read_state
  on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.create_session_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_skill_name text;
  v_actor_name text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'requested' then
      return new;
    end if;

    select s.name into v_skill_name
    from public.skills s
    where s.id = new.skill_id;

    select coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'A student')
    into v_actor_name
    from public.profiles p
    where p.id = new.learner_id;

    insert into public.notifications (
      recipient_id, actor_id, notification_type, title, body, entity_id
    ) values (
      new.teacher_id,
      new.learner_id,
      'session_request',
      'New learning request',
      v_actor_name || ' requested a session for ' || coalesce(v_skill_name, 'a skill') || '.',
      new.id
    );
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status not in ('accepted', 'declined') then
    return new;
  end if;

  select s.name into v_skill_name
  from public.skills s
  where s.id = new.skill_id;

  select coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'Your teacher')
  into v_actor_name
  from public.profiles p
  where p.id = new.teacher_id;

  insert into public.notifications (
    recipient_id, actor_id, notification_type, title, body, entity_id
  ) values (
    new.learner_id,
    new.teacher_id,
    case when new.status = 'accepted' then 'session_accepted' else 'session_declined' end,
    case when new.status = 'accepted' then 'Session request accepted' else 'Session request declined' end,
    v_actor_name || case when new.status = 'accepted'
      then ' accepted your request to learn ' || coalesce(v_skill_name, 'this skill') || '.'
      else ' could not accept your request to learn ' || coalesce(v_skill_name, 'this skill') || '.'
    end,
    new.id
  );
  return new;
end;
$$;

create trigger learning_session_notification_insert
  after insert on public.learning_sessions
  for each row execute function public.create_session_notifications();

create trigger learning_session_notification_status_change
  after update of status on public.learning_sessions
  for each row execute function public.create_session_notifications();

create or replace function public.create_activity_review_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activity_title text;
  v_teacher_name text;
begin
  if new.status <> 'reviewed' or old.status = 'reviewed' then
    return new;
  end if;

  select sa.title, coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'Your teacher')
  into v_activity_title, v_teacher_name
  from public.session_activities sa
  join public.session_missions sm on sm.id = sa.mission_id
  join public.learning_sessions ls on ls.id = sm.session_id
  join public.profiles p on p.id = ls.teacher_id
  where sa.id = new.activity_id;

  insert into public.notifications (
    recipient_id, actor_id, notification_type, title, body, entity_id
  ) values (
    new.student_id,
    new.reviewed_by,
    'activity_reviewed',
    case when new.passed then 'Practice passed' else 'Practice reviewed' end,
    v_teacher_name || case when new.passed
      then ' passed your ' || coalesce(v_activity_title, 'practice work') || ' submission. You earned ' || new.xp_earned::text || ' XP.'
      else ' reviewed your ' || coalesce(v_activity_title, 'practice work') || ' submission. Check the feedback and try again.'
    end,
    new.id
  );
  return new;
end;
$$;

create trigger activity_attempt_review_notification
  after update of status on public.activity_attempts
  for each row execute function public.create_activity_review_notification();

revoke all on function public.create_session_notifications() from public, anon, authenticated;
revoke all on function public.create_activity_review_notification() from public, anon, authenticated;
