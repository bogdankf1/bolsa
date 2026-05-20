import type { AlpacaClient, RawOrder } from "./alpaca/client";
import type { Order, OrderStatus, PlaceOrderInput } from "./types";

function adaptOrder(r: RawOrder): Order {
  return {
    id: r.id,
    clientOrderId: r.client_order_id,
    symbol: r.symbol,
    qty: Number(r.qty),
    filledQty: Number(r.filled_qty),
    side: r.side,
    type: r.type,
    timeInForce: r.time_in_force,
    status: r.status as OrderStatus,
    limitPrice: r.limit_price != null ? Number(r.limit_price) : null,
    stopPrice: r.stop_price != null ? Number(r.stop_price) : null,
    filledAvgPrice:
      r.filled_avg_price != null ? Number(r.filled_avg_price) : null,
    submittedAt: r.submitted_at,
    filledAt: r.filled_at,
    canceledAt: r.canceled_at,
  };
}

export async function listOrders(
  client: AlpacaClient,
  params: {
    status?: "open" | "closed" | "all";
    limit?: number;
  } = {},
): Promise<Order[]> {
  const raw = await client.orders({
    status: params.status ?? "all",
    limit: params.limit ?? 100,
    direction: "desc",
  });
  return raw.map(adaptOrder);
}

export async function placeOrder(
  client: AlpacaClient,
  input: PlaceOrderInput,
): Promise<Order> {
  // Limit/stop orders default to GTC so they persist across sessions until
  // filled or canceled. "day" would silently cancel them at 4pm ET.
  const isResting =
    input.type === "limit" ||
    input.type === "stop" ||
    input.type === "stop_limit";
  const body = {
    symbol: input.symbol.toUpperCase(),
    qty: input.qty,
    side: input.side,
    type: input.type,
    time_in_force: input.timeInForce ?? (isResting ? "gtc" : "day"),
    ...(input.limitPrice != null ? { limit_price: input.limitPrice } : {}),
    ...(input.stopPrice != null ? { stop_price: input.stopPrice } : {}),
  };
  const raw = await client.placeOrder(body);
  return adaptOrder(raw);
}

export async function cancelOrder(
  client: AlpacaClient,
  id: string,
): Promise<void> {
  await client.cancelOrder(id);
}
