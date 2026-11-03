-- Fix: restore the upsert path for self-service profile writes.
--
-- PostgREST implements `.upsert()` as
--   INSERT INTO profiles (<payload columns>)
--   ON CONFLICT (id) DO UPDATE SET <every payload column>
-- so the DO UPDATE clause needs UPDATE privilege on ALL payload columns --
-- including `id`, which is in the payload.
--
-- 20261017120200_admin_roles.sql revoked the table-level UPDATE grant and
-- re-granted it per column, but omitted `id`. That made ensureProfile()
-- (services/auth.ts) and saveStudentProfile() fail with
--   42501 permission denied for table profiles
-- which in turn broke registration and, through the student_skills foreign
-- key, made "add a skill" fail for every user.
--
-- `role` stays unwritable: it is still absent from the column list.

grant update (id, full_name, course, year_level, bio, avatar_url)
  on table public.profiles to authenticated;

-- Granting UPDATE(id) is safe under the existing RLS, but pin it shut anyway so
-- no policy can ever be used to repoint a profile at another account.
create or replace function public.prevent_profile_identity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception using errcode = '42501',
      message = 'A profile id cannot be changed';
  end if;

  return new;
end;
$$;

create trigger profiles_prevent_identity_change
before update on public.profiles
for each row execute function public.prevent_profile_identity_change();

revoke all on function public.prevent_profile_identity_change()
  from public, anon, authenticated;