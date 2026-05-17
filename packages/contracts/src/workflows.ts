import type { GlobiguardDecision } from "./decision.js";
import type { GlobiguardIndustry } from "./industry.js";

export const GLOBIGUARD_TRIGGER_TYPES = [
  "EMAIL_RECEIVED",
  "FILE_UPLOADED",
  "WEBHOOK",
  "SCHEDULE",
  "MANUAL",
  "RECORD_UPDATED"
] as const;

export type GlobiguardWorkflowTriggerType =
  (typeof GLOBIGUARD_TRIGGER_TYPES)[number];

export const GLOBIGUARD_WORKFLOW_STEP_TYPES = [
  "READ_DATA",
  "PROCESS_FILE",
  "DETECT_PII",
  "CALL_LLM",
  "GATE_CHECK",
  "WRITE_RECORD",
  "SEND_MESSAGE",
  "REQUIRE_APPROVAL",
  "BRANCH",
  "NOTIFY"
] as const;

export type GlobiguardWorkflowStepType =
  (typeof GLOBIGUARD_WORKFLOW_STEP_TYPES)[number];

export const GLOBIGUARD_WORKFLOW_RUN_STATUSES = [
  "RUNNING",
  "WAITING_APPROVAL",
  "COMPLETED",
  "FAILED",
  "CANCELLED"
] as const;

export type GlobiguardWorkflowRunStatus =
  (typeof GLOBIGUARD_WORKFLOW_RUN_STATUSES)[number];

export const GLOBIGUARD_WORKFLOW_STEP_STATUSES = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "SKIPPED",
  "WAITING_APPROVAL"
] as const;

export type GlobiguardWorkflowStepStatus =
  (typeof GLOBIGUARD_WORKFLOW_STEP_STATUSES)[number];

export interface GlobiguardWorkflowStep {
  id: string;
  workflowId: string;
  order: number;
  name: string;
  stepType: GlobiguardWorkflowStepType;
  config: Record<string, unknown>;
  nextStepId?: string | null;
  onApproveStepId?: string | null;
  onRejectStepId?: string | null;
  condition?: Record<string, unknown> | null;
}

export interface GlobiguardWorkflowRecord {
  id: string;
  orgId: string;
  name: string;
  description?: string | null;
  triggerType: GlobiguardWorkflowTriggerType;
  triggerConfig: Record<string, unknown>;
  active: boolean;
  industry: GlobiguardIndustry;
  templateId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GlobiguardWorkflow extends GlobiguardWorkflowRecord {
  steps: GlobiguardWorkflowStep[];
}

export interface GlobiguardWorkflowStepInput {
  name: string;
  stepType: GlobiguardWorkflowStepType;
  config?: Record<string, unknown>;
}

export interface GlobiguardWorkflowRunStep {
  id: string;
  runId: string;
  stepId: string;
  status: GlobiguardWorkflowStepStatus;
  decision?: GlobiguardDecision | null;
  inputSummary?: Record<string, unknown> | null;
  outputSummary?: Record<string, unknown> | null;
  maskedFields: string[];
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
}

export interface GlobiguardWorkflowRun {
  id: string;
  workflowId: string;
  orgId: string;
  status: GlobiguardWorkflowRunStatus;
  triggerData: GlobiguardWorkflowTriggerSummary;
  startedAt: string;
  completedAt?: string | null;
  failedAt?: string | null;
  error?: string | null;
  steps?: GlobiguardWorkflowRunStep[];
}

export interface GlobiguardWorkflowListRequest {
  active: boolean;
}

export interface GlobiguardWorkflowCreateRequest {
  name: string;
  description?: string;
  triggerType: GlobiguardWorkflowTriggerType;
  industry: GlobiguardIndustry;
  triggerConfig?: Record<string, unknown>;
  steps?: GlobiguardWorkflowStepInput[];
}

export interface GlobiguardWorkflowUpdateRequest {
  name: string;
}

export interface GlobiguardWorkflowTriggerSummary {
  sha256: string;
  approxBytes: number;
  topLevelKeys: string[];
  topLevelValueKinds: Record<string, string>;
}

export interface GlobiguardWorkflowsReadClient {
  list(request: GlobiguardWorkflowListRequest): Promise<GlobiguardWorkflow[]>;
  get(workflowId: string): Promise<GlobiguardWorkflow>;
}

export interface GlobiguardWorkflowsClient extends GlobiguardWorkflowsReadClient {
  create(request: GlobiguardWorkflowCreateRequest): Promise<GlobiguardWorkflow>;
  update(
    workflowId: string,
    request: GlobiguardWorkflowUpdateRequest
  ): Promise<GlobiguardWorkflowRecord>;
  remove(workflowId: string): Promise<void>;
  activate(workflowId: string): Promise<GlobiguardWorkflowRecord>;
  run(
    workflowId: string,
    triggerData?: Record<string, unknown>
  ): Promise<GlobiguardWorkflowRun>;
  listRuns(workflowId: string): Promise<GlobiguardWorkflowRun[]>;
}

