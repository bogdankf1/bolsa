import type { AlpacaClient } from "./alpaca/client";
import type { Account } from "./types";

export async function getAccount(client: AlpacaClient): Promise<Account> {
  const r = await client.account();
  return {
    id: r.id,
    accountNumber: r.account_number,
    status: r.status,
    currency: r.currency,
    cash: Number(r.cash),
    portfolioValue: Number(r.portfolio_value),
    equity: Number(r.equity),
    buyingPower: Number(r.buying_power),
    daytradeCount: r.daytrade_count,
    patternDayTrader: r.pattern_day_trader,
    tradingBlocked: r.trading_blocked,
  };
}
