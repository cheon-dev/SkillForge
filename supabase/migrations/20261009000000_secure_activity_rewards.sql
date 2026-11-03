-- SkillForge secure activity review and XP rewards.
-- Reviews and rewards must go through review_activity_attempt().

create table public.activity_xp_rewards (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null
    references public.activity_attempts(id) on delete cascade,
  student_id uuid not null
    references public.profiles(id) on delete cascade,
  awarded_by uuid not null
    references public.profiles(id) on delete restrict,
  xp_awarded integer not null check (xp_awarded >= 0),
  created_at timestamptz not null default now(),
  unique (attempt_id)
);

create index idx_activity_xp_rewards_student_created
  on public.activity_xp_rewards(student_id, created_at);

alter table public.activity_xp_rewards enable row level security;

create policy activity_xp_rewards_select_own
on public.activity_xp_rewards for select to authenticated
using (student_id = auth.uid());

-- Keep direct client writes unavailable even if a broad table grant exists.
revoke all on table public.activity_xp_rewards from anon, authenticated;
grant select on table public.activity_xp_rewards to authenticated;

revoke update, delete, truncate on public.activity_attempts from anon, authenticated;
revoke all on table public.student_xp, public.credit_transactions from anon, authenticated;
grant select on table public.student_xp, public.credit_transactions to authenticated;

-- Existing data is preserved while all new writes receive the upper bound.
alter table public.activity_attempts
  add constraint activity_attempts_score_between_zero_and_hundred
  check (score is null or score between 0 and 100)
  not valid;

-- Teacher review is now performed only by the secure RPC below.
drop policy if exists activity_attempts_update_teacher on public.activity_attempts;

create or replace function public.review_activity_attempt(
  p_attempt_id uuid,
  p_score numeric,
  p_passed boolean,
  p_teacher_feedback text default null
)
returns table (
  attempt_id uuid,
  student_id uuid,
  xp_awarded integer,
  total_xp integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_activity_id uuid;
  v_attempt_student_id uuid;
  v_attempt_status text;
  v_attempt_score numeric;
  v_attempt_passed boolean;
  v_attempt_xp integer;
  v_attempt_feedback text;
  v_attempt_reviewed_by uuid;
  v_attempt_reviewed_at timestamptz;
  v_mission_id uuid;
  v_session_id uuid;
  v_session_learner_id uuid;
  v_session_teacher_id uuid;
  v_session_status text;
  v_mission_status text;
  v_mission_total_xp integer;
  v_activity_max_xp integer;
  v_requires_teacher_review boolean;
  v_mission_awarded_xp bigint := 0;
  v_requested_xp integer := 0;
  v_awarded_xp integer := 0;
  v_total_xp integer := 0;
begin
  if v_caller_id is null then
    raise exception using
      errcode = '42501',
      message = 'An authenticated teacher is required to review an activity attempt';
  end if;

  select
    aa.activity_id,
    aa.student_id,
    aa.status,
    aa.score,
    aa.passed,
    aa.xp_earned,
    aa.teacher_feedback,
    aa.reviewed_by,
    aa.reviewed_at
  into
    v_activity_id,
    v_attempt_student_id,
    v_attempt_status,
    v_attempt_score,
    v_attempt_passed,
    v_attempt_xp,
    v_attempt_feedback,
    v_attempt_reviewed_by,
    v_attempt_reviewed_at
  from public.activity_attempts aa
  where aa.id = p_attempt_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Activity attempt was not found';
  end if;

  select
    sa.mission_id,
    sa.max_xp,
    sa.requires_teacher_review,
    sm.session_id,
    sm.status,
    sm.total_xp,
    ls.learner_id,
    ls.teacher_id,
    ls.status
  into
    v_mission_id,
    v_activity_max_xp,
    v_requires_teacher_review,
    v_session_id,
    v_mission_status,
    v_mission_total_xp,
    v_session_learner_id,
    v_session_teacher_id,
    v_session_status
  from public.session_activities sa
  join public.session_missions sm on sm.id = sa.mission_id
  join public.learning_sessions ls on ls.id = sm.session_id
  where sa.id = v_activity_id
  for update of sa, sm, ls;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Activity attempt does not belong to a valid learning session';
  end if;

  if v_session_teacher_id is distinct from v_caller_id then
    raise exception using
      errcode = '42501',
      message = 'Only the assigned session teacher can review this activity attempt';
  end if;

  if v_attempt_student_id is distinct from v_session_learner_id then
    raise exception using
      errcode = '42501',
      message = 'Activity attempt student does not match the learning session learner';
  end if;

  if v_session_status not in ('accepted', 'scheduled') then
    raise exception using
      errcode = '22023',
      message = 'The learning session is not eligible for activity review';
  end if;

  if v_mission_status <> 'in_progress' then
    raise exception using
      errcode = '22023',
      message = 'The learning mission is not in progress';
  end if;

  if v_requires_teacher_review is not true then
    raise exception using
      errcode = '22023',
      message = 'This activity does not require teacher review';
  end if;

  if v_attempt_status <> 'submitted'
    or v_attempt_score is not null
    or v_attempt_passed is not null
    or v_attempt_xp <> 0
    or v_attempt_feedback is not null
    or v_attempt_reviewed_by is not null
    or v_attempt_reviewed_at is not null then
    raise exception using
      errcode = '55000',
      message = 'Only an unreviewed submitted attempt can be reviewed';
  end if;

  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception using
      errcode = '22023',
      message = 'Activity score must be between 0 and 100';
  end if;

  if p_passed is null then
    raise exception using
      errcode = '22023',
      message = 'Activity pass status is required';
  end if;

  if p_passed then
    v_requested_xp := v_activity_max_xp;

    select coalesce(sum(axr.xp_awarded), 0)
    into v_mission_awarded_xp
    from public.activity_xp_rewards axr
    join public.activity_attempts prior_attempt
      on prior_attempt.id = axr.attempt_id
    join public.session_activities prior_activity
      on prior_activity.id = prior_attempt.activity_id
    where prior_activity.mission_id = v_mission_id;

    -- A mission cannot award more than its trusted total_xp budget.
    v_awarded_xp := least(
      v_requested_xp,
      greatest(v_mission_total_xp::bigint - v_mission_awarded_xp, 0::bigint)
    )::integer;
  end if;

  update public.activity_attempts
  set score = p_score,
      passed = p_passed,
      xp_earned = v_awarded_xp,
      status = 'reviewed',
      teacher_feedback = p_teacher_feedback,
      reviewed_by = v_caller_id,
      reviewed_at = pg_catalog.now()
  where id = p_attempt_id;

  if p_passed then
    insert into public.activity_xp_rewards (
      attempt_id,
      student_id,
      awarded_by,
      xp_awarded
    )
    values (
      p_attempt_id,
      v_attempt_student_id,
      v_caller_id,
      v_awarded_xp
    );

    insert into public.student_xp (student_id, total_xp, level)
    values (
      v_attempt_student_id,
      v_awarded_xp,
      greatest(1, (v_awarded_xp / 100) + 1)
    )
    on conflict (student_id) do update
    set total_xp = public.student_xp.total_xp + excluded.total_xp,
        level = greatest(
          1,
          ((public.student_xp.total_xp + excluded.total_xp) / 100) + 1
        ),
        updated_at = pg_catalog.now()
    returning total_xp into v_total_xp;
  else
    select coalesce(
      (
        select sx.total_xp
        from public.student_xp sx
        where sx.student_id = v_attempt_student_id
      ),
      0
    )
    into v_total_xp;
  end if;

  return query
  select p_attempt_id, v_attempt_student_id, v_awarded_xp, v_total_xp;
end;
$$;

revoke all on function public.review_activity_attempt(uuid, numeric, boolean, text)
from public, anon, authenticated;
grant execute on function public.review_activity_attempt(uuid, numeric, boolean, text)
to authenticated;
