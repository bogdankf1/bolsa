import { NextRequest } from "next/server";
import { z } from "zod";
import { alpaca } from "@/lib/server";
import { ok, withErrors } from "@/lib/api";
import { listOrders, placeOrder } from "@/core/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PlaceOrderSchema = z.object({
  symbol: z.string().min(1).max(10),
  qty: z.number().int().positive(),
  side: z.enum(["buy", "sell"]),
  type: z.enum(["market", "limit", "stop", "stop_limit"]),
  timeInForce: z.enum(["day", "gtc", "ioc", "fok"]).optional(),
  limitPrice: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
});

export const GET = withErrors(async (req: NextRequest) => {
  const statusParam = req.nextUrl.searchParams.get("status");
  const limitParam = req.nextUrl.searchParams.get("limit");
  const status =
    statusParam === "open" || statusParam === "closed" || statusParam === "all"
      ? statusParam
      : "all";
  const limit = limitParam ? Math.min(500, Math.max(1, Number(limitParam))) : 100;
  const orders = await listOrders(alpaca, { status, limit });
  return ok(orders);
});

export const POST = withErrors(async (req: NextRequest) => {
  const body = await req.json();
  const input = PlaceOrderSchema.parse(body);
  const order = await placeOrder(alpaca, input);
  return ok(order, { status: 201 });
});
