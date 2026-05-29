import { useEffect, useRef, useState } from "react";

import { buildInstallRegistrationRequest } from "@globiguard/sdk";
import type {
  GlobiguardRealtimeClient,
  GlobiguardRealtimeSubscription
} from "@globiguard/realtime";

import {
  EvidencePackageSummary,
  GovernedActionBoundary,
  IncidentReplayTimeline,
  PolicyDecisionBadge,
  QueuedActionNotice,
  useGlobiguardClient
} from "@globiguard/react";

export interface AppProps {
  bootstrapProfile: Parameters<typeof buildInstallRegistrationRequest>[0];
  controlPlaneUrl?: string;
  realtimeClient?: GlobiguardRealtimeClient;
  realtimeQueueOrgId?: string;
}

export function App({
  bootstrapProfile,
  controlPlaneUrl,
  realtimeClient,
  realtimeQueueOrgId
}: AppProps) {
  const client = useGlobiguardClient();
  const [status, setStatus] = useState(
    controlPlaneUrl
      ? `Ready to register against ${controlPlaneUrl}`
      : "Set the example control-plane URL to test install registration."
  );
  const [realtimeStatus, setRealtimeStatus] = useState(
    realtimeClient && realtimeQueueOrgId
      ? `Ready to subscribe to queue events for ${realtimeQueueOrgId}`
      : "Realtime queue subscription is disabled until a bearer token and org ID are configured."
  );
  const realtimeSubscriptionRef = useRef<GlobiguardRealtimeSubscription | null>(
    null
  );

  useEffect(() => {
    return () => {
      realtimeSubscriptionRef.current?.unsubscribe();
      realtimeSubscriptionRef.current = null;
    };
  }, []);

  async function handleRegisterInstall() {
    if (!controlPlaneUrl) {
      setStatus(
        "Install registration is disabled until the example control-plane URL is configured."
      );
      return;
    }

    setStatus("Registering example install...");

    try {
      const result = await client.installs.register(
        buildInstallRegistrationRequest(
          bootstrapProfile,
          {
            packageName: "@globiguard/example-react-simple",
            packageVersion: "0.1.0",
            integrationKind: "react",
            runtimeKind: "browser"
          }
        )
      );

      setStatus(`Install registered: ${result.installId}`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown install error";
      setStatus(`Install registration failed: ${message}`);
    }
  }

  function handleToggleRealtimeQueue() {
    if (!realtimeClient || !realtimeQueueOrgId) {
      setRealtimeStatus(
        "Realtime queue subscription is disabled until a bearer token and org ID are configured."
      );
      return;
    }

    if (realtimeSubscriptionRef.current) {
      realtimeSubscriptionRef.current.unsubscribe();
      realtimeSubscriptionRef.current = null;
      setRealtimeStatus("Realtime queue subscription disconnected.");
      return;
    }

    setRealtimeStatus("Connecting to realtime queue updates...");
    realtimeSubscriptionRef.current = realtimeClient.subscribeQueue(
      realtimeQueueOrgId,
      {
        onEvent: (event) => {
          setRealtimeStatus(
            `Queue event on ${event.channel}: ${JSON.stringify(event.data)}`
          );
        },
        onError: (error) => {
          setRealtimeStatus(`Realtime queue subscription failed: ${error.message}`);
        }
      }
    );
  }

  return (
    <main
      className="gg-stack"
      style={{
        gap: "1.25rem",
        margin: "clamp(1rem, 4vw, 3rem) auto",
        maxWidth: "72rem",
        padding: "0 clamp(1rem, 3vw, 2rem)"
      }}
    >
      <section className="gg-card">
        <div className="gg-card__header">
          <div className="gg-stack">
            <h1 className="gg-card__title">GlobiGuard React Simple Example</h1>
            <p className="gg-card__description">
              Browser-safe controls that talk to the control plane, not the
              decision engine.
            </p>
          </div>
          <PolicyDecisionBadge decision="QUEUE" labels={{ QUEUE: "Demo state" }} />
        </div>
        <div className="gg-grid">
          <div className="gg-stat">
            <span className="gg-stat__label">Control plane URL</span>
            <span className="gg-stat__value">
              <code className="gg-code">{controlPlaneUrl ?? "not configured"}</code>
            </span>
          </div>
          <div className="gg-stat">
            <span className="gg-stat__label">Install status</span>
            <span className="gg-stat__value">{status}</span>
          </div>
        </div>
        <button className="gg-button" onClick={handleRegisterInstall} type="button">
          Register install
        </button>
      </section>

      <section className="gg-card">
        <div className="gg-card__header">
          <div className="gg-stack">
            <h2 className="gg-card__title">Optional realtime queue subscription</h2>
            <p className="gg-card__description">
              Realtime uses an explicit bearer token handshake against the
              control-plane websocket gateway.
            </p>
          </div>
          <span className="gg-badge" data-tone={realtimeClient ? "info" : "neutral"}>
            {realtimeClient ? "Configured" : "Disabled"}
          </span>
        </div>
        <div className="gg-grid">
          <div className="gg-stat">
            <span className="gg-stat__label">Queue org ID</span>
            <span className="gg-stat__value">
              <code className="gg-code">
                {realtimeQueueOrgId ?? "not configured"}
              </code>
            </span>
          </div>
          <div className="gg-stat">
            <span className="gg-stat__label">Realtime status</span>
            <span className="gg-stat__value">{realtimeStatus}</span>
          </div>
        </div>
        <button
          className="gg-button"
          onClick={handleToggleRealtimeQueue}
          type="button"
        >
          {realtimeSubscriptionRef.current
            ? "Disconnect realtime"
            : "Subscribe to queue"}
        </button>
      </section>

      <section className="gg-card">
        <div className="gg-card__header">
          <div className="gg-stack">
            <h2 className="gg-card__title">Browser-safe governance UI</h2>
            <p className="gg-card__description">
              These widgets use sample metadata to demonstrate the same states a
              caller-owned server endpoint would return after governing a real
              action.
            </p>
          </div>
          <PolicyDecisionBadge decision="QUEUE" />
        </div>
        <QueuedActionNotice density="compact" queueEntryId="queue_sample_claim_email" />
        <GovernedActionBoundary
          density="compact"
          decision={{
            contractVersion: "2026-04-action-beta",
            authorizationId: "auth_sample_claim_email",
            decision: "QUEUE",
            approvalState: "PENDING",
            queueEntryId: "queue_sample_claim_email",
            evidenceRefs: [],
            reason: "Human approval required before sending claim-status email."
          }}
        >
          <button className="gg-button" type="button">
            Send claim-status email
          </button>
        </GovernedActionBoundary>
      </section>

      <EvidencePackageSummary
        summary={{
          boundary: {
            authorityLevel: "browser_read",
            browserSafe: true,
            serverSecretRequired: false,
            rawPayloadAllowed: false
          },
          schemaVersion: "2026-05-evidence-summary-beta",
          evidencePackageId: "evpkg_sample_claim_email",
          status: "ready",
          scope: {
            workflowRunId: "claim-123",
            frameworkId: "soc2"
          },
          decisionCounts: {
            QUEUE: 1
          },
          redaction: {
            mode: "metadata_only",
            rawPayloadIncluded: false,
            maskedFieldCount: 2,
            fieldTypes: ["PII"]
          },
          sourceRefs: [{ kind: "queue_entry", id: "queue_sample_claim_email" }],
          disclaimers: ["Example metadata only; no raw claim payload is included."]
        }}
      />
      <IncidentReplayTimeline
        replay={{
          boundary: {
            authorityLevel: "browser_read",
            browserSafe: true,
            serverSecretRequired: false,
            rawPayloadAllowed: false
          },
          schemaVersion: "2026-05-incident-replay-beta",
          incidentReplayId: "replay_sample_claim_email",
          generatedAt: "2026-05-17T20:00:00.000Z",
          lookup: { workflowRunId: "claim-123" },
          complete: false,
          correlationIds: ["4bf92f3577b34da6a3ce929d0e0e4736"],
          timeline: [
            {
              id: "timeline_1",
              occurredAt: "2026-05-17T20:00:00.000Z",
              kind: "queued_for_review",
              status: "observed",
              title: "Claim-status email queued for review",
              decision: "QUEUE",
              refs: [{ kind: "queue_entry", id: "queue_sample_claim_email" }]
            }
          ],
          gaps: [
            {
              id: "gap_resume",
              status: "missing",
              expectedKind: "action_resumed",
              reason: "No approval/resume event has been observed in this sample."
            }
          ],
          disclaimers: ["Example replay data only."]
        }}
      />
    </main>
  );
}
