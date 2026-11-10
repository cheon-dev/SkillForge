create or replace function public.add_project_member(
  p_project_id uuid,
  p_student_id uuid,
  p_role text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_name text;
  v_actor_name text;
  v_target_name text;
  v_role text := nullif(pg_catalog.btrim(coalesce(p_role, '')), '');
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if not public.is_project_member(p_project_id) then
    raise exception using errcode = '42501',
      message = 'Only project members can invite new members';
  end if;

  if v_role is not null and v_role not in (
    'Contributor', 'Designer', 'Developer', 'Documentation', 'Reviewer'
  ) then
    raise exception using errcode = '22023', message = 'That project role is not supported';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_student_id) then
    raise exception using errcode = 'P0002', message = 'That student does not exist';
  end if;

  if exists (
    select 1 from public.project_members pm
    where pm.project_id = p_project_id
      and pm.student_id = p_student_id
  ) then
    raise exception using errcode = '23505',
      message = 'That student is already on this project';
  end if;

  insert into public.project_members (project_id, student_id, role)
  values (p_project_id, p_student_id, coalesce(v_role, 'Contributor'));

  perform public.ensure_project_conversation(p_project_id);

  select p.name into v_project_name from public.projects p where p.id = p_project_id;

  select coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'A student')
  into v_actor_name
  from public.profiles p
  where p.id = v_user_id;

  select coalesce(nullif(pg_catalog.btrim(p.full_name), ''), 'A student')
  into v_target_name
  from public.profiles p
  where p.id = p_student_id;

  insert into public.project_events (project_id, actor_id, event_type, summary)
  values (p_project_id, v_user_id, 'member_joined', 'added ' || v_target_name || ' to the team');

  insert into public.notifications (
    recipient_id, actor_id, notification_type, title, body, entity_id
  ) values (
    p_student_id,
    v_user_id,
    'project_added',
    'Added to a project room',
    v_actor_name || ' added you to "' || v_project_name || '".',
    p_project_id
  );
end;
$$;
