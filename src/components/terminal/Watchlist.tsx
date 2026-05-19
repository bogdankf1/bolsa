"use client";

import { useEffect, useState } from "react";
import { Panel } from "./Panel";
import { fmtPct, fmtPrice } from "@/lib/format";
import {
  addWatchlistSymbol,
  removeWatchlistSymbol,
  useQuoteStream,
  useSnapshots,
  useWatchlist,
} from "@/lib/hooks";

type Props = {
  selected: string | null;
  onSelect: (ticker: string) => void;
};

export function Watchlist({ selected, onSelect }: Props) {
  const { data: wl } = useWatchlist();
  const symbols = wl?.symbols ?? [];
  const { data: snapData } = useSnapshots(symbols);
  const snapshots = snapData?.snapshots ?? {};
  const live = useQuoteStream(symbols);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  // Keyboard nav: j/k to move selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (symbols.length === 0) return;
      const idx = selected ? symbols.indexOf(selected) : -1;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        onSelect(symbols[(idx + 1 + symbols.length) % symbols.length]);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        onSelect(
          symbols[(idx - 1 + symbols.length) % symbols.length],
        );
      } else if (e.key === "d" && selected) {
        e.preventDefault();
        void handleRemove(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols, selected]);

  async function handleAdd(sym: string) {
    if (!sym) return;
    setBusy(true);
    try {
      await addWatchlistSymbol(sym);
      setInput("");
      onSelect(sym.trim().toUpperCase());
    } catch (e) {
      console.error("add symbol failed", e);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(sym: string) {
    setBusy(true);
    try {
      await removeWatchlistSymbol(sym);
      if (selected === sym) {
        const next = symbols.find((s) => s !== sym);
        if (next) onSelect(next);
      }
    } catch (e) {
      console.error("remove symbol failed", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Watchlist" rightSlot={`${symbols.length} symbols`}>
      <div className="grid grid-cols-[2fr_3fr_2fr] gap-2 border-b border-[var(--color-phosphor-dark)] px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--color-phosphor-dim)]">
        <span>SYM</span>
        <span className="text-right">LAST</span>
        <span className="text-right">CHG%</span>
      </div>
      <ul className="divide-y divide-[var(--color-phosphor-faint)]">
        {symbols.map((sym) => {
          const s = snapshots[sym];
          const isSel = sym === selected;
          const up = s ? s.change >= 0 : true;
          const tickDir = live.tickDir[sym];
          const tickSeq = live.tickSeq[sym] ?? 0;
          const tickCls =
            tickDir === "up"
              ? "tick-up"
              : tickDir === "down"
                ? "tick-down"
                : "";
          return (
            <li
              key={sym}
              onClick={() => onSelect(sym)}
              className={`grid cursor-pointer grid-cols-[2fr_3fr_2fr] gap-2 px-3 py-[6px] text-sm tabular-nums transition-colors ${
                isSel
                  ? "bg-[color-mix(in_srgb,var(--color-phosphor)_15%,transparent)] glow"
                  : "hover:bg-[color-mix(in_srgb,var(--color-phosphor)_6%,transparent)]"
              }`}
            >
              <span className="font-medium">
                {isSel ? "▸ " : "  "}
                {sym}
              </span>
              <span
                key={`px-${tickSeq}`}
                className={`text-right ${tickCls}`}
              >
                {s ? fmtPrice(s.lastPrice) : "—"}
              </span>
              <span
                className={`text-right ${
                  s == null
                    ? "text-[var(--color-phosphor-dim)]"
                    : up
                      ? "text-[var(--color-gain)]"
                      : "text-[var(--color-loss)] glow-loss"
                }`}
              >
                {s ? fmtPct(s.changePct) : "—"}
              </span>
            </li>
          );
        })}
        {symbols.length === 0 && wl && (
          <li className="px-3 py-4 text-center text-xs text-[var(--color-phosphor-dim)]">
            empty — add a symbol below
          </li>
        )}
      </ul>
      <div className="border-t border-[var(--color-phosphor-dark)] px-3 py-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd(input.trim().toUpperCase());
          }}
          className="flex items-center gap-2 text-sm"
        >
          <span className="text-[var(--color-phosphor-dim)]">&gt;</span>
          <input
            type="text"
            placeholder="ADD SYMBOL..."
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            disabled={busy}
            className="crt-input flex-1 border-none px-0 uppercase disabled:opacity-50"
          />
          <span className="cursor-blink" />
        </form>
        <p className="mt-1 text-[10px] text-[var(--color-phosphor-dim)]">
          [j/k] nav · [d] delete · [Enter] add
        </p>
      </div>
    </Panel>
  );
}
