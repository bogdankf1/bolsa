import { NextRequest } from "next/server";
import { alpaca } from "@/lib/server";
import { ok, withErrors } from "@/lib/api";
import { getRecentTrades } from "@/core/trades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrors(async (req: NextRequest) => {
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(500, Math.max(1, Number(limitParam))) : 100;
  const trades = await getRecentTrades(alpaca, limit);
  return ok(trades);
});
