"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// localStorage-backed state. SSR-safe: initial render uses `defaultValue`,
// the stored value is applied on mount via useEffect. `validate` rejects
// stale or unknown values so we don't restore something that's been
// removed from the codebase.
export function usePersistedState<T extends string>(
  key: string,
  defaultValue: T,
  validate: (v: string) => v is T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw && validate(raw)) setValue(raw);
    } catch {
      // ignore — privacy mode, full storage, etc.
    }
    hydrated.current = true;
  }, [key, validate]);

  const set = useCallback(
    (next: T) => {
      setValue(next);
      if (!hydrated.current) return;
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // ignore
      }
    },
    [key],
  );

  return [value, set];
}
