"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useSetConnectionStatus } from "@/lib/connection";
import { useChoreography } from "@/lib/choreography";
import type { Snapshot } from "@/core/types";

type Props = {
  selected: string | null;
  onSelect: (ticker: string) => void;
  active: boolean;
  /**
   * When true, suppress the inner Panel corner-bracket header. The parent
   * (tab container in page.tsx) provides the visible header.
   */
  headless?: boolean;
};

const EMPTY_SYMBOLS: string[] = [];

export function Watchlist({ selected, onSelect, active, headless }: Props) {
  const { data: wl } = useWatchlist();
  const { activeAgentSymbol } = useChoreography();
  // Stabilize the array reference so downstream hooks/memos don't churn
  // every render when wl is undefined.
  const symbols = wl?.symbols ?? EMPTY_SYMBOLS;

  const live = useQuoteStream(symbols);
  const streamOpen = live.status === "open";
  const { data: snapData } = useSnapshots(symbols, streamOpen);
  const snapshots = snapData?.snapshots ?? {};

  // Surface the SSE connection status to the Header indicator.
  const setConnStatus = useSetConnectionStatus();
  useEffect(() => {
    setConnStatus(live.status);
  }, [live.status, setConnStatus]);

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

  useHotkey("j", moveDown, { enabled: active });
  useHotkey("ArrowDown", moveDown, { enabled: active });
  useHotkey("k", moveUp, { enabled: active });
  useHotkey("ArrowUp", moveUp, { enabled: active });
  useHotkey("d", removeSelected, { enabled: active });

  // Beep when any watched symbol's price ticks. Computes a single seq
  // sum so the effect only fires when something actually changed.
  //
  // Liquid tickers (AAPL/NVDA/SPY/…) tick many times per second during
  // open market, which makes the beep feel like a metronome. We
  // throttle to at most one play per ~1.2 s — still conveys "market is
  // alive" without being a constant heartbeat.
  const TICK_MIN_INTERVAL_MS = 1200;
  const tickSeqsRef = useRef<Record<string, number>>({});
  const lastTickAtRef = useRef(0);
  const totalSeq = useMemo(() => {
    let total = 0;
    for (const sym of symbols) total += live.tickSeq[sym] ?? 0;
    return total;
  }, [live.tickSeq, symbols]);
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
    if (!changed) return;
    const now = Date.now();
    if (now - lastTickAtRef.current < TICK_MIN_INTERVAL_MS) return;
    lastTickAtRef.current = now;
    play("tick");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalSeq]);

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
    <Panel
      title={headless ? undefined : "Watchlist"}
      rightSlot={headless ? undefined : `${symbols.length} symbols`}
      className={headless ? "border-0" : ""}
    >
      <div className="grid grid-cols-[2fr_3fr_2fr] gap-2 border-b border-[var(--color-phosphor-dark)] px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--color-phosphor-dim)]">
        <span>SYM</span>
        <span className="text-right">LAST</span>
        <span className="text-right">CHG%</span>
      </div>
      <ul className="divide-y divide-[var(--color-phosphor-faint)]">
        {symbols.map((sym) => (
          <WatchlistRow
            key={sym}
            symbol={sym}
            snapshot={snapshots[sym]}
            tickDir={live.tickDir[sym] ?? null}
            tickSeq={live.tickSeq[sym] ?? 0}
            isSelected={sym === selected}
            isAgentTouched={sym === activeAgentSymbol}
            onSelect={onSelect}
          />
        ))}
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

// Row is memoized so a tick on AAPL doesn't re-render VOO, QQQ, SPY, TSLA.
// React.memo's default shallow compare works because we pass primitives /
// the snapshot reference, which only changes when that symbol's snapshot
// actually updated.

type RowProps = {
  symbol: string;
  snapshot: Snapshot | undefined;
  tickDir: "up" | "down" | null;
  tickSeq: number;
  isSelected: boolean;
  isAgentTouched: boolean;
  onSelect: (sym: string) => void;
};

const WatchlistRow = memo(function WatchlistRow({
  symbol,
  snapshot,
  tickDir,
  tickSeq,
  isSelected,
  isAgentTouched,
  onSelect,
}: RowProps) {
  const priceRef = useRef<HTMLSpanElement>(null);

  // Imperatively retrigger the tick-up/tick-down CSS animation without
  // remounting the node. Avoids creating a new DOM element on every tick.
  useEffect(() => {
    const el = priceRef.current;
    if (!el || !tickDir || tickSeq === 0) return;
    const cls = tickDir === "up" ? "tick-up" : "tick-down";
    el.classList.remove("tick-up", "tick-down");
    // Force reflow so the animation restarts on re-add
    void el.offsetWidth;
    el.classList.add(cls);
  }, [tickSeq, tickDir]);

  const s = snapshot;
  const up = s ? s.change >= 0 : true;

  return (
    <li
      onClick={() => onSelect(symbol)}
      className={`grid cursor-pointer grid-cols-[2fr_3fr_2fr] gap-2 px-3 py-[6px] text-sm tabular-nums transition-colors ${
        isSelected
          ? "bg-[color-mix(in_srgb,var(--color-phosphor)_15%,transparent)] glow"
          : "hover:bg-[color-mix(in_srgb,var(--color-phosphor)_6%,transparent)]"
      } ${
        isAgentTouched
          ? "border-l-2 border-[var(--color-amber)] [box-shadow:inset_2px_0_8px_rgba(255,176,0,0.25)]"
          : "border-l-2 border-transparent"
      }`}
    >
      <span
        className={
          isAgentTouched
            ? "text-[var(--color-amber)] [text-shadow:0_0_4px_rgba(255,176,0,0.6)]"
            : "font-medium"
        }
      >
        {isSelected ? "▸ " : "  "}
        {symbol}
        {isAgentTouched && (
          <span className="ml-1 animate-pulse" aria-hidden>
            ◉
          </span>
        )}
      </span>
      <span ref={priceRef} className="text-right">
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
});
