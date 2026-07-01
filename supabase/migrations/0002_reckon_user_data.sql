-- Reckon v2 — real per-user cloud database with email/password auth.
-- Replaces the v1 secret-code vault. Each authenticated user owns exactly one
-- JSON document row, protected by row-level security scoped to auth.uid().
-- (Applied to project `reckon`, ref sjxixnltjxpygcvxmfrx.)

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

drop policy if exists "own row select" on public.user_data;
drop policy if exists "own row insert" on public.user_data;
drop policy if exists "own row update" on public.user_data;
drop policy if exists "own row delete" on public.user_data;

create policy "own row select" on public.user_data
  for select using (auth.uid() = user_id);
create policy "own row insert" on public.user_data
  for insert with check (auth.uid() = user_id);
create policy "own row update" on public.user_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row delete" on public.user_data
  for delete using (auth.uid() = user_id);

create or replace function public.touch_user_data()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch
  before update on public.user_data
  for each row execute function public.touch_user_data();

-- Auth note: Supabase requires email confirmation by default, which would
-- leave signups waiting on a (rate-limited) confirmation email. The `signup`
-- edge function (supabase/functions/signup) creates accounts pre-confirmed via
-- the admin API instead, so email/password login works instantly. The auth
-- trigger approach was not usable — the migration role can't touch schema auth.
