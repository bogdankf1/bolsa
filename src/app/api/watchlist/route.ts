import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, withErrors } from "@/lib/api";
import {
  addToWatchlist,
  listWatchlist,
  removeFromWatchlist,
} from "@/core/watchlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SymbolSchema = z.object({
  symbol: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Za-z.\-]+$/, "Invalid ticker"),
});

export const GET = withErrors(async () => {
  return ok({ symbols: listWatchlist() });
});

export const POST = withErrors(async (req: NextRequest) => {
  const body = await req.json();
  const { symbol } = SymbolSchema.parse(body);
  const symbols = addToWatchlist(symbol);
  return ok({ symbols });
});

export const DELETE = withErrors(async (req: NextRequest) => {
  const sym = req.nextUrl.searchParams.get("symbol");
  if (!sym) {
    const body = await req.json().catch(() => ({}));
    const { symbol } = SymbolSchema.parse(body);
    const symbols = removeFromWatchlist(symbol);
    return ok({ symbols });
  }
  const symbols = removeFromWatchlist(sym);
  return ok({ symbols });
});
