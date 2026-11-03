-- Allow more than one mission per learning session.
--
-- session_missions was created with `unique (session_id)`, which capped every
-- session at a single mission. features.md section 5C describes a session as
-- containing one or more missions (for example Understand the Concept, Guided
-- Practice, Independent Practice).
--
-- Existing RPCs already operate on a single mission id, so no function
-- signature changes are needed: create_session_learning_plan now appends a new
-- mission per call instead of conflicting with the previous one.

do $$
declare
  v_table regclass := 'public.session_missions'::regclass;
  v_session_id_attnum smallint;
  v_constraint text;
begin
  select att.attnum into v_session_id_attnum
  from pg_catalog.pg_attribute att
  where att.attrelid = v_table
    and att.attname = 'session_id'
    and not att.attisdropped;

  -- Resolve the constraint by definition rather than assuming the name that
  -- PostgreSQL generated for `unique (session_id)`.
  select con.conname into v_constraint
  from pg_catalog.pg_constraint con
  where con.conrelid = v_table
    and con.contype = 'u'
    and pg_catalog.array_length(con.conkey, 1) = 1
    and con.conkey[1] = v_session_id_attnum
  limit 1;

  if v_constraint is not null then
    execute format('alter table public.session_missions drop constraint %I', v_constraint);
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint con
    where con.conrelid = v_table
      and con.contype = 'u'
      and pg_catalog.array_length(con.conkey, 1) = 1
      and con.conkey[1] = v_session_id_attnum
  ) then
    raise exception 'session_missions still enforces a single-mission unique constraint on session_id';
  end if;
end;
$$;

create index if not exists idx_session_missions_session_id_created_at
  on public.session_missions (session_id, created_at);