import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  EvidencePackageSummary,
  GovernedActionBoundary,
  IncidentReplayTimeline,
  PolicyDecisionBadge
} from "../actions.js";
import { GlobiguardStyleSheet } from "../styles.js";

describe("@globiguard/react governance components", () => {
  it("fails closed instead of rendering protected children when decision state is missing", () => {
    const html = renderToStaticMarkup(
      <GovernedActionBoundary decision={null}>
        <button>Send customer email</button>
      </GovernedActionBoundary>
    );

    expect(html).toContain("data-globiguard-fail-closed");
    expect(html).not.toContain("Send customer email");
  });

  it("ships a scoped dependency-free stylesheet for themed components", () => {
    const html = renderToStaticMarkup(<GlobiguardStyleSheet nonce="nonce-123" />);

    expect(html).toContain("data-globiguard-style-sheet");
    expect(html).toContain("nonce=\"nonce-123\"");
    expect(html).toContain(".gg-card");
    expect(html).toContain("@media (max-width: 42rem)");
  });

  it("keeps badges customizable without losing state data attributes", () => {
    const html = renderToStaticMarkup(
      <PolicyDecisionBadge
        className="custom-decision"
        decision="BLOCK"
        style={{ marginInlineStart: "1rem" }}
      />
    );

    expect(html).toContain("gg-badge custom-decision");
    expect(html).toContain("data-globiguard-decision=\"BLOCK\"");
    expect(html).toContain("data-tone=\"danger\"");
    expect(html).toContain("margin-inline-start:1rem");
  });

  it("renders protected children only for an ALLOW decision", () => {
    const html = renderToStaticMarkup(
      <GovernedActionBoundary
        decision={{
          contractVersion: "2026-04-action-beta",
          authorizationId: "authz_123",
          decision: "ALLOW",
          approvalState: "NOT_REQUIRED",
          evidenceRefs: []
        }}
      >
        <button>Send customer email</button>
      </GovernedActionBoundary>
    );

    expect(html).toContain("Send customer email");
    expect(html).not.toContain("data-globiguard-fail-closed");
  });

  it("shows queued state without rendering protected children", () => {
    const html = renderToStaticMarkup(
      <GovernedActionBoundary
        decision={{
          contractVersion: "2026-04-action-beta",
          authorizationId: "authz_123",
          decision: "QUEUE",
          approvalState: "PENDING",
          queueEntryId: "queue_123",
          evidenceRefs: [],
          reason: "Human review required"
        }}
      >
        <button>Send customer email</button>
      </GovernedActionBoundary>
    );

    expect(html).toContain("data-globiguard-queued-action");
    expect(html).toContain("queue_123");
    expect(html).not.toContain("Send customer email");
  });

  it("renders metadata-safe evidence package summaries", () => {
    const html = renderToStaticMarkup(
      <EvidencePackageSummary
        summary={{
          boundary: {
            authorityLevel: "browser_read",
            browserSafe: true,
            serverSecretRequired: false,
            rawPayloadAllowed: false
          },
          schemaVersion: "2026-05-evidence-summary-beta",
          evidencePackageId: "evpkg_123",
          status: "ready",
          scope: {},
          decisionCounts: { QUEUE: 1 },
          redaction: {
            mode: "metadata_only",
            rawPayloadIncluded: false
          },
          sourceRefs: [{ kind: "audit_event", id: "audit_123" }],
          disclaimers: []
        }}
      />
    );

    expect(html).toContain("data-globiguard-evidence-package=\"evpkg_123\"");
    expect(html).toContain("gg-card");
    expect(html).toContain("Raw payload included");
    expect(html).toContain("false");
  });

  it("renders incident replay gaps honestly", () => {
    const html = renderToStaticMarkup(
      <IncidentReplayTimeline
        replay={{
          boundary: {
            authorityLevel: "browser_read",
            browserSafe: true,
            serverSecretRequired: false,
            rawPayloadAllowed: false
          },
          schemaVersion: "2026-05-incident-replay-beta",
          incidentReplayId: "replay_123",
          generatedAt: "2026-05-17T20:00:00.000Z",
          lookup: { workflowRunId: "run_123" },
          complete: false,
          correlationIds: [],
          timeline: [],
          gaps: [
            {
              id: "gap_123",
              status: "missing",
              expectedKind: "action_resumed",
              reason: "No resume event observed."
            }
          ],
          disclaimers: []
        }}
      />
    );

    expect(html).toContain("Replay incomplete");
    expect(html).toContain("No resume event observed.");
  });
});
