-- Correct total_xp in admin_list_students.
--
-- coalesce() was applied *inside* a scalar subquery:
--   (select coalesce(sx.total_xp, 0)::int from student_xp sx where ...)
-- An aggregate-free scalar subquery that matches no row returns NULL rather
-- than running coalesce, so every student without a student_xp row rendered a
-- blank XP value instead of 0.
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

