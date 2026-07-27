import {
  GLOBIGUARD_APPROVAL_STATES,
  GLOBIGUARD_DECISIONS,
  type GlobiguardActionAuthorizationRequest,
  type GlobiguardActionAuthorizationResponse,
  type GlobiguardAuditEvent,
  type GlobiguardEnvironment,
  type GlobiguardEvidencePackageSummary,
  type GlobiguardEvidenceRef,
  type GlobiguardIncidentReplay,
  type GlobiguardIncidentReplayLookupRequest,
  type GlobiguardPolicy,
  type GlobiguardQueueEntry,
} from "@globiguard/contracts";
import {
  createServerClient,
  type GlobiguardServerClient,
  type GlobiguardServerClientConfig,
} from "@globiguard/sdk";

import { assertPayloadSize, sha256, summarizePayload } from "./summarize.js";
import type {
  GovernedActionIntent,
  GovernanceDecisionEnvelope,
  ApprovalCheckEnvelope,
  ApprovalActionBinding,
} from "./types.js";

export interface AuthorityBackend {
  authorize(
    request: GlobiguardActionAuthorizationRequest,
  ): Promise<GlobiguardActionAuthorizationResponse>;
  getAuthorization(
    authorizationId: string,
  ): Promise<GlobiguardActionAuthorizationResponse>;
  getQueueEntry(queueEntryId: string): Promise<GlobiguardQueueEntry>;
  getEvidence(evidenceRefId: string): Promise<GlobiguardEvidenceRef>;
  getAuditEvent(auditEventId: string): Promise<GlobiguardAuditEvent>;
  getEvidencePackageSummary(
    evidencePackageId: string,
  ): Promise<GlobiguardEvidencePackageSummary>;
  getIncidentReplay(
    request: GlobiguardIncidentReplayLookupRequest,
  ): Promise<GlobiguardIncidentReplay>;
  listActivePolicies(): Promise<GlobiguardPolicy[]>;
  getPolicy(policyId: string): Promise<GlobiguardPolicy>;
}

export class GlobiguardAuthority {
  constructor(private readonly backend: AuthorityBackend) {}

  async govern(
    intent: GovernedActionIntent,
  ): Promise<GovernanceDecisionEnvelope> {
    assertIntent(intent);
    const payloadSummary =
      intent.payloadSummary ?? summarizePayload(intent.payload);
    if (payloadSummary.approxBytes !== undefined) {
      assertPayloadSize({
        sha256: payloadSummary.sha256 ?? sha256(""),
        approxBytes: payloadSummary.approxBytes,
        topLevelKeys: payloadSummary.topLevelKeys ?? [],
        topLevelValueKinds: payloadSummary.topLevelValueKinds ?? {},
        recordCount: payloadSummary.recordCount ?? 0,
        description:
          payloadSummary.description ?? "Precomputed payload summary",
      });
    }
    const idempotencyKey =
      intent.idempotencyKey ??
      deriveIntentIdempotencyKey(intent, payloadSummary.sha256);

    const response = await this.backend.authorize({
      context: {
        actionType: intent.actionType,
        destination: intent.destination,
        dataClasses: intent.dataClasses ?? ["INTERNAL"],
        fieldsInvolved: intent.fieldsInvolved,
        payloadSummary,
        actor: intent.actor ?? { type: "agent" },
        purpose: intent.purpose,
        workflowRunId: intent.workflowRunId,
        workflowStepId: intent.workflowStepId,
        correlationId: intent.correlationId,
        policyId: intent.policyId,
        idempotencyKey,
        approvalQueueEntryId: intent.approvalQueueEntryId,
        connector: intent.connector,
        metadata: {
          protocol: "mcp",
          riskScore: conservativeRiskScore(intent.riskScore),
          ...(intent.environmentSnapshotSha256
            ? { environmentSnapshotSha256: intent.environmentSnapshotSha256 }
            : {}),
        },
      },
      dryRun: intent.dryRun ?? false,
    });

    return decisionEnvelope(response, intent.dryRun ?? false);
  }

  async getAuthorization(
    authorizationId: string,
  ): Promise<GovernanceDecisionEnvelope> {
    if (!authorizationId.trim()) {
      throw new Error("authorizationId must be a non-empty string");
    }
    return historicalEnvelope(
      decisionEnvelope(await this.backend.getAuthorization(authorizationId)),
    );
  }

  async checkApproval(queueEntryId: string): Promise<ApprovalCheckEnvelope> {
    if (!queueEntryId.trim()) {
      throw new Error("queueEntryId must be a non-empty string");
    }
    return approvalEnvelope(await this.backend.getQueueEntry(queueEntryId));
  }

  async checkApprovalForAction(
    queueEntryId: string,
    binding: ApprovalActionBinding,
  ): Promise<ApprovalCheckEnvelope> {
    if (!queueEntryId.trim()) {
      throw new Error("queueEntryId must be a non-empty string");
    }
    const entry = await this.backend.getQueueEntry(queueEntryId);
    const payloadSha256 = queuePayloadSha256(entry);
    const matchesCurrentAction =
      entry.actionType === binding.actionType &&
      entry.destinationSystem === binding.destinationName &&
      payloadSha256 === binding.payloadSha256 &&
      (binding.policyId === undefined || entry.policyId === binding.policyId);
    const envelope = approvalEnvelope(entry);
    if (!matchesCurrentAction) {
      return {
        ...envelope,
        terminal: true,
        actionBinding: { matchesCurrentAction: false, payloadSha256 },
        next: {
          action: "do_not_execute",
          description:
            "The queue entry does not match the exact current action. Do not execute it; create a new authorization request.",
          retryable: false,
        },
      };
    }
    return {
      ...envelope,
      actionBinding: { matchesCurrentAction: true, payloadSha256 },
    };
  }

  getEvidence(evidenceRefId: string): Promise<GlobiguardEvidenceRef> {
    return this.backend.getEvidence(requiredId(evidenceRefId, "evidenceRefId"));
  }

  getAuditEvent(auditEventId: string): Promise<GlobiguardAuditEvent> {
    return this.backend.getAuditEvent(requiredId(auditEventId, "auditEventId"));
  }

  getEvidencePackageSummary(
    evidencePackageId: string,
  ): Promise<GlobiguardEvidencePackageSummary> {
    return this.backend.getEvidencePackageSummary(
      requiredId(evidencePackageId, "evidencePackageId"),
    );
  }

  getIncidentReplay(
    request: GlobiguardIncidentReplayLookupRequest,
  ): Promise<GlobiguardIncidentReplay> {
    const identifiers = Object.entries(request).filter(
      ([, value]) => typeof value === "string" && value.trim(),
    );
    if (identifiers.length !== 1) {
      throw new Error(
        "Incident replay requires exactly one non-empty lookup identifier",
      );
    }
    const [name, value] = identifiers[0]!;
    return this.backend.getIncidentReplay({ [name]: value.trim() });
  }

  listActivePolicies(): Promise<GlobiguardPolicy[]> {
    return this.backend.listActivePolicies();
  }

  getPolicy(policyId: string): Promise<GlobiguardPolicy> {
    if (!policyId.trim()) {
      throw new Error("policyId must be a non-empty string");
    }
    return this.backend.getPolicy(policyId);
  }
}

function approvalEnvelope(entry: GlobiguardQueueEntry): ApprovalCheckEnvelope {
  const resolved =
    entry.status === "APPROVED" || entry.status === "AUTO_APPROVED";
  const stopped =
    entry.status === "REJECTED" ||
    entry.status === "EXPIRED" ||
    entry.status === "FAILED" ||
    entry.status === "RESUMED";

  return {
    schemaVersion: "globiguard.approval-check.v1",
    queueEntryId: entry.id,
    authorizationId: entry.authorizationId ?? null,
    status: entry.status,
    canExecute: false,
    terminal: resolved || stopped,
    reasonCode: entry.reasonCode ?? null,
    // Human-entered notes can contain sensitive data or prompt injection.
    // The authority status surface exposes only their presence.
    reviewNotes: null,
    reviewNotesPresent: Boolean(entry.reviewNotes),
    resolvedAt: entry.resolvedAt ?? null,
    next: resolved
      ? {
          action: "reauthorize_action",
          description:
            "Approval resolved. Reauthorize the exact current action before executing it.",
          retryable: true,
        }
      : stopped
        ? {
            action: "do_not_execute",
            description:
              entry.status === "RESUMED"
                ? "This approval was already consumed by an execution handoff. Do not call the downstream tool again."
                : "Approval did not permit this action. Do not call the downstream tool.",
            retryable: false,
          }
        : {
            action: "check_again",
            description:
              "Approval is still pending. Keep the action paused and check again later.",
            retryable: true,
          },
  };
}

function queuePayloadSha256(entry: GlobiguardQueueEntry): string {
  const value = entry.payloadSummary.sha256;
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)
    ? value.toLowerCase()
    : "unavailable";
}

export function createSdkAuthority(
  config: GlobiguardServerClientConfig,
): GlobiguardAuthority {
  return new GlobiguardAuthority(createSdkBackend(createServerClient(config)));
}

export function createSdkBackend(
  client: GlobiguardServerClient,
): AuthorityBackend {
  return {
    authorize: (request) => client.actions.authorize(request),
    getAuthorization: (authorizationId) =>
      client.actions.getAuthorization(authorizationId),
    getQueueEntry: (queueEntryId) => client.queue.get(queueEntryId),
    getEvidence: (evidenceRefId) => client.actions.getEvidence(evidenceRefId),
    getAuditEvent: (auditEventId) => client.audit.get(auditEventId),
    getEvidencePackageSummary: (evidencePackageId) =>
      client.audit.getEvidencePackageSummary(evidencePackageId),
    getIncidentReplay: (request) => client.audit.getIncidentReplay(request),
    listActivePolicies: () => client.policies.list({ active: true }),
    getPolicy: (policyId) => client.policies.get(policyId),
  };
}

export function deriveIntentIdempotencyKey(
  intent: GovernedActionIntent,
  payloadSha256?: string,
): string {
  return `gg_mcp_${sha256(
    [
      intent.actor?.id ?? "anonymous-agent",
      intent.actor?.type ?? "agent",
      intent.actionType,
      intent.destination.type,
      intent.destination.name,
      intent.destination.resource ?? "",
      intent.destination.tenantId ?? "",
      intent.destination.region ?? "",
      intent.purpose,
      intent.policyId ?? "",
      intent.workflowRunId ?? "",
      intent.workflowStepId ?? "",
      intent.approvalQueueEntryId ?? "",
      intent.connector?.instanceId ?? "",
      intent.connector?.manifestVersion ?? "",
      intent.connector?.schemaSha256 ?? "",
      intent.environmentSnapshotSha256 ?? "",
      intent.dryRun ? "dry-run" : "execute",
      payloadSha256 ?? "no-payload-hash",
    ].join("\u001f"),
  ).slice(0, 48)}`;
}

export function createAuthorityFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): GlobiguardAuthority {
  const runtimeEnvironment = parseEnvironment(
    environment.GLOBIGUARD_ENVIRONMENT ?? "sandbox",
  );
  const target =
    environment.GLOBIGUARD_CONTROL_PLANE_URL?.trim() ||
    (runtimeEnvironment === "local"
      ? "http://127.0.0.1:3000"
      : "https://api.globiguard.com");
  const local = runtimeEnvironment === "local";

  return createSdkAuthority({
    clientName: "@globiguard/mcp-server",
    environment: runtimeEnvironment,
    credential: local
      ? {
          kind: "local",
          ...(environment.GLOBIGUARD_SECRET_KEY
            ? { token: environment.GLOBIGUARD_SECRET_KEY }
            : {}),
        }
      : {
          kind: "secret",
          projectId: required(environment, "GLOBIGUARD_PROJECT_ID"),
          token: required(environment, "GLOBIGUARD_SECRET_KEY"),
          environment: runtimeEnvironment,
        },
    services: {
      controlPlane: target,
    },
    requestTimeoutMs: optionalBoundedInteger(
      environment,
      "GLOBIGUARD_REQUEST_TIMEOUT_MS",
      10_000,
      300_000,
    ),
  });
}

export function decisionEnvelope(
  response: GlobiguardActionAuthorizationResponse,
  simulation = false,
): GovernanceDecisionEnvelope {
  assertAuthorizationResponse(response);
  const reasonSummary =
    response.reason?.trim() || defaultReason(response.decision);
  const codes = reasonSummary
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);

  switch (response.decision) {
    case "ALLOW":
      if (simulation) {
        return baseEnvelope(
          response,
          "wait",
          false,
          {
            action: "authorize_for_execution",
            description:
              "This was a simulation. Request a non-dry-run authorization over the exact action before execution.",
            retryable: true,
          },
          reasonSummary,
          [...codes, "DRY_RUN_ONLY"],
          true,
        );
      }
      if (
        response.executable !== true ||
        response.nextAction !== "EXECUTE_EXACT_ACTION_ONCE"
      ) {
        return baseEnvelope(
          response,
          "wait",
          false,
          {
            action: "authorize_for_execution",
            description:
              "The control plane marked this response as non-executable. Follow its next action and request a fresh authorization before execution.",
            retryable: true,
          },
          reasonSummary,
          [...codes, "CONTROL_PLANE_MARKED_NON_EXECUTABLE"],
          false,
        );
      }
      if (!authorizationExpiryIsCurrent(response.expiresAt)) {
        return baseEnvelope(
          response,
          "wait",
          false,
          {
            action: "authorize_for_execution",
            description:
              "The authorization is expired or has no valid bounded expiry. Request a new authorization immediately before execution.",
            retryable: true,
          },
          reasonSummary,
          [...codes, "AUTHORIZATION_EXPIRY_INVALID"],
          false,
        );
      }
      if (
        response.approvalState !== "NOT_REQUIRED" &&
        response.approvalState !== "APPROVED"
      ) {
        return baseEnvelope(
          response,
          "wait",
          false,
          {
            action: "check_approval",
            description:
              "The authorization has not reached an executable approval state. Keep the action stopped and verify approval before requesting a fresh authorization.",
            retryable: true,
          },
          reasonSummary,
          [...codes, "APPROVAL_STATE_NOT_EXECUTABLE"],
          false,
        );
      }
      if ((response.obligations?.length ?? 0) > 0) {
        return baseEnvelope(
          response,
          "revise",
          false,
          {
            action: "apply_changes_and_reauthorize",
            description:
              "The policy returned obligations that are not yet enforced. Apply them through typed handlers and authorize the resulting action again.",
            retryable: true,
          },
          reasonSummary,
          [...codes, "UNFULFILLED_OBLIGATIONS"],
          false,
        );
      }
      if (
        response.modifications &&
        Object.keys(response.modifications).length > 0
      ) {
        return baseEnvelope(
          response,
          "revise",
          false,
          {
            action: "apply_changes_and_reauthorize",
            description:
              "The authorization includes unresolved modifications. Apply them to the real action and authorize the resulting exact payload again.",
            retryable: true,
          },
          reasonSummary,
          [...codes, "UNAPPLIED_MODIFICATIONS"],
          false,
        );
      }
      return baseEnvelope(
        response,
        "proceed",
        true,
        {
          action: "execute_now",
          description:
            "Execute the exact authorized action now. Material changes require a new authorization.",
          retryable: false,
        },
        reasonSummary,
        codes,
        false,
      );
    case "MODIFY":
      return baseEnvelope(
        response,
        "revise",
        false,
        {
          action: "apply_changes_and_reauthorize",
          description:
            "Apply the required changes, rebuild the payload, and request a new authorization before execution.",
          retryable: true,
        },
        reasonSummary,
        simulation ? [...codes, "DRY_RUN_ONLY"] : codes,
        simulation,
      );
    case "QUEUE":
      if (simulation) {
        return baseEnvelope(
          response,
          "wait",
          false,
          {
            action: "authorize_for_execution",
            description:
              "The simulated decision requires review. Request a non-dry-run authorization to create the approval request.",
            retryable: true,
          },
          reasonSummary,
          [...codes, "DRY_RUN_ONLY"],
          true,
        );
      }
      return baseEnvelope(
        response,
        "wait",
        false,
        {
          action: "check_approval",
          description:
            "The action is held for review. Do not execute it until approval is resolved and the action is reauthorized when required.",
          approvalId: response.approval?.id,
          queueEntryId: response.queueEntryId ?? undefined,
          retryable: true,
        },
        reasonSummary,
        codes,
        false,
      );
    case "BLOCK":
      return baseEnvelope(
        response,
        "stop",
        false,
        {
          action: "do_not_execute",
          description:
            "The policy blocked this action. Do not call the downstream tool.",
          retryable: false,
        },
        reasonSummary,
        simulation ? [...codes, "DRY_RUN_ONLY"] : codes,
        simulation,
      );
  }
}

function assertAuthorizationResponse(
  response: GlobiguardActionAuthorizationResponse,
): void {
  const raw = response as unknown as Record<string, unknown>;
  if (!raw || typeof raw !== "object") {
    throw new TypeError("Authorization response must be an object");
  }
  if (
    typeof raw.decision !== "string" ||
    !(GLOBIGUARD_DECISIONS as readonly string[]).includes(raw.decision)
  ) {
    throw new TypeError("Authorization response has an unknown decision");
  }
  if (
    typeof raw.approvalState !== "string" ||
    !(GLOBIGUARD_APPROVAL_STATES as readonly string[]).includes(
      raw.approvalState,
    )
  ) {
    throw new TypeError("Authorization response has an unknown approval state");
  }
  if (typeof raw.authorizationId !== "string" || !raw.authorizationId.trim()) {
    throw new TypeError("Authorization response has no authorization ID");
  }
  if (!Array.isArray(raw.evidenceRefs)) {
    throw new TypeError("Authorization response evidenceRefs must be an array");
  }
  if (typeof raw.executable !== "boolean") {
    throw new TypeError(
      "Authorization response must include an explicit executable boolean",
    );
  }
  if (
    typeof raw.nextAction !== "string" ||
    ![
      "EXECUTE_EXACT_ACTION_ONCE",
      "WAIT_FOR_APPROVAL",
      "REAUTHORIZE_EXACT_ACTION",
      "APPLY_MODIFICATIONS_AND_REAUTHORIZE",
      "REQUEST_FRESH_AUTHORIZATION",
      "STOP",
    ].includes(raw.nextAction)
  ) {
    throw new TypeError(
      "Authorization response must include a recognized explicit next action",
    );
  }
  if (
    raw.modifications !== undefined &&
    raw.modifications !== null &&
    (typeof raw.modifications !== "object" || Array.isArray(raw.modifications))
  ) {
    throw new TypeError(
      "Authorization response modifications must be an object",
    );
  }
}

function baseEnvelope(
  response: GlobiguardActionAuthorizationResponse,
  outcome: GovernanceDecisionEnvelope["outcome"],
  canExecute: boolean,
  next: GovernanceDecisionEnvelope["next"],
  reasonSummary: string,
  codes: string[],
  simulation: boolean,
): GovernanceDecisionEnvelope {
  return {
    schemaVersion: "globiguard.agent-decision.v1",
    simulation,
    outcome,
    canExecute,
    decision: response.decision,
    approvalState: response.approvalState,
    authorizationId: response.authorizationId,
    correlationId: response.correlationId ?? null,
    queueEntryId: response.queueEntryId ?? null,
    reason: {
      summary: reasonSummary,
      codes,
    },
    obligations: response.obligations ?? [],
    modifications: response.modifications ?? null,
    evidence: response.evidenceRefs,
    expiresAt: response.expiresAt ?? null,
    next,
  };
}

function historicalEnvelope(
  envelope: GovernanceDecisionEnvelope,
): GovernanceDecisionEnvelope {
  if (!envelope.canExecute) {
    return envelope;
  }
  return {
    ...envelope,
    outcome: "wait",
    canExecute: false,
    reason: {
      summary:
        "This is a historical authorization record, not a fresh execution permit.",
      codes: [
        ...envelope.reason.codes,
        "HISTORICAL_AUTHORIZATION_REQUIRES_REAUTHORIZATION",
      ],
    },
    next: {
      action: "authorize_for_execution",
      description:
        "Authorize the exact current action again immediately before execution.",
      retryable: true,
    },
  };
}

function defaultReason(
  decision: GlobiguardActionAuthorizationResponse["decision"],
): string {
  return `ACTION_${decision}`;
}

function assertIntent(intent: GovernedActionIntent): void {
  if (!intent.actionType?.trim()) {
    throw new Error("actionType must be a non-empty string");
  }
  if (!intent.destination?.name?.trim()) {
    throw new Error("destination.name must be a non-empty string");
  }
  if (!intent.purpose?.trim()) {
    throw new Error("purpose must be a non-empty string");
  }
  if (
    intent.environmentSnapshotSha256 &&
    !/^[a-f0-9]{64}$/i.test(intent.environmentSnapshotSha256)
  ) {
    throw new Error("environmentSnapshotSha256 must be a SHA-256 hex digest");
  }
  if (
    intent.payloadSummary &&
    !/^[a-f0-9]{64}$/i.test(intent.payloadSummary.sha256)
  ) {
    throw new Error("payloadSummary.sha256 must be a SHA-256 hex digest");
  }
  if (intent.payload !== undefined && intent.payloadSummary) {
    throw new Error("Provide payload or payloadSummary, not both");
  }
  if (
    intent.approvalQueueEntryId !== undefined &&
    (!intent.approvalQueueEntryId.trim() ||
      intent.approvalQueueEntryId.length > 256)
  ) {
    throw new Error("approvalQueueEntryId must be a non-empty bounded string");
  }
  if (
    intent.connector?.schemaSha256 !== undefined &&
    !/^[a-f0-9]{64}$/i.test(intent.connector.schemaSha256)
  ) {
    throw new Error("connector.schemaSha256 must be a SHA-256 hex digest");
  }
}

function clampRiskScore(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function conservativeRiskScore(value: number | undefined): number {
  return Math.max(0.7, clampRiskScore(value));
}

function authorizationExpiryIsCurrent(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  const expiresAt = Date.parse(value);
  const remainingMs = expiresAt - Date.now();
  return (
    Number.isFinite(expiresAt) &&
    remainingMs > 0 &&
    remainingMs <= 5 * 60 * 1000
  );
}

function optionalBoundedInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  maximum: number,
): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 through ${maximum}`);
  }
  return value;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requiredId(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must be a non-empty string`);
  return normalized;
}

function parseEnvironment(value: string): GlobiguardEnvironment {
  if (value === "local" || value === "sandbox" || value === "live") {
    return value;
  }
  throw new Error("GLOBIGUARD_ENVIRONMENT must be local, sandbox, or live");
}
