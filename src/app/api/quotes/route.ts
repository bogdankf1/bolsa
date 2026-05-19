import { NextRequest } from "next/server";
import { alpaca } from "@/lib/server";
import { ok, err, withErrors } from "@/lib/api";
import { getLatestQuotes, getLatestTrades } from "@/core/quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bulk fetch: GET /api/quotes?symbols=AAPL,VOO,QQQ
export const GET = withErrors(async (req: NextRequest) => {
  const raw = req.nextUrl.searchParams.get("symbols");
  if (!raw) return err("missing_symbols", "Provide ?symbols=A,B,C", 400);

  const symbols = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) return ok({ quotes: {}, lastPrices: {} });
  if (symbols.length > 50)
    return err("too_many_symbols", "Max 50 symbols per request", 400);

  const [quotes, trades] = await Promise.all([
    getLatestQuotes(alpaca, symbols),
    getLatestTrades(alpaca, symbols),
  ]);

  const lastPrices: Record<string, number> = {};
  for (const s of symbols) {
    const t = trades[s]?.price;
    const q = quotes[s];
    if (t != null) lastPrices[s] = t;
    else if (q) lastPrices[s] = (q.bidPrice + q.askPrice) / 2;
  }

  return ok({ quotes, lastPrices });
});
