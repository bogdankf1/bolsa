// Aggregates session_start / session_end events into a flat session
// list. Used by the Analytics tab to attribute fills to the agent
// session that was live at the time. Sessions without a recorded
// session_end (kill-switch abandonment, server restart) come back with
// endedAt: null — the client decides whether to treat them as live or
// open-ended.

import { ok, withErrors } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ApiSession {
  sessionId: string;
  startedAt: string; // ISO
  endedAt: string | null; // ISO or null
}

interface Row {
  session_id: string;
  kind: string;
  created_at: string;
}

export const GET = withErrors(async () => {
  const sb = supabase();
  const [eventsRes, stateRes] = await Promise.all([
    sb
      .from("agent_events")
      .select("session_id, kind, created_at")
      .in("kind", ["session_start", "session_end"])
      .order("created_at", { ascending: true }),
    sb
      .from("agent_state")
      .select("active_session_id")
      .eq("id", 1)
      .maybeSingle(),
  ]);
  if (eventsRes.error) throw eventsRes.error;

  const activeId =
    (stateRes.data as { active_session_id: string | null } | null)
      ?.active_session_id ?? null;

  const starts = new Map<string, string>();
  const ends = new Map<string, string>();
  for (const row of (eventsRes.data ?? []) as Row[]) {
    if (row.kind === "session_start") {
      // First start wins — duplicate starts (re-registration with same
      // id) shouldn't shrink the window.
      if (!starts.has(row.session_id)) starts.set(row.session_id, row.created_at);
    } else if (row.kind === "session_end") {
      // Last end wins.
      ends.set(row.session_id, row.created_at);
    }
  }

  // Build ascending by start, then heal abandoned sessions: only one
  // session can be active at a time per the MCP design, so a session
  // with no recorded end that isn't the current active one effectively
  // ended when register_session next ran. Without this, an abandoned
  // session's window extends to infinity and swallows every later trade
  // (including those that belong to today's active session).
  const sessions: ApiSession[] = [];
  for (const [sessionId, startedAt] of starts) {
    sessions.push({
      sessionId,
      startedAt,
      endedAt: ends.get(sessionId) ?? null,
    });
  }
  sessions.sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
  );

  const nowIso = new Date().toISOString();
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    if (s.endedAt) continue;
    if (s.sessionId === activeId) continue;
    const next = sessions[i + 1];
    // Cap abandoned session at the next register_session, or "now" if
    // it's the most recent one and active_session_id is empty/different.
    s.endedAt = next ? next.startedAt : nowIso;
  }

  sessions.reverse(); // return newest-first
  return ok(sessions);
});
