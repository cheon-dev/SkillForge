-- Teacher-approved learning session completion.
--
-- features.md section 5F requires that a session can only be completed once its
-- required completion conditions are met, and explicitly forbids completing a
-- session merely because the scheduled end time has passed. Until now the
-- 'completed' status had no UPDATE policy and no RPC, so it was unreachable.
--
-- All status transitions continue to go through SECURITY DEFINER RPCs: the
-- blanket participant UPDATE policy was deliberately removed in
-- 20261010000000_peer_session_requests.sql, and this migration does not
-- reintroduce it.

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'session_request',
    'session_accepted',
    'session_declined',
    'session_completed',
    'activity_reviewed'
  ));

create or replace function public.complete_learning_session(p_session_id uuid)
returns public.learning_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_session public.learning_sessions;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select * into v_session
  from public.learning_sessions ls
  where ls.id = p_session_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Learning session was not found';
  end if;

  if v_session.teacher_id is distinct from v_caller_id then
    raise exception using errcode = '42501', message = 'Only the assigned teacher can complete this session';
  end if;

  if v_session.status not in ('accepted', 'scheduled') then
    raise exception using errcode = '55000', message = 'This session is not open for completion';
  end if;

  -- An unsettled reschedule must be resolved before the session can be closed,
  -- otherwise the recorded session time could change after completion.
  if v_session.proposed_scheduled_at is not null then
    raise exception using errcode = '55000', message = 'Respond to the pending time change before completing this session';
  end if;

  if not exists (
    select 1 from public.session_missions sm where sm.session_id = p_session_id
  ) then
    raise exception using errcode = '55000', message = 'A session needs at least one mission before it can be completed';
  end if;

  if exists (
    select 1
    from public.session_missions sm
    where sm.session_id = p_session_id
      and sm.status <> 'completed'
  ) then
    raise exception using errcode = '55000', message = 'Every mission must be completed before the session can be completed';
  end if;

  update public.learning_sessions
  set status = 'completed'
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

-- Making 'completed' reachable exposed a pre-existing hole: this function was
-- the only session RPC with no status guard, so a pending time proposal could
-- be accepted after a session was already completed and silently rewrite
-- scheduled_at on a closed session. cancel_learning_session and
-- propose_learning_session_time already guard on status.
create or replace function public.respond_to_session_time_change(
  p_session_id uuid,
  p_accept boolean
)
returns public.learning_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.learning_sessions;
  v_caller_id uuid := auth.uid();
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if p_accept is null then
    raise exception using errcode = '22023', message = 'A response is required';
  end if;

  select * into v_session
  from public.learning_sessions ls
  where ls.id = p_session_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Learning session was not found';
  end if;

  if v_session.status not in ('accepted', 'scheduled') then
    raise exception using errcode = '55000', message = 'This session is no longer open for time changes';
  end if;

  if v_session.proposed_by is null or v_session.proposed_scheduled_at is null then
    raise exception using errcode = '55000', message = 'There is no pending time change';
  end if;

  if v_caller_id not in (v_session.learner_id, v_session.teacher_id)
    or v_caller_id = v_session.proposed_by then
    raise exception using errcode = '42501', message = 'Only the other session participant can respond';
  end if;

  if p_accept and v_session.proposed_scheduled_at <= pg_catalog.now() then
    raise exception using errcode = '22023', message = 'The proposed time has already passed';
  end if;

  update public.learning_sessions
  set scheduled_at = case when p_accept then proposed_scheduled_at else scheduled_at end,
      proposed_scheduled_at = null,
      proposed_by = null
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

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

  if new.status not in ('accepted', 'declined', 'completed') then
    return new;
  end if;

  select s.name into v_skill_name
  from public.skills s
  where s.id = new.skill_id;

  select coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'Your teacher')
  into v_actor_name
  from public.profiles p
  where p.id = new.teacher_id;

  if new.status = 'completed' then
    insert into public.notifications (
      recipient_id, actor_id, notification_type, title, body, entity_id
    ) values (
      new.learner_id,
      new.teacher_id,
      'session_completed',
      'Learning session completed',
      v_actor_name || ' completed your ' || coalesce(v_skill_name, 'skill') || ' session. Your reviewed work and XP are now part of your learning history.',
      new.id
    );
    return new;
  end if;

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

revoke all on function public.complete_learning_session(uuid)
  from public, anon, authenticated;
grant execute on function public.complete_learning_session(uuid) to authenticated;

revoke all on function public.respond_to_session_time_change(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.respond_to_session_time_change(uuid, boolean) to authenticated;

revoke all on function public.create_session_notifications()
  from public, anon, authenticated;