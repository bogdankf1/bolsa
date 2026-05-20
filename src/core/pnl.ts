// Realized per-trade P&L by FIFO matching. Walks orders ascending by
// fill/submit time, maintains running (qty, avgCost) per symbol, and
// records the realized P&L on each closing SELL.
//
// Limitations: V1 only handles long positions opened by BUY and closed by
// SELL. Shorts and partial covers aren't matched. That's fine for the
// paper-trading UI; refine later when shorts are common.

import type { Order } from "./types";

export type RealizedPnl = Map<string, number>;

function effectiveTime(o: Order): number {
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
