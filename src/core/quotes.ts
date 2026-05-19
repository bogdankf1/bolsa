import type {
  AlpacaClient,
  RawBar,
  RawQuote,
  RawSnapshot,
  RawTrade,
} from "./alpaca/client";
import type { Bar, LatestTrade, Quote, Snapshot, Timeframe } from "./types";

function adaptQuote(symbol: string, q: RawQuote): Quote {
  return {
    symbol,
    bidPrice: q.bp,
    bidSize: q.bs,
    askPrice: q.ap,
    askSize: q.as,
    timestamp: q.t,
  };
}

function adaptTrade(symbol: string, t: RawTrade): LatestTrade {
  return { symbol, price: t.p, size: t.s, timestamp: t.t };
}

function adaptBar(b: RawBar): Bar {
  return {
    timestamp: b.t,
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v,
  };
}

export async function getLatestQuote(
  client: AlpacaClient,
  symbol: string,
): Promise<Quote> {
  const r = await client.latestQuote(symbol);
  return adaptQuote(r.symbol, r.quote);
}

export async function getLatestQuotes(
  client: AlpacaClient,
  symbols: string[],
): Promise<Record<string, Quote>> {
  if (symbols.length === 0) return {};
  const r = await client.latestQuotes(symbols);
  const out: Record<string, Quote> = {};
  for (const [sym, q] of Object.entries(r.quotes ?? {})) {
    out[sym] = adaptQuote(sym, q);
  }
  return out;
}

export async function getLatestTrades(
  client: AlpacaClient,
  symbols: string[],
): Promise<Record<string, LatestTrade>> {
  if (symbols.length === 0) return {};
  const r = await client.latestTrades(symbols);
  const out: Record<string, LatestTrade> = {};
  for (const [sym, t] of Object.entries(r.trades ?? {})) {
    out[sym] = adaptTrade(sym, t);
  }
  return out;
}

function adaptSnapshot(symbol: string, s: RawSnapshot): Snapshot {
  const lastPrice =
    s.latestTrade?.p ??
    s.minuteBar?.c ??
    s.dailyBar?.c ??
    s.prevDailyBar?.c ??
    0;
  const prevClose = s.prevDailyBar?.c ?? 0;
  const change = lastPrice - prevClose;
  const changePct = prevClose === 0 ? 0 : (change / prevClose) * 100;
  return {
    symbol,
    lastPrice,
    bidPrice: s.latestQuote?.bp ?? 0,
    askPrice: s.latestQuote?.ap ?? 0,
    bidSize: s.latestQuote?.bs ?? 0,
    askSize: s.latestQuote?.as ?? 0,
    dayOpen: s.dailyBar?.o ?? 0,
    dayHigh: s.dailyBar?.h ?? 0,
    dayLow: s.dailyBar?.l ?? 0,
    dayClose: s.dailyBar?.c ?? 0,
    dayVolume: s.dailyBar?.v ?? 0,
    prevClose,
    change,
    changePct,
    timestamp:
      s.latestTrade?.t ?? s.latestQuote?.t ?? s.dailyBar?.t ?? "",
  };
}

export async function getSnapshots(
  client: AlpacaClient,
  symbols: string[],
): Promise<Record<string, Snapshot>> {
  if (symbols.length === 0) return {};
  const r = await client.snapshots(symbols);
  const out: Record<string, Snapshot> = {};
  for (const [sym, snap] of Object.entries(r)) {
    out[sym] = adaptSnapshot(sym, snap);
  }
  return out;
}

// Map our internal timeframe label to Alpaca's
const ALPACA_TIMEFRAME: Record<Timeframe, string> = {
  "1Min": "1Min",
  "5Min": "5Min",
  "15Min": "15Min",
  "1H": "1Hour",
  "1D": "1Day",
  "1W": "1Week",
};

// Recommended bar count per timeframe for the chart panel
export const DEFAULT_BAR_LIMIT: Record<Timeframe, number> = {
  "1Min": 200,
  "5Min": 200,
  "15Min": 200,
  "1H": 200,
  "1D": 180,
  "1W": 156,
};

// Calendar-days window per timeframe, generous enough to cover the default limit
// after accounting for weekends, holidays, and market hours.
const LOOKBACK_DAYS: Record<Timeframe, number> = {
  "1Min": 7,
  "5Min": 14,
  "15Min": 30,
  "1H": 60,
  "1D": 365,
  "1W": 365 * 5,
};

export async function getBars(
  client: AlpacaClient,
  symbol: string,
  timeframe: Timeframe,
  limit?: number,
): Promise<Bar[]> {
  const effectiveLimit = limit ?? DEFAULT_BAR_LIMIT[timeframe];
  const start = new Date(
    Date.now() - LOOKBACK_DAYS[timeframe] * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);

  const r = await client.bars(symbol, {
    timeframe: ALPACA_TIMEFRAME[timeframe],
    limit: 10_000, // fetch wide, slice client-side to most recent N
    start,
  });

  const bars = (r.bars ?? []).map(adaptBar);
  // Keep the most recent `effectiveLimit` bars
  return bars.slice(-effectiveLimit);
}
