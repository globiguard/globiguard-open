import type { GlobiguardDecision } from "./decision.js";
import type { GlobiguardBrowserSafeContract } from "./authority.js";

export const GLOBIGUARD_ACTION_CONTRACT_VERSION = "2026-04-action-beta" as const;

export const GLOBIGUARD_DATA_CLASSES = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
  "PII",
  "PHI",
  "PCI",
  "SECRET"
] as const;

export type GlobiguardDataClass = (typeof GLOBIGUARD_DATA_CLASSES)[number];

export const GLOBIGUARD_DESTINATION_SYSTEM_TYPES = [
  "email",
  "crm",
  "slack",
  "webhook",
  "database",
  "ticketing",
  "storage",
  "custom"
] as const;

export type GlobiguardDestinationSystemType =
  (typeof GLOBIGUARD_DESTINATION_SYSTEM_TYPES)[number];

export const GLOBIGUARD_APPROVAL_STATES = [
  "NOT_REQUIRED",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED"
] as const;

export type GlobiguardApprovalState =
  (typeof GLOBIGUARD_APPROVAL_STATES)[number];

export const GLOBIGUARD_ACTION_GATEWAY_MODES = [
  "control_plane",
  "sidecar",
  "gateway"
] as const;

export type GlobiguardActionGatewayMode =
  (typeof GLOBIGUARD_ACTION_GATEWAY_MODES)[number];

export interface GlobiguardDestinationSystem {
  type: GlobiguardDestinationSystemType;
  name: string;
  resource?: string;
  tenantId?: string;
  region?: string;
  metadata?: Record<string, unknown>;
}

export interface GlobiguardActionActor {
  id?: string;
  type?: "human" | "agent" | "service" | "workflow";
  displayName?: string;
}

export interface GlobiguardActionPayloadSummary {
  sha256?: string;
  approxBytes?: number;
  topLevelKeys?: string[];
  topLevelValueKinds?: Record<string, string>;
  fieldTypes?: string[];
  recordCount?: number;
  description?: string;
}

export interface GlobiguardActionContext {
  actionType: string;
  destination: GlobiguardDestinationSystem;
  dataClasses: GlobiguardDataClass[];
  payloadSummary?: GlobiguardActionPayloadSummary;
  fieldsInvolved?: string[];
  actor?: GlobiguardActionActor;
  purpose?: string;
  workflowRunId?: string;
  workflowStepId?: string;
  policyId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface GlobiguardEvidenceRef {
  id: string;
  uri: string;
  label?: string;
  kind?: "audit_event" | "approval" | "policy" | "workflow" | "external";
  checksum?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface GlobiguardApproval {
  id: string;
  authorizationId?: string;
  queueEntryId?: string | null;
  state: GlobiguardApprovalState;
  requestedBy?: string | null;
  reviewedBy?: string | null;
  reviewNotes?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  resolvedAt?: string | null;
  expiresAt?: string | null;
}

export interface GlobiguardActionDecision {
  authorizationId: string;
  decision: GlobiguardDecision;
  approvalState: GlobiguardApprovalState;
  approval?: GlobiguardApproval | null;
  queueEntryId?: string | null;
  evidenceRefs: GlobiguardEvidenceRef[];
  reason?: string;
  obligations?: string[];
  modifications?: Record<string, unknown>;
  expiresAt?: string | null;
  correlationId?: string | null;
}

export interface GlobiguardActionDecisionSummary
  extends GlobiguardBrowserSafeContract {
  authorizationId: string;
  decision: GlobiguardDecision;
  approvalState: GlobiguardApprovalState;
  queueEntryId?: string | null;
  evidenceRefCount: number;
  reason?: string;
  expiresAt?: string | null;
  correlationId?: string | null;
}

export interface GlobiguardActionAuthorizationRequest {
  context: GlobiguardActionContext;
  dryRun?: boolean;
}

export interface GlobiguardActionAuthorizationResponse
  extends GlobiguardActionDecision {
  contractVersion: typeof GLOBIGUARD_ACTION_CONTRACT_VERSION | string;
}

export interface GlobiguardApprovalCreateRequest {
  authorizationId: string;
  requestedBy?: string;
  reason?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface GlobiguardApprovalStatusRequest {
  approvalId: string;
}

export interface GlobiguardEvidenceListRequest {
  authorizationId?: string;
  approvalId?: string;
  workflowRunId?: string;
}

export interface GlobiguardActionGatewayConfig {
  mode: GlobiguardActionGatewayMode;
  decisionSubscription?: {
    realtimeRequired?: boolean;
    channelPrefix?: string;
  };
}

export interface GlobiguardResolvedActionGatewayConfig
  extends GlobiguardActionGatewayConfig {
  baseUrl: string;
}

export interface GlobiguardActionsReadClient {
  getAuthorization(
    authorizationId: string
  ): Promise<GlobiguardActionAuthorizationResponse>;
  getApproval(approvalId: string): Promise<GlobiguardApproval>;
  listEvidence(
    request?: GlobiguardEvidenceListRequest
  ): Promise<GlobiguardEvidenceRef[]>;
  getEvidence(evidenceRefId: string): Promise<GlobiguardEvidenceRef>;
}

export interface GlobiguardActionsClient extends GlobiguardActionsReadClient {
  authorize(
    request: GlobiguardActionAuthorizationRequest
  ): Promise<GlobiguardActionAuthorizationResponse>;
  createApproval(
    request: GlobiguardApprovalCreateRequest
  ): Promise<GlobiguardApproval>;
}
