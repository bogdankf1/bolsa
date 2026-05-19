import { NextRequest } from "next/server";
import { alpaca } from "@/lib/server";
import { ok, err, withErrors } from "@/lib/api";
import { getSnapshots } from "@/core/quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/snapshots?symbols=AAPL,VOO
// Rich per-symbol data: last/bid/ask, day OHLCV, prev close, change & change%.
export const GET = withErrors(async (req: NextRequest) => {
  const raw = req.nextUrl.searchParams.get("symbols");
  if (!raw) return err("missing_symbols", "Provide ?symbols=A,B,C", 400);

  const symbols = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) return ok({ snapshots: {} });
  if (symbols.length > 50)
    return err("too_many_symbols", "Max 50 symbols per request", 400);

  const snapshots = await getSnapshots(alpaca, symbols);
  return ok({ snapshots });
});
