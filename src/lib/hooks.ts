"use client";

import useSWR, { mutate } from "swr";
import { fetcher, postJson } from "./fetcher";
import type {
  Account,
  Bar,
  Order,
  PortfolioSummary,
  Position,
  Quote,
  Snapshot,
  Timeframe,
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
