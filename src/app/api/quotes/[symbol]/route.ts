import { alpaca } from "@/lib/server";
import { ok, withErrors } from "@/lib/api";
import { getLatestQuote, getLatestTrades } from "@/core/quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrors(
  async (_req: Request, ctx: { params: Promise<{ symbol: string }> }) => {
    const { symbol } = await ctx.params;
    const sym = symbol.toUpperCase();
    const [quote, trades] = await Promise.all([
      getLatestQuote(alpaca, sym),
      getLatestTrades(alpaca, [sym]),
    ]);
    const lastPrice = trades[sym]?.price ?? (quote.bidPrice + quote.askPrice) / 2;
    return ok({ quote, lastPrice });
  },
);
