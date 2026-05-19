import { fmtPct, fmtUsd } from "@/lib/format";
import { mockAccount } from "@/lib/mock";

export function StatusBar() {
  const a = mockAccount;
  const pnl = a.portfolioValue - a.startingBalance;
  const pnlPct = (pnl / a.startingBalance) * 100;
  const up = pnl >= 0;

  return (
    <div className="grid grid-cols-4 items-center gap-4 border-y border-[var(--color-phosphor-dark)] bg-[color-mix(in_srgb,var(--color-phosphor)_4%,transparent)] px-4 py-1.5 text-xs font-display">
      <Cell label="PORTFOLIO" value={fmtUsd(a.portfolioValue)} strong />
      <Cell
        label="P&L"
        value={`${fmtUsd(pnl, { sign: true })} (${fmtPct(pnlPct)})`}
        accent={up ? "gain" : "loss"}
      />
      <Cell label="CASH" value={fmtUsd(a.cash)} />
      <Cell label="BUYING POWER" value={fmtUsd(a.buyingPower)} />
    </div>
  );
}

function Cell({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: "gain" | "loss";
}) {
  const cls =
    accent === "loss"
      ? "text-[var(--color-loss)] glow-loss"
      : strong
        ? "glow-strong"
        : "glow";
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--color-phosphor-dim)] [text-shadow:none]">
        {label}
      </span>
      <span className={`text-base tabular-nums ${cls}`}>{value}</span>
    </div>
  );
}
