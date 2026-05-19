"use client";

import { useEffect } from "react";

type HotkeyHandler = (e: KeyboardEvent) => void;

type Options = {
  /** When false, the handler is skipped (re-evaluated on every keypress). */
  enabled?: boolean;
  /** Higher priority handlers run first; the first to call preventDefault wins. */
  priority?: number;
  /** If true, the handler also fires when an input/textarea is focused. */
  allowInInputs?: boolean;
};

type Registration = {
  key: string;
  handler: HotkeyHandler;
  options: Options;
};

const registry: Registration[] = [];
let listenerInstalled = false;

function isInInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function dispatch(e: KeyboardEvent) {
  // Snapshot in priority order so handler list changes during dispatch don't bite us
  const sorted = [...registry].sort(
    (a, b) => (b.options.priority ?? 0) - (a.options.priority ?? 0),
  );

  for (const reg of sorted) {
    if (reg.options.enabled === false) continue;
    if (reg.key !== e.key) continue;
    if (!reg.options.allowInInputs && isInInput(e.target)) continue;
    reg.handler(e);
    if (e.defaultPrevented) return;
  }
}

function install() {
  if (listenerInstalled || typeof window === "undefined") return;
  window.addEventListener("keydown", dispatch);
  listenerInstalled = true;
}

/**
 * Register a global keyboard shortcut. The handler is called with the
 * KeyboardEvent; call e.preventDefault() to stop lower-priority handlers
 * from firing for the same key.
 */
export function useHotkey(
  key: string,
  handler: HotkeyHandler,
  options: Options = {},
) {
  useEffect(() => {
    install();
    const reg: Registration = { key, handler, options };
    registry.push(reg);
    return () => {
      const idx = registry.indexOf(reg);
      if (idx >= 0) registry.splice(idx, 1);
    };
  }, [key, handler, options]);
}
