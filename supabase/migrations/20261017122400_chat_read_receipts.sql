-- Per-message read receipts for chat.
--
-- conversation_members.last_read_at already recorded how far each member has
-- read, but get_conversation_messages did not expose it, so the UI had no way
-- to show whether a message had been seen.
--
-- Each message now carries `seen_by_peer`: true when another member's
-- last_read_at is at or after that message was created. Only the most recent
-- messages will normally satisfy it, which is the usual read-receipt
-- behaviour rather than a tick on every historical line.

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

revoke all on function public.get_conversation_messages(uuid)
  from public, anon, authenticated;
grant execute on function public.get_conversation_messages(uuid) to authenticated;