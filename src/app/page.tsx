"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components/terminal/Header";
import { Watchlist } from "@/components/terminal/Watchlist";
import { Positions } from "@/components/terminal/Positions";
import { Agent } from "@/components/terminal/Agent";
import { Analytics } from "@/components/terminal/Analytics";
import { ChartPanel } from "@/components/terminal/ChartPanel";
import { OrderEntry } from "@/components/terminal/OrderEntry";
import { StatusBar } from "@/components/terminal/StatusBar";
import { TradeLog } from "@/components/terminal/TradeLog";
import { CommandPalette } from "@/components/terminal/CommandPalette";
import { useAgentState, usePortfolio, useWatchlist } from "@/lib/hooks";
import { useHotkey } from "@/lib/hotkeys";
import { focusTarget } from "@/lib/focus";
import { ConnectionProvider } from "@/lib/connection";
import {
  ChoreographyProvider,
  useChoreography,
} from "@/lib/choreography";
import {
  BacktestSelectionProvider,
  useBacktestSelection,
} from "@/lib/backtest-selection";

type LeftTab = "watchlist" | "positions" | "agent" | "analytics";

export default function Home() {
  return (
    <ConnectionProvider>
      <ChoreographyProvider>
        <BacktestSelectionProvider>
          <TerminalShell />
        </BacktestSelectionProvider>
      </ChoreographyProvider>
    </ConnectionProvider>
  );
}

function TerminalShell() {
  const { data: wl } = useWatchlist();
  const { data: portfolio } = usePortfolio();
  const { state: agentState } = useAgentState();
  const {
    targetTab,
    activeAgentSymbol,
    consumeTargetTab,
    notifyManualTab,
  } = useChoreography();
  const { selectedRun } = useBacktestSelection();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<LeftTab>("watchlist");

  // When a backtest is selected, snap the chart to its symbol so the
  // fill markers line up with whatever bars are loaded.
  const prevBacktestSymbolRef = useRef<string | null>(null);
  useEffect(() => {
    const sym = selectedRun?.symbol ?? null;
    if (sym && sym !== prevBacktestSymbolRef.current) {
      setSelected(sym);
    }
    prevBacktestSymbolRef.current = sym;
  }, [selectedRun]);

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

  // Apply choreography target tab. Manual override is enforced inside the
  // provider, so by the time we see a value here it's allowed to fire.
  useEffect(() => {
    if (targetTab && targetTab !== tab) {
      setTab(targetTab);
    }
    if (targetTab) consumeTargetTab();
  }, [targetTab, tab, consumeTargetTab]);

  // Follow the chart symbol the agent is working with. We only react to
  // *changes* — once we've matched it, repeated events on the same symbol
  // don't fight a user who clicked away.
  const prevAgentSymbolRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      activeAgentSymbol &&
      activeAgentSymbol !== prevAgentSymbolRef.current
    ) {
      setSelected(activeAgentSymbol);
    }
    prevAgentSymbolRef.current = activeAgentSymbol;
  }, [activeAgentSymbol]);

  // Auto-select first symbol when watchlist arrives or selection becomes stale
  useEffect(() => {
    const symbols = wl?.symbols ?? [];
    if (symbols.length === 0) {
      setSelected(null);
      return;
    }
    if (!selected || !symbols.includes(selected)) {
      // If the agent is currently focused on a symbol — even one not in
      // the watchlist — keep it; otherwise fall back to the first.
      if (activeAgentSymbol && selected === activeAgentSymbol) return;
      setSelected(symbols[0]);
    }
  }, [wl, selected, activeAgentSymbol]);

  const manualSetTab = useCallback(
    (next: LeftTab) => {
      notifyManualTab();
      setTab(next);
    },
    [notifyManualTab],
  );

  useHotkey("/", (e) => {
    if (focusTarget("watchlist-input")) {
      e.preventDefault();
    }
  });
  useHotkey("w", (e) => {
    e.preventDefault();
    manualSetTab("watchlist");
  });
  useHotkey("p", (e) => {
    e.preventDefault();
    manualSetTab("positions");
  });
  useHotkey("a", (e) => {
    e.preventDefault();
    manualSetTab("agent");
  });
  useHotkey("n", (e) => {
    e.preventDefault();
    manualSetTab("analytics");
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
        : tab === "analytics"
          ? "performance"
          : agentState.activeSessionId
            ? "live"
            : agentState.shouldStop
              ? "stopped"
              : "idle";

  return (
    <main className="flex h-screen flex-col">
      <Header />

      <section className="grid min-h-0 flex-1 grid-cols-[minmax(280px,320px)_1fr]">
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border border-[var(--color-phosphor-dark)]">
          <header className="flex items-center border-b border-[var(--color-phosphor-dark)] bg-[color-mix(in_srgb,var(--color-phosphor)_5%,transparent)] text-[11px] uppercase tracking-[0.05em]">
            <TabButton
              active={tab === "watchlist"}
              onClick={() => manualSetTab("watchlist")}
              label="[W] Watch"
            />
            <TabButton
              active={tab === "positions"}
              onClick={() => manualSetTab("positions")}
              label="[P] Pos"
            />
            <TabButton
              active={tab === "agent"}
              onClick={() => manualSetTab("agent")}
              label="[A] Agent"
              pulse={!!agentState.activeSessionId}
            />
            <TabButton
              active={tab === "analytics"}
              onClick={() => manualSetTab("analytics")}
              label="[N] P&L"
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
            <div
              className={
                tab === "analytics" ? "flex h-full flex-col" : "hidden"
              }
            >
              <Analytics active={tab === "analytics"} headless />
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
      className={`relative flex-1 whitespace-nowrap px-1.5 py-1 text-center ${
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
