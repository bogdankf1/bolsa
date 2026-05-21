// Full backtest run detail — including fills and equity curve — for the
// click-to-expand panel and chart fill markers. The list endpoint omits
// these jsonb columns to keep the list payload light; the detail
// endpoint fetches on demand.

import { NextRequest } from "next/server";
import { err, ok, withErrors } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ApiBacktestFill {
  ts: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  pnl: number | null;
}

export interface ApiEquityPoint {
  ts: string;
  equity: number;
}

export interface ApiBacktestRunDetail {
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
  fills: ApiBacktestFill[];
  equityCurve: ApiEquityPoint[];
}

export const GET = withErrors(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const { data, error } = await supabase()
      .from("backtest_runs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return err("not_found", `Backtest ${id} not found`, 404);

    const row = data as unknown as Record<string, unknown>;
    const num = (k: string): number | null =>
      row[k] == null ? null : Number(row[k]);

    const detail: ApiBacktestRunDetail = {
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
      status:
        (row.status as ApiBacktestRunDetail["status"]) ?? "completed",
      createdAt: String(row.created_at),
      endedAt: (row.ended_at as string | null) ?? null,
      fills: (row.fills as ApiBacktestFill[] | null) ?? [],
      equityCurve: (row.equity_curve as ApiEquityPoint[] | null) ?? [],
    };
    return ok(detail);
  },
);
