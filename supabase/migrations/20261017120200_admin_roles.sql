-- Role-based authorization for administrators and moderators.
--
-- features.md section 13 requires administrative actions to follow role-based
-- authorization. No role existed anywhere in the schema, and `skills` /
-- `achievements` had SELECT-only policies, so the skill catalog could not be
-- managed through the API at all.
--
-- Self-escalation guard: Supabase grants table-level INSERT/UPDATE on public
-- profiles by default, so simply adding a `role` column would let any student
-- promote themselves by calling PostgREST directly with the public anon key.
-- The column-level grants below remove `role` from what an authenticated user
-- can write, and role assignment goes through a moderator-only RPC.

alter table public.profiles
  add column if not exists role text not null default 'student';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('student', 'moderator', 'admin'));
  end if;
end;
$$;

create index if not exists idx_profiles_role
  on public.profiles (role);

-- Lock down self-service writes on profiles before any moderator policy is
-- added. Students keep full control of their own editable fields.
revoke insert, update on table public.profiles from anon, authenticated;
grant insert (id, full_name, course, year_level, bio, avatar_url)
  on table public.profiles to authenticated;
grant update (full_name, course, year_level, bio, avatar_url)
  on table public.profiles to authenticated;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = (select auth.uid())),
    'student'
  );
$$;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('moderator', 'admin'), false);
$$;

create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text;
  v_target_role text;
  v_profile public.profiles;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if p_role is null or p_role not in ('student', 'moderator', 'admin') then
    raise exception using errcode = '22023', message = 'Unknown platform role';
  end if;

  v_caller_role := public.current_user_role();

  if v_caller_role not in ('moderator', 'admin') then
    raise exception using errcode = '42501', message = 'Only moderators can change platform roles';
  end if;

  if p_role = 'admin' and v_caller_role <> 'admin' then
    raise exception using errcode = '42501', message = 'Only an admin can grant the admin role';
  end if;

  select * into v_profile
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Student was not found';
  end if;

  v_target_role := v_profile.role;

  if v_target_role = 'admin' and v_caller_role <> 'admin' then
    raise exception using errcode = '42501', message = 'Only an admin can change an admin account';
  end if;

  update public.profiles p
  set role = p_role
  where p.id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.current_user_role()
  from public, anon, authenticated;
grant execute on function public.current_user_role() to authenticated;

revoke all on function public.is_moderator()
  from public, anon, authenticated;
grant execute on function public.is_moderator() to authenticated;

revoke all on function public.set_user_role(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- Skill catalog administration.
create policy skills_insert_moderator
on public.skills for insert to authenticated
with check (public.is_moderator());

create policy skills_update_moderator
on public.skills for update to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy skills_delete_moderator
on public.skills for delete to authenticated
using (public.is_moderator());

-- Achievements and badges administration.
create policy achievements_insert_moderator
on public.achievements for insert to authenticated
with check (public.is_moderator());

create policy achievements_update_moderator
on public.achievements for update to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy achievements_delete_moderator
on public.achievements for delete to authenticated
using (public.is_moderator());

-- Skill challenge administration. The existing *_own policies already let a
-- student manage challenges they authored, and RLS policies are OR'd, so these
-- add moderator reach without duplicating the creator rule.
create policy skill_challenges_insert_moderator
on public.skill_challenges for insert to authenticated
with check (public.is_moderator());

create policy skill_challenges_update_moderator
on public.skill_challenges for update to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy skill_challenges_delete_moderator
on public.skill_challenges for delete to authenticated
using (public.is_moderator());

-- Student management. Moderators may correct another student's profile fields.
-- Note that the column-level grants above still apply, so this policy cannot be
-- used to change `role`; that stays behind set_user_role.
create policy profiles_update_moderator
on public.profiles for update to authenticated
using (public.is_moderator())
with check (public.is_moderator());

-- Deleting a profile cascades to that student's sessions, submissions,
-- endorsements and achievements, so it is restricted to admins.
create policy profiles_delete_admin
on public.profiles for delete to authenticated
using (public.current_user_role() = 'admin');

-- Bootstrap the first admin.
--
-- Every profile defaults to 'student' and set_user_role refuses callers who are
-- not already moderators, so without this there is no way to create the first
-- admin at all. This runs as the migration owner, which is why it is not
-- subject to the column-level grants above. It is idempotent and safe to re-run,
-- and it no-ops if the account has not registered yet.
do $$
declare
  v_bootstrap_email constant text := 'dankirvymanongsong@gmail.com';
begin
  update public.profiles p
  set role = 'admin'
  from auth.users u
  where u.id = p.id
    and lower(u.email) = v_bootstrap_email;

  if not found then
    raise notice
      'Admin bootstrap skipped: no profile for %. Register that account, then re-run this statement.',
      v_bootstrap_email;
  end if;
end;
$$;