import type { GlobiguardDecision } from "./decision.js";
import type {
  GlobiguardEvidencePackageSummary,
  GlobiguardEvidenceExportDescriptor
} from "./authority.js";
import type {
  GlobiguardIncidentReplay,
  GlobiguardIncidentReplayLookupRequest
} from "./incident-replay.js";

export interface GlobiguardAuditMaskedField {
  id: string;
  auditEventId: string;
  fieldType: string;
  tokenAssigned: string;
  detectionMethod: string;
  confidence: number;
  ruleTriggered?: string | null;
}

export interface GlobiguardAuditEvent {
  id: string;
  orgId: string;
  policyId?: string | null;
  policyVersion?: number | null;
  agentIdHash: string;
  connectorInstanceId?: string | null;
  actionType: string;
  destinationSystem: string;
  decision: GlobiguardDecision;
  governanceScore: number;
  maskedFieldCount: number;
  maskedFieldTypes: string[];
  blockedFieldCount: number;
  workflowRunId?: string | null;
  workflowStepId?: string | null;
  sessionId?: string | null;
  ipAddress?: string | null;
  frameworkTags: string[];
  controlRefs: string[];
  modelVersion?: string | null;
  connectorManifestVersion?: string | null;
  evidenceRefs: string[];
  timestamp: string;
  maskedFields: GlobiguardAuditMaskedField[];
  _scoreDisclaimer: string;
}

export interface GlobiguardAuditListRequest {
  from?: string;
  to?: string;
  decision?: GlobiguardDecision;
  workflowRunId?: string;
  page?: number;
  limit?: number;
}

export interface GlobiguardAuditListResponse {
  items: GlobiguardAuditEvent[];
  total: number;
  page: number;
  pages: number;
}

export interface GlobiguardAuditExportRequest {
  from?: string;
  to?: string;
  frameworkId?: string;
  workflowRunId?: string;
  format?: "JSON";
}

export interface GlobiguardAuditEvidencePackageRequestedScope {
  from: string | null;
  to: string | null;
  workflowRunId: string | null;
  frameworkId: string | null;
  snapshotAt: string;
}

export interface GlobiguardAuditEvidencePackageControlMapping {
  controlRef: string;
  auditEventCount: number;
  evidenceRefs: string[];
  provenanceRefs: string[];
}

export interface GlobiguardAuditEvidencePackageHumanReviewEntry {
  id: string;
  status: string;
  reviewedBy: string;
  resolvedAt: string | null;
  createdAt: string | null;
  workflowRunId: string | null;
  workflowStepId: string | null;
}

export interface GlobiguardAuditEvidencePackageSummary {
  auditEventCount: number;
  queuedReviewCount: number;
  decisionCounts: Partial<Record<GlobiguardDecision, number>>;
  fieldTypes: string[];
  frameworkTags: string[];
  connectorInstanceIds: string[];
  firstEventAt: string | null;
  lastEventAt: string | null;
}

export interface GlobiguardAuditEvidencePackageArtifact {
  artifactId: string;
  frameworkId: string;
  generatedAt: string;
  scopeStatement: string;
  requestedScope: GlobiguardAuditEvidencePackageRequestedScope;
  workflowRunReferences: string[];
  policyVersions: string[];
  modelVersionReferences: string[];
  connectorManifestVersions: string[];
  evidenceReferences: string[];
  provenanceReferences: string[];
  controlMappings: GlobiguardAuditEvidencePackageControlMapping[];
  humanReviewHistory: GlobiguardAuditEvidencePackageHumanReviewEntry[];
  summary: GlobiguardAuditEvidencePackageSummary;
  disclaimers: string[];
}

export interface GlobiguardAuditExportResponse {
  status: "ready";
  artifactExportId: string;
  evidencePackageId: string;
  format: "json";
  checksum: string;
  artifactJson: string;
  artifact: GlobiguardAuditEvidencePackageArtifact;
  summary?: GlobiguardEvidencePackageSummary;
  descriptor?: GlobiguardEvidenceExportDescriptor;
}

export interface GlobiguardAuditReadClient {
  list(request?: GlobiguardAuditListRequest): Promise<GlobiguardAuditListResponse>;
  get(auditEventId: string): Promise<GlobiguardAuditEvent>;
  getEvidencePackageSummary(
    evidencePackageId: string
  ): Promise<GlobiguardEvidencePackageSummary>;
  getIncidentReplay(
    request: GlobiguardIncidentReplayLookupRequest
  ): Promise<GlobiguardIncidentReplay>;
}

export interface GlobiguardAuditClient extends GlobiguardAuditReadClient {
  export(
    request?: GlobiguardAuditExportRequest
  ): Promise<GlobiguardAuditExportResponse>;
}
