-- SkillForge initial database foundation.
-- Matching calculations belong in the application/service layer, not triggers.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prevent_session_participant_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.learner_id <> old.learner_id or new.teacher_id <> old.teacher_id then
    raise exception 'Learning session participants cannot be changed';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_student_challenge_review_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() = old.student_id then
    if new.status not in ('draft', 'submitted')
      or new.reviewer_id is not null
      or new.reviewer_feedback is not null
      or new.reviewed_at is not null then
      raise exception 'Students cannot change challenge review fields';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_challenge_submission_protected_field_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.student_id is distinct from old.student_id
    or new.challenge_id is distinct from old.challenge_id then
    raise exception 'Challenge submission ownership cannot be changed';
  end if;

  if auth.uid() = old.reviewer_id
    and (
      new.id is distinct from old.id
      or new.session_id is distinct from old.session_id
      or new.submission_text is distinct from old.submission_text
      or new.submission_url is distinct from old.submission_url
      or new.attachment_url is distinct from old.attachment_url
      or new.submitted_at is distinct from old.submitted_at
    ) then
    raise exception 'Reviewers cannot change student-authored submission fields';
  end if;

  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  course text,
  year_level smallint check (year_level is null or year_level between 1 and 8),
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) > 0),
  category text not null check (char_length(btrim(category)) > 0),
  description text,
  created_at timestamptz not null default now()
);

create table public.skill_relationships (
  skill_id uuid not null references public.skills(id) on delete cascade,
  related_skill_id uuid not null references public.skills(id) on delete cascade,
  relationship_type text not null check (
    relationship_type in ('related', 'prerequisite', 'extension')
  ),
  primary key (skill_id, related_skill_id),
  check (skill_id <> related_skill_id)
);

create table public.student_skills (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete restrict,
  proficiency_level text not null check (
    proficiency_level in ('beginner', 'intermediate', 'advanced', 'expert')
  ),
  years_experience numeric(4, 1) not null default 0 check (years_experience >= 0),
  is_teachable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, skill_id)
);

create table public.learning_goals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete restrict,
  current_level text not null check (
    current_level in ('beginner', 'intermediate', 'advanced', 'expert')
  ),
  target_level text not null check (
    target_level in ('beginner', 'intermediate', 'advanced', 'expert')
  ),
  goal_description text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'active' check (
    status in ('active', 'paused', 'completed', 'cancelled')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.availability (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (start_time < end_time),
  unique (student_id, day_of_week, start_time, end_time)
);

create table public.learning_sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete restrict,
  scheduled_at timestamptz not null,
  duration_minutes smallint not null check (duration_minutes between 15 and 480),
  status text not null default 'requested' check (
    status in ('requested', 'accepted', 'declined', 'scheduled', 'completed', 'cancelled', 'no_show')
  ),
  learning_objectives text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (learner_id <> teacher_id)
);

create table public.skill_challenges (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills(id) on delete restrict,
  title text not null check (char_length(btrim(title)) > 0),
  description text,
  difficulty text not null check (
    difficulty in ('beginner', 'intermediate', 'advanced', 'expert')
  ),
  instructions text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.challenge_submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.skill_challenges(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.learning_sessions(id) on delete set null,
  submission_text text,
  submission_url text,
  attachment_url text,
  status text not null default 'draft' check (
    status in ('draft', 'submitted', 'under_review', 'passed', 'needs_revision')
  ),
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewer_feedback text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  check (
    status = 'draft'
    or submission_text is not null
    or submission_url is not null
    or attachment_url is not null
  )
);

create table public.endorsements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete restrict,
  endorsed_by uuid not null references public.profiles(id) on delete cascade,
  comment text,
  created_at timestamptz not null default now(),
  check (student_id <> endorsed_by),
  unique (student_id, skill_id, endorsed_by)
);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) > 0),
  description text,
  icon text,
  created_at timestamptz not null default now()
);

create table public.student_achievements (
  student_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (student_id, achievement_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  description text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'planning' check (
    status in ('planning', 'active', 'completed', 'archived')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  role text,
  joined_at timestamptz not null default now(),
  unique (project_id, student_id)
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger student_skills_set_updated_at
before update on public.student_skills
for each row execute function public.set_updated_at();

create trigger learning_goals_set_updated_at
before update on public.learning_goals
for each row execute function public.set_updated_at();

create trigger learning_sessions_set_updated_at
before update on public.learning_sessions
for each row execute function public.set_updated_at();

create trigger skill_challenges_set_updated_at
before update on public.skill_challenges
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger prevent_learning_session_participant_change
before update on public.learning_sessions
for each row execute function public.prevent_session_participant_change();

create trigger prevent_student_challenge_review_change
before update on public.challenge_submissions
for each row execute function public.prevent_student_challenge_review_change();

create trigger prevent_challenge_submission_protected_field_change
before update on public.challenge_submissions
for each row execute function public.prevent_challenge_submission_protected_field_change();

create index idx_profiles_course on public.profiles(course);
create index idx_profiles_year_level on public.profiles(year_level);
create unique index idx_skills_name_normalized
  on public.skills(lower(btrim(name)));
create index idx_skill_relationships_related_skill_id
  on public.skill_relationships(related_skill_id);
create index idx_student_skills_student_id on public.student_skills(student_id);
create index idx_student_skills_skill_id on public.student_skills(skill_id);
create index idx_student_skills_matching
  on public.student_skills(skill_id, proficiency_level, is_teachable);
create index idx_learning_goals_student_id on public.learning_goals(student_id);
create index idx_learning_goals_skill_id on public.learning_goals(skill_id);
create index idx_availability_student_id on public.availability(student_id);
create index idx_availability_matching
  on public.availability(day_of_week, start_time, end_time);
create index idx_learning_sessions_learner_id on public.learning_sessions(learner_id);
create index idx_learning_sessions_teacher_id on public.learning_sessions(teacher_id);
create index idx_learning_sessions_teacher_status
  on public.learning_sessions(teacher_id, status);
create index idx_learning_sessions_skill_id on public.learning_sessions(skill_id);
create index idx_skill_challenges_skill_id on public.skill_challenges(skill_id);
create index idx_challenge_submissions_student_id
  on public.challenge_submissions(student_id);
create index idx_challenge_submissions_challenge_id
  on public.challenge_submissions(challenge_id);
create index idx_endorsements_student_id on public.endorsements(student_id);
create index idx_endorsements_skill_id on public.endorsements(skill_id);
create index idx_student_achievements_student_id
  on public.student_achievements(student_id);
create index idx_student_achievements_achievement_id
  on public.student_achievements(achievement_id);
create index idx_projects_owner_id on public.projects(owner_id);
create index idx_project_members_project_id on public.project_members(project_id);
create index idx_project_members_student_id on public.project_members(student_id);

alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.skill_relationships enable row level security;
alter table public.student_skills enable row level security;
alter table public.learning_goals enable row level security;
alter table public.availability enable row level security;
alter table public.learning_sessions enable row level security;
alter table public.skill_challenges enable row level security;
alter table public.challenge_submissions enable row level security;
alter table public.endorsements enable row level security;
alter table public.achievements enable row level security;
alter table public.student_achievements enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;

create policy profiles_select_authenticated
on public.profiles for select to authenticated
using (true);

create policy profiles_insert_own
on public.profiles for insert to authenticated
with check (id = auth.uid());

create policy profiles_update_own
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy profiles_delete_own
on public.profiles for delete to authenticated
using (id = auth.uid());

create policy skills_select_authenticated
on public.skills for select to authenticated
using (true);

create policy skill_relationships_select_authenticated
on public.skill_relationships for select to authenticated
using (true);

create policy student_skills_select_authenticated
on public.student_skills for select to authenticated
using (student_id = auth.uid() or is_teachable = true);

create policy student_skills_insert_own
on public.student_skills for insert to authenticated
with check (student_id = auth.uid());

create policy student_skills_update_own
on public.student_skills for update to authenticated
using (student_id = auth.uid())
with check (student_id = auth.uid());

create policy student_skills_delete_own
on public.student_skills for delete to authenticated
using (student_id = auth.uid());

create policy learning_goals_select_own
on public.learning_goals for select to authenticated
using (student_id = auth.uid());

create policy learning_goals_insert_own
on public.learning_goals for insert to authenticated
with check (student_id = auth.uid());

create policy learning_goals_update_own
on public.learning_goals for update to authenticated
using (student_id = auth.uid())
with check (student_id = auth.uid());

create policy learning_goals_delete_own
on public.learning_goals for delete to authenticated
using (student_id = auth.uid());

create policy availability_select_own
on public.availability for select to authenticated
using (student_id = auth.uid());

create policy availability_insert_own
on public.availability for insert to authenticated
with check (student_id = auth.uid());

create policy availability_update_own
on public.availability for update to authenticated
using (student_id = auth.uid())
with check (student_id = auth.uid());

create policy availability_delete_own
on public.availability for delete to authenticated
using (student_id = auth.uid());

create policy learning_sessions_select_participant
on public.learning_sessions for select to authenticated
using (learner_id = auth.uid() or teacher_id = auth.uid());

create policy learning_sessions_insert_as_learner
on public.learning_sessions for insert to authenticated
with check (learner_id = auth.uid());

create policy learning_sessions_update_participant
on public.learning_sessions for update to authenticated
using (learner_id = auth.uid() or teacher_id = auth.uid())
with check (learner_id = auth.uid() or teacher_id = auth.uid());

create policy learning_sessions_delete_participant
on public.learning_sessions for delete to authenticated
using (learner_id = auth.uid() or teacher_id = auth.uid());

create policy skill_challenges_select_authenticated
on public.skill_challenges for select to authenticated
using (true);

create policy skill_challenges_insert_own
on public.skill_challenges for insert to authenticated
with check (created_by = auth.uid());

create policy skill_challenges_update_own
on public.skill_challenges for update to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy skill_challenges_delete_own
on public.skill_challenges for delete to authenticated
using (created_by = auth.uid());

create policy challenge_submissions_select_participant
on public.challenge_submissions for select to authenticated
using (student_id = auth.uid() or reviewer_id = auth.uid());

create policy challenge_submissions_insert_own
on public.challenge_submissions for insert to authenticated
with check (
  student_id = auth.uid()
  and status in ('draft', 'submitted')
  and reviewer_id is null
  and reviewed_at is null
);

create policy challenge_submissions_update_own
on public.challenge_submissions for update to authenticated
using (student_id = auth.uid())
with check (
  student_id = auth.uid()
  and status in ('draft', 'submitted')
  and reviewer_id is null
  and reviewed_at is null
);

create policy challenge_submissions_update_reviewer
on public.challenge_submissions for update to authenticated
using (reviewer_id = auth.uid())
with check (reviewer_id = auth.uid());

create policy challenge_submissions_delete_own
on public.challenge_submissions for delete to authenticated
using (student_id = auth.uid() and status = 'draft');

create policy endorsements_select_authenticated
on public.endorsements for select to authenticated
using (true);

create policy endorsements_insert_by_endorser
on public.endorsements for insert to authenticated
with check (endorsed_by = auth.uid() and student_id <> auth.uid());

create policy endorsements_delete_by_endorser
on public.endorsements for delete to authenticated
using (endorsed_by = auth.uid());

create policy achievements_select_authenticated
on public.achievements for select to authenticated
using (true);

create policy student_achievements_select_own
on public.student_achievements for select to authenticated
using (student_id = auth.uid());

create policy projects_select_authenticated
on public.projects for select to authenticated
using (true);

create policy projects_insert_own
on public.projects for insert to authenticated
with check (owner_id = auth.uid());

create policy projects_update_own
on public.projects for update to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy projects_delete_own
on public.projects for delete to authenticated
using (owner_id = auth.uid());

create policy project_members_select_authenticated
on public.project_members for select to authenticated
using (true);

create policy project_members_insert_self_or_owner
on public.project_members for insert to authenticated
with check (
  student_id = auth.uid()
  or exists (
    select 1
    from public.projects
    where projects.id = project_members.project_id
      and projects.owner_id = auth.uid()
  )
);

create policy project_members_update_self_or_owner
on public.project_members for update to authenticated
using (
  student_id = auth.uid()
  or exists (
    select 1
    from public.projects
    where projects.id = project_members.project_id
      and projects.owner_id = auth.uid()
  )
)
with check (
  student_id = auth.uid()
  or exists (
    select 1
    from public.projects
    where projects.id = project_members.project_id
      and projects.owner_id = auth.uid()
  )
);

create policy project_members_delete_self_or_owner
on public.project_members for delete to authenticated
using (
  student_id = auth.uid()
  or exists (
    select 1
    from public.projects
    where projects.id = project_members.project_id
      and projects.owner_id = auth.uid()
  )
);

insert into public.skills (name, category, description)
values
  ('Python', 'Programming', 'General-purpose programming and scripting.'),
  ('JavaScript', 'Programming', 'Programming for web and application development.'),
  ('Java', 'Programming', 'Object-oriented programming for applications and services.'),
  ('C#', 'Programming', 'Programming for applications, services, and game development.'),
  ('HTML', 'Web Development', 'Structure and semantics for web pages.'),
  ('CSS', 'Web Development', 'Styling and layout for web interfaces.'),
  ('React', 'Web Development', 'Component-based user interface development.'),
  ('Node.js', 'Web Development', 'Server-side JavaScript runtime development.'),
  ('UI/UX Design', 'Design', 'User interface and user experience design.'),
  ('Figma', 'Design', 'Collaborative interface and product design.'),
  ('Networking', 'Networking', 'Computer networking concepts and practices.'),
  ('Cisco', 'Networking', 'Cisco networking technologies and configuration.'),
  ('MySQL', 'Database', 'Relational database design and SQL.'),
  ('PostgreSQL', 'Database', 'Relational database design and PostgreSQL.'),
  ('Video Editing', 'Multimedia', 'Editing and producing video content.'),
  ('Graphic Design', 'Multimedia', 'Visual communication and graphic composition.')
on conflict do nothing;
