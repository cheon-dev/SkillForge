-- Participant-managed cancellation and mutually approved session time changes.

alter table public.learning_sessions
  add column proposed_scheduled_at timestamptz,
  add column proposed_by uuid references public.profiles(id) on delete set null;

alter table public.learning_sessions
  add constraint learning_sessions_time_proposal_pair
  check ((proposed_scheduled_at is null) = (proposed_by is null));

create or replace function public.cancel_learning_session(p_session_id uuid)
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

  select * into v_session
  from public.learning_sessions ls
  where ls.id = p_session_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Learning session was not found';
  end if;

  if v_caller_id not in (v_session.learner_id, v_session.teacher_id) then
    raise exception using errcode = '42501', message = 'Only a session participant can cancel it';
  end if;

  if v_session.status not in ('requested', 'accepted', 'scheduled') then
    raise exception using errcode = '55000', message = 'This session can no longer be cancelled';
  end if;

  update public.learning_sessions
  set status = 'cancelled', proposed_scheduled_at = null, proposed_by = null
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.propose_learning_session_time(
  p_session_id uuid,
  p_scheduled_at timestamptz
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

  if p_scheduled_at is null or p_scheduled_at <= pg_catalog.now() then
    raise exception using errcode = '22023', message = 'Choose a future session time';
  end if;

  select * into v_session
  from public.learning_sessions ls
  where ls.id = p_session_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Learning session was not found';
  end if;

  if v_caller_id not in (v_session.learner_id, v_session.teacher_id) then
    raise exception using errcode = '42501', message = 'Only a session participant can propose a time';
  end if;

  if v_session.status not in ('accepted', 'scheduled') then
    raise exception using errcode = '55000', message = 'Only accepted sessions can be rescheduled';
  end if;

  if v_session.proposed_by is not null then
    raise exception using errcode = '55000', message = 'A time change is already awaiting a response';
  end if;

  update public.learning_sessions
  set proposed_scheduled_at = p_scheduled_at, proposed_by = v_caller_id
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

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

revoke all on function public.cancel_learning_session(uuid) from public, anon, authenticated;
revoke all on function public.propose_learning_session_time(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.respond_to_session_time_change(uuid, boolean) from public, anon, authenticated;

grant execute on function public.cancel_learning_session(uuid) to authenticated;
grant execute on function public.propose_learning_session_time(uuid, timestamptz) to authenticated;
grant execute on function public.respond_to_session_time_change(uuid, boolean) to authenticated;
