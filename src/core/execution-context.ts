// Routing layer between live Alpaca and the in-memory backtest engine.
//
// Every MCP tool that reads or changes account state goes through this
// module instead of calling Alpaca directly. When a backtest is active
// the simulated state is returned; otherwise the call hits Alpaca.
//
// The UI's /api/orders POST does NOT go through this layer — manual
// orders are always live. Only the MCP agent path is mode-aware so
// agents and strategy skills can be reused unchanged in both modes.

import "server-only";
import type { AlpacaClient } from "./alpaca/client";
import type {
  Account,
  Order,
  PlaceOrderInput,
  PortfolioSummary,
  Position,
} from "./types";
import {
  cancelOrder as liveCancelOrder,
  listOrders as liveListOrders,
  placeOrder as livePlaceOrder,
} from "./orders";
import { getAccount as liveAccount } from "./account";
import {
  getPortfolioSummary as livePortfolio,
  getPositions as livePositions,
} from "./portfolio";
import { getRecentTrades as liveRecentTrades } from "./trades";
import {
  backtestAccount,
  backtestPortfolio,
  backtestPositions,
  backtestRecentTrades,
  isBacktestActive,
  placeBacktestOrder,
} from "./backtest-engine";

export async function routedPlaceOrder(
  client: AlpacaClient,
  input: PlaceOrderInput,
): Promise<Order> {
  if (isBacktestActive()) return placeBacktestOrder(input);
  return livePlaceOrder(client, input);
}

export async function routedCancelOrder(
  client: AlpacaClient,
  id: string,
): Promise<void> {
  if (isBacktestActive()) {
    throw new Error(
      "cancel_order is not supported in backtest mode — V1 orders fill immediately.",
    );
  }
  return liveCancelOrder(client, id);
}

export async function routedListOrders(
  client: AlpacaClient,
  params: { status?: "open" | "closed" | "all"; limit?: number } = {},
): Promise<Order[]> {
  if (isBacktestActive()) {
    // All backtest orders fill instantly; "open" returns empty.
    if (params.status === "open") return [];
    return backtestRecentTrades(params.limit ?? 100);
  }
  return liveListOrders(client, params);
}

export async function routedRecentTrades(
  client: AlpacaClient,
  limit?: number,
): Promise<Order[]> {
  if (isBacktestActive()) return backtestRecentTrades(limit);
  return liveRecentTrades(client, limit);
}

export async function routedAccount(client: AlpacaClient): Promise<Account> {
  if (isBacktestActive()) return backtestAccount();
  return liveAccount(client);
}

export async function routedPositions(
  client: AlpacaClient,
): Promise<Position[]> {
  if (isBacktestActive()) return backtestPositions();
  return livePositions(client);
}

export async function routedPortfolio(
  client: AlpacaClient,
): Promise<PortfolioSummary & { positions: Position[] }> {
  if (isBacktestActive()) return backtestPortfolio();
  return livePortfolio(client);
}
