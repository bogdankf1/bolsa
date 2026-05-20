// Paper-account "reset" approximation. Alpaca's public API does not
// expose true cash-reset-to-$100K — that lives only in the dashboard.
// We close all positions + cancel all open orders, and the UI links
// out to the Alpaca dashboard for a full cash reset.

import { alpaca } from "@/lib/server";

export interface ResetResult {
  positionsClosed: number;
  ordersCanceled: number;
}

export async function resetPaperAccount(): Promise<ResetResult> {
  const [closed, canceled] = await Promise.all([
    alpaca.closeAllPositions(),
    alpaca.cancelAllOrders(),
  ]);

  return {
    positionsClosed: closed.length,
    ordersCanceled: canceled.length,
  };
}
