import { NextRequest } from "next/server";
import { alpaca } from "@/lib/server";
import { ok, withErrors } from "@/lib/api";
import { getBars } from "@/core/quotes";
import type { Timeframe } from "@/core/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TF: Timeframe[] = [
  "1Min",
  "5Min",
  "15Min",
  "1H",
  "1D",
  "1W",
  "1M",
  "3M",
  "1Y",
];

export const GET = withErrors(
  async (req: NextRequest, ctx: { params: Promise<{ symbol: string }> }) => {
    const { symbol } = await ctx.params;
    const tfParam = req.nextUrl.searchParams.get("timeframe") ?? "1D";
    const timeframe = (VALID_TF as string[]).includes(tfParam)
      ? (tfParam as Timeframe)
      : "1D";
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam
      ? Math.min(10_000, Math.max(1, Number(limitParam)))
      : undefined;
    const start = req.nextUrl.searchParams.get("start") || undefined;
    const end = req.nextUrl.searchParams.get("end") || undefined;
    const bars = await getBars(alpaca, symbol.toUpperCase(), timeframe, {
      limit,
      start,
      end,
    });
    return ok({ symbol: symbol.toUpperCase(), timeframe, bars });
  },
);
