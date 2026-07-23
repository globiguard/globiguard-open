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
/* ─── Design token layer ──────────────────────────────────────────── */
.gg-root,
[data-globiguard-scope] {
  /* Light palette — legible, professional, emerald-accented */
  --gg-bg:             #ffffff;
  --gg-surface:        #f8fafc;
  --gg-surface-raised: #ffffff;
  --gg-fg:             #0a0f1a;
  --gg-muted:          #f1f5f9;
  --gg-muted-fg:       #64748b;
  --gg-border:         #e2e8f0;
  --gg-border-subtle:  rgba(15, 23, 42, 0.06);
  --gg-accent:         #059669;
  --gg-accent-mid:     #10b981;
  --gg-accent-fg:      #ffffff;
  --gg-accent-subtle:  rgba(5, 150, 105, 0.10);
  --gg-success:        #047857;
  --gg-success-bg:     #ecfdf5;
  --gg-warning:        #b45309;
  --gg-warning-bg:     #fffbeb;
  --gg-danger:         #b91c1c;
  --gg-danger-bg:      #fef2f2;
  --gg-info:           #0369a1;
  --gg-info-bg:        #f0f9ff;
  --gg-neutral:        #475569;
  --gg-neutral-bg:     #f1f5f9;
  --gg-radius:         0.875rem;
  --gg-radius-sm:      0.5rem;
  --gg-radius-xs:      0.375rem;
  --gg-shadow:         0 1px 3px rgba(15,23,42,0.06), 0 4px 16px rgba(15,23,42,0.06);
  --gg-shadow-md:      0 4px 24px rgba(15,23,42,0.10), 0 1px 4px rgba(15,23,42,0.06);
  --gg-shadow-glow:    0 0 0 3px rgba(5,150,105,0.18);
  --gg-font:           ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --gg-font-mono:      ui-monospace, "Fira Code", "Cascadia Code", Menlo, monospace;
  --gg-transition:     120ms cubic-bezier(0.4, 0, 0.2, 1);
  color: var(--gg-fg);
  font-family: var(--gg-font);
}

/* ─── Dark mode ────────────────────────────────────────────────────── */
[data-globiguard-theme="dark"] {
  --gg-bg:             #020617;
  --gg-surface:        #0f172a;
  --gg-surface-raised: #1e293b;
  --gg-fg:             #e2e8f0;
  --gg-muted:          #0f172a;
  --gg-muted-fg:       #94a3b8;
  --gg-border:         rgba(255,255,255,0.08);
  --gg-border-subtle:  rgba(255,255,255,0.04);
  --gg-accent:         #10b981;
  --gg-accent-mid:     #34d399;
  --gg-accent-fg:      #020617;
  --gg-accent-subtle:  rgba(16,185,129,0.12);
  --gg-success:        #34d399;
  --gg-success-bg:     rgba(5,150,105,0.16);
  --gg-warning:        #fbbf24;
  --gg-warning-bg:     rgba(217,119,6,0.16);
  --gg-danger:         #f87171;
  --gg-danger-bg:      rgba(220,38,38,0.16);
  --gg-info:           #38bdf8;
  --gg-info-bg:        rgba(14,165,233,0.16);
  --gg-neutral:        #94a3b8;
  --gg-neutral-bg:     rgba(148,163,184,0.10);
  --gg-shadow:         0 1px 3px rgba(0,0,0,0.32), 0 4px 16px rgba(0,0,0,0.20);
  --gg-shadow-md:      0 4px 32px rgba(0,0,0,0.36), 0 1px 4px rgba(0,0,0,0.24);
  --gg-shadow-glow:    0 0 0 3px rgba(16,185,129,0.22);
}

@media (prefers-color-scheme: dark) {
  [data-globiguard-theme="system"] {
    --gg-bg:             #020617;
    --gg-surface:        #0f172a;
    --gg-surface-raised: #1e293b;
    --gg-fg:             #e2e8f0;
    --gg-muted:          #0f172a;
    --gg-muted-fg:       #94a3b8;
    --gg-border:         rgba(255,255,255,0.08);
    --gg-border-subtle:  rgba(255,255,255,0.04);
    --gg-accent:         #10b981;
    --gg-accent-mid:     #34d399;
    --gg-accent-fg:      #020617;
    --gg-accent-subtle:  rgba(16,185,129,0.12);
    --gg-success:        #34d399;
    --gg-success-bg:     rgba(5,150,105,0.16);
    --gg-warning:        #fbbf24;
    --gg-warning-bg:     rgba(217,119,6,0.16);
    --gg-danger:         #f87171;
    --gg-danger-bg:      rgba(220,38,38,0.16);
    --gg-info:           #38bdf8;
    --gg-info-bg:        rgba(14,165,233,0.16);
    --gg-neutral:        #94a3b8;
    --gg-neutral-bg:     rgba(148,163,184,0.10);
    --gg-shadow:         0 1px 3px rgba(0,0,0,0.32), 0 4px 16px rgba(0,0,0,0.20);
    --gg-shadow-md:      0 4px 32px rgba(0,0,0,0.36), 0 1px 4px rgba(0,0,0,0.24);
    --gg-shadow-glow:    0 0 0 3px rgba(16,185,129,0.22);
  }
}

/* ─── Reset / scope isolation ──────────────────────────────────────── */
[data-globiguard-scope] {
  display: contents;
}

/* ─── Layout primitives ────────────────────────────────────────────── */
.gg-stack {
  display: grid;
  gap: var(--gg-stack-gap, 0.875rem);
}

.gg-cluster {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.gg-divider {
  background: var(--gg-border);
  border: 0;
  height: 1px;
  margin: 0;
}

/* ─── Card ─────────────────────────────────────────────────────────── */
.gg-card {
  background: var(--gg-surface-raised);
  border: 1px solid var(--gg-border);
  border-radius: var(--gg-radius);
  box-shadow: var(--gg-shadow);
  color: var(--gg-fg);
  display: grid;
  gap: 1rem;
  padding: var(--gg-card-padding, 1.25rem);
  position: relative;
}

.gg-card[data-density="compact"] {
  --gg-card-padding: 0.875rem;
  gap: 0.75rem;
}

.gg-card::before {
  border-radius: var(--gg-radius) var(--gg-radius) 0 0;
  content: "";
  display: block;
  height: 1px;
  inset: 0;
  position: absolute;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
  pointer-events: none;
}

.gg-card[data-globiguard-fail-closed],
.gg-card[data-globiguard-blocked-action] {
  border-color: color-mix(in srgb, var(--gg-danger) 30%, transparent);
  box-shadow: var(--gg-shadow), inset 0 0 0 1px color-mix(in srgb, var(--gg-danger) 18%, transparent);
}

.gg-card[data-globiguard-queued-action] {
  border-color: color-mix(in srgb, var(--gg-warning) 30%, transparent);
}

.gg-card[data-globiguard-modified-action] {
  border-color: color-mix(in srgb, var(--gg-info) 30%, transparent);
}

.gg-card__header {
  align-items: flex-start;
  display: flex;
  gap: 0.875rem;
  justify-content: space-between;
}

.gg-card__title {
  font-size: 0.9375rem;
  font-weight: 700;
  letter-spacing: -0.015em;
  line-height: 1.3;
  margin: 0;
}

.gg-card__description,
.gg-muted {
  color: var(--gg-muted-fg);
  font-size: 0.875rem;
  line-height: 1.6;
  margin: 0;
}

/* ─── Grid ─────────────────────────────────────────────────────────── */
.gg-grid {
  display: grid;
  gap: 0.625rem;
  grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr));
}

/* ─── Stat ─────────────────────────────────────────────────────────── */
.gg-stat {
  background: var(--gg-muted);
  border: 1px solid var(--gg-border-subtle);
  border-radius: var(--gg-radius-sm);
  min-width: 0;
  overflow: hidden;
  padding: 0.75rem;
}

.gg-stat__label {
  color: var(--gg-muted-fg);
  display: block;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.gg-stat__value {
  display: block;
  font-size: 0.875rem;
  font-weight: 700;
  margin-top: 0.3rem;
  overflow-wrap: anywhere;
}

/* ─── Badge ────────────────────────────────────────────────────────── */
.gg-badge {
  align-items: center;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  border-radius: 999px;
  display: inline-flex;
  font-size: 0.6875rem;
  font-weight: 800;
  gap: 0.3rem;
  letter-spacing: 0.07em;
  line-height: 1;
  padding: 0.3125rem 0.625rem;
  text-transform: uppercase;
  white-space: nowrap;
}

.gg-badge__dot {
  background: currentColor;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
  height: 0.375rem;
  width: 0.375rem;
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
  background: var(--gg-neutral-bg);
  color: var(--gg-neutral);
}

/* ─── Button ───────────────────────────────────────────────────────── */
.gg-button {
  align-items: center;
  background: var(--gg-accent);
  border: 1px solid color-mix(in srgb, var(--gg-accent) 80%, black);
  border-radius: var(--gg-radius-sm);
  color: var(--gg-accent-fg);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 700;
  gap: 0.5rem;
  justify-content: center;
  letter-spacing: -0.005em;
  min-height: 2.5rem;
  padding: 0.5625rem 1rem;
  transition: background var(--gg-transition), box-shadow var(--gg-transition), transform var(--gg-transition);
  -webkit-user-select: none;
  user-select: none;
}

.gg-button:hover:not(:disabled):not([aria-disabled="true"]) {
  background: var(--gg-accent-mid);
  box-shadow: var(--gg-shadow-glow);
}

.gg-button:active:not(:disabled):not([aria-disabled="true"]) {
  transform: translateY(1px);
}

.gg-button:focus-visible {
  outline: 2px solid var(--gg-accent);
  outline-offset: 2px;
}

.gg-button:disabled,
.gg-button[aria-disabled="true"] {
  cursor: not-allowed;
  opacity: 0.5;
}

.gg-button[data-variant="ghost"] {
  background: transparent;
  border-color: var(--gg-border);
  color: var(--gg-fg);
}

.gg-button[data-variant="ghost"]:hover:not(:disabled) {
  background: var(--gg-muted);
  box-shadow: none;
}

.gg-button[data-variant="danger"] {
  background: var(--gg-danger-bg);
  border-color: color-mix(in srgb, var(--gg-danger) 30%, transparent);
  color: var(--gg-danger);
}

.gg-button[data-variant="danger"]:hover:not(:disabled) {
  background: var(--gg-danger);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--gg-danger) 20%, transparent);
  color: white;
}

.gg-button[data-size="sm"] {
  font-size: 0.8125rem;
  min-height: 2rem;
  padding: 0.375rem 0.75rem;
}

.gg-button[data-size="lg"] {
  font-size: 1rem;
  min-height: 3rem;
  padding: 0.75rem 1.5rem;
}

/* ─── Input ────────────────────────────────────────────────────────── */
.gg-input {
  appearance: none;
  background: var(--gg-bg);
  border: 1px solid var(--gg-border);
  border-radius: var(--gg-radius-sm);
  color: var(--gg-fg);
  font: inherit;
  font-size: 0.875rem;
  min-height: 2.5rem;
  padding: 0.5rem 0.75rem;
  transition: border-color var(--gg-transition), box-shadow var(--gg-transition);
  width: 100%;
}

.gg-input::placeholder {
  color: var(--gg-muted-fg);
}

.gg-input:focus {
  border-color: var(--gg-accent);
  box-shadow: var(--gg-shadow-glow);
  outline: none;
}

.gg-input:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* ─── List ─────────────────────────────────────────────────────────── */
.gg-list {
  display: grid;
  gap: 0.5rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.gg-link {
  color: var(--gg-accent);
  font-weight: 600;
  overflow-wrap: anywhere;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.gg-link:hover {
  color: var(--gg-accent-mid);
}

/* ─── Timeline ─────────────────────────────────────────────────────── */
.gg-timeline {
  border-inline-start: 2px solid var(--gg-border);
  display: grid;
  gap: 1rem;
  list-style: none;
  margin: 0;
  padding: 0 0 0 1.25rem;
}

.gg-timeline__item {
  display: grid;
  gap: 0.375rem;
  position: relative;
}

.gg-timeline__item::before {
  background: var(--gg-accent);
  border: 2px solid var(--gg-surface-raised);
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--gg-accent-subtle);
  content: "";
  height: 0.75rem;
  inset-inline-start: -1.5rem;
  position: absolute;
  top: 0.25rem;
  width: 0.75rem;
}

.gg-timeline__item[data-globiguard-replay-status="blocked"]::before,
.gg-timeline__item[data-globiguard-replay-status="failed"]::before {
  background: var(--gg-danger);
  box-shadow: 0 0 0 3px var(--gg-danger-bg);
}

.gg-timeline__item[data-globiguard-replay-status="queued"]::before {
  background: var(--gg-warning);
  box-shadow: 0 0 0 3px var(--gg-warning-bg);
}

/* ─── Code ─────────────────────────────────────────────────────────── */
.gg-code {
  background: var(--gg-muted);
  border: 1px solid var(--gg-border);
  border-radius: var(--gg-radius-xs);
  color: var(--gg-fg);
  font-family: var(--gg-font-mono);
  font-size: 0.8em;
  padding: 0.125rem 0.375rem;
}

/* ─── Loading skeleton ─────────────────────────────────────────────── */
.gg-skeleton {
  animation: gg-pulse 1.6s ease-in-out infinite;
  background: linear-gradient(
    90deg,
    var(--gg-muted) 25%,
    color-mix(in srgb, var(--gg-muted) 60%, var(--gg-border)) 50%,
    var(--gg-muted) 75%
  );
  background-size: 200% 100%;
  border-radius: var(--gg-radius-xs);
  display: block;
  height: 1em;
}

@keyframes gg-pulse {
  0% { background-position: 200% center; }
  100% { background-position: -200% center; }
}

/* ─── Status indicator ─────────────────────────────────────────────── */
.gg-status-dot {
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
  height: 0.5rem;
  width: 0.5rem;
}

.gg-status-dot[data-tone="success"] {
  background: var(--gg-success);
  box-shadow: 0 0 0 3px var(--gg-success-bg);
}

.gg-status-dot[data-tone="warning"] {
  background: var(--gg-warning);
  box-shadow: 0 0 0 3px var(--gg-warning-bg);
}

.gg-status-dot[data-tone="danger"] {
  background: var(--gg-danger);
  box-shadow: 0 0 0 3px var(--gg-danger-bg);
}

.gg-status-dot[data-tone="neutral"] {
  background: var(--gg-neutral);
  box-shadow: 0 0 0 3px var(--gg-neutral-bg);
}

/* ─── Decision pipeline strip ──────────────────────────────────────── */
.gg-pipeline {
  display: flex;
  gap: 0.375rem;
  list-style: none;
  margin: 0;
  overflow-x: auto;
  padding: 0;
  scrollbar-width: none;
}

.gg-pipeline::-webkit-scrollbar { display: none; }

.gg-pipeline__step {
  align-items: center;
  background: var(--gg-muted);
  border: 1px solid var(--gg-border);
  border-radius: var(--gg-radius-xs);
  display: flex;
  flex: 1;
  flex-direction: column;
  font-size: 0.6875rem;
  font-weight: 700;
  gap: 0.25rem;
  letter-spacing: 0.05em;
  min-width: 5rem;
  padding: 0.5rem;
  text-align: center;
  text-transform: uppercase;
}

.gg-pipeline__step[data-decision="ALLOW"] {
  background: var(--gg-success-bg);
  border-color: color-mix(in srgb, var(--gg-success) 25%, transparent);
  color: var(--gg-success);
}

.gg-pipeline__step[data-decision="BLOCK"] {
  background: var(--gg-danger-bg);
  border-color: color-mix(in srgb, var(--gg-danger) 25%, transparent);
  color: var(--gg-danger);
}

.gg-pipeline__step[data-decision="QUEUE"] {
  background: var(--gg-warning-bg);
  border-color: color-mix(in srgb, var(--gg-warning) 25%, transparent);
  color: var(--gg-warning);
}

.gg-pipeline__step[data-decision="MODIFY"] {
  background: var(--gg-info-bg);
  border-color: color-mix(in srgb, var(--gg-info) 25%, transparent);
  color: var(--gg-info);
}

/* ─── Scan evidence table ──────────────────────────────────────────── */
.gg-entity-table {
  border: 1px solid var(--gg-border);
  border-radius: var(--gg-radius-sm);
  border-spacing: 0;
  font-size: 0.875rem;
  overflow: hidden;
  width: 100%;
}

.gg-entity-table thead {
  background: var(--gg-muted);
}

.gg-entity-table th {
  color: var(--gg-muted-fg);
  font-size: 0.6875rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  padding: 0.5625rem 0.875rem;
  text-align: start;
  text-transform: uppercase;
}

.gg-entity-table td {
  border-top: 1px solid var(--gg-border);
  padding: 0.625rem 0.875rem;
  vertical-align: middle;
}

.gg-entity-table tr:last-child td {
  border-bottom: 0;
}

/* ─── Responsive tweaks ────────────────────────────────────────────── */
@media (max-width: 42rem) {
  .gg-card__header {
    align-items: stretch;
    flex-direction: column;
    gap: 0.625rem;
  }

  .gg-grid {
    grid-template-columns: 1fr;
  }

  .gg-pipeline {
    gap: 0.25rem;
  }

  .gg-pipeline__step {
    min-width: 4rem;
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
