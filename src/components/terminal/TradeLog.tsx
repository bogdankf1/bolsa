"use client";

import { Panel } from "./Panel";
import { fmtPrice } from "@/lib/format";
import { useTrades } from "@/lib/hooks";

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

export function TradeLog() {
  const { data: trades, isLoading } = useTrades(100);
  const items = trades ?? [];

  return (
    <Panel
      title="Trade Log"
      rightSlot={items.length === 0 ? (isLoading ? "loading…" : "0 fills") : `${items.length} fills`}
      bodyClassName="font-mono"
    >
      <table className="w-full text-sm tabular-nums">
        <thead className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-phosphor-dim)]">
          <tr className="border-b border-[var(--color-phosphor-dark)]">
            <th className="px-3 py-1 text-left font-normal">TIME</th>
            <th className="px-3 py-1 text-left font-normal">SIDE</th>
            <th className="px-3 py-1 text-left font-normal">SYM</th>
            <th className="px-3 py-1 text-right font-normal">QTY</th>
            <th className="px-3 py-1 text-right font-normal">PRICE</th>
            <th className="px-3 py-1 text-left font-normal">STATUS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-phosphor-faint)]">
          {items.map((t) => {
            const price = t.filledAvgPrice ?? t.limitPrice ?? 0;
            return (
              <tr
                key={t.id}
                className="hover:bg-[color-mix(in_srgb,var(--color-phosphor)_5%,transparent)]"
              >
                <td className="px-3 py-1 text-[var(--color-phosphor-dim)]">
                  {fmtClock(t.filledAt ?? t.submittedAt)}
                </td>
                <td
                  className={`px-3 py-1 ${
                    t.side === "buy"
                      ? "text-[var(--color-gain)]"
                      : "text-[var(--color-loss)] glow-loss"
                  }`}
                >
                  {t.side.toUpperCase()}
                </td>
                <td className="px-3 py-1">{t.symbol}</td>
                <td className="px-3 py-1 text-right">{t.filledQty || t.qty}</td>
                <td className="px-3 py-1 text-right">
                  {price > 0 ? `@ ${fmtPrice(price)}` : "—"}
                </td>
                <td className="px-3 py-1 text-[var(--color-phosphor-dim)] uppercase">
                  {t.status.replace(/_/g, " ")}
                </td>
              </tr>
            );
          })}
          {items.length === 0 && !isLoading && (
            <tr>
              <td
                colSpan={6}
                className="px-3 py-6 text-center text-xs text-[var(--color-phosphor-dim)]"
              >
                no fills yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}
