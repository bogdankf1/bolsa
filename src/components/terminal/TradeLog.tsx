import { Panel } from "./Panel";
import { fmtPrice } from "@/lib/format";
import { mockTrades } from "@/lib/mock";

export function TradeLog() {
  return (
    <Panel
      title="Trade Log"
      rightSlot={`${mockTrades.length} fills`}
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
          {mockTrades.map((t) => (
            <tr key={t.id} className="hover:bg-[color-mix(in_srgb,var(--color-phosphor)_5%,transparent)]">
              <td className="px-3 py-1 text-[var(--color-phosphor-dim)]">
                {t.ts}
              </td>
              <td
                className={`px-3 py-1 ${
                  t.side === "BUY"
                    ? "text-[var(--color-gain)]"
                    : "text-[var(--color-loss)] glow-loss"
                }`}
              >
                {t.side}
              </td>
              <td className="px-3 py-1">{t.ticker}</td>
              <td className="px-3 py-1 text-right">{t.qty}</td>
              <td className="px-3 py-1 text-right">@ {fmtPrice(t.price)}</td>
              <td className="px-3 py-1 text-[var(--color-phosphor-dim)]">
                {t.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
