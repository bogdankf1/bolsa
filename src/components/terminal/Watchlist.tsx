"use client";

import { useEffect } from "react";
import { Panel } from "./Panel";
import { fmtPct, fmtPrice } from "@/lib/format";
import type { Symbol } from "@/lib/mock";

type Props = {
  symbols: Symbol[];
  selected: string;
  onSelect: (ticker: string) => void;
};

export function Watchlist({ symbols, selected, onSelect }: Props) {
  // Keyboard nav: j/k to move selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const idx = symbols.findIndex((s) => s.ticker === selected);
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = symbols[(idx + 1) % symbols.length];
        if (next) onSelect(next.ticker);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev =
          symbols[(idx - 1 + symbols.length) % symbols.length];
        if (prev) onSelect(prev.ticker);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [symbols, selected, onSelect]);

  return (
    <Panel title="Watchlist" rightSlot={`${symbols.length} symbols`}>
      <div className="grid grid-cols-[2fr_3fr_2fr] gap-2 border-b border-[var(--color-phosphor-dark)] px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--color-phosphor-dim)]">
        <span>SYM</span>
        <span className="text-right">LAST</span>
        <span className="text-right">CHG%</span>
      </div>
      <ul className="divide-y divide-[var(--color-phosphor-faint)]">
        {symbols.map((s) => {
          const up = s.change >= 0;
          const isSel = s.ticker === selected;
          return (
            <li
              key={s.ticker}
              onClick={() => onSelect(s.ticker)}
              className={`grid cursor-pointer grid-cols-[2fr_3fr_2fr] gap-2 px-3 py-[6px] text-sm tabular-nums transition-colors ${
                isSel
                  ? "bg-[color-mix(in_srgb,var(--color-phosphor)_15%,transparent)] glow"
                  : "hover:bg-[color-mix(in_srgb,var(--color-phosphor)_6%,transparent)]"
              }`}
            >
              <span className="font-medium">
                {isSel ? "▸ " : "  "}
                {s.ticker}
              </span>
              <span className="text-right">{fmtPrice(s.price)}</span>
              <span
                className={`text-right ${
                  up
                    ? "text-[var(--color-gain)]"
                    : "text-[var(--color-loss)] glow-loss"
                }`}
              >
                {fmtPct(s.changePct)}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-[var(--color-phosphor-dark)] px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--color-phosphor-dim)]">&gt;</span>
          <input
            type="text"
            placeholder="ADD SYMBOL..."
            className="crt-input flex-1 border-none px-0 uppercase"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = (e.target as HTMLInputElement).value;
                if (v) console.log("add", v);
                (e.target as HTMLInputElement).value = "";
              }
            }}
          />
          <span className="cursor-blink" />
        </div>
      </div>
    </Panel>
  );
}
