import {
  type CSSProperties,
  type ReactNode
} from "react";

import type {
  GlobiguardDecision,
  GlobiguardApprovalState
} from "@globiguard/contracts";

import type { GlobiguardVisualTone } from "./actions.js";

/* ─── Internal helpers ─────────────────────────────────────────────── */

function cx(...values: Array<string | false | null | undefined>): string | undefined {
  const out = values.filter(Boolean).join(" ");
  return out || undefined;
}

export interface GlobiguardUIProps {
  className?: string;
  style?: CSSProperties;
}

/* ─── Skeleton ─────────────────────────────────────────────────────── */

export interface SkeletonProps extends GlobiguardUIProps {
  height?: string | number;
  width?: string | number;
}

export function Skeleton({ className, height = "1em", style, width }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx("gg-skeleton", className)}
      role="presentation"
      style={{ height, width, ...style }}
    />
  );
}

export interface CardSkeletonProps extends GlobiguardUIProps {
  density?: "comfortable" | "compact";
  rows?: number;
}

export function CardSkeleton({
  className,
  density = "comfortable",
  rows = 3,
  style
}: CardSkeletonProps) {
  return (
    <section
      aria-busy="true"
      aria-label="Loading…"
      className={cx("gg-card", className)}
      data-density={density}
      style={style}
    >
      <div className="gg-card__header">
        <Skeleton width="60%" />
        <Skeleton width="4.5rem" height="1.5rem" style={{ borderRadius: 999 }} />
      </div>
      <div className="gg-grid">
        {Array.from({ length: rows }, (_, i) => (
          <div className="gg-stat" key={i} style={{ gap: "0.375rem", display: "grid" }}>
            <Skeleton width="50%" height="0.625rem" />
            <Skeleton width="80%" />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Status dot ───────────────────────────────────────────────────── */

export interface StatusDotProps extends GlobiguardUIProps {
  tone: GlobiguardVisualTone;
}

export function StatusDot({ className, style, tone }: StatusDotProps) {
  return (
    <span
      className={cx("gg-status-dot", className)}
      data-tone={tone}
      role="presentation"
      style={style}
    />
  );
}

/* ─── Decision pipeline strip ──────────────────────────────────────── */

export interface PipelineStep {
  label: ReactNode;
  decision?: GlobiguardDecision | null;
}

export interface DecisionPipelineProps extends GlobiguardUIProps {
  steps: PipelineStep[];
}

export function DecisionPipeline({ className, steps, style }: DecisionPipelineProps) {
  return (
    <ol className={cx("gg-pipeline", className)} style={style}>
      {steps.map((step, i) => (
        <li
          className="gg-pipeline__step"
          data-decision={step.decision ?? undefined}
          key={i}
        >
          {step.label}
        </li>
      ))}
    </ol>
  );
}

/* ─── Scanned entity row ───────────────────────────────────────────── */

export interface ScannedEntity {
  category: string;
  value?: string | null;
  confidence?: number | null;
  redacted?: boolean;
}

export interface EntityTableProps extends GlobiguardUIProps {
  entities: ScannedEntity[];
  showConfidence?: boolean;
  showValues?: boolean;
}

function confidenceTone(score: number): GlobiguardVisualTone {
  if (score >= 0.85) return "danger";
  if (score >= 0.6) return "warning";
  return "neutral";
}

export function EntityTable({
  className,
  entities,
  showConfidence = true,
  showValues = false,
  style
}: EntityTableProps) {
  if (entities.length === 0) {
    return (
      <p className="gg-muted" style={style}>
        No entities detected.
      </p>
    );
  }

  return (
    <table className={cx("gg-entity-table", className)} style={style}>
      <thead>
        <tr>
          <th>Category</th>
          {showValues && <th>Value</th>}
          {showConfidence && <th>Confidence</th>}
        </tr>
      </thead>
      <tbody>
        {entities.map((entity, i) => (
          <tr key={i}>
            <td>
              <span className="gg-badge" data-tone="neutral">
                {entity.category}
              </span>
            </td>
            {showValues && (
              <td>
                {entity.redacted ? (
                  <code className="gg-code" aria-label="Redacted value">
                    [redacted]
                  </code>
                ) : entity.value ? (
                  <code className="gg-code">{entity.value}</code>
                ) : (
                  <span className="gg-muted">—</span>
                )}
              </td>
            )}
            {showConfidence && (
              <td>
                {typeof entity.confidence === "number" ? (
                  <span
                    className="gg-badge"
                    data-tone={confidenceTone(entity.confidence)}
                  >
                    {Math.round(entity.confidence * 100)}%
                  </span>
                ) : (
                  <span className="gg-muted">—</span>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── Scan evidence card ───────────────────────────────────────────── */

export interface ScanEvidenceCardProps extends GlobiguardUIProps {
  density?: "comfortable" | "compact";
  entities?: ScannedEntity[];
  error?: Error | null;
  loading?: boolean;
  scanId?: string | null;
  showEntityValues?: boolean;
  title?: ReactNode;
  triggeredAt?: string | null;
  workflowRunId?: string | null;
}

export function ScanEvidenceCard({
  className,
  density = "comfortable",
  entities = [],
  error = null,
  loading = false,
  scanId,
  showEntityValues = false,
  style,
  title = "Scan evidence",
  triggeredAt,
  workflowRunId
}: ScanEvidenceCardProps) {
  const tone: GlobiguardVisualTone =
    error ? "danger" : loading ? "neutral" : entities.length > 0 ? "warning" : "success";

  if (loading) {
    return <CardSkeleton className={className} density={density} style={style} />;
  }

  return (
    <section
      className={cx("gg-card", className)}
      data-density={density}
      data-globiguard-scan-evidence
      style={style}
    >
      <div className="gg-card__header">
        <div className="gg-stack" style={{ "--gg-stack-gap": "0.25rem" } as CSSProperties}>
          <h3 className="gg-card__title">{title}</h3>
          {triggeredAt && (
            <time className="gg-card__description" dateTime={triggeredAt}>
              {new Date(triggeredAt).toLocaleString()}
            </time>
          )}
        </div>
        <div className="gg-cluster">
          {error ? (
            <span className="gg-badge" data-tone="danger">
              <span className="gg-badge__dot" />
              Error
            </span>
          ) : (
            <span className="gg-badge" data-tone={tone}>
              <span className="gg-badge__dot" />
              {entities.length > 0
                ? `${entities.length} detected`
                : "Clean"}
            </span>
          )}
        </div>
      </div>

      {error ? (
        <p className="gg-card__description" role="alert">
          {error.message}
        </p>
      ) : (
        <EntityTable
          entities={entities}
          showValues={showEntityValues}
        />
      )}

      {(scanId || workflowRunId) && (
        <div className="gg-grid">
          {scanId && <div className="gg-stat"><span className="gg-stat__label">Scan ID</span><span className="gg-stat__value">{scanId}</span></div>}
          {workflowRunId && <div className="gg-stat"><span className="gg-stat__label">Run ID</span><span className="gg-stat__value">{workflowRunId}</span></div>}
        </div>
      )}
    </section>
  );
}

/* ─── Governance trace card ────────────────────────────────────────── */

export interface GovernanceTraceStep {
  id: string;
  label: ReactNode;
  occurredAt?: string | null;
  decision?: GlobiguardDecision | null;
  summary?: ReactNode;
}

export interface GovernanceTraceCardProps extends GlobiguardUIProps {
  correlationId?: string | null;
  density?: "comfortable" | "compact";
  error?: Error | null;
  loading?: boolean;
  steps?: GovernanceTraceStep[];
  title?: ReactNode;
}

export function GovernanceTraceCard({
  className,
  correlationId,
  density = "comfortable",
  error = null,
  loading = false,
  steps = [],
  style,
  title = "Governance trace"
}: GovernanceTraceCardProps) {
  if (loading) {
    return <CardSkeleton className={className} density={density} rows={4} style={style} />;
  }

  return (
    <section
      className={cx("gg-card", className)}
      data-density={density}
      data-globiguard-governance-trace
      style={style}
    >
      <div className="gg-card__header">
        <div className="gg-stack" style={{ "--gg-stack-gap": "0.25rem" } as CSSProperties}>
          <h3 className="gg-card__title">{title}</h3>
          {correlationId && (
            <p className="gg-card__description">
              Correlation: <code className="gg-code">{correlationId}</code>
            </p>
          )}
        </div>
        <span className="gg-badge" data-tone={error ? "danger" : steps.length > 0 ? "info" : "neutral"}>
          {error ? "Error" : `${steps.length} hop${steps.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {error ? (
        <p className="gg-card__description" role="alert">{error.message}</p>
      ) : steps.length === 0 ? (
        <p className="gg-card__description">No trace steps recorded.</p>
      ) : (
        <ol className="gg-timeline">
          {steps.map((step) => (
            <li
              className="gg-timeline__item"
              data-globiguard-replay-status={step.decision?.toLowerCase()}
              key={step.id}
            >
              <div className="gg-cluster">
                {step.occurredAt && (
                  <time className="gg-muted" dateTime={step.occurredAt}>
                    {new Date(step.occurredAt).toLocaleTimeString()}
                  </time>
                )}
                {step.decision && (
                  <span
                    className="gg-badge"
                    data-tone={
                      step.decision === "ALLOW" ? "success"
                        : step.decision === "BLOCK" ? "danger"
                        : step.decision === "QUEUE" ? "warning"
                        : "info"
                    }
                  >
                    {step.decision}
                  </span>
                )}
              </div>
              <strong style={{ fontSize: "0.875rem" }}>{step.label}</strong>
              {step.summary && (
                <p className="gg-card__description">{step.summary}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ─── Metric tile ──────────────────────────────────────────────────── */

export interface MetricTileProps extends GlobiguardUIProps {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  deltaTone?: GlobiguardVisualTone;
  loading?: boolean;
}

export function MetricTile({
  className,
  delta,
  deltaTone = "neutral",
  label,
  loading = false,
  style,
  value
}: MetricTileProps) {
  return (
    <div className={cx("gg-stat", className)} style={style}>
      <span className="gg-stat__label">{label}</span>
      {loading ? (
        <Skeleton width="60%" style={{ marginTop: "0.3rem" }} />
      ) : (
        <span className="gg-stat__value">{value}</span>
      )}
      {delta && !loading && (
        <span
          className="gg-badge"
          data-tone={deltaTone}
          style={{ marginTop: "0.375rem", alignSelf: "flex-start" }}
        >
          {delta}
        </span>
      )}
    </div>
  );
}

/* ─── Observability dashboard panel ────────────────────────────────── */

export interface ObservabilityMetrics {
  totalScans?: number | null;
  blockedCount?: number | null;
  queuedCount?: number | null;
  allowedCount?: number | null;
  blockRate?: number | null;
  p95LatencyMs?: number | null;
}

export interface ObservabilityPanelProps extends GlobiguardUIProps {
  density?: "comfortable" | "compact";
  error?: Error | null;
  loading?: boolean;
  metrics?: ObservabilityMetrics;
  title?: ReactNode;
}

function formatRate(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `${Math.round(ms)} ms`;
}

export function ObservabilityPanel({
  className,
  density = "comfortable",
  error = null,
  loading = false,
  metrics = {},
  style,
  title = "Observability"
}: ObservabilityPanelProps) {
  if (loading) {
    return <CardSkeleton className={className} density={density} rows={6} style={style} />;
  }

  const blockRateTone: GlobiguardVisualTone =
    !metrics.blockRate ? "neutral"
      : metrics.blockRate > 0.2 ? "danger"
      : metrics.blockRate > 0.05 ? "warning"
      : "success";

  return (
    <section
      className={cx("gg-card", className)}
      data-density={density}
      data-globiguard-observability-panel
      style={style}
    >
      <div className="gg-card__header">
        <h3 className="gg-card__title">{title}</h3>
        {error ? (
          <span className="gg-badge" data-tone="danger">Unavailable</span>
        ) : (
          <span className="gg-badge" data-tone="success">
            <span className="gg-badge__dot" />
            Live
          </span>
        )}
      </div>

      {error ? (
        <p className="gg-card__description" role="alert">{error.message}</p>
      ) : (
        <div className="gg-grid">
          <MetricTile label="Total scans" value={metrics.totalScans ?? "—"} />
          <MetricTile label="Allowed" value={metrics.allowedCount ?? "—"} />
          <MetricTile
            label="Blocked"
            value={metrics.blockedCount ?? "—"}
            delta={metrics.blockRate != null ? formatRate(metrics.blockRate) : undefined}
            deltaTone={blockRateTone}
          />
          <MetricTile label="Queued" value={metrics.queuedCount ?? "—"} />
          <MetricTile label="P95 latency" value={formatLatency(metrics.p95LatencyMs)} />
        </div>
      )}
    </section>
  );
}

/* ─── Scan gate banner ─────────────────────────────────────────────── */

export interface ScanGateBannerProps extends GlobiguardUIProps {
  decision: GlobiguardDecision | null | undefined;
  loading?: boolean;
  reason?: ReactNode;
}

export function ScanGateBanner({
  className,
  decision,
  loading = false,
  reason,
  style
}: ScanGateBannerProps) {
  if (loading) {
    return (
      <div
        className={cx("gg-card", className)}
        data-density="compact"
        style={style}
      >
        <div className="gg-cluster">
          <Skeleton width="1.25rem" height="1.25rem" style={{ borderRadius: 999 }} />
          <Skeleton width="40%" />
        </div>
      </div>
    );
  }

  if (!decision) return null;

  const tone: GlobiguardVisualTone =
    decision === "ALLOW" ? "success"
      : decision === "BLOCK" ? "danger"
      : decision === "QUEUE" ? "warning"
      : "info";

  const defaultReason: Record<GlobiguardDecision, string> = {
    ALLOW: "GlobiGuard cleared this action.",
    BLOCK: "GlobiGuard blocked this action.",
    QUEUE: "GlobiGuard queued this action for review.",
    MODIFY: "GlobiGuard requires modification before proceeding."
  };

  return (
    <div
      className={cx("gg-card", className)}
      data-density="compact"
      data-globiguard-scan-gate
      data-decision={decision}
      role={decision === "BLOCK" ? "alert" : undefined}
      style={style}
    >
      <div className="gg-cluster">
        <StatusDot tone={tone} />
        <span className="gg-badge" data-tone={tone}>{decision}</span>
        <span className="gg-card__description" style={{ flex: 1 }}>
          {reason ?? defaultReason[decision]}
        </span>
      </div>
    </div>
  );
}

/* ─── Approval chip ────────────────────────────────────────────────── */

export interface ApprovalChipProps extends GlobiguardUIProps {
  state: GlobiguardApprovalState;
  label?: ReactNode;
}

function approvalChipTone(state: GlobiguardApprovalState): GlobiguardVisualTone {
  switch (state) {
    case "APPROVED":
    case "NOT_REQUIRED":
      return "success";
    case "PENDING":
      return "warning";
    case "REJECTED":
    case "EXPIRED":
    case "CANCELLED":
      return "danger";
    default:
      return "neutral";
  }
}

export function ApprovalChip({ className, label, state, style }: ApprovalChipProps) {
  return (
    <span
      className={cx("gg-badge", className)}
      data-globiguard-approval-state={state}
      data-tone={approvalChipTone(state)}
      style={style}
    >
      <span className="gg-badge__dot" />
      {label ?? state}
    </span>
  );
}
