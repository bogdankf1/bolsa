-- Bolsa V1 watchlist. Single-user — no user_id column.
-- When V2 brings auth, add `user_id uuid references auth.users` and migrate.

create table if not exists watchlists (
  symbol text primary key,
  created_at timestamptz not null default now()
);

-- V1 uses the anon (publishable) key from a login-protected Vercel deploy,
-- so permissive RLS is functionally equivalent to no RLS. V2 will tighten
-- to per-user policies when auth lands.

alter table watchlists enable row level security;

create policy "anon read watchlists"
  on watchlists for select
  to anon
  using (true);

create policy "anon insert watchlists"
  on watchlists for insert
  to anon
  with check (true);

create policy "anon update watchlists"
  on watchlists for update
  to anon
  using (true)
  with check (true);

create policy "anon delete watchlists"
  on watchlists for delete
  to anon
  using (true);
