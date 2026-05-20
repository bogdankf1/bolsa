"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel } from "./Panel";
import { useAgentEvents, useAgentState } from "@/lib/hooks";
import { useHotkey } from "@/lib/hotkeys";
import type { AgentEvent } from "@/core/types";

type Props = {
  active: boolean;
  /** Suppress the inner Panel header — page.tsx provides the tab bar. */
  headless?: boolean;
};

function fmtClock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "--:--:--";
  }
}

// Pull a one-line summary from an event's data payload. We keep the full
// payload in a hover title in case the user wants to inspect it.
function summarize(ev: AgentEvent): string {
  const d = ev.data ?? {};
  switch (ev.kind) {
    case "thought":
      return typeof d.text === "string" ? d.text : "";
    case "tool_call": {
      const input = (d as { input?: unknown }).input;
      const args =
        input && typeof input === "object" && Object.keys(input).length > 0
          ? JSON.stringify(input)
          : "";
      return args ? `${ev.tool}(${args})` : `${ev.tool}()`;
    }
    case "tool_result": {
      const result = (d as { result?: unknown }).result;
      // Result is the MCP "content" wrapper; show a short preview.
      const text =
        result &&
        typeof result === "object" &&
        Array.isArray((result as { content?: unknown[] }).content)
          ? ((result as { content: { text?: string }[] }).content[0]?.text ??
            "")
          : JSON.stringify(result ?? "");
      return text.length > 120 ? text.slice(0, 120) + "…" : text;
    }
    case "error":
      return typeof d.message === "string" ? d.message : "error";
    case "session_start": {
      const name = (d as { name?: string }).name;
      return name ? `started "${name}"` : "session started";
    }
    case "session_end":
      return "session ended";
  }
}

function kindGlyph(kind: AgentEvent["kind"]): string {
  switch (kind) {
    case "thought":
      return "●";
    case "tool_call":
      return "→";
    case "tool_result":
      return "✓";
    case "error":
      return "✗";
    case "session_start":
      return "▶";
    case "session_end":
      return "■";
  }
}

function kindClass(kind: AgentEvent["kind"]): string {
  switch (kind) {
    case "thought":
      return "text-[var(--color-phosphor)] glow";
    case "tool_call":
      return "text-[var(--color-amber)] [text-shadow:0_0_4px_rgba(255,176,0,0.6)]";
    case "tool_result":
      return "text-[var(--color-phosphor-dim)]";
    case "error":
      return "text-[var(--color-loss)] glow-loss";
    case "session_start":
    case "session_end":
      return "text-[var(--color-phosphor)] [text-shadow:none]";
  }
}

export function Agent({ active, headless }: Props) {
  const { state, ready, stop } = useAgentState();
  // Remember the most recently active session so the log keeps showing
  // after `end_session` clears the active pointer.
  const [stickySessionId, setStickySessionId] = useState<string | null>(null);
  useEffect(() => {
    if (state.activeSessionId) setStickySessionId(state.activeSessionId);
  }, [state.activeSessionId]);
  const displaySessionId = state.activeSessionId ?? stickySessionId;

  const events = useAgentEvents(displaySessionId);
  const ordered = useMemo(() => [...events].reverse(), [events]); // newest first

  const onStopHotkey = useCallback(
    (e: KeyboardEvent) => {
      if (!state.activeSessionId || state.shouldStop) return;
      e.preventDefault();
      void stop();
    },
    [state.activeSessionId, state.shouldStop, stop],
  );
  // Capital S so it doesn't collide with `s` (sell) on OrderEntry.
  useHotkey("S", onStopHotkey, {
    enabled: active && !!state.activeSessionId && !state.shouldStop,
    priority: 20,
  });

  const status: string = !ready
    ? "—"
    : state.shouldStop
      ? "STOPPED"
      : state.activeSessionId
        ? "ACTIVE"
        : displaySessionId
          ? "ENDED"
          : "IDLE";

  const statusClass =
    status === "ACTIVE"
      ? "text-[var(--color-phosphor)] glow"
      : status === "STOPPED" || status === "ENDED"
        ? "text-[var(--color-phosphor-dim)]"
        : status === "IDLE"
          ? "text-[var(--color-phosphor-dim)]"
          : "text-[var(--color-phosphor-dim)]";

  async function onStopClick() {
    await stop();
  }

  return (
    <Panel
      title={headless ? undefined : "Agent"}
      className={headless ? "border-0" : ""}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-[var(--color-phosphor-dark)] px-3 py-1.5">
          <div className="min-w-0 flex-1 truncate text-[11px] uppercase tracking-[0.15em]">
            <span className="text-[var(--color-phosphor-dim)]">SESSION </span>
            <span className="glow">{displaySessionId ?? "—"}</span>
          </div>
          <span
            className={`shrink-0 px-1.5 py-[1px] text-[10px] tracking-[0.18em] ${statusClass}`}
          >
            {status}
          </span>
          <button
            type="button"
            onClick={onStopClick}
            disabled={
              !state.activeSessionId || state.shouldStop || !ready
            }
            className="shrink-0 border border-[var(--color-loss)] px-2 py-[2px] text-[10px] tracking-[0.18em] text-[var(--color-loss)] glow-loss hover:bg-[color-mix(in_srgb,var(--color-loss)_15%,transparent)] disabled:cursor-not-allowed disabled:opacity-30 disabled:[text-shadow:none]"
            title="signal the running agent to halt after its next iteration"
          >
            [S] STOP
          </button>
        </div>

        <ul className="min-h-0 flex-1 overflow-auto font-mono text-[11px]">
          {ordered.length === 0 ? (
            <li className="px-3 py-6 text-center text-[var(--color-phosphor-dim)]">
              {displaySessionId
                ? "waiting for activity…"
                : "no agent running — connect Claude Code and call register_session"}
            </li>
          ) : (
            ordered.map((ev) => (
              <li
                key={ev.id}
                className="grid grid-cols-[auto_auto_1fr] items-baseline gap-2 border-b border-[var(--color-phosphor-faint)] px-3 py-[3px]"
                title={JSON.stringify(ev.data)}
              >
                <span className="tabular-nums text-[var(--color-phosphor-dim)]">
                  {fmtClock(ev.created_at)}
                </span>
                <span className={kindClass(ev.kind)}>
                  {kindGlyph(ev.kind)}
                </span>
                <span
                  className={`truncate ${
                    ev.kind === "thought" || ev.kind === "tool_call"
                      ? kindClass(ev.kind)
                      : "text-[var(--color-phosphor-dim)]"
                  }`}
                >
                  {summarize(ev)}
                </span>
              </li>
            ))
          )}
        </ul>

        <div className="border-t border-[var(--color-phosphor-dark)] px-3 py-1 text-[10px] text-[var(--color-phosphor-dim)]">
          {state.activeSessionId
            ? "[S] stop · [a] focus this tab"
            : "agents connect via MCP from Claude Code"}
        </div>
      </div>
    </Panel>
  );
}
