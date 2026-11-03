-- Make pending challenge submissions visible to the people allowed to review them.
--
-- Two problems made the review loop unreachable from the UI:
--
--   1. challenge_submissions_select_participant only allows
--      `student_id = auth.uid() or reviewer_id = auth.uid()`. Because
--      reviewer_id is NULL until a review happens, a challenge author or a
--      moderator could never SELECT a submission waiting for them.
--   2. The Challenges page only loaded the viewer's own submissions, so its
--      review form could never be satisfied.
--
-- Review authority itself is unchanged and still enforced in
-- review_challenge_submission(): challenge author or moderator, never the
-- submitter. This migration only affects who can SEE pending work.

create policy challenge_submissions_select_reviewer
on public.challenge_submissions for select to authenticated
using (
  public.is_moderator()
  or exists (
    select 1
    from public.skill_challenges sc
    where sc.id = challenge_submissions.challenge_id
      and sc.created_by = (select auth.uid())
  )
);

-- A review queue, so the page does not have to reconstruct "what am I allowed
-- to review" in the client. SECURITY DEFINER because the new SELECT policy
-- above and skill_challenges visibility differ per caller.
create or replace function public.get_reviewable_challenge_submissions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_queue jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select coalesce(jsonb_agg(entry order by entry ->> 'submitted_at'), '[]'::jsonb)
  into v_queue
  from (
    select jsonb_build_object(
      'submission_id', cs.id,
      'challenge_id', sc.id,
      'challenge_title', sc.title,
      'xp_reward', sc.xp_reward,
      'skill_name', s.name,
      'skill_category', s.category,
      'student_id', cs.student_id,
      'student_name', coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'A SkillForge student'),
      'submission_text', cs.submission_text,
      'submission_url', cs.submission_url,
      'attachment_url', cs.attachment_url,
      'submitted_at', cs.submitted_at
    ) as entry
    from public.challenge_submissions cs
    join public.skill_challenges sc on sc.id = cs.challenge_id
    join public.skills s on s.id = sc.skill_id
    left join public.profiles p on p.id = cs.student_id
    where cs.status = 'submitted'
      and cs.student_id <> v_user_id
      and (public.is_moderator() or sc.created_by = v_user_id)
  ) rows;

  return v_queue;
end;
$$;

revoke all on function public.get_reviewable_challenge_submissions()
  from public, anon, authenticated;
grant execute on function public.get_reviewable_challenge_submissions() to authenticated;