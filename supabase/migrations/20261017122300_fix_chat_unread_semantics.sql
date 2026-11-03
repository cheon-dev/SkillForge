-- Correct unread semantics in send_message().
--
-- send_message() advanced the sender's last_read_at, so sending a reply cleared
-- the unread badge for every message that had arrived earlier. Unread could
-- therefore never accumulate: in a two-message exchange the second sender ended
-- up with 0 unread even though they had never seen the first message.
--
-- Unread now means "messages from other people since you last opened this
-- conversation", advanced only by mark_conversation_read(). The live conversation
-- list is the thing that shows the badge, and it clears when the thread opens.
create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text,
  p_attachment_url text default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_body text := pg_catalog.btrim(coalesce(p_body, ''));
  v_message public.messages;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if v_body = '' then
    raise exception using errcode = '22023', message = 'A message cannot be empty';
  end if;

  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.student_id = v_caller_id
  ) then
    raise exception using errcode = '42501',
      message = 'You are not a member of this conversation';
  end if;

  insert into public.messages (conversation_id, sender_id, body, attachment_url)
  values (
    p_conversation_id, v_caller_id, v_body,
    nullif(pg_catalog.btrim(coalesce(p_attachment_url, '')), '')
  )
  returning * into v_message;

  update public.conversations
  set updated_at = pg_catalog.now()
  where id = p_conversation_id;

  -- Deliberately NOT advancing last_read_at here. Unread then means "messages
  -- from other people since you last opened this conversation", which stays
  -- predictable. Marking the sender read on send used to wipe the unread count
  -- for anything that arrived earlier, so it could never accumulate.

  return v_message;
end;
$$;

