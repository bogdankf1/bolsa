"use client";

import { useState } from "react";
import { Header } from "@/components/terminal/Header";
import { Watchlist } from "@/components/terminal/Watchlist";
import { ChartPanel } from "@/components/terminal/ChartPanel";
import { OrderEntry } from "@/components/terminal/OrderEntry";
import { StatusBar } from "@/components/terminal/StatusBar";
import { TradeLog } from "@/components/terminal/TradeLog";
import { mockWatchlist } from "@/lib/mock";

export default function Home() {
  const [selected, setSelected] = useState(mockWatchlist[0].ticker);
  const symbol =
    mockWatchlist.find((s) => s.ticker === selected) ?? mockWatchlist[0];

  return (
    <main className="flex h-screen flex-col">
      <Header />

      <section className="grid min-h-0 flex-1 grid-cols-[minmax(240px,280px)_1fr]">
        <Watchlist
          symbols={mockWatchlist}
          selected={selected}
          onSelect={setSelected}
        />
        <div className="grid min-h-0 grid-rows-[1fr_auto] border-l border-[var(--color-phosphor-dark)]">
          <ChartPanel symbol={symbol} />
          <OrderEntry symbol={symbol} />
        </div>
      </section>

      <StatusBar />

      <section className="h-[200px] min-h-[200px]">
        <TradeLog />
      </section>
    </main>
  );
}
