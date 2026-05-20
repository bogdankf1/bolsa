// Thin typed wrapper over the Alpaca REST API.
// Returns raw Alpaca shapes (snake_case). Higher-level domain modules
// (account.ts, orders.ts, etc.) adapt them to internal types.

import { mapAlpacaError } from "./errors";

export interface AlpacaConfig {
  apiKey: string;
  apiSecret: string;
  /** Trading API base, e.g. https://paper-api.alpaca.markets/v2 */
  baseUrl: string;
  /** Market data API base, e.g. https://data.alpaca.markets/v2 */
  dataUrl: string;
  /** Data feed: "iex" (free) or "sip" (paid). Defaults to "iex". */
  feed?: "iex" | "sip";
}

export interface AlpacaClient {
  account(): Promise<RawAccount>;
  positions(): Promise<RawPosition[]>;
  orders(params?: {
    status?: "open" | "closed" | "all";
    limit?: number;
    direction?: "asc" | "desc";
    nested?: boolean;
  }): Promise<RawOrder[]>;
  placeOrder(input: RawPlaceOrder): Promise<RawOrder>;
  cancelOrder(id: string): Promise<void>;
  latestQuote(symbol: string): Promise<RawQuoteResponse>;
  latestQuotes(symbols: string[]): Promise<RawMultiQuoteResponse>;
  latestTrade(symbol: string): Promise<RawTradeResponse>;
  latestTrades(symbols: string[]): Promise<RawMultiTradeResponse>;
  snapshots(symbols: string[]): Promise<RawMultiSnapshotResponse>;
  bars(
    symbol: string,
    params: { timeframe: string; limit?: number; start?: string; end?: string },
  ): Promise<RawBarsResponse>;
  assets(params?: {
    status?: "active" | "inactive";
    assetClass?: string;
  }): Promise<RawAsset[]>;
  closeAllPositions(): Promise<RawClosedPosition[]>;
  cancelAllOrders(): Promise<RawCanceledOrder[]>;
  clock(): Promise<RawClock>;
}

export function createAlpacaClient(config: AlpacaConfig): AlpacaClient {
  const feed = config.feed ?? "iex";
  const headers = {
    "APCA-API-KEY-ID": config.apiKey,
    "APCA-API-SECRET-KEY": config.apiSecret,
    "Content-Type": "application/json",
  };

  async function trading<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const res = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
      cache: "no-store",
    });
    return parseResponse<T>(res);
  }

  async function data<T>(path: string): Promise<T> {
    const res = await fetch(`${config.dataUrl}${path}`, {
      headers,
      cache: "no-store",
    });
    return parseResponse<T>(res);
  }

  async function parseResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text().catch(() => null);
      }
      throw mapAlpacaError(res.status, body);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    account: () => trading<RawAccount>("/account"),

    positions: () => trading<RawPosition[]>("/positions"),

    orders: (params = {}) => {
      const qp = new URLSearchParams();
      if (params.status) qp.set("status", params.status);
      if (params.limit) qp.set("limit", String(params.limit));
      if (params.direction) qp.set("direction", params.direction);
      if (params.nested != null) qp.set("nested", String(params.nested));
      const q = qp.toString();
      return trading<RawOrder[]>(`/orders${q ? `?${q}` : ""}`);
    },

    placeOrder: (input) =>
      trading<RawOrder>("/orders", {
        method: "POST",
        body: JSON.stringify(input),
      }),

    cancelOrder: (id) =>
      trading<void>(`/orders/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),

    latestQuote: (symbol) =>
      data<RawQuoteResponse>(
        `/stocks/${encodeURIComponent(symbol)}/quotes/latest?feed=${feed}`,
      ),

    latestQuotes: (symbols) =>
      data<RawMultiQuoteResponse>(
        `/stocks/quotes/latest?symbols=${symbols.map(encodeURIComponent).join(",")}&feed=${feed}`,
      ),

    latestTrade: (symbol) =>
      data<RawTradeResponse>(
        `/stocks/${encodeURIComponent(symbol)}/trades/latest?feed=${feed}`,
      ),

    latestTrades: (symbols) =>
      data<RawMultiTradeResponse>(
        `/stocks/trades/latest?symbols=${symbols.map(encodeURIComponent).join(",")}&feed=${feed}`,
      ),

    snapshots: (symbols) =>
      data<RawMultiSnapshotResponse>(
        `/stocks/snapshots?symbols=${symbols.map(encodeURIComponent).join(",")}&feed=${feed}`,
      ),

    bars: (symbol, params) => {
      const qp = new URLSearchParams({ timeframe: params.timeframe, feed });
      if (params.limit) qp.set("limit", String(params.limit));
      if (params.start) qp.set("start", params.start);
      if (params.end) qp.set("end", params.end);
      return data<RawBarsResponse>(
        `/stocks/${encodeURIComponent(symbol)}/bars?${qp.toString()}`,
      );
    },

    assets: (params = {}) => {
      const qp = new URLSearchParams();
      qp.set("status", params.status ?? "active");
      qp.set("asset_class", params.assetClass ?? "us_equity");
      return trading<RawAsset[]>(`/assets?${qp.toString()}`);
    },

    closeAllPositions: () =>
      trading<RawClosedPosition[]>("/positions?cancel_orders=false", {
        method: "DELETE",
      }),

    cancelAllOrders: () =>
      trading<RawCanceledOrder[]>("/orders", { method: "DELETE" }),

    clock: () => trading<RawClock>("/clock"),
  };
}

// ---------- Raw Alpaca response shapes (snake_case) ----------

export interface RawAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  buying_power: string;
  daytrade_count: number;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
}

export interface RawPosition {
  symbol: string;
  qty: string;
  side: "long" | "short";
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  change_today: string;
}

export interface RawOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  qty: string;
  filled_qty: string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  time_in_force: "day" | "gtc" | "ioc" | "fok";
  status: string;
  limit_price: string | null;
  stop_price: string | null;
  filled_avg_price: string | null;
  submitted_at: string;
  filled_at: string | null;
  canceled_at: string | null;
}

export interface RawPlaceOrder {
  symbol: string;
  qty: number | string;
  side: "buy" | "sell";
  type: "market" | "limit" | "stop" | "stop_limit";
  time_in_force: "day" | "gtc" | "ioc" | "fok";
  limit_price?: number | string;
  stop_price?: number | string;
}

export interface RawQuote {
  t: string;
  ap: number;
  as: number;
  ax: string;
  bp: number;
  bs: number;
  bx: string;
  c: string[];
  z: string;
}

export interface RawTrade {
  t: string;
  p: number;
  s: number;
  x: string;
  c: string[];
  i: number;
  z: string;
}

export interface RawBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  n?: number;
  vw?: number;
}

export interface RawQuoteResponse {
  symbol: string;
  quote: RawQuote;
}

export interface RawMultiQuoteResponse {
  quotes: Record<string, RawQuote>;
}

export interface RawTradeResponse {
  symbol: string;
  trade: RawTrade;
}

export interface RawMultiTradeResponse {
  trades: Record<string, RawTrade>;
}

export interface RawBarsResponse {
  symbol: string;
  bars: RawBar[];
  next_page_token: string | null;
}

export interface RawSnapshot {
  latestTrade?: RawTrade;
  latestQuote?: RawQuote;
  minuteBar?: RawBar;
  dailyBar?: RawBar;
  prevDailyBar?: RawBar;
}

export type RawMultiSnapshotResponse = Record<string, RawSnapshot>;

export interface RawAsset {
  id: string;
  class: string;
  exchange: string;
  symbol: string;
  name: string;
  status: string;
  tradable: boolean;
  marginable: boolean;
  shortable: boolean;
  easy_to_borrow: boolean;
  fractionable: boolean;
}

export interface RawClosedPosition {
  symbol: string;
  status: number;
  body?: unknown;
}

export interface RawCanceledOrder {
  id: string;
  status: number;
  body?: unknown;
}

export interface RawClock {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}
