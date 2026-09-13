import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type GlobiguardActionAuthorizationRequest,
  GLOBIGUARD_TRUST_WEBHOOK_HEADER_NAMES,
  GLOBIGUARD_TRUST_WEBHOOK_SIGNATURE_SCHEME,
  type GlobiguardTrustWebhookHeaders,
} from "@globiguard/contracts";

import { createServerClient } from "../client.js";
import { GlobiguardAuthorityError } from "../errors.js";
import {
  buildSignedWebhookPayload,
  deriveActionIdempotencyKey,
  generateCorrelationId,
  verifyTrustWebhook,
} from "../server.js";

const ACTION_FIXTURE_SHA256 =
  "7fde92cc2fa2843f5ca9020c8c4d9afd6fcc36adf2efc3d193250621285b40ac";
const actionFixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../test/fixtures/action-governance-v1.json",
);

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("@globiguard/sdk governed actions", () => {
  it("adds server governed-action helpers without exposing them on browser clients", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          "https://control.example.com/v1/actions/authorize",
        );
        expect(init?.method).toBe("POST");

        return createJsonResponse({
          contractVersion: "2026-04-action-beta",
          authorizationId: "authz_123",
          decision: "QUEUE",
          executable: false,
          nextAction: "WAIT_FOR_APPROVAL",
          approvalState: "PENDING",
          queueEntryId: "queue_123",
          evidenceRefs: [],
          correlationId: "4bf92f3577b34da6a3ce929d0e0e4736",
        });
      },
    );

    const client = createServerClient({
      environment: "sandbox",
      credential: {
        kind: "secret",
        projectId: "proj_123",
        token: "sk_test_123",
        environment: "sandbox",
      },
      services: {
        controlPlane: "https://control.example.com",
      },
      fetch: fetchImpl,
    });

    const decision = await client.governedActions.authorizeAction({
      context: {
        actionType: "email.send",
        destination: { type: "email", name: "claims-outbound" },
        dataClasses: ["PII"],
        idempotencyKey: "email-claim-123",
      },
    });

    await expect(
      client.governedActions.authorizeActionOrThrow({
        context: {
          actionType: "email.send",
          destination: { type: "email", name: "claims-outbound" },
          dataClasses: ["PII"],
          idempotencyKey: "email-claim-123",
        },
      }),
    ).rejects.toMatchObject({
      name: "GlobiguardAuthorityError",
      kind: "QUEUED_FOR_REVIEW",
      queueEntryId: "queue_123",
    });
    expect(decision.decision).toBe("QUEUE");
  });

  it("consumes the shared action-governance fixture contract for every decision", async () => {
    const fixtureBytes = readFileSync(actionFixturePath);
    expect(createHash("sha256").update(fixtureBytes).digest("hex")).toBe(
      ACTION_FIXTURE_SHA256,
    );
    const fixture = JSON.parse(fixtureBytes.toString("utf8")) as {
      fixture_contract: string;
      source_contract: string;
      cases: Array<{
        id: string;
        request: unknown;
        response: { decision: "ALLOW" | "MODIFY" | "BLOCK" | "QUEUE" };
      }>;
    };
    expect(fixture.fixture_contract).toBe(
      "globiguard.action-governance.shared-fixtures.v1",
    );
    expect(fixture.source_contract).toBe("2026-04-action-beta");

    for (const item of fixture.cases) {
      const fetchImpl = vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          expect(init?.method).toBe("POST");
          expect(JSON.parse(String(init?.body))).toEqual(item.request);
          return createJsonResponse({
            contractVersion: "2026-04-action-beta",
            authorizationId: `sdk-${item.id}`,
            ...item.response,
            approvalState:
              item.response.decision === "QUEUE" ? "PENDING" : "NOT_REQUIRED",
            queueEntryId:
              item.response.decision === "QUEUE" ? `queue-${item.id}` : null,
            evidenceRefs: [],
            executable: item.response.decision === "ALLOW",
            nextAction:
              item.response.decision === "ALLOW"
                ? "EXECUTE_EXACT_ACTION_ONCE"
                : item.response.decision === "MODIFY"
                  ? "APPLY_MODIFICATIONS_AND_REAUTHORIZE"
                  : item.response.decision === "QUEUE"
                    ? "WAIT_FOR_APPROVAL"
                    : "STOP",
          });
        },
      );
      const client = createServerClient({
        environment: "sandbox",
        credential: {
          kind: "secret",
          projectId: "fixture-project",
          token: "sk_test_fixture",
          environment: "sandbox",
        },
        services: { controlPlane: "https://control.example.com" },
        fetch: fetchImpl,
      });

      const decision = await client.governedActions.authorizeAction(
        item.request as GlobiguardActionAuthorizationRequest,
      );
      expect(decision.decision).toBe(item.response.decision);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("derives stable idempotency keys and trace-compatible correlation IDs", async () => {
    const first = await deriveActionIdempotencyKey({
      stableSeed: "claim-123-email",
      actionType: "email.send",
      actorId: "agent_123",
      payloadSha256: "abc123",
      windowBucket: "2026-05-17T20",
    });
    const second = await deriveActionIdempotencyKey({
      stableSeed: "claim-123-email",
      actionType: "email.send",
      actorId: "agent_123",
      payloadSha256: "abc123",
      windowBucket: "2026-05-17T20",
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^gg_idem_[\da-f]{48}$/);
    expect(generateCorrelationId()).toMatch(/^[\da-f]{32}$/);
  });

  it("polls queued approvals fail-closed until approved", async () => {
    const fetchImpl = vi.fn(async () =>
      createJsonResponse({
        id: "queue_123",
        orgId: "org_123",
        workflowRunId: "run_123",
        workflowStepId: "step_123",
        actionType: "email.send",
        destinationSystem: "email",
        riskScore: 0.9,
        policyId: "pol_123",
        payloadSummary: {},
        fieldsInvolved: ["PII"],
        status: "PENDING",
        createdAt: "2026-05-17T20:00:00.000Z",
      }),
    );
    const client = createServerClient({
      environment: "sandbox",
      credential: {
        kind: "secret",
        projectId: "proj_123",
        token: "sk_test_123",
        environment: "sandbox",
      },
      services: {
        controlPlane: "https://control.example.com",
      },
      fetch: fetchImpl,
    });

    await expect(
      client.governedActions.waitForApproval({
        queueEntryId: "queue_123",
        maxAttempts: 1,
        intervalMs: 1,
      }),
    ).rejects.toBeInstanceOf(GlobiguardAuthorityError);
  });

  it("returns resumed approvals and requires reauthorization for modified actions", async () => {
    let status = "RESUMED";
    const fetchImpl = vi.fn(async () =>
      createJsonResponse({
        id: "queue_123",
        orgId: "org_123",
        workflowRunId: "run_123",
        workflowStepId: "step_123",
        actionType: "email.send",
        destinationSystem: "email",
        riskScore: 0.9,
        policyId: "pol_123",
        payloadSummary: {},
        fieldsInvolved: ["PII"],
        status,
        createdAt: "2026-05-17T20:00:00.000Z",
      }),
    );
    const client = createServerClient({
      environment: "sandbox",
      credential: {
        kind: "secret",
        projectId: "proj_123",
        token: "sk_test_123",
        environment: "sandbox",
      },
      services: {
        controlPlane: "https://control.example.com",
      },
      fetch: fetchImpl,
    });

    await expect(
      client.governedActions.waitForApproval({
        queueEntryId: "queue_123",
        maxAttempts: 1,
      }),
    ).resolves.toMatchObject({ status: "RESUMED" });

    status = "MODIFIED";
    await expect(
      client.governedActions.waitForApproval({
        queueEntryId: "queue_123",
        maxAttempts: 1,
      }),
    ).rejects.toMatchObject({
      kind: "STEP_UP_REQUIRED",
      queueEntryId: "queue_123",
    });
  });

  it("verifies trust webhooks with signed timestamp, event type, and delivery ID", async () => {
    const rawBody = JSON.stringify({
      contractVersion: "2026-05-trust-webhook-beta",
      id: "whdel_123",
      timestamp: "2026-05-17T20:00:00.000Z",
      type: "approval.approved",
      apiFamily: "webhooks.v1",
      data: { approvalId: "approval_123" },
    });
    const headers: GlobiguardTrustWebhookHeaders = {
      deliveryId: "whdel_123",
      timestamp: "2026-05-17T20:00:00.000Z",
      eventType: "approval.approved",
      signature: `v1=${await signWebhook("secret_123", headersForSigning())}`,
    };

    const result = await verifyTrustWebhook({
      headers,
      rawBody,
      signingSecret: "secret_123",
      now: new Date("2026-05-17T20:02:00.000Z"),
      seenDelivery: async () => false,
    });

    expect(result).toMatchObject({
      ok: true,
      deliveryId: "whdel_123",
      eventType: "approval.approved",
      duplicateDelivery: false,
    });
  });

  it("rejects stale or invalid trust webhooks while surfacing verified duplicates", async () => {
    const rawBody = JSON.stringify({
      contractVersion: "2026-05-trust-webhook-beta",
      id: "whdel_123",
      timestamp: "2026-05-17T20:00:00.000Z",
      type: "approval.approved",
      apiFamily: "webhooks.v1",
      data: { approvalId: "approval_123" },
    });
    const headers = new Headers({
      [GLOBIGUARD_TRUST_WEBHOOK_HEADER_NAMES.deliveryId]: "whdel_123",
      [GLOBIGUARD_TRUST_WEBHOOK_HEADER_NAMES.timestamp]:
        "2026-05-17T20:00:00.000Z",
      [GLOBIGUARD_TRUST_WEBHOOK_HEADER_NAMES.eventType]: "approval.approved",
      [GLOBIGUARD_TRUST_WEBHOOK_HEADER_NAMES.signature]: "v1=bad",
    });

    await expect(
      verifyTrustWebhook({
        headers,
        rawBody,
        signingSecret: "secret_123",
        now: new Date("2026-05-17T20:02:00.000Z"),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { kind: "WEBHOOK_VERIFICATION_FAILED" },
    });

    const signed = await signWebhook("secret_123", headersForSigning());
    headers.set(
      GLOBIGUARD_TRUST_WEBHOOK_HEADER_NAMES.signature,
      `v1=${signed}`,
    );

    await expect(
      verifyTrustWebhook({
        headers,
        rawBody,
        signingSecret: "secret_123",
        now: new Date("2026-05-17T20:10:01.000Z"),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        message:
          "GlobiGuard webhook timestamp is outside the accepted replay window.",
      },
    });

    await expect(
      verifyTrustWebhook({
        headers,
        rawBody,
        signingSecret: "secret_123",
        now: new Date("2026-05-17T20:02:00.000Z"),
        seenDelivery: async () => true,
      }),
    ).resolves.toMatchObject({
      ok: true,
      duplicateDelivery: true,
      deliveryId: "whdel_123",
    });
  });
});

function headersForSigning(): GlobiguardTrustWebhookHeaders {
  return {
    deliveryId: "whdel_123",
    timestamp: "2026-05-17T20:00:00.000Z",
    eventType: "approval.approved",
    signature: "",
  };
}

async function signWebhook(
  secret: string,
  headers: GlobiguardTrustWebhookHeaders,
): Promise<string> {
  const payload = buildSignedWebhookPayload(
    headers,
    JSON.stringify({
      contractVersion: "2026-05-trust-webhook-beta",
      id: "whdel_123",
      timestamp: "2026-05-17T20:00:00.000Z",
      type: "approval.approved",
      apiFamily: "webhooks.v1",
      data: { approvalId: "approval_123" },
    }),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

expect(GLOBIGUARD_TRUST_WEBHOOK_SIGNATURE_SCHEME).toBe(
  "globiguard-hmac-sha256-v1",
);
