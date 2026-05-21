"use client";

import { useEffect, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { fetcher, postJson } from "./fetcher";
import { supabaseBrowser } from "./supabase-client";
import type {
  Account,
  AgentEvent,
  AgentState,
  Asset,
  Bar,
  MarketClock,
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
  clock: 60_000,
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

export function useOrders(status: "open" | "closed" | "all" = "all", limit = 50) {
  return useSWR<Order[]>(
    `/api/orders?status=${status}&limit=${limit}`,
    fetcher,
    { refreshInterval: POLL.orders },
  );
}

export function useTrades(limit = 50) {
  return useSWR<Order[]>(`/api/trades?limit=${limit}`, fetcher, {
    refreshInterval: POLL.trades,
  });
}

export interface AgentSessionSummary {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
}

export function useAgentSessions() {
  return useSWR<AgentSessionSummary[]>(
    "/api/agent/sessions",
    fetcher,
    { refreshInterval: 30_000 },
  );
}

export interface BacktestRunSummary {
  id: string;
  sessionId: string | null;
  symbol: string;
  timeframe: string;
  rangeStart: string;
  rangeEnd: string;
  initialCash: number;
  finalEquity: number | null;
  realizedPnl: number | null;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  closedCount: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;
  maxDrawdown: number | null;
  sharpe: number | null;
  barCount: number;
  status: "running" | "completed" | "aborted";
  createdAt: string;
  endedAt: string | null;
}

export function useBacktestRuns() {
  return useSWR<BacktestRunSummary[]>("/api/backtest/runs", fetcher, {
    refreshInterval: 10_000,
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

export function useClock() {
  return useSWR<MarketClock>("/api/clock", fetcher, {
    refreshInterval: POLL.clock,
    revalidateOnFocus: false,
  });
}

export function useBars(
  symbol: string | null,
  timeframe: Timeframe,
  opts: { start?: string; end?: string } = {},
) {
  let key: string | null = null;
  if (symbol) {
    const params = new URLSearchParams({ timeframe });
    if (opts.start) params.set("start", opts.start);
    if (opts.end) params.set("end", opts.end);
    key = `/api/bars/${encodeURIComponent(symbol)}?${params.toString()}`;
  }
  return useSWR<{ symbol: string; timeframe: Timeframe; bars: Bar[] }>(
    key,
    fetcher,
    {
      // Historical range queries are immutable; skip polling for them.
      refreshInterval: opts.start || opts.end ? 0 : POLL.bars,
    },
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

    // The SSE route is capped at 5 minutes (Vercel maxDuration). After that
    // the connection closes and EventSource transparently reconnects — during
    // the brief gap, `error` fires. Without a debounce, the header badge
    // flips OFFLINE → CONNECTED every 5 min. We delay the OFFLINE flip so a
    // quick reconnect cancels it; only sustained failures surface.
    let errorTimer: ReturnType<typeof setTimeout> | null = null;
    const clearErrorTimer = () => {
      if (errorTimer != null) {
        clearTimeout(errorTimer);
        errorTimer = null;
      }
    };

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
      clearErrorTimer();
      setState((s) => ({ ...s, status: "open" }));
    });

    // Any inbound tick/quote also counts as proof the connection is alive,
    // so cancel a pending OFFLINE flip if one's queued.
    const cancelOnTick = () => clearErrorTimer();

    es.addEventListener("quote", (ev) => {
      cancelOnTick();
      const tick = JSON.parse((ev as MessageEvent).data) as QuoteTick;
      const p = ensurePending();
      p.bidAsk[tick.symbol] = { bid: tick.bidPrice, ask: tick.askPrice };
      schedule();
    });

    es.addEventListener("trade", (ev) => {
      cancelOnTick();
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
      // readyState 0 = browser is auto-reconnecting; readyState 2 = closed
      // for good. Only flip to OFFLINE if we don't recover within 5s.
      if (errorTimer != null) return;
      const isPermanent = es.readyState === 2;
      errorTimer = setTimeout(
        () => {
          errorTimer = null;
          setState((s) => ({
            ...s,
            status: isPermanent ? "closed" : "error",
          }));
        },
        isPermanent ? 0 : 5_000,
      );
    });

    return () => {
      clearErrorTimer();
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

// ----- Agent spectator state & events (V2) -----

interface AgentStateRow {
  id: number;
  should_stop: boolean;
  active_session_id: string | null;
  updated_at: string;
}

function rowToState(row: AgentStateRow | null | undefined): AgentState {
  if (!row) return { shouldStop: false, activeSessionId: null };
  return {
    shouldStop: !!row.should_stop,
    activeSessionId: row.active_session_id ?? null,
  };
}

// Realtime channels in supabase-js dedupe by name, which means two
// `useAgentState()` calls registering "agent_state_changes" collide —
// the second `.on()` lands after the first's `.subscribe()` and throws.
// Unique channel names per hook instance avoid this entirely.
function uniqueChannelName(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

/**
 * Subscribes to the singleton `agent_state` row. Returns current state
 * (whether an agent is running and whether the kill switch is set) and
 * a `stop` function that POSTs to /api/agent/stop.
 */
export function useAgentState() {
  const [state, setState] = useState<AgentState>({
    shouldStop: false,
    activeSessionId: null,
  });
  const [ready, setReady] = useState(false);
  const channelNameRef = useRef<string>("");
  if (!channelNameRef.current) {
    channelNameRef.current = uniqueChannelName("agent_state");
  }

  useEffect(() => {
    let cancelled = false;
    const supa = supabaseBrowser();

    void (async () => {
      const { data } = await supa
        .from("agent_state")
        .select("id, should_stop, active_session_id, updated_at")
        .eq("id", 1)
        .maybeSingle();
      if (cancelled) return;
      setState(rowToState(data as AgentStateRow | null));
      setReady(true);
    })();

    const channel = supa
      .channel(channelNameRef.current)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_state",
          filter: "id=eq.1",
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as
            | AgentStateRow
            | null
            | undefined;
          setState(rowToState(row));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supa.removeChannel(channel);
    };
  }, []);

  const stop = async () => {
    await postJson("/api/agent/stop", {});
  };

  return { state, ready, stop };
}

/**
 * Subscribes to `agent_events` rows for the given session. Returns events
 * in chronological order (oldest first); the UI is free to reverse them
 * for display. Passing `null` returns an empty list and skips the
 * subscription — useful when no agent is active.
 */
export function useAgentEvents(sessionId: string | null) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const channelNameRef = useRef<string>("");
  if (!channelNameRef.current) {
    channelNameRef.current = uniqueChannelName("agent_events");
  }

  useEffect(() => {
    if (!sessionId) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    const supa = supabaseBrowser();

    void (async () => {
      const { data } = await supa
        .from("agent_events")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (cancelled) return;
      setEvents((data ?? []) as AgentEvent[]);
    })();

    const channel = supa
      .channel(channelNameRef.current)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_events",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const ev = payload.new as AgentEvent;
          setEvents((prev) => {
            // Guard against duplicates if the initial fetch races the
            // subscription on a fast session start.
            if (prev.some((p) => p.id === ev.id)) return prev;
            return [...prev, ev];
          });
          // When the agent finishes a state-changing tool call, force
          // the rest of the UI to refresh immediately instead of
          // waiting on its 15–30 s SWR poll. That's why the trade log,
          // positions, and chart all light up live alongside the
          // Agent tab.
          if (ev.kind === "tool_result" && ev.tool) {
            invalidateForTool(ev.tool);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supa.removeChannel(channel);
    };
  }, [sessionId]);

  return events;
}

// Map each state-changing MCP tool to the SWR keys whose data it
// invalidates. Read-only tools (get_quote, get_clock, …) are absent —
// they don't change anything the UI shows.
function invalidateForTool(tool: string): void {
  const orders = (k: unknown) =>
    typeof k === "string" && k.startsWith("/api/orders");
  const trades = (k: unknown) =>
    typeof k === "string" && k.startsWith("/api/trades");
  const watchlist = (k: unknown) =>
    typeof k === "string" && k === "/api/watchlist";

  switch (tool) {
    case "place_order":
    case "cancel_order":
      mutate(orders);
      mutate(trades);
      mutate("/api/portfolio");
      mutate("/api/account");
      return;
    case "add_to_watchlist":
    case "remove_from_watchlist":
      mutate(watchlist);
      return;
  }
}
