-- Fix award_achievements: plpgsql `INSERT ... RETURNING ... INTO array_var`
-- does not collect every returned row into the array. With a single row it
-- assigned the scalar uuid, and the next array operation failed with
--   malformed array literal: "<uuid>"
--
-- Because complete_learning_session and review_challenge_submission both
-- `perform` this function, that error rolled back session completion and
-- challenge review. The Passport sync also failed, though the page swallowed it.
--
-- Rewritten with data-modifying CTEs, which do collect all rows.

drop function if exists public.award_achievements(uuid);

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