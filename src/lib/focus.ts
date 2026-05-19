"use client";

// Lightweight focus bus: components register named focus targets, and
// global hotkeys (e.g. `/`) call focusTarget(name) to focus them.

const targets = new Map<string, HTMLElement>();

export function registerFocusTarget(name: string, el: HTMLElement | null) {
  if (el) {
    targets.set(name, el);
  } else {
    targets.delete(name);
  }
}

export function focusTarget(name: string): boolean {
  const el = targets.get(name);
  if (!el) return false;
  el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.select();
  }
  return true;
}
