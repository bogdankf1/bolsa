"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { Panel } from "./Panel";
import { fmtPct, fmtPrice, fmtUsd } from "@/lib/format";
import { placeOrder, usePortfolio } from "@/lib/hooks";
import { useHotkey } from "@/lib/hotkeys";
import { useChoreography } from "@/lib/choreography";
import type { Position } from "@/core/types";

type Props = {
  selected: string | null;
  onSelect: (symbol: string) => void;
  active: boolean;
  /** Suppress the inner Panel corner-bracket header (the tab container
   *  provides one above). */
  headless?: boolean;
};

export function Positions({ selected, onSelect, active, headless }: Props) {
  const { data } = usePortfolio();
  const { activeAgentSymbol } = useChoreography();
  const positions = data?.positions ?? [];

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Pending flatten — requires y/n confirmation before firing.
  const [pendingFlatten, setPendingFlatten] = useState<Position | null>(null);

  // Cancel any pending flatten confirmation if the targeted symbol disappears
  // (e.g. an unrelated effect closed the position elsewhere).
  useEffect(() => {
    if (!pendingFlatten) return;
    if (!positions.some((p) => p.symbol === pendingFlatten.symbol)) {
      setPendingFlatten(null);
    }
  }, [pendingFlatten, positions]);

  // Also dismiss the pending prompt if the user navigates away from the tab.
  useEffect(() => {
    if (!active) setPendingFlatten(null);
  }, [active]);

  const flatten = useCallback(async (pos: Position) => {
    setError(null);
    setBusyId(pos.symbol);
    try {
      await placeOrder({
        symbol: pos.symbol,
        qty: Math.abs(pos.qty),
        side: pos.side === "long" ? "sell" : "buy",
        type: "market",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "flatten failed");
    } finally {
      setBusyId(null);
    }
  }, []);

  const requestFlatten = useCallback((pos: Position) => {
    setError(null);
    setPendingFlatten(pos);
  }, []);

  const confirmFlatten = useCallback(async () => {
    if (!pendingFlatten) return;
    const pos = pendingFlatten;
    setPendingFlatten(null);
    await flatten(pos);
  }, [pendingFlatten, flatten]);

  const cancelFlatten = useCallback(() => {
    setPendingFlatten(null);
  }, []);

  // Navigation across positions when this tab is active. The Watchlist's
  // j/k is gated on its own `active` flag so the two never collide.
  const symbols = positions.map((p) => p.symbol);
  const navDown = useCallback(
    (e: KeyboardEvent) => {
      if (symbols.length === 0) return;
      const idx = selected ? symbols.indexOf(selected) : -1;
      e.preventDefault();
      onSelect(symbols[(idx + 1 + symbols.length) % symbols.length]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, positions.length],
  );
  const navUp = useCallback(
    (e: KeyboardEvent) => {
      if (symbols.length === 0) return;
      const idx = selected ? symbols.indexOf(selected) : -1;
      e.preventDefault();
      onSelect(symbols[(idx - 1 + symbols.length) % symbols.length]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, positions.length],
  );
  // Higher priority so when both tabs mount, the active one wins.
  useHotkey("j", navDown, { enabled: active, priority: 10 });
  useHotkey("ArrowDown", navDown, { enabled: active, priority: 10 });
  useHotkey("k", navUp, { enabled: active, priority: 10 });
  useHotkey("ArrowUp", navUp, { enabled: active, priority: 10 });

  // `f` opens the flatten confirm prompt for the highlighted position.
  // y/n then confirms/cancels — matches the :reset palette pattern.
  const onFlattenKey = useCallback(
    (e: KeyboardEvent) => {
      if (!selected || pendingFlatten) return;
      const pos = positions.find((p) => p.symbol === selected);
      if (!pos) return;
      e.preventDefault();
      requestFlatten(pos);
    },
    [selected, positions, pendingFlatten, requestFlatten],
  );
  const onYes = useCallback(
    (e: KeyboardEvent) => {
      if (!pendingFlatten) return;
      e.preventDefault();
      void confirmFlatten();
    },
    [pendingFlatten, confirmFlatten],
  );
  const onNo = useCallback(
    (e: KeyboardEvent) => {
      if (!pendingFlatten) return;
      e.preventDefault();
      cancelFlatten();
    },
    [pendingFlatten, cancelFlatten],
  );
  useHotkey("f", onFlattenKey, { enabled: active });
  useHotkey("y", onYes, { enabled: active && !!pendingFlatten, priority: 20 });
  useHotkey("Y", onYes, { enabled: active && !!pendingFlatten, priority: 20 });
  useHotkey("n", onNo, { enabled: active && !!pendingFlatten, priority: 20 });
  useHotkey("N", onNo, { enabled: active && !!pendingFlatten, priority: 20 });
  useHotkey("Escape", onNo, {
    enabled: active && !!pendingFlatten,
    priority: 20,
  });

  return (
    <Panel
      title={headless ? undefined : "Positions"}
      rightSlot={
        headless
          ? undefined
          : positions.length === 0
            ? "—"
            : `${positions.length} held`
      }
      className={headless ? "border-0" : ""}
    >
      <div className="grid grid-cols-[2fr_1fr_2fr_2fr] gap-2 border-b border-[var(--color-phosphor-dark)] px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--color-phosphor-dim)]">
        <span>SYM</span>
        <span className="text-right">QTY</span>
        <span className="text-right">AVG</span>
        <span className="text-right">P&amp;L</span>
      </div>
      <ul className="divide-y divide-[var(--color-phosphor-faint)]">
        {positions.map((p) => (
          <PositionRow
            key={p.symbol}
            position={p}
            isSelected={p.symbol === selected}
            isAgentTouched={p.symbol === activeAgentSymbol}
            isBusy={busyId === p.symbol}
            onSelect={onSelect}
          />
        ))}
        {positions.length === 0 && data && (
          <li className="px-3 py-4 text-center text-xs text-[var(--color-phosphor-dim)]">
            no open positions
          </li>
        )}
      </ul>
      {pendingFlatten && (
        <div className="border-t border-[var(--color-amber)] bg-[color-mix(in_srgb,var(--color-amber)_10%,transparent)] px-3 py-2 text-xs text-[var(--color-amber)] [text-shadow:0_0_4px_rgba(255,176,0,0.6)]">
          <div className="font-display text-sm">
            FLATTEN {pendingFlatten.symbol} ({Math.abs(pendingFlatten.qty)} @
            MKT)?
          </div>
          <div className="mt-1 text-[10px] text-[var(--color-phosphor-dim)] [text-shadow:none]">
            [y] confirm · [n] cancel
          </div>
        </div>
      )}
      {error && (
        <div className="border-t border-[var(--color-loss)] px-3 py-1 text-xs text-[var(--color-loss)] glow-loss">
          ERROR: {error}
        </div>
      )}
      <div className="border-t border-[var(--color-phosphor-dark)] px-3 py-2">
        <p className="text-[10px] text-[var(--color-phosphor-dim)]">
          [j/k] nav · [f] flatten selected · [click] focus
        </p>
      </div>
    </Panel>
  );
}

type RowProps = {
  position: Position;
  isSelected: boolean;
  isAgentTouched: boolean;
  isBusy: boolean;
  onSelect: (sym: string) => void;
};

const PositionRow = memo(function PositionRow({
  position: p,
  isSelected,
  isAgentTouched,
  isBusy,
  onSelect,
}: RowProps) {
  const up = p.unrealizedPl >= 0;
  return (
    <li
      onClick={() => onSelect(p.symbol)}
      className={`grid cursor-pointer grid-cols-[2fr_1fr_2fr_2fr] gap-2 px-3 py-[6px] text-sm tabular-nums ${
        isSelected
          ? "bg-[color-mix(in_srgb,var(--color-phosphor)_15%,transparent)] glow"
          : "hover:bg-[color-mix(in_srgb,var(--color-phosphor)_6%,transparent)]"
      } ${isBusy ? "opacity-50" : ""} ${
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
        {p.symbol}
        {isAgentTouched && (
          <span className="ml-1 animate-pulse" aria-hidden>
            ◉
          </span>
        )}
      </span>
      <span className="text-right">{p.qty}</span>
      <span className="text-right text-[var(--color-phosphor-dim)]">
        {fmtPrice(p.avgEntryPrice)}
      </span>
      <span
        className={`text-right ${
          up ? "text-[var(--color-gain)]" : "text-[var(--color-loss)] glow-loss"
        }`}
      >
        {fmtUsd(p.unrealizedPl, { sign: true })}
        <span className="ml-1 text-[10px] opacity-80">
          ({fmtPct(p.unrealizedPlPct)})
        </span>
      </span>
    </li>
  );
});

