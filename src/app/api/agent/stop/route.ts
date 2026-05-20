// Kill-switch endpoint for the agent spectator UI.
//
// POST /api/agent/stop  → sets `agent_state.should_stop = true`.
//   The running agent checks this between iterations via the
//   `check_should_stop` MCP tool and halts.
//
// GET  /api/agent/stop  → returns current state (used by the UI's
//   STOP button to render its active/inactive look).

import { ok, withErrors } from "@/lib/api";
import { getAgentState, setStop } from "@/core/agent-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  return ok(await getAgentState());
});

export const POST = withErrors(async () => {
  await setStop(true);
  return ok(await getAgentState());
});
