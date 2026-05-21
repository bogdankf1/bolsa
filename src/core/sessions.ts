// Per-session attribution. Joins agent_event session windows with the
// flat order history from Alpaca to answer "how did each session
// perform?" — including a synthetic "manual" bucket for orders placed
// outside any session window.
//
// FIFO realized P&L is computed once over the full order list so cost
// basis carries across windows: a BUY in session A closed by a SELL in
// session B realizes its P&L into B (where the close happened), with
// the correct cost basis from A.

import type { Order, Side } from "./types";
import {
  aggregateMetrics,
  computeRealizedPnl,
  effectiveTime,
  extractClosedTrades,
  type AggregatedMetrics,
  type ClosedTrade,
  type FillCounts,
} from "./pnl";

export const MANUAL_BUCKET = "manual";

export interface SessionWindow {
  sessionId: string;
  /** ms epoch */
  startedAt: number;
  /** ms epoch, or null when the session is still open. */
  endedAt: number | null;
}

export interface SessionAttribution {
  /** "manual" or the session id. */
  bucket: string;
  /** Display label — session id for sessions, "manual" for the bucket. */
  label: string;
  windowStartedAt: number | null;
  windowEndedAt: number | null;
  /** True when this is the synthetic manual bucket (no agent session). */
  isManual: boolean;
  /** True when the session is currently active (no end timestamp). */
  isLive: boolean;
  metrics: AggregatedMetrics;
}

function inWindow(ts: number, w: SessionWindow): boolean {
  const end = w.endedAt ?? Number.POSITIVE_INFINITY;
  return ts >= w.startedAt && ts < end;
}

/**
 * Bucket every closing trade (and every filled order leg, for the
 * `trades` counter) into the session window it fell inside, or into
 * "manual" if it fell outside all of them.
 */
export function attributeTradesToSessions(
  orders: readonly Order[],
  sessions: readonly SessionWindow[],
): SessionAttribution[] {
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  const realized = computeRealizedPnl(orders);
  const allClosed = extractClosedTrades(orders, realized);

  const closedBuckets = new Map<string, ClosedTrade[]>();
  const fillBuckets = new Map<string, FillCounts>();
  function init(key: string) {
    closedBuckets.set(key, []);
    fillBuckets.set(key, { buys: 0, sells: 0 });
  }
  init(MANUAL_BUCKET);
  for (const s of sorted) init(s.sessionId);

  function assign(ts: number): string {
    for (const s of sorted) {
      if (inWindow(ts, s)) return s.sessionId;
    }
    return MANUAL_BUCKET;
  }

  for (const t of allClosed) {
    closedBuckets.get(assign(t.ts))!.push(t);
  }
  for (const o of orders) {
    if (o.status !== "filled" && o.status !== "partially_filled") continue;
    const ts = effectiveTime(o);
    const f = fillBuckets.get(assign(ts))!;
    const side: Side = o.side;
    if (side === "buy") f.buys += 1;
    else f.sells += 1;
  }

  // Newest sessions first; manual bucket pinned at the end.
  const out: SessionAttribution[] = [];
  for (const s of [...sorted].reverse()) {
    out.push({
      bucket: s.sessionId,
      label: s.sessionId,
      windowStartedAt: s.startedAt,
      windowEndedAt: s.endedAt,
      isManual: false,
      isLive: s.endedAt == null,
      metrics: aggregateMetrics(
        closedBuckets.get(s.sessionId) ?? [],
        fillBuckets.get(s.sessionId) ?? { buys: 0, sells: 0 },
      ),
    });
  }
  out.push({
    bucket: MANUAL_BUCKET,
    label: MANUAL_BUCKET,
    windowStartedAt: null,
    windowEndedAt: null,
    isManual: true,
    isLive: false,
    metrics: aggregateMetrics(
      closedBuckets.get(MANUAL_BUCKET) ?? [],
      fillBuckets.get(MANUAL_BUCKET) ?? { buys: 0, sells: 0 },
    ),
  });
  return out;
}
