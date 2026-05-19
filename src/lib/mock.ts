export type Symbol = {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  bid: number;
  ask: number;
  volume: number;
  dayHigh: number;
  dayLow: number;
};

export type Position = {
  ticker: string;
  qty: number;
  avgCost: number;
  currentPrice: number;
};

export type Trade = {
  id: string;
  ts: Date;
  side: "BUY" | "SELL";
  ticker: string;
  qty: number;
  price: number;
  status: "FILLED" | "CANCELED" | "PENDING";
};

export const mockWatchlist: Symbol[] = [
  {
    ticker: "AAPL",
    name: "Apple Inc.",
    price: 182.45,
    change: 2.18,
    changePct: 1.21,
    bid: 182.44,
    ask: 182.46,
    volume: 42_300_000,
    dayHigh: 183.12,
    dayLow: 179.88,
  },
  {
    ticker: "VOO",
    name: "Vanguard S&P 500 ETF",
    price: 441.2,
    change: 1.76,
    changePct: 0.4,
    bid: 441.18,
    ask: 441.22,
    volume: 3_200_000,
    dayHigh: 442.05,
    dayLow: 439.4,
  },
  {
    ticker: "QQQ",
    name: "Invesco QQQ Trust",
    price: 388.55,
    change: -0.39,
    changePct: -0.1,
    bid: 388.54,
    ask: 388.56,
    volume: 24_100_000,
    dayHigh: 390.21,
    dayLow: 387.66,
  },
  {
    ticker: "TSLA",
    name: "Tesla, Inc.",
    price: 241.92,
    change: 7.29,
    changePct: 3.11,
    bid: 241.9,
    ask: 241.94,
    volume: 102_700_000,
    dayHigh: 243.5,
    dayLow: 234.21,
  },
  {
    ticker: "SPY",
    name: "SPDR S&P 500 ETF",
    price: 478.12,
    change: 1.43,
    changePct: 0.3,
    bid: 478.1,
    ask: 478.14,
    volume: 58_900_000,
    dayHigh: 479.0,
    dayLow: 476.21,
  },
];

export const mockPositions: Position[] = [
  { ticker: "AAPL", qty: 50, avgCost: 175.2, currentPrice: 182.45 },
  { ticker: "VOO", qty: 20, avgCost: 435.0, currentPrice: 441.2 },
  { ticker: "TSLA", qty: 15, avgCost: 232.4, currentPrice: 241.92 },
];

const now = new Date();
const t = (offsetMin: number) =>
  new Date(now.getTime() - offsetMin * 60 * 1000);

export const mockTrades: Trade[] = [
  { id: "t1", ts: t(0), side: "BUY", ticker: "AAPL", qty: 10, price: 182.45, status: "FILLED" },
  { id: "t2", ts: t(4), side: "SELL", ticker: "VOO", qty: 5, price: 441.2, status: "FILLED" },
  { id: "t3", ts: t(18), side: "BUY", ticker: "TSLA", qty: 5, price: 240.11, status: "FILLED" },
  { id: "t4", ts: t(42), side: "BUY", ticker: "QQQ", qty: 8, price: 388.55, status: "FILLED" },
  { id: "t5", ts: t(73), side: "SELL", ticker: "AAPL", qty: 3, price: 181.9, status: "FILLED" },
  { id: "t6", ts: t(120), side: "BUY", ticker: "AAPL", qty: 10, price: 178.42, status: "FILLED" },
  { id: "t7", ts: t(180), side: "BUY", ticker: "SPY", qty: 4, price: 476.5, status: "FILLED" },
];

export const mockAccount = {
  cash: 12_847.22,
  portfolioValue: 102_847.22,
  startingBalance: 100_000,
  buyingPower: 25_694.44,
  dayTradeCount: 1,
};

// Synthetic candlestick series for visual placeholder
export type Candle = { t: number; o: number; h: number; l: number; c: number };

export function generateCandles(seed = 182, count = 80): Candle[] {
  let price = seed;
  const out: Candle[] = [];
  let s = 1337;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < count; i++) {
    const drift = (rand() - 0.48) * 2.2;
    const o = price;
    const c = Math.max(0.5, price + drift);
    const h = Math.max(o, c) + rand() * 1.5;
    const l = Math.min(o, c) - rand() * 1.5;
    out.push({ t: i, o, h, l, c });
    price = c;
  }
  return out;
}
