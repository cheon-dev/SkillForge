-- Show every achievement in the Skill Passport, earned or not, and report
-- exactly which ones an award call just unlocked.
--
-- 1. get_skill_passport only listed achievements the student had already earned,
--    so a student with no badges saw an empty section and had no idea what the
--    platform offers or what they are working towards. It now returns every
--    achievement with an `earned` flag, earned ones first.
--
-- 2. sync_my_achievements returned a bare integer, which the Passport could not
--    turn into "you just unlocked X". It now returns the names and icons of the
--    achievements it awarded, so the page can confirm them immediately.
--
-- award_achievements keeps the same conditions and stays idempotent; only the
-- return value changed. CREATE OR REPLACE cannot change a return type, so the
-- two integer-returning functions are dropped and recreated. Nothing else
-- depends on them (they are only called from other SECURITY DEFINER functions
-- at runtime, which is not a tracked dependency).

drop function if exists public.award_achievements(uuid);
drop function if exists public.sync_my_achievements();

create or replace function public.award_achievements(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_awarded uuid[] := '{}';
begin
  if p_user_id is null then
    return jsonb_build_object('count', 0, 'achievements', '[]'::jsonb);
  end if;

  insert into public.student_achievements (student_id, achievement_id)
  select p_user_id, a.id
  from public.achievements a
  where a.criteria is not null
    and case a.criteria
      when 'first_skill_shared' then exists (
        select 1 from public.student_skills ss
        where ss.student_id = p_user_id and ss.is_teachable = true
      )
      when 'first_session_completed' then exists (
        select 1 from public.learning_sessions ls
        where ls.learner_id = p_user_id and ls.status = 'completed'
      )
      when 'first_session_taught' then exists (
        select 1 from public.learning_sessions ls
        where ls.teacher_id = p_user_id and ls.status = 'completed'
      )
      when 'practice_streak' then (
        select count(*) >= 3
        from public.activity_attempts aa
        join public.session_activities sa on sa.id = aa.activity_id
        where aa.student_id = p_user_id
          and aa.status = 'reviewed'
          and aa.passed = true
      )
      when 'first_challenge_passed' then exists (
        select 1 from public.challenge_submissions cs
        where cs.student_id = p_user_id and cs.status = 'passed'
      )
      when 'helpful_peer' then exists (
        select 1 from public.challenge_submissions cs
        where cs.reviewer_id = p_user_id and cs.status in ('passed', 'needs_revision')
      )
      else false
    end
  on conflict do nothing
  returning achievement_id into v_awarded;

  if array_length(v_awarded, 1) is not null then
    insert into public.notifications (
      recipient_id, actor_id, notification_type, title, body, entity_id
    )
    select
      p_user_id,
      null,
      'achievement_unlocked',
      'Achievement unlocked',
      'You earned ' || a.name || '.',
      a.id
    from pg_catalog.unnest(v_awarded) awarded(id)
    join public.achievements a on a.id = awarded.id;
  end if;

  return jsonb_build_object(
    'count', coalesce(array_length(v_awarded, 1), 0),
    'achievements', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', a.id, 'name', a.name, 'icon', a.icon)
        order by a.name
      )
      from pg_catalog.unnest(v_awarded) awarded(id)
      join public.achievements a on a.id = awarded.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.sync_my_achievements()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  return public.award_achievements((select auth.uid()));
end;
$$;

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
    -- every achievement the platform defines, not just the earned ones
    'achievements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'name', a.name,
          'description', a.description,
          'icon', a.icon,
          'criteria', a.criteria,
          'earned', sa.student_id is not null,
          'earned_at', sa.earned_at
        )
        order by (sa.student_id is null), a.name
      )
      from public.achievements a
      left join public.student_achievements sa
        on sa.achievement_id = a.id and sa.student_id = v_user_id
    ), '[]'::jsonb)
  )
  into v_passport;

  return v_passport;
end;
$$;

revoke all on function public.award_achievements(uuid)
  from public, anon, authenticated;

revoke all on function public.sync_my_achievements()
  from public, anon, authenticated;
grant execute on function public.sync_my_achievements() to authenticated;

revoke all on function public.get_skill_passport()
  from public, anon, authenticated;
grant execute on function public.get_skill_passport() to authenticated;