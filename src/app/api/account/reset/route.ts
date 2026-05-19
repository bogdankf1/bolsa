import { ok, withErrors } from "@/lib/api";
import { resetPaperAccount } from "@/core/reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withErrors(async () => {
  const result = await resetPaperAccount();
  return ok(result);
});
