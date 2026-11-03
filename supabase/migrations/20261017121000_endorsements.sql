-- Peer endorsements with a real eligibility rule.
--
-- features.md section 8 allows students to endorse skills "after eligible
-- sessions or collaborations" and warns that endorsements "must follow the
-- platform's eligibility rules and must not be treated as automatic proof of
-- proficiency".
--
-- The existing endorsements_insert_by_endorser policy only checked that the
-- caller was not endorsing themselves, so any student could endorse any other
-- student for any skill on the catalog. That policy is dropped here and writes
-- go through endorse_peer_skill(), which requires that the two students have
-- actually completed a learning session together for that specific skill.
-- That is the observation the endorsement is meant to record.
--
-- Collaborations are not built yet, so project-based eligibility is left out
-- rather than approximated; the RPC is the single place to extend.

drop policy if exists endorsements_insert_by_endorser on public.endorsements;

create or replace function public.endorsement_is_eligible(
  p_endorser_id uuid,
  p_student_id uuid,
  p_skill_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_endorser_id is not null
    and p_student_id is not null
    and p_skill_id is not null
    and p_endorser_id <> p_student_id
    and exists (
      select 1
      from public.learning_sessions ls
      where ls.skill_id = p_skill_id
        and ls.status = 'completed'
        and (
          (ls.learner_id = p_endorser_id and ls.teacher_id = p_student_id)
          or (ls.teacher_id = p_endorser_id and ls.learner_id = p_student_id)
        )
    );
$$;

create or replace function public.endorse_peer_skill(
  p_student_id uuid,
  p_skill_id uuid,
  p_comment text default null
)
returns public.endorsements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_endorsement public.endorsements;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if v_caller_id = p_student_id then
    raise exception using errcode = '42501', message = 'You cannot endorse yourself';
  end if;

  if not public.endorsement_is_eligible(v_caller_id, p_student_id, p_skill_id) then
    raise exception using errcode = '55000',
      message = 'You can only endorse a skill you completed a session together';
  end if;

  insert into public.endorsements (student_id, skill_id, endorsed_by, comment)
  values (
    p_student_id, p_skill_id, v_caller_id,
    nullif(pg_catalog.btrim(coalesce(p_comment, '')), '')
  )
  returning * into v_endorsement;

  return v_endorsement;
end;
$$;

-- Who the caller may still endorse, and which skills.
create or replace function public.get_endorsement_opportunities()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_opportunities jsonb;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select coalesce(
    jsonb_agg(entry order by entry ->> 'student_name', entry ->> 'skill_name'),
    '[]'::jsonb
  )
  into v_opportunities
  from (
    select jsonb_build_object(
      'skill_id', s.id,
      'skill_name', s.name,
      'skill_category', s.category,
      'student_id', peer.id,
      'student_name', coalesce(nullif(pg_catalog.btrim(peer.full_name), ''), 'SkillForge student')
    ) as entry
    from public.learning_sessions ls
    join public.skills s on s.id = ls.skill_id
    join public.profiles peer on peer.id = case
      when ls.learner_id = v_caller_id then ls.teacher_id
      else ls.learner_id
    end
    where ls.status = 'completed'
      and (ls.learner_id = v_caller_id or ls.teacher_id = v_caller_id)
      and peer.id <> v_caller_id
      and not exists (
        select 1
        from public.endorsements e
        where e.student_id = peer.id
          and e.skill_id = s.id
          and e.endorsed_by = v_caller_id
      )
  ) rows;

  return v_opportunities;
end;
$$;

revoke all on function public.endorsement_is_eligible(uuid, uuid, uuid)
  from public, anon, authenticated;

revoke all on function public.endorse_peer_skill(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.endorse_peer_skill(uuid, uuid, text) to authenticated;

revoke all on function public.get_endorsement_opportunities()
  from public, anon, authenticated;
grant execute on function public.get_endorsement_opportunities() to authenticated;