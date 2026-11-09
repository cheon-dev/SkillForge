-- A browser push token can be opted in by multiple accounts on a shared device.
alter table public.push_tokens
  drop constraint push_tokens_pkey;

alter table public.push_tokens
  add constraint push_tokens_pkey primary key (token, student_id);

create or replace function public.register_push_token(p_token text)
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
  if p_token is null or char_length(p_token) not between 20 and 4096 then
    raise exception using errcode = '22023', message = 'A valid push token is required';
  end if;

  insert into public.push_tokens (token, student_id)
  values (p_token, v_student_id)
  on conflict (token, student_id) do update
  set updated_at = pg_catalog.now();
end;
$$;
