"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/terminal/Header";
import { Watchlist } from "@/components/terminal/Watchlist";
import { ChartPanel } from "@/components/terminal/ChartPanel";
import { OrderEntry } from "@/components/terminal/OrderEntry";
import { StatusBar } from "@/components/terminal/StatusBar";
import { TradeLog } from "@/components/terminal/TradeLog";
import { CommandPalette } from "@/components/terminal/CommandPalette";
import { useWatchlist } from "@/lib/hooks";
import { useHotkey } from "@/lib/hotkeys";
import { focusTarget } from "@/lib/focus";

export default function Home() {
  const { data: wl } = useWatchlist();
  const [selected, setSelected] = useState<string | null>(null);

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

  // `/` focuses the watchlist symbol input
  useHotkey("/", (e) => {
    if (focusTarget("watchlist-input")) {
      e.preventDefault();
    }
  });

  return (
    <main className="flex h-screen flex-col">
      <Header />

      <section className="grid min-h-0 flex-1 grid-cols-[minmax(240px,280px)_1fr]">
        <Watchlist selected={selected} onSelect={setSelected} />
        <div className="grid min-h-0 grid-rows-[1fr_auto] border-l border-[var(--color-phosphor-dark)]">
          <ChartPanel symbol={selected} />
          <OrderEntry symbol={selected} />
        </div>
      </section>

      <StatusBar />

      <section className="h-[200px] min-h-[200px]">
        <TradeLog />
      </section>

      <CommandPalette />
    </main>
  );
}
