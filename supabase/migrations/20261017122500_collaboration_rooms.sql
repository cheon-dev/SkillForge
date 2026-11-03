-- Collaboration rooms (features.md section 11) and skill-to-project matching
-- (features.md section 3.4).
--
-- public.projects and public.project_members have existed since the initial
-- schema but were never used. This gives them the rest of a room: required
-- skills, milestones, tasks and assignments, shared links, progress and a
-- collaboration history, plus a group conversation per project.
--
-- Access rule: only the owner and its members may read a room. The old
-- projects_select_authenticated policy exposed every project to every signed-in
-- student, and project_members_insert_self_or_owner let anyone add themselves
-- to any project (which would have granted them the room and its chat). Both
-- are replaced.
--
-- Every mutation goes through a SECURITY DEFINER function that checks the
-- caller's role. There are deliberately no client insert/update/delete policies
-- on the room tables, so the rules cannot be bypassed by writing to a table
-- directly.

-- ---------------------------------------------------------------------------
-- 1. Room structure
-- ---------------------------------------------------------------------------

create table public.project_skills (
  project_id uuid not null
    references public.projects(id) on delete cascade,
  skill_id uuid not null
    references public.skills(id) on delete restrict,
  primary key (project_id, skill_id)
);

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.projects(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text,
  due_date date,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed')),
  position integer not null default 0,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id)
);

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.projects(id) on delete cascade,
  milestone_id uuid
    references public.project_milestones(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text,
  assigned_to uuid references public.profiles(id) on delete set null,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'blocked', 'done')),
  due_date date,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.projects(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 160),
  url text not null check (url ~* '^https?://'),
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- The "collaboration history" required by section 11. Written only by the
-- functions below, so a client cannot invent an entry.
create table public.project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'project_created',
    'status_changed',
    'member_joined',
    'member_left',
    'member_removed',
    'role_changed',
    'milestone_created',
    'milestone_completed',
    'task_created',
    'task_assigned',
    'task_completed',
    'file_shared'
  )),
  summary text not null,
  created_at timestamptz not null default now()
);

create index project_skills_skill_idx
  on public.project_skills (skill_id);
create index project_milestones_project_idx
  on public.project_milestones (project_id, position);
create index project_tasks_project_status_idx
  on public.project_tasks (project_id, status);
create index project_tasks_assignee_idx
  on public.project_tasks (assigned_to);
create index project_files_project_idx
  on public.project_files (project_id, created_at desc);
create index project_events_project_idx
  on public.project_events (project_id, created_at desc);

create trigger project_milestones_set_updated_at
before update on public.project_milestones
for each row execute function public.set_updated_at();

create trigger project_tasks_set_updated_at
before update on public.project_tasks
for each row execute function public.set_updated_at();

-- A task may only point at a milestone from its own project, and may only be
-- assigned to a member of that project. Enforced here as well as in the RPCs.
create or replace function public.validate_project_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.milestone_id is not null and not exists (
    select 1
    from public.project_milestones m
    where m.id = new.milestone_id
      and m.project_id = new.project_id
  ) then
    raise exception using errcode = '23514',
      message = 'That milestone belongs to a different project';
  end if;

  if new.assigned_to is not null and not exists (
    select 1
    from public.project_members pm
    where pm.project_id = new.project_id
      and pm.student_id = new.assigned_to
  ) then
    raise exception using errcode = '23514',
      message = 'Tasks can only be assigned to project members';
  end if;

  return new;
end;
$$;

create trigger project_tasks_validate
before insert or update on public.project_tasks
for each row execute function public.validate_project_task();

-- ---------------------------------------------------------------------------
-- 2. Access helpers and policies
-- ---------------------------------------------------------------------------

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.owner_id = auth.uid()
  ) or exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.student_id = auth.uid()
  );
$$;

create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.owner_id = auth.uid()
  );
$$;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_skills enable row level security;
alter table public.project_milestones enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_files enable row level security;
alter table public.project_events enable row level security;

-- Rooms were world-readable and self-joinable before. Remove those policies.
drop policy if exists projects_select_authenticated on public.projects;
drop policy if exists projects_insert_own on public.projects;
drop policy if exists projects_update_own on public.projects;
drop policy if exists projects_delete_own on public.projects;
drop policy if exists project_members_select_authenticated on public.project_members;
drop policy if exists project_members_insert_self_or_owner on public.project_members;
drop policy if exists project_members_update_self_or_owner on public.project_members;
drop policy if exists project_members_delete_self_or_owner on public.project_members;

create policy projects_select_member
on public.projects for select to authenticated
using (public.is_project_member(id));

create policy project_members_select_member
on public.project_members for select to authenticated
using (public.is_project_member(project_id));

create policy project_skills_select_member
on public.project_skills for select to authenticated
using (public.is_project_member(project_id));

create policy project_milestones_select_member
on public.project_milestones for select to authenticated
using (public.is_project_member(project_id));

create policy project_tasks_select_member
on public.project_tasks for select to authenticated
using (public.is_project_member(project_id));

create policy project_files_select_member
on public.project_files for select to authenticated
using (public.is_project_member(project_id));

create policy project_events_select_member
on public.project_events for select to authenticated
using (public.is_project_member(project_id));

-- Rooms are created and changed only through the functions below. Revoking
-- write grants keeps that true even if a policy is ever added by mistake.
revoke insert, update, delete on table public.projects
  from public, anon, authenticated;
revoke insert, update, delete on table public.project_members
  from public, anon, authenticated;
grant select on table public.projects to authenticated;
grant select on table public.project_members to authenticated;

revoke all on table public.project_skills
  from public, anon, authenticated;
revoke all on table public.project_milestones
  from public, anon, authenticated;
revoke all on table public.project_tasks
  from public, anon, authenticated;
revoke all on table public.project_files
  from public, anon, authenticated;
revoke all on table public.project_events
  from public, anon, authenticated;

grant select on table public.project_skills to authenticated;
grant select on table public.project_milestones to authenticated;
grant select on table public.project_tasks to authenticated;
grant select on table public.project_files to authenticated;
grant select on table public.project_events to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Conversation plumbing
-- ---------------------------------------------------------------------------

-- One group conversation per project. The 12100 migration already allowed
-- kind = 'group' when project_id is set; this makes the pairing unique.
create unique index conversations_project_group_idx
  on public.conversations (project_id)
  where kind = 'group';

create or replace function public.ensure_project_conversation(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid;
  v_name text;
  v_owner uuid;
begin
  select c.id into v_conversation_id
  from public.conversations c
  where c.project_id = p_project_id
    and c.kind = 'group';

  if v_conversation_id is null then
    select p.name, p.owner_id into v_name, v_owner
    from public.projects p
    where p.id = p_project_id;

    if v_name is null then
      raise exception using errcode = 'P0002', message = 'Project not found';
    end if;

    insert into public.conversations (kind, project_id, title, created_by)
    values ('group', p_project_id, v_name, v_owner)
    returning id into v_conversation_id;
  end if;

  -- Keep the roster in step with project membership.
  insert into public.conversation_members (conversation_id, student_id)
  select v_conversation_id, pm.student_id
  from public.project_members pm
  where pm.project_id = p_project_id
  on conflict (conversation_id, student_id) do nothing;

  return v_conversation_id;
end;
$$;

revoke all on function public.ensure_project_conversation(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Notifications
-- ---------------------------------------------------------------------------

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
    'new_message',
    'activity_reviewed',
    'project_added',
    'project_task_assigned'
  ));

-- ---------------------------------------------------------------------------
-- 5. Room lifecycle
-- ---------------------------------------------------------------------------

create or replace function public.create_project(
  p_name text,
  p_description text default null,
  p_skill_ids uuid[] default '{}',
  p_member_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_id uuid;
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_description text;
  v_member_id uuid;
  v_member_name text;
  v_owner_name text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if v_name = '' then
    raise exception using errcode = '22023', message = 'A project name is required';
  end if;

  if char_length(v_name) > 120 then
    raise exception using errcode = '22023',
      message = 'Project names must be 120 characters or fewer';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_skill_ids, '{}'::uuid[])) as wanted(skill_id)
    where not exists (select 1 from public.skills s where s.id = wanted.skill_id)
  ) then
    raise exception using errcode = '22023',
      message = 'One or more selected skills do not exist';
  end if;

  v_description := nullif(pg_catalog.btrim(coalesce(p_description, '')), '');

  insert into public.projects (name, description, owner_id)
  values (v_name, v_description, v_user_id)
  returning id into v_project_id;

  insert into public.project_members (project_id, student_id, role)
  values (v_project_id, v_user_id, 'Owner');

  insert into public.project_skills (project_id, skill_id)
  select v_project_id, distinct_skills.skill_id
  from (
    select distinct skill_id
    from unnest(coalesce(p_skill_ids, '{}'::uuid[])) as t(skill_id)
  ) distinct_skills;

  for v_member_id in
    select distinct picked.student_id
    from unnest(coalesce(p_member_ids, '{}'::uuid[])) as picked(student_id)
    where picked.student_id <> v_user_id
      and exists (select 1 from public.profiles p where p.id = picked.student_id)
  loop
    insert into public.project_members (project_id, student_id, role)
    values (v_project_id, v_member_id, 'Contributor')
    on conflict (project_id, student_id) do nothing;
  end loop;

  perform public.ensure_project_conversation(v_project_id);

  insert into public.project_events (project_id, actor_id, event_type, summary)
  values (v_project_id, v_user_id, 'project_created', 'created the project room');

  select coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'A student')
  into v_owner_name
  from public.profiles p
  where p.id = v_user_id;

  -- Everyone except the owner was added by someone else.
  for v_member_id in
    select pm.student_id
    from public.project_members pm
    where pm.project_id = v_project_id
      and pm.student_id <> v_user_id
  loop
    select coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'A teammate')
    into v_member_name
    from public.profiles p
    where p.id = v_member_id;

    insert into public.project_events (project_id, actor_id, event_type, summary)
    values (
      v_project_id,
      v_user_id,
      'member_joined',
      'added ' || v_member_name || ' to the team'
    );

    insert into public.notifications (
      recipient_id, actor_id, notification_type, title, body, entity_id
    ) values (
      v_member_id,
      v_user_id,
      'project_added',
      'Added to a project room',
      v_owner_name || ' added you to "' || v_name || '".',
      v_project_id
    );
  end loop;

  return v_project_id;
end;
$$;

create or replace function public.add_project_member(
  p_project_id uuid,
  p_student_id uuid,
  p_role text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_name text;
  v_actor_name text;
  v_target_name text;
  v_role text := nullif(pg_catalog.btrim(coalesce(p_role, '')), '');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if not public.is_project_owner(p_project_id) then
    raise exception using errcode = '42501',
      message = 'Only the project owner can add members';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_student_id) then
    raise exception using errcode = 'P0002', message = 'That student does not exist';
  end if;

  if exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id
      and pm.student_id = p_student_id
  ) then
    raise exception using errcode = '23505',
      message = 'That student is already on this project';
  end if;

  insert into public.project_members (project_id, student_id, role)
  values (p_project_id, p_student_id, coalesce(v_role, 'Contributor'));

  perform public.ensure_project_conversation(p_project_id);

  select p.name into v_project_name from public.projects p where p.id = p_project_id;

  select coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'A student')
  into v_actor_name
  from public.profiles p
  where p.id = v_user_id;

  select coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'A student')
  into v_target_name
  from public.profiles p
  where p.id = p_student_id;

  insert into public.project_events (project_id, actor_id, event_type, summary)
  values (p_project_id, v_user_id, 'member_joined', 'added ' || v_target_name || ' to the team');

  insert into public.notifications (
    recipient_id, actor_id, notification_type, title, body, entity_id
  ) values (
    p_student_id,
    v_user_id,
    'project_added',
    'Added to a project room',
    v_actor_name || ' added you to "' || v_project_name || '".',
    p_project_id
  );
end;
$$;

create or replace function public.remove_project_member(
  p_project_id uuid,
  p_student_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_target_name text;
  v_is_self boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select p.owner_id into v_owner_id from public.projects p where p.id = p_project_id;

  if v_owner_id is null then
    raise exception using errcode = 'P0002', message = 'Project not found';
  end if;

  v_is_self := p_student_id = v_user_id;

  if not v_is_self and v_owner_id <> v_user_id then
    raise exception using errcode = '42501',
      message = 'Only the project owner can remove another member';
  end if;

  if p_student_id = v_owner_id then
    raise exception using errcode = '42501',
      message = 'The owner cannot leave. Delete the project instead.';
  end if;

  select coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'A student')
  into v_target_name
  from public.profiles p
  where p.id = p_student_id;

  delete from public.project_members pm
  where pm.project_id = p_project_id
    and pm.student_id = p_student_id;

  delete from public.conversation_members cm
  using public.conversations c
  where c.id = cm.conversation_id
    and c.project_id = p_project_id
    and c.kind = 'group'
    and cm.student_id = p_student_id;

  insert into public.project_events (project_id, actor_id, event_type, summary)
  values (
    p_project_id,
    v_user_id,
    case when v_is_self then 'member_left' else 'member_removed' end,
    case when v_is_self
      then 'left the project'
      else 'removed ' || v_target_name || ' from the team'
    end
  );
end;
$$;

create or replace function public.set_project_member_role(
  p_project_id uuid,
  p_student_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := nullif(pg_catalog.btrim(coalesce(p_role, '')), '');
  v_target_name text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if not public.is_project_owner(p_project_id) then
    raise exception using errcode = '42501',
      message = 'Only the project owner can change roles';
  end if;

  if not exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id and pm.student_id = p_student_id
  ) then
    raise exception using errcode = 'P0002', message = 'That student is not on this project';
  end if;

  update public.project_members pm
  set role = v_role
  where pm.project_id = p_project_id
    and pm.student_id = p_student_id;

  select coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'A student')
  into v_target_name
  from public.profiles p
  where p.id = p_student_id;

  insert into public.project_events (project_id, actor_id, event_type, summary)
  values (
    p_project_id,
    v_user_id,
    'role_changed',
    'set ' || v_target_name || '''s role to ' || coalesce(v_role, 'none')
  );
end;
$$;

create or replace function public.set_project_status(p_project_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if not public.is_project_owner(p_project_id) then
    raise exception using errcode = '42501',
      message = 'Only the project owner can change the project status';
  end if;

  if p_status not in ('planning', 'active', 'completed', 'archived') then
    raise exception using errcode = '22023', message = 'Unknown project status';
  end if;

  update public.projects p
  set status = p_status
  where p.id = p_project_id;

  insert into public.project_events (project_id, actor_id, event_type, summary)
  values (p_project_id, v_user_id, 'status_changed', 'moved the project to ' || p_status);
end;
$$;

create or replace function public.delete_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if not public.is_project_owner(p_project_id) then
    raise exception using errcode = '42501',
      message = 'Only the project owner can delete the project';
  end if;

  delete from public.projects p where p.id = p_project_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Milestones, tasks and shared files
-- ---------------------------------------------------------------------------

create or replace function public.create_project_milestone(
  p_project_id uuid,
  p_title text,
  p_description text default null,
  p_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_milestone_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if not public.is_project_member(p_project_id) then
    raise exception using errcode = '42501',
      message = 'Only project members can add milestones';
  end if;

  if v_title = '' then
    raise exception using errcode = '22023', message = 'A milestone title is required';
  end if;

  if char_length(v_title) > 120 then
    raise exception using errcode = '22023',
      message = 'Milestone titles must be 120 characters or fewer';
  end if;

  insert into public.project_milestones (
    project_id, title, description, due_date, position, created_by
  ) values (
    p_project_id,
    v_title,
    nullif(pg_catalog.btrim(coalesce(p_description, '')), ''),
    p_due_date,
    coalesce((
      select max(m.position) + 1
      from public.project_milestones m
      where m.project_id = p_project_id
    ), 0),
    v_user_id
  )
  returning id into v_milestone_id;

  insert into public.project_events (project_id, actor_id, event_type, summary)
  values (p_project_id, v_user_id, 'milestone_created', 'added the milestone "' || v_title || '"');

  return v_milestone_id;
end;
$$;

create or replace function public.complete_project_milestone(p_milestone_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_id uuid;
  v_title text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select m.project_id, m.title into v_project_id, v_title
  from public.project_milestones m
  where m.id = p_milestone_id;

  if v_project_id is null then
    raise exception using errcode = 'P0002', message = 'Milestone not found';
  end if;

  if not public.is_project_member(v_project_id) then
    raise exception using errcode = '42501',
      message = 'Only project members can complete milestones';
  end if;

  update public.project_milestones m
  set status = 'completed',
      completed_at = coalesce(m.completed_at, now())
  where m.id = p_milestone_id
    and m.status <> 'completed';

  if found then
    insert into public.project_events (project_id, actor_id, event_type, summary)
    values (v_project_id, v_user_id, 'milestone_completed',
      'completed the milestone "' || v_title || '"');
  end if;
end;
$$;

create or replace function public.create_project_task(
  p_project_id uuid,
  p_title text,
  p_description text default null,
  p_assigned_to uuid default null,
  p_milestone_id uuid default null,
  p_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_task_id uuid;
  v_assignee_name text;
  v_actor_name text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if not public.is_project_member(p_project_id) then
    raise exception using errcode = '42501',
      message = 'Only project members can add tasks';
  end if;

  if v_title = '' then
    raise exception using errcode = '22023', message = 'A task title is required';
  end if;

  if char_length(v_title) > 160 then
    raise exception using errcode = '22023',
      message = 'Task titles must be 160 characters or fewer';
  end if;

  if p_milestone_id is not null and not exists (
    select 1
    from public.project_milestones m
    where m.id = p_milestone_id
      and m.project_id = p_project_id
  ) then
    raise exception using errcode = '22023',
      message = 'That milestone belongs to a different project';
  end if;

  if p_assigned_to is not null and not exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.student_id = p_assigned_to
  ) then
    raise exception using errcode = '22023',
      message = 'Tasks can only be assigned to project members';
  end if;

  insert into public.project_tasks (
    project_id, milestone_id, title, description, assigned_to, due_date, created_by
  ) values (
    p_project_id,
    p_milestone_id,
    v_title,
    nullif(pg_catalog.btrim(coalesce(p_description, '')), ''),
    p_assigned_to,
    p_due_date,
    v_user_id
  )
  returning id into v_task_id;

  insert into public.project_events (project_id, actor_id, event_type, summary)
  values (p_project_id, v_user_id, 'task_created', 'added the task "' || v_title || '"');

  if p_assigned_to is not null and p_assigned_to <> v_user_id then
    select coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'A teammate')
    into v_actor_name
    from public.profiles p where p.id = v_user_id;

    select coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'A teammate')
    into v_assignee_name
    from public.profiles p where p.id = p_assigned_to;

    insert into public.project_events (project_id, actor_id, event_type, summary)
    values (p_project_id, v_user_id, 'task_assigned',
      'assigned "' || v_title || '" to ' || v_assignee_name);

    insert into public.notifications (
      recipient_id, actor_id, notification_type, title, body, entity_id
    ) values (
      p_assigned_to,
      v_user_id,
      'project_task_assigned',
      'New project task',
      v_actor_name || ' assigned you "' || v_title || '".',
      v_task_id
    );
  end if;

  return v_task_id;
end;
$$;

create or replace function public.assign_project_task(
  p_task_id uuid,
  p_student_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_id uuid;
  v_title text;
  v_assignee_name text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select t.project_id, t.title into v_project_id, v_title
  from public.project_tasks t
  where t.id = p_task_id;

  if v_project_id is null then
    raise exception using errcode = 'P0002', message = 'Task not found';
  end if;

  if not public.is_project_member(v_project_id) then
    raise exception using errcode = '42501',
      message = 'Only project members can assign tasks';
  end if;

  if not exists (
    select 1 from public.project_members pm
    where pm.project_id = v_project_id and pm.student_id = p_student_id
  ) then
    raise exception using errcode = '22023',
      message = 'Tasks can only be assigned to project members';
  end if;

  update public.project_tasks t
  set assigned_to = p_student_id
  where t.id = p_task_id;

  select coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'A teammate')
  into v_assignee_name
  from public.profiles p where p.id = p_student_id;

  insert into public.project_events (project_id, actor_id, event_type, summary)
  values (v_project_id, v_user_id, 'task_assigned',
    'assigned "' || v_title || '" to ' || v_assignee_name);

  if p_student_id <> v_user_id then
    insert into public.notifications (
      recipient_id, actor_id, notification_type, title, body, entity_id
    ) values (
      p_student_id,
      v_user_id,
      'project_task_assigned',
      'New project task',
      'You were assigned "' || v_title || '".',
      p_task_id
    );
  end if;
end;
$$;

create or replace function public.set_project_task_status(
  p_task_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_id uuid;
  v_owner_id uuid;
  v_assigned_to uuid;
  v_created_by uuid;
  v_title text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if p_status not in ('todo', 'in_progress', 'blocked', 'done') then
    raise exception using errcode = '22023', message = 'Unknown task status';
  end if;

  select t.project_id, t.assigned_to, t.created_by, t.title
  into v_project_id, v_assigned_to, v_created_by, v_title
  from public.project_tasks t
  where t.id = p_task_id;

  if v_project_id is null then
    raise exception using errcode = 'P0002', message = 'Task not found';
  end if;

  select p.owner_id into v_owner_id from public.projects p where p.id = v_project_id;

  if not public.is_project_member(v_project_id) then
    raise exception using errcode = '42501',
      message = 'Only project members can update tasks';
  end if;

  -- Moving someone else's task is a coordination decision, so it is limited to
  -- the owner, the task creator and the assignee.
  if v_user_id <> v_owner_id
     and v_user_id <> v_created_by
     and v_user_id is distinct from v_assigned_to then
    raise exception using errcode = '42501',
      message = 'Only the owner, the creator or the assignee can move this task';
  end if;

  update public.project_tasks t
  set status = p_status,
      completed_at = case when p_status = 'done' then coalesce(t.completed_at, now()) else null end
  where t.id = p_task_id;

  if p_status = 'done' then
    insert into public.project_events (project_id, actor_id, event_type, summary)
    values (v_project_id, v_user_id, 'task_completed', 'completed the task "' || v_title || '"');
  end if;
end;
$$;

create or replace function public.delete_project_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_id uuid;
  v_owner_id uuid;
  v_created_by uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select t.project_id, t.created_by into v_project_id, v_created_by
  from public.project_tasks t
  where t.id = p_task_id;

  if v_project_id is null then
    raise exception using errcode = 'P0002', message = 'Task not found';
  end if;

  select p.owner_id into v_owner_id from public.projects p where p.id = v_project_id;

  if v_user_id <> v_owner_id and v_user_id <> v_created_by then
    raise exception using errcode = '42501',
      message = 'Only the owner or the task creator can delete a task';
  end if;

  delete from public.project_tasks t where t.id = p_task_id;
end;
$$;

create or replace function public.add_project_file(
  p_project_id uuid,
  p_label text,
  p_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_label text := pg_catalog.btrim(coalesce(p_label, ''));
  v_url text := pg_catalog.btrim(coalesce(p_url, ''));
  v_file_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if not public.is_project_member(p_project_id) then
    raise exception using errcode = '42501',
      message = 'Only project members can share files';
  end if;

  if v_label = '' then
    raise exception using errcode = '22023', message = 'A file label is required';
  end if;

  if v_url !~* '^https?://' then
    raise exception using errcode = '22023',
      message = 'Shared files must be http or https links';
  end if;

  insert into public.project_files (project_id, label, url, added_by)
  values (p_project_id, v_label, v_url, v_user_id)
  returning id into v_file_id;

  insert into public.project_events (project_id, actor_id, event_type, summary)
  values (p_project_id, v_user_id, 'file_shared', 'shared "' || v_label || '"');

  return v_file_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Reads
-- ---------------------------------------------------------------------------

create or replace function public.get_my_projects()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_projects jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  with visible as (
    select p.*
    from public.projects p
    where p.owner_id = v_user_id
      or exists (
        select 1 from public.project_members pm
        where pm.project_id = p.id
          and pm.student_id = v_user_id
      )
  ),
  counts as (
    select
      v.id,
      (select count(*) from public.project_tasks t where t.project_id = v.id)::int as task_total,
      (select count(*) from public.project_tasks t where t.project_id = v.id and t.status = 'done')::int as task_done,
      (select count(*) from public.project_milestones m where m.project_id = v.id)::int as milestone_total,
      (select count(*) from public.project_milestones m where m.project_id = v.id and m.status = 'completed')::int as milestone_done
    from visible v
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'project_id', v.id,
        'name', v.name,
        'description', v.description,
        'status', v.status,
        'owner_id', v.owner_id,
        'owner_name', coalesce(nullif(pg_catalog.btrim(op.full_name), ''), 'A student'),
        'is_owner', v.owner_id = v_user_id,
        'member_count', (select count(*) from public.project_members pm where pm.project_id = v.id),
        'members', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'student_id', pm.student_id,
              'full_name', coalesce(nullif(pg_catalog.btrim(mp.full_name), ''), 'Student'),
              'role', pm.role
            )
            order by pm.joined_at
          )
          from public.project_members pm
          join public.profiles mp on mp.id = pm.student_id
          where pm.project_id = v.id
        ), '[]'::jsonb),
        'skills', coalesce((
          select jsonb_agg(
            jsonb_build_object('skill_id', ps.skill_id, 'name', s.name)
            order by s.name
          )
          from public.project_skills ps
          join public.skills s on s.id = ps.skill_id
          where ps.project_id = v.id
        ), '[]'::jsonb),
        'task_total', c.task_total,
        'task_done', c.task_done,
        'milestone_total', c.milestone_total,
        'milestone_done', c.milestone_done,
        'progress', case
          when c.task_total + c.milestone_total = 0 then 0
          else round(
            100.0 * (c.task_done + c.milestone_done)
            / (c.task_total + c.milestone_total)
          )::int
        end,
        'next_milestone', (
          select jsonb_build_object('title', m.title, 'due_date', m.due_date)
          from public.project_milestones m
          where m.project_id = v.id
            and m.status <> 'completed'
          order by m.due_date nulls last, m.position
          limit 1
        ),
        'conversation_id', (
          select c2.id from public.conversations c2
          where c2.project_id = v.id and c2.kind = 'group'
        ),
        'updated_at', v.updated_at
      )
      order by v.updated_at desc
    ),
    '[]'::jsonb
  )
  into v_projects
  from visible v
  join public.profiles op on op.id = v.owner_id
  join counts c on c.id = v.id;

  return v_projects;
end;
$$;

create or replace function public.get_project_detail(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_detail jsonb;
  v_task_total int;
  v_task_done int;
  v_milestone_total int;
  v_milestone_done int;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if not public.is_project_member(p_project_id) then
    raise exception using errcode = '42501',
      message = 'You are not a member of this project';
  end if;

  select
    count(*) filter (where true),
    count(*) filter (where t.status = 'done')
  into v_task_total, v_task_done
  from public.project_tasks t
  where t.project_id = p_project_id;

  select
    count(*) filter (where true),
    count(*) filter (where m.status = 'completed')
  into v_milestone_total, v_milestone_done
  from public.project_milestones m
  where m.project_id = p_project_id;

  select jsonb_build_object(
    'project', (
      select jsonb_build_object(
        'project_id', p.id,
        'name', p.name,
        'description', p.description,
        'status', p.status,
        'owner_id', p.owner_id,
        'owner_name', coalesce(nullif(pg_catalog.btrim(op.full_name), ''), 'A student'),
        'is_owner', p.owner_id = v_user_id,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      )
      from public.projects p
      join public.profiles op on op.id = p.owner_id
      where p.id = p_project_id
    ),
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'student_id', pm.student_id,
          'full_name', coalesce(nullif(pg_catalog.btrim(mp.full_name), ''), 'Student'),
          'course', mp.course,
          'role', pm.role,
          'joined_at', pm.joined_at
        )
        order by pm.joined_at
      )
      from public.project_members pm
      join public.profiles mp on mp.id = pm.student_id
      where pm.project_id = p_project_id
    ), '[]'::jsonb),
    'skills', coalesce((
      select jsonb_agg(
        jsonb_build_object('skill_id', ps.skill_id, 'name', s.name, 'category', s.category)
        order by s.name
      )
      from public.project_skills ps
      join public.skills s on s.id = ps.skill_id
      where ps.project_id = p_project_id
    ), '[]'::jsonb),
    'milestones', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'milestone_id', m.id,
          'title', m.title,
          'description', m.description,
          'due_date', m.due_date,
          'status', m.status,
          'completed_at', m.completed_at,
          'task_total', (select count(*) from public.project_tasks t where t.milestone_id = m.id),
          'task_done', (select count(*) from public.project_tasks t where t.milestone_id = m.id and t.status = 'done')
        )
        order by m.status = 'completed', m.due_date nulls last, m.position
      )
      from public.project_milestones m
      where m.project_id = p_project_id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'task_id', t.id,
          'title', t.title,
          'description', t.description,
          'status', t.status,
          'due_date', t.due_date,
          'milestone_id', t.milestone_id,
          'assigned_to', t.assigned_to,
          'assigned_to_name', (
            select coalesce(nullif(pg_catalog.btrim(ap.full_name), ''), 'Student')
            from public.profiles ap where ap.id = t.assigned_to
          ),
          'created_by', t.created_by,
          'completed_at', t.completed_at
        )
        order by t.status = 'done', t.due_date nulls last, t.created_at
      )
      from public.project_tasks t
      where t.project_id = p_project_id
    ), '[]'::jsonb),
    'files', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'file_id', f.id,
          'label', f.label,
          'url', f.url,
          'added_by_name', coalesce(nullif(pg_catalog.btrim(fp.full_name), ''), 'Student'),
          'created_at', f.created_at
        )
        order by f.created_at desc
      )
      from public.project_files f
      left join public.profiles fp on fp.id = f.added_by
      where f.project_id = p_project_id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'event_id', e.id,
          'event_type', e.event_type,
          'summary', e.summary,
          'actor_name', coalesce(nullif(pg_catalog.btrim(ap.full_name), ''), 'A student'),
          'created_at', e.created_at
        )
        order by e.created_at desc
      )
      from public.project_events e
      left join public.profiles ap on ap.id = e.actor_id
      where e.project_id = p_project_id
    ), '[]'::jsonb),
    'progress', jsonb_build_object(
      'task_total', v_task_total,
      'task_done', v_task_done,
      'milestone_total', v_milestone_total,
      'milestone_done', v_milestone_done,
      'percent', case
        when v_task_total + v_milestone_total = 0 then 0
        else round(100.0 * (v_task_done + v_milestone_done)
          / (v_task_total + v_milestone_total))::int
      end
    ),
    'conversation_id', (
      select c.id from public.conversations c
      where c.project_id = p_project_id and c.kind = 'group'
    )
  )
  into v_detail;

  return v_detail;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Skill-to-project matching (features.md 3.4)
-- ---------------------------------------------------------------------------

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
    where not exists (select 1 from covered c where c.skill_id = ps.skill_id)
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
        'student_id', row.student_id,
        'full_name', row.full_name,
        'course', row.course,
        'year_level', row.year_level,
        'avatar_url', row.avatar_url,
        'score', row.score,
        'covered_count', row.covered_count,
        'covered_skills', row.covered_skills
      )
      order by row.score desc, row.full_name
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
  ) row;

  return v_recommendations;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------

revoke all on function public.is_project_member(uuid) from public, anon, authenticated;
revoke all on function public.is_project_owner(uuid) from public, anon, authenticated;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_project_owner(uuid) to authenticated;

revoke all on function public.create_project(text, text, uuid[], uuid[])
  from public, anon, authenticated;
revoke all on function public.add_project_member(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.remove_project_member(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.set_project_member_role(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.set_project_status(uuid, text)
  from public, anon, authenticated;
revoke all on function public.delete_project(uuid)
  from public, anon, authenticated;
revoke all on function public.create_project_milestone(uuid, text, text, date)
  from public, anon, authenticated;
revoke all on function public.complete_project_milestone(uuid)
  from public, anon, authenticated;
revoke all on function public.create_project_task(uuid, text, text, uuid, uuid, date)
  from public, anon, authenticated;
revoke all on function public.assign_project_task(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.set_project_task_status(uuid, text)
  from public, anon, authenticated;
revoke all on function public.delete_project_task(uuid)
  from public, anon, authenticated;
revoke all on function public.add_project_file(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.get_my_projects()
  from public, anon, authenticated;
revoke all on function public.get_project_detail(uuid)
  from public, anon, authenticated;
revoke all on function public.get_project_team_recommendations(uuid)
  from public, anon, authenticated;

grant execute on function public.create_project(text, text, uuid[], uuid[]) to authenticated;
grant execute on function public.add_project_member(uuid, uuid, text) to authenticated;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;
grant execute on function public.set_project_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.set_project_status(uuid, text) to authenticated;
grant execute on function public.delete_project(uuid) to authenticated;
grant execute on function public.create_project_milestone(uuid, text, text, date) to authenticated;
grant execute on function public.complete_project_milestone(uuid) to authenticated;
grant execute on function public.create_project_task(uuid, text, text, uuid, uuid, date) to authenticated;
grant execute on function public.assign_project_task(uuid, uuid) to authenticated;
grant execute on function public.set_project_task_status(uuid, text) to authenticated;
grant execute on function public.delete_project_task(uuid) to authenticated;
grant execute on function public.add_project_file(uuid, text, text) to authenticated;
grant execute on function public.get_my_projects() to authenticated;
grant execute on function public.get_project_detail(uuid) to authenticated;
grant execute on function public.get_project_team_recommendations(uuid) to authenticated;
