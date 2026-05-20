// Bolsa V2 agent activity log.
//
// Server-side helpers around `agent_events` and `agent_state`. Every
// MCP tool dispatch is wrapped so it auto-records `tool_call` and
// `tool_result` (or `error`) rows tagged with the currently-active
// session. The spectator UI subscribes to `agent_events` via Supabase
// realtime to stream those rows live.
//
// Events without an active session are dropped — manual curl smoke
// tests shouldn't pollute the audit log. Agents call `registerSession`
// at the start of a run to opt in.
//
// All writes are best-effort: a failure to record an event must never
// fail the underlying tool call. The user's order takes priority over
// the audit log.

import "server-only";
import { supabase } from "@/lib/supabase";

// Types live in `core/types.ts` so client components can import them
// without pulling in this `server-only` module's side effects.
import type { AgentEvent, AgentState, EventKind } from "./types";
export type { AgentEvent, AgentState, EventKind };

// ---------- agent_state ----------

export async function getAgentState(): Promise<AgentState> {
  const { data, error } = await supabase()
    .from("agent_state")
    .select("should_stop, active_session_id")
    .eq("id", 1)
    .single();
  if (error || !data) {
    return { shouldStop: false, activeSessionId: null };
  }
  return {
    shouldStop: !!data.should_stop,
    activeSessionId: (data.active_session_id as string | null) ?? null,
  };
}

export async function getActiveSessionId(): Promise<string | null> {
  return (await getAgentState()).activeSessionId;
}

export async function shouldStop(): Promise<boolean> {
  return (await getAgentState()).shouldStop;
}

async function patchState(patch: {
  should_stop?: boolean;
  active_session_id?: string | null;
}): Promise<void> {
  const { error } = await supabase()
    .from("agent_state")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}

export async function setStop(value: boolean): Promise<void> {
  await patchState({ should_stop: value });
}

// ---------- agent_events ----------

interface RecordEventInput {
  kind: EventKind;
  tool?: string;
  data?: unknown;
  /** Override the auto-resolved session id (e.g. when starting a new one). */
  sessionId?: string;
}

export async function recordEvent({
  kind,
  tool,
  data,
  sessionId,
}: RecordEventInput): Promise<void> {
  const sid = sessionId ?? (await getActiveSessionId());
  if (!sid) return; // No active session → skip logging, don't pollute.
  try {
    await supabase().from("agent_events").insert({
      session_id: sid,
      kind,
      tool: tool ?? null,
      data: data ?? {},
    });
  } catch (e) {
    // Best-effort; never fail the tool call because the log write failed.
    console.error("recordEvent failed", e);
  }
}

// ---------- session lifecycle ----------

export interface RegisteredSession {
  sessionId: string;
}

export async function registerSession(
  name?: string,
): Promise<RegisteredSession> {
  // Use the provided name if given, otherwise an ISO-stamped default.
  const sessionId =
    name?.trim() || `session-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  // Resetting `should_stop` is essential: a previous STOP must not
  // carry over into a fresh session.
  await patchState({ active_session_id: sessionId, should_stop: false });
  await recordEvent({
    kind: "session_start",
    data: { name: name ?? null },
    sessionId,
  });
  return { sessionId };
}

export async function endSession(): Promise<{ sessionId: string | null }> {
  const sid = await getActiveSessionId();
  if (sid) {
    await recordEvent({ kind: "session_end", data: {}, sessionId: sid });
  }
  await patchState({ active_session_id: null });
  return { sessionId: sid };
}

// ---------- tool wrapping ----------

const MAX_RESULT_CHARS = 4000;

function summarizeResult(result: unknown): unknown {
  // JSON-serialize, then truncate. Keeps spectator UI snappy even if a
  // tool returns thousands of bars.
  try {
    const json = JSON.stringify(result);
    if (json.length <= MAX_RESULT_CHARS) return result;
    return {
      _truncated: true,
      _preview: json.slice(0, MAX_RESULT_CHARS) + "…",
    };
  } catch {
    return { _unserializable: true };
  }
}

// Keys that belong to the MCP RequestHandlerExtra object — never log
// these, they leak transport internals and (critically) the bearer
// token in `requestInfo.headers.authorization`.
const EXTRA_KEYS = new Set([
  "signal",
  "requestId",
  "sessionId",
  "_meta",
  "requestInfo",
  "authInfo",
  "sendNotification",
  "sendRequest",
]);

function isExtras(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((k) => EXTRA_KEYS.has(k));
}

function sanitizeInput(rawInput: unknown): unknown {
  // Tools with no `inputSchema` receive the extras object as the first
  // arg; record those as empty input. Tools with an inputSchema may
  // still have extras spread in — strip the known internal keys.
  if (isExtras(rawInput)) return {};
  if (typeof rawInput !== "object" || rawInput === null) return rawInput;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawInput as Record<string, unknown>)) {
    if (!EXTRA_KEYS.has(k)) out[k] = v;
  }
  return out;
}

/**
 * Wraps a tool callback so every invocation writes `tool_call` before
 * and `tool_result` (or `error`) after. The underlying callback runs
 * unmodified — the event log is purely a side channel.
 */
export function withAudit<Args extends unknown[], R>(
  toolName: string,
  cb: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    const input = sanitizeInput(args[0]);
    await recordEvent({ kind: "tool_call", tool: toolName, data: { input } });
    try {
      const result = await cb(...args);
      await recordEvent({
        kind: "tool_result",
        tool: toolName,
        data: { result: summarizeResult(result) },
      });
      return result;
    } catch (e) {
      await recordEvent({
        kind: "error",
        tool: toolName,
        data: { message: e instanceof Error ? e.message : String(e) },
      });
      throw e;
    }
  };
}
