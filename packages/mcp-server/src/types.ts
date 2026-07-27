import type {
  GlobiguardActionAuthorizationResponse,
  GlobiguardActionConnectorBinding,
  GlobiguardDataClass,
  GlobiguardDestinationSystemType,
  GlobiguardEvidenceRef,
  GlobiguardQueueStatus,
} from "@globiguard/contracts";

export const AUTHORITY_OUTCOMES = [
  "proceed",
  "revise",
  "wait",
  "stop",
] as const;

export type AuthorityOutcome = (typeof AUTHORITY_OUTCOMES)[number];

export interface GovernedActionIntent {
  actionType: string;
  destination: {
    type: GlobiguardDestinationSystemType;
    name: string;
    resource?: string;
    tenantId?: string;
    region?: string;
  };
  purpose: string;
  dataClasses?: GlobiguardDataClass[];
  fieldsInvolved?: string[];
  actor?: {
    id?: string;
    type?: "human" | "agent" | "service" | "workflow";
    displayName?: string;
  };
  payload?: unknown;
  payloadSummary?: {
    sha256: string;
    approxBytes?: number;
    topLevelKeys?: string[];
    topLevelValueKinds?: Record<string, string>;
    fieldTypes?: string[];
    recordCount?: number;
    description?: string;
  };
  policyId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  workflowRunId?: string;
  workflowStepId?: string;
  approvalQueueEntryId?: string;
  connector?: GlobiguardActionConnectorBinding;
  riskScore?: number;
  environmentSnapshotSha256?: string;
  dryRun?: boolean;
}

export interface AuthorityNextStep {
  action:
    | "execute_now"
    | "authorize_for_execution"
    | "apply_changes_and_reauthorize"
    | "check_approval"
    | "do_not_execute";
  description: string;
  approvalId?: string;
  queueEntryId?: string;
  retryable: boolean;
}

export interface GovernanceDecisionEnvelope {
  schemaVersion: "globiguard.agent-decision.v1";
  simulation: boolean;
  outcome: AuthorityOutcome;
  canExecute: boolean;
  decision: GlobiguardActionAuthorizationResponse["decision"];
  approvalState: GlobiguardActionAuthorizationResponse["approvalState"];
  authorizationId: string;
  correlationId: string | null;
  queueEntryId: string | null;
  reason: {
    summary: string;
    codes: string[];
  };
  obligations: string[];
  modifications: Record<string, unknown> | null;
  evidence: GlobiguardEvidenceRef[];
  expiresAt: string | null;
  next: AuthorityNextStep;
}

export interface ApprovalCheckEnvelope {
  schemaVersion: "globiguard.approval-check.v1";
  queueEntryId: string;
  authorizationId: string | null;
  status: GlobiguardQueueStatus;
  canExecute: false;
  terminal: boolean;
  reasonCode: string | null;
  reviewNotes: string | null;
  reviewNotesPresent: boolean;
  resolvedAt: string | null;
  actionBinding?: {
    matchesCurrentAction: boolean;
    payloadSha256: string;
  };
  next: {
    action: "check_again" | "reauthorize_action" | "do_not_execute";
    description: string;
    retryable: boolean;
  };
}

export interface ApprovalActionBinding {
  actionType: string;
  destinationName: string;
  payloadSha256: string;
  policyId?: string;
}

export interface GovernedToolDescriptor {
  exposedName: string;
  downstreamName: string;
  serverName: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  connector: GlobiguardActionConnectorBinding & {
    instanceId: string;
    manifestVersion: string;
    schemaSha256: string;
    schemaSnapshot: Record<string, unknown>;
  };
  governance: {
    actionType?: string;
    destinationType?: GlobiguardDestinationSystemType;
    destinationName?: string;
    destinationResource?: string;
    destinationTenantId?: string;
    destinationRegion?: string;
    purpose?: string;
    dataClasses?: GlobiguardDataClass[];
    fieldsInvolved?: string[];
    riskScore?: number;
    idempotencyKeyArgument?: string;
    consequence: "low" | "medium" | "high";
  };
}
