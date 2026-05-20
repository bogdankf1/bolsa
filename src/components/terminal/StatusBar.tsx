"use client";

import { fmtPct, fmtUsd } from "@/lib/format";
import { usePortfolio } from "@/lib/hooks";

export function StatusBar() {
  const { data } = usePortfolio();

  const portfolioValue = data?.portfolioValue ?? 0;
  const cash = data?.cash ?? 0;
  const dayPl = data?.dayPl ?? 0;
  const dayPlPct = data?.dayPlPct ?? 0;
  const unrealizedPl = data?.unrealizedPl ?? 0;
  const unrealizedPlPct = data?.unrealizedPlPct ?? 0;

  return (
    <div className="grid grid-cols-5 items-center gap-4 border-y border-[var(--color-phosphor-dark)] bg-[color-mix(in_srgb,var(--color-phosphor)_4%,transparent)] px-4 py-1.5 text-xs font-display">
      <Cell
        label="PORTFOLIO"
        value={data ? fmtUsd(portfolioValue) : "—"}
        strong
      />
      <Cell
        label="DAY P&L"
        value={
          data
            ? `${fmtUsd(dayPl, { sign: true })} (${fmtPct(dayPlPct)})`
            : "—"
        }
        accent={data && dayPl >= 0 ? "gain" : "loss"}
      />
      <Cell
        label="UNREALIZED"
        value={
          data
            ? `${fmtUsd(unrealizedPl, { sign: true })} (${fmtPct(unrealizedPlPct)})`
            : "—"
        }
        accent={data && unrealizedPl >= 0 ? "gain" : "loss"}
      />
      <Cell label="CASH" value={data ? fmtUsd(cash) : "—"} />
      <Cell
        label="POSITIONS"
        value={data ? String(data.positionsCount) : "—"}
      />
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
      : accent === "gain"
        ? "text-[var(--color-gain)] glow"
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
