import {
  createContext,
  useContext,
  type CSSProperties,
  type PropsWithChildren,
  type ReactNode
} from "react";

import type { GlobiguardBrowserClient } from "@globiguard/sdk";

import {
  createGlobiguardThemeStyle,
  GlobiguardStyleSheet,
  type GlobiguardThemeMode,
  type GlobiguardThemeTokens
} from "./styles.js";

const GlobiguardContext = createContext<GlobiguardBrowserClient | null>(null);

export interface GlobiguardProviderProps extends PropsWithChildren {
  client: GlobiguardBrowserClient;
  className?: string;
  fallback?: ReactNode;
  style?: CSSProperties;
  styleNonce?: string;
  styles?: "default" | "none";
  theme?: GlobiguardThemeMode;
  tokens?: GlobiguardThemeTokens;
}

export function GlobiguardProvider({
  client,
  className,
  children,
  fallback = null,
  style,
  styleNonce,
  styles = "default",
  theme = "system",
  tokens
}: GlobiguardProviderProps) {
  const themedStyle = {
    ...createGlobiguardThemeStyle(tokens),
    ...style
  };
  const content = client ? (
    <GlobiguardContext.Provider value={client}>
      <div
        className={["gg-root", className].filter(Boolean).join(" ")}
        data-globiguard-scope
        data-globiguard-theme={theme}
        style={themedStyle}
      >
        {children}
      </div>
    </GlobiguardContext.Provider>
  ) : (
    fallback
  );

  if (styles === "none") {
    return content;
  }

  if (!client) {
    return (
      <>
        <GlobiguardStyleSheet nonce={styleNonce} />
        {content}
      </>
    );
  }

  return (
    <>
      <GlobiguardStyleSheet nonce={styleNonce} />
      {content}
    </>
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
