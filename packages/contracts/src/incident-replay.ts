import type {
  GlobiguardBrowserSafeContract,
  GlobiguardEvidenceSourceReference
} from "./authority.js";
import type { GlobiguardDecision } from "./decision.js";

export const GLOBIGUARD_INCIDENT_REPLAY_SCHEMA_VERSION =
  "2026-05-incident-replay-beta" as const;

export const GLOBIGUARD_INCIDENT_REPLAY_SEGMENT_STATUSES = [
  "observed",
  "redacted",
  "missing",
  "unverified"
] as const;

export type GlobiguardIncidentReplaySegmentStatus =
  (typeof GLOBIGUARD_INCIDENT_REPLAY_SEGMENT_STATUSES)[number];

export const GLOBIGUARD_INCIDENT_REPLAY_EVENT_KINDS = [
  "action_requested",
  "policy_evaluated",
  "action_authorized",
  "queued_for_review",
  "approval_decided",
  "action_resumed",
  "action_blocked",
  "evidence_exported",
  "webhook_delivered",
  "operator_note"
] as const;

export type GlobiguardIncidentReplayEventKind =
  (typeof GLOBIGUARD_INCIDENT_REPLAY_EVENT_KINDS)[number];

export interface GlobiguardIncidentReplayLookupRequest {
  workflowRunId?: string;
  correlationId?: string;
  queueEntryId?: string;
  auditEventId?: string;
  authorizationId?: string;
}

export interface GlobiguardIncidentReplayTimelineEntry {
  id: string;
  occurredAt: string;
  kind: GlobiguardIncidentReplayEventKind;
  status: GlobiguardIncidentReplaySegmentStatus;
  title: string;
  summary?: string;
  decision?: GlobiguardDecision;
  actor?: {
    id?: string;
    type?: "human" | "agent" | "service" | "workflow";
    displayName?: string;
  };
  refs: GlobiguardEvidenceSourceReference[];
  missingReason?: string;
  redactionReason?: string;
}

export interface GlobiguardIncidentReplayGap {
  id: string;
  status: Extract<
    GlobiguardIncidentReplaySegmentStatus,
    "missing" | "unverified"
  >;
  expectedKind: GlobiguardIncidentReplayEventKind;
  reason: string;
  remediation?: string;
}

export interface GlobiguardIncidentReplay
  extends GlobiguardBrowserSafeContract {
  schemaVersion: typeof GLOBIGUARD_INCIDENT_REPLAY_SCHEMA_VERSION | string;
  incidentReplayId: string;
  generatedAt: string;
  lookup: GlobiguardIncidentReplayLookupRequest;
  complete: boolean;
  correlationIds: string[];
  timeline: GlobiguardIncidentReplayTimelineEntry[];
  gaps: GlobiguardIncidentReplayGap[];
  evidencePackageId?: string;
  disclaimers: string[];
}

