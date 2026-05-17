import type { GlobiguardDecision } from "./decision.js";

export const GLOBIGUARD_AUTHORITY_CONTRACT_VERSION =
  "2026-05-authority-beta" as const;

export const GLOBIGUARD_PUBLIC_API_FAMILIES = [
  "actions.v1",
  "audit.v1",
  "queue.v1",
  "webhooks.v1"
] as const;

export type GlobiguardPublicApiFamily =
  (typeof GLOBIGUARD_PUBLIC_API_FAMILIES)[number];

export const GLOBIGUARD_AUTHORITY_LEVELS = [
  "browser_read",
  "server_authority",
  "webhook_receiver",
  "internal_only"
] as const;

export type GlobiguardAuthorityLevel =
  (typeof GLOBIGUARD_AUTHORITY_LEVELS)[number];

export interface GlobiguardContractCompatibility {
  contractVersion: typeof GLOBIGUARD_AUTHORITY_CONTRACT_VERSION | string;
  apiFamily: GlobiguardPublicApiFamily;
  minControlPlaneVersion?: string;
  stability: "beta" | "stable" | "deprecated";
}

export const GLOBIGUARD_AUTHORITY_COMPATIBILITY = {
  contractVersion: GLOBIGUARD_AUTHORITY_CONTRACT_VERSION,
  apiFamilies: GLOBIGUARD_PUBLIC_API_FAMILIES,
  stability: "beta"
} as const;

export interface GlobiguardAuthorityBoundary {
  authorityLevel: GlobiguardAuthorityLevel;
  browserSafe: boolean;
  serverSecretRequired: boolean;
  rawPayloadAllowed: boolean;
}

export interface GlobiguardBrowserSafeContract {
  boundary: {
    authorityLevel: "browser_read";
    browserSafe: true;
    serverSecretRequired: false;
    rawPayloadAllowed: false;
  };
}

export interface GlobiguardServerAuthorityContract {
  boundary: {
    authorityLevel: "server_authority";
    browserSafe: false;
    serverSecretRequired: true;
    rawPayloadAllowed: false;
  };
}

export const GLOBIGUARD_BROWSER_READ_BOUNDARY =
  Object.freeze<GlobiguardBrowserSafeContract["boundary"]>({
    authorityLevel: "browser_read",
    browserSafe: true,
    serverSecretRequired: false,
    rawPayloadAllowed: false
  });

export const GLOBIGUARD_SERVER_AUTHORITY_BOUNDARY =
  Object.freeze<GlobiguardServerAuthorityContract["boundary"]>({
    authorityLevel: "server_authority",
    browserSafe: false,
    serverSecretRequired: true,
    rawPayloadAllowed: false
  });

export const GLOBIGUARD_SDK_ERROR_KINDS = [
  "POLICY_BLOCKED",
  "QUEUED_FOR_REVIEW",
  "STEP_UP_REQUIRED",
  "PERMISSION_REQUIRED",
  "EVIDENCE_UNAVAILABLE",
  "REPLAY_INCOMPLETE",
  "RATE_LIMITED",
  "MISCONFIGURED_CLIENT_BOUNDARY",
  "CONTROL_PLANE_UNAVAILABLE",
  "WEBHOOK_VERIFICATION_FAILED"
] as const;

export type GlobiguardSdkErrorKind =
  (typeof GLOBIGUARD_SDK_ERROR_KINDS)[number];

export interface GlobiguardSdkErrorShape {
  kind: GlobiguardSdkErrorKind;
  message: string;
  authorizationId?: string;
  queueEntryId?: string | null;
  evidencePackageId?: string;
  retryAfterSeconds?: number;
  safeDetails?: Record<string, string | number | boolean | null>;
}

export const GLOBIGUARD_EVIDENCE_SUMMARY_SCHEMA_VERSION =
  "2026-05-evidence-summary-beta" as const;

export const GLOBIGUARD_REDACTION_MODES = [
  "metadata_only",
  "masked_fields",
  "customer_managed_raw"
] as const;

export type GlobiguardRedactionMode =
  (typeof GLOBIGUARD_REDACTION_MODES)[number];

export interface GlobiguardEvidenceIntegrity {
  checksumAlgorithm: "sha256";
  checksum: string;
  signedAt?: string;
  signerKeyId?: string;
}

export interface GlobiguardEvidenceRedactionSummary {
  mode: GlobiguardRedactionMode;
  rawPayloadIncluded: false;
  maskedFieldCount?: number;
  fieldTypes?: string[];
}

export interface GlobiguardEvidenceSourceReference {
  kind:
    | "audit_event"
    | "approval"
    | "policy_version"
    | "workflow_run"
    | "queue_entry"
    | "control_mapping";
  id: string;
  uri?: string;
  checksum?: string;
}

export interface GlobiguardEvidencePackageSummary
  extends GlobiguardBrowserSafeContract {
  schemaVersion: typeof GLOBIGUARD_EVIDENCE_SUMMARY_SCHEMA_VERSION | string;
  evidencePackageId: string;
  status: "ready" | "pending" | "unavailable";
  generatedAt?: string;
  scope: {
    from?: string | null;
    to?: string | null;
    workflowRunId?: string | null;
    frameworkId?: string | null;
  };
  decisionCounts: Partial<Record<GlobiguardDecision, number>>;
  integrity?: GlobiguardEvidenceIntegrity;
  redaction: GlobiguardEvidenceRedactionSummary;
  sourceRefs: GlobiguardEvidenceSourceReference[];
  artifact?: {
    delivery: "download_url" | "object_ref" | "inline_json";
    uri?: string;
    expiresAt?: string;
    approxBytes?: number;
  };
  disclaimers: string[];
}

export interface GlobiguardEvidenceExportDescriptor {
  evidencePackageId: string;
  summary: GlobiguardEvidencePackageSummary;
  artifact?: {
    delivery: "download_url" | "object_ref" | "inline_json";
    uri?: string;
    checksum: string;
    expiresAt?: string;
    approxBytes?: number;
  };
}

