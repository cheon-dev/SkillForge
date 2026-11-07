-- Award one skill-specific mastery achievement after three distinct
-- reviewed Skill Challenges have been passed for that skill.

create or replace function public.ensure_skill_mastery_achievement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.achievements (name, description, icon, criteria)
  values (
    new.name || ' Master',
    'Pass three different Skill Challenges for ' || new.name || '.',
    '🏆',
    'skill_mastery:' || new.id::text
  )
  on conflict (criteria) do update
  set name = excluded.name,
      description = excluded.description,
      icon = excluded.icon;

  return new;
end;
$$;

revoke all on function public.ensure_skill_mastery_achievement()
  from public, anon, authenticated;

drop trigger if exists skill_mastery_achievement_sync on public.skills;
create trigger skill_mastery_achievement_sync
after insert or update of name on public.skills
for each row execute function public.ensure_skill_mastery_achievement();

insert into public.achievements (name, description, icon, criteria)
select
  s.name || ' Master',
  'Pass three different Skill Challenges for ' || s.name || '.',
  '🏆',
  'skill_mastery:' || s.id::text
from public.skills s
on conflict (criteria) do update
set name = excluded.name,
    description = excluded.description,
    icon = excluded.icon;

create or replace function public.award_achievements(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_user_id is null then
    return jsonb_build_object('count', 0, 'achievements', '[]'::jsonb);
  end if;

  with earned as (
    insert into public.student_achievements (student_id, achievement_id)
    select p_user_id, a.id
    from public.achievements a
    where a.criteria is not null
      and case
        when a.criteria = 'first_skill_shared' then exists (
          select 1 from public.student_skills ss
          where ss.student_id = p_user_id and ss.is_teachable = true
        )
        when a.criteria = 'first_session_completed' then exists (
          select 1 from public.learning_sessions ls
          where ls.learner_id = p_user_id and ls.status = 'completed'
        )
        when a.criteria = 'first_session_taught' then exists (
          select 1 from public.learning_sessions ls
          where ls.teacher_id = p_user_id and ls.status = 'completed'
        )
        when a.criteria = 'practice_streak' then (
          select count(*) >= 3
          from public.activity_attempts aa
          join public.session_activities sa on sa.id = aa.activity_id
          where aa.student_id = p_user_id
            and aa.status = 'reviewed'
            and aa.passed = true
        )
        when a.criteria = 'first_challenge_passed' then exists (
          select 1 from public.challenge_submissions cs
          where cs.student_id = p_user_id and cs.status = 'passed'
        )
        when a.criteria = 'helpful_peer' then exists (
          select 1 from public.challenge_submissions cs
          where cs.reviewer_id = p_user_id and cs.status in ('passed', 'needs_revision')
        )
        when a.criteria like 'skill_mastery:%' then (
          select count(distinct cs.challenge_id) >= 3
          from public.challenge_submissions cs
          join public.skill_challenges sc on sc.id = cs.challenge_id
          where cs.student_id = p_user_id
            and cs.status = 'passed'
            and sc.skill_id::text = pg_catalog.substr(a.criteria, 15)
        )
        else false
      end
    on conflict do nothing
    returning achievement_id
  ),
  details as (
    select e.achievement_id, a.name, a.icon
    from earned e
    join public.achievements a on a.id = e.achievement_id
  ),
  notified as (
    insert into public.notifications (
      recipient_id, actor_id, notification_type, title, body, entity_id
    )
    select
      p_user_id,
      null,
      'achievement_unlocked',
      'Achievement unlocked',
      'You earned ' || d.name || '.',
      d.achievement_id
    from details d
    returning 1
  )
  select jsonb_build_object(
    'count', (select count(*)::int from details),
    'achievements', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', d.achievement_id, 'name', d.name, 'icon', d.icon)
          order by d.name
        )
        from details d
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.award_achievements(uuid)
  from public, anon, authenticated;
