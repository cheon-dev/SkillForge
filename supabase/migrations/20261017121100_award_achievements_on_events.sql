-- Award achievements at the moment the qualifying event is recorded.
--
-- award_achievements() is idempotent, so calling it here is safe and means a
-- badge appears the moment a session is completed or a challenge is reviewed,
-- rather than waiting for the student to open their passport.

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

  perform public.award_achievements(v_session.learner_id);
  perform public.award_achievements(v_session.teacher_id);

  return v_session;
end;
$$;

create or replace function public.review_challenge_submission(
  p_submission_id uuid,
  p_passed boolean,
  p_feedback text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_submission public.challenge_submissions;
  v_challenge public.skill_challenges;
  v_feedback text := nullif(pg_catalog.btrim(coalesce(p_feedback, '')), '');
  v_awarded_xp integer := 0;
  v_total_xp integer;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if p_passed is null then
    raise exception using errcode = '22023', message = 'A pass or revision result is required';
  end if;

  select * into v_submission
  from public.challenge_submissions cs
  where cs.id = p_submission_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Challenge submission was not found';
  end if;

  select * into v_challenge
  from public.skill_challenges sc
  where sc.id = v_submission.challenge_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Skill challenge was not found';
  end if;

  if v_caller_id = v_submission.student_id then
    raise exception using errcode = '42501',
      message = 'You cannot review your own challenge submission';
  end if;

  if not (
    public.is_moderator()
    or (v_challenge.created_by is not null and v_challenge.created_by = v_caller_id)
  ) then
    raise exception using errcode = '42501',
      message = 'Only the challenge author or a moderator can review this submission';
  end if;

  if v_submission.status <> 'submitted' then
    raise exception using errcode = '55000',
      message = 'Only a submitted challenge can be reviewed';
  end if;

  if p_passed and not exists (
    select 1
    from public.challenge_xp_rewards r
    where r.student_id = v_submission.student_id
      and r.challenge_id = v_submission.challenge_id
  ) then
    v_awarded_xp := v_challenge.xp_reward;

    insert into public.challenge_xp_rewards (
      submission_id, student_id, challenge_id, awarded_by, xp_awarded
    ) values (
      p_submission_id, v_submission.student_id, v_submission.challenge_id,
      v_caller_id, v_awarded_xp
    );

    insert into public.student_xp as sx (student_id, total_xp, level)
    values (v_submission.student_id, v_awarded_xp, greatest(1, (v_awarded_xp / 100) + 1))
    on conflict on constraint student_xp_pkey do update
    set total_xp = sx.total_xp + excluded.total_xp,
        level = greatest(1, ((sx.total_xp + excluded.total_xp) / 100) + 1),
        updated_at = pg_catalog.now();
  end if;

  update public.challenge_submissions cs
  set status = case when p_passed then 'passed' else 'needs_revision' end,
      reviewer_id = v_caller_id,
      reviewer_feedback = v_feedback,
      reviewed_at = pg_catalog.now()
  where cs.id = p_submission_id
  returning * into v_submission;

  select coalesce((select sx.total_xp from public.student_xp sx
    where sx.student_id = v_submission.student_id), 0)
  into v_total_xp;

  perform public.award_achievements(v_submission.student_id);
  perform public.award_achievements(v_caller_id);

  return jsonb_build_object(
    'submission_id', v_submission.id,
    'challenge_id', v_submission.challenge_id,
    'status', v_submission.status,
    'xp_awarded', v_awarded_xp,
    'total_xp', v_total_xp
  );
end;
$$;

revoke all on function public.complete_learning_session(uuid)
  from public, anon, authenticated;
grant execute on function public.complete_learning_session(uuid) to authenticated;

revoke all on function public.review_challenge_submission(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.review_challenge_submission(uuid, boolean, text)
  to authenticated;