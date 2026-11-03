-- Fix two defects in the chat schema introduced by 20261017122100.
--
-- 1. conversation_members_select_member sub-queried conversation_members from
--    within conversation_members' own policy. Row Level Security re-applies to
--    that sub-query, so every read failed with
--      42P17 infinite recursion detected in policy for relation "conversation_members"
--    which also broke the messages policies, because those check membership by
--    reading conversation_members.
--
--    Membership is now resolved through is_conversation_member(), a SECURITY
--    DEFINER helper whose read is not subject to RLS, so there is no recursion.
--
-- 2. get_my_conversations ordered by coalesce(last_message_at, updated_at), but
--    the row sub-query never selected updated_at, so it failed with
--      42703 column "row"."updated_at" does not exist
--    and returned no conversations at all.

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.student_id = auth.uid()
  );
$$;

drop policy if exists conversations_select_member on public.conversations;
drop policy if exists conversation_members_select_member on public.conversation_members;
drop policy if exists messages_select_member on public.messages;
drop policy if exists messages_insert_own_member on public.messages;

create policy conversations_select_member
on public.conversations for select to authenticated
using (public.is_conversation_member(conversations.id));

create policy conversation_members_select_member
on public.conversation_members for select to authenticated
using (public.is_conversation_member(conversation_members.conversation_id));

create policy messages_select_member
on public.messages for select to authenticated
using (public.is_conversation_member(messages.conversation_id));

create policy messages_insert_own_member
on public.messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and public.is_conversation_member(messages.conversation_id)
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
            'name', coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'SkillForge student')
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

revoke all on function public.is_conversation_member(uuid)
  from public, anon, authenticated;
grant execute on function public.is_conversation_member(uuid) to authenticated;

revoke all on function public.get_my_conversations()
  from public, anon, authenticated;
grant execute on function public.get_my_conversations() to authenticated;