import { alpaca } from "@/lib/server";
import { ok, withErrors } from "@/lib/api";
import { getPortfolioSummary } from "@/core/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const portfolio = await getPortfolioSummary(alpaca);
  return ok(portfolio);
});
