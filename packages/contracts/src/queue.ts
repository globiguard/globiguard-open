export const GLOBIGUARD_QUEUE_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "AUTO_APPROVED"
] as const;

export type GlobiguardQueueStatus =
  (typeof GLOBIGUARD_QUEUE_STATUSES)[number];

export const GLOBIGUARD_QUEUE_ACTIONS = ["approve", "reject"] as const;

export type GlobiguardQueueAction =
  (typeof GLOBIGUARD_QUEUE_ACTIONS)[number];

export interface GlobiguardQueueEntry {
  id: string;
  orgId: string;
  workflowRunId: string;
  workflowStepId: string;
  actionType: string;
  destinationSystem: string;
  riskScore: number;
  policyId: string;
  payloadSummary: Record<string, unknown>;
  fieldsInvolved: string[];
  status: GlobiguardQueueStatus;
  reviewedBy?: string | null;
  reviewNotes?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  authorizationId?: string | null;
  correlationId?: string | null;
  idempotencyKey?: string | null;
  evidencePackageId?: string | null;
  resumeTokenRef?: string | null;
}

export interface GlobiguardQueueListRequest {
  status?: GlobiguardQueueStatus;
}

export interface GlobiguardQueueDecisionRequest {
  action: GlobiguardQueueAction;
  reviewedBy?: string;
  notes?: string;
}

export interface GlobiguardQueueDecisionResponse {
  id: string;
  decision: GlobiguardQueueStatus;
  status: GlobiguardQueueStatus;
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

