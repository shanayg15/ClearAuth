-- ClearAuth schema: the auth_requests table backing the agent pipeline.
-- Idempotent — safe to run repeatedly against a Supabase project (SQL editor).
-- Columns are snake_case and map to AuthRequest via apps/api/src/lib/store.ts.

create extension if not exists "pgcrypto";

create table if not exists public.auth_requests (
  id           uuid primary key default gen_random_uuid(),
  status       text not null default 'intake',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  uploaded_by  text not null,
  note_key     text,
  raw_note     text not null default '',
  patient      jsonb,
  extraction   jsonb,
  criteria     jsonb,
  form_fill    jsonb,
  compliance   jsonb,
  submission   jsonb,
  audit_trail  jsonb not null default '[]'::jsonb
);

create index if not exists auth_requests_updated_at_idx on public.auth_requests (updated_at desc);
create index if not exists auth_requests_status_idx on public.auth_requests (status);

-- Keep updated_at fresh on every write.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists auth_requests_set_updated_at on public.auth_requests;
create trigger auth_requests_set_updated_at
  before update on public.auth_requests
  for each row execute function public.set_updated_at();

-- RLS: the demo runs as a single doctor, so allow-all. Tighten before prod.
alter table public.auth_requests enable row level security;

drop policy if exists "allow all" on public.auth_requests;
create policy "allow all" on public.auth_requests
  for all using (true) with check (true);

-- Realtime: broadcast row changes to subscribed dashboards.
do $$
begin
  alter publication supabase_realtime add table public.auth_requests;
exception
  when duplicate_object then null; -- already in the publication
  when undefined_object then null; -- non-Supabase Postgres without the publication
end $$;
