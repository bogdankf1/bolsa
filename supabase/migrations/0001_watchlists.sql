-- Bolsa V1 watchlist. Single-user — no user_id column.
-- When V2 brings auth, add `user_id uuid references auth.users` and migrate.

create table if not exists watchlists (
  symbol text primary key,
  created_at timestamptz not null default now()
);
