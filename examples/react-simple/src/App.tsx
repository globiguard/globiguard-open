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
    <main style={{ fontFamily: "sans-serif", margin: "2rem", maxWidth: "48rem" }}>
      <h1>GlobiGuard React Simple Example</h1>
      <p>
        This example stays browser-safe: it talks to the control plane, not the
        decision engine.
      </p>
      <p>
        Control plane URL:{" "}
        <code>{controlPlaneUrl ?? "not configured"}</code>
      </p>
      <button onClick={handleRegisterInstall} type="button">
        Register install
      </button>
      <p>{status}</p>
      <hr style={{ margin: "2rem 0" }} />
      <h2>Optional realtime queue subscription</h2>
      <p>
        Realtime uses an explicit bearer token handshake against the control-plane
        websocket gateway.
      </p>
      <p>
        Queue org ID: <code>{realtimeQueueOrgId ?? "not configured"}</code>
      </p>
      <button onClick={handleToggleRealtimeQueue} type="button">
        {realtimeSubscriptionRef.current ? "Disconnect realtime" : "Subscribe to queue"}
      </button>
      <p>{realtimeStatus}</p>
      <hr style={{ margin: "2rem 0" }} />
      <h2>Browser-safe governance UI</h2>
      <p>
        These widgets use sample metadata to demonstrate the same states a
        caller-owned server endpoint would return after governing a real action.
      </p>
      <PolicyDecisionBadge decision="QUEUE" />
      <QueuedActionNotice queueEntryId="queue_sample_claim_email" />
      <GovernedActionBoundary
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
        <button type="button">Send claim-status email</button>
      </GovernedActionBoundary>
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
