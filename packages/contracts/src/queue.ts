export const GLOBIGUARD_QUEUE_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "AUTO_APPROVED",
  "ESCALATED",
  "MODIFIED",
  "RESUMED",
  "FAILED"
] as const;

export type GlobiguardQueueStatus =
  (typeof GLOBIGUARD_QUEUE_STATUSES)[number];

export const GLOBIGUARD_QUEUE_ACTIONS = [
  "approve",
  "reject",
  "modify",
  "escalate",
  "resume"
] as const;

export type GlobiguardQueueAction =
  (typeof GLOBIGUARD_QUEUE_ACTIONS)[number];

export interface GlobiguardQueueEntry {
  id: string;
  orgId: string;
  workflowRunId?: string | null;
  workflowStepId?: string | null;
  correlationId?: string | null;
  actionType: string;
  destinationSystem: string;
  riskScore: number;
  policyId: string;
  policyVersion?: number | null;
  reasonCode?: string;
  riskReasons?: string[];
  recommendedDecision?: string;
  payloadSummary: Record<string, unknown>;
  fieldsInvolved: string[];
  status: GlobiguardQueueStatus;
  assignedApproverId?: string | null;
  slaDeadlineAt?: string | null;
  resumeStrategy?: "NONE" | "REQUIRES_RETRY" | "RESUME_WORKFLOW";
  resumePayloadSummary?: Record<string, unknown> | null;
  reviewedBy?: string | null;
  reviewNotes?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  authorizationId?: string | null;
  idempotencyKey?: string | null;
  evidencePackageId?: string | null;
  resumeTokenRef?: string | null;
}

export interface GlobiguardQueueListRequest {
  status?: GlobiguardQueueStatus;
}

export interface GlobiguardQueueApproveOrRejectRequest {
  action: "approve" | "reject";
  reviewedBy?: string;
  notes?: string;
}

export interface GlobiguardQueueModifyRequest {
  action: "modify";
  reviewedBy?: string;
  notes?: string;
  reasonCode?: string;
  modifiedPayloadSummary: Record<string, unknown>;
}

export interface GlobiguardQueueEscalateRequest {
  action: "escalate";
  assignedApproverId?: string;
  escalatedBy: string;
  reasonCode: string;
  notes?: string;
}

export interface GlobiguardQueueResumeRequest {
  action: "resume";
}

export type GlobiguardQueueDecisionRequest =
  | GlobiguardQueueApproveOrRejectRequest
  | GlobiguardQueueModifyRequest
  | GlobiguardQueueEscalateRequest
  | GlobiguardQueueResumeRequest;

export interface GlobiguardQueueDecisionResponse {
  id: string;
  decision?: GlobiguardQueueStatus;
  status: GlobiguardQueueStatus;
  resume_required?: boolean;
  already_resolved?: boolean;
}

export interface GlobiguardQueueReadClient {
  list(request?: GlobiguardQueueListRequest): Promise<GlobiguardQueueEntry[]>;
  get(queueEntryId: string): Promise<GlobiguardQueueEntry>;
}

export interface GlobiguardQueueClient extends GlobiguardQueueReadClient {
  decide(
    queueEntryId: string,
    request: GlobiguardQueueDecisionRequest
  ): Promise<GlobiguardQueueDecisionResponse>;
}
