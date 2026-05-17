import type {
  GlobiguardActionAuthorizationRequest,
  GlobiguardActionAuthorizationResponse,
  GlobiguardActionsClient,
  GlobiguardApproval,
  GlobiguardApprovalCreateRequest,
  GlobiguardAuditClient,
  GlobiguardEvidenceListRequest,
  GlobiguardEvidencePackageSummary,
  GlobiguardEvidenceRef,
  GlobiguardIncidentReplay,
  GlobiguardIncidentReplayLookupRequest,
  GlobiguardQueueEntry,
  GlobiguardQueueReadClient
} from "@globiguard/contracts";

import { GlobiguardAuthorityError, GlobiguardConfigError } from "./errors.js";

export interface GlobiguardGovernedActionRuntimeConfig {
  actions: GlobiguardActionsClient;
  audit: GlobiguardAuditClient;
  queue: GlobiguardQueueReadClient;
}

export interface GlobiguardWaitForApprovalOptions {
  queueEntryId: string;
  signal?: AbortSignal;
  maxAttempts?: number;
  intervalMs?: number;
}

export interface GlobiguardIdempotencyKeyInput {
  stableSeed: string;
  actionType: string;
  actorId?: string;
  payloadSha256?: string;
  windowBucket?: string;
}

export interface GlobiguardGovernedActionsClient {
  authorizeAction(
    request: GlobiguardActionAuthorizationRequest
  ): Promise<GlobiguardActionAuthorizationResponse>;
  authorizeActionOrThrow(
    request: GlobiguardActionAuthorizationRequest
  ): Promise<GlobiguardActionAuthorizationResponse>;
  requestApproval(request: GlobiguardApprovalCreateRequest): Promise<GlobiguardApproval>;
  getApprovalStatus(approvalId: string): Promise<GlobiguardApproval>;
  getEvidenceReferences(
    request?: GlobiguardEvidenceListRequest
  ): Promise<GlobiguardEvidenceRef[]>;
  exportEvidencePackage(
    request?: Parameters<GlobiguardAuditClient["export"]>[0]
  ): ReturnType<GlobiguardAuditClient["export"]>;
  getEvidencePackageSummary(
    evidencePackageId: string
  ): Promise<GlobiguardEvidencePackageSummary>;
  getIncidentReplay(
    request: GlobiguardIncidentReplayLookupRequest
  ): Promise<GlobiguardIncidentReplay>;
  waitForApproval(options: GlobiguardWaitForApprovalOptions): Promise<GlobiguardQueueEntry>;
}

export function createGovernedActionsClient(
  config: GlobiguardGovernedActionRuntimeConfig
): GlobiguardGovernedActionsClient {
  return {
    authorizeAction(request) {
      return config.actions.authorize(request);
    },

    async authorizeActionOrThrow(request) {
      const decision = await config.actions.authorize(request);
      if (decision.decision === "BLOCK") {
        throw new GlobiguardAuthorityError({
          kind: "POLICY_BLOCKED",
          message: "GlobiGuard blocked the governed action.",
          authorizationId: decision.authorizationId,
          queueEntryId: decision.queueEntryId,
          safeDetails: {
            decision: decision.decision,
            reason: decision.reason ?? null
          }
        });
      }

      if (decision.decision === "QUEUE") {
        throw new GlobiguardAuthorityError({
          kind: "QUEUED_FOR_REVIEW",
          message:
            "GlobiGuard queued the governed action for review; do not perform the downstream business action yet.",
          authorizationId: decision.authorizationId,
          queueEntryId: decision.queueEntryId,
          safeDetails: {
            decision: decision.decision,
            approvalState: decision.approvalState
          }
        });
      }

      return decision;
    },

    requestApproval(request) {
      return config.actions.createApproval(request);
    },

    getApprovalStatus(approvalId) {
      return config.actions.getApproval(approvalId);
    },

    getEvidenceReferences(request) {
      return config.actions.listEvidence(request);
    },

    exportEvidencePackage(request) {
      return config.audit.export(request);
    },

    getEvidencePackageSummary(evidencePackageId) {
      return config.audit.getEvidencePackageSummary(evidencePackageId);
    },

    getIncidentReplay(request) {
      return config.audit.getIncidentReplay(request);
    },

    waitForApproval(options) {
      return waitForApproval(config.queue, options);
    }
  };
}

export async function deriveActionIdempotencyKey(
  input: GlobiguardIdempotencyKeyInput
): Promise<string> {
  assertNonEmpty("stableSeed", input.stableSeed);
  assertNonEmpty("actionType", input.actionType);

  const payload = JSON.stringify({
    stableSeed: input.stableSeed,
    actionType: input.actionType,
    actorId: input.actorId ?? null,
    payloadSha256: input.payloadSha256 ?? null,
    windowBucket: input.windowBucket ?? null
  });
  const digest = await digestSha256(payload);

  return `gg_idem_${digest.slice(0, 48)}`;
}

export function generateCorrelationId(): string {
  const cryptoImpl = globalThis.crypto;
  if (!cryptoImpl?.getRandomValues) {
    throw new GlobiguardConfigError(
      "A Web Crypto getRandomValues implementation is required to generate correlation IDs."
    );
  }

  const bytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(bytes);

  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function waitForApproval(
  queue: GlobiguardQueueReadClient,
  options: GlobiguardWaitForApprovalOptions
): Promise<GlobiguardQueueEntry> {
  const maxAttempts = options.maxAttempts ?? 60;
  const intervalMs = options.intervalMs ?? 1000;

  if (maxAttempts < 1) {
    throw new GlobiguardConfigError("maxAttempts must be at least 1.");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw new GlobiguardAuthorityError({
        kind: "QUEUED_FOR_REVIEW",
        message: "Approval wait was aborted while the action remained queued.",
        queueEntryId: options.queueEntryId
      });
    }

    const entry = await queue.get(options.queueEntryId);
    if (entry.status === "APPROVED" || entry.status === "AUTO_APPROVED") {
      return entry;
    }

    if (entry.status === "REJECTED" || entry.status === "EXPIRED") {
      throw new GlobiguardAuthorityError({
        kind: "POLICY_BLOCKED",
        message: `Queued action resolved as ${entry.status}; do not perform the downstream business action.`,
        queueEntryId: entry.id,
        safeDetails: {
          status: entry.status
        }
      });
    }

    if (attempt < maxAttempts) {
      await sleep(intervalMs, options.signal);
    }
  }

  throw new GlobiguardAuthorityError({
    kind: "QUEUED_FOR_REVIEW",
    message:
      "Queued action is still pending after the configured wait attempts; do not perform the downstream business action yet.",
    queueEntryId: options.queueEntryId
  });
}

async function digestSha256(value: string): Promise<string> {
  const cryptoImpl = globalThis.crypto;
  if (!cryptoImpl?.subtle) {
    throw new GlobiguardConfigError(
      "A Web Crypto subtle implementation is required to derive idempotency keys."
    );
  }

  const digest = await cryptoImpl.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return bytesToHex(new Uint8Array(digest));
}

function assertNonEmpty(name: string, value: string): void {
  if (!value.trim()) {
    throw new GlobiguardConfigError(`${name} must be a non-empty string.`);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(
          new GlobiguardAuthorityError({
            kind: "QUEUED_FOR_REVIEW",
            message: "Approval wait was aborted while the action remained queued."
          })
        );
      },
      { once: true }
    );
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

