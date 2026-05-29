import {
  createContext,
  useContext,
  type PropsWithChildren,
  type ReactNode
} from "react";

import type { GlobiguardBrowserClient } from "@globiguard/sdk";

const GlobiguardContext = createContext<GlobiguardBrowserClient | null>(null);

export interface GlobiguardProviderProps extends PropsWithChildren {
  client: GlobiguardBrowserClient;
  fallback?: ReactNode;
}

export function GlobiguardProvider({
  client,
  children,
  fallback = null
}: GlobiguardProviderProps) {
  if (!client) {
    return fallback;
  }

  return (
    <GlobiguardContext.Provider value={client}>
      {children}
    </GlobiguardContext.Provider>
  );
}

export function useGlobiguardClient(): GlobiguardBrowserClient {
  const client = useContext(GlobiguardContext);

  if (!client) {
    throw new Error(
      "useGlobiguardClient must be used inside a GlobiguardProvider."
    );
  }

  return client;
}
