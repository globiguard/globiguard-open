import { describe, expect, it, vi } from "vitest";

import { createServerClient } from "../client.js";

function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" }
  });
}

function serverClient(fetchImpl: typeof fetch, requestTimeoutMs = 10_000) {
  return createServerClient({
    environment: "sandbox",
    credential: {
      kind: "secret",
      projectId: "proj_123",
      token: "sk_test_123",
      environment: "sandbox"
    },
    services: { controlPlane: "https://control.example.com" },
    fetch: fetchImpl,
    requestTimeoutMs
  });
}

describe("execution authority boundary", () => {
  it.each([
    ["BLOCK", {}, "POLICY_BLOCKED"],
    ["QUEUE", { approvalState: "PENDING" }, "QUEUED_FOR_REVIEW"],
    ["MODIFY", { modifications: { body: "redacted" } }, "STEP_UP_REQUIRED"],
    ["ALLOW", { expiresAt: null }, "STEP_UP_REQUIRED"],
    ["ALLOW", { expiresAt: "2020-01-01T00:00:00.000Z" }, "STEP_UP_REQUIRED"],
    ["ALLOW", { expiresAt: new Date(Date.now() + 3_600_000).toISOString() }, "STEP_UP_REQUIRED"],
    ["ALLOW", { obligations: ["mask recipient"] }, "STEP_UP_REQUIRED"],
    ["ALLOW", { modifications: { body: "redacted" } }, "STEP_UP_REQUIRED"],
    ["ALLOW", { approvalState: "PENDING" }, "STEP_UP_REQUIRED"],
    ["ALLOW", { executable: false }, "STEP_UP_REQUIRED"],
    ["ALLOW", { nextAction: "REAUTHORIZE_EXACT_ACTION" }, "STEP_UP_REQUIRED"],
    ["ALLOW", { executable: undefined }, "STEP_UP_REQUIRED"],
    ["ALLOW", { nextAction: undefined }, "STEP_UP_REQUIRED"]
  ] as const)("does not execute-authorize %s with unresolved authority", async (
    outcome,
    extras,
    kind
  ) => {
    const client = serverClient(vi.fn(async () => createJsonResponse({
      contractVersion: "2026-04-action-beta",
      authorizationId: "authz_123",
      decision: outcome,
      approvalState: "NOT_REQUIRED",
      executable: true,
      nextAction: "EXECUTE_EXACT_ACTION_ONCE",
      evidenceRefs: [],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      ...extras
    })));

    await expect(client.governedActions.authorizeActionOrThrow({
      context: {
        actionType: "email.send",
        destination: { type: "email", name: "claims-outbound" },
        dataClasses: ["PII"]
      }
    })).rejects.toMatchObject({ kind });
  });

  it("returns only a current, obligation-free ALLOW", async () => {
    const client = serverClient(vi.fn(async () => createJsonResponse({
      contractVersion: "2026-04-action-beta",
      authorizationId: "authz_current",
      decision: "ALLOW",
      approvalState: "NOT_REQUIRED",
      executable: true,
      nextAction: "EXECUTE_EXACT_ACTION_ONCE",
      evidenceRefs: [],
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    })));

    await expect(client.governedActions.authorizeActionOrThrow({
      context: {
        actionType: "email.send",
        destination: { type: "email", name: "claims-outbound" },
        dataClasses: ["PII"]
      }
    })).resolves.toMatchObject({ authorizationId: "authz_current" });
  });

  it("does not treat dry-run ALLOW as an execution permit", async () => {
    const client = serverClient(vi.fn(async () => createJsonResponse({
      contractVersion: "2026-04-action-beta",
      authorizationId: "authz_simulated",
      decision: "ALLOW",
      approvalState: "NOT_REQUIRED",
      executable: true,
      nextAction: "EXECUTE_EXACT_ACTION_ONCE",
      evidenceRefs: [],
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    })));

    await expect(client.governedActions.authorizeActionOrThrow({
      dryRun: true,
      context: {
        actionType: "email.send",
        destination: { type: "email", name: "claims-outbound" },
        dataClasses: ["PII"]
      }
    })).rejects.toMatchObject({
      kind: "STEP_UP_REQUIRED",
      safeDetails: { reason: "DRY_RUN_ONLY" }
    });
  });

  it("enforces the deadline even when a custom fetch ignores AbortSignal", async () => {
    const fetchImpl = vi.fn(
      async (): Promise<Response> => new Promise<Response>(() => undefined)
    );
    const client = serverClient(fetchImpl, 5);

    await expect(client.actions.getAuthorization("authz_timeout"))
      .rejects.toMatchObject({ name: "TimeoutError" });
  });
});
