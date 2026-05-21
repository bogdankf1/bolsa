"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import useSWR from "swr";
import { fetcher } from "./fetcher";

export interface BacktestFill {
  ts: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  pnl: number | null;
}

export interface BacktestEquityPoint {
  ts: string;
  equity: number;
}

export interface BacktestRunDetail {
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
  fills: BacktestFill[];
  equityCurve: BacktestEquityPoint[];
}

interface BacktestSelectionValue {
  selectedRunId: string | null;
  selectedRun: BacktestRunDetail | null;
  isLoading: boolean;
  select: (id: string | null) => void;
  toggle: (id: string) => void;
}

const Ctx = createContext<BacktestSelectionValue | null>(null);

export function BacktestSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { data, isLoading } = useSWR<BacktestRunDetail>(
    selectedRunId ? `/api/backtest/runs/${selectedRunId}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const select = useCallback((id: string | null) => setSelectedRunId(id), []);
  const toggle = useCallback(
    (id: string) =>
      setSelectedRunId((curr) => (curr === id ? null : id)),
    [],
  );

  const value = useMemo<BacktestSelectionValue>(
    () => ({
      selectedRunId,
      selectedRun: selectedRunId ? (data ?? null) : null,
      isLoading: !!selectedRunId && isLoading && !data,
      select,
      toggle,
    }),
    [selectedRunId, data, isLoading, select, toggle],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBacktestSelection(): BacktestSelectionValue {
  const v = useContext(Ctx);
  if (!v)
    throw new Error(
      "useBacktestSelection must be inside <BacktestSelectionProvider>",
    );
  return v;
}
