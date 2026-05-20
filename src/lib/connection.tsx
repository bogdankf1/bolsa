"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "error"
  | "closed";

type Ctx = {
  status: ConnectionStatus;
  setStatus: (s: ConnectionStatus) => void;
};

const ConnectionContext = createContext<Ctx>({
  status: "idle",
  setStatus: () => {},
});

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const value = useMemo(() => ({ status, setStatus }), [status]);
  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnectionStatus(): ConnectionStatus {
  return useContext(ConnectionContext).status;
}

export function useSetConnectionStatus(): (s: ConnectionStatus) => void {
  return useContext(ConnectionContext).setStatus;
}
