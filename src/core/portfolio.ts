import type { AlpacaClient } from "./alpaca/client";
import type { Position, PortfolioSummary } from "./types";
import { getAccount } from "./account";

export async function getPositions(
  client: AlpacaClient,
): Promise<Position[]> {
  const raw = await client.positions();
  return raw.map((p) => ({
    symbol: p.symbol,
    qty: Number(p.qty),
    side: p.side,
    avgEntryPrice: Number(p.avg_entry_price),
    currentPrice: Number(p.current_price),
    marketValue: Number(p.market_value),
    costBasis: Number(p.cost_basis),
    unrealizedPl: Number(p.unrealized_pl),
    unrealizedPlPct: Number(p.unrealized_plpc) * 100,
    changeToday: Number(p.change_today) * 100,
  }));
}

export async function getPortfolioSummary(
  client: AlpacaClient,
): Promise<PortfolioSummary & { positions: Position[] }> {
  const [account, positions] = await Promise.all([
    getAccount(client),
    getPositions(client),
  ]);

  const unrealizedPl = positions.reduce((s, p) => s + p.unrealizedPl, 0);
  const costBasis = positions.reduce((s, p) => s + p.costBasis, 0);
  const unrealizedPlPct = costBasis === 0 ? 0 : (unrealizedPl / costBasis) * 100;

  return {
    cash: account.cash,
    portfolioValue: account.portfolioValue,
    equity: account.equity,
    buyingPower: account.buyingPower,
    unrealizedPl,
    unrealizedPlPct,
    positionsCount: positions.length,
    positions,
  };
}
