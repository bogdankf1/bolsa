"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/lib/settings";
import { useConnectionStatus } from "@/lib/connection";
import { useAgentState, useClock } from "@/lib/hooks";
import { useChoreography } from "@/lib/choreography";

function fmtLocal(iso: string): string {
  try {
    const d = new Date(iso);
    const time = d.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    const tz =
      new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
        .formatToParts(d)
        .find((p) => p.type === "timeZoneName")?.value ?? "";
    return tz ? `${time} ${tz}` : time;
  } catch {
    return "--:--";
  }
}

type Badge = {
  label: string;
  border: string;
  text: string;
  dot: string;
  pulse: boolean;
};

function badgeFor(status: ReturnType<typeof useConnectionStatus>): Badge {
  switch (status) {
    case "open":
      return {
        label: "CONNECTED",
        border: "var(--color-phosphor)",
        text: "var(--color-phosphor)",
        dot: "var(--color-phosphor)",
        pulse: true,
      };
    case "connecting":
      return {
        label: "CONNECTING",
        border: "var(--color-amber)",
        text: "var(--color-amber)",
        dot: "var(--color-amber)",
        pulse: true,
      };
    case "error":
      return {
        label: "OFFLINE",
        border: "var(--color-loss)",
        text: "var(--color-loss)",
        dot: "var(--color-loss)",
        pulse: false,
      };
    case "closed":
      return {
        label: "DISCONNECTED",
        border: "var(--color-phosphor-dark)",
        text: "var(--color-phosphor-dim)",
        dot: "var(--color-phosphor-dim)",
        pulse: false,
      };
    case "idle":
    default:
      return {
        label: "IDLE",
        border: "var(--color-phosphor-dark)",
        text: "var(--color-phosphor-dim)",
        dot: "var(--color-phosphor-dim)",
        pulse: false,
      };
  }
}

export function Header() {
  const [now, setNow] = useState<string>("");
  const { settings, toggleNormalMode, toggleAudioMuted } = useSettings();
  const connStatus = useConnectionStatus();
  const badge = badgeFor(connStatus);
  const { data: clock } = useClock();
  const { state: agentState } = useAgentState();
  const { latestThought, enabled: focusOn } = useChoreography();

  const mkt = clock
    ? clock.isOpen
      ? {
          label: `MKT OPEN · CLOSES ${fmtLocal(clock.nextClose)}`,
          border: "var(--color-phosphor)",
          text: "var(--color-phosphor)",
          glow: true,
        }
      : {
          label: `MKT CLOSED · OPENS ${fmtLocal(clock.nextOpen)}`,
          border: "var(--color-phosphor-dark)",
          text: "var(--color-phosphor-dim)",
          glow: false,
        }
    : null;

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const date = d
        .toLocaleDateString("en-US", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })
        .replace(/\//g, ".");
      const time = d.toLocaleTimeString("en-US", { hour12: false });
      setNow(`${date} ${time}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const sessionId = agentState.activeSessionId;
  const showActionLine = !!sessionId;
  // Thought wins; absent it we show the session name so the strip is never
  // blank during an active session. focus=off greys the strip out — the
  // agent is still streaming, the operator just opted out of choreography.
  const actionText = latestThought ?? (sessionId ? `session: ${sessionId}` : "");

  return (
    <header className="border-b border-[var(--color-phosphor-dark)] bg-[color-mix(in_srgb,var(--color-phosphor)_4%,transparent)]">
      <div className="flex items-center justify-between px-4 py-2 text-sm">
      <div className="flex items-center gap-4">
        <span className="glow-strong font-semibold tracking-[0.2em]">
          BOLSA TERMINAL
        </span>
        <span className="text-[var(--color-phosphor-dim)]">v1.0</span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="font-display text-base tabular-nums text-[var(--color-phosphor-dim)]">
          {now || "----.--.-- --:--:--"}
        </span>
        {/* Always-visible toggles. Label flips to reflect current state so
            clicking gives immediate feedback (CRT ↔ NRM, MUTE ↔ SND). */}
        <button
          type="button"
          onClick={toggleNormalMode}
          title={settings.normalMode ? "switch to CRT mode" : "dial down CRT effects"}
          className={`border px-2 py-[2px] tracking-[0.15em] ${
            settings.normalMode
              ? "border-[var(--color-phosphor)] glow"
              : "border-[var(--color-phosphor-dark)] text-[var(--color-phosphor-dim)]"
          }`}
        >
          {settings.normalMode ? "NRM" : "CRT"}
        </button>
        <button
          type="button"
          onClick={toggleAudioMuted}
          title={settings.audioMuted ? "unmute audio" : "mute audio"}
          className={`border px-2 py-[2px] tracking-[0.15em] ${
            settings.audioMuted
              ? "border-[var(--color-phosphor-dark)] text-[var(--color-phosphor-dim)]"
              : "border-[var(--color-phosphor)] glow"
          }`}
        >
          {settings.audioMuted ? "MUTE" : "SND"}
        </button>
        {agentState.activeSessionId && (
          <span
            className="flex items-center gap-1 border border-[var(--color-amber)] px-2 py-[2px] text-[var(--color-amber)] [text-shadow:0_0_4px_rgba(255,176,0,0.6)]"
            title={`agent: ${agentState.activeSessionId}`}
          >
            <span
              className="inline-block size-2 animate-pulse rounded-full bg-[var(--color-amber)] [box-shadow:0_0_6px_var(--color-amber)]"
              aria-hidden
            />
            AGENT ACTIVE
          </span>
        )}
        {mkt && (
          <span
            className="border px-2 py-[2px]"
            style={{
              borderColor: mkt.border,
              color: mkt.text,
              textShadow: mkt.glow ? "0 0 4px var(--color-phosphor)" : "none",
            }}
          >
            {mkt.label}
          </span>
        )}
        <span className="border border-[var(--color-amber)] px-2 py-[2px] text-[var(--color-amber)] [text-shadow:0_0_4px_rgba(255,176,0,0.6)]">
          PAPER
        </span>
        <span
          className="flex items-center gap-1 border px-2 py-[2px]"
          style={{
            borderColor: badge.border,
            color: badge.text,
            textShadow:
              connStatus === "open"
                ? "0 0 4px var(--color-phosphor)"
                : connStatus === "connecting"
                  ? "0 0 4px rgba(255,176,0,0.6)"
                  : connStatus === "error"
                    ? "0 0 4px rgba(255,51,51,0.6)"
                    : "none",
          }}
          title={`SSE stream: ${connStatus}`}
        >
          <span
            className={`inline-block size-2 rounded-full ${
              badge.pulse ? "animate-pulse" : ""
            }`}
            style={{
              backgroundColor: badge.dot,
              boxShadow: badge.pulse ? `0 0 6px ${badge.dot}` : undefined,
            }}
          />
          {badge.label}
        </span>
      </div>
      </div>
      {showActionLine && (
        <div
          className={`flex items-center gap-2 border-t border-[var(--color-phosphor-faint)] px-4 py-[2px] text-[11px] tabular-nums ${
            focusOn
              ? "text-[var(--color-amber)] [text-shadow:0_0_3px_rgba(255,176,0,0.4)]"
              : "text-[var(--color-phosphor-dim)]"
          }`}
        >
          <span className="shrink-0 opacity-70">
            {latestThought ? "›" : "—"}
          </span>
          <span className="truncate" title={actionText}>
            {actionText}
          </span>
          {!focusOn && (
            <span className="ml-auto shrink-0 text-[10px] uppercase tracking-[0.18em] opacity-70">
              focus off
            </span>
          )}
        </div>
      )}
    </header>
  );
}
