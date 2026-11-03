-- Skill Passport: fix totals that were derived only from skills listed in the
-- learner's profile.
--
-- The previous version computed `totals` by aggregating over `profile_skills`,
-- which is the join of student_skills to skills. Any verified evidence for a
-- skill the learner had not added to their profile was therefore silently
-- dropped: someone could have completed sessions and passed challenges while
-- every total still read 0.
--
-- Totals are now derived directly from the recorded rows, independent of which
-- skills appear on the profile. The per-skill list still comes from
-- student_skills, because that is what the learner has declared they hold.

create or replace function public.get_skill_passport()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_passport jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  with
  session_stats as (
    select
      ls.skill_id,
      count(*) filter (where ls.learner_id = v_user_id and ls.status = 'completed')::int
        as completed_sessions,
      count(*) filter (where ls.teacher_id = v_user_id and ls.status = 'completed')::int
        as sessions_taught
    from public.learning_sessions ls
    where ls.learner_id = v_user_id or ls.teacher_id = v_user_id
    group by ls.skill_id
  ),
  activity_stats as (
    select
      ls.skill_id,
      count(*)::int as verified_activities,
      coalesce(sum(aa.xp_earned), 0)::int as xp_earned
    from public.activity_attempts aa
    join public.session_activities sa on sa.id = aa.activity_id
    join public.session_missions sm on sm.id = sa.mission_id
    join public.learning_sessions ls on ls.id = sm.session_id
    where aa.student_id = v_user_id
      and aa.status = 'reviewed'
      and aa.passed = true
    group by ls.skill_id
  ),
  challenge_stats as (
    select
      sc.skill_id,
      count(distinct cs.challenge_id)::int as challenges_passed
    from public.challenge_submissions cs
    join public.skill_challenges sc on sc.id = cs.challenge_id
    where cs.student_id = v_user_id
      and cs.status = 'passed'
    group by sc.skill_id
  ),
  challenge_xp as (
    select
      sc.skill_id,
      coalesce(sum(r.xp_awarded), 0)::int as challenge_xp
    from public.challenge_xp_rewards r
    join public.skill_challenges sc on sc.id = r.challenge_id
    where r.student_id = v_user_id
    group by sc.skill_id
  ),
  endorsement_stats as (
    select
      e.skill_id,
      count(*)::int as endorsements_received
    from public.endorsements e
    where e.student_id = v_user_id
    group by e.skill_id
  ),
  profile_skills as (
    select
      ss.skill_id,
      s.name,
      s.category,
      ss.proficiency_level,
      ss.years_experience,
      ss.is_teachable,
      coalesce(sess.completed_sessions, 0) as completed_sessions,
      coalesce(sess.sessions_taught, 0) as sessions_taught,
      coalesce(act.verified_activities, 0) as verified_activities,
      coalesce(act.xp_earned, 0) as session_xp,
      coalesce(chal.challenges_passed, 0) as challenges_passed,
      coalesce(chalx.challenge_xp, 0) as challenge_xp,
      coalesce(endt.endorsements_received, 0) as endorsements_received
    from public.student_skills ss
    join public.skills s on s.id = ss.skill_id
    left join session_stats sess on sess.skill_id = ss.skill_id
    left join activity_stats act on act.skill_id = ss.skill_id
    left join challenge_stats chal on chal.skill_id = ss.skill_id
    left join challenge_xp chalx on chalx.skill_id = ss.skill_id
    left join endorsement_stats endt on endt.skill_id = ss.skill_id
    where ss.student_id = v_user_id
  ),
  totals as (
    select
      (select count(*)::int from public.student_skills ss
        where ss.student_id = v_user_id) as skills,
      (select count(*)::int from public.learning_sessions ls
        where ls.learner_id = v_user_id and ls.status = 'completed') as completed_sessions,
      (select count(*)::int from public.learning_sessions ls
        where ls.teacher_id = v_user_id and ls.status = 'completed') as sessions_taught,
      (select count(*)::int
        from public.activity_attempts aa
        join public.session_activities sa on sa.id = aa.activity_id
        where aa.student_id = v_user_id
          and aa.status = 'reviewed'
          and aa.passed = true) as verified_activities,
      (select count(distinct cs.challenge_id)::int
        from public.challenge_submissions cs
        where cs.student_id = v_user_id and cs.status = 'passed') as challenges_passed,
      (select count(*)::int from public.endorsements e
        where e.student_id = v_user_id) as endorsements_received
  )
  select jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'full_name', p.full_name,
        'course', p.course,
        'year_level', p.year_level,
        'bio', p.bio,
        'avatar_url', p.avatar_url
      )
      from public.profiles p
      where p.id = v_user_id
    ),
    'xp', jsonb_build_object(
      'total_xp', coalesce(
        (select sx.total_xp from public.student_xp sx where sx.student_id = v_user_id), 0),
      'level', coalesce(
        (select sx.level from public.student_xp sx where sx.student_id = v_user_id), 1)
    ),
    'totals', (
      select jsonb_build_object(
        'skills', t.skills,
        'completed_sessions', t.completed_sessions,
        'sessions_taught', t.sessions_taught,
        'verified_activities', t.verified_activities,
        'challenges_passed', t.challenges_passed,
        'endorsements_received', t.endorsements_received
      )
      from totals t
    ),
    'skills', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'skill_id', ps.skill_id,
          'name', ps.name,
          'category', ps.category,
          'proficiency_level', ps.proficiency_level,
          'years_experience', ps.years_experience,
          'is_teachable', ps.is_teachable,
          'completed_sessions', ps.completed_sessions,
          'sessions_taught', ps.sessions_taught,
          'verified_activities', ps.verified_activities,
          'challenges_passed', ps.challenges_passed,
          'endorsements_received', ps.endorsements_received,
          'xp_earned', ps.session_xp + ps.challenge_xp
        )
        order by ps.name
      )
      from profile_skills ps
    ), '[]'::jsonb),
    'endorsements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'skill_name', s.name,
          'comment', e.comment,
          'created_at', e.created_at,
          'endorsed_by_name', p.full_name
        )
        order by e.created_at desc
      )
      from public.endorsements e
      join public.skills s on s.id = e.skill_id
      left join public.profiles p on p.id = e.endorsed_by
      where e.student_id = v_user_id
    ), '[]'::jsonb),
    'achievements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'name', a.name,
          'description', a.description,
          'icon', a.icon,
          'earned_at', sa.earned_at
        )
        order by sa.earned_at desc
      )
      from public.student_achievements sa
      join public.achievements a on a.id = sa.achievement_id
      where sa.student_id = v_user_id
    ), '[]'::jsonb)
  )
  into v_passport;

  return v_passport;
end;
$$;

revoke all on function public.get_skill_passport()
  from public, anon, authenticated;
grant execute on function public.get_skill_passport() to authenticated;