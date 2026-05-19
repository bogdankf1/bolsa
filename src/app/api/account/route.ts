import { alpaca } from "@/lib/server";
import { ok, withErrors } from "@/lib/api";
import { getAccount } from "@/core/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const account = await getAccount(alpaca);
  return ok(account);
});
