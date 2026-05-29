import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";

import type {
  GlobiguardActionAuthorizationRequest,
  GlobiguardActionAuthorizationResponse,
  GlobiguardApproval,
  GlobiguardApprovalState,
  GlobiguardDecision,
  GlobiguardEvidencePackageSummary as GlobiguardEvidencePackageSummaryContract,
  GlobiguardEvidenceListRequest,
  GlobiguardEvidenceRef,
  GlobiguardIncidentReplay,
  GlobiguardIncidentReplayLookupRequest,
  GlobiguardTrustWebhookVerificationResult
} from "@globiguard/contracts";

import { useGlobiguardClient } from "./provider.js";

export interface GlobiguardAsyncState<TValue> {
  data: TValue | null;
  error: Error | null;
  loading: boolean;
  refresh(): Promise<TValue | null>;
}

export interface GlobiguardHookOptions {
  enabled?: boolean;
}

export function useApprovalStatus(
  approvalId: string | null | undefined,
  options: GlobiguardHookOptions = {}
): GlobiguardAsyncState<GlobiguardApproval> {
  const client = useGlobiguardClient();
  const enabled = options.enabled ?? true;
  const [approval, setApproval] = useState<GlobiguardApproval | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !approvalId) {
      setApproval(null);
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const nextApproval = await client.actions.getApproval(approvalId);
      setApproval(nextApproval);
      return nextApproval;
    } catch (caught) {
      const nextError = caught instanceof Error ? caught : new Error(String(caught));
      setError(nextError);
      return null;
    } finally {
      setLoading(false);
    }
  }, [approvalId, client, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data: approval,
    error,
    loading,
    refresh
  };
}

export function useEvidenceRefs(
  request?: GlobiguardEvidenceListRequest,
  options: GlobiguardHookOptions = {}
): GlobiguardAsyncState<GlobiguardEvidenceRef[]> {
  const client = useGlobiguardClient();
  const enabled = options.enabled ?? true;
  const [evidenceRefs, setEvidenceRefs] = useState<GlobiguardEvidenceRef[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const stableRequest = useMemo(
    () => request,
    [request?.approvalId, request?.authorizationId, request?.workflowRunId]
  );

  const refresh = useCallback(async () => {
    if (!enabled) {
      setEvidenceRefs(null);
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const nextEvidenceRefs = await client.actions.listEvidence(stableRequest);
      setEvidenceRefs(nextEvidenceRefs);
      return nextEvidenceRefs;
    } catch (caught) {
      const nextError = caught instanceof Error ? caught : new Error(String(caught));
      setError(nextError);
      return null;
    } finally {
      setLoading(false);
    }
  }, [client, enabled, stableRequest]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data: evidenceRefs,
    error,
    loading,
    refresh
  };
}

export function useActionDecision(
  authorizationId: string | null | undefined,
  options: GlobiguardHookOptions = {}
): GlobiguardAsyncState<GlobiguardActionAuthorizationResponse> {
  const client = useGlobiguardClient();
  const enabled = options.enabled ?? true;
  const [decision, setDecision] =
    useState<GlobiguardActionAuthorizationResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !authorizationId) {
      setDecision(null);
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const nextDecision = await client.actions.getAuthorization(authorizationId);
      setDecision(nextDecision);
      return nextDecision;
    } catch (caught) {
      const nextError = caught instanceof Error ? caught : new Error(String(caught));
      setError(nextError);
      return null;
    } finally {
      setLoading(false);
    }
  }, [authorizationId, client, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data: decision,
    error,
    loading,
    refresh
  };
}

export function useEvidencePackage(
  evidencePackageId: string | null | undefined,
  options: GlobiguardHookOptions = {}
): GlobiguardAsyncState<GlobiguardEvidencePackageSummaryContract> {
  const client = useGlobiguardClient();
  const enabled = options.enabled ?? true;
  const [summary, setSummary] =
    useState<GlobiguardEvidencePackageSummaryContract | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !evidencePackageId) {
      setSummary(null);
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const nextSummary =
        await client.audit.getEvidencePackageSummary(evidencePackageId);
      setSummary(nextSummary);
      return nextSummary;
    } catch (caught) {
      const nextError = caught instanceof Error ? caught : new Error(String(caught));
      setError(nextError);
      return null;
    } finally {
      setLoading(false);
    }
  }, [client, enabled, evidencePackageId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data: summary,
    error,
    loading,
    refresh
  };
}

export function useIncidentReplay(
  request: GlobiguardIncidentReplayLookupRequest | null | undefined,
  options: GlobiguardHookOptions = {}
): GlobiguardAsyncState<GlobiguardIncidentReplay> {
  const client = useGlobiguardClient();
  const enabled = options.enabled ?? true;
  const [replay, setReplay] = useState<GlobiguardIncidentReplay | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const stableRequest = useMemo(
    () => request,
    [
      request?.auditEventId,
      request?.authorizationId,
      request?.correlationId,
      request?.queueEntryId,
      request?.workflowRunId
    ]
  );

  const refresh = useCallback(async () => {
    if (!enabled || !stableRequest) {
      setReplay(null);
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const nextReplay = await client.audit.getIncidentReplay(stableRequest);
      setReplay(nextReplay);
      return nextReplay;
    } catch (caught) {
      const nextError = caught instanceof Error ? caught : new Error(String(caught));
      setError(nextError);
      return null;
    } finally {
      setLoading(false);
    }
  }, [client, enabled, stableRequest]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data: replay,
    error,
    loading,
    refresh
  };
}

export function useTrustWebhookVerificationResult(
  result: GlobiguardTrustWebhookVerificationResult | null | undefined
) {
  return useMemo(
    () => ({
      result: result ?? null,
      verified: result?.ok === true,
      failed: result?.ok === false,
      duplicateDelivery: result?.ok === true ? result.duplicateDelivery : false,
      message:
        result?.ok === false
          ? result.error.message
          : result?.ok === true
            ? "Verified GlobiGuard webhook delivery."
            : "No webhook verification result yet."
    }),
    [result]
  );
}

export type GlobiguardGovernedActionSubmitter = (
  request: GlobiguardActionAuthorizationRequest
) => Promise<GlobiguardActionAuthorizationResponse>;

export interface GlobiguardGovernedActionSubmissionState {
  decision: GlobiguardActionAuthorizationResponse | null;
  error: Error | null;
  loading: boolean;
  submit(
    request: GlobiguardActionAuthorizationRequest
  ): Promise<GlobiguardActionAuthorizationResponse | null>;
}

export function useGovernedActionSubmission(
  submitAction: GlobiguardGovernedActionSubmitter
): GlobiguardGovernedActionSubmissionState {
  const [decision, setDecision] =
    useState<GlobiguardActionAuthorizationResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = useCallback(
    async (request: GlobiguardActionAuthorizationRequest) => {
      setLoading(true);
      setError(null);
      try {
        const nextDecision = await submitAction(request);
        setDecision(nextDecision);
        return nextDecision;
      } catch (caught) {
        const nextError = caught instanceof Error ? caught : new Error(String(caught));
        setError(nextError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [submitAction]
  );

  return {
    decision,
    error,
    loading,
    submit
  };
}

export type GlobiguardVisualTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type GlobiguardDensity = "comfortable" | "compact";

export interface GlobiguardComponentStyleProps {
  className?: string;
  style?: CSSProperties;
}

function cx(...values: Array<string | false | null | undefined>): string | undefined {
  const className = values.filter(Boolean).join(" ");
  return className || undefined;
}

function decisionTone(decision: GlobiguardDecision): GlobiguardVisualTone {
  switch (decision) {
    case "ALLOW":
        return "success";
    case "MODIFY":
        return "info";
    case "QUEUE":
        return "warning";
    case "BLOCK":
        return "danger";
    default:
        return "neutral";
  }
}

function approvalTone(state: GlobiguardApprovalState): GlobiguardVisualTone {
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

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function Stat({
  label,
  value
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="gg-stat">
        <span className="gg-stat__label">{label}</span>
        <span className="gg-stat__value">{value}</span>
    </div>
  );
}

export interface PolicyDecisionBadgeProps extends GlobiguardComponentStyleProps {
  decision: GlobiguardDecision;
  labels?: Partial<Record<GlobiguardDecision, ReactNode>>;
  tone?: GlobiguardVisualTone;
}

export function PolicyDecisionBadge({
  decision,
  labels,
  className,
  style,
  tone = decisionTone(decision)
}: PolicyDecisionBadgeProps) {
  return (
    <span
        className={cx("gg-badge", className)}
        data-globiguard-decision={decision}
        data-tone={tone}
        style={style}
    >
        {labels?.[decision] ?? decision}
    </span>
  );
}

export interface ApprovalStatusBadgeProps extends GlobiguardComponentStyleProps {
  state: GlobiguardApprovalState;
  labels?: Partial<Record<GlobiguardApprovalState, ReactNode>>;
  tone?: GlobiguardVisualTone;
}

export function ApprovalStatusBadge({
  state,
  labels,
  className,
  style,
  tone = approvalTone(state)
}: ApprovalStatusBadgeProps) {
  return (
    <span
        className={cx("gg-badge", className)}
        data-globiguard-approval-state={state}
        data-tone={tone}
        style={style}
    >
        {labels?.[state] ?? state}
    </span>
  );
}

export interface ApprovalStatusCardProps extends GlobiguardComponentStyleProps {
  approval: GlobiguardApproval | null;
  density?: GlobiguardDensity;
  error?: Error | null;
  loading?: boolean;
  fallback?: ReactNode;
  title?: ReactNode;
}

export function ApprovalStatusCard({
  approval,
  className,
  density = "comfortable",
  error = null,
  fallback = "Approval status unavailable.",
  loading = false,
  style,
  title = "Approval status"
}: ApprovalStatusCardProps) {
  if (error) {
    return (
        <section
          className={cx("gg-card", className)}
          data-density={density}
          role="alert"
          style={style}
        >
          <div className="gg-card__header">
            <h3 className="gg-card__title">{title}</h3>
            <span className="gg-badge" data-tone="danger">
              Error
            </span>
          </div>
          <p className="gg-card__description">{error.message}</p>
        </section>
    );
  }

  if (loading && !approval) {
    return (
        <section
          aria-busy="true"
          className={cx("gg-card", className)}
          data-density={density}
          style={style}
        >
          <h3 className="gg-card__title">{title}</h3>
          <p className="gg-card__description">Loading approval status...</p>
        </section>
    );
  }

  if (!approval) {
    return (
        <section
          className={cx("gg-card", className)}
          data-density={density}
          data-globiguard-degraded
          style={style}
        >
          <h3 className="gg-card__title">{title}</h3>
          <p className="gg-card__description">{fallback}</p>
        </section>
    );
  }

  return (
    <section
        className={cx("gg-card", className)}
        data-density={density}
        data-globiguard-approval-card
        style={style}
    >
        <div className="gg-card__header">
          <div className="gg-stack">
            <h3 className="gg-card__title">{title}</h3>
            <p className="gg-card__description">
              {approval.state === "PENDING"
                ? "The action is waiting for human review."
                : `Review state: ${approval.state}.`}
            </p>
          </div>
          <ApprovalStatusBadge state={approval.state} />
        </div>
        <div className="gg-grid">
          <Stat label="Approval ID" value={approval.id} />
          <Stat label="Created" value={formatDateTime(approval.createdAt)} />
          <Stat label="Updated" value={formatDateTime(approval.updatedAt)} />
          <Stat label="Resolved" value={formatDateTime(approval.resolvedAt)} />
        </div>
        {approval.reviewedBy ? (
          <p className="gg-card__description">Reviewed by {approval.reviewedBy}</p>
        ) : null}
        {approval.reviewNotes ? (
          <p className="gg-card__description">{approval.reviewNotes}</p>
        ) : null}
    </section>
  );
}

export interface ApprovalStatusProps extends GlobiguardComponentStyleProps {
  approvalId: string;
  fallback?: ReactNode;
}

export function ApprovalStatus({
  approvalId,
  className,
  fallback = "Loading approval...",
  style
}: ApprovalStatusProps) {
  const approval = useApprovalStatus(approvalId);

  if (approval.loading && !approval.data) {
    return (
        <span className={cx("gg-muted", className)} style={style}>
          {fallback}
        </span>
    );
  }

  if (approval.error) {
    return (
        <span className={className} role="alert" style={style}>
          {approval.error.message}
        </span>
    );
  }

  if (!approval.data) {
    return null;
  }

  return (
    <ApprovalStatusBadge
        className={className}
        state={approval.data.state}
        style={style}
    />
  );
}

export function getEvidenceHref(evidenceRef: GlobiguardEvidenceRef): string {
  try {
    const parsedUri = new URL(evidenceRef.uri);
    if (["evidence:", "https:", "http:", "urn:"].includes(parsedUri.protocol)) {
        return evidenceRef.uri;
    }
  } catch {
    return "#";
  }

  return "#";
}

export interface EvidenceLinksProps extends GlobiguardComponentStyleProps {
  evidenceRefs: GlobiguardEvidenceRef[];
  renderLabel?: (evidenceRef: GlobiguardEvidenceRef) => ReactNode;
}

export function EvidenceLinks({
  evidenceRefs,
  renderLabel,
  className,
  style
}: EvidenceLinksProps) {
  if (evidenceRefs.length === 0) {
    return null;
  }

  return (
    <ul
        className={cx("gg-list", className)}
        data-globiguard-evidence-links
        style={style}
    >
        {evidenceRefs.map((evidenceRef) => (
          <li key={evidenceRef.id}>
            <a
              className="gg-link"
              href={getEvidenceHref(evidenceRef)}
              rel="noreferrer"
            >
              {renderLabel?.(evidenceRef) ?? evidenceRef.label ?? evidenceRef.uri}
            </a>
          </li>
        ))}
    </ul>
  );
}

export interface EvidencePackageSummaryProps extends GlobiguardComponentStyleProps {
  density?: GlobiguardDensity;
  error?: Error | null;
  loading?: boolean;
  summary: GlobiguardEvidencePackageSummaryContract | null;
  title?: ReactNode;
}

export function EvidencePackageSummary({
  className,
  density = "comfortable",
  error = null,
  loading = false,
  style,
  summary,
  title = "Evidence package"
}: EvidencePackageSummaryProps) {
  if (error) {
    return (
        <section
          className={cx("gg-card", className)}
          data-density={density}
          role="alert"
          style={style}
        >
          <h3 className="gg-card__title">{title}</h3>
          <p className="gg-card__description">Evidence unavailable: {error.message}</p>
        </section>
    );
  }

  if (loading && !summary) {
    return (
        <section
          aria-busy="true"
          className={cx("gg-card", className)}
          data-density={density}
          style={style}
        >
          <h3 className="gg-card__title">{title}</h3>
          <p className="gg-card__description">Loading evidence package...</p>
        </section>
    );
  }

  if (!summary) {
    return (
        <section
          className={cx("gg-card", className)}
          data-density={density}
          data-globiguard-evidence-unavailable
          style={style}
        >
          <h3 className="gg-card__title">{title}</h3>
          <p className="gg-card__description">
            Evidence package metadata is not available yet.
          </p>
        </section>
    );
  }

  const decisionEntries = Object.entries(summary.decisionCounts).filter(
    ([, count]) => typeof count === "number" && count > 0
  );

  return (
    <section
        className={cx("gg-card", className)}
        data-density={density}
        data-globiguard-evidence-package={summary.evidencePackageId}
        style={style}
    >
        <div className="gg-card__header">
          <div className="gg-stack">
            <h3 className="gg-card__title">{title}</h3>
            <p className="gg-card__description">
              Metadata-safe artifact summary with raw payload status and provenance
              counts.
            </p>
          </div>
          <span className="gg-badge" data-tone="info">
            {summary.status}
          </span>
        </div>
        <div className="gg-grid">
          <Stat label="Evidence ID" value={summary.evidencePackageId} />
          <Stat label="Redaction" value={summary.redaction.mode} />
          <Stat
            label="Raw payload included"
            value={String(summary.redaction.rawPayloadIncluded)}
          />
          <Stat label="Source refs" value={summary.sourceRefs.length} />
        </div>
        {decisionEntries.length > 0 ? (
          <div className="gg-cluster" aria-label="Decision counts">
            {decisionEntries.map(([decision, count]) => (
              <PolicyDecisionBadge
                key={decision}
                decision={decision as GlobiguardDecision}
                labels={{ [decision]: `${decision}: ${count}` }}
              />
            ))}
          </div>
        ) : null}
        {summary.integrity ? (
          <p className="gg-card__description">
            Integrity: {summary.integrity.checksumAlgorithm}{" "}
            <code className="gg-code">{summary.integrity.checksum}</code>
          </p>
        ) : null}
        {summary.artifact?.uri ? (
          <a className="gg-link" href={summary.artifact.uri} rel="noreferrer">
            Download metadata-safe artifact
          </a>
        ) : null}
        {summary.disclaimers.length > 0 ? (
          <ul className="gg-list">
            {summary.disclaimers.map((disclaimer) => (
              <li className="gg-card__description" key={disclaimer}>
                {disclaimer}
              </li>
            ))}
          </ul>
        ) : null}
    </section>
  );
}

export interface IncidentReplayTimelineProps
  extends GlobiguardComponentStyleProps {
  density?: GlobiguardDensity;
  error?: Error | null;
  loading?: boolean;
  replay: GlobiguardIncidentReplay | null;
  title?: ReactNode;
}

export function IncidentReplayTimeline({
  className,
  density = "comfortable",
  error = null,
  loading = false,
  replay,
  style,
  title = "Incident replay"
}: IncidentReplayTimelineProps) {
  if (error) {
    return (
        <section
          className={cx("gg-card", className)}
          data-density={density}
          role="alert"
          style={style}
        >
          <h3 className="gg-card__title">{title}</h3>
          <p className="gg-card__description">
            Incident replay unavailable: {error.message}
          </p>
        </section>
    );
  }

  if (loading && !replay) {
    return (
        <section
          aria-busy="true"
          className={cx("gg-card", className)}
          data-density={density}
          style={style}
        >
          <h3 className="gg-card__title">{title}</h3>
          <p className="gg-card__description">Loading incident replay...</p>
        </section>
    );
  }

  if (!replay) {
    return (
        <section
          className={cx("gg-card", className)}
          data-density={density}
          data-globiguard-replay-unavailable
          style={style}
        >
          <h3 className="gg-card__title">{title}</h3>
          <p className="gg-card__description">Incident replay is not available yet.</p>
        </section>
    );
  }

  return (
    <section
        className={cx("gg-card", className)}
        data-density={density}
        data-globiguard-incident-replay={replay.incidentReplayId}
        style={style}
    >
        <div className="gg-card__header">
          <div className="gg-stack">
            <h3 className="gg-card__title">{title}</h3>
            <p className="gg-card__description">
              {replay.complete ? "Replay complete" : "Replay incomplete"}
            </p>
          </div>
          <span className="gg-badge" data-tone={replay.complete ? "success" : "warning"}>
            {replay.complete ? "Complete" : "Incomplete"}
          </span>
        </div>
        <div className="gg-grid">
          <Stat label="Replay ID" value={replay.incidentReplayId} />
          <Stat label="Generated" value={formatDateTime(replay.generatedAt)} />
          <Stat label="Timeline events" value={replay.timeline.length} />
          <Stat label="Gaps" value={replay.gaps.length} />
        </div>
        {replay.timeline.length > 0 ? (
          <ol className="gg-timeline">
            {replay.timeline.map((entry) => (
              <li
                className="gg-timeline__item"
                key={entry.id}
                data-globiguard-replay-status={entry.status}
              >
                <div className="gg-cluster">
                  <time className="gg-muted" dateTime={entry.occurredAt}>
                    {formatDateTime(entry.occurredAt)}
                  </time>
                  <span className="gg-badge" data-tone="neutral">
                    {entry.status}
                  </span>
                  {entry.decision ? (
                    <PolicyDecisionBadge decision={entry.decision} />
                  ) : null}
                </div>
                <strong>{entry.title}</strong>
                {entry.summary ? (
                  <p className="gg-card__description">{entry.summary}</p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="gg-card__description">No timeline events are available yet.</p>
        )}
        {replay.gaps.length > 0 ? (
          <ul className="gg-list" data-globiguard-replay-gaps>
            {replay.gaps.map((gap) => (
              <li className="gg-stat" key={gap.id}>
                <span className="gg-stat__label">{gap.expectedKind}</span>
                <span className="gg-stat__value">{gap.reason}</span>
                {gap.remediation ? (
                  <span className="gg-card__description">{gap.remediation}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {replay.disclaimers.length > 0 ? (
          <ul className="gg-list">
            {replay.disclaimers.map((disclaimer) => (
              <li className="gg-card__description" key={disclaimer}>
                {disclaimer}
              </li>
            ))}
          </ul>
        ) : null}
    </section>
  );
}

export interface QueuedActionNoticeProps extends GlobiguardComponentStyleProps {
  density?: GlobiguardDensity;
  queueEntryId?: string | null;
  reason?: ReactNode;
  title?: ReactNode;
}

export function QueuedActionNotice({
  className,
  density = "comfortable",
  queueEntryId,
  reason = "GlobiGuard queued this action for review. Do not perform the downstream business action yet.",
  style,
  title = "Queued for review"
}: QueuedActionNoticeProps) {
  return (
    <section
        className={cx("gg-card", className)}
        data-density={density}
        data-globiguard-queued-action
        style={style}
    >
        <div className="gg-card__header">
          <div className="gg-stack">
            <h3 className="gg-card__title">{title}</h3>
            <p className="gg-card__description">{reason}</p>
          </div>
          <span className="gg-badge" data-tone="warning">
            Queue
          </span>
        </div>
        {queueEntryId ? (
          <div className="gg-grid">
            <Stat label="Queue entry" value={queueEntryId} />
          </div>
        ) : null}
    </section>
  );
}

export interface GovernedActionBoundaryProps
  extends GlobiguardComponentStyleProps {
  blockedFallback?: ReactNode;
  children: ReactNode;
  decision: GlobiguardActionAuthorizationResponse | null | undefined;
  degradedFallback?: ReactNode;
  density?: GlobiguardDensity;
  error?: Error | null;
  loading?: boolean;
  modifiedFallback?: ReactNode;
  queuedFallback?: ReactNode;
  stale?: boolean;
}

export function GovernedActionBoundary({
  decision,
  loading = false,
  error = null,
  stale = false,
  children,
  blockedFallback,
  className,
  density = "comfortable",
  queuedFallback,
  modifiedFallback,
  degradedFallback = "GlobiGuard cannot verify this action right now, so the protected action is disabled.",
  style
}: GovernedActionBoundaryProps) {
  if (error || stale || loading || !decision) {
    return (
        <section
          className={cx("gg-card", className)}
          data-density={density}
          data-globiguard-fail-closed
          role={error ? "alert" : undefined}
          style={style}
        >
          <div className="gg-card__header">
            <h3 className="gg-card__title">Action unavailable</h3>
            <span className="gg-badge" data-tone="danger">
              Fail closed
            </span>
          </div>
          <p className="gg-card__description">
            {error ? error.message : degradedFallback}
          </p>
        </section>
    );
  }

  if (decision.decision === "ALLOW") {
    return <>{children}</>;
  }

  if (decision.decision === "MODIFY") {
    return (
        <section
          className={cx("gg-card", className)}
          data-density={density}
          data-globiguard-modified-action
          style={style}
        >
          <div className="gg-card__header">
            <h3 className="gg-card__title">Modification required</h3>
            <PolicyDecisionBadge decision={decision.decision} />
          </div>
          <p className="gg-card__description">
            {modifiedFallback ??
              "GlobiGuard requires modified action terms before continuation."}
          </p>
        </section>
    );
  }

  if (decision.decision === "QUEUE") {
    return (
        <>
          {queuedFallback ?? (
            <QueuedActionNotice
              density={density}
              queueEntryId={decision.queueEntryId}
              reason={decision.reason}
            />
          )}
        </>
    );
  }

  return (
    <section
        className={cx("gg-card", className)}
        data-density={density}
        data-globiguard-blocked-action
        style={style}
    >
        <div className="gg-card__header">
          <h3 className="gg-card__title">Action blocked</h3>
          <PolicyDecisionBadge decision={decision.decision} />
        </div>
        <p className="gg-card__description">
          {blockedFallback ?? decision.reason ?? "GlobiGuard blocked this action."}
        </p>
    </section>
  );
}

export interface GovernedActionSubmitButtonProps
  extends GlobiguardComponentStyleProps {
  children?: ReactNode;
  disabled?: boolean;
  loadingLabel?: ReactNode;
  onDecision?: (decision: GlobiguardActionAuthorizationResponse) => void;
  request: GlobiguardActionAuthorizationRequest;
  submitAction: GlobiguardGovernedActionSubmitter;
}

export function GovernedActionSubmitButton({
  request,
  submitAction,
  children = "Check with GlobiGuard",
  className,
  disabled = false,
  loadingLabel = "Checking...",
  onDecision,
  style
}: GovernedActionSubmitButtonProps) {
  const submission = useGovernedActionSubmission(submitAction);

  return (
    <button
        className={cx("gg-button", className)}
        type="button"
        disabled={disabled || submission.loading}
        style={style}
        onClick={() => {
          void submission.submit(request).then((decision) => {
            if (decision) {
              onDecision?.(decision);
            }
          });
        }}
    >
        {submission.loading ? loadingLabel : children}
    </button>
  );
}
