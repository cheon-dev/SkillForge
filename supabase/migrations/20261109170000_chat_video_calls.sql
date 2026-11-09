create table public.conversation_video_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  room_name text not null unique,
  started_by uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.profiles(id) on delete set null,
  check ((ended_at is null) = (ended_by is null))
);

create unique index conversation_video_calls_one_active_idx
  on public.conversation_video_calls (conversation_id)
  where ended_at is null;

create index conversation_video_calls_active_lookup_idx
  on public.conversation_video_calls (conversation_id, started_at desc)
  where ended_at is null;

alter table public.conversation_video_calls enable row level security;
revoke all on public.conversation_video_calls from public, anon, authenticated;
grant select on public.conversation_video_calls to authenticated;

create policy conversation_video_calls_select_member
on public.conversation_video_calls for select to authenticated
using (public.is_conversation_member(conversation_id));

create or replace function public.start_conversation_video_call(p_conversation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_call_id uuid;
begin
  if v_student_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;
  if not public.is_conversation_member(p_conversation_id) then
    raise exception using errcode = '42501',
      message = 'You are not a member of this conversation';
  end if;

  update public.conversation_video_calls
  set ended_at = pg_catalog.now(),
      ended_by = started_by
  where conversation_id = p_conversation_id
    and ended_at is null
    and started_at < pg_catalog.now() - interval '3 hours';

  select id into v_call_id
  from public.conversation_video_calls
  where conversation_id = p_conversation_id
    and ended_at is null;

  if v_call_id is not null then
    return v_call_id;
  end if;

  insert into public.conversation_video_calls (conversation_id, room_name, started_by)
  values (p_conversation_id, 'chat-' || gen_random_uuid()::text, v_student_id)
  returning id into v_call_id;

  insert into public.messages (conversation_id, sender_id, body)
  values (
    p_conversation_id,
    v_student_id,
    '📹 Video call started. Join the call from the chat.'
  );

  return v_call_id;
exception
  when unique_violation then
    select id into v_call_id
    from public.conversation_video_calls
    where conversation_id = p_conversation_id
      and ended_at is null;
    if v_call_id is null then
      raise;
    end if;
    return v_call_id;
end;
$$;

create or replace function public.end_conversation_video_call(p_call_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
begin
  if v_student_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  update public.conversation_video_calls call
  set ended_at = pg_catalog.now(),
      ended_by = v_student_id
  where call.id = p_call_id
    and call.started_by = v_student_id
    and call.ended_at is null;

  if not found then
    raise exception using errcode = '42501',
      message = 'Only the student who started the call can end it for everyone';
  end if;
end;
$$;

revoke all on function public.start_conversation_video_call(uuid)
  from public, anon, authenticated;
grant execute on function public.start_conversation_video_call(uuid)
  to authenticated;

revoke all on function public.end_conversation_video_call(uuid)
  from public, anon, authenticated;
grant execute on function public.end_conversation_video_call(uuid)
  to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_video_calls'
  ) then
    alter publication supabase_realtime add table public.conversation_video_calls;
  end if;
end;
$$;
