"use client";

import { useEffect, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { fetcher, postJson } from "./fetcher";
import type {
  Account,
  Asset,
  Bar,
  Order,
  PortfolioSummary,
  Position,
  Quote,
  QuoteTick,
  Snapshot,
  Timeframe,
  TradeTick,
} from "@/core/types";

// Polling intervals (ms). Snapshots get a tighter loop since quotes change fast.
const POLL = {
  account: 15_000,
  portfolio: 15_000,
  snapshots: 5_000,
  orders: 10_000,
  trades: 15_000,
  bars: 60_000,
};

export function useWatchlist() {
  return useSWR<{ symbols: string[] }>("/api/watchlist", fetcher, {
    revalidateOnFocus: false,
  });
}

export function useSnapshots(symbols: string[]) {
  const key =
    symbols.length === 0
      ? null
      : `/api/snapshots?symbols=${symbols.map(encodeURIComponent).join(",")}`;
  return useSWR<{ snapshots: Record<string, Snapshot> }>(key, fetcher, {
    refreshInterval: POLL.snapshots,
    revalidateOnFocus: true,
  });
}

export function useQuote(symbol: string | null) {
  const key = symbol ? `/api/quotes/${encodeURIComponent(symbol)}` : null;
  return useSWR<{ quote: Quote; lastPrice: number }>(key, fetcher, {
    refreshInterval: POLL.snapshots,
  });
}

export function useAccount() {
  return useSWR<Account>("/api/account", fetcher, {
    refreshInterval: POLL.account,
  });
}

export function usePortfolio() {
  return useSWR<PortfolioSummary & { positions: Position[] }>(
    "/api/portfolio",
    fetcher,
    { refreshInterval: POLL.portfolio },
  );
}

export function useOrders(status: "open" | "closed" | "all" = "all") {
  return useSWR<Order[]>(`/api/orders?status=${status}&limit=50`, fetcher, {
    refreshInterval: POLL.orders,
  });
}

export function useTrades(limit = 50) {
  return useSWR<Order[]>(`/api/trades?limit=${limit}`, fetcher, {
    refreshInterval: POLL.trades,
  });
}

export function useAssetSearch(query: string) {
  const q = query.trim();
  const key = q.length >= 1 ? `/api/assets?q=${encodeURIComponent(q)}` : null;
  return useSWR<{ results: Asset[] }>(key, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 200,
  });
}

export function useBars(symbol: string | null, timeframe: Timeframe) {
  const key = symbol
    ? `/api/bars/${encodeURIComponent(symbol)}?timeframe=${timeframe}`
    : null;
  return useSWR<{ symbol: string; timeframe: Timeframe; bars: Bar[] }>(
    key,
    fetcher,
    { refreshInterval: POLL.bars },
  );
}

// ----- Mutations -----

export async function addWatchlistSymbol(symbol: string) {
  const res = await postJson<{ symbols: string[] }>("/api/watchlist", {
    symbol,
  });
  mutate("/api/watchlist", { symbols: res.symbols }, { revalidate: false });
  return res;
}

export async function removeWatchlistSymbol(symbol: string) {
  const res = await postJson<{ symbols: string[] }>(
    `/api/watchlist?symbol=${encodeURIComponent(symbol)}`,
    null,
    "DELETE",
  );
  mutate("/api/watchlist", { symbols: res.symbols }, { revalidate: false });
  return res;
}

export type PlaceOrderBody = {
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  timeInForce?: "day" | "gtc" | "ioc" | "fok";
  limitPrice?: number;
  stopPrice?: number;
};

export async function placeOrder(body: PlaceOrderBody) {
  const res = await postJson<Order>("/api/orders", body);
  mutate((key) => typeof key === "string" && key.startsWith("/api/orders"));
  mutate((key) => typeof key === "string" && key.startsWith("/api/trades"));
  mutate("/api/portfolio");
  return res;
}

export async function cancelOrder(id: string) {
  const res = await postJson<{ id: string; canceled: boolean }>(
    `/api/orders/${encodeURIComponent(id)}`,
    null,
    "DELETE",
  );
  mutate((key) => typeof key === "string" && key.startsWith("/api/orders"));
  return res;
}

// ----- Live ticks via SSE -----

export type LiveTickState = {
  /** Connection state of the underlying EventSource. */
  status: "idle" | "connecting" | "open" | "error" | "closed";
  /** Per-symbol latest price (from trade ticks). */
  lastPrices: Record<string, number>;
  /** Per-symbol latest bid/ask (from quote ticks). */
  bidAsk: Record<string, { bid: number; ask: number }>;
  /** Per-symbol direction of most recent price move ("up" | "down" | null). */
  tickDir: Record<string, "up" | "down" | null>;
  /** Per-symbol monotonically increasing counter for triggering CSS animations. */
  tickSeq: Record<string, number>;
};

/**
 * Subscribe to SSE quote/trade ticks for the given symbols. The hook also
 * mutates the corresponding /api/snapshots SWR cache so any component using
 * useSnapshots gets the live price without re-fetching.
 */
export function useQuoteStream(symbols: string[]): LiveTickState {
  const key = symbols.length === 0 ? "" : [...symbols].sort().join(",");
  const [state, setState] = useState<LiveTickState>({
    status: "idle",
    lastPrices: {},
    bidAsk: {},
    tickDir: {},
    tickSeq: {},
  });
  const lastPriceRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!key) {
      setState((s) => ({ ...s, status: "idle" }));
      return;
    }

    setState((s) => ({ ...s, status: "connecting" }));
    const url = `/api/stream/quotes?symbols=${encodeURIComponent(key)}`;
    const es = new EventSource(url);

    es.addEventListener("ready", () => {
      setState((s) => ({ ...s, status: "open" }));
    });

    es.addEventListener("quote", (ev) => {
      const tick = JSON.parse((ev as MessageEvent).data) as QuoteTick;
      setState((s) => ({
        ...s,
        bidAsk: {
          ...s.bidAsk,
          [tick.symbol]: { bid: tick.bidPrice, ask: tick.askPrice },
        },
      }));
      // Push into the snapshots cache too so non-stream consumers see it
      mutateSnapshotsForKey(key, (snap) => ({
        ...snap,
        bidPrice: tick.bidPrice,
        askPrice: tick.askPrice,
      }), tick.symbol);
    });

    es.addEventListener("trade", (ev) => {
      const tick = JSON.parse((ev as MessageEvent).data) as TradeTick;
      const prev = lastPriceRef.current[tick.symbol];
      const dir: "up" | "down" | null =
        prev == null ? null : tick.price > prev ? "up" : tick.price < prev ? "down" : null;
      lastPriceRef.current[tick.symbol] = tick.price;

      setState((s) => ({
        ...s,
        lastPrices: { ...s.lastPrices, [tick.symbol]: tick.price },
        tickDir: { ...s.tickDir, [tick.symbol]: dir },
        tickSeq: {
          ...s.tickSeq,
          [tick.symbol]: (s.tickSeq[tick.symbol] ?? 0) + 1,
        },
      }));

      mutateSnapshotsForKey(key, (snap) => {
        const change = tick.price - snap.prevClose;
        const changePct = snap.prevClose === 0 ? 0 : (change / snap.prevClose) * 100;
        return { ...snap, lastPrice: tick.price, change, changePct };
      }, tick.symbol);
    });

    es.addEventListener("error", () => {
      setState((s) => ({ ...s, status: "error" }));
    });

    return () => {
      es.close();
      setState((s) => ({ ...s, status: "closed" }));
    };
  }, [key]);

  return state;
}

function mutateSnapshotsForKey(
  symbolsKey: string,
  patch: (s: Snapshot) => Snapshot,
  symbol: string,
) {
  // The SWR key used by useSnapshots is built from the symbols list as-passed.
  // We can't know its exact order at the call site, so we update any cache
  // entry whose key starts with /api/snapshots? and contains this symbol.
  mutate(
    (k) =>
      typeof k === "string" &&
      k.startsWith("/api/snapshots?") &&
      k.includes(symbol),
    (curr) => {
      const c = curr as { snapshots: Record<string, Snapshot> } | undefined;
      if (!c) return c;
      const existing = c.snapshots[symbol];
      if (!existing) return c;
      return {
        snapshots: { ...c.snapshots, [symbol]: patch(existing) },
      };
    },
    { revalidate: false },
  );
}
