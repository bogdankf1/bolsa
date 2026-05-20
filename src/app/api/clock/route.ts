import { alpaca } from "@/lib/server";
import { ok, withErrors } from "@/lib/api";
import { getMarketClock } from "@/core/clock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const clock = await getMarketClock(alpaca);
  return ok(clock);
});
