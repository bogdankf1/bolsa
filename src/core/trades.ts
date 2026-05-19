// "Trades" in Bolsa = filled orders (per the spec's trade-log semantics).
// Alpaca doesn't expose a dedicated "fills" endpoint; we derive from closed orders.

import type { AlpacaClient } from "./alpaca/client";
import type { Order } from "./types";
import { listOrders } from "./orders";

export async function getRecentTrades(
  client: AlpacaClient,
  limit = 100,
): Promise<Order[]> {
  const orders = await listOrders(client, { status: "closed", limit });
  return orders.filter(
    (o) => o.status === "filled" || o.status === "partially_filled",
  );
}
