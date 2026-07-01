-- Reckon cloud vault — secret-code sync (no user login required).
--
-- Model: one JSON document per secret `code`. The table is locked down
-- (RLS on, zero policies) so the public anon/publishable key CANNOT read or
-- write it directly. All access goes through two SECURITY DEFINER functions
-- that require knowing the long, high-entropy code (client generates ~118
-- bits). Knowledge of the code == access, like a secret share link.
--
-- Applied to project `reckon` (ref: sjxixnltjxpygcvxmfrx).

create table if not exists public.vaults (
  code       text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.vaults enable row level security;
-- No policies on purpose: PostgREST access for anon/authenticated is denied.
revoke all on public.vaults from anon, authenticated;

-- Pull the latest document for a code.
create or replace function public.vault_pull(p_code text)
returns table (data jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_code is null or length(p_code) < 16 then
    raise exception 'invalid code';
  end if;
  return query
    select v.data, v.updated_at from public.vaults v where v.code = p_code;
end;
$$;

-- Push a document. Last-write-wins by client updated_at; returns the
-- effective updated_at so the client can reconcile.
create or replace function public.vault_push(p_code text, p_data jsonb, p_updated_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  eff timestamptz;
begin
  if p_code is null or length(p_code) < 16 then
    raise exception 'invalid code';
  end if;
  insert into public.vaults as v (code, data, updated_at)
  values (p_code, coalesce(p_data, '{}'::jsonb), coalesce(p_updated_at, now()))
  on conflict (code) do update
    set data = excluded.data, updated_at = excluded.updated_at
    where excluded.updated_at >= v.updated_at
  returning v.updated_at into eff;

  if eff is null then
    select v.updated_at into eff from public.vaults v where v.code = p_code;
  end if;
  return eff;
end;
$$;

revoke all on function public.vault_pull(text) from public;
revoke all on function public.vault_push(text, jsonb, timestamptz) from public;
grant execute on function public.vault_pull(text) to anon, authenticated;
grant execute on function public.vault_push(text, jsonb, timestamptz) to anon, authenticated;
