"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSettings } from "./settings";

export type SoundName = "keystroke" | "tick" | "fill";

// Lazy-init AudioContext on first user interaction (browsers block auto-play).
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx && ctx.state !== "closed") return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

function envelopeBeep(
  freq: number,
  durationMs: number,
  type: OscillatorType = "sine",
  gain = 0.05,
) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.005);
  g.gain.exponentialRampToValueAtTime(
    0.0001,
    c.currentTime + durationMs / 1000,
  );
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + durationMs / 1000 + 0.02);
}

export function playSound(name: SoundName) {
  switch (name) {
    case "keystroke":
      envelopeBeep(800, 30, "square", 0.025);
      return;
    case "tick":
      envelopeBeep(1200, 80, "sine", 0.04);
      return;
    case "fill":
      envelopeBeep(600, 180, "sine", 0.06);
      setTimeout(() => envelopeBeep(900, 220, "sine", 0.06), 150);
      return;
  }
}

/**
 * Hook returning a `play(name)` function that no-ops when audio is muted.
 * Call from event handlers (keystroke, tick, fill) without checking mute state.
 */
export function useAudio() {
  const { settings } = useSettings();
  const mutedRef = useRef(settings.audioMuted);
  useEffect(() => {
    mutedRef.current = settings.audioMuted;
  }, [settings.audioMuted]);

  const play = useCallback((name: SoundName) => {
    if (mutedRef.current) return;
    playSound(name);
  }, []);

  return { play };
}
