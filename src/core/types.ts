// Domain types for the Bolsa trading engine.
// Pure data shapes — no Next.js or Alpaca dependencies. Reusable by MCP, 3D game, etc.

export type Side = "buy" | "sell";

export type OrderType = "market" | "limit" | "stop" | "stop_limit";

export type TimeInForce = "day" | "gtc" | "ioc" | "fok";

export type OrderStatus =
  | "new"
  | "accepted"
  | "pending_new"
  | "partially_filled"
  | "filled"
  | "done_for_day"
  | "canceled"
  | "expired"
  | "rejected"
  | "pending_cancel"
  | "replaced";

export type Timeframe = "1Min" | "5Min" | "15Min" | "1H" | "1D" | "1W";

export interface Quote {
  symbol: string;
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  timestamp: string;
}

export interface LatestTrade {
  symbol: string;
  price: number;
  size: number;
  timestamp: string;
}

export interface Bar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Account {
  id: string;
  accountNumber: string;
  status: string;
  currency: string;
  cash: number;
  portfolioValue: number;
  equity: number;
  buyingPower: number;
  daytradeCount: number;
  patternDayTrader: boolean;
  tradingBlocked: boolean;
}

export interface Position {
  symbol: string;
  qty: number;
  side: "long" | "short";
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
  changeToday: number;
}

export interface Order {
  id: string;
  clientOrderId: string;
  symbol: string;
  qty: number;
  filledQty: number;
  side: Side;
  type: OrderType;
  timeInForce: TimeInForce;
  status: OrderStatus;
  limitPrice: number | null;
  stopPrice: number | null;
  filledAvgPrice: number | null;
  submittedAt: string;
  filledAt: string | null;
  canceledAt: string | null;
}

export interface PlaceOrderInput {
  symbol: string;
  qty: number;
  side: Side;
  type: OrderType;
  timeInForce?: TimeInForce;
  limitPrice?: number;
  stopPrice?: number;
}

export interface PortfolioSummary {
  cash: number;
  portfolioValue: number;
  equity: number;
  buyingPower: number;
  unrealizedPl: number;
  unrealizedPlPct: number;
  positionsCount: number;
}

export interface QuoteTick {
  symbol: string;
  bidPrice: number;
  askPrice: number;
  timestamp: string;
}

export interface TradeTick {
  symbol: string;
  price: number;
  size: number;
  timestamp: string;
}

export interface Snapshot {
  symbol: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  bidSize: number;
  askSize: number;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  dayClose: number;
  dayVolume: number;
  prevClose: number;
  change: number;
  changePct: number;
  timestamp: string;
}

export type StreamEvent =
  | { type: "quote"; data: QuoteTick }
  | { type: "trade"; data: TradeTick }
  | { type: "status"; data: { connected: boolean; subscribed: string[] } };

export interface Asset {
  symbol: string;
  name: string;
  exchange: string;
  tradable: boolean;
}
