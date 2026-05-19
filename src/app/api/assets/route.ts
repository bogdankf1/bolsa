import { NextRequest } from "next/server";
import { err, ok, withErrors } from "@/lib/api";
import { searchAssets } from "@/core/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrors(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || !q.trim()) {
    return err("BAD_REQUEST", "missing query parameter `q`", 400);
  }
  const results = await searchAssets(q);
  return ok({ results });
});
