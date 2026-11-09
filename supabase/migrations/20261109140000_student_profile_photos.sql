-- Student profile photos are publicly readable so peers can see them in
-- Discover and chats. Writes remain scoped to the authenticated owner's folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-avatars',
  'student-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "student_avatars_insert_own" on storage.objects;
create policy "student_avatars_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'student-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "student_avatars_update_own" on storage.objects;
create policy "student_avatars_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'student-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'student-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "student_avatars_delete_own" on storage.objects;
create policy "student_avatars_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'student-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.get_my_conversations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_rows jsonb;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  with
  mine as (
    select c.id, c.kind, c.session_id, c.project_id, c.title, c.updated_at
    from public.conversations c
    join public.conversation_members cm
      on cm.conversation_id = c.id and cm.student_id = v_caller_id
  ),
  peers as (
    select
      cm.conversation_id,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'name', coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'SkillForge student'),
            'avatar_url', p.avatar_url
          )
          order by p.full_name
        ), '[]'::jsonb
      ) as members
    from public.conversation_members cm
    join public.profiles p on p.id = cm.student_id
    where cm.student_id <> v_caller_id
      and cm.conversation_id in (select id from mine)
    group by cm.conversation_id
  ),
  last_message as (
    select distinct on (m.conversation_id)
      m.conversation_id, m.id, m.body, m.sender_id, m.created_at
    from public.messages m
    where m.conversation_id in (select id from mine)
    order by m.conversation_id, m.created_at desc
  ),
  unread as (
    select cm.conversation_id, count(*)::int as unread_count
    from public.messages m
    join public.conversation_members cm
      on cm.conversation_id = m.conversation_id
     and cm.student_id = v_caller_id
    where m.conversation_id in (select id from mine)
      and m.sender_id <> v_caller_id
      and m.created_at > cm.last_read_at
    group by cm.conversation_id
  )
  select coalesce(
    jsonb_agg(
      to_jsonb(row)
      order by coalesce(row.last_message_at, row.updated_at) desc, row.conversation_id
    ), '[]'::jsonb
  )
  into v_rows
  from (
    select
      m.id as conversation_id,
      m.kind,
      m.session_id,
      m.project_id,
      m.title,
      m.updated_at,
      coalesce(pr.members, '[]'::jsonb) as members,
      lm.id as last_message_id,
      lm.body as last_message_body,
      lm.sender_id as last_message_sender_id,
      lm.created_at as last_message_at,
      coalesce(u.unread_count, 0)::int as unread_count
    from mine m
    left join peers pr on pr.conversation_id = m.id
    left join last_message lm on lm.conversation_id = m.id
    left join unread u on u.conversation_id = m.id
  ) row;

  return v_rows;
end;
$$;

create or replace function public.get_conversation_messages(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_rows jsonb;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if not public.is_conversation_member(p_conversation_id) then
    raise exception using errcode = '42501',
      message = 'You are not a member of this conversation';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'body', m.body,
        'attachment_url', m.attachment_url,
        'created_at', m.created_at,
        'sender_id', m.sender_id,
        'sender_name', coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'SkillForge student'),
        'sender_avatar_url', p.avatar_url,
        'is_mine', m.sender_id = v_caller_id,
        'seen_by_peer', exists (
          select 1
          from public.conversation_members cm
          where cm.conversation_id = m.conversation_id
            and cm.student_id <> v_caller_id
            and cm.last_read_at >= m.created_at
        )
      )
      order by m.created_at
    ), '[]'::jsonb
  )
  into v_rows
  from public.messages m
  join public.profiles p on p.id = m.sender_id
  where m.conversation_id = p_conversation_id;

  return v_rows;
end;
$$;

revoke all on function public.get_my_conversations()
  from public, anon, authenticated;
grant execute on function public.get_my_conversations() to authenticated;

revoke all on function public.get_conversation_messages(uuid)
  from public, anon, authenticated;
grant execute on function public.get_conversation_messages(uuid) to authenticated;
