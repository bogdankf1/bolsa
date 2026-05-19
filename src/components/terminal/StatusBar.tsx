"use client";

import { fmtPct, fmtUsd } from "@/lib/format";
import { usePortfolio } from "@/lib/hooks";

export function StatusBar() {
  const { data } = usePortfolio();

  const portfolioValue = data?.portfolioValue ?? 0;
  const cash = data?.cash ?? 0;
  const buyingPower = data?.buyingPower ?? 0;
  const unrealizedPl = data?.unrealizedPl ?? 0;
  const unrealizedPlPct = data?.unrealizedPlPct ?? 0;
  const up = unrealizedPl >= 0;

  return (
    <div className="grid grid-cols-4 items-center gap-4 border-y border-[var(--color-phosphor-dark)] bg-[color-mix(in_srgb,var(--color-phosphor)_4%,transparent)] px-4 py-1.5 text-xs font-display">
      <Cell
        label="PORTFOLIO"
        value={data ? fmtUsd(portfolioValue) : "—"}
        strong
      />
      <Cell
        label="UNREALIZED P&L"
        value={
          data
            ? `${fmtUsd(unrealizedPl, { sign: true })} (${fmtPct(unrealizedPlPct)})`
            : "—"
        }
        accent={up ? "gain" : "loss"}
      />
      <Cell label="CASH" value={data ? fmtUsd(cash) : "—"} />
      <Cell label="BUYING POWER" value={data ? fmtUsd(buyingPower) : "—"} />
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
