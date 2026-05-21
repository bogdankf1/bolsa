// In-memory backtest engine.
//
// One active run at a time, held as module-level state. The strategy
// driver (a Claude /loop) calls start_backtest, then alternates
// advance_bar / get_backtest_context / place_order, then end_backtest.
//
// Fill model (V1):
//   - market orders fill at the current bar's close
//   - limit orders fill if the bar's [low, high] crosses the limit price
//   - stop / stop_limit not supported yet
//   - shorts not supported — selling more than held throws
//
// Persistence: only the FINAL result is written to backtest_runs at
// end_backtest. Live state lives in memory. A server restart aborts an
// in-flight backtest; the row stays in status='running' until the next
// /api/backtest/runs request marks it 'aborted'.

import "server-only";
import { alpaca } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { aggregateMetrics, type ClosedTrade } from "./pnl";
import { getActiveSessionId } from "./agent-events";
import type {
  Account,
  Bar,
  Order,
  PlaceOrderInput,
  PortfolioSummary,
  Position,
  Side,
  Timeframe,
} from "./types";

export interface BacktestFill {
  /** Bar timestamp at which the fill happened. */
  ts: string;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  /** Realized P&L for sells that closed inventory; null otherwise. */
  pnl: number | null;
}

interface BacktestPositionInternal {
  qty: number;
  avgCost: number;
}

export interface EquityPoint {
  ts: string;
  equity: number;
}

interface BacktestState {
  runId: string;
  sessionId: string | null;
  symbol: string;
  timeframe: Timeframe;
  rangeStart: string; // ISO
  rangeEnd: string; // ISO
  initialCash: number;
  cash: number;
  positions: Map<string, BacktestPositionInternal>;
  fills: BacktestFill[];
  equityCurve: EquityPoint[];
  bars: Bar[];
  cursor: number; // current bar index
}

const RUNS = new Map<string, BacktestState>();
let ACTIVE_RUN_ID: string | null = null;

function activeRun(): BacktestState | null {
  return ACTIVE_RUN_ID ? (RUNS.get(ACTIVE_RUN_ID) ?? null) : null;
}

export function isBacktestActive(): boolean {
  return activeRun() !== null;
}

export function activeBacktestRunId(): string | null {
  return ACTIVE_RUN_ID;
}

function requireRun(): BacktestState {
  const r = activeRun();
  if (!r) throw new Error("No backtest is active. Call start_backtest first.");
  return r;
}

const ALPACA_TIMEFRAME: Record<Timeframe, string> = {
  "1Min": "1Min",
  "5Min": "5Min",
  "15Min": "15Min",
  "1H": "1Hour",
  "1D": "1Day",
  "1W": "1Week",
  "1M": "1Day",
  "3M": "1Day",
  "1Y": "1Day",
};

export interface StartBacktestInput {
  symbol: string;
  timeframe: Timeframe;
  /** ISO date or timestamp, inclusive. */
  start: string;
  /** ISO date or timestamp, exclusive. */
  end: string;
  initialCash: number;
}

export interface StartBacktestResult {
  runId: string;
  symbol: string;
  timeframe: Timeframe;
  barCount: number;
  firstBar: Bar | null;
  initialCash: number;
}

export async function startBacktest(
  input: StartBacktestInput,
): Promise<StartBacktestResult> {
  if (ACTIVE_RUN_ID) {
    throw new Error(
      `A backtest is already running (${ACTIVE_RUN_ID}). Call end_backtest first.`,
    );
  }

  const symbol = input.symbol.toUpperCase();
  const tf = input.timeframe;

  const raw = await alpaca.bars(symbol, {
    timeframe: ALPACA_TIMEFRAME[tf],
    limit: 10_000,
    start: input.start,
    end: input.end,
  });
  const bars: Bar[] = (raw.bars ?? []).map((b) => ({
    timestamp: b.t,
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v,
  }));
  if (bars.length === 0) {
    throw new Error(
      `No bars returned for ${symbol} ${tf} ${input.start}..${input.end}`,
    );
  }

  const sessionId = (await getActiveSessionId()) ?? null;

  const { data, error } = await supabase()
    .from("backtest_runs")
    .insert({
      session_id: sessionId,
      symbol,
      timeframe: tf,
      range_start: input.start,
      range_end: input.end,
      initial_cash: input.initialCash,
      bar_count: bars.length,
      status: "running",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw error ?? new Error("backtest_runs insert failed");
  }
  const runId = (data as { id: string }).id;

  const firstBar = bars[0];
  const state: BacktestState = {
    runId,
    sessionId,
    symbol,
    timeframe: tf,
    rangeStart: input.start,
    rangeEnd: input.end,
    initialCash: input.initialCash,
    cash: input.initialCash,
    positions: new Map(),
    fills: [],
    equityCurve: [{ ts: firstBar.timestamp, equity: input.initialCash }],
    bars,
    cursor: 0,
  };
  RUNS.set(runId, state);
  ACTIVE_RUN_ID = runId;

  return {
    runId,
    symbol,
    timeframe: tf,
    barCount: bars.length,
    firstBar,
    initialCash: input.initialCash,
  };
}

export interface AdvanceBarResult {
  done: boolean;
  bar: Bar | null;
  cursor: number;
  barCount: number;
  equity: number;
}

export function advanceBar(): AdvanceBarResult {
  const run = requireRun();
  const lastIdx = run.bars.length - 1;
  if (run.cursor >= lastIdx) {
    const bar = run.bars[run.cursor] ?? null;
    return {
      done: true,
      bar,
      cursor: run.cursor,
      barCount: run.bars.length,
      equity: markToMarket(run, bar),
    };
  }
  run.cursor += 1;
  const bar = run.bars[run.cursor];
  const equity = markToMarket(run, bar);
  run.equityCurve.push({ ts: bar.timestamp, equity });
  return {
    done: run.cursor === lastIdx,
    bar,
    cursor: run.cursor,
    barCount: run.bars.length,
    equity,
  };
}

function markToMarket(run: BacktestState, bar: Bar | null): number {
  let pos = 0;
  for (const [sym, p] of run.positions) {
    if (p.qty === 0) continue;
    // V1 is single-symbol; mark at current bar's close. Multi-symbol
    // backtests would need a per-symbol price feed.
    const px = sym === run.symbol && bar ? bar.close : p.avgCost;
    pos += p.qty * px;
  }
  return run.cash + pos;
}

function syntheticOrder(
  run: BacktestState,
  input: PlaceOrderInput,
  ts: string,
  fillPrice: number | null,
  filled: boolean,
): Order {
  const idx = run.fills.length + 1;
  return {
    id: `bt-${run.runId}-${idx}`,
    clientOrderId: `bt-${run.runId}-${idx}`,
    symbol: input.symbol.toUpperCase(),
    qty: input.qty,
    filledQty: filled ? input.qty : 0,
    side: input.side,
    type: input.type,
    timeInForce: input.timeInForce ?? "day",
    status: filled ? "filled" : "canceled",
    limitPrice: input.limitPrice ?? null,
    stopPrice: input.stopPrice ?? null,
    filledAvgPrice: filled ? fillPrice : null,
    submittedAt: ts,
    filledAt: filled ? ts : null,
    canceledAt: filled ? null : ts,
  };
}

export function placeBacktestOrder(input: PlaceOrderInput): Order {
  const run = requireRun();
  const bar = run.bars[run.cursor];
  if (!bar) throw new Error("No current bar to fill against");

  const symbol = input.symbol.toUpperCase();
  if (symbol !== run.symbol) {
    throw new Error(
      `Backtest is scoped to ${run.symbol}; cannot trade ${symbol}.`,
    );
  }

  // Determine fill price by order type.
  let fillPrice: number | null = null;
  if (input.type === "market") {
    fillPrice = bar.close;
  } else if (input.type === "limit" && input.limitPrice != null) {
    const lim = input.limitPrice;
    if (input.side === "buy" && lim >= bar.low) {
      // Buy limit: fills when low ≤ limit. Take limit price (the better
      // of the two for the trader).
      fillPrice = Math.min(lim, bar.high);
    } else if (input.side === "sell" && lim <= bar.high) {
      fillPrice = Math.max(lim, bar.low);
    }
  } else if (input.type === "stop" || input.type === "stop_limit") {
    throw new Error("stop / stop_limit not supported in backtest V1");
  }

  if (fillPrice == null) {
    return syntheticOrder(run, input, bar.timestamp, null, false);
  }

  const pos = run.positions.get(symbol) ?? { qty: 0, avgCost: 0 };
  let realizedPnl: number | null = null;

  if (input.side === "buy") {
    const cost = fillPrice * input.qty;
    if (cost > run.cash + 1e-6) {
      throw new Error(
        `Insufficient cash for buy: need ${cost.toFixed(2)}, have ${run.cash.toFixed(2)}`,
      );
    }
    const newQty = pos.qty + input.qty;
    pos.avgCost = (pos.avgCost * pos.qty + fillPrice * input.qty) / newQty;
    pos.qty = newQty;
    run.cash -= cost;
  } else {
    const closeQty = Math.min(input.qty, pos.qty);
    if (closeQty <= 0) {
      throw new Error(
        `Cannot sell ${input.qty} ${symbol}: no long position to close (V1 has no shorts).`,
      );
    }
    if (closeQty < input.qty) {
      throw new Error(
        `Cannot sell ${input.qty} ${symbol}: only ${pos.qty} held (V1 has no shorts).`,
      );
    }
    realizedPnl = (fillPrice - pos.avgCost) * closeQty;
    pos.qty -= closeQty;
    if (pos.qty === 0) pos.avgCost = 0;
    run.cash += fillPrice * closeQty;
  }
  run.positions.set(symbol, pos);

  run.fills.push({
    ts: bar.timestamp,
    symbol,
    side: input.side,
    qty: input.qty,
    price: fillPrice,
    pnl: realizedPnl,
  });

  return syntheticOrder(run, input, bar.timestamp, fillPrice, true);
}

export interface BacktestContext {
  runId: string;
  symbol: string;
  timeframe: Timeframe;
  cursor: number;
  barCount: number;
  done: boolean;
  bar: Bar | null;
  cash: number;
  equity: number;
  realizedPnl: number;
  positions: Array<{
    symbol: string;
    qty: number;
    avgCost: number;
    marketValue: number;
  }>;
  fills: BacktestFill[];
}

export function getBacktestContext(): BacktestContext {
  const run = requireRun();
  const bar = run.bars[run.cursor] ?? null;
  const equity = markToMarket(run, bar);
  const realizedPnl = run.fills.reduce((s, f) => s + (f.pnl ?? 0), 0);
  const positions: BacktestContext["positions"] = [];
  for (const [sym, p] of run.positions) {
    if (p.qty === 0) continue;
    const px = sym === run.symbol && bar ? bar.close : p.avgCost;
    positions.push({
      symbol: sym,
      qty: p.qty,
      avgCost: p.avgCost,
      marketValue: p.qty * px,
    });
  }
  return {
    runId: run.runId,
    symbol: run.symbol,
    timeframe: run.timeframe,
    cursor: run.cursor,
    barCount: run.bars.length,
    done: run.cursor >= run.bars.length - 1,
    bar,
    cash: run.cash,
    equity,
    realizedPnl,
    positions,
    fills: run.fills,
  };
}

export interface EndBacktestResult {
  runId: string;
  symbol: string;
  timeframe: Timeframe;
  initialCash: number;
  finalEquity: number;
  realizedPnl: number;
  trades: number;
  buys: number;
  sells: number;
  closed: number;
  winRate: number;
  maxDrawdown: number;
  sharpe: number;
  bars: number;
}

export async function endBacktest(): Promise<EndBacktestResult> {
  const run = requireRun();
  const bar = run.bars[run.cursor] ?? null;
  const finalEquity = markToMarket(run, bar);

  const closed: ClosedTrade[] = [];
  let buys = 0;
  let sells = 0;
  for (const f of run.fills) {
    if (f.side === "buy") buys += 1;
    else sells += 1;
    if (f.pnl != null) {
      closed.push({
        orderId: `${f.ts}-${f.symbol}-${run.fills.indexOf(f)}`,
        symbol: f.symbol,
        ts: Date.parse(f.ts),
        pnl: f.pnl,
      });
    }
  }
  const m = aggregateMetrics(closed, { buys, sells });

  await supabase()
    .from("backtest_runs")
    .update({
      final_equity: finalEquity,
      realized_pnl: m.realizedPnl,
      trade_count: m.trades,
      buy_count: m.buyCount,
      sell_count: m.sellCount,
      closed_count: m.closedTrades,
      win_count: m.winCount,
      loss_count: m.lossCount,
      win_rate: m.winRate,
      max_drawdown: m.maxDrawdown,
      sharpe: m.sharpe,
      fills: run.fills,
      equity_curve: run.equityCurve,
      status: "completed",
      ended_at: new Date().toISOString(),
    })
    .eq("id", run.runId);

  const result: EndBacktestResult = {
    runId: run.runId,
    symbol: run.symbol,
    timeframe: run.timeframe,
    initialCash: run.initialCash,
    finalEquity,
    realizedPnl: m.realizedPnl,
    trades: m.trades,
    buys: m.buyCount,
    sells: m.sellCount,
    closed: m.closedTrades,
    winRate: m.winRate,
    maxDrawdown: m.maxDrawdown,
    sharpe: m.sharpe,
    bars: run.bars.length,
  };

  RUNS.delete(run.runId);
  ACTIVE_RUN_ID = null;
  return result;
}

// ---------- Synthetic views for account/portfolio/positions ----------

export function backtestPositions(): Position[] {
  const run = requireRun();
  const bar = run.bars[run.cursor] ?? null;
  const out: Position[] = [];
  for (const [sym, p] of run.positions) {
    if (p.qty === 0) continue;
    const px = sym === run.symbol && bar ? bar.close : p.avgCost;
    const marketValue = p.qty * px;
    const costBasis = p.qty * p.avgCost;
    const unrealizedPl = marketValue - costBasis;
    out.push({
      symbol: sym,
      qty: p.qty,
      side: p.qty >= 0 ? "long" : "short",
      avgEntryPrice: p.avgCost,
      currentPrice: px,
      marketValue,
      costBasis,
      unrealizedPl,
      unrealizedPlPct: costBasis === 0 ? 0 : (unrealizedPl / costBasis) * 100,
      changeToday: 0,
    });
  }
  return out;
}

export function backtestPortfolio(): PortfolioSummary & {
  positions: Position[];
} {
  const run = requireRun();
  const positions = backtestPositions();
  const bar = run.bars[run.cursor] ?? null;
  const equity = markToMarket(run, bar);
  let unrealizedPl = 0;
  let costBasis = 0;
  for (const p of positions) {
    unrealizedPl += p.unrealizedPl;
    costBasis += p.costBasis;
  }
  return {
    cash: run.cash,
    portfolioValue: equity,
    equity,
    buyingPower: run.cash,
    unrealizedPl,
    unrealizedPlPct: costBasis === 0 ? 0 : (unrealizedPl / costBasis) * 100,
    dayPl: equity - run.initialCash,
    dayPlPct:
      run.initialCash === 0
        ? 0
        : ((equity - run.initialCash) / run.initialCash) * 100,
    positionsCount: positions.length,
    positions,
  };
}

export function backtestAccount(): Account {
  const run = requireRun();
  const bar = run.bars[run.cursor] ?? null;
  const equity = markToMarket(run, bar);
  return {
    id: `backtest-${run.runId}`,
    accountNumber: `BT-${run.runId.slice(0, 8)}`,
    status: "ACTIVE",
    currency: "USD",
    cash: run.cash,
    portfolioValue: equity,
    equity,
    buyingPower: run.cash,
    daytradeCount: 0,
    patternDayTrader: false,
    tradingBlocked: false,
  };
}

export function backtestRecentTrades(limit = 100): Order[] {
  const run = requireRun();
  const out: Order[] = [];
  const fills = run.fills.slice(-limit).reverse();
  for (let i = 0; i < fills.length; i++) {
    const f = fills[i];
    out.push({
      id: `bt-${run.runId}-${i + 1}`,
      clientOrderId: `bt-${run.runId}-${i + 1}`,
      symbol: f.symbol,
      qty: f.qty,
      filledQty: f.qty,
      side: f.side,
      type: "market",
      timeInForce: "day",
      status: "filled",
      limitPrice: null,
      stopPrice: null,
      filledAvgPrice: f.price,
      submittedAt: f.ts,
      filledAt: f.ts,
      canceledAt: null,
    });
  }
  return out;
}
