-- Admin and moderator read access for the platform dashboard.
--
-- features.md section 13 requires administrators and moderators to manage
-- students, skill categories, challenges, badges and achievements, moderate
-- content, and view platform statistics, under role-based authorization.
--
-- Phase 1 already added the write policies and set_user_role(). What is missing
-- is read access: learning_sessions, activity_attempts and challenge_submissions
-- are deliberately restricted to their participants, so a dashboard cannot
-- aggregate them with ordinary queries. These two SECURITY DEFINER functions
-- provide exactly the aggregates the dashboard needs and nothing else, and both
-- refuse non-moderators.
--
-- Email addresses come from auth.users, which no authenticated role can read, so
-- they are resolved inside the function rather than exposed by a policy.

create or replace function public.get_admin_statistics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    raise exception using errcode = '42501',
      message = 'Only moderators can view platform statistics';
  end if;

  return jsonb_build_object(
    'students', jsonb_build_object(
      'total', (select count(*)::int from public.profiles),
      'admins', (select count(*)::int from public.profiles where role = 'admin'),
      'moderators', (select count(*)::int from public.profiles where role = 'moderator'),
      'teaching', (select count(distinct ss.student_id)::int
        from public.student_skills ss where ss.is_teachable = true)
    ),
    'catalog', jsonb_build_object(
      'skills', (select count(*)::int from public.skills),
      'skill_categories', (select count(distinct s.category)::int from public.skills s),
      'skill_relationships', (select count(*)::int from public.skill_relationships),
      'challenges', (select count(*)::int from public.skill_challenges),
      'achievements_defined', (select count(*)::int from public.achievements),
      'achievements_awarded', (select count(*)::int from public.student_achievements)
    ),
    'sessions', jsonb_build_object(
      'total', (select count(*)::int from public.learning_sessions),
      'completed', (select count(*)::int from public.learning_sessions where status = 'completed'),
      'open', (select count(*)::int
        from public.learning_sessions where status in ('requested', 'accepted', 'scheduled')),
      'cancelled', (select count(*)::int from public.learning_sessions where status = 'cancelled'),
      'missions', (select count(*)::int from public.session_missions),
      'activities', (select count(*)::int from public.session_activities)
    ),
    'challenges', jsonb_build_object(
      'submissions', (select count(*)::int from public.challenge_submissions),
      'passed', (select count(*)::int from public.challenge_submissions where status = 'passed'),
      'awaiting_review', (select count(*)::int from public.challenge_submissions where status = 'submitted')
    ),
    'recognition', jsonb_build_object(
      'endorsements', (select count(*)::int from public.endorsements),
      'total_xp_awarded', (select coalesce(sum(sx.total_xp), 0)::int from public.student_xp sx),
      'active_learners', (select count(*)::int from public.student_xp where total_xp > 0)
    )
  );
end;
$$;

create or replace function public.admin_list_students(p_query text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  if not public.is_moderator() then
    raise exception using errcode = '42501',
      message = 'Only moderators can list students';
  end if;

  select coalesce(jsonb_agg(to_jsonb(row) order by row.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select
      p.id as student_id,
      coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'Unnamed student') as full_name,
      u.email as email,
      p.course,
      p.year_level,
      p.role,
      p.created_at,
      (select count(*)::int from public.student_skills ss where ss.student_id = p.id) as skills_count,
      (select count(*)::int from public.student_skills ss
        where ss.student_id = p.id and ss.is_teachable = true) as teachable_count,
      (select count(*)::int from public.learning_sessions ls
        where ls.learner_id = p.id and ls.status = 'completed') as sessions_completed,
      (select count(*)::int from public.learning_sessions ls
        where ls.teacher_id = p.id and ls.status = 'completed') as sessions_taught,
      (select count(distinct cs.challenge_id)::int from public.challenge_submissions cs
        where cs.student_id = p.id and cs.status = 'passed') as challenges_passed,
      (select count(*)::int from public.endorsements e where e.student_id = p.id) as endorsements_received,
      (select count(*)::int from public.student_achievements sa where sa.student_id = p.id) as achievements_earned,
      -- coalesce must sit outside the subquery: an aggregate-free scalar
      -- subquery returns NULL (not a row) when the student has no XP row yet.
      coalesce((select sx.total_xp from public.student_xp sx where sx.student_id = p.id), 0)::int as total_xp
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p_query is null
       or pg_catalog.btrim(p_query) = ''
       or coalesce(p.full_name, '') ilike '%' || pg_catalog.btrim(p_query) || '%'
       or coalesce(u.email, '') ilike '%' || pg_catalog.btrim(p_query) || '%'
       or coalesce(p.course, '') ilike '%' || pg_catalog.btrim(p_query) || '%'
  ) row;

  return v_rows;
end;
$$;

revoke all on function public.get_admin_statistics()
  from public, anon, authenticated;
grant execute on function public.get_admin_statistics() to authenticated;

revoke all on function public.admin_list_students(text)
  from public, anon, authenticated;
grant execute on function public.admin_list_students(text) to authenticated;

-- Correct total_xp in admin_list_students: coalesce was applied inside a
-- scalar subquery, which yields NULL rather than 0 when the student has no
-- student_xp row, so the dashboard rendered a blank XP value for new students.