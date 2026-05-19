"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "./Panel";
import { fmtPct, fmtPrice } from "@/lib/format";
import {
  addWatchlistSymbol,
  removeWatchlistSymbol,
  useAssetSearch,
  useQuoteStream,
  useSnapshots,
  useWatchlist,
} from "@/lib/hooks";
import { useHotkey } from "@/lib/hotkeys";
import { registerFocusTarget } from "@/lib/focus";
import { useAudio } from "@/lib/audio";

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
  const [highlightIdx, setHighlightIdx] = useState(0);
  const { play } = useAudio();

  const { data: searchData } = useAssetSearch(input);
  const matches = useMemo(() => {
    const results = searchData?.results ?? [];
    // Hide symbols already in the watchlist; show top 5.
    return results.filter((a) => !symbols.includes(a.symbol)).slice(0, 5);
  }, [searchData, symbols]);

  // Reset highlight whenever the match list changes
  useEffect(() => {
    setHighlightIdx(0);
  }, [input, matches.length]);

  const moveDown = useCallback(
    (e: KeyboardEvent) => {
      if (symbols.length === 0) return;
      const idx = selected ? symbols.indexOf(selected) : -1;
      e.preventDefault();
      onSelect(symbols[(idx + 1 + symbols.length) % symbols.length]);
    },
    [symbols, selected, onSelect],
  );

  const moveUp = useCallback(
    (e: KeyboardEvent) => {
      if (symbols.length === 0) return;
      const idx = selected ? symbols.indexOf(selected) : -1;
      e.preventDefault();
      onSelect(symbols[(idx - 1 + symbols.length) % symbols.length]);
    },
    [symbols, selected, onSelect],
  );

  const removeSelected = useCallback(
    (e: KeyboardEvent) => {
      if (!selected) return;
      e.preventDefault();
      void handleRemove(selected);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected],
  );

  useHotkey("j", moveDown);
  useHotkey("ArrowDown", moveDown);
  useHotkey("k", moveUp);
  useHotkey("ArrowUp", moveUp);
  useHotkey("d", removeSelected);

  // Beep when any watched symbol's price ticks
  const tickSeqsRef = useRef<Record<string, number>>({});
  useEffect(() => {
    let changed = false;
    for (const sym of symbols) {
      const next = live.tickSeq[sym] ?? 0;
      const prev = tickSeqsRef.current[sym] ?? 0;
      if (next > prev) {
        tickSeqsRef.current[sym] = next;
        changed = true;
      }
    }
    if (changed) play("tick");
  }, [live.tickSeq, symbols, play]);

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

  function handleSubmit() {
    if (matches.length > 0) {
      handleAdd(matches[highlightIdx]?.symbol ?? matches[0].symbol);
    } else {
      handleAdd(input.trim().toUpperCase());
    }
  }

  function handleInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Tab") {
      e.preventDefault();
      setInput(matches[highlightIdx]?.symbol ?? matches[0].symbol);
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
            handleSubmit();
          }}
          className="flex items-center gap-2 text-sm"
        >
          <span className="text-[var(--color-phosphor-dim)]">&gt;</span>
          <input
            ref={(el) => registerFocusTarget("watchlist-input", el)}
            type="text"
            placeholder="ADD SYMBOL..."
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              play("keystroke");
              handleInputKey(e);
            }}
            disabled={busy}
            className="crt-input flex-1 border-none px-0 uppercase disabled:opacity-50"
          />
          <span className="cursor-blink" />
        </form>

        {input && matches.length > 0 && (
          <ul className="mt-1 max-h-40 overflow-hidden border border-[var(--color-phosphor-dark)] text-xs">
            {matches.map((m, i) => (
              <li
                key={m.symbol}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleAdd(m.symbol);
                }}
                onMouseEnter={() => setHighlightIdx(i)}
                className={`grid cursor-pointer grid-cols-[auto_1fr_auto] gap-2 px-2 py-1 ${
                  i === highlightIdx
                    ? "bg-[color-mix(in_srgb,var(--color-phosphor)_15%,transparent)] glow"
                    : "hover:bg-[color-mix(in_srgb,var(--color-phosphor)_6%,transparent)]"
                }`}
              >
                <span className="font-medium">
                  {i === highlightIdx ? "▸" : " "}
                </span>
                <span className="truncate">
                  <span className="font-medium">{m.symbol}</span>
                  <span className="ml-2 text-[var(--color-phosphor-dim)]">
                    {m.name}
                  </span>
                </span>
                <span className="text-[10px] text-[var(--color-phosphor-dim)]">
                  {m.exchange}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-1 text-[10px] text-[var(--color-phosphor-dim)]">
          [j/k] nav · [d] del · [/] focus · [:] cmd · [↑↓] match · [Tab] complete · [Enter] add
        </p>
      </div>
    </Panel>
  );
}
