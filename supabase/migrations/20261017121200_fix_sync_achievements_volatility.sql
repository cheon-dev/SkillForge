-- Fix: sync_my_achievements was declared STABLE but performs an INSERT.
--
-- PostgREST runs STABLE/IMMUTABLE functions inside a read-only transaction, so
-- calling it from the Skill Passport failed with
--   25006 cannot execute INSERT in a read-only transaction
-- and because the passport awaited the sync in the same try block, the whole
-- page reported "We could not load your Skill Passport".
--
-- The function only appeared to work in the verification harness because the
-- caller never asserted on the returned error.
--
-- award_achievements() was already VOLATILE (the default for plpgsql); only
-- this wrapper was wrong. Read-only RPCs such as get_skill_passport,
-- get_reviewable_challenge_submissions and get_endorsement_opportunities stay
-- STABLE, which is correct and desirable for them.

create or replace function public.sync_my_achievements()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  return public.award_achievements((select auth.uid()));
end;
$$;

revoke all on function public.sync_my_achievements()
  from public, anon, authenticated;
grant execute on function public.sync_my_achievements() to authenticated;