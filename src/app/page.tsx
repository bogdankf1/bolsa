"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components/terminal/Header";
import { Watchlist } from "@/components/terminal/Watchlist";
import { Positions } from "@/components/terminal/Positions";
import { Agent } from "@/components/terminal/Agent";
import { ChartPanel } from "@/components/terminal/ChartPanel";
import { OrderEntry } from "@/components/terminal/OrderEntry";
import { StatusBar } from "@/components/terminal/StatusBar";
import { TradeLog } from "@/components/terminal/TradeLog";
import { CommandPalette } from "@/components/terminal/CommandPalette";
import { useAgentState, usePortfolio, useWatchlist } from "@/lib/hooks";
import { useHotkey } from "@/lib/hotkeys";
import { focusTarget } from "@/lib/focus";
import { ConnectionProvider } from "@/lib/connection";

type LeftTab = "watchlist" | "positions" | "agent";

export default function Home() {
  const { data: wl } = useWatchlist();
  const { data: portfolio } = usePortfolio();
  const { state: agentState } = useAgentState();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<LeftTab>("watchlist");

  // When an agent connects, auto-jump to the Agent tab so the user sees
  // the live stream without hunting for it. Only fires on the active-id
  // transition from null → set; subsequent re-renders are no-ops.
  const prevSessionRef = useRef<string | null>(null);
  useEffect(() => {
    const cur = agentState.activeSessionId;
    if (cur && cur !== prevSessionRef.current) {
      setTab("agent");
    }
    prevSessionRef.current = cur;
  }, [agentState.activeSessionId]);

  // Auto-select first symbol when watchlist arrives or selection becomes stale
  useEffect(() => {
    const symbols = wl?.symbols ?? [];
    if (symbols.length === 0) {
      setSelected(null);
      return;
    }
    if (!selected || !symbols.includes(selected)) {
      setSelected(symbols[0]);
    }
  }, [wl, selected]);

  useHotkey("/", (e) => {
    if (focusTarget("watchlist-input")) {
      e.preventDefault();
    }
  });
  useHotkey("w", (e) => {
    e.preventDefault();
    setTab("watchlist");
  });
  useHotkey("p", (e) => {
    e.preventDefault();
    setTab("positions");
  });
  useHotkey("a", (e) => {
    e.preventDefault();
    setTab("agent");
  });

  const focusSymbol = useCallback((s: string) => setSelected(s), []);

  const watchlistCount = wl?.symbols.length ?? 0;
  const positionsCount = portfolio?.positions.length ?? 0;
  const rightSlotText =
    tab === "watchlist"
      ? `${watchlistCount} symbols`
      : tab === "positions"
        ? positionsCount === 0
          ? "—"
          : `${positionsCount} held`
        : agentState.activeSessionId
          ? "live"
          : agentState.shouldStop
            ? "stopped"
            : "idle";

  return (
    <ConnectionProvider>
      <main className="flex h-screen flex-col">
        <Header />

        <section className="grid min-h-0 flex-1 grid-cols-[minmax(240px,280px)_1fr]">
          <section className="flex min-h-0 flex-col border border-[var(--color-phosphor-dark)]">
            <header className="flex items-center border-b border-[var(--color-phosphor-dark)] bg-[color-mix(in_srgb,var(--color-phosphor)_5%,transparent)] text-[11px] uppercase tracking-[0.18em]">
              <TabButton
                active={tab === "watchlist"}
                onClick={() => setTab("watchlist")}
                label="[W] Watchlist"
              />
              <TabButton
                active={tab === "positions"}
                onClick={() => setTab("positions")}
                label="[P] Positions"
              />
              <TabButton
                active={tab === "agent"}
                onClick={() => setTab("agent")}
                label="[A] Agent"
                pulse={!!agentState.activeSessionId}
              />
            </header>
            <div className="border-b border-[var(--color-phosphor-dark)] px-3 py-[2px] text-[10px] uppercase tracking-[0.18em] text-[var(--color-phosphor-dim)]">
              {rightSlotText}
            </div>
            <div className="relative min-h-0 flex-1">
              <div
                className={tab === "watchlist" ? "flex h-full flex-col" : "hidden"}
              >
                <Watchlist
                  selected={selected}
                  onSelect={setSelected}
                  active={tab === "watchlist"}
                  headless
                />
              </div>
              <div
                className={tab === "positions" ? "flex h-full flex-col" : "hidden"}
              >
                <Positions
                  selected={selected}
                  onSelect={setSelected}
                  active={tab === "positions"}
                  headless
                />
              </div>
              <div
                className={tab === "agent" ? "flex h-full flex-col" : "hidden"}
              >
                <Agent active={tab === "agent"} headless />
              </div>
            </div>
          </section>
          <div className="grid min-h-0 grid-rows-[1fr_auto] border-l border-[var(--color-phosphor-dark)]">
            <ChartPanel symbol={selected} />
            <OrderEntry symbol={selected} />
          </div>
        </section>

        <StatusBar />

        <section className="min-h-[180px] flex-shrink-0 basis-[220px]">
          <TradeLog onSelectSymbol={focusSymbol} />
        </section>

        <CommandPalette />
      </main>
    </ConnectionProvider>
  );
}

function TabButton({
  active,
  onClick,
  label,
  pulse,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  pulse?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-3 py-1 ${
        active
          ? "bg-[color-mix(in_srgb,var(--color-phosphor)_15%,transparent)] glow"
          : "text-[var(--color-phosphor-dim)] hover:text-[var(--color-phosphor)]"
      }`}
    >
      {label}
      {pulse && !active && (
        <span
          className="absolute right-1 top-1 inline-block size-1.5 animate-pulse rounded-full bg-[var(--color-amber)] [box-shadow:0_0_6px_var(--color-amber)]"
          aria-hidden
        />
      )}
    </button>
  );
}
