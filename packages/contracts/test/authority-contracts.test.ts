import { describe, expect, it } from "vitest";

import {
  GLOBIGUARD_AUTHORITY_COMPATIBILITY,
  GLOBIGUARD_BROWSER_READ_BOUNDARY,
  GLOBIGUARD_EVIDENCE_SUMMARY_SCHEMA_VERSION,
  GLOBIGUARD_INCIDENT_REPLAY_SCHEMA_VERSION,
  GLOBIGUARD_SERVER_AUTHORITY_BOUNDARY,
  GLOBIGUARD_TRUST_WEBHOOK_HEADER_NAMES,
  GLOBIGUARD_TRUST_WEBHOOK_SIGNATURE_SCHEME,
  type GlobiguardEvidencePackageSummary,
  type GlobiguardIncidentReplay,
  type GlobiguardTrustWebhookEnvelope
} from "../src/index.js";

describe("@globiguard/contracts authority layer", () => {
  it("pins evidence summary as browser-safe metadata with no raw payload", () => {
    const summary = {
      boundary: GLOBIGUARD_BROWSER_READ_BOUNDARY,
      schemaVersion: GLOBIGUARD_EVIDENCE_SUMMARY_SCHEMA_VERSION,
      evidencePackageId: "evpkg_123",
      status: "ready",
      generatedAt: "2026-05-17T20:00:00.000Z",
      scope: {
        workflowRunId: "workflow_123",
        frameworkId: "soc2"
      },
      decisionCounts: {
        ALLOW: 2,
        QUEUE: 1
      },
      integrity: {
        checksumAlgorithm: "sha256",
        checksum: "abc123"
      },
      redaction: {
        mode: "metadata_only",
        rawPayloadIncluded: false,
        maskedFieldCount: 3,
        fieldTypes: ["PII"]
      },
      sourceRefs: [
        {
          kind: "audit_event",
          id: "audit_123",
          checksum: "def456"
        }
      ],
      artifact: {
        delivery: "download_url",
        uri: "https://exports.example.com/evpkg_123.json",
        approxBytes: 2048
      },
      disclaimers: ["Metadata summary only; raw customer payload is not included."]
    } satisfies GlobiguardEvidencePackageSummary;

    expect(summary.boundary).toEqual({
      authorityLevel: "browser_read",
      browserSafe: true,
      serverSecretRequired: false,
      rawPayloadAllowed: false
    });
    expect(summary.redaction.rawPayloadIncluded).toBe(false);
    expect(summary.artifact?.delivery).toBe("download_url");
  });

  it("pins incident replay as versioned and gap-aware", () => {
    const replay = {
      boundary: GLOBIGUARD_BROWSER_READ_BOUNDARY,
      schemaVersion: GLOBIGUARD_INCIDENT_REPLAY_SCHEMA_VERSION,
      incidentReplayId: "replay_123",
      generatedAt: "2026-05-17T20:00:00.000Z",
      lookup: {
        workflowRunId: "workflow_123",
        correlationId: "4bf92f3577b34da6a3ce929d0e0e4736"
      },
      complete: false,
      correlationIds: ["4bf92f3577b34da6a3ce929d0e0e4736"],
      timeline: [
        {
          id: "step_1",
          occurredAt: "2026-05-17T20:00:00.000Z",
          kind: "queued_for_review",
          status: "observed",
          title: "AI action queued for review",
          decision: "QUEUE",
          refs: [{ kind: "queue_entry", id: "queue_123" }]
        }
      ],
      gaps: [
        {
          id: "gap_1",
          status: "missing",
          expectedKind: "action_resumed",
          reason: "No resume event has been observed yet.",
          remediation: "Wait for approval webhook or poll queue status."
        }
      ],
      disclaimers: ["Replay is incomplete until the resume event is observed."]
    } satisfies GlobiguardIncidentReplay;

    expect(replay.schemaVersion).toBe(GLOBIGUARD_INCIDENT_REPLAY_SCHEMA_VERSION);
    expect(replay.complete).toBe(false);
    expect(replay.gaps[0]?.status).toBe("missing");
  });

  it("pins trust webhook envelope and server-only verification boundary", () => {
    const envelope = {
      contractVersion: "2026-05-trust-webhook-beta",
      id: "whdel_123",
      timestamp: "2026-05-17T20:00:00.000Z",
      type: "approval.approved",
      apiFamily: "webhooks.v1",
      data: {
        approvalId: "approval_123"
      },
      related: {
        queueEntryId: "queue_123",
        correlationId: "4bf92f3577b34da6a3ce929d0e0e4736"
      }
    } satisfies GlobiguardTrustWebhookEnvelope;

    expect(GLOBIGUARD_TRUST_WEBHOOK_HEADER_NAMES).toEqual({
      deliveryId: "x-globiguard-delivery-id",
      timestamp: "x-globiguard-timestamp",
      eventType: "x-globiguard-event-type",
      signature: "x-globiguard-signature"
    });
    expect(GLOBIGUARD_TRUST_WEBHOOK_SIGNATURE_SCHEME).toBe(
      "globiguard-hmac-sha256-v1"
    );
    expect(GLOBIGUARD_SERVER_AUTHORITY_BOUNDARY).toEqual({
      authorityLevel: "server_authority",
      browserSafe: false,
      serverSecretRequired: true,
      rawPayloadAllowed: false
    });
    expect(envelope.id).toBe("whdel_123");
  });

  it("declares beta compatibility for current authority API families", () => {
    expect(GLOBIGUARD_AUTHORITY_COMPATIBILITY).toEqual({
      contractVersion: "2026-05-authority-beta",
      apiFamilies: ["actions.v1", "audit.v1", "queue.v1", "webhooks.v1"],
      stability: "beta"
    });
  });
});

