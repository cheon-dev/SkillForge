-- Achievements and badges.
--
-- features.md section 9 requires that achievements recognise meaningful learning
-- milestones and be "granted according to defined conditions rather than
-- arbitrary client-side actions". The achievements and student_achievements
-- tables existed with a SELECT-own policy but had no seed rows, no criteria and
-- nothing that ever wrote to them, so the passport's achievements list could
-- never populate.
--
-- Design:
--   * achievements.criteria names the condition, so the rules live beside the
--     award logic as data and renaming an achievement cannot break it
--   * public.award_achievements() evaluates every condition from recorded rows
--     and inserts the missing student_achievements rows
--   * it is idempotent (composite primary key + on conflict do nothing), so
--     calling it repeatedly can never double-award or inflate XP
--   * it is a SECURITY DEFINER function with no direct grant to clients, so the
--     only way in is a client asking to re-evaluate its own record
--
-- XP is untouched here: achievements carry no XP of their own, so this cannot
-- become a second, unvalidated source of XP (features.md 5D).

alter table public.achievements
  add column if not exists criteria text unique;

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'session_request',
    'session_accepted',
    'session_declined',
    'session_completed',
    'challenge_submitted',
    'challenge_reviewed',
    'achievement_unlocked',
    'activity_reviewed'
  ));

insert into public.achievements (name, description, icon, criteria)
values
  ('First Skill Shared',
   'You marked a skill you can teach.', '🤝', 'first_skill_shared'),
  ('First Learning Session Completed',
   'You finished a gamified learning session with all its missions.', '🎓', 'first_session_completed'),
  ('First Session Taught',
   'A student you taught completed a session with you.', '🧑‍🏫', 'first_session_taught'),
  ('Practice Streak',
   'Three of your activities passed teacher review.', '🔥', 'practice_streak'),
  ('Challenge Master',
   'You passed a Skill Challenge.', '🏆', 'first_challenge_passed'),
  ('Helpful Peer',
   'You reviewed a peer''s challenge submission.', '💬', 'helpful_peer')
on conflict do nothing;

create or replace function public.award_achievements(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_awarded integer;
begin
  if p_user_id is null then
    return 0;
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
  )
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
  from earned e
  join public.achievements a on a.id = e.achievement_id;

  get diagnostics v_awarded = row_count;
  return v_awarded;
end;
$$;

-- Client-facing entry point: re-evaluates only the caller's own record.
create or replace function public.sync_my_achievements()
returns integer
language plpgsql
stable
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

-- Nothing may write the award table directly; only award_achievements can.
revoke all on table public.student_achievements from anon, authenticated;
grant select on table public.student_achievements to authenticated;

revoke all on function public.award_achievements(uuid)
  from public, anon, authenticated;
revoke all on function public.sync_my_achievements()
  from public, anon, authenticated;
grant execute on function public.sync_my_achievements() to authenticated;