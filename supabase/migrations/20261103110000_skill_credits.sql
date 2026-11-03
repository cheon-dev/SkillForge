-- Skill Exchange Credits.
--
-- Rules (features.md unique feature 3):
--   * 10 credits per verified 60 minutes taught, pro-rated by duration and
--     rounded down to a whole credit. A 60-minute session pays 10; 30 pays 5.
--   * Every student gets 20 welcome credits exactly once.
--   * A learner pays the same amount when requesting a session.
--   * A declined or cancelled session refunds the learner.
--   * Completing a session pays the teacher the same amount.
--   * Credits are a separate ledger from XP. Nothing here touches student_xp.
--   * All writes go through SECURITY DEFINER RPCs; direct ledger writes stay
--     denied and direct learning_sessions inserts are revoked.
--
-- The one-row-per-reference partial indexes make every award, spend, and
-- refund idempotent even if an RPC is retried.

-- 1. New ledger entry types. Find the existing check by definition instead of
--    assuming its generated name.
do $$
declare
  v_constraint text;
begin
  select c.conname
  into v_constraint
  from pg_constraint c
  where c.conrelid = 'public.credit_transactions'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%transaction_type%';

  if v_constraint is not null then
    execute format(
      'alter table public.credit_transactions drop constraint %I',
      v_constraint
    );
  end if;
end $$;

alter table public.credit_transactions
  add constraint credit_transactions_transaction_type_check
  check (transaction_type in (
    'mission_reward',
    'session_request',
    'refund',
    'adjustment',
    'teaching_reward',
    'session_spend'
  ));

-- 2. Idempotency guards.
create unique index if not exists credit_transactions_one_welcome_per_student
  on public.credit_transactions (student_id)
  where reference_type = 'welcome';

create unique index if not exists credit_transactions_one_session_spend
  on public.credit_transactions (reference_id)
  where transaction_type = 'session_spend'
    and reference_type = 'learning_session'
    and reference_id is not null;

create unique index if not exists credit_transactions_one_teaching_reward
  on public.credit_transactions (reference_id)
  where transaction_type = 'teaching_reward'
    and reference_type = 'learning_session'
    and reference_id is not null;

create unique index if not exists credit_transactions_one_refund
  on public.credit_transactions (reference_id)
  where transaction_type = 'refund'
    and reference_type = 'learning_session'
    and reference_id is not null;

-- 3. One-time welcome grant for every profile.
create or replace function public.grant_welcome_credits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.credit_transactions (
    student_id, amount, transaction_type, description, reference_type
  ) values (
    new.id, 20, 'adjustment', 'Welcome credits', 'welcome'
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_grant_welcome_credits on public.profiles;
create trigger profiles_grant_welcome_credits
after insert on public.profiles
for each row execute function public.grant_welcome_credits();

-- Backfill existing profiles so the system starts with a usable balance.
insert into public.credit_transactions (
  student_id, amount, transaction_type, description, reference_type
)
select p.id, 20, 'adjustment', 'Welcome credits', 'welcome'
from public.profiles p
where not exists (
  select 1
  from public.credit_transactions ct
  where ct.student_id = p.id
    and ct.reference_type = 'welcome'
);

-- 4. Refund a held session spend exactly once. Returns the refunded amount.
create or replace function public.refund_session_credits(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_spend public.credit_transactions;
  v_refund integer;
begin
  select *
  into v_spend
  from public.credit_transactions ct
  where ct.reference_type = 'learning_session'
    and ct.reference_id = p_session_id
    and ct.transaction_type = 'session_spend'
  for update;

  if not found then
    return 0;
  end if;

  if exists (
    select 1
    from public.credit_transactions ct
    where ct.reference_type = 'learning_session'
      and ct.reference_id = p_session_id
      and ct.transaction_type = 'refund'
  ) then
    return 0;
  end if;

  v_refund := -v_spend.amount;

  insert into public.credit_transactions (
    student_id, amount, transaction_type, description, reference_type, reference_id
  ) values (
    v_spend.student_id,
    v_refund,
    'refund',
    'Refund for a session that did not take place',
    'learning_session',
    p_session_id
  );

  return v_refund;
end;
$$;

-- 5. Session requests now go through one RPC so the spend and the request are
--    atomic. Direct inserts are revoked below.
create or replace function public.request_learning_session(
  p_teacher_id uuid,
  p_skill_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes smallint,
  p_learning_objectives text default null
)
returns public.learning_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_session public.learning_sessions;
  v_cost integer;
  v_balance integer;
  v_skill_name text;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if p_teacher_id is null
    or p_skill_id is null
    or p_scheduled_at is null
    or p_duration_minutes is null then
    raise exception using errcode = '22023',
      message = 'A teacher, skill, time, and duration are required';
  end if;

  if p_teacher_id = v_caller_id then
    raise exception using errcode = '22023',
      message = 'You cannot request a session from yourself';
  end if;

  if p_scheduled_at <= pg_catalog.now() then
    raise exception using errcode = '22023',
      message = 'Choose a future date and time for the session';
  end if;

  if p_duration_minutes < 15 or p_duration_minutes > 480 then
    raise exception using errcode = '22023',
      message = 'Duration must be between 15 and 480 minutes';
  end if;

  if not exists (
    select 1
    from public.student_skills ss
    where ss.student_id = p_teacher_id
      and ss.skill_id = p_skill_id
      and ss.is_teachable = true
  ) then
    raise exception using errcode = '22023',
      message = 'That teacher is not offering this skill';
  end if;

  select s.name
  into v_skill_name
  from public.skills s
  where s.id = p_skill_id;

  if v_skill_name is null then
    raise exception using errcode = 'P0002', message = 'Skill was not found';
  end if;

  v_cost := p_duration_minutes::integer / 6;

  -- Serialize spending per learner so two concurrent requests cannot both
  -- pass the balance check before either debit is written.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('skillforge-credits:' || v_caller_id::text),
    0
  );

  select coalesce(sum(ct.amount), 0)
  into v_balance
  from public.credit_transactions ct
  where ct.student_id = v_caller_id;

  if v_balance < v_cost then
    raise exception using errcode = 'P0001',
      message = pg_catalog.format(
        'You need %s Skill Credits for this session, but your balance is %s.',
        v_cost,
        v_balance
      );
  end if;

  insert into public.learning_sessions (
    learner_id,
    teacher_id,
    skill_id,
    scheduled_at,
    duration_minutes,
    status,
    learning_objectives
  ) values (
    v_caller_id,
    p_teacher_id,
    p_skill_id,
    p_scheduled_at,
    p_duration_minutes,
    'requested',
    nullif(pg_catalog.btrim(coalesce(p_learning_objectives, '')), '')
  )
  returning * into v_session;

  insert into public.credit_transactions (
    student_id, amount, transaction_type, description, reference_type, reference_id
  ) values (
    v_caller_id,
    -v_cost,
    'session_spend',
    pg_catalog.format(
      'Session request for %s (%s minutes)',
      v_skill_name,
      p_duration_minutes
    ),
    'learning_session',
    v_session.id
  );

  return v_session;
end;
$$;

-- 6. Decline refunds the learner.
create or replace function public.respond_to_learning_request(
  p_session_id uuid,
  p_accept boolean
)
returns public.learning_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.learning_sessions;
  v_caller_id uuid := auth.uid();
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if p_accept is null then
    raise exception using errcode = '22023', message = 'A response is required';
  end if;

  select *
  into v_session
  from public.learning_sessions ls
  where ls.id = p_session_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Learning request was not found';
  end if;

  if v_session.teacher_id is distinct from v_caller_id then
    raise exception using errcode = '42501', message = 'Only the assigned teacher can respond';
  end if;

  if v_session.status <> 'requested' then
    raise exception using errcode = '55000', message = 'This request has already been answered';
  end if;

  update public.learning_sessions
  set status = case when p_accept then 'accepted' else 'declined' end
  where id = p_session_id
  returning * into v_session;

  if not p_accept then
    perform public.refund_session_credits(p_session_id);
  end if;

  return v_session;
end;
$$;

-- 7. Cancellation refunds the learner, whichever participant cancels.
create or replace function public.cancel_learning_session(p_session_id uuid)
returns public.learning_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.learning_sessions;
  v_caller_id uuid := auth.uid();
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select *
  into v_session
  from public.learning_sessions ls
  where ls.id = p_session_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Learning session was not found';
  end if;

  if v_caller_id not in (v_session.learner_id, v_session.teacher_id) then
    raise exception using errcode = '42501', message = 'Only a session participant can cancel it';
  end if;

  if v_session.status not in ('requested', 'accepted', 'scheduled') then
    raise exception using errcode = '55000', message = 'This session can no longer be cancelled';
  end if;

  update public.learning_sessions
  set status = 'cancelled', proposed_scheduled_at = null, proposed_by = null
  where id = p_session_id
  returning * into v_session;

  perform public.refund_session_credits(p_session_id);

  return v_session;
end;
$$;

-- 8. Completion pays the teacher the same pro-rated amount the learner paid.
create or replace function public.complete_learning_session(p_session_id uuid)
returns public.learning_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_session public.learning_sessions;
  v_skill_name text;
  v_credit_reward integer;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select *
  into v_session
  from public.learning_sessions ls
  where ls.id = p_session_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Learning session was not found';
  end if;

  if v_session.teacher_id is distinct from v_caller_id then
    raise exception using errcode = '42501',
      message = 'Only the assigned teacher can complete this session';
  end if;

  if v_session.status not in ('accepted', 'scheduled') then
    raise exception using errcode = '55000',
      message = 'This session is not open for completion';
  end if;

  if v_session.proposed_scheduled_at is not null then
    raise exception using errcode = '55000',
      message = 'Respond to the pending time change before completing this session';
  end if;

  if not exists (
    select 1 from public.session_missions sm where sm.session_id = p_session_id
  ) then
    raise exception using errcode = '55000',
      message = 'A session needs at least one mission before it can be completed';
  end if;

  if exists (
    select 1
    from public.session_missions sm
    where sm.session_id = p_session_id
      and sm.status <> 'completed'
  ) then
    raise exception using errcode = '55000',
      message = 'Every mission must be completed before the session can be completed';
  end if;

  update public.learning_sessions
  set status = 'completed'
  where id = p_session_id
  returning * into v_session;

  select s.name
  into v_skill_name
  from public.skills s
  where s.id = v_session.skill_id;

  v_credit_reward := v_session.duration_minutes::integer / 6;

  -- Do not mint credits for pre-economy sessions that have no matching debit.
  if exists (
    select 1
    from public.credit_transactions ct
    where ct.student_id = v_session.learner_id
      and ct.reference_type = 'learning_session'
      and ct.reference_id = v_session.id
      and ct.transaction_type = 'session_spend'
      and ct.amount = -v_credit_reward
  ) then
    insert into public.credit_transactions (
      student_id, amount, transaction_type, description, reference_type, reference_id
    ) values (
      v_session.teacher_id,
      v_credit_reward,
      'teaching_reward',
      pg_catalog.format(
        'Taught %s for %s minutes',
        coalesce(v_skill_name, 'a skill'),
        v_session.duration_minutes
      ),
      'learning_session',
      v_session.id
    )
    on conflict do nothing;
  end if;

  perform public.award_achievements(v_session.learner_id);
  perform public.award_achievements(v_session.teacher_id);

  return v_session;
end;
$$;

-- 9. Balance and recent history for the current student.
create or replace function public.get_my_credits()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_balance integer;
  v_transactions jsonb;
begin
  if v_caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select coalesce(sum(ct.amount), 0)
  into v_balance
  from public.credit_transactions ct
  where ct.student_id = v_caller_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ct.id,
        'amount', ct.amount,
        'transaction_type', ct.transaction_type,
        'description', ct.description,
        'reference_type', ct.reference_type,
        'reference_id', ct.reference_id,
        'created_at', ct.created_at
      )
      order by ct.created_at desc
    ),
    '[]'::jsonb
  )
  into v_transactions
  from (
    select *
    from public.credit_transactions
    where student_id = v_caller_id
    order by created_at desc
    limit 50
  ) ct;

  return jsonb_build_object(
    'balance', v_balance,
    'transactions', v_transactions
  );
end;
$$;

-- 10. Requests must go through the RPC so the spend cannot be skipped.
drop policy if exists learning_sessions_insert_valid_request
  on public.learning_sessions;
revoke insert on table public.learning_sessions
  from public, anon, authenticated;

-- 11. Permissions.
revoke all on function public.grant_welcome_credits()
  from public, anon, authenticated;
revoke all on function public.refund_session_credits(uuid)
  from public, anon, authenticated;

revoke insert, update, delete, truncate on table public.credit_transactions
  from public, anon, authenticated;

revoke all on function public.request_learning_session(uuid, uuid, timestamptz, smallint, text)
  from public, anon, authenticated;
grant execute on function public.request_learning_session(uuid, uuid, timestamptz, smallint, text)
  to authenticated;

revoke all on function public.get_my_credits()
  from public, anon, authenticated;
grant execute on function public.get_my_credits() to authenticated;

revoke all on function public.respond_to_learning_request(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.respond_to_learning_request(uuid, boolean)
  to authenticated;

revoke all on function public.cancel_learning_session(uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_learning_session(uuid) to authenticated;

revoke all on function public.complete_learning_session(uuid)
  from public, anon, authenticated;
grant execute on function public.complete_learning_session(uuid) to authenticated;
