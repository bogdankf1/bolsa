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

// Polling intervals (ms). SSE handles live ticks; polling is the fallback
// for when the stream is closed, so snapshots can be loose.
const POLL = {
  account: 30_000,
  portfolio: 30_000,
  snapshots: 30_000,
  orders: 15_000,
  trades: 30_000,
  bars: 60_000,
};

export function useWatchlist() {
  return useSWR<{ symbols: string[] }>("/api/watchlist", fetcher, {
    revalidateOnFocus: false,
  });
}

export function useSnapshots(symbols: string[], streamOpen = false) {
  const key =
    symbols.length === 0
      ? null
      : `/api/snapshots?symbols=${symbols.map(encodeURIComponent).join(",")}`;
  return useSWR<{ snapshots: Record<string, Snapshot> }>(key, fetcher, {
    // When SSE is open, ticks keep data fresh; drop polling to save renders.
    refreshInterval: streamOpen ? 0 : POLL.snapshots,
    revalidateOnFocus: !streamOpen,
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

export async function resetAccount() {
  const res = await postJson<{ positionsClosed: number; ordersCanceled: number }>(
    "/api/account/reset",
    {},
  );
  mutate((key) => typeof key === "string" && key.startsWith("/api/orders"));
  mutate((key) => typeof key === "string" && key.startsWith("/api/trades"));
  mutate("/api/portfolio");
  mutate("/api/account");
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
 * Subscribe to SSE quote/trade ticks for the given symbols. Ticks are
 * coalesced per animation frame (RAF) so a burst of 50 ticks/sec collapses
 * into ~60 setState calls/sec max — without this, market-hours bursts
 * caused render storms that froze the page.
 *
 * The hook also mutates the corresponding /api/snapshots SWR cache so any
 * component using useSnapshots gets the live price without re-fetching.
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
  const pendingRef = useRef<{
    bidAsk: Record<string, { bid: number; ask: number }>;
    trades: Record<string, { price: number; count: number }>;
  } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!key) {
      setState((s) => ({ ...s, status: "idle" }));
      return;
    }

    setState((s) => ({ ...s, status: "connecting" }));
    const url = `/api/stream/quotes?symbols=${encodeURIComponent(key)}`;
    const es = new EventSource(url);

    const flush = () => {
      rafRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (!pending) return;

      // Tab hidden? Skip the React update — we'll catch up when visible.
      // Still apply lastPriceRef so direction stays correct on resume.
      const hidden =
        typeof document !== "undefined" && document.visibilityState === "hidden";

      const tradeEntries = Object.entries(pending.trades);
      const dirUpdates: Record<string, "up" | "down" | null> = {};
      const priceUpdates: Record<string, number> = {};
      const seqIncrements: Record<string, number> = {};

      for (const [sym, { price, count }] of tradeEntries) {
        const prev = lastPriceRef.current[sym];
        dirUpdates[sym] =
          prev == null ? null : price > prev ? "up" : price < prev ? "down" : null;
        lastPriceRef.current[sym] = price;
        priceUpdates[sym] = price;
        seqIncrements[sym] = count;
      }

      if (!hidden) {
        setState((s) => {
          const nextTickSeq = { ...s.tickSeq };
          for (const [sym, inc] of Object.entries(seqIncrements)) {
            nextTickSeq[sym] = (nextTickSeq[sym] ?? 0) + inc;
          }
          return {
            ...s,
            bidAsk: { ...s.bidAsk, ...pending.bidAsk },
            lastPrices: { ...s.lastPrices, ...priceUpdates },
            tickDir: { ...s.tickDir, ...dirUpdates },
            tickSeq: nextTickSeq,
          };
        });

        // Push into the snapshots cache once for all dirty symbols
        for (const [sym, ba] of Object.entries(pending.bidAsk)) {
          mutateSnapshotsForKey(key, (snap) => ({
            ...snap,
            bidPrice: ba.bid,
            askPrice: ba.ask,
          }), sym);
        }
        for (const [sym, price] of Object.entries(priceUpdates)) {
          mutateSnapshotsForKey(key, (snap) => {
            const change = price - snap.prevClose;
            const changePct =
              snap.prevClose === 0 ? 0 : (change / snap.prevClose) * 100;
            return { ...snap, lastPrice: price, change, changePct };
          }, sym);
        }
      }
    };

    const schedule = () => {
      if (rafRef.current != null) return;
      if (typeof requestAnimationFrame === "undefined") {
        flush();
        return;
      }
      rafRef.current = requestAnimationFrame(flush);
    };

    const ensurePending = () => {
      if (!pendingRef.current) {
        pendingRef.current = { bidAsk: {}, trades: {} };
      }
      return pendingRef.current;
    };

    es.addEventListener("ready", () => {
      setState((s) => ({ ...s, status: "open" }));
    });

    es.addEventListener("quote", (ev) => {
      const tick = JSON.parse((ev as MessageEvent).data) as QuoteTick;
      const p = ensurePending();
      p.bidAsk[tick.symbol] = { bid: tick.bidPrice, ask: tick.askPrice };
      schedule();
    });

    es.addEventListener("trade", (ev) => {
      const tick = JSON.parse((ev as MessageEvent).data) as TradeTick;
      const p = ensurePending();
      const existing = p.trades[tick.symbol];
      // Last-write-wins for price; accumulate the tick count for animation seq
      p.trades[tick.symbol] = {
        price: tick.price,
        count: (existing?.count ?? 0) + 1,
      };
      schedule();
    });

    es.addEventListener("error", () => {
      setState((s) => ({ ...s, status: "error" }));
    });

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pendingRef.current = null;
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
