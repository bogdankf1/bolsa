import type { AlpacaClient } from "./alpaca/client";
import type { MarketClock } from "./types";

export async function getMarketClock(
  client: AlpacaClient,
): Promise<MarketClock> {
  const r = await client.clock();
  return {
    timestamp: r.timestamp,
    isOpen: r.is_open,
    nextOpen: r.next_open,
    nextClose: r.next_close,
  };
}
