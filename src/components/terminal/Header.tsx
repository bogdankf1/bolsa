"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/lib/settings";

export function Header() {
  const [now, setNow] = useState<string>("");
  const { settings, toggleNormalMode, toggleAudioMuted } = useSettings();

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

  return (
    <header className="flex items-center justify-between border-b border-[var(--color-phosphor-dark)] bg-[color-mix(in_srgb,var(--color-phosphor)_4%,transparent)] px-4 py-2 text-sm">
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
        <button
          type="button"
          onClick={toggleNormalMode}
          title={settings.normalMode ? "switch to CRT mode" : "switch to NORMAL mode"}
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
        <span className="border border-[var(--color-amber)] px-2 py-[2px] text-[var(--color-amber)] [text-shadow:0_0_4px_rgba(255,176,0,0.6)]">
          PAPER
        </span>
        <span className="flex items-center gap-1 border border-[var(--color-phosphor)] px-2 py-[2px] glow">
          <span className="inline-block size-2 animate-pulse rounded-full bg-[var(--color-phosphor)] [box-shadow:0_0_6px_var(--color-phosphor)]" />
          CONNECTED
        </span>
      </div>
    </header>
  );
}
