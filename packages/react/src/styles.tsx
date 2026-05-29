import type { CSSProperties } from "react";

export type GlobiguardThemeMode = "system" | "light" | "dark";

export interface GlobiguardThemeTokens {
  accent?: string;
  accentForeground?: string;
  background?: string;
  foreground?: string;
  muted?: string;
  mutedForeground?: string;
  border?: string;
  radius?: string;
  shadow?: string;
  fontFamily?: string;
}

export const globiguardStyles = `
.gg-root,
[data-globiguard-scope] {
  --gg-bg: #ffffff;
  --gg-fg: #0f172a;
  --gg-muted: #f8fafc;
  --gg-muted-fg: #475569;
  --gg-border: #e2e8f0;
  --gg-accent: #2563eb;
  --gg-accent-fg: #ffffff;
  --gg-success: #047857;
  --gg-success-bg: #ecfdf5;
  --gg-warning: #b45309;
  --gg-warning-bg: #fffbeb;
  --gg-danger: #b91c1c;
  --gg-danger-bg: #fef2f2;
  --gg-info: #0369a1;
  --gg-info-bg: #f0f9ff;
  --gg-radius: 0.875rem;
  --gg-shadow: 0 16px 40px rgba(15, 23, 42, 0.10);
  --gg-font: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--gg-fg);
  font-family: var(--gg-font);
}

[data-globiguard-scope] {
  display: contents;
}

[data-globiguard-theme="dark"] {
  --gg-bg: #020617;
  --gg-fg: #e2e8f0;
  --gg-muted: #0f172a;
  --gg-muted-fg: #94a3b8;
  --gg-border: #1e293b;
  --gg-accent: #60a5fa;
  --gg-accent-fg: #082f49;
  --gg-success-bg: rgba(5, 150, 105, 0.16);
  --gg-warning-bg: rgba(217, 119, 6, 0.16);
  --gg-danger-bg: rgba(220, 38, 38, 0.16);
  --gg-info-bg: rgba(14, 165, 233, 0.16);
}

@media (prefers-color-scheme: dark) {
  [data-globiguard-theme="system"] {
    --gg-bg: #020617;
    --gg-fg: #e2e8f0;
    --gg-muted: #0f172a;
    --gg-muted-fg: #94a3b8;
    --gg-border: #1e293b;
    --gg-accent: #60a5fa;
    --gg-accent-fg: #082f49;
    --gg-success-bg: rgba(5, 150, 105, 0.16);
    --gg-warning-bg: rgba(217, 119, 6, 0.16);
    --gg-danger-bg: rgba(220, 38, 38, 0.16);
    --gg-info-bg: rgba(14, 165, 233, 0.16);
  }
}

.gg-stack {
  display: grid;
  gap: var(--gg-stack-gap, 0.875rem);
}

.gg-cluster {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.625rem;
}

.gg-card {
  background: color-mix(in srgb, var(--gg-bg) 94%, var(--gg-muted));
  border: 1px solid var(--gg-border);
  border-radius: var(--gg-radius);
  box-shadow: var(--gg-card-shadow, var(--gg-shadow));
  color: var(--gg-fg);
  display: grid;
  gap: 0.875rem;
  padding: var(--gg-card-padding, 1rem);
}

.gg-card[data-density="compact"] {
  --gg-card-padding: 0.75rem;
  gap: 0.625rem;
}

.gg-card__header {
  align-items: flex-start;
  display: flex;
  gap: 0.875rem;
  justify-content: space-between;
}

.gg-card__title {
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.25;
  margin: 0;
}

.gg-card__description,
.gg-muted {
  color: var(--gg-muted-fg);
  font-size: 0.875rem;
  line-height: 1.55;
  margin: 0;
}

.gg-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(min(12rem, 100%), 1fr));
}

.gg-stat {
  background: var(--gg-muted);
  border: 1px solid var(--gg-border);
  border-radius: calc(var(--gg-radius) - 0.25rem);
  min-width: 0;
  padding: 0.75rem;
}

.gg-stat__label {
  color: var(--gg-muted-fg);
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.gg-stat__value {
  display: block;
  font-size: 0.92rem;
  font-weight: 700;
  margin-top: 0.25rem;
  overflow-wrap: anywhere;
}

.gg-badge {
  align-items: center;
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  border-radius: 999px;
  display: inline-flex;
  font-size: 0.75rem;
  font-weight: 700;
  gap: 0.375rem;
  letter-spacing: 0.02em;
  line-height: 1;
  padding: 0.375rem 0.625rem;
  text-transform: uppercase;
  white-space: nowrap;
}

.gg-badge[data-tone="success"] {
  background: var(--gg-success-bg);
  color: var(--gg-success);
}

.gg-badge[data-tone="warning"] {
  background: var(--gg-warning-bg);
  color: var(--gg-warning);
}

.gg-badge[data-tone="danger"] {
  background: var(--gg-danger-bg);
  color: var(--gg-danger);
}

.gg-badge[data-tone="info"] {
  background: var(--gg-info-bg);
  color: var(--gg-info);
}

.gg-badge[data-tone="neutral"] {
  background: var(--gg-muted);
  color: var(--gg-muted-fg);
}

.gg-button {
  align-items: center;
  background: var(--gg-accent);
  border: 1px solid color-mix(in srgb, var(--gg-accent) 88%, black);
  border-radius: calc(var(--gg-radius) - 0.375rem);
  color: var(--gg-accent-fg);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 700;
  gap: 0.5rem;
  justify-content: center;
  min-height: 2.5rem;
  padding: 0.625rem 0.95rem;
}

.gg-button:disabled,
.gg-button[aria-disabled="true"] {
  cursor: not-allowed;
  opacity: 0.62;
}

.gg-list {
  display: grid;
  gap: 0.625rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.gg-link {
  color: var(--gg-accent);
  font-weight: 700;
  overflow-wrap: anywhere;
}

.gg-timeline {
  border-inline-start: 1px solid var(--gg-border);
  display: grid;
  gap: 0.875rem;
  list-style: none;
  margin: 0;
  padding: 0 0 0 1rem;
}

.gg-timeline__item {
  display: grid;
  gap: 0.375rem;
  position: relative;
}

.gg-timeline__item::before {
  background: var(--gg-accent);
  border: 3px solid var(--gg-bg);
  border-radius: 999px;
  content: "";
  height: 0.75rem;
  inset-inline-start: -1.41rem;
  position: absolute;
  top: 0.2rem;
  width: 0.75rem;
}

.gg-code {
  background: var(--gg-muted);
  border: 1px solid var(--gg-border);
  border-radius: 0.5rem;
  color: var(--gg-fg);
  font-size: 0.85em;
  padding: 0.12rem 0.35rem;
}

@media (max-width: 42rem) {
  .gg-card__header {
    align-items: stretch;
    display: grid;
  }

  .gg-badge,
  .gg-button {
    white-space: normal;
  }
}
`;

export interface GlobiguardStyleSheetProps {
  css?: string;
  id?: string;
  nonce?: string;
}

export function GlobiguardStyleSheet({
  css = globiguardStyles,
  id = "globiguard-style-sheet",
  nonce
}: GlobiguardStyleSheetProps) {
  return (
    <style
      data-globiguard-style-sheet
      id={id}
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: css }}
    />
  );
}

export function createGlobiguardThemeStyle(
  tokens: GlobiguardThemeTokens = {}
): CSSProperties {
  return {
    "--gg-accent": tokens.accent,
    "--gg-accent-fg": tokens.accentForeground,
    "--gg-bg": tokens.background,
    "--gg-fg": tokens.foreground,
    "--gg-muted": tokens.muted,
    "--gg-muted-fg": tokens.mutedForeground,
    "--gg-border": tokens.border,
    "--gg-radius": tokens.radius,
    "--gg-shadow": tokens.shadow,
    "--gg-font": tokens.fontFamily
  } as CSSProperties;
}
