// Realized per-trade P&L by FIFO matching. Walks orders ascending by
// fill/submit time, maintains running (qty, avgCost) per symbol, and
// records the realized P&L on each closing SELL.
//
// Limitations: V1 only handles long positions opened by BUY and closed by
// SELL. Shorts and partial covers aren't matched. That's fine for the
// paper-trading UI; refine later when shorts are common.

import type { Order } from "./types";

export type RealizedPnl = Map<string, number>;

export function effectiveTime(o: Order): number {
  const t = o.filledAt ?? o.canceledAt ?? o.submittedAt;
  const n = Date.parse(t);
  return Number.isNaN(n) ? 0 : n;
}

export function computeRealizedPnl(orders: readonly Order[]): RealizedPnl {
  const result: RealizedPnl = new Map();
  const book = new Map<string, { qty: number; avgCost: number }>();

  // Sort ascending so earlier fills are matched first
  const sorted = [...orders].sort((a, b) => effectiveTime(a) - effectiveTime(b));

  for (const o of sorted) {
    if (o.status !== "filled" && o.status !== "partially_filled") continue;
    const px = o.filledAvgPrice;
    const qty = o.filledQty;
    if (px == null || qty <= 0) continue;

    const pos = book.get(o.symbol) ?? { qty: 0, avgCost: 0 };

    if (o.side === "buy") {
      const newQty = pos.qty + qty;
      const newCost = (pos.avgCost * pos.qty + px * qty) / newQty;
      book.set(o.symbol, { qty: newQty, avgCost: newCost });
      // BUYs don't realize P&L; leave the result map unset for this order
    } else {
      // SELL — realize against existing avg cost
      const closingQty = Math.min(qty, pos.qty);
      if (closingQty > 0) {
        const realized = (px - pos.avgCost) * closingQty;
        result.set(o.id, realized);
        const remaining = pos.qty - closingQty;
        book.set(o.symbol, {
          qty: remaining,
          avgCost: remaining === 0 ? 0 : pos.avgCost,
        });
      }
    }
  }

  return result;
}

// ----- Aggregated metrics -----

export type TimeRange = "today" | "7d" | "30d" | "all";

export interface RangeBounds {
  start: number; // ms epoch, inclusive
  end: number; // ms epoch, exclusive
}

export interface ClosedTrade {
  orderId: string;
  symbol: string;
  /** ms epoch — the fill time of the closing SELL */
  ts: number;
  pnl: number;
}

export interface EquityPoint {
  ts: number;
  equity: number;
}

export interface SymbolStats {
  symbol: string;
  closedTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number; // 0..1
  realizedPnl: number;
}

export interface AggregatedMetrics {
  realizedPnl: number;
  /** Number of closed (SELL) trades that realized something. */
  closedTrades: number;
  /** Number of filled order legs in scope (buys + sells). */
  trades: number;
  /** Filled BUY legs in scope. */
  buyCount: number;
  /** Filled SELL legs in scope (may exceed closedTrades when a sell
   *  opens a short — V1 FIFO only matches longs). */
  sellCount: number;
  winCount: number;
  lossCount: number;
  winRate: number; // 0..1
  avgWin: number;
  avgLoss: number; // negative
  /** sum(wins) / |sum(losses)|. Infinity when there are wins and no losses. */
  profitFactor: number;
  maxDrawdown: number; // dollars
  /** Annualized Sharpe (rf=0). 0 when <2 trading days of data or std=0. */
  sharpe: number;
  equityCurve: EquityPoint[];
  perSymbol: SymbolStats[];
}

export function rangeBounds(range: TimeRange): RangeBounds {
  const now = Date.now();
  if (range === "all") return { start: 0, end: now + 1 };
  if (range === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return { start: d.getTime(), end: now + 1 };
  }
  const days = range === "7d" ? 7 : 30;
  return { start: now - days * 86_400_000, end: now + 1 };
}

/**
 * Extract every closing SELL with its realized P&L. Sorted ascending by ts
 * so the equity curve walks forward in time.
 *
 * The realized map must come from `computeRealizedPnl` over the *full*
 * order history — slicing first and then computing FIFO would lose cost
 * basis from BUYs that happened before the window.
 */
export function extractClosedTrades(
  orders: readonly Order[],
  realized: RealizedPnl,
): ClosedTrade[] {
  const out: ClosedTrade[] = [];
  for (const o of orders) {
    const pnl = realized.get(o.id);
    if (pnl == null) continue;
    out.push({
      orderId: o.id,
      symbol: o.symbol,
      ts: effectiveTime(o),
      pnl,
    });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

const EMPTY_METRICS: AggregatedMetrics = {
  realizedPnl: 0,
  closedTrades: 0,
  trades: 0,
  buyCount: 0,
  sellCount: 0,
  winCount: 0,
  lossCount: 0,
  winRate: 0,
  avgWin: 0,
  avgLoss: 0,
  profitFactor: 0,
  maxDrawdown: 0,
  sharpe: 0,
  equityCurve: [],
  perSymbol: [],
};

export interface FillCounts {
  buys: number;
  sells: number;
}

/**
 * Aggregate a list of closed trades into metric cards + equity curve +
 * per-symbol breakdown. Caller supplies the fill counts split by side
 * so the UI can show "X buys · Y sells" — closed trades alone don't
 * carry that information.
 */
export function aggregateMetrics(
  closedTrades: readonly ClosedTrade[],
  fills: FillCounts,
): AggregatedMetrics {
  if (closedTrades.length === 0) {
    return {
      ...EMPTY_METRICS,
      buyCount: fills.buys,
      sellCount: fills.sells,
      trades: fills.buys + fills.sells,
    };
  }

  let realizedPnl = 0;
  let winCount = 0;
  let lossCount = 0;
  let winSum = 0;
  let lossSum = 0;
  for (const t of closedTrades) {
    realizedPnl += t.pnl;
    if (t.pnl > 0) {
      winCount += 1;
      winSum += t.pnl;
    } else if (t.pnl < 0) {
      lossCount += 1;
      lossSum += t.pnl;
    }
  }
  const closedCount = closedTrades.length;
  const winRate = closedCount > 0 ? winCount / closedCount : 0;
  const avgWin = winCount > 0 ? winSum / winCount : 0;
  const avgLoss = lossCount > 0 ? lossSum / lossCount : 0;
  const profitFactor =
    lossSum < 0
      ? winSum / Math.abs(lossSum)
      : winSum > 0
        ? Number.POSITIVE_INFINITY
        : 0;

  // Equity curve — cumulative realized P&L over time, anchored at 0.
  const equityCurve: EquityPoint[] = [];
  let equity = 0;
  for (const t of closedTrades) {
    equity += t.pnl;
    equityCurve.push({ ts: t.ts, equity });
  }

  // Max drawdown — largest peak-to-trough on the curve, in dollars.
  let peak = 0;
  let maxDrawdown = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak - p.equity;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Sharpe — bucket P&L by local trading day, then mean/std × sqrt(252).
  // With sparse data this is noisy; UI should expose the assumption.
  const byDay = new Map<string, number>();
  for (const t of closedTrades) {
    const d = new Date(t.ts);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    byDay.set(key, (byDay.get(key) ?? 0) + t.pnl);
  }
  const daily = [...byDay.values()];
  let sharpe = 0;
  if (daily.length >= 2) {
    const mean = daily.reduce((s, x) => s + x, 0) / daily.length;
    const variance =
      daily.reduce((s, x) => s + (x - mean) ** 2, 0) / (daily.length - 1);
    const std = Math.sqrt(variance);
    if (std > 0) sharpe = (mean / std) * Math.sqrt(252);
  }

  // Per-symbol — rank by absolute realized P&L so big winners and big
  // losers both surface at the top.
  const symMap = new Map<
    string,
    { wins: number; losses: number; pnl: number; trades: number }
  >();
  for (const t of closedTrades) {
    const s = symMap.get(t.symbol) ?? { wins: 0, losses: 0, pnl: 0, trades: 0 };
    s.trades += 1;
    s.pnl += t.pnl;
    if (t.pnl > 0) s.wins += 1;
    else if (t.pnl < 0) s.losses += 1;
    symMap.set(t.symbol, s);
  }
  const perSymbol: SymbolStats[] = [];
  for (const [symbol, s] of symMap) {
    perSymbol.push({
      symbol,
      closedTrades: s.trades,
      winCount: s.wins,
      lossCount: s.losses,
      winRate: s.trades > 0 ? s.wins / s.trades : 0,
      realizedPnl: s.pnl,
    });
  }
  perSymbol.sort(
    (a, b) => Math.abs(b.realizedPnl) - Math.abs(a.realizedPnl),
  );

  return {
    realizedPnl,
    closedTrades: closedCount,
    trades: fills.buys + fills.sells,
    buyCount: fills.buys,
    sellCount: fills.sells,
    winCount,
    lossCount,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    maxDrawdown,
    sharpe,
    equityCurve,
    perSymbol,
  };
}

/**
 * Count filled order legs in scope, split by side. Optional time bounds
 * restrict the window.
 */
export function countFills(
  orders: readonly Order[],
  bounds?: RangeBounds,
): FillCounts {
  let buys = 0;
  let sells = 0;
  for (const o of orders) {
    if (o.status !== "filled" && o.status !== "partially_filled") continue;
    if (bounds) {
      const ts = effectiveTime(o);
      if (ts < bounds.start || ts >= bounds.end) continue;
    }
    if (o.side === "buy") buys += 1;
    else if (o.side === "sell") sells += 1;
  }
  return { buys, sells };
}

/**
 * One-shot helper: realized P&L is computed over the full order list
 * (so cost basis is preserved across windows), then the metrics are
 * restricted to closed trades whose ts falls within `range`.
 */
export function computeMetrics(
  orders: readonly Order[],
  range: TimeRange = "all",
): AggregatedMetrics {
  const bounds = rangeBounds(range);
  const realized = computeRealizedPnl(orders);
  const closed = extractClosedTrades(orders, realized).filter(
    (t) => t.ts >= bounds.start && t.ts < bounds.end,
  );
  return aggregateMetrics(closed, countFills(orders, bounds));
}

export function toCsv(orders: readonly Order[]): string {
  const realized = computeRealizedPnl(orders);
  const header = [
    "id",
    "submitted_at",
    "filled_at",
    "symbol",
    "side",
    "type",
    "qty",
    "filled_qty",
    "limit_price",
    "stop_price",
    "filled_avg_price",
    "status",
    "realized_pl",
  ].join(",");

  const rows = orders.map((o) => {
    const pl = realized.get(o.id);
    return [
      o.id,
      o.submittedAt,
      o.filledAt ?? "",
      o.symbol,
      o.side,
      o.type,
      o.qty,
      o.filledQty,
      o.limitPrice ?? "",
      o.stopPrice ?? "",
      o.filledAvgPrice ?? "",
      o.status,
      pl != null ? pl.toFixed(4) : "",
    ]
      .map((v) => {
        const s = String(v);
        return s.includes(",") || s.includes('"')
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      })
      .join(",");
  });

  return [header, ...rows].join("\n");
}
