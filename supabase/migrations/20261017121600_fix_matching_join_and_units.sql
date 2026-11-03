-- Correct two further defects in get_skill_matches().
--
-- 1. `join wanted w on true` cross-joined every skill I care about with every
--    skill each peer teaches, so a peer teaching an unrelated skill still
--    scored the 40 point base. Matched skills are now restricted to the exact
--    skill I hold or am aiming at, plus genuinely related skills.
--
-- 2. The availability overlap summed extract(epoch from interval), which is in
--    seconds, while the column and the +15/+8 thresholds are expressed in
--    minutes. A one hour overlap therefore reported 3600 and could never reach
--    the 60 minute bonus. It is now divided by 60.
create or replace function public.get_skill_matches()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_matches jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  with
  level_rank as (
    select * from (values
      ('beginner', 1), ('intermediate', 2), ('advanced', 3), ('expert', 4)
    ) as t(level, rank)
  ),
  my_goals as (
    select lg.skill_id, lg.current_level, lg.target_level
    from public.learning_goals lg
    where lg.student_id = v_user_id
      and lg.status = 'active'
  ),
  my_skills as (
    select ss.skill_id, ss.proficiency_level
    from public.student_skills ss
    where ss.student_id = v_user_id
  ),
  -- skills I care about: anything I already hold or am actively working towards
  wanted as (
    select skill_id, 'goal'::text as interest, current_level as my_level
    from my_goals
    union all
    select ms.skill_id, 'holding', ms.proficiency_level as my_level
    from my_skills ms
    where not exists (select 1 from my_goals g where g.skill_id = ms.skill_id)
  ),
  -- every skill each peer is willing to teach
  theirs as (
    select ss.student_id, ss.skill_id, ss.proficiency_level, s.name as skill_name, s.category
    from public.student_skills ss
    join public.skills s on s.id = ss.skill_id
    where ss.is_teachable = true
      and ss.student_id <> v_user_id
  ),
  skill_matches as (
    select
      t.student_id,
      t.skill_id,
      t.skill_name,
      t.category,
      t.proficiency_level as their_level,
      w.interest,
      w.my_level,
      case
        when r.relationship_type is not null then r.relationship_type
        else 'direct'
      end as relation,
      (
        40
        + case when w.interest = 'goal' then 20 else 0 end
        + case when r.relationship_type is not null then 15 else 0 end
        + case
            when lr.rank is not null and tr.rank is not null and tr.rank > lr.rank then 15
            else 0
          end
      )::int as skill_score
    from theirs t
    join wanted w
      on t.skill_id = w.skill_id
      or exists (
        select 1
        from public.skill_relationships rel
        where (rel.skill_id = w.skill_id and rel.related_skill_id = t.skill_id)
           or (rel.skill_id = t.skill_id and rel.related_skill_id = w.skill_id)
      )
    left join public.skill_relationships r
      on (r.skill_id = w.skill_id and r.related_skill_id = t.skill_id)
      or (r.skill_id = t.skill_id and r.related_skill_id = w.skill_id)
    left join level_rank lr on lr.level = w.my_level
    left join level_rank tr on tr.level = t.proficiency_level
  ),
  peer_availability as (
    select
      theirs.student_id,
      coalesce(sum(
        extract(epoch from (
          case
            when least(mine.end_time, theirs_slot.end_time)
                 > greatest(mine.start_time, theirs_slot.start_time)
            then least(mine.end_time, theirs_slot.end_time)
                 - greatest(mine.start_time, theirs_slot.start_time)
            else interval '0'
          end
        )) / 60
      ), 0)::int as overlap_minutes
    from (select distinct student_id from theirs) theirs
    join public.availability theirs_slot
      on theirs_slot.student_id = theirs.student_id
    join public.availability mine
      on mine.student_id = v_user_id
      and mine.day_of_week = theirs_slot.day_of_week
    group by theirs.student_id
  ),
  peer_evidence as (
    select
      ls.teacher_id as student_id,
      count(*) filter (where ls.status = 'completed')::int as sessions_taught
    from public.learning_sessions ls
    where ls.teacher_id <> v_user_id
      and (ls.learner_id = v_user_id or ls.teacher_id = v_user_id)
    group by ls.teacher_id
  ),
  peer_activity as (
    select
      case when ls.learner_id = v_user_id then ls.teacher_id else ls.learner_id end as peer_id,
      count(*)::int as previous_sessions
    from public.learning_sessions ls
    where ls.learner_id = v_user_id or ls.teacher_id = v_user_id
    group by case when ls.learner_id = v_user_id then ls.teacher_id else ls.learner_id end
  ),
  peer_verified as (
    select
      ls.teacher_id as student_id,
      count(*)::int as verified_activities
    from public.activity_attempts aa
    join public.session_activities sa on sa.id = aa.activity_id
    join public.session_missions sm on sm.id = sa.mission_id
    join public.learning_sessions ls on ls.id = sm.session_id
    where aa.status = 'reviewed'
      and aa.passed = true
      and ls.teacher_id <> v_user_id
    group by ls.teacher_id
  )
  select coalesce(jsonb_agg(to_jsonb(row) order by row.score desc, row.full_name), '[]'::jsonb)
  into v_matches
  from (
    select
      p.id as student_id,
      coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'SkillForge student') as full_name,
      p.course,
      p.year_level,
      p.bio,
      p.avatar_url,
      (
        coalesce(sum(sm.skill_score), 0)
        + case when coalesce(av.overlap_minutes, 0) >= 60 then 15
               when coalesce(av.overlap_minutes, 0) >= 30 then 8
               else 0
          end
        + case when coalesce(ev.sessions_taught, 0) > 0 then 5 else 0 end
      )::int as score,
      coalesce(av.overlap_minutes, 0)::int as availability_overlap_minutes,
      coalesce(pa.previous_sessions, 0)::int as previous_sessions,
      coalesce(ev.sessions_taught, 0)::int as sessions_taught,
      coalesce(pv.verified_activities, 0)::int as verified_activities,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'skill_id', sm.skill_id,
            'name', sm.skill_name,
            'category', sm.category,
            'their_level', sm.their_level,
            'my_level', sm.my_level,
            'interest', sm.interest,
            'relation', sm.relation
          )
          order by sm.skill_score desc, sm.skill_name
        ) filter (where sm.skill_id is not null),
        '[]'::jsonb
      ) as matched_skills
    from public.profiles p
    join skill_matches sm on sm.student_id = p.id
    left join peer_availability av on av.student_id = p.id
    left join peer_activity pa on pa.peer_id = p.id
    left join peer_evidence ev on ev.student_id = p.id
    left join peer_verified pv on pv.student_id = p.id
    group by p.id, p.full_name, p.course, p.year_level, p.bio, p.avatar_url,
             av.overlap_minutes, pa.previous_sessions, ev.sessions_taught, pv.verified_activities
  ) row;

  return v_matches;
end;
$$;

