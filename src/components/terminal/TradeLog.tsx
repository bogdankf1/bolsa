"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel } from "./Panel";
import { fmtPrice, fmtUsd } from "@/lib/format";
import { cancelOrder, useOrders } from "@/lib/hooks";
import { useHotkey } from "@/lib/hotkeys";
import { computeRealizedPnl, toCsv } from "@/core/pnl";
import type { Order, OrderStatus } from "@/core/types";

function fmtClock(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "--:--:--";
  }
}

function statusTone(status: OrderStatus): "fill" | "open" | "dead" {
  switch (status) {
    case "filled":
    case "partially_filled":
      return "fill";
    case "new":
    case "accepted":
    case "pending_new":
    case "pending_cancel":
      return "open";
    case "canceled":
    case "expired":
    case "rejected":
    case "done_for_day":
    case "replaced":
      return "dead";
  }
}

function priceCell(o: Order): string {
  if (o.filledAvgPrice != null && o.filledAvgPrice > 0) {
    return `@ ${fmtPrice(o.filledAvgPrice)}`;
  }
  if (o.limitPrice != null && o.limitPrice > 0) {
    return `lim ${fmtPrice(o.limitPrice)}`;
  }
  if (o.stopPrice != null && o.stopPrice > 0) {
    return `stp ${fmtPrice(o.stopPrice)}`;
  }
  if (o.type === "market") return "MKT";
  return "—";
}

type Props = {
  onSelectSymbol?: (symbol: string) => void;
};

export function TradeLog({ onSelectSymbol }: Props) {
  const { data: orders, isLoading } = useOrders("all");
  const items = useMemo(() => orders ?? [], [orders]);

  const realizedPnl = useMemo(() => computeRealizedPnl(items), [items]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep highlight valid when the underlying list changes
  useEffect(() => {
    if (highlightId && !items.some((o) => o.id === highlightId)) {
      setHighlightId(items[0]?.id ?? null);
    } else if (!highlightId && items.length > 0) {
      setHighlightId(items[0].id);
    }
  }, [items, highlightId]);

  const counts = useMemo(() => {
    let fills = 0;
    let open = 0;
    for (const o of items) {
      const tone = statusTone(o.status);
      if (tone === "fill") fills += 1;
      else if (tone === "open") open += 1;
    }
    return { fills, open };
  }, [items]);

  const handleCancel = useCallback(async () => {
    if (!highlightId) return;
    const order = items.find((o) => o.id === highlightId);
    if (!order || statusTone(order.status) !== "open") return;
    setBusyId(highlightId);
    setError(null);
    try {
      await cancelOrder(highlightId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "cancel failed");
    } finally {
      setBusyId(null);
    }
  }, [highlightId, items]);

  const onCancelKey = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      void handleCancel();
    },
    [handleCancel],
  );
  useHotkey("c", onCancelKey);

  function handleExport() {
    const csv = toCsv(items);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.download = `bolsa-trades-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const rightSlot = (
    <span className="flex items-center gap-2">
      <span>
        {items.length === 0
          ? isLoading
            ? "loading…"
            : "no orders"
          : `${counts.open} open · ${counts.fills} filled`}
      </span>
      <button
        type="button"
        onClick={handleExport}
        disabled={items.length === 0}
        className="border border-[var(--color-phosphor-dark)] px-1.5 py-[1px] text-[10px] tracking-[0.15em] text-[var(--color-phosphor-dim)] hover:border-[var(--color-phosphor)] hover:text-[var(--color-phosphor)] disabled:opacity-30"
        title="Export all orders as CSV"
      >
        CSV
      </button>
    </span>
  );

  return (
    <Panel title="Trade Log" rightSlot={rightSlot} bodyClassName="font-mono">
      <table className="w-full text-sm tabular-nums">
        <thead className="sticky top-0 z-[1] bg-[var(--color-bg)] text-[10px] uppercase tracking-[0.12em] text-[var(--color-phosphor-dim)]">
          <tr className="border-b border-[var(--color-phosphor-dark)]">
            <th className="px-3 py-1 text-left font-normal">TIME</th>
            <th className="px-3 py-1 text-left font-normal">SIDE</th>
            <th className="px-3 py-1 text-left font-normal">SYM</th>
            <th className="px-3 py-1 text-right font-normal">QTY</th>
            <th className="px-3 py-1 text-right font-normal">PRICE</th>
            <th className="px-3 py-1 text-right font-normal">P&amp;L</th>
            <th className="px-3 py-1 text-left font-normal">STATUS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-phosphor-faint)]">
          {items.map((o) => {
            const tone = statusTone(o.status);
            const statusCls =
              tone === "fill"
                ? "text-[var(--color-gain)] glow"
                : tone === "open"
                  ? "text-[var(--color-amber)] [text-shadow:0_0_4px_rgba(255,176,0,0.6)]"
                  : "text-[var(--color-loss)] glow-loss";
            const ts = o.filledAt ?? o.canceledAt ?? o.submittedAt;
            const qtyDisplay =
              o.filledQty > 0 && o.filledQty !== o.qty
                ? `${o.filledQty}/${o.qty}`
                : o.qty;
            const pl = realizedPnl.get(o.id);
            const plUp = pl != null && pl >= 0;
            const isHighlighted = o.id === highlightId;
            return (
              <tr
                key={o.id}
                onClick={() => {
                  setHighlightId(o.id);
                  onSelectSymbol?.(o.symbol);
                }}
                className={`cursor-pointer ${
                  isHighlighted
                    ? "bg-[color-mix(in_srgb,var(--color-phosphor)_12%,transparent)]"
                    : "hover:bg-[color-mix(in_srgb,var(--color-phosphor)_5%,transparent)]"
                } ${busyId === o.id ? "opacity-50" : ""}`}
              >
                <td className="px-3 py-1 text-[var(--color-phosphor-dim)]">
                  {fmtClock(ts)}
                </td>
                <td
                  className={`px-3 py-1 ${
                    o.side === "buy"
                      ? "text-[var(--color-gain)]"
                      : "text-[var(--color-loss)] glow-loss"
                  }`}
                >
                  {o.side.toUpperCase()}
                </td>
                <td className="px-3 py-1">{o.symbol}</td>
                <td className="px-3 py-1 text-right">{qtyDisplay}</td>
                <td className="px-3 py-1 text-right">{priceCell(o)}</td>
                <td
                  className={`px-3 py-1 text-right ${
                    pl == null
                      ? "text-[var(--color-phosphor-dim)]"
                      : plUp
                        ? "text-[var(--color-gain)]"
                        : "text-[var(--color-loss)] glow-loss"
                  }`}
                >
                  {pl != null ? fmtUsd(pl, { sign: true }) : "—"}
                </td>
                <td className={`px-3 py-1 uppercase ${statusCls}`}>
                  {o.status.replace(/_/g, " ")}
                </td>
              </tr>
            );
          })}
          {items.length === 0 && !isLoading && (
            <tr>
              <td
                colSpan={7}
                className="px-3 py-6 text-center text-xs text-[var(--color-phosphor-dim)]"
              >
                no orders yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {error && (
        <div className="border-t border-[var(--color-loss)] px-3 py-1 text-xs text-[var(--color-loss)] glow-loss">
          ERROR: {error}
        </div>
      )}
      <div className="sticky bottom-0 border-t border-[var(--color-phosphor-dark)] bg-[var(--color-bg)] px-3 py-1 text-[10px] text-[var(--color-phosphor-dim)]">
        [click] focus symbol · [c] cancel highlighted · [CSV] export
      </div>
    </Panel>
  );
}
