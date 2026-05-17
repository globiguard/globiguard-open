import {
  useCallback,
  useEffect,
  useMemo,
  useState,
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

export interface PolicyDecisionBadgeProps {
  decision: GlobiguardDecision;
  labels?: Partial<Record<GlobiguardDecision, ReactNode>>;
}

export function PolicyDecisionBadge({
  decision,
  labels
}: PolicyDecisionBadgeProps) {
  return (
    <span data-globiguard-decision={decision}>
      {labels?.[decision] ?? decision}
    </span>
  );
}

export interface ApprovalStatusBadgeProps {
  state: GlobiguardApprovalState;
  labels?: Partial<Record<GlobiguardApprovalState, ReactNode>>;
}

export function ApprovalStatusBadge({
  state,
  labels
}: ApprovalStatusBadgeProps) {
  return (
    <span data-globiguard-approval-state={state}>
      {labels?.[state] ?? state}
    </span>
  );
}

export interface ApprovalStatusCardProps {
  approval: GlobiguardApproval | null;
  error?: Error | null;
  loading?: boolean;
  fallback?: ReactNode;
}

export function ApprovalStatusCard({
  approval,
  error = null,
  loading = false,
  fallback = "Approval status unavailable."
}: ApprovalStatusCardProps) {
  if (error) {
    return <section role="alert">{error.message}</section>;
  }

  if (loading && !approval) {
    return <section aria-busy="true">Loading approval status...</section>;
  }

  if (!approval) {
    return <section data-globiguard-degraded>{fallback}</section>;
  }

  return (
    <section data-globiguard-approval-card>
      <ApprovalStatusBadge state={approval.state} />
      <p>
        {approval.state === "PENDING"
          ? "The action is waiting for human review."
          : `Review state: ${approval.state}.`}
      </p>
      {approval.reviewedBy ? <p>Reviewed by {approval.reviewedBy}</p> : null}
    </section>
  );
}

export interface ApprovalStatusProps {
  approvalId: string;
  fallback?: ReactNode;
}

export function ApprovalStatus({
  approvalId,
  fallback = "Loading approval..."
}: ApprovalStatusProps) {
  const approval = useApprovalStatus(approvalId);

  if (approval.loading && !approval.data) {
    return <>{fallback}</>;
  }

  if (approval.error) {
    return <span role="alert">{approval.error.message}</span>;
  }

  if (!approval.data) {
    return null;
  }

  return <ApprovalStatusBadge state={approval.data.state} />;
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

export interface EvidenceLinksProps {
  evidenceRefs: GlobiguardEvidenceRef[];
  renderLabel?: (evidenceRef: GlobiguardEvidenceRef) => ReactNode;
}

export function EvidenceLinks({
  evidenceRefs,
  renderLabel
}: EvidenceLinksProps) {
  if (evidenceRefs.length === 0) {
    return null;
  }

  return (
    <ul data-globiguard-evidence-links>
      {evidenceRefs.map((evidenceRef) => (
        <li key={evidenceRef.id}>
          <a href={getEvidenceHref(evidenceRef)} rel="noreferrer">
            {renderLabel?.(evidenceRef) ?? evidenceRef.label ?? evidenceRef.uri}
          </a>
        </li>
      ))}
    </ul>
  );
}

export interface EvidencePackageSummaryProps {
  summary: GlobiguardEvidencePackageSummaryContract | null;
  error?: Error | null;
  loading?: boolean;
}

export function EvidencePackageSummary({
  summary,
  error = null,
  loading = false
}: EvidencePackageSummaryProps) {
  if (error) {
    return <section role="alert">Evidence unavailable: {error.message}</section>;
  }

  if (loading && !summary) {
    return <section aria-busy="true">Loading evidence package...</section>;
  }

  if (!summary) {
    return (
      <section data-globiguard-evidence-unavailable>
        Evidence package metadata is not available yet.
      </section>
    );
  }

  return (
    <section data-globiguard-evidence-package={summary.evidencePackageId}>
      <strong>Evidence package {summary.status}</strong>
      <p>
        {summary.redaction.mode} redaction; raw payload included:{" "}
        {String(summary.redaction.rawPayloadIncluded)}
      </p>
      {summary.integrity ? (
        <p>
          {summary.integrity.checksumAlgorithm}: {summary.integrity.checksum}
        </p>
      ) : null}
      <p>{summary.sourceRefs.length} source reference(s)</p>
      {summary.artifact?.uri ? (
        <a href={summary.artifact.uri} rel="noreferrer">
          Download metadata-safe artifact
        </a>
      ) : null}
    </section>
  );
}

export interface IncidentReplayTimelineProps {
  replay: GlobiguardIncidentReplay | null;
  error?: Error | null;
  loading?: boolean;
}

export function IncidentReplayTimeline({
  replay,
  error = null,
  loading = false
}: IncidentReplayTimelineProps) {
  if (error) {
    return <section role="alert">Incident replay unavailable: {error.message}</section>;
  }

  if (loading && !replay) {
    return <section aria-busy="true">Loading incident replay...</section>;
  }

  if (!replay) {
    return (
      <section data-globiguard-replay-unavailable>
        Incident replay is not available yet.
      </section>
    );
  }

  return (
    <section data-globiguard-incident-replay={replay.incidentReplayId}>
      <strong>{replay.complete ? "Replay complete" : "Replay incomplete"}</strong>
      <ol>
        {replay.timeline.map((entry) => (
          <li key={entry.id} data-globiguard-replay-status={entry.status}>
            <span>{entry.occurredAt}</span> - <strong>{entry.title}</strong>
            {entry.summary ? <p>{entry.summary}</p> : null}
          </li>
        ))}
      </ol>
      {replay.gaps.length > 0 ? (
        <ul data-globiguard-replay-gaps>
          {replay.gaps.map((gap) => (
            <li key={gap.id}>
              {gap.expectedKind}: {gap.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export interface QueuedActionNoticeProps {
  queueEntryId?: string | null;
  reason?: ReactNode;
}

export function QueuedActionNotice({
  queueEntryId,
  reason = "GlobiGuard queued this action for review. Do not perform the downstream business action yet."
}: QueuedActionNoticeProps) {
  return (
    <section data-globiguard-queued-action>
      <strong>Queued for review</strong>
      <p>{reason}</p>
      {queueEntryId ? <p>Queue entry: {queueEntryId}</p> : null}
    </section>
  );
}

export interface GovernedActionBoundaryProps {
  decision: GlobiguardActionAuthorizationResponse | null | undefined;
  loading?: boolean;
  error?: Error | null;
  stale?: boolean;
  children: ReactNode;
  blockedFallback?: ReactNode;
  queuedFallback?: ReactNode;
  modifiedFallback?: ReactNode;
  degradedFallback?: ReactNode;
}

export function GovernedActionBoundary({
  decision,
  loading = false,
  error = null,
  stale = false,
  children,
  blockedFallback,
  queuedFallback,
  modifiedFallback,
  degradedFallback = "GlobiGuard cannot verify this action right now, so the protected action is disabled."
}: GovernedActionBoundaryProps) {
  if (error || stale || loading || !decision) {
    return (
      <section data-globiguard-fail-closed role={error ? "alert" : undefined}>
        {error ? error.message : degradedFallback}
      </section>
    );
  }

  if (decision.decision === "ALLOW") {
    return <>{children}</>;
  }

  if (decision.decision === "MODIFY") {
    return (
      <section data-globiguard-modified-action>
        {modifiedFallback ?? "GlobiGuard requires modified action terms before continuation."}
      </section>
    );
  }

  if (decision.decision === "QUEUE") {
    return (
      <>
        {queuedFallback ?? (
          <QueuedActionNotice
            queueEntryId={decision.queueEntryId}
            reason={decision.reason}
          />
        )}
      </>
    );
  }

  return (
    <section data-globiguard-blocked-action>
      {blockedFallback ?? decision.reason ?? "GlobiGuard blocked this action."}
    </section>
  );
}

export interface GovernedActionSubmitButtonProps {
  request: GlobiguardActionAuthorizationRequest;
  submitAction: GlobiguardGovernedActionSubmitter;
  children?: ReactNode;
  disabled?: boolean;
  onDecision?: (decision: GlobiguardActionAuthorizationResponse) => void;
}

export function GovernedActionSubmitButton({
  request,
  submitAction,
  children = "Check with GlobiGuard",
  disabled = false,
  onDecision
}: GovernedActionSubmitButtonProps) {
  const submission = useGovernedActionSubmission(submitAction);

  return (
    <button
      type="button"
      disabled={disabled || submission.loading}
      onClick={() => {
        void submission.submit(request).then((decision) => {
          if (decision) {
            onDecision?.(decision);
          }
        });
      }}
    >
      {submission.loading ? "Checking..." : children}
    </button>
  );
}
