"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/terminal/Header";
import { Watchlist } from "@/components/terminal/Watchlist";
import { Positions } from "@/components/terminal/Positions";
import { ChartPanel } from "@/components/terminal/ChartPanel";
import { OrderEntry } from "@/components/terminal/OrderEntry";
import { StatusBar } from "@/components/terminal/StatusBar";
import { TradeLog } from "@/components/terminal/TradeLog";
import { CommandPalette } from "@/components/terminal/CommandPalette";
import { usePortfolio, useWatchlist } from "@/lib/hooks";
import { useHotkey } from "@/lib/hotkeys";
import { focusTarget } from "@/lib/focus";
import { ConnectionProvider } from "@/lib/connection";

type LeftTab = "watchlist" | "positions";

export default function Home() {
  const { data: wl } = useWatchlist();
  const { data: portfolio } = usePortfolio();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<LeftTab>("watchlist");

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

  const focusSymbol = useCallback((s: string) => setSelected(s), []);

  const watchlistCount = wl?.symbols.length ?? 0;
  const positionsCount = portfolio?.positions.length ?? 0;
  const rightSlotText =
    tab === "watchlist"
      ? `${watchlistCount} symbols`
      : positionsCount === 0
        ? "—"
        : `${positionsCount} held`;

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
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 ${
        active
          ? "bg-[color-mix(in_srgb,var(--color-phosphor)_15%,transparent)] glow"
          : "text-[var(--color-phosphor-dim)] hover:text-[var(--color-phosphor)]"
      }`}
    >
      {label}
    </button>
  );
}
