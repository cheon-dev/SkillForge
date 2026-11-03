-- Keep session requests tied to a real teachable skill and enforce
-- teacher-only decisions in the database.

drop policy if exists learning_sessions_insert_as_learner on public.learning_sessions;
drop policy if exists learning_sessions_update_participant on public.learning_sessions;
drop policy if exists learning_sessions_delete_participant on public.learning_sessions;

create policy learning_sessions_insert_valid_request
on public.learning_sessions for insert to authenticated
with check (
  learner_id = auth.uid()
  and learner_id <> teacher_id
  and status = 'requested'
  and scheduled_at > pg_catalog.now()
  and exists (
    select 1
    from public.student_skills ss
    where ss.student_id = teacher_id
      and ss.skill_id = learning_sessions.skill_id
      and ss.is_teachable = true
  )
);

create or replace function public.respond_to_learning_request(
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
    raise exception using errcode = 'P0002', message = 'Learning request was not found';
  end if;

  if v_session.teacher_id is distinct from v_caller_id then
    raise exception using errcode = '42501', message = 'Only the assigned teacher can respond';
  end if;

  if v_session.status <> 'requested' then
    raise exception using errcode = '55000', message = 'This request has already been answered';
  end if;

  update public.learning_sessions
  set status = case when p_accept then 'accepted' else 'declined' end
  where id = p_session_id
  returning * into v_session;

  return v_session;
end;
$$;

revoke all on function public.respond_to_learning_request(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.respond_to_learning_request(uuid, boolean)
to authenticated;
