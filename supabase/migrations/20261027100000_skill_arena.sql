-- Skill Arena: Solo Rush + Skill Duels.
--
-- features.md treats gamified practice as a support for learning, not as proof
-- of proficiency. This migration therefore keeps Arena strictly separate from
-- the Skill Passport:
--   * Arena answers never mark a skill as proven.
--   * Arena XP is small, capped per day, and only awarded by this SECURITY
--     DEFINER function (features.md 5D: backend-only, predefined, repeatable
--     awards are blocked by the daily cap and by the one-row-per-round ledger).
--   * A student can never earn XP or rating from a question they authored.
--
-- Question sourcing: system questions are seeded here; teachers (students who
-- mark a skill as teachable) author their own. Teacher questions are playable
-- in Solo Rush immediately but only enter the ranked Duel pool after an admin
-- approves them.
--
-- Nothing in this file exposes correct answers before an answer is submitted:
-- quiz_questions has no direct grant to authenticated, and every read goes
-- through a function that strips correct_index.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  source text not null default 'teacher' check (source in ('system', 'teacher')),
  prompt text not null check (btrim(prompt) <> ''),
  options jsonb not null,
  correct_index integer not null check (correct_index >= 0),
  explanation text,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  status text not null default 'active' check (status in ('active', 'rejected', 'flagged')),
  approved_for_duel boolean not null default false,
  answer_count integer not null default 0 check (answer_count >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quiz_questions_options_is_array
    check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  constraint quiz_questions_correct_index_in_range
    check (correct_index < jsonb_array_length(options))
);

create unique index if not exists quiz_questions_skill_prompt_key
  on public.quiz_questions (skill_id, prompt);

create index if not exists idx_quiz_questions_pool
  on public.quiz_questions (skill_id, status, approved_for_duel);

create index if not exists idx_quiz_questions_author
  on public.quiz_questions (author_id);

create table if not exists public.quiz_rounds (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('solo', 'duel')),
  skill_id uuid not null references public.skills(id) on delete cascade,
  duel_id uuid,
  question_ids uuid[] not null,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  score integer not null default 0 check (score >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  answered_count integer not null default 0 check (answered_count >= 0),
  combo integer not null default 0 check (combo >= 0),
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint quiz_rounds_question_count
    check (array_length(question_ids, 1) between 4 and 12),
  constraint quiz_rounds_solo_has_no_duel
    check ((mode = 'solo' and duel_id is null) or (mode = 'duel' and duel_id is not null))
);

create index if not exists idx_quiz_rounds_student
  on public.quiz_rounds (student_id, status);

create index if not exists idx_quiz_rounds_duel
  on public.quiz_rounds (duel_id);

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.quiz_rounds(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  selected_index integer not null check (selected_index >= 0),
  is_correct boolean not null,
  elapsed_ms integer not null check (elapsed_ms >= 0),
  points integer not null default 0 check (points >= 0),
  combo integer not null default 0 check (combo >= 0),
  answered_at timestamptz not null default now(),
  constraint quiz_answers_one_per_question unique (round_id, question_id)
);

create index if not exists idx_quiz_answers_round
  on public.quiz_answers (round_id);

create table if not exists public.duels (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills(id) on delete cascade,
  challenger_id uuid not null references public.profiles(id) on delete cascade,
  opponent_id uuid not null references public.profiles(id) on delete cascade,
  question_ids uuid[] not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'expired')),
  challenger_score integer check (challenger_score >= 0),
  opponent_score integer check (opponent_score >= 0),
  challenger_round_id uuid references public.quiz_rounds(id) on delete set null,
  opponent_round_id uuid references public.quiz_rounds(id) on delete set null,
  winner_id uuid references public.profiles(id) on delete set null,
  rating_change integer,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours',
  completed_at timestamptz,
  constraint duels_distinct_players check (challenger_id <> opponent_id),
  constraint duels_question_count check (array_length(question_ids, 1) between 5 and 10)
);

create index if not exists idx_duels_challenger on public.duels (challenger_id, status);
create index if not exists idx_duels_opponent on public.duels (opponent_id, status);

create table if not exists public.arena_ratings (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  rating integer not null default 1000 check (rating >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  leaderboard_opt_out boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.arena_streaks (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_played_on date,
  updated_at timestamptz not null default now()
);

create table if not exists public.arena_xp_awards (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null unique references public.quiz_rounds(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  xp_awarded integer not null check (xp_awarded >= 0),
  awarded_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_arena_xp_awards_student_day
  on public.arena_xp_awards (student_id, awarded_on);

-- ---------------------------------------------------------------------------
-- 2. Ownership helper (needed by the quiz_answers policy below)
-- ---------------------------------------------------------------------------

create or replace function public.owns_arena_round(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.quiz_rounds r
    where r.id = p_round_id
      and r.student_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_arena_round(uuid) from public, anon;
grant execute on function public.owns_arena_round(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Row level security and grants
-- ---------------------------------------------------------------------------

alter table public.quiz_questions enable row level security;
alter table public.quiz_rounds enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.duels enable row level security;
alter table public.arena_ratings enable row level security;
alter table public.arena_streaks enable row level security;
alter table public.arena_xp_awards enable row level security;

-- Questions are never readable directly: correct_index must not reach a client
-- before the answer is committed. Authors and admins read through functions.
revoke all on table public.quiz_questions from anon, authenticated;
grant all on table public.quiz_questions to service_role;

revoke all on table public.quiz_rounds from anon, authenticated;
grant select on table public.quiz_rounds to authenticated;

revoke all on table public.quiz_answers from anon, authenticated;
grant select on table public.quiz_answers to authenticated;

revoke all on table public.duels from anon, authenticated;
grant select on table public.duels to authenticated;

revoke all on table public.arena_ratings from anon, authenticated;
grant select on table public.arena_ratings to authenticated;

revoke all on table public.arena_streaks from anon, authenticated;
grant select on table public.arena_streaks to authenticated;

revoke all on table public.arena_xp_awards from anon, authenticated;
grant select on table public.arena_xp_awards to authenticated;

drop policy if exists quiz_rounds_select_own on public.quiz_rounds;
create policy quiz_rounds_select_own
on public.quiz_rounds for select to authenticated
using (student_id = (select auth.uid()));

drop policy if exists quiz_answers_select_own on public.quiz_answers;
create policy quiz_answers_select_own
on public.quiz_answers for select to authenticated
using (public.owns_arena_round(round_id));

drop policy if exists duels_select_participant on public.duels;
create policy duels_select_participant
on public.duels for select to authenticated
using (
  challenger_id = (select auth.uid())
  or opponent_id = (select auth.uid())
);

drop policy if exists arena_ratings_select_own on public.arena_ratings;
create policy arena_ratings_select_own
on public.arena_ratings for select to authenticated
using (student_id = (select auth.uid()));

drop policy if exists arena_streaks_select_own on public.arena_streaks;
create policy arena_streaks_select_own
on public.arena_streaks for select to authenticated
using (student_id = (select auth.uid()));

drop policy if exists arena_xp_awards_select_own on public.arena_xp_awards;
create policy arena_xp_awards_select_own
on public.arena_xp_awards for select to authenticated
using (student_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.arena_tier(p_rating integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_rating, 1000) >= 1550 then 'Diamond'
    when coalesce(p_rating, 1000) >= 1400 then 'Platinum'
    when coalesce(p_rating, 1000) >= 1250 then 'Gold'
    when coalesce(p_rating, 1000) >= 1100 then 'Silver'
    else 'Bronze'
  end;
$$;

revoke all on function public.arena_tier(integer) from public, anon;
grant execute on function public.arena_tier(integer) to authenticated;

create or replace function public.ensure_arena_rows(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.arena_ratings (student_id)
  values (p_student_id)
  on conflict (student_id) do nothing;

  insert into public.arena_streaks (student_id)
  values (p_student_id)
  on conflict (student_id) do nothing;
end;
$$;

revoke all on function public.ensure_arena_rows(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Lobby reads
-- ---------------------------------------------------------------------------

create or replace function public.get_arena_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_rating public.arena_ratings;
  v_streak public.arena_streaks;
  v_xp_today integer := 0;
  v_open jsonb := '[]'::jsonb;
  v_recent jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  perform public.ensure_arena_rows(v_user);

  -- A duel nobody answered within its window stops blocking new challenges.
  update public.duels
  set status = 'expired'
  where status = 'pending'
    and expires_at <= now()
    and (challenger_id = v_user or opponent_id = v_user);

  select * into v_rating from public.arena_ratings where student_id = v_user;
  select * into v_streak from public.arena_streaks where student_id = v_user;

  select coalesce(sum(a.xp_awarded), 0) into v_xp_today
  from public.arena_xp_awards a
  where a.student_id = v_user
    and a.awarded_on = current_date;

  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
  into v_open
  from (
    select
      d.id,
      d.skill_id,
      s.name as skill_name,
      s.category as skill_category,
      case when d.challenger_id = v_user then d.opponent_id else d.challenger_id end as opponent_id,
      coalesce(p.full_name, 'SkillForge student') as opponent_name,
      case when d.challenger_id = v_user then 'challenger' else 'opponent' end as my_role,
      exists (
        select 1 from public.quiz_rounds r
        where r.duel_id = d.id and r.student_id = v_user and r.status = 'completed'
      ) as i_played,
      exists (
        select 1 from public.quiz_rounds r
        where r.duel_id = d.id and r.student_id <> v_user and r.status = 'completed'
      ) as opponent_played,
      d.expires_at,
      d.created_at
    from public.duels d
    join public.skills s on s.id = d.skill_id
    join public.profiles p
      on p.id = case when d.challenger_id = v_user then d.opponent_id else d.challenger_id end
    where (d.challenger_id = v_user or d.opponent_id = v_user)
      and d.status = 'pending'
      and d.expires_at > now()
  ) t;

  select coalesce(jsonb_agg(row_to_json(t) order by t.completed_at desc), '[]'::jsonb)
  into v_recent
  from (
    select
      d.id,
      s.name as skill_name,
      coalesce(p.full_name, 'SkillForge student') as opponent_name,
      case when d.challenger_id = v_user then d.challenger_score else d.opponent_score end as my_score,
      case when d.challenger_id = v_user then d.opponent_score else d.challenger_score end as opponent_score,
      case
        when d.winner_id is null then 'draw'
        when d.winner_id = v_user then 'win'
        else 'loss'
      end as result,
      d.completed_at
    from public.duels d
    join public.skills s on s.id = d.skill_id
    join public.profiles p
      on p.id = case when d.challenger_id = v_user then d.opponent_id else d.challenger_id end
    where (d.challenger_id = v_user or d.opponent_id = v_user)
      and d.status = 'completed'
    order by d.completed_at desc
    limit 5
  ) t;

  return jsonb_build_object(
    'rating', v_rating.rating,
    'tier', public.arena_tier(v_rating.rating),
    'wins', v_rating.wins,
    'losses', v_rating.losses,
    'draws', v_rating.draws,
    'leaderboard_opt_out', v_rating.leaderboard_opt_out,
    'current_streak', v_streak.current_streak,
    'longest_streak', v_streak.longest_streak,
    'played_today', coalesce(v_streak.last_played_on = current_date, false),
    'xp_today', v_xp_today,
    'xp_cap', 40,
    'open_duels', v_open,
    'recent_duels', v_recent
  );
end;
$$;

revoke all on function public.get_arena_state() from public, anon;
grant execute on function public.get_arena_state() to authenticated;

create or replace function public.get_arena_skills()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_skills jsonb;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select coalesce(jsonb_agg(row_to_json(t) order by t.name), '[]'::jsonb)
  into v_skills
  from (
    select
      s.id,
      s.name,
      s.category,
      count(q.id) filter (where q.status = 'active') as question_count,
      count(q.id) filter (where q.status = 'active' and q.approved_for_duel) as duel_question_count,
      exists (
        select 1 from public.student_skills ss
        where ss.student_id = v_user and ss.skill_id = s.id
      ) as on_my_profile,
      exists (
        select 1 from public.student_skills ss
        where ss.student_id = v_user and ss.skill_id = s.id and ss.is_teachable
      ) as i_teach
    from public.skills s
    join public.quiz_questions q on q.skill_id = s.id
    group by s.id, s.name, s.category
    having count(q.id) filter (where q.status = 'active') >= 4
  ) t;

  return v_skills;
end;
$$;

revoke all on function public.get_arena_skills() from public, anon;
grant execute on function public.get_arena_skills() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Playing a round
-- ---------------------------------------------------------------------------

create or replace function public.start_arena_round(
  p_mode text,
  p_skill_id uuid,
  p_duel_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_round public.quiz_rounds;
  v_duel public.duels;
  v_question_ids uuid[];
  v_limit integer;
  v_questions jsonb;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if p_mode not in ('solo', 'duel') then
    raise exception using errcode = '22023', message = 'Unknown Arena mode';
  end if;

  if p_mode = 'solo' then
    update public.quiz_rounds
    set status = 'abandoned'
    where student_id = v_user
      and mode = 'solo'
      and skill_id = p_skill_id
      and status = 'active';

    select array_agg(picked.id) into v_question_ids
    from (
      select q.id
      from public.quiz_questions q
      where q.skill_id = p_skill_id
        and q.status = 'active'
      order by random()
      limit 8
    ) picked;

    if v_question_ids is null or array_length(v_question_ids, 1) < 4 then
      raise exception using errcode = '22023',
        message = 'This skill does not have enough questions yet';
    end if;

    insert into public.quiz_rounds (student_id, mode, skill_id, question_ids)
    values (v_user, 'solo', p_skill_id, v_question_ids)
    returning * into v_round;

    v_limit := 15000;
  else
    if p_duel_id is null then
      raise exception using errcode = '22023', message = 'Choose a duel to play';
    end if;

    select * into v_duel from public.duels where id = p_duel_id;
    if not found then
      raise exception using errcode = '22023', message = 'That duel no longer exists';
    end if;

    if v_duel.challenger_id <> v_user and v_duel.opponent_id <> v_user then
      raise exception using errcode = '42501', message = 'This duel is not yours';
    end if;

    if v_duel.status = 'expired' or v_duel.expires_at <= now() then
      update public.duels set status = 'expired' where id = v_duel.id and status = 'pending';
      raise exception using errcode = '22023', message = 'That duel has expired';
    end if;

    if v_duel.status <> 'pending' then
      raise exception using errcode = '22023', message = 'That duel is already complete';
    end if;

    if exists (
      select 1 from public.quiz_rounds
      where duel_id = v_duel.id and student_id = v_user and status = 'completed'
    ) then
      raise exception using errcode = '22023', message = 'You already played this duel';
    end if;

    select * into v_round
    from public.quiz_rounds
    where duel_id = v_duel.id and student_id = v_user and status = 'active'
    order by started_at desc
    limit 1;

    if not found then
      insert into public.quiz_rounds (student_id, mode, skill_id, duel_id, question_ids)
      values (v_user, 'duel', v_duel.skill_id, v_duel.id, v_duel.question_ids)
      returning * into v_round;
    end if;

    v_question_ids := v_round.question_ids;
    v_limit := 20000;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prompt', q.prompt,
      'options', q.options,
      'difficulty', q.difficulty
    )
    order by t.ord
  )
  into v_questions
  from unnest(v_question_ids) with ordinality as t(question_id, ord)
  join public.quiz_questions q on q.id = t.question_id;

  return jsonb_build_object(
    'round_id', v_round.id,
    'mode', v_round.mode,
    'skill_id', v_round.skill_id,
    'duel_id', v_round.duel_id,
    'question_limit_ms', v_limit,
    'questions', coalesce(v_questions, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.start_arena_round(text, uuid, uuid) from public, anon;
grant execute on function public.start_arena_round(text, uuid, uuid) to authenticated;

create or replace function public.submit_arena_answer(
  p_round_id uuid,
  p_question_id uuid,
  p_selected_index integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_round public.quiz_rounds;
  v_question public.quiz_questions;
  v_previous_at timestamptz;
  v_elapsed integer;
  v_limit integer;
  v_correct boolean;
  v_combo integer;
  v_multiplier numeric;
  v_speed integer;
  v_points integer;
  v_score integer;
  v_answered integer;
  v_ratio numeric;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select * into v_round from public.quiz_rounds where id = p_round_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'That round no longer exists';
  end if;

  if v_round.student_id <> v_user then
    raise exception using errcode = '42501', message = 'That round is not yours';
  end if;

  if v_round.status <> 'active' then
    raise exception using errcode = '22023', message = 'That round is already finished';
  end if;

  if not (p_question_id = any (v_round.question_ids)) then
    raise exception using errcode = '22023', message = 'That question is not part of this round';
  end if;

  if exists (
    select 1 from public.quiz_answers
    where round_id = p_round_id and question_id = p_question_id
  ) then
    raise exception using errcode = '23505', message = 'That question was already answered';
  end if;

  select * into v_question from public.quiz_questions where id = p_question_id;
  if not found then
    raise exception using errcode = '22023', message = 'That question no longer exists';
  end if;

  if p_selected_index is null
    or p_selected_index < 0
    or p_selected_index >= jsonb_array_length(v_question.options) then
    raise exception using errcode = '22023', message = 'Choose one of the listed answers';
  end if;

  v_limit := case when v_round.mode = 'duel' then 20000 else 15000 end;

  -- Timing is measured by the server from the previous answer, so a client
  -- cannot claim a faster time. The first question starts at started_at.
  select max(a.answered_at) into v_previous_at
  from public.quiz_answers a
  where a.round_id = p_round_id;

  v_elapsed := greatest(
    0,
    (extract(epoch from (now() - coalesce(v_previous_at, v_round.started_at))) * 1000)::integer
  );

  if v_elapsed > v_limit * 3 then
    raise exception using errcode = '22023',
      message = 'That question took too long. Start a new round.';
  end if;

  v_correct := (p_selected_index = v_question.correct_index);
  v_combo := case when v_correct then v_round.combo + 1 else 0 end;

  if v_correct then
    v_speed := greatest(
      0,
      least(50, round(50 * (1 - (v_elapsed::numeric / v_limit)))::integer)
    );
    v_multiplier := case
      when v_combo >= 8 then 2
      when v_combo >= 5 then 1.5
      when v_combo >= 3 then 1.25
      else 1
    end;
    v_points := round((100 + v_speed) * v_multiplier)::integer;
  else
    v_points := 0;
  end if;

  insert into public.quiz_answers (
    round_id, question_id, selected_index, is_correct, elapsed_ms, points, combo
  )
  values (
    p_round_id, p_question_id, p_selected_index, v_correct, v_elapsed, v_points, v_combo
  );

  update public.quiz_rounds
  set score = score + v_points,
      correct_count = correct_count + case when v_correct then 1 else 0 end,
      answered_count = answered_count + 1,
      combo = v_combo
  where id = p_round_id
  returning score, answered_count into v_score, v_answered;

  update public.quiz_questions
  set answer_count = answer_count + 1,
      correct_count = correct_count + case when v_correct then 1 else 0 end,
      updated_at = now()
  where id = p_question_id;

  -- A question that almost everyone gets right (or almost nobody does) is a
  -- weak question. Flag it so an admin can look, but leave rounds already
  -- holding it untouched.
  if v_question.answer_count + 1 >= 20 then
    v_ratio := (v_question.correct_count + case when v_correct then 1 else 0 end)::numeric
      / (v_question.answer_count + 1);

    if v_ratio < 0.15 or v_ratio > 0.90 then
      update public.quiz_questions
      set status = 'flagged', updated_at = now()
      where id = p_question_id and status = 'active';
    end if;
  end if;

  return jsonb_build_object(
    'is_correct', v_correct,
    'correct_index', v_question.correct_index,
    'explanation', v_question.explanation,
    'points', v_points,
    'combo', v_combo,
    'score', v_score,
    'answered_count', v_answered,
    'total_questions', array_length(v_round.question_ids, 1),
    'question_limit_ms', v_limit,
    'elapsed_ms', v_elapsed
  );
end;
$$;

revoke all on function public.submit_arena_answer(uuid, uuid, integer) from public, anon;
grant execute on function public.submit_arena_answer(uuid, uuid, integer) to authenticated;

create or replace function public.finish_arena_round(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_round public.quiz_rounds;
  v_duel public.duels;
  v_eligible_correct integer := 0;
  v_best integer := 0;
  v_xp integer := 0;
  v_used integer := 0;
  v_cap integer := 40;
  v_streak public.arena_streaks;
  v_new_streak integer := 1;
  v_total_xp integer := 0;
  v_level integer := 1;
  v_winner uuid;
  v_challenger_rating integer := 1000;
  v_opponent_rating integer := 1000;
  v_expected numeric;
  v_actual numeric;
  v_change integer := 0;
  v_my_change integer := 0;
  v_duel_result jsonb := null;
  v_personal_best boolean := false;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select * into v_round from public.quiz_rounds where id = p_round_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'That round no longer exists';
  end if;

  if v_round.student_id <> v_user then
    raise exception using errcode = '42501', message = 'That round is not yours';
  end if;

  if v_round.status <> 'active' then
    raise exception using errcode = '22023', message = 'That round is already finished';
  end if;

  if v_round.answered_count < 1 then
    raise exception using errcode = '22023', message = 'Answer at least one question first';
  end if;

  -- Questions the student wrote never pay XP. The Duel pool already excludes
  -- them, so this guard only matters for Solo Rush.
  select count(*) into v_eligible_correct
  from public.quiz_answers a
  join public.quiz_questions q on q.id = a.question_id
  where a.round_id = v_round.id
    and a.is_correct
    and (q.author_id is null or q.author_id <> v_user);

  select coalesce(max(r.score), 0) into v_best
  from public.quiz_rounds r
  where r.student_id = v_user
    and r.skill_id = v_round.skill_id
    and r.mode = v_round.mode
    and r.status = 'completed'
    and r.id <> v_round.id;

  v_personal_best := v_round.score > v_best;

  if v_eligible_correct > 0 then
    v_xp := least(10, v_eligible_correct);
    if v_personal_best then
      v_xp := v_xp + 5;
    end if;
  end if;

  select coalesce(sum(a.xp_awarded), 0) into v_used
  from public.arena_xp_awards a
  where a.student_id = v_user
    and a.awarded_on = current_date;

  v_xp := greatest(0, least(v_xp, v_cap - v_used));

  update public.quiz_rounds
  set status = 'completed',
      completed_at = now(),
      xp_awarded = v_xp
  where id = v_round.id;

  if v_xp > 0 then
    insert into public.arena_xp_awards (round_id, student_id, skill_id, xp_awarded)
    values (v_round.id, v_user, v_round.skill_id, v_xp);

    insert into public.student_xp as sx (student_id, total_xp, level)
    values (v_user, v_xp, greatest(1, (v_xp / 100) + 1))
    on conflict (student_id) do update
      set total_xp = sx.total_xp + excluded.total_xp,
          level = greatest(1, ((sx.total_xp + excluded.total_xp) / 100) + 1),
          updated_at = now();
  end if;

  select sx.total_xp, sx.level into v_total_xp, v_level
  from public.student_xp sx
  where sx.student_id = v_user;

  v_total_xp := coalesce(v_total_xp, 0);
  v_level := coalesce(v_level, 1);

  -- Daily streak: consecutive calendar days with a finished round.
  perform public.ensure_arena_rows(v_user);
  select * into v_streak from public.arena_streaks where student_id = v_user for update;

  if v_streak.last_played_on = current_date then
    v_new_streak := v_streak.current_streak;
  elsif v_streak.last_played_on = current_date - 1 then
    v_new_streak := v_streak.current_streak + 1;
  else
    v_new_streak := 1;
  end if;

  update public.arena_streaks
  set current_streak = v_new_streak,
      longest_streak = greatest(longest_streak, v_new_streak),
      last_played_on = current_date,
      updated_at = now()
  where student_id = v_user;

  if v_round.mode = 'duel' and v_round.duel_id is not null then
    update public.duels
    set challenger_score = case when challenger_id = v_user then v_round.score else challenger_score end,
        challenger_round_id = case when challenger_id = v_user then v_round.id else challenger_round_id end,
        opponent_score = case when opponent_id = v_user then v_round.score else opponent_score end,
        opponent_round_id = case when opponent_id = v_user then v_round.id else opponent_round_id end
    where id = v_round.duel_id
    returning * into v_duel;

    if v_duel.challenger_score is not null and v_duel.opponent_score is not null then
      if v_duel.challenger_score = v_duel.opponent_score then
        v_winner := null;
      elsif v_duel.challenger_score > v_duel.opponent_score then
        v_winner := v_duel.challenger_id;
      else
        v_winner := v_duel.opponent_id;
      end if;

      insert into public.arena_ratings (student_id)
      values (v_duel.challenger_id)
      on conflict (student_id) do nothing;

      insert into public.arena_ratings (student_id)
      values (v_duel.opponent_id)
      on conflict (student_id) do nothing;

      select rating into v_challenger_rating
      from public.arena_ratings
      where student_id = v_duel.challenger_id
      for update;

      select rating into v_opponent_rating
      from public.arena_ratings
      where student_id = v_duel.opponent_id
      for update;

      v_expected := 1.0 / (
        1.0 + power(10.0, (v_opponent_rating - v_challenger_rating)::numeric / 400.0)
      );

      if v_winner is null then
        v_actual := 0.5;
      elsif v_winner = v_duel.challenger_id then
        v_actual := 1.0;
      else
        v_actual := 0.0;
      end if;

      v_change := round(32 * (v_actual - v_expected))::integer;

      update public.arena_ratings
      set rating = greatest(100, rating + v_change),
          wins = wins + case when v_winner = v_duel.challenger_id then 1 else 0 end,
          losses = losses + case
            when v_winner is not null and v_winner <> v_duel.challenger_id then 1 else 0
          end,
          draws = draws + case when v_winner is null then 1 else 0 end,
          updated_at = now()
      where student_id = v_duel.challenger_id;

      update public.arena_ratings
      set rating = greatest(100, rating - v_change),
          wins = wins + case when v_winner = v_duel.opponent_id then 1 else 0 end,
          losses = losses + case
            when v_winner is not null and v_winner <> v_duel.opponent_id then 1 else 0
          end,
          draws = draws + case when v_winner is null then 1 else 0 end,
          updated_at = now()
      where student_id = v_duel.opponent_id;

      update public.duels
      set status = 'completed',
          winner_id = v_winner,
          rating_change = v_change,
          completed_at = now()
      where id = v_duel.id;

      v_my_change := case when v_duel.challenger_id = v_user then v_change else -v_change end;

      insert into public.notifications (
        recipient_id, actor_id, notification_type, title, body, entity_id
      )
      values
        (
          v_duel.challenger_id,
          v_duel.opponent_id,
          'duel_completed',
          'Duel complete',
          'Your Skill Duel in ' || (
            select s.name from public.skills s where s.id = v_duel.skill_id
          ) || ' has a result.',
          v_duel.id
        ),
        (
          v_duel.opponent_id,
          v_duel.challenger_id,
          'duel_completed',
          'Duel complete',
          'Your Skill Duel in ' || (
            select s.name from public.skills s where s.id = v_duel.skill_id
          ) || ' has a result.',
          v_duel.id
        );

      v_duel_result := jsonb_build_object(
        'status', 'completed',
        'my_score', v_round.score,
        'opponent_score', case
          when v_duel.challenger_id = v_user then v_duel.opponent_score
          else v_duel.challenger_score
        end,
        'result', case
          when v_winner is null then 'draw'
          when v_winner = v_user then 'win'
          else 'loss'
        end,
        'rating_change', v_my_change
      );
    else
      v_duel_result := jsonb_build_object(
        'status', 'waiting',
        'my_score', v_round.score,
        'opponent_score', null,
        'result', null,
        'rating_change', 0
      );
    end if;
  end if;

  return jsonb_build_object(
    'round_id', v_round.id,
    'mode', v_round.mode,
    'score', v_round.score,
    'correct_count', v_round.correct_count,
    'answered_count', v_round.answered_count,
    'total_questions', array_length(v_round.question_ids, 1),
    'xp_awarded', v_xp,
    'total_xp', v_total_xp,
    'level', v_level,
    'personal_best', v_personal_best,
    'streak', v_new_streak,
    'xp_today', v_used + v_xp,
    'xp_cap', v_cap,
    'duel', v_duel_result
  );
end;
$$;

revoke all on function public.finish_arena_round(uuid) from public, anon;
grant execute on function public.finish_arena_round(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Duels
-- ---------------------------------------------------------------------------

create or replace function public.find_duel_opponent(p_skill_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_my_rating integer := 1000;
  v_result jsonb;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select coalesce(r.rating, 1000) into v_my_rating
  from public.profiles p
  left join public.arena_ratings r on r.student_id = p.id
  where p.id = v_user;

  select jsonb_build_object(
    'id', p.id,
    'full_name', coalesce(p.full_name, 'SkillForge student'),
    'course', p.course,
    'rating', coalesce(r.rating, 1000),
    'tier', public.arena_tier(coalesce(r.rating, 1000))
  )
  into v_result
  from public.profiles p
  join public.student_skills ss
    on ss.student_id = p.id and ss.skill_id = p_skill_id
  left join public.arena_ratings r on r.student_id = p.id
  where p.id <> v_user
    and not exists (
      select 1 from public.duels d
      where d.skill_id = p_skill_id
        and d.status = 'pending'
        and d.expires_at > now()
        and (
          (d.challenger_id = v_user and d.opponent_id = p.id)
          or (d.challenger_id = p.id and d.opponent_id = v_user)
        )
    )
  order by abs(coalesce(r.rating, 1000) - v_my_rating), random()
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.find_duel_opponent(uuid) from public, anon;
grant execute on function public.find_duel_opponent(uuid) to authenticated;

create or replace function public.create_duel(
  p_opponent_id uuid,
  p_skill_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_question_ids uuid[];
  v_duel public.duels;
  v_opponent_name text;
  v_skill_name text;
  v_today_count integer := 0;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if p_opponent_id is null or p_opponent_id = v_user then
    raise exception using errcode = '22023', message = 'You cannot duel yourself';
  end if;

  select coalesce(full_name, 'SkillForge student') into v_opponent_name
  from public.profiles
  where id = p_opponent_id;

  if v_opponent_name is null then
    raise exception using errcode = '22023', message = 'That student no longer exists';
  end if;

  select name into v_skill_name from public.skills where id = p_skill_id;
  if v_skill_name is null then
    raise exception using errcode = '22023', message = 'Choose a skill from the catalog';
  end if;

  if not exists (
    select 1 from public.student_skills
    where student_id = v_user and skill_id = p_skill_id
  ) then
    raise exception using errcode = '22023',
      message = 'Add this skill to your profile before duelling in it';
  end if;

  if not exists (
    select 1 from public.student_skills
    where student_id = p_opponent_id and skill_id = p_skill_id
  ) then
    raise exception using errcode = '22023',
      message = 'That student does not have this skill on their profile';
  end if;

  if exists (
    select 1 from public.duels
    where skill_id = p_skill_id
      and status = 'pending'
      and expires_at > now()
      and (
        (challenger_id = v_user and opponent_id = p_opponent_id)
        or (challenger_id = p_opponent_id and opponent_id = v_user)
      )
  ) then
    raise exception using errcode = '23505',
      message = 'You already have an open duel with this student for this skill';
  end if;

  -- Stops two friends trading wins to inflate their rating.
  select count(*) into v_today_count
  from public.duels
  where created_at >= current_date
    and status in ('pending', 'completed')
    and (
      (challenger_id = v_user and opponent_id = p_opponent_id)
      or (challenger_id = p_opponent_id and opponent_id = v_user)
    );

  if v_today_count >= 3 then
    raise exception using errcode = '22023',
      message = 'You have already dueled this student 3 times today';
  end if;

  -- Neither player may answer their own question, so those are left out of the
  -- locked set. Only approved questions enter the ranked pool.
  select array_agg(picked.id) into v_question_ids
  from (
    select q.id
    from public.quiz_questions q
    where q.skill_id = p_skill_id
      and q.status = 'active'
      and q.approved_for_duel
      and (q.author_id is null or q.author_id not in (v_user, p_opponent_id))
    order by random()
    limit 8
  ) picked;

  if v_question_ids is null or array_length(v_question_ids, 1) < 5 then
    raise exception using errcode = '22023',
      message = 'This skill does not have enough approved duel questions yet';
  end if;

  insert into public.duels (skill_id, challenger_id, opponent_id, question_ids)
  values (p_skill_id, v_user, p_opponent_id, v_question_ids)
  returning * into v_duel;

  insert into public.notifications (
    recipient_id, actor_id, notification_type, title, body, entity_id
  )
  values (
    p_opponent_id,
    v_user,
    'duel_challenged',
    'New Skill Duel',
    coalesce(
      (select full_name from public.profiles where id = v_user),
      'A student'
    ) || ' challenged you in ' || v_skill_name || '.',
    v_duel.id
  );

  return jsonb_build_object(
    'id', v_duel.id,
    'skill_id', v_duel.skill_id,
    'skill_name', v_skill_name,
    'opponent_id', p_opponent_id,
    'opponent_name', v_opponent_name,
    'question_count', array_length(v_question_ids, 1),
    'expires_at', v_duel.expires_at
  );
end;
$$;

revoke all on function public.create_duel(uuid, uuid) from public, anon;
grant execute on function public.create_duel(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Leaderboard and preferences
-- ---------------------------------------------------------------------------

create or replace function public.get_arena_leaderboard(
  p_scope text default 'global',
  p_period text default 'all',
  p_skill_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_result jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if p_scope not in ('global', 'course') then
    raise exception using errcode = '22023', message = 'Unknown leaderboard scope';
  end if;

  if p_period not in ('all', 'week') then
    raise exception using errcode = '22023', message = 'Unknown leaderboard period';
  end if;

  select coalesce(jsonb_agg(row_to_json(t) order by t.rank_no), '[]'::jsonb)
  into v_result
  from (
    select
      row_number() over (
        order by
          case when p_period = 'week' then b.week_xp else b.rating end desc,
          case when p_period = 'week' then b.rating else b.all_xp end desc,
          b.full_name
      ) as rank_no,
      b.student_id,
      b.full_name,
      b.tier,
      b.rating,
      case when p_period = 'week' then b.week_xp else b.all_xp end as points,
      b.wins,
      b.losses,
      b.draws,
      b.student_id = v_user as is_me
    from (
      select
        p.id as student_id,
        coalesce(p.full_name, 'SkillForge student') as full_name,
        public.arena_tier(coalesce(r.rating, 1000)) as tier,
        coalesce(r.rating, 1000) as rating,
        coalesce(r.wins, 0) as wins,
        coalesce(r.losses, 0) as losses,
        coalesce(r.draws, 0) as draws,
        (
          select coalesce(sum(a.xp_awarded), 0)
          from public.arena_xp_awards a
          where a.student_id = p.id
            and a.awarded_on >= current_date - 6
            and (p_skill_id is null or a.skill_id = p_skill_id)
        ) as week_xp,
        (
          select coalesce(sum(a.xp_awarded), 0)
          from public.arena_xp_awards a
          where a.student_id = p.id
            and (p_skill_id is null or a.skill_id = p_skill_id)
        ) as all_xp
      from public.profiles p
      left join public.arena_ratings r on r.student_id = p.id
      where coalesce(r.leaderboard_opt_out, false) = false
        and (
          p_scope = 'global'
          or p.course = (select me.course from public.profiles me where me.id = v_user)
        )
        and (
          p_skill_id is null
          or exists (
            select 1 from public.student_skills ss
            where ss.student_id = p.id and ss.skill_id = p_skill_id
          )
        )
    ) b
    order by
      case when p_period = 'week' then b.week_xp else b.rating end desc,
      case when p_period = 'week' then b.rating else b.all_xp end desc,
      b.full_name
    limit 50
  ) t;

  return v_result;
end;
$$;

revoke all on function public.get_arena_leaderboard(text, text, uuid) from public, anon;
grant execute on function public.get_arena_leaderboard(text, text, uuid) to authenticated;

create or replace function public.set_arena_leaderboard_opt_out(p_opt_out boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  insert into public.arena_ratings (student_id, leaderboard_opt_out)
  values (v_user, coalesce(p_opt_out, false))
  on conflict (student_id) do update
    set leaderboard_opt_out = coalesce(p_opt_out, false),
        updated_at = now();
end;
$$;

revoke all on function public.set_arena_leaderboard_opt_out(boolean) from public, anon;
grant execute on function public.set_arena_leaderboard_opt_out(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Question authoring and moderation
-- ---------------------------------------------------------------------------

create or replace function public.get_my_question_bank()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_skills jsonb := '[]'::jsonb;
  v_questions jsonb := '[]'::jsonb;
  v_moderator boolean := public.is_moderator();
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  select coalesce(jsonb_agg(row_to_json(t) order by t.name), '[]'::jsonb)
  into v_skills
  from (
    select s.id, s.name, s.category
    from public.skills s
    where v_moderator
      or exists (
        select 1 from public.student_skills ss
        where ss.student_id = v_user
          and ss.skill_id = s.id
          and ss.is_teachable
      )
  ) t;

  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
  into v_questions
  from (
    select
      q.id,
      q.skill_id,
      s.name as skill_name,
      q.prompt,
      q.options,
      q.correct_index,
      q.explanation,
      q.difficulty,
      q.status,
      q.approved_for_duel,
      q.answer_count,
      q.correct_count,
      q.created_at
    from public.quiz_questions q
    join public.skills s on s.id = q.skill_id
    where q.author_id = v_user
  ) t;

  return jsonb_build_object('skills', v_skills, 'questions', v_questions);
end;
$$;

revoke all on function public.get_my_question_bank() from public, anon;
grant execute on function public.get_my_question_bank() to authenticated;

create or replace function public.upsert_quiz_question(
  p_skill_id uuid,
  p_prompt text,
  p_options jsonb,
  p_correct_index integer,
  p_explanation text default null,
  p_difficulty text default 'medium',
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_moderator boolean := public.is_moderator();
  v_question public.quiz_questions;
  v_prompt text := nullif(btrim(coalesce(p_prompt, '')), '');
  v_explanation text := nullif(btrim(coalesce(p_explanation, '')), '');
  v_difficulty text := coalesce(nullif(btrim(p_difficulty), ''), 'medium');
  v_option_count integer;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  if v_prompt is null then
    raise exception using errcode = '22023', message = 'Write the question first';
  end if;

  if p_skill_id is null or not exists (select 1 from public.skills where id = p_skill_id) then
    raise exception using errcode = '22023', message = 'Choose a skill from the catalog';
  end if;

  if not v_moderator and not exists (
    select 1 from public.student_skills
    where student_id = v_user and skill_id = p_skill_id and is_teachable
  ) then
    raise exception using errcode = '42501',
      message = 'Only students who teach this skill can add questions for it';
  end if;

  if p_options is null
    or jsonb_typeof(p_options) <> 'array'
    or jsonb_array_length(p_options) < 2
    or jsonb_array_length(p_options) > 6 then
    raise exception using errcode = '22023',
      message = 'Provide between 2 and 6 answer options';
  end if;

  v_option_count := jsonb_array_length(p_options);

  if exists (
    select 1 from jsonb_array_elements_text(p_options) as opt
    where btrim(opt) = ''
  ) then
    raise exception using errcode = '22023', message = 'Answer options cannot be blank';
  end if;

  if p_correct_index is null or p_correct_index < 0 or p_correct_index >= v_option_count then
    raise exception using errcode = '22023', message = 'Choose which option is correct';
  end if;

  if v_difficulty not in ('easy', 'medium', 'hard') then
    raise exception using errcode = '22023', message = 'Difficulty must be easy, medium or hard';
  end if;

  if p_id is null then
    insert into public.quiz_questions (
      skill_id, author_id, source, prompt, options, correct_index,
      explanation, difficulty, status, approved_for_duel
    )
    values (
      p_skill_id,
      v_user,
      case when v_moderator then 'system' else 'teacher' end,
      v_prompt,
      p_options,
      p_correct_index,
      v_explanation,
      v_difficulty,
      'active',
      v_moderator
    )
    returning * into v_question;
  else
    select * into v_question from public.quiz_questions where id = p_id for update;
    if not found then
      raise exception using errcode = '22023', message = 'That question no longer exists';
    end if;

    if not v_moderator and v_question.author_id <> v_user then
      raise exception using errcode = '42501', message = 'That question is not yours';
    end if;

    -- Editing changes the question, so any duel approval must be earned again.
    update public.quiz_questions
    set skill_id = p_skill_id,
        prompt = v_prompt,
        options = p_options,
        correct_index = p_correct_index,
        explanation = v_explanation,
        difficulty = v_difficulty,
        status = 'active',
        approved_for_duel = v_moderator,
        updated_at = now()
    where id = p_id
    returning * into v_question;
  end if;

  return to_jsonb(v_question);
end;
$$;

revoke all on function public.upsert_quiz_question(uuid, text, jsonb, integer, text, text, uuid)
  from public, anon;
grant execute on function public.upsert_quiz_question(uuid, text, jsonb, integer, text, text, uuid)
  to authenticated;

create or replace function public.admin_list_quiz_questions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb := '[]'::jsonb;
begin
  if not public.is_moderator() then
    raise exception using errcode = '42501', message = 'Moderator access is required';
  end if;

  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
  into v_result
  from (
    select
      q.id,
      q.skill_id,
      s.name as skill_name,
      q.prompt,
      q.options,
      q.correct_index,
      q.explanation,
      q.difficulty,
      q.status,
      q.approved_for_duel,
      q.source,
      q.author_id,
      coalesce(p.full_name, 'System') as author_name,
      q.answer_count,
      q.correct_count,
      case
        when q.answer_count = 0 then null
        else round((q.correct_count::numeric / q.answer_count) * 100)
      end as correct_rate,
      q.created_at
    from public.quiz_questions q
    join public.skills s on s.id = q.skill_id
    left join public.profiles p on p.id = q.author_id
  ) t;

  return v_result;
end;
$$;

revoke all on function public.admin_list_quiz_questions() from public, anon;
grant execute on function public.admin_list_quiz_questions() to authenticated;

create or replace function public.admin_set_quiz_question(
  p_id uuid,
  p_approved_for_duel boolean default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question public.quiz_questions;
begin
  if not public.is_moderator() then
    raise exception using errcode = '42501', message = 'Moderator access is required';
  end if;

  if p_status is not null and p_status not in ('active', 'rejected', 'flagged') then
    raise exception using errcode = '22023', message = 'Unknown question status';
  end if;

  select * into v_question from public.quiz_questions where id = p_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'That question no longer exists';
  end if;

  update public.quiz_questions
  set approved_for_duel = coalesce(p_approved_for_duel, approved_for_duel),
      status = coalesce(p_status, status),
      updated_at = now()
  where id = p_id
  returning * into v_question;

  return to_jsonb(v_question);
end;
$$;

revoke all on function public.admin_set_quiz_question(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_quiz_question(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Notifications
-- ---------------------------------------------------------------------------

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'session_request',
    'session_accepted',
    'session_declined',
    'session_completed',
    'challenge_submitted',
    'challenge_reviewed',
    'achievement_unlocked',
    'new_message',
    'activity_reviewed',
    'project_added',
    'project_task_assigned',
    'duel_challenged',
    'duel_completed'
  ));

-- ---------------------------------------------------------------------------
-- 10. Starter question bank
-- ---------------------------------------------------------------------------

-- Ten starter questions per catalog skill, so a Solo Rush round of eight never
-- has to repeat a question and a Duel always has a varied locked set.
insert into public.quiz_questions (
  skill_id, author_id, source, prompt, options, correct_index,
  explanation, difficulty, status, approved_for_duel
)
select
  s.id,
  null,
  'system',
  q.prompt,
  q.options::jsonb,
  q.correct_index,
  q.explanation,
  q.difficulty,
  'active',
  true
from public.skills s
join (values
  -- Python
  ('Python', 'What does len("hello") return?', '["4","5","6","Error"]', 1, 'len counts characters, and hello has five.', 'easy'),
  ('Python', 'Which keyword defines a function?', '["def","func","function","lambda"]', 0, 'def starts a function definition in Python.', 'easy'),
  ('Python', 'What is the result of 3 // 2?', '["1.5","1","2","0"]', 1, 'The // operator performs floor division.', 'easy'),
  ('Python', 'Which type is immutable?', '["list","dict","set","tuple"]', 3, 'A tuple cannot be changed after it is created.', 'medium'),
  ('Python', 'What does range(3) produce?', '["1, 2, 3","0, 1, 2","0, 1, 2, 3","3"]', 1, 'range(3) starts at zero and stops before three.', 'easy'),
  ('Python', 'How do you handle an exception?', '["try and except","if and else","for and while","switch and case"]', 0, 'try and except wrap code that may fail.', 'easy'),
  ('Python', 'What is None in Python?', '["0","an empty string","the null value","False"]', 2, 'None represents the absence of a value.', 'easy'),
  ('Python', 'Which list method adds an item to the end?', '["push()","append()","add()","insert()"]', 1, 'append adds one item to the end of a list.', 'easy'),
  ('Python', 'What does == compare?', '["identity","value","type only","memory address"]', 1, '== compares values, while is compares identity.', 'medium'),
  ('Python', 'Which module handles JSON?', '["json","csv","os","re"]', 0, 'The json module encodes and decodes JSON.', 'easy'),

  -- JavaScript
  ('JavaScript', 'Which keyword declares a block-scoped variable that can be reassigned?', '["var","let","const","define"]', 1, 'let is block-scoped and can be reassigned.', 'easy'),
  ('JavaScript', 'What does === check?', '["value only","type only","value and type","reference only"]', 2, '=== compares both value and type.', 'easy'),
  ('JavaScript', 'What is typeof null?', '["null","object","undefined","number"]', 1, 'This is a long-standing quirk of the language.', 'medium'),
  ('JavaScript', 'Which method adds an element to the end of an array?', '["push","pop","shift","unshift"]', 0, 'push appends an element to the end.', 'easy'),
  ('JavaScript', 'What does Array.map return?', '["the original array","a new array","undefined","a number"]', 1, 'map builds a new array from the callback results.', 'easy'),
  ('JavaScript', 'Which is NOT a primitive type?', '["string","number","object","boolean"]', 2, 'Objects are reference values, not primitives.', 'medium'),
  ('JavaScript', 'What does JSON.parse do?', '["converts an object to a string","converts a string to a value","validates a schema","escapes characters"]', 1, 'JSON.parse turns JSON text into a JavaScript value.', 'easy'),
  ('JavaScript', 'What is a Promise?', '["a value that is already resolved","an object representing a future result","a type of array","a CSS selector"]', 1, 'A Promise represents work that finishes later.', 'medium'),
  ('JavaScript', 'Which operator is the nullish coalescing operator?', '["??","||","&&","?."]', 0, '?? falls back only when the left side is null or undefined.', 'medium'),
  ('JavaScript', 'What does addEventListener do?', '["removes a listener","attaches an event handler","creates an element","stops propagation"]', 1, 'It registers a handler for an event.', 'easy'),

  -- Java
  ('Java', 'Which keyword creates a subclass?', '["implements","extends","inherits","super"]', 1, 'extends declares that a class inherits from another.', 'easy'),
  ('Java', 'What is the entry point of a Java program?', '["start()","main()","run()","init()"]', 1, 'Execution begins in the main method.', 'easy'),
  ('Java', 'Which type stores a single character?', '["String","char","byte","boolean"]', 1, 'char holds one UTF-16 code unit.', 'easy'),
  ('Java', 'What does System.out.println do?', '["reads input","prints a line","clears the console","throws an error"]', 1, 'It writes a line to standard output.', 'easy'),
  ('Java', 'Which collection does not allow duplicate elements?', '["List","Set","Map","Queue"]', 1, 'A Set holds unique elements.', 'medium'),
  ('Java', 'What is the default value of an int field?', '["null","0","1","undefined"]', 1, 'Numeric fields default to zero.', 'medium'),
  ('Java', 'Which keyword prevents inheritance?', '["static","final","private","abstract"]', 1, 'A final class cannot be extended.', 'medium'),
  ('Java', 'What does JVM stand for?', '["Java Virtual Machine","Java Version Manager","Just-in-time Virtual Memory","Java Variable Model"]', 0, 'The JVM runs compiled Java bytecode.', 'easy'),
  ('Java', 'Which exception is unchecked?', '["IOException","NullPointerException","SQLException","FileNotFoundException"]', 1, 'NullPointerException does not have to be declared.', 'medium'),
  ('Java', 'What is an interface used for?', '["defining a contract","storing data only","allocating memory","starting threads"]', 0, 'An interface declares methods that classes must implement.', 'medium'),

  -- C#
  ('C#', 'Which keyword declares a compile-time constant?', '["readonly","const","static","sealed"]', 1, 'const is fixed at compile time.', 'easy'),
  ('C#', 'What does Console.WriteLine do?', '["reads a line","writes a line","opens a file","clears the screen"]', 1, 'It writes a line to the console.', 'easy'),
  ('C#', 'Which type is a value type?', '["string","int","object","array"]', 1, 'int is a value type; the others are reference types.', 'medium'),
  ('C#', 'What is LINQ used for?', '["querying collections","managing memory","compiling code","styling UI"]', 0, 'LINQ queries data from many sources.', 'medium'),
  ('C#', 'Which keyword is used to catch an exception?', '["try","catch","finally","throw"]', 1, 'catch handles an exception raised in a try block.', 'easy'),
  ('C#', 'What does async enable?', '["parallel threads","non-blocking await","garbage collection","reflection"]', 1, 'async lets a method await work without blocking.', 'medium'),
  ('C#', 'Which symbol starts a single-line comment?', '["#","//","--","/*"]', 1, 'Two slashes start a single-line comment.', 'easy'),
  ('C#', 'What is a namespace for?', '["organising code","allocating memory","defining loops","handling events"]', 0, 'Namespaces group related types.', 'easy'),
  ('C#', 'What does string.Empty represent?', '["null","an empty string","a space","a newline"]', 1, 'It is a zero-length string.', 'easy'),
  ('C#', 'Which keyword makes a member accessible only within its class?', '["public","private","protected","internal"]', 1, 'private limits access to the declaring class.', 'easy'),

  -- HTML
  ('HTML', 'Which tag creates a hyperlink?', '["link","a","href","nav"]', 1, 'The a element creates an anchor link.', 'easy'),
  ('HTML', 'Which tag is the largest heading?', '["h6","h1","head","header"]', 1, 'h1 is the highest-level heading.', 'easy'),
  ('HTML', 'Which attribute does img need to show an image?', '["src","href","link","url"]', 0, 'src points to the image file.', 'easy'),
  ('HTML', 'Which element creates an ordered list?', '["ul","ol","li","dl"]', 1, 'ol renders a numbered list.', 'easy'),
  ('HTML', 'What is the purpose of alt text on an image?', '["styling","alternative text for accessibility","image size","loading speed"]', 1, 'alt describes the image when it cannot be seen.', 'easy'),
  ('HTML', 'Which tag holds page metadata?', '["body","head","main","meta"]', 1, 'The head element holds metadata and links.', 'medium'),
  ('HTML', 'Which attribute gives an element a unique identifier?', '["class","id","name","key"]', 1, 'id must be unique on the page.', 'easy'),
  ('HTML', 'Which tag creates a line break?', '["br","lb","break","hr"]', 0, 'br inserts a line break.', 'easy'),
  ('HTML', 'What is semantic HTML?', '["styling with CSS","markup that describes meaning","a JavaScript framework","a database format"]', 1, 'Semantic tags describe the role of content.', 'medium'),
  ('HTML', 'Which input type creates a checkbox?', '["text","checkbox","radio","button"]', 1, 'type checkbox renders a tick box.', 'easy'),

  -- CSS
  ('CSS', 'Which property changes text colour?', '["background","color","font","text"]', 1, 'The color property sets text colour.', 'easy'),
  ('CSS', 'What does display: flex do?', '["hides the element","enables flexbox layout","adds a border","centres text only"]', 1, 'flex turns the element into a flex container.', 'easy'),
  ('CSS', 'Which unit is relative to the root font size?', '["px","em","rem","vh"]', 2, 'rem is relative to the root element font size.', 'medium'),
  ('CSS', 'What does position: absolute do?', '["stays in normal flow","positions against the nearest positioned ancestor","fixes to the viewport","floats left"]', 1, 'Absolute elements are removed from normal flow.', 'medium'),
  ('CSS', 'Which selector targets a class?', '[".name","#name","name","*name"]', 0, 'A leading dot selects by class.', 'easy'),
  ('CSS', 'What is the box model made of?', '["content, padding, border, margin","width, height, colour, font","grid, flex, block, inline","top, right, bottom, left"]', 0, 'Every box has those four layers.', 'medium'),
  ('CSS', 'Which property adds space inside the border?', '["margin","padding","gap","border-spacing"]', 1, 'Padding sits between content and border.', 'easy'),
  ('CSS', 'What does z-index control?', '["stacking order","zoom level","font size","grid columns"]', 0, 'z-index decides which element paints on top.', 'easy'),
  ('CSS', 'Which media query targets screens wider than 768px?', '["@media (max-width: 768px)","@media (min-width: 768px)","@media (width: 768px)","@media (screen: 768px)"]', 1, 'min-width matches that width and above.', 'medium'),
  ('CSS', 'What does :hover target?', '["a clicked element","an element under the pointer","a focused input","a visited link"]', 1, 'hover applies while the pointer is over the element.', 'easy'),

  -- React
  ('React', 'What is a React component?', '["a CSS class","a reusable UI function or class","a database table","a browser API"]', 1, 'Components are the building blocks of a React UI.', 'easy'),
  ('React', 'Which hook stores local state?', '["useEffect","useState","useRef","useMemo"]', 1, 'useState returns a value and a setter.', 'easy'),
  ('React', 'What does the key prop help React do?', '["style elements","identify list items","fetch data","handle events"]', 1, 'Keys help React match items between renders.', 'medium'),
  ('React', 'Which hook runs side effects?', '["useState","useEffect","useContext","useReducer"]', 1, 'useEffect runs after render for side effects.', 'easy'),
  ('React', 'What is JSX?', '["a database query language","a syntax extension for JavaScript","a CSS preprocessor","a testing library"]', 1, 'JSX lets you write markup inside JavaScript.', 'easy'),
  ('React', 'How do you pass data to a child component?', '["state","props","context only","refs"]', 1, 'Props flow from parent to child.', 'easy'),
  ('React', 'What does useMemo do?', '["memoises a computed value","creates a ref","runs effects","fetches data"]', 0, 'useMemo caches a value between renders.', 'medium'),
  ('React', 'What is the virtual DOM?', '["a browser API","an in-memory representation of the UI","a CSS framework","a build tool"]', 1, 'React compares virtual trees before updating the DOM.', 'medium'),
  ('React', 'Which update is safe when the next state depends on the previous one?', '["setState(value)","setState(prev => next)","state = value","forceUpdate()"]', 1, 'The updater form receives the latest state.', 'medium'),
  ('React', 'How is conditional rendering usually written?', '["if or a ternary in JSX","only CSS","only HTML","a database flag"]', 0, 'JavaScript expressions decide what JSX renders.', 'easy'),

  -- Node.js
  ('Node.js', 'What is Node.js?', '["a browser","a JavaScript runtime","a database","a CSS framework"]', 1, 'Node runs JavaScript outside the browser.', 'easy'),
  ('Node.js', 'Which module handles the file system?', '["fs","path","http","os"]', 0, 'fs reads and writes files.', 'easy'),
  ('Node.js', 'What does npm stand for?', '["Node Package Manager","New Programming Method","Node Process Monitor","Native Package Module"]', 0, 'npm installs and manages packages.', 'easy'),
  ('Node.js', 'What is package.json for?', '["styling","project metadata and dependencies","database schema","HTML templates"]', 1, 'It describes the project and its dependencies.', 'easy'),
  ('Node.js', 'Which object reads environment variables?', '["process.env","os.env","fs.env","global.env"]', 0, 'process.env holds environment variables.', 'easy'),
  ('Node.js', 'What is middleware in Express?', '["a database table","a function that runs during a request","a CSS class","a template engine"]', 1, 'Middleware runs in order before the route handler.', 'medium'),
  ('Node.js', 'Which module creates an HTTP server?', '["fs","http","path","url"]', 1, 'http.createServer builds a server.', 'easy'),
  ('Node.js', 'What does require do?', '["imports a module","exports a module","starts a server","reads a file"]', 0, 'require loads a CommonJS module.', 'easy'),
  ('Node.js', 'What is a callback?', '["a function passed to another function","a database record","a CSS property","an HTTP status"]', 0, 'The receiving function calls it later.', 'medium'),
  ('Node.js', 'What does async and await simplify?', '["styling","asynchronous code","routing","testing"]', 1, 'They make promise-based code read like steps.', 'easy'),

  -- UI/UX Design
  ('UI/UX Design', 'What does UX stand for?', '["User Experience","Universal Exchange","User Extension","Unified Experience"]', 0, 'UX is about how a person experiences a product.', 'easy'),
  ('UI/UX Design', 'What is a wireframe?', '["a finished design","a low-fidelity layout sketch","a colour palette","a font family"]', 1, 'Wireframes show structure before visual design.', 'easy'),
  ('UI/UX Design', 'Why is contrast important?', '["it looks nice","it improves readability and accessibility","it reduces file size","it speeds loading"]', 1, 'Strong contrast keeps text legible.', 'easy'),
  ('UI/UX Design', 'What is a user persona?', '["a fictional representation of a user type","a real customer","a design tool","a colour scheme"]', 0, 'Personas summarise research into a target user.', 'medium'),
  ('UI/UX Design', 'What is usability testing?', '["testing code coverage","observing real users complete tasks","checking server uptime","reviewing brand colours"]', 1, 'Watching users reveals where a design fails.', 'medium'),
  ('UI/UX Design', 'What does WCAG cover?', '["web accessibility","database design","networking","video editing"]', 0, 'WCAG is the web content accessibility guidance.', 'medium'),
  ('UI/UX Design', 'What is a call to action?', '["a prompt that invites the user to act","a legal notice","a navigation bar","a loading spinner"]', 0, 'A call to action asks for the next step.', 'easy'),
  ('UI/UX Design', 'What is information architecture?', '["organising content and navigation","choosing fonts","writing code","hosting a site"]', 0, 'It shapes how content is grouped and found.', 'medium'),
  ('UI/UX Design', 'What is a prototype?', '["a final product","an interactive early model","a database","a server"]', 1, 'Prototypes test flow before building.', 'easy'),
  ('UI/UX Design', 'Why use consistent spacing?', '["to create visual rhythm and clarity","to increase file size","to slow users down","to hide content"]', 0, 'Consistent spacing makes layouts feel ordered.', 'easy'),

  -- Figma
  ('Figma', 'What is a frame in Figma?', '["a container for design content","a colour style","a plugin","a font"]', 0, 'Frames hold and clip their contents.', 'easy'),
  ('Figma', 'What does auto layout do?', '["adds animation","arranges items automatically","exports assets","creates comments"]', 1, 'Auto layout stacks or aligns children as they change.', 'easy'),
  ('Figma', 'What is a component in Figma?', '["a reusable design element","a colour","a page","a prototype link"]', 0, 'Components can be reused as instances.', 'easy'),
  ('Figma', 'What is a variant used for?', '["different states of a component","animation timing","file storage","font licensing"]', 0, 'Variants group states such as default and hover.', 'medium'),
  ('Figma', 'What do constraints control?', '["how elements resize with their frame","colour contrast","font weight","export size"]', 0, 'Constraints pin edges during resizing.', 'medium'),
  ('Figma', 'What is a prototype connection?', '["a link between frames","a shared style","a plugin setting","a comment"]', 0, 'Connections wire up clickable flows.', 'easy'),
  ('Figma', 'What is a shared style?', '["a reusable colour or text property","a component instance","a page","a layer"]', 0, 'Shared styles keep colour and type consistent.', 'easy'),
  ('Figma', 'What does detach instance do?', '["deletes the component","breaks the link to the main component","exports the frame","locks the layer"]', 1, 'A detached copy stops following the main component.', 'medium'),
  ('Figma', 'Which tab creates clickable flows?', '["Prototype","Assets","Layers","Comments"]', 0, 'The Prototype tab wires frames together.', 'easy'),
  ('Figma', 'What is a design system?', '["a set of reusable components and rules","a single mockup","a plugin","a font"]', 0, 'A design system keeps a product consistent.', 'medium'),

  -- Networking
  ('Networking', 'What does IP stand for?', '["Internet Protocol","Internal Process","Integrated Packet","Interface Port"]', 0, 'IP is the Internet Protocol.', 'easy'),
  ('Networking', 'What does DNS do?', '["assigns IP addresses","translates domain names to IP addresses","encrypts traffic","routes email"]', 1, 'DNS resolves names into addresses.', 'easy'),
  ('Networking', 'Which protocol is connection-oriented?', '["UDP","TCP","ICMP","ARP"]', 1, 'TCP establishes and tracks a connection.', 'medium'),
  ('Networking', 'What is a subnet mask used for?', '["encrypting data","separating network and host portions","routing email","assigning ports"]', 1, 'The mask splits an address into network and host bits.', 'medium'),
  ('Networking', 'What does HTTP status 404 mean?', '["OK","Not Found","Server Error","Redirect"]', 1, '404 means the resource was not found.', 'easy'),
  ('Networking', 'What is a MAC address?', '["a hardware address for a network interface","a website name","a port number","an encryption key"]', 0, 'MAC addresses identify a network interface.', 'easy'),
  ('Networking', 'Which device forwards packets between networks?', '["hub","switch","router","repeater"]', 2, 'Routers choose paths between networks.', 'easy'),
  ('Networking', 'What is DHCP used for?', '["automatic IP configuration","domain lookup","file transfer","email"]', 0, 'DHCP hands out addresses automatically.', 'easy'),
  ('Networking', 'What does LAN stand for?', '["Local Area Network","Long Access Node","Linked Application Network","Logical Address Number"]', 0, 'A LAN covers a small area.', 'easy'),
  ('Networking', 'Which port does HTTPS use by default?', '["80","443","22","25"]', 1, 'HTTPS defaults to port 443.', 'medium'),

  -- Cisco
  ('Cisco', 'What does CLI stand for?', '["Command Line Interface","Cisco Link Interface","Common Layer Integration","Control Logic Input"]', 0, 'The CLI accepts typed commands.', 'easy'),
  ('Cisco', 'Which command enters global configuration mode?', '["configure terminal","enable","show run","copy run start"]', 0, 'configure terminal moves into global config.', 'easy'),
  ('Cisco', 'What does a VLAN do?', '["segments a network logically","encrypts traffic","assigns IP addresses","routes between domains"]', 0, 'VLANs separate traffic without separate hardware.', 'medium'),
  ('Cisco', 'Which command saves the running configuration?', '["copy running-config startup-config","show ip interface","reload","erase startup-config"]', 0, 'It copies the running config to startup.', 'medium'),
  ('Cisco', 'What is OSPF?', '["a routing protocol","a switching mode","a cable standard","a security policy"]', 0, 'OSPF is a link-state routing protocol.', 'medium'),
  ('Cisco', 'What does show ip route display?', '["the routing table","interface errors","VLAN membership","CPU usage"]', 0, 'It lists known routes.', 'easy'),
  ('Cisco', 'What is STP used to prevent?', '["routing loops","switching loops","DNS failures","IP conflicts"]', 1, 'Spanning Tree blocks redundant switch paths.', 'medium'),
  ('Cisco', 'Which mode is indicated by the prompt Router>?', '["user EXEC","privileged EXEC","global config","interface config"]', 0, 'The > prompt is user EXEC mode.', 'medium'),
  ('Cisco', 'What does NAT do?', '["translates IP addresses","encrypts passwords","assigns VLANs","routes multicast"]', 0, 'NAT rewrites addresses in transit.', 'medium'),
  ('Cisco', 'What is a trunk port used for?', '["carrying multiple VLANs","connecting a single host","powering devices","encrypting traffic"]', 0, 'Trunks carry traffic for several VLANs.', 'medium'),

  -- MySQL
  ('MySQL', 'Which statement retrieves rows?', '["SELECT","INSERT","UPDATE","DELETE"]', 0, 'SELECT reads rows from tables.', 'easy'),
  ('MySQL', 'What does PRIMARY KEY do?', '["uniquely identifies each row","encrypts a column","creates an index only","deletes duplicates"]', 0, 'A primary key is unique and not null.', 'easy'),
  ('MySQL', 'Which clause filters rows?', '["WHERE","GROUP BY","ORDER BY","LIMIT"]', 0, 'WHERE keeps rows that match a condition.', 'easy'),
  ('MySQL', 'What does JOIN do?', '["combines rows from tables","deletes rows","creates a table","renames a column"]', 0, 'JOIN links rows using a related column.', 'easy'),
  ('MySQL', 'Which function counts rows?', '["SUM()","COUNT()","AVG()","MAX()"]', 1, 'COUNT returns the number of rows.', 'easy'),
  ('MySQL', 'What is a foreign key?', '["a link to a primary key in another table","a unique index","a password","a stored procedure"]', 0, 'Foreign keys enforce referential integrity.', 'medium'),
  ('MySQL', 'Which statement adds a row?', '["INSERT","SELECT","DROP","ALTER"]', 0, 'INSERT adds a new row.', 'easy'),
  ('MySQL', 'What does ORDER BY do?', '["sorts results","filters results","groups results","limits results"]', 0, 'ORDER BY sorts the result set.', 'easy'),
  ('MySQL', 'What is an index used for?', '["speeding up lookups","encrypting data","storing images","creating users"]', 0, 'Indexes make reads faster.', 'medium'),
  ('MySQL', 'Which type stores a date and time?', '["DATETIME","VARCHAR","INT","BOOLEAN"]', 0, 'DATETIME holds both date and time.', 'easy'),

  -- PostgreSQL
  ('PostgreSQL', 'What is the default port for PostgreSQL?', '["3306","5432","27017","6379"]', 1, 'PostgreSQL listens on 5432 by default.', 'easy'),
  ('PostgreSQL', 'What does SERIAL provide?', '["an auto-incrementing integer","a text type","a JSON type","a UUID"]', 0, 'SERIAL creates a sequence-backed integer.', 'easy'),
  ('PostgreSQL', 'What is MVCC?', '["multi-version concurrency control","a backup format","a replication mode","an index type"]', 0, 'MVCC keeps row versions for concurrent readers.', 'medium'),
  ('PostgreSQL', 'Which command starts a transaction?', '["BEGIN","START","OPEN","COMMIT"]', 0, 'BEGIN opens a transaction block.', 'easy'),
  ('PostgreSQL', 'What does RETURNING do?', '["returns rows from a write","rolls back a transaction","creates a view","grants access"]', 0, 'RETURNING exposes written rows immediately.', 'medium'),
  ('PostgreSQL', 'Which type stores JSON?', '["JSONB","TEXTB","BLOB","XMLB"]', 0, 'JSONB stores binary JSON.', 'easy'),
  ('PostgreSQL', 'Which keyword introduces a common table expression?', '["WITH","AS","USING","FROM"]', 0, 'WITH names a temporary result set.', 'medium'),
  ('PostgreSQL', 'What does RLS stand for?', '["Row Level Security","Relational Link System","Read Lock State","Remote Logging Service"]', 0, 'RLS filters rows per user.', 'medium'),
  ('PostgreSQL', 'Which extension provides UUID generation?', '["pgcrypto","uuid-ossp","pg_stat","hstore"]', 1, 'uuid-ossp provides UUID functions.', 'medium'),
  ('PostgreSQL', 'What does ON CONFLICT DO NOTHING do?', '["ignores duplicate inserts","deletes conflicts","updates conflicts","locks the table"]', 0, 'It skips rows that violate a constraint.', 'medium'),

  -- Video Editing
  ('Video Editing', 'What is a frame rate?', '["frames shown per second","file size","colour depth","audio level"]', 0, 'Frame rate counts frames per second.', 'easy'),
  ('Video Editing', 'What is a cut?', '["an instant transition between shots","a fade","a zoom","a title"]', 0, 'A cut jumps straight from one shot to the next.', 'easy'),
  ('Video Editing', 'What does B-roll mean?', '["supplementary footage","the main interview","background music","a title card"]', 0, 'B-roll supports the main story visually.', 'medium'),
  ('Video Editing', 'What is colour grading?', '["adjusting colours for consistency and mood","adding subtitles","cutting clips","mixing audio"]', 0, 'Grading shapes the look of the footage.', 'medium'),
  ('Video Editing', 'What is a timeline?', '["where clips are arranged","a render setting","a codec","a camera"]', 0, 'The timeline is the editing workspace.', 'easy'),
  ('Video Editing', 'What does 24 fps give video?', '["a cinematic feel","higher resolution","better audio","smaller files"]', 0, '24 fps is the traditional film rate.', 'medium'),
  ('Video Editing', 'What is a jump cut?', '["a cut that skips time in the same shot","a fade to black","a title","a zoom"]', 0, 'Jump cuts compress time within a shot.', 'medium'),
  ('Video Editing', 'What is the purpose of a codec?', '["compressing and decompressing video","storing subtitles","balancing audio","adding transitions"]', 0, 'Codecs encode and decode media.', 'easy'),
  ('Video Editing', 'What is a crossfade?', '["a gradual transition between clips","a hard cut","a title","a colour preset"]', 0, 'A crossfade blends one clip into the next.', 'easy'),
  ('Video Editing', 'What does rendering mean?', '["processing the timeline into a video file","importing footage","recording audio","editing text"]', 0, 'Rendering writes the final file.', 'easy'),

  -- Graphic Design
  ('Graphic Design', 'What is the rule of thirds?', '["dividing an image into a 3x3 grid","using three colours","three fonts","three layers"]', 0, 'The grid helps place subjects off centre.', 'easy'),
  ('Graphic Design', 'What is negative space?', '["empty space around the subject","dark colours","a shadow","a border"]', 0, 'Negative space gives a composition room to breathe.', 'medium'),
  ('Graphic Design', 'What is a colour wheel used for?', '["choosing harmonious colours","measuring size","selecting fonts","cropping images"]', 0, 'The wheel shows colour relationships.', 'easy'),
  ('Graphic Design', 'What does kerning adjust?', '["space between individual letters","line height","image size","colour balance"]', 0, 'Kerning fine-tunes letter spacing.', 'medium'),
  ('Graphic Design', 'What is a vector graphic?', '["an image made of paths that scales without loss","a pixel image","a video","a font file"]', 0, 'Vectors stay sharp at any size.', 'easy'),
  ('Graphic Design', 'What is visual hierarchy?', '["guiding the eye by importance","layering images","using only one colour","centring everything"]', 0, 'Hierarchy tells the viewer what to read first.', 'medium'),
  ('Graphic Design', 'What is a complementary colour pair?', '["opposites on the colour wheel","neighbouring colours","the same colour","black and white"]', 0, 'Complements sit opposite each other.', 'medium'),
  ('Graphic Design', 'What is a bleed in print design?', '["extra artwork beyond the trim line","a type of font","a colour mode","a grid"]', 0, 'Bleed prevents white edges after trimming.', 'medium'),
  ('Graphic Design', 'What is CMYK used for?', '["print","screens","video","audio"]', 0, 'CMYK is a subtractive print model.', 'easy'),
  ('Graphic Design', 'What is alignment used for?', '["creating order and connection","adding texture","increasing contrast","animating"]', 0, 'Alignment ties elements together visually.', 'easy')
) as q(skill_name, prompt, options, correct_index, explanation, difficulty)
  on q.skill_name = s.name
on conflict (skill_id, prompt) do nothing;
