// List past backtest runs for the Analytics tab. Returns newest first.
//
// Also opportunistically marks long-running rows as 'aborted' — the
// engine state lives in memory inside the Next.js process, so a server
// restart leaves orphaned rows in status='running' that will never
// finalize. We treat anything stuck for more than 10 minutes since
// created_at as aborted on the way out.

import { ok, withErrors } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ApiBacktestRun {
  id: string;
  sessionId: string | null;
  symbol: string;
  timeframe: string;
  rangeStart: string;
  rangeEnd: string;
  initialCash: number;
  finalEquity: number | null;
  realizedPnl: number | null;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  closedCount: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;
  maxDrawdown: number | null;
  sharpe: number | null;
  barCount: number;
  status: "running" | "completed" | "aborted";
  createdAt: string;
  endedAt: string | null;
}

const ABORT_THRESHOLD_MS = 10 * 60 * 1000;

export const GET = withErrors(async () => {
  const sb = supabase();

  // Mark stale 'running' rows as 'aborted' before listing.
  const cutoff = new Date(Date.now() - ABORT_THRESHOLD_MS).toISOString();
  await sb
    .from("backtest_runs")
    .update({ status: "aborted", ended_at: new Date().toISOString() })
    .eq("status", "running")
    .lt("created_at", cutoff);

  const { data, error } = await sb
    .from("backtest_runs")
    .select(
      "id, session_id, symbol, timeframe, range_start, range_end, " +
        "initial_cash, final_equity, realized_pnl, trade_count, buy_count, " +
        "sell_count, closed_count, win_count, loss_count, win_rate, " +
        "max_drawdown, sharpe, bar_count, status, created_at, ended_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const runs: ApiBacktestRun[] = rows.map((row) => {
    const num = (k: string): number | null => {
      const v = row[k];
      return v == null ? null : Number(v);
    };
    return {
      id: String(row.id),
      sessionId: (row.session_id as string | null) ?? null,
      symbol: String(row.symbol),
      timeframe: String(row.timeframe),
      rangeStart: String(row.range_start),
      rangeEnd: String(row.range_end),
      initialCash: Number(row.initial_cash),
      finalEquity: num("final_equity"),
      realizedPnl: num("realized_pnl"),
      tradeCount: Number(row.trade_count ?? 0),
      buyCount: Number(row.buy_count ?? 0),
      sellCount: Number(row.sell_count ?? 0),
      closedCount: Number(row.closed_count ?? 0),
      winCount: Number(row.win_count ?? 0),
      lossCount: Number(row.loss_count ?? 0),
      winRate: num("win_rate"),
      maxDrawdown: num("max_drawdown"),
      sharpe: num("sharpe"),
      barCount: Number(row.bar_count ?? 0),
      status: (row.status as ApiBacktestRun["status"]) ?? "running",
      createdAt: String(row.created_at),
      endedAt: (row.ended_at as string | null) ?? null,
    };
  });
  return ok(runs);
});
