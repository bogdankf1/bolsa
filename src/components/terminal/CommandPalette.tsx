"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "@/lib/settings";
import { useHotkey } from "@/lib/hotkeys";
import { resetAccount } from "@/lib/hooks";

type Command = {
  name: string;
  hint: string;
  run: () => void | Promise<void>;
};

const ALPACA_DASHBOARD_URL = "https://app.alpaca.markets/paper/dashboard/overview";

export function CommandPalette() {
  const { settings, toggleNormalMode, toggleAudioMuted } = useSettings();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setQuery("");
    setHighlightIdx(0);
    setStatus(null);
    setResetConfirm(false);
  };

  const commands = useMemo<Command[]>(
    () => [
      {
        name: "reset",
        hint: "close positions + cancel orders (cash reset on dashboard)",
        run: () => setResetConfirm(true),
      },
      {
        name: settings.normalMode ? "crt" : "normal",
        hint: settings.normalMode
          ? "re-enable CRT effects"
          : "dial down CRT effects",
        run: () => {
          toggleNormalMode();
          close();
        },
      },
      {
        name: settings.audioMuted ? "unmute" : "mute",
        hint: settings.audioMuted ? "enable audio cues" : "silence audio cues",
        run: () => {
          toggleAudioMuted();
          close();
        },
      },
      {
        name: "help",
        hint: "show available commands",
        run: () => setStatus("commands: reset · normal/crt · mute/unmute · help"),
      },
    ],
    [settings.normalMode, settings.audioMuted, toggleNormalMode, toggleAudioMuted],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.name.includes(q));
  }, [query, commands]);

  // Open palette on `:`
  useHotkey(
    ":",
    (e) => {
      e.preventDefault();
      setOpen(true);
    },
    { enabled: !open },
  );

  // Focus input on open
  useEffect(() => {
    if (open) {
      // Defer focus until the input is mounted
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIdx(0);
  }, [query]);

  if (!open) return null;

  async function executeReset() {
    setStatus("resetting...");
    try {
      const res = await resetAccount();
      setStatus(
        `✓ closed ${res.positionsClosed} positions · canceled ${res.ordersCanceled} orders`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "reset failed";
      setStatus(`error: ${msg}`);
    } finally {
      setResetConfirm(false);
    }
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (resetConfirm) {
      if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        void executeReset();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setResetConfirm(false);
        setStatus("reset canceled");
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[highlightIdx];
      if (cmd) void cmd.run();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length > 0) {
        setHighlightIdx((i) => (i + 1) % filtered.length);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length > 0) {
        setHighlightIdx(
          (i) => (i - 1 + filtered.length) % filtered.length,
        );
      }
      return;
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[18vh]"
      onClick={close}
    >
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-[520px] max-w-[90vw] border border-[var(--color-phosphor)] bg-[var(--color-bg)] text-sm shadow-[0_0_24px_rgba(0,255,65,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-phosphor-dark)] px-3 py-2">
          <span className="text-[var(--color-phosphor-dim)]">:</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value.toLowerCase())}
            onKeyDown={onInputKey}
            placeholder={resetConfirm ? "" : "command..."}
            className="crt-input flex-1 border-none px-0 disabled:opacity-50"
            disabled={resetConfirm}
          />
          <span className="cursor-blink" />
        </div>

        {resetConfirm ? (
          <div className="px-3 py-3 text-sm">
            <div className="glow-loss mb-2 font-display text-base">
              CLOSE ALL POSITIONS AND CANCEL ALL ORDERS?
            </div>
            <div className="text-[var(--color-phosphor-dim)] text-xs">
              [y] confirm · [n] cancel
            </div>
          </div>
        ) : (
          <ul className="max-h-64 overflow-auto">
            {filtered.map((c, i) => (
              <li
                key={c.name}
                onMouseEnter={() => setHighlightIdx(i)}
                onClick={() => void c.run()}
                className={`grid cursor-pointer grid-cols-[120px_1fr] gap-3 px-3 py-1.5 ${
                  i === highlightIdx
                    ? "bg-[color-mix(in_srgb,var(--color-phosphor)_15%,transparent)] glow"
                    : ""
                }`}
              >
                <span className="font-medium">:{c.name}</span>
                <span className="truncate text-[var(--color-phosphor-dim)]">
                  {c.hint}
                </span>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-[var(--color-phosphor-dim)]">
                no match
              </li>
            )}
          </ul>
        )}

        {status && (
          <div className="border-t border-[var(--color-phosphor-dark)] px-3 py-2 text-xs">
            <span className="text-[var(--color-phosphor-dim)]">{status}</span>
            {status.startsWith("✓") && (
              <span className="ml-2">
                cash reset →{" "}
                <a
                  href={ALPACA_DASHBOARD_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="glow underline"
                >
                  open Alpaca dashboard ↗
                </a>
              </span>
            )}
          </div>
        )}

        <div className="border-t border-[var(--color-phosphor-dark)] px-3 py-1 text-[10px] text-[var(--color-phosphor-dim)]">
          [↑↓] cycle · [Enter] run · [Esc] close
        </div>
      </div>
    </div>
  );
}
