create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🙏')),
  created_at timestamptz not null default now(),
  primary key (message_id, student_id)
);

create index message_reactions_student_idx
  on public.message_reactions (student_id);

alter table public.message_reactions enable row level security;
revoke all on public.message_reactions from public, anon, authenticated;
grant select on public.message_reactions to authenticated;

create policy message_reactions_select_conversation_member
on public.message_reactions for select to authenticated
using (
  exists (
    select 1
    from public.messages m
    where m.id = message_reactions.message_id
      and public.is_conversation_member(m.conversation_id)
  )
);

create or replace function public.toggle_message_reaction(
  p_message_id uuid,
  p_emoji text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := auth.uid();
  v_existing_emoji text;
begin
  if v_student_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;
  if p_emoji is null or p_emoji not in ('👍', '❤️', '😂', '😮', '😢', '🙏') then
    raise exception using errcode = '22023', message = 'Choose a supported reaction';
  end if;
  if not exists (
    select 1
    from public.messages m
    where m.id = p_message_id
      and public.is_conversation_member(m.conversation_id)
  ) then
    raise exception using errcode = '42501',
      message = 'You are not a member of this conversation';
  end if;

  select mr.emoji into v_existing_emoji
  from public.message_reactions mr
  where mr.message_id = p_message_id
    and mr.student_id = v_student_id
  for update;

  if v_existing_emoji = p_emoji then
    delete from public.message_reactions
    where message_id = p_message_id
      and student_id = v_student_id;
  else
    insert into public.message_reactions (message_id, student_id, emoji)
    values (p_message_id, v_student_id, p_emoji)
    on conflict (message_id, student_id) do update
      set emoji = excluded.emoji,
          created_at = pg_catalog.now();
  end if;
end;
$$;

revoke all on function public.toggle_message_reaction(uuid, text)
  from public, anon, authenticated;
grant execute on function public.toggle_message_reaction(uuid, text)
  to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
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
        ),
        'reactions', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'emoji', reaction_totals.emoji,
              'count', reaction_totals.reaction_count,
              'reacted_by_me', reaction_totals.reacted_by_me
            )
            order by reaction_totals.emoji
          )
          from (
            select
              mr.emoji,
              count(*)::int as reaction_count,
              bool_or(mr.student_id = v_caller_id) as reacted_by_me
            from public.message_reactions mr
            where mr.message_id = m.id
            group by mr.emoji
          ) reaction_totals
        ), '[]'::jsonb)
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
grant execute on function public.get_conversation_messages(uuid)
  to authenticated;
