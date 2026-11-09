-- Store self-paced lesson completion per student. Completion is learning
-- progress only and does not award XP or Skill Credits.

create table public.self_paced_lesson_progress (
  student_id uuid not null references public.profiles(id) on delete cascade,
  lesson_key text not null check (char_length(lesson_key) between 1 and 120),
  completed_at timestamptz not null default now(),
  primary key (student_id, lesson_key)
);

alter table public.self_paced_lesson_progress enable row level security;
revoke all on public.self_paced_lesson_progress from public, anon, authenticated;
grant select, insert, update on public.self_paced_lesson_progress to authenticated;

create policy self_paced_progress_select_own
on public.self_paced_lesson_progress for select to authenticated
using (student_id = (select auth.uid()));

create policy self_paced_progress_insert_own
on public.self_paced_lesson_progress for insert to authenticated
with check (student_id = (select auth.uid()));

create policy self_paced_progress_update_own
on public.self_paced_lesson_progress for update to authenticated
using (student_id = (select auth.uid()))
with check (student_id = (select auth.uid()));
