-- Rule-based skill matching (features.md section 3).
--
-- Discover currently lists every student who teaches a skill, sorted by name.
-- features.md 3.4 lists seven signals and requires that compatible peers are
-- recommended. This adds get_skill_matches(), which scores every other student
-- from recorded data and explains each score.
--
-- Rule-based by design: features.md 3.3 states "Core matching can use
-- rule-based logic. AI is not required."
--
-- Signals used, all of them previously unused tables:
--   * teaching preference      student_skills.is_teachable
--   * learning goals           learning_goals (status = active)
--   * shared / related skills  skill_relationships (related, prerequisite, extension)
--   * proficiency levels       beginner < intermediate < advanced < expert
--   * availability             availability day/time overlap, computed here only
--   * previous activity        learning_sessions already shared with the peer
--   * passport evidence        completed sessions taught and verified activities
--
-- availability is read inside this SECURITY DEFINER function rather than being
-- exposed by a policy, because the existing availability_select_own policy
-- restricts peers' schedules to their owner. The caller receives a score and a
-- human-readable reason, never another student's raw timetable.

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
    join wanted w on true
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
        ))
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

-- Atomic replacement of the caller's own weekly availability. Done server-side
-- so a partially applied schedule is not possible.
create or replace function public.set_my_availability(p_slots jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
  v_inserted integer := 0;
  v_slot jsonb;
  v_day smallint;
  v_start time;
  v_end time;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if pg_catalog.jsonb_typeof(p_slots) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Availability must be provided as a list';
  end if;

  for v_slot in select * from pg_catalog.jsonb_array_elements(p_slots)
  loop
    v_day := (v_slot ->> 'day_of_week')::smallint;
    v_start := (v_slot ->> 'start_time')::time;
    v_end := (v_slot ->> 'end_time')::time;

    if v_day is null or v_day < 1 or v_day > 7 then
      raise exception using errcode = '22023', message = 'Day must be between 1 (Monday) and 7 (Sunday)';
    end if;

    if v_start is null or v_end is null then
      raise exception using errcode = '22023', message = 'Start and end times are required';
    end if;

    if v_start >= v_end then
      raise exception using errcode = '22023', message = 'A slot must end after it starts';
    end if;

    -- Overlap check skips slots that are byte-identical to the one being
    -- re-submitted, otherwise saving an unchanged schedule would reject itself.
    if exists (
      select 1
      from public.availability a
      where a.student_id = v_user_id
        and a.day_of_week = v_day
        and a.start_time < v_end
        and a.end_time > v_start
        and not (
          a.day_of_week = v_day
          and a.start_time = v_start
          and a.end_time = v_end
        )
    ) then
      raise exception using errcode = '22023',
        message = 'That time overlaps a slot you have already added';
    end if;

    insert into public.availability (student_id, day_of_week, start_time, end_time)
    values (v_user_id, v_day, v_start, v_end)
    on conflict (student_id, day_of_week, start_time, end_time) do nothing;

    get diagnostics v_inserted = row_count;
    v_count := v_count + v_inserted;
  end loop;

  delete from public.availability
  where student_id = v_user_id
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_slots) kept
      where (kept ->> 'day_of_week')::smallint = availability.day_of_week
        and (kept ->> 'start_time')::time = availability.start_time
        and (kept ->> 'end_time')::time = availability.end_time
    );

  return v_count;
end;
$$;

revoke all on function public.get_skill_matches()
  from public, anon, authenticated;
grant execute on function public.get_skill_matches() to authenticated;

revoke all on function public.set_my_availability(jsonb)
  from public, anon, authenticated;
grant execute on function public.set_my_availability(jsonb) to authenticated;