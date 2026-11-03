-- Skill evidence / portfolio (features.md §7)
--
-- Students attach proof of practice to a skill they already list on their
-- profile: screenshots, certificates, documents, videos, project links.
-- Evidence is private to the owner (moderators may read for moderation) and
-- contributes to the Skill Passport page.
--
-- Files live in a private Storage bucket. Object paths are always
-- "{student_id}/{uuid}.{ext}", and the Storage policies enforce that prefix,
-- so a student can never write into another student's folder even if they
-- call Storage directly instead of the UI.

create table if not exists public.skill_evidence (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete restrict,
  title text not null,
  description text,
  evidence_type text not null,
  file_path text,
  external_url text,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint skill_evidence_title_check
    check (char_length(btrim(title)) between 1 and 120),
  constraint skill_evidence_description_check
    check (description is null or char_length(description) <= 2000),
  constraint skill_evidence_type_check
    check (evidence_type in ('screenshot', 'certificate', 'document', 'video', 'link', 'project')),
  constraint skill_evidence_source_check
    check (file_path is not null or external_url is not null),
  constraint skill_evidence_path_check
    check (file_path is null or char_length(file_path) <= 1024),
  constraint skill_evidence_url_check
    check (external_url is null or char_length(external_url) <= 2048),
  constraint skill_evidence_mime_check
    check (mime_type is null or char_length(mime_type) <= 255),
  constraint skill_evidence_size_check
    check (file_size is null or (file_size > 0 and file_size <= 26214400))
);

create index if not exists skill_evidence_student_created_idx
  on public.skill_evidence (student_id, created_at desc);

create index if not exists skill_evidence_skill_idx
  on public.skill_evidence (skill_id);

drop trigger if exists skill_evidence_set_updated_at on public.skill_evidence;
create trigger skill_evidence_set_updated_at
before update on public.skill_evidence
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Writes go through the RPCs below. The policies are still defined so that a
-- future read-only grant cannot accidentally expose another student's rows.
alter table public.skill_evidence enable row level security;

drop policy if exists "skill_evidence_select_own_or_moderator" on public.skill_evidence;
create policy "skill_evidence_select_own_or_moderator"
on public.skill_evidence
for select
to authenticated
using (student_id = (select auth.uid()) or public.is_moderator());

drop policy if exists "skill_evidence_insert_own" on public.skill_evidence;
create policy "skill_evidence_insert_own"
on public.skill_evidence
for insert
to authenticated
with check (student_id = (select auth.uid()));

drop policy if exists "skill_evidence_update_own" on public.skill_evidence;
create policy "skill_evidence_update_own"
on public.skill_evidence
for update
to authenticated
using (student_id = (select auth.uid()))
with check (student_id = (select auth.uid()));

drop policy if exists "skill_evidence_delete_own" on public.skill_evidence;
create policy "skill_evidence_delete_own"
on public.skill_evidence
for delete
to authenticated
using (student_id = (select auth.uid()));

revoke all on table public.skill_evidence from anon, authenticated;
grant select on table public.skill_evidence to authenticated;

-- ---------------------------------------------------------------------------
-- Private Storage bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'skill-evidence',
  'skill-evidence',
  false,
  26214400,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "skill_evidence_objects_select" on storage.objects;
create policy "skill_evidence_objects_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'skill-evidence'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_moderator()
  )
);

drop policy if exists "skill_evidence_objects_insert" on storage.objects;
create policy "skill_evidence_objects_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'skill-evidence'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "skill_evidence_objects_update" on storage.objects;
create policy "skill_evidence_objects_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'skill-evidence'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'skill-evidence'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "skill_evidence_objects_delete" on storage.objects;
create policy "skill_evidence_objects_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'skill-evidence'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Add one evidence item. The skill must already be on the student's profile,
-- and a file path must point inside the student's own Storage folder.
create or replace function public.add_skill_evidence(
  p_skill_id uuid,
  p_title text,
  p_description text default null,
  p_evidence_type text default 'document',
  p_file_path text default null,
  p_external_url text default null,
  p_mime_type text default null,
  p_file_size bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_type text := lower(nullif(btrim(coalesce(p_evidence_type, '')), ''));
  v_path text := nullif(btrim(coalesce(p_file_path, '')), '');
  v_url text := nullif(btrim(coalesce(p_external_url, '')), '');
  v_mime text := nullif(btrim(coalesce(p_mime_type, '')), '');
  v_row public.skill_evidence;
begin
  if v_user is null then
    raise exception 'Sign in to add evidence.' using errcode = '42501';
  end if;

  if p_skill_id is null then
    raise exception 'Choose a skill for this evidence.' using errcode = '22023';
  end if;

  if v_title is null then
    raise exception 'Give this evidence a title.' using errcode = '22023';
  end if;

  if char_length(v_title) > 120 then
    raise exception 'Keep the title under 120 characters.' using errcode = '22023';
  end if;

  if v_description is not null and char_length(v_description) > 2000 then
    raise exception 'Keep the description under 2000 characters.' using errcode = '22023';
  end if;

  if v_type is null or v_type not in ('screenshot', 'certificate', 'document', 'video', 'link', 'project') then
    raise exception 'Choose a valid evidence type.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.student_skills
    where student_id = v_user
      and skill_id = p_skill_id
  ) then
    raise exception 'Add this skill to your profile before uploading evidence for it.'
      using errcode = '22023';
  end if;

  if v_path is null and v_url is null then
    raise exception 'Add a file or a link.' using errcode = '22023';
  end if;

  if v_type = 'link' and v_url is null then
    raise exception 'Paste a link for link evidence.' using errcode = '22023';
  end if;

  if v_type not in ('link', 'project') and v_path is null then
    raise exception 'Choose a file to upload.' using errcode = '22023';
  end if;

  if v_path is not null then
    if split_part(v_path, '/', 1) <> v_user::text then
      raise exception 'Evidence files must be stored in your own folder.'
        using errcode = '42501';
    end if;
    if v_path ~ '(^|/)\.\.(/|$)' then
      raise exception 'That file path is not allowed.' using errcode = '22023';
    end if;
    if char_length(v_path) > 1024 then
      raise exception 'That file path is too long.' using errcode = '22023';
    end if;
  end if;

  if v_url is not null then
    if v_url !~* '^https?://[^[:space:]]+$' then
      raise exception 'Links must start with http:// or https://.'
        using errcode = '22023';
    end if;
    if char_length(v_url) > 2048 then
      raise exception 'That link is too long.' using errcode = '22023';
    end if;
  end if;

  if p_file_size is not null then
    if p_file_size <= 0 then
      raise exception 'That file is empty.' using errcode = '22023';
    end if;
    if p_file_size > 26214400 then
      raise exception 'Files must be 25 MB or smaller.' using errcode = '22023';
    end if;
  end if;

  if v_mime is not null and char_length(v_mime) > 255 then
    raise exception 'That file type is not valid.' using errcode = '22023';
  end if;

  insert into public.skill_evidence (
    student_id,
    skill_id,
    title,
    description,
    evidence_type,
    file_path,
    external_url,
    mime_type,
    file_size
  )
  values (
    v_user,
    p_skill_id,
    v_title,
    v_description,
    v_type,
    v_path,
    v_url,
    v_mime,
    p_file_size
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- Delete one of the caller's own evidence rows. The client removes the
-- matching Storage object after this succeeds (best effort).
create or replace function public.delete_skill_evidence(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_file_path text;
begin
  if v_user is null then
    raise exception 'Sign in to remove evidence.' using errcode = '42501';
  end if;

  if p_id is null then
    raise exception 'Evidence not found.' using errcode = 'P0002';
  end if;

  delete from public.skill_evidence
  where id = p_id
    and student_id = v_user
  returning id, file_path into v_id, v_file_path;

  if v_id is null then
    raise exception 'Evidence not found.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('id', v_id, 'file_path', v_file_path);
end;
$$;

-- The caller's own evidence, newest first. The client turns file_path into a
-- short-lived signed URL because the bucket is private.
create or replace function public.get_my_evidence()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_items jsonb;
begin
  if v_user is null then
    raise exception 'Sign in to view your evidence.' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(item order by item.created_at desc),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      e.id,
      e.skill_id,
      s.name as skill_name,
      s.category as skill_category,
      e.title,
      e.description,
      e.evidence_type,
      e.file_path,
      e.external_url,
      e.mime_type,
      e.file_size,
      e.created_at
    from public.skill_evidence e
    join public.skills s on s.id = e.skill_id
    where e.student_id = v_user
  ) item;

  return v_items;
end;
$$;

revoke all on function public.add_skill_evidence(
  uuid, text, text, text, text, text, text, bigint
) from public, anon, authenticated;
grant execute on function public.add_skill_evidence(
  uuid, text, text, text, text, text, text, bigint
) to authenticated;

revoke all on function public.delete_skill_evidence(uuid) from public, anon, authenticated;
grant execute on function public.delete_skill_evidence(uuid) to authenticated;

revoke all on function public.get_my_evidence() from public, anon, authenticated;
grant execute on function public.get_my_evidence() to authenticated;
