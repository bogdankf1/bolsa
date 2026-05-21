-- Bolsa V3 (preview): backtest run records.
--
-- A `backtest_runs` row represents one simulated execution of a
-- strategy against historical bars. The engine itself keeps live
-- per-bar state (cursor, cash, positions, fills) in memory inside
-- the Next.js process; this table stores the *result* and basic
-- params so the Analytics tab can list past runs and so a completed
-- run survives page reloads.
--
-- `fills` is denormalised onto the row as jsonb — a backtest's fills
-- live and die with the run; there's no value in a separate
-- backtest_fills table at this scale.
--
-- RLS is permissive (anon all-access) to match the V1/V2 single-user
-- pattern.

create table if not exists backtest_runs (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  symbol text not null,
  timeframe text not null,
  range_start timestamptz not null,
  range_end timestamptz not null,
  initial_cash numeric(20, 4) not null,

  -- Result metrics — populated when status transitions to 'completed'.
  final_equity numeric(20, 4),
  realized_pnl numeric(20, 4),
  trade_count int default 0,
  buy_count int default 0,
  sell_count int default 0,
  closed_count int default 0,
  win_count int default 0,
  loss_count int default 0,
  win_rate numeric(8, 6),
  max_drawdown numeric(20, 4),
  sharpe numeric(12, 6),
  bar_count int default 0,

  -- 'running' on insert, 'completed' on end_backtest, 'aborted' if
  -- the in-memory engine lost state (server restart) and the row is
  -- still 'running' but unreachable.
  status text not null default 'running',

  -- Denormalised fills + equity curve for the chart-marker overlay.
  -- Shape: fills = [{ts, side, qty, price, pnl?}], equity = [{ts, equity}].
  fills jsonb not null default '[]'::jsonb,
  equity_curve jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists backtest_runs_created
  on backtest_runs (created_at desc);
create index if not exists backtest_runs_session
  on backtest_runs (session_id, created_at desc);

alter publication supabase_realtime add table backtest_runs;

alter table backtest_runs enable row level security;

create policy "anon read backtest_runs"
  on backtest_runs for select to anon using (true);

create policy "anon insert backtest_runs"
  on backtest_runs for insert to anon with check (true);

create policy "anon update backtest_runs"
  on backtest_runs for update to anon using (true) with check (true);
