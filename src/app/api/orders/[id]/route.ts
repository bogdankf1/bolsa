import { alpaca } from "@/lib/server";
import { ok, withErrors } from "@/lib/api";
import { cancelOrder } from "@/core/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = withErrors(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    await cancelOrder(alpaca, id);
    return ok({ id, canceled: true });
  },
);
