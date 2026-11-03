-- Skill Challenges: LEARN -> PRACTICE -> SUBMIT -> REVIEW -> PROVE.
--
-- features.md section 3.1 requires that a student demonstrates what they learned
-- through a practical task, that the outcome is recorded, and that eligible
-- completion can contribute to XP, achievements and the Skill Passport.
--
-- The schema already guarded challenge submissions against self-review and
-- reviewer tampering (prevent_student_challenge_review_change and
-- prevent_challenge_submission_protected_field_change) and no application code
-- touched any of it. This migration adds the missing pieces:
--   * a per-challenge XP value, mirroring session_activities.max_xp
--   * a reward ledger so XP can only ever be awarded once per challenge
--   * reviewer-authorised submit and review operations
--   * notifications for submission and review
--   * a starter set of challenges
--
-- XP rules enforced here (features.md 5D):
--   * awarded only by this SECURITY DEFINER function, never by the client
--   * only on a pass, and only by the challenge author or a moderator
--   * never to the submitter reviewing their own work
--   * at most once per student per challenge, by a table constraint rather
--     than by an existence check alone

alter table public.skill_challenges
  add column if not exists xp_reward integer not null default 25
  check (xp_reward >= 0);

create table if not exists public.challenge_xp_rewards (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique
    references public.challenge_submissions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid not null references public.skill_challenges(id) on delete cascade,
  awarded_by uuid not null references public.profiles(id) on delete restrict,
  xp_awarded integer not null check (xp_awarded >= 0),
  created_at timestamptz not null default now(),
  constraint challenge_xp_rewards_one_per_challenge
    unique (student_id, challenge_id)
);

create index if not exists idx_challenge_xp_rewards_student_id
  on public.challenge_xp_rewards (student_id);

alter table public.challenge_xp_rewards enable row level security;

create policy challenge_xp_rewards_select_own
on public.challenge_xp_rewards for select to authenticated
using (student_id = (select auth.uid()));

revoke all on table public.challenge_xp_rewards from anon, authenticated;
grant select on table public.challenge_xp_rewards to authenticated;

create or replace function public.submit_challenge_submission(
  p_challenge_id uuid,
  p_submission_text text default null,
  p_submission_url text default null,
  p_attachment_url text default null
)
returns public.challenge_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_submission public.challenge_submissions;
  v_text text := nullif(pg_catalog.btrim(coalesce(p_submission_text, '')), '');
  v_url text := nullif(pg_catalog.btrim(coalesce(p_submission_url, '')), '');
  v_attachment text := nullif(pg_catalog.btrim(coalesce(p_attachment_url, '')), '');
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if v_text is null and v_url is null and v_attachment is null then
    raise exception using errcode = '22023',
      message = 'Add your work, a link, or an attachment before submitting';
  end if;

  perform 1
  from public.skill_challenges sc
  where sc.id = p_challenge_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Skill challenge was not found';
  end if;

  insert into public.challenge_submissions (
    challenge_id, student_id, submission_text, submission_url,
    attachment_url, status, submitted_at
  ) values (
    p_challenge_id, v_caller_id, v_text, v_url, v_attachment, 'submitted', pg_catalog.now()
  )
  returning * into v_submission;

  return v_submission;
end;
$$;

create or replace function public.review_challenge_submission(
  p_submission_id uuid,
  p_passed boolean,
  p_feedback text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_submission public.challenge_submissions;
  v_challenge public.skill_challenges;
  v_feedback text := nullif(pg_catalog.btrim(coalesce(p_feedback, '')), '');
  v_awarded_xp integer := 0;
  v_total_xp integer;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if p_passed is null then
    raise exception using errcode = '22023', message = 'A pass or revision result is required';
  end if;

  select * into v_submission
  from public.challenge_submissions cs
  where cs.id = p_submission_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Challenge submission was not found';
  end if;

  select * into v_challenge
  from public.skill_challenges sc
  where sc.id = v_submission.challenge_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Skill challenge was not found';
  end if;

  if v_caller_id = v_submission.student_id then
    raise exception using errcode = '42501',
      message = 'You cannot review your own challenge submission';
  end if;

  if not (
    public.is_moderator()
    or (v_challenge.created_by is not null and v_challenge.created_by = v_caller_id)
  ) then
    raise exception using errcode = '42501',
      message = 'Only the challenge author or a moderator can review this submission';
  end if;

  if v_submission.status <> 'submitted' then
    raise exception using errcode = '55000',
      message = 'Only a submitted challenge can be reviewed';
  end if;

  if p_passed and not exists (
    select 1
    from public.challenge_xp_rewards r
    where r.student_id = v_submission.student_id
      and r.challenge_id = v_submission.challenge_id
  ) then
    v_awarded_xp := v_challenge.xp_reward;

    insert into public.challenge_xp_rewards (
      submission_id, student_id, challenge_id, awarded_by, xp_awarded
    ) values (
      p_submission_id, v_submission.student_id, v_submission.challenge_id,
      v_caller_id, v_awarded_xp
    );

    insert into public.student_xp as sx (student_id, total_xp, level)
    values (v_submission.student_id, v_awarded_xp, greatest(1, (v_awarded_xp / 100) + 1))
    on conflict on constraint student_xp_pkey do update
    set total_xp = sx.total_xp + excluded.total_xp,
        level = greatest(1, ((sx.total_xp + excluded.total_xp) / 100) + 1),
        updated_at = pg_catalog.now();
  end if;

  update public.challenge_submissions cs
  set status = case when p_passed then 'passed' else 'needs_revision' end,
      reviewer_id = v_caller_id,
      reviewer_feedback = v_feedback,
      reviewed_at = pg_catalog.now()
  where cs.id = p_submission_id
  returning * into v_submission;

  select coalesce((select sx.total_xp from public.student_xp sx
    where sx.student_id = v_submission.student_id), 0)
  into v_total_xp;

  return jsonb_build_object(
    'submission_id', v_submission.id,
    'challenge_id', v_submission.challenge_id,
    'status', v_submission.status,
    'xp_awarded', v_awarded_xp,
    'total_xp', v_total_xp
  );
end;
$$;

-- Notifications for the challenge loop.
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
    'activity_reviewed'
  ));

create or replace function public.create_challenge_submission_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge_title text;
  v_skill_name text;
  v_student_name text;
begin
  select sc.title, s.name, coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'A student')
  into v_challenge_title, v_skill_name, v_student_name
  from public.challenge_submissions cs
  join public.skill_challenges sc on sc.id = cs.challenge_id
  join public.skills s on s.id = sc.skill_id
  join public.profiles p on p.id = cs.student_id
  where cs.id = new.id;

  if new.status = 'submitted' and new.reviewed_at is null then
    insert into public.notifications (
      recipient_id, actor_id, notification_type, title, body, entity_id
    )
    select sc.created_by, new.student_id, 'challenge_submitted',
      'New challenge submission',
      v_student_name || ' submitted work for "' || coalesce(v_challenge_title, 'a challenge') || '".',
      new.challenge_id
    from public.skill_challenges sc
    where sc.id = new.challenge_id
      and sc.created_by is not null
      and sc.created_by <> new.student_id;
  end if;

  -- OLD is unassigned on INSERT, so the review branch must be UPDATE-only.
  if tg_op = 'UPDATE'
     and new.reviewed_at is not null
     and (old.reviewed_at is null or old.status is distinct from new.status) then
    insert into public.notifications (
      recipient_id, actor_id, notification_type, title, body, entity_id
    ) values (
      new.student_id,
      new.reviewer_id,
      'challenge_reviewed',
      case when new.status = 'passed' then 'Challenge passed' else 'Challenge needs revision' end,
      case when new.status = 'passed'
        then 'Your ' || coalesce(v_skill_name, 'skill') || ' challenge submission passed.'
        else 'Your ' || coalesce(v_skill_name, 'skill') || ' challenge needs another attempt.'
      end
      || case when new.reviewer_feedback is not null
          then ' Feedback: ' || new.reviewer_feedback
          else ''
        end,
      new.challenge_id
    );
  end if;

  return new;
end;
$$;

create trigger challenge_submission_notification
after insert or update on public.challenge_submissions
for each row execute function public.create_challenge_submission_notification();

revoke all on function public.create_challenge_submission_notification()
  from public, anon, authenticated;

revoke all on function public.submit_challenge_submission(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_challenge_submission(uuid, text, text, text)
  to authenticated;

revoke all on function public.review_challenge_submission(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.review_challenge_submission(uuid, boolean, text)
  to authenticated;

-- Starter challenges, including the example from features.md. Authored by the
-- platform admin account so a reviewer always exists; students can add their own
-- challenges and then review submissions to them.
insert into public.skill_challenges (
  skill_id, title, description, difficulty, instructions, created_by
)
select
  s.id,
  v.title,
  v.description,
  v.difficulty,
  v.instructions,
  (select p.id from public.profiles p
     join auth.users u on u.id = p.id
    where lower(u.email) = 'dankirvymanongsong@gmail.com'
    limit 1)
from (values
  ('Python',
   'Calculate the average of three numbers',
   'Prove you can turn a specification into working code.',
   'beginner',
   'Write a Python function that takes three numbers and returns their average. Submit the code as text and explain how your function handles the case where the numbers are not integers.'),
  ('JavaScript',
   'Build an array filter utility',
   'Show that you can manipulate arrays and reason about callbacks.',
   'beginner',
   'Write a JavaScript function that returns the items of an array which pass a given condition. Submit your code and one example call showing the output.'),
  ('HTML',
   'Build an accessible contact form',
   'Demonstrate semantic HTML and accessible labelling.',
   'beginner',
   'Create a contact form with name, email and message fields. Every input must have a associated label, and include a submit button. Submit the markup.'),
  ('CSS',
   'Create a responsive card layout',
   'Show you can lay out a component that adapts to the viewport.',
   'intermediate',
   'Style a card component using CSS that reflows from one column on small screens to three on wide screens. Submit your CSS.'),
  ('MySQL',
   'Model a booking table',
   'Translate a real-world scenario into a relational schema.',
   'intermediate',
   'Write the CREATE TABLE statement for a bookings table with a primary key, a foreign key to a customers table, a check constraint on the booking date, and an index on the customer reference. Submit the SQL.'),
  ('Figma',
   'Produce a low-fidelity wireframe',
   'Show your ability to plan an interface before visual design.',
   'beginner',
   'Create a low-fidelity wireframe for a student dashboard containing a navigation area, a summary panel and a task list. Submit a link to your file.')
) as v(skill_name, title, description, difficulty, instructions)
join public.skills s on s.name = v.skill_name
where not exists (
  select 1 from public.skill_challenges sc
  where sc.title = v.title and sc.skill_id = s.id
);