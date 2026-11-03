-- Teacher-authored session plans and database-validated mission workflow.

drop policy if exists activity_attempts_insert_own on public.activity_attempts;

create policy activity_attempts_insert_own
on public.activity_attempts for insert to authenticated
with check (
  student_id = auth.uid()
  and status = 'submitted'
  and xp_earned = 0
  and score is null
  and passed is null
  and teacher_feedback is null
  and reviewed_by is null
  and reviewed_at is null
  and exists (
    select 1
    from public.session_activities sa
    join public.session_missions sm on sm.id = sa.mission_id
    join public.learning_sessions ls on ls.id = sm.session_id
    where sa.id = activity_attempts.activity_id
      and ls.learner_id = auth.uid()
      and ls.status in ('accepted', 'scheduled')
      and sm.status = 'in_progress'
  )
);

create or replace function public.create_session_learning_plan(
  p_session_id uuid,
  p_title text,
  p_description text,
  p_learning_goal text,
  p_activities jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_mission_id uuid;
  v_total_xp integer;
  v_activity_count integer;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if pg_catalog.btrim(coalesce(p_title, '')) = '' then
    raise exception using errcode = '22023', message = 'A mission title is required';
  end if;

  if pg_catalog.jsonb_typeof(p_activities) <> 'array' then
    raise exception using errcode = '22023', message = 'Activities must be provided as a list';
  end if;

  select pg_catalog.count(*)::integer,
         coalesce(sum((item ->> 'max_xp')::integer), 0)::integer
  into v_activity_count, v_total_xp
  from pg_catalog.jsonb_array_elements(p_activities) as items(item);

  if v_activity_count < 1 then
    raise exception using errcode = '22023', message = 'A session plan must contain at least one activity';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_activities) as items(item)
    where pg_catalog.btrim(coalesce(item ->> 'title', '')) = ''
      or coalesce(item ->> 'activity_type', '') not in ('quiz', 'problem_solving', 'practice', 'final_challenge')
      or coalesce((item ->> 'max_xp')::integer, -1) < 0
  ) then
    raise exception using errcode = '22023', message = 'Each activity needs a title, valid type, and non-negative XP value';
  end if;

  perform 1
  from public.learning_sessions ls
  where ls.id = p_session_id
    and ls.teacher_id = v_caller_id
    and ls.status in ('accepted', 'scheduled')
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Only the assigned teacher can plan an accepted session';
  end if;

  insert into public.session_missions (
    session_id, title, description, learning_goal, total_xp, status
  ) values (
    p_session_id, pg_catalog.btrim(p_title), nullif(pg_catalog.btrim(p_description), ''),
    nullif(pg_catalog.btrim(p_learning_goal), ''), v_total_xp, 'not_started'
  ) returning id into v_mission_id;

  insert into public.session_activities (
    mission_id, sequence_number, title, activity_type, instructions,
    content, max_xp, requires_teacher_review
  )
  select
    v_mission_id,
    items.ordinality::integer,
    pg_catalog.btrim(items.item ->> 'title'),
    items.item ->> 'activity_type',
    nullif(pg_catalog.btrim(items.item ->> 'instructions'), ''),
    '{}'::jsonb,
    (items.item ->> 'max_xp')::integer,
    true
  from pg_catalog.jsonb_array_elements(p_activities) with ordinality as items(item, ordinality);

  return v_mission_id;
end;
$$;

create or replace function public.start_session_mission(p_mission_id uuid)
returns public.session_missions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_mission public.session_missions;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select sm.* into v_mission
  from public.session_missions sm
  join public.learning_sessions ls on ls.id = sm.session_id
  where sm.id = p_mission_id
    and v_caller_id in (ls.learner_id, ls.teacher_id)
    and ls.status in ('accepted', 'scheduled')
  for update of sm;

  if not found then
    raise exception using errcode = '42501', message = 'An accepted session participant is required';
  end if;

  if v_mission.status = 'not_started' then
    update public.session_missions
    set status = 'in_progress', started_at = pg_catalog.now()
    where id = p_mission_id
    returning * into v_mission;
  elsif v_mission.status <> 'in_progress' then
    raise exception using errcode = '55000', message = 'This mission is no longer active';
  end if;

  return v_mission;
end;
$$;

create or replace function public.complete_session_mission(p_mission_id uuid)
returns public.session_missions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_mission public.session_missions;
  v_teacher_id uuid;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select sm.* into v_mission
  from public.session_missions sm
  join public.learning_sessions ls on ls.id = sm.session_id
  where sm.id = p_mission_id
    and v_caller_id in (ls.learner_id, ls.teacher_id)
  for update of sm;

  if not found then
    raise exception using errcode = '42501', message = 'A session participant is required';
  end if;

  select ls.teacher_id into v_teacher_id
  from public.learning_sessions ls
  where ls.id = v_mission.session_id;

  if v_caller_id is distinct from v_teacher_id then
    raise exception using errcode = '42501', message = 'Only the assigned teacher can complete this mission';
  end if;

  if v_mission.status <> 'in_progress' then
    raise exception using errcode = '55000', message = 'The mission must be in progress';
  end if;

  if not exists (
    select 1 from public.session_activities sa where sa.mission_id = p_mission_id
  ) or exists (
    select 1
    from public.session_activities sa
    where sa.mission_id = p_mission_id
      and not exists (
        select 1 from public.activity_attempts aa
        where aa.activity_id = sa.id
          and aa.status = 'reviewed'
          and aa.passed = true
      )
  ) then
    raise exception using errcode = '55000', message = 'Every activity needs a passed teacher review before mission completion';
  end if;

  update public.session_missions
  set status = 'completed', completed_at = pg_catalog.now()
  where id = p_mission_id
  returning * into v_mission;

  return v_mission;
end;
$$;

revoke all on function public.create_session_learning_plan(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.start_session_mission(uuid) from public, anon, authenticated;
revoke all on function public.complete_session_mission(uuid) from public, anon, authenticated;
grant execute on function public.create_session_learning_plan(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.start_session_mission(uuid) to authenticated;
grant execute on function public.complete_session_mission(uuid) to authenticated;
