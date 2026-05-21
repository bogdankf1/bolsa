"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAgentEvents, useAgentState } from "./hooks";
import { useSettings } from "./settings";
import type { AgentEvent } from "@/core/types";

export type ChoreographyTab = "watchlist" | "positions" | "agent";

interface ChoreographyValue {
  /** Tab the agent's most recent action implies the operator should be on.
   *  Cleared after the consumer applies it via consumeTargetTab(). */
  targetTab: ChoreographyTab | null;
  /** Most recent symbol the agent touched, or null when none / focus off. */
  activeAgentSymbol: string | null;
  /** Most recent thought text; clears ~5 s after it arrived. Not gated on
   *  focus — it's purely informational, not screen movement. */
  latestThought: string | null;
  /** Suspend auto tab-switching for a window after the operator manually
   *  navigated. Chart symbol following is not suspended. */
  notifyManualTab: () => void;
  consumeTargetTab: () => void;
  /** True iff focus mode is active (driving the screen). */
  enabled: boolean;
}

const ChoreographyContext = createContext<ChoreographyValue | null>(null);

// Tools whose successful result should pull the operator to the Positions tab.
const POSITIONS_TOOLS = new Set([
  "place_order",
  "cancel_order",
  "list_orders",
  "get_positions",
  "get_portfolio",
  "recent_trades",
]);
// Tools whose successful result should pull the operator to the Watchlist tab.
const WATCHLIST_TOOLS = new Set([
  "add_to_watchlist",
  "remove_from_watchlist",
  "list_watchlist",
]);

const MANUAL_OVERRIDE_MS = 30_000;
const THOUGHT_TTL_MS = 5_000;

function extractSymbol(ev: AgentEvent): string | null {
  const data = ev.data as Record<string, unknown> | null | undefined;
  if (!data) return null;
  const input = data.input;
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (typeof obj.symbol === "string") return obj.symbol.toUpperCase();
    if (
      Array.isArray(obj.symbols) &&
      obj.symbols.length > 0 &&
      typeof obj.symbols[0] === "string"
    ) {
      return (obj.symbols[0] as string).toUpperCase();
    }
  }
  return null;
}

function tabForTool(tool: string): ChoreographyTab | null {
  if (POSITIONS_TOOLS.has(tool)) return "positions";
  if (WATCHLIST_TOOLS.has(tool)) return "watchlist";
  return null;
}

export function ChoreographyProvider({ children }: { children: ReactNode }) {
  const { state: agentState } = useAgentState();
  const { settings } = useSettings();
  const sessionId = agentState.activeSessionId;
  const events = useAgentEvents(sessionId);

  const [targetTab, setTargetTab] = useState<ChoreographyTab | null>(null);
  const [activeAgentSymbol, setActiveAgentSymbol] = useState<string | null>(
    null,
  );
  const [latestThought, setLatestThought] = useState<string | null>(null);

  const lastProcessedIdRef = useRef<string | null>(null);
  const manualOverrideUntilRef = useRef(0);
  const thoughtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (events.length === 0) return;

    // First time we see the stream (initial backfill on mount / session
    // start), mark the latest event as already-seen so a page reload
    // doesn't replay history into the UI. Real-time inserts after this
    // point are what drive choreography.
    if (lastProcessedIdRef.current === null) {
      lastProcessedIdRef.current = events[events.length - 1].id;
      return;
    }

    const startIdx = events.findIndex(
      (e) => e.id === lastProcessedIdRef.current,
    );
    const newEvents = startIdx >= 0 ? events.slice(startIdx + 1) : events;
    if (newEvents.length === 0) return;
    lastProcessedIdRef.current = newEvents[newEvents.length - 1].id;

    const focusOn = settings.agentFocus;
    const inOverride = Date.now() < manualOverrideUntilRef.current;

    for (const ev of newEvents) {
      if (ev.kind === "thought") {
        const text =
          ev.data &&
          typeof (ev.data as Record<string, unknown>).text === "string"
            ? ((ev.data as Record<string, unknown>).text as string)
            : null;
        if (text) {
          setLatestThought(text);
          if (thoughtTimerRef.current) clearTimeout(thoughtTimerRef.current);
          thoughtTimerRef.current = setTimeout(
            () => setLatestThought(null),
            THOUGHT_TTL_MS,
          );
        }
        continue;
      }

      if (!focusOn) continue;

      if (ev.kind === "tool_call" || ev.kind === "tool_result") {
        const sym = extractSymbol(ev);
        if (sym) setActiveAgentSymbol(sym);
      }

      if (ev.kind === "tool_result" && ev.tool && !inOverride) {
        const tab = tabForTool(ev.tool);
        if (tab) setTargetTab(tab);
      }
    }
  }, [events, settings.agentFocus]);

  // Clear highlights / pending target when the operator turns focus off so
  // the screen settles immediately rather than freezing in mid-state.
  useEffect(() => {
    if (!settings.agentFocus) {
      setActiveAgentSymbol(null);
      setTargetTab(null);
    }
  }, [settings.agentFocus]);

  // Reset per-session state when no agent is active.
  useEffect(() => {
    if (!sessionId) {
      setActiveAgentSymbol(null);
      setLatestThought(null);
      setTargetTab(null);
      lastProcessedIdRef.current = null;
      if (thoughtTimerRef.current) clearTimeout(thoughtTimerRef.current);
    }
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (thoughtTimerRef.current) clearTimeout(thoughtTimerRef.current);
    };
  }, []);

  const notifyManualTab = useCallback(() => {
    manualOverrideUntilRef.current = Date.now() + MANUAL_OVERRIDE_MS;
    setTargetTab(null);
  }, []);

  const consumeTargetTab = useCallback(() => {
    setTargetTab(null);
  }, []);

  const value = useMemo<ChoreographyValue>(
    () => ({
      targetTab,
      activeAgentSymbol,
      latestThought,
      notifyManualTab,
      consumeTargetTab,
      enabled: settings.agentFocus,
    }),
    [
      targetTab,
      activeAgentSymbol,
      latestThought,
      notifyManualTab,
      consumeTargetTab,
      settings.agentFocus,
    ],
  );

  return (
    <ChoreographyContext.Provider value={value}>
      {children}
    </ChoreographyContext.Provider>
  );
}

export function useChoreography(): ChoreographyValue {
  const v = useContext(ChoreographyContext);
  if (!v)
    throw new Error("useChoreography must be inside <ChoreographyProvider>");
  return v;
}
