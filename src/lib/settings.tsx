"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Settings = {
  normalMode: boolean;
  audioMuted: boolean;
};

type SettingsContextValue = {
  settings: Settings;
  setNormalMode: (v: boolean) => void;
  setAudioMuted: (v: boolean) => void;
  toggleNormalMode: () => void;
  toggleAudioMuted: () => void;
};

const STORAGE_KEY = "bolsa:settings";
const DEFAULTS: Settings = { normalMode: false, audioMuted: true };

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Settings>;
        setSettings({
          normalMode: parsed.normalMode ?? DEFAULTS.normalMode,
          audioMuted: parsed.audioMuted ?? DEFAULTS.audioMuted,
        });
      }
    } catch {
      // ignore — storage may be blocked
    }
    setHydrated(true);
  }, []);

  // Persist + apply body class
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
    document.body.classList.toggle("normal-mode", settings.normalMode);
  }, [settings, hydrated]);

  const setNormalMode = useCallback(
    (v: boolean) => setSettings((s) => ({ ...s, normalMode: v })),
    [],
  );
  const setAudioMuted = useCallback(
    (v: boolean) => setSettings((s) => ({ ...s, audioMuted: v })),
    [],
  );
  const toggleNormalMode = useCallback(
    () => setSettings((s) => ({ ...s, normalMode: !s.normalMode })),
    [],
  );
  const toggleAudioMuted = useCallback(
    () => setSettings((s) => ({ ...s, audioMuted: !s.audioMuted })),
    [],
  );

  return (
    <SettingsContext.Provider
      value={{
        settings,
        setNormalMode,
        setAudioMuted,
        toggleNormalMode,
        toggleAudioMuted,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
