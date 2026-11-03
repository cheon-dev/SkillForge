-- Fix: get_project_team_recommendations() did not scope the skill gaps to the
-- project it was given.
--
-- The gaps CTE read every row in project_skills instead of only the requested
-- project's rows, so a room with no required skills still received candidates
-- whenever any other room in the database listed a skill. The recommendation
-- list is now limited to that project's uncovered skills.

create or replace function public.get_project_team_recommendations(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_recommendations jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if not public.is_project_member(p_project_id) then
    raise exception using errcode = '42501',
      message = 'You are not a member of this project';
  end if;

  with level_rank as (
    select * from (values
      ('beginner', 1), ('intermediate', 2), ('advanced', 3), ('expert', 4)
    ) as t(level, rank)
  ),
  members as (
    select pm.student_id
    from public.project_members pm
    where pm.project_id = p_project_id
  ),
  -- A skill is covered when any member can already teach it.
  covered as (
    select distinct ss.skill_id
    from public.student_skills ss
    join members m on m.student_id = ss.student_id
    where ss.is_teachable = true
  ),
  gaps as (
    select ps.skill_id
    from public.project_skills ps
    where ps.project_id = p_project_id
      and not exists (select 1 from covered c where c.skill_id = ps.skill_id)
  ),
  candidates as (
    select
      ss.student_id,
      ss.skill_id,
      ss.proficiency_level,
      s.name as skill_name,
      lr.rank as level_rank
    from public.student_skills ss
    join public.skills s on s.id = ss.skill_id
    join gaps g on g.skill_id = ss.skill_id
    join level_rank lr on lr.level = ss.proficiency_level
    where ss.is_teachable = true
      and ss.student_id <> v_user_id
      and not exists (select 1 from members m where m.student_id = ss.student_id)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'student_id', recommendation.student_id,
        'full_name', recommendation.full_name,
        'course', recommendation.course,
        'year_level', recommendation.year_level,
        'avatar_url', recommendation.avatar_url,
        'score', recommendation.score,
        'covered_count', recommendation.covered_count,
        'covered_skills', recommendation.covered_skills
      )
      order by recommendation.score desc, recommendation.full_name
    ),
    '[]'::jsonb
  )
  into v_recommendations
  from (
    select
      c.student_id,
      coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'SkillForge student') as full_name,
      p.course,
      p.year_level,
      p.avatar_url,
      (count(*) * 30 + sum(c.level_rank) * 5)::int as score,
      count(*)::int as covered_count,
      jsonb_agg(
        jsonb_build_object(
          'skill_id', c.skill_id,
          'name', c.skill_name,
          'proficiency_level', c.proficiency_level
        )
        order by c.skill_name
      ) as covered_skills
    from candidates c
    join public.profiles p on p.id = c.student_id
    group by c.student_id, p.full_name, p.course, p.year_level, p.avatar_url
  ) recommendation;

  return v_recommendations;
end;
$$;

revoke all on function public.get_project_team_recommendations(uuid)
  from public, anon, authenticated;
grant execute on function public.get_project_team_recommendations(uuid) to authenticated;
