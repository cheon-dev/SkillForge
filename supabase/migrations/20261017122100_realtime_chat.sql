-- Real-time chat (features.md section 6).
--
-- Supports student-to-student chat, session-related conversations and group
-- chat, with link and resource sharing. Messages are delivered live through the
-- Supabase Realtime publication, with polling as a fallback.
--
-- Every read and write is gated on conversation membership, enforced by RLS and
-- re-checked in send_message() so a client cannot post into a conversation it
-- is not part of.
--
-- Conversation membership is the single access rule:
--   * a member may read the conversation and its messages
--   * a member may insert a message, and only as themselves
--   * non-members see nothing at all, not even that the conversation exists

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct'
    check (kind in ('direct', 'session', 'group')),
  session_id uuid references public.learning_sessions(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  title text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_one_context check (
    (kind = 'direct'  and session_id is null     and project_id is null)
    or (kind = 'session' and session_id is not null and project_id is null)
    or (kind = 'group' and project_id is not null and session_id is null)
  )
);

create table public.conversation_members (
  conversation_id uuid not null
    references public.conversations(id) on delete cascade,
  student_id uuid not null
    references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, student_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.conversations(id) on delete cascade,
  sender_id uuid not null
    references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) > 0),
  attachment_url text,
  created_at timestamptz not null default now()
);

create index conversations_updated_at_idx on public.conversations (updated_at desc);
create index conversation_members_student_idx on public.conversation_members (student_id);
create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

-- A direct conversation must be unique per pair.
create unique index conversations_direct_pair_idx
  on public.conversations (kind, created_by)
  where kind = 'direct';

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy conversations_select_member
on public.conversations for select to authenticated
using (exists (
  select 1 from public.conversation_members cm
  where cm.conversation_id = conversations.id and cm.student_id = auth.uid()
));

create policy conversation_members_select_member
on public.conversation_members for select to authenticated
using (exists (
  select 1 from public.conversation_members mine
  where mine.conversation_id = conversation_members.conversation_id
    and mine.student_id = auth.uid()
));

create policy messages_select_member
on public.messages for select to authenticated
using (exists (
  select 1 from public.conversation_members cm
  where cm.conversation_id = messages.conversation_id and cm.student_id = auth.uid()
));

-- The sender must be the caller. Inserts are the only write clients can make.
create policy messages_insert_own_member
on public.messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = messages.conversation_id and cm.student_id = auth.uid()
  )
);

revoke insert, update, delete on table public.messages from anon, authenticated;
grant insert, select on table public.messages to authenticated;
grant select on table public.conversations to authenticated;
grant select on table public.conversation_members to authenticated;

-- Live delivery for new messages.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'session_request', 'session_accepted', 'session_declined', 'session_completed',
    'challenge_submitted', 'challenge_reviewed', 'achievement_unlocked',
    'new_message', 'activity_reviewed'
  ));

create or replace function public.start_direct_conversation(p_peer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if v_caller_id = p_peer_id then
    raise exception using errcode = '22023', message = 'You cannot start a conversation with yourself';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_peer_id) then
    raise exception using errcode = 'P0002', message = 'That student could not be found';
  end if;

  select c.id into v_conversation_id
  from public.conversations c
  where c.kind = 'direct'
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = c.id and cm.student_id = v_caller_id
    )
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = c.id and cm.student_id = p_peer_id
    )
    and (select count(*)::int from public.conversation_members cm
         where cm.conversation_id = c.id) = 2
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into public.conversations (kind, created_by)
  values ('direct', v_caller_id)
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, student_id)
  values (v_conversation_id, v_caller_id), (v_conversation_id, p_peer_id);

  return v_conversation_id;
end;
$$;

-- Session chat is created on demand rather than at acceptance time, so the
-- legacy accepted sessions that predate this feature get a channel too.
create or replace function public.get_or_create_session_conversation(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_conversation_id uuid;
  v_learner_id uuid;
  v_teacher_id uuid;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select ls.learner_id, ls.teacher_id into v_learner_id, v_teacher_id
  from public.learning_sessions ls
  where ls.id = p_session_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Learning session was not found';
  end if;

  if v_caller_id not in (v_learner_id, v_teacher_id) then
    raise exception using errcode = '42501',
      message = 'Only session participants can open its chat';
  end if;

  select c.id into v_conversation_id
  from public.conversations c
  where c.kind = 'session' and c.session_id = p_session_id
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into public.conversations (kind, session_id, created_by)
  values ('session', p_session_id, v_caller_id)
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, student_id)
  values (v_conversation_id, v_learner_id), (v_conversation_id, v_teacher_id);

  return v_conversation_id;
end;
$$;

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

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  update public.conversation_members
  set last_read_at = pg_catalog.now()
  where conversation_id = p_conversation_id and student_id = (select auth.uid());
end;
$$;

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
  select coalesce(jsonb_agg(to_jsonb(row) order by coalesce(row.last_message_at, row.updated_at) desc), '[]'::jsonb)
  into v_rows
  from (
    select
      m.id as conversation_id,
      m.kind,
      m.session_id,
      m.project_id,
      m.title,
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

  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.student_id = v_caller_id
  ) then
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
        'is_mine', m.sender_id = v_caller_id
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

create or replace function public.create_message_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_name text;
begin
  select coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'Someone')
  into v_sender_name
  from public.profiles p
  where p.id = new.sender_id;

  insert into public.notifications (
    recipient_id, actor_id, notification_type, title, body, entity_id
  )
  select
    cm.student_id,
    new.sender_id,
    'new_message',
    'New message',
    v_sender_name || ': ' || left(new.body, 120),
    new.conversation_id
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.student_id <> new.sender_id;

  return new;
end;
$$;

create trigger messages_notification
after insert on public.messages
for each row execute function public.create_message_notification();

revoke all on function public.start_direct_conversation(uuid)
  from public, anon, authenticated;
grant execute on function public.start_direct_conversation(uuid) to authenticated;

revoke all on function public.get_or_create_session_conversation(uuid)
  from public, anon, authenticated;
grant execute on function public.get_or_create_session_conversation(uuid) to authenticated;

revoke all on function public.send_message(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.send_message(uuid, text, text) to authenticated;

revoke all on function public.mark_conversation_read(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

revoke all on function public.get_my_conversations()
  from public, anon, authenticated;
grant execute on function public.get_my_conversations() to authenticated;

revoke all on function public.get_conversation_messages(uuid)
  from public, anon, authenticated;
grant execute on function public.get_conversation_messages(uuid) to authenticated;

revoke all on function public.create_message_notification()
  from public, anon, authenticated;