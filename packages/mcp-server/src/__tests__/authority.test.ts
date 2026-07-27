import type {
  GlobiguardActionAuthorizationRequest,
  GlobiguardActionAuthorizationResponse,
  GlobiguardQueueEntry,
} from "@globiguard/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  deriveIntentIdempotencyKey,
  GlobiguardAuthority,
  type AuthorityBackend,
} from "../authority.js";
import type { GovernedActionIntent } from "../types.js";

const baseIntent: GovernedActionIntent = {
  actionType: "email.send",
  destination: {
    type: "email",
    name: "claims-outbound",
    resource: "mailbox:claims",
  },
  purpose: "Send a claim status update",
  dataClasses: ["PII"],
  actor: { id: "agent_123", type: "agent" },
  payload: {
    recipient: "patient@example.com",
    claimNumber: "CLAIM-SECRET-123",
  },
};

describe("GlobiGuard MCP authority", () => {
  it.each([
    ["ALLOW", "proceed", true, "execute_now"],
    ["MODIFY", "revise", false, "apply_changes_and_reauthorize"],
    ["QUEUE", "wait", false, "check_approval"],
    ["BLOCK", "stop", false, "do_not_execute"],
  ] as const)(
    "maps %s into an agent-actionable result",
    async (decision, outcome, canExecute, nextAction) => {
      const backend = mockBackend(response(decision));
      const authority = new GlobiguardAuthority(backend);

      await expect(authority.govern(baseIntent)).resolves.toMatchObject({
        schemaVersion: "globiguard.agent-decision.v1",
        simulation: false,
        decision,
        outcome,
        canExecute,
        next: { action: nextAction },
      });
    },
  );

  it("sends only a structural summary and digest to the control plane", async () => {
    let captured: GlobiguardActionAuthorizationRequest | undefined;
    const backend = mockBackend(response("ALLOW"), (request) => {
      captured = request;
    });
    const authority = new GlobiguardAuthority(backend);

    await authority.govern(baseIntent);

    const serialized = JSON.stringify(captured);
    expect(serialized).not.toContain("patient@example.com");
    expect(serialized).not.toContain("CLAIM-SECRET-123");
    expect(captured?.context.payloadSummary).toMatchObject({
      approxBytes: expect.any(Number),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      topLevelKeys: ["claimNumber", "recipient"],
    });
    expect(captured?.context.metadata).toEqual({
      protocol: "mcp",
      riskScore: 0.7,
    });
  });

  it("requires a digest for caller-supplied summaries and does not trust a low reported risk", async () => {
    let captured: GlobiguardActionAuthorizationRequest | undefined;
    const authority = new GlobiguardAuthority(
      mockBackend(response("ALLOW"), (request) => {
        captured = request;
      }),
    );

    await expect(
      authority.govern({
        ...baseIntent,
        payload: undefined,
        payloadSummary: { sha256: "not-a-digest" },
      }),
    ).rejects.toThrow(/sha256/i);

    await authority.govern({ ...baseIntent, riskScore: 0.01 });
    expect(captured?.context.metadata?.riskScore).toBe(0.7);
  });

  it("authorizes omitted payloads without throwing", async () => {
    const authority = new GlobiguardAuthority(mockBackend(response("ALLOW")));

    await expect(
      authority.govern({ ...baseIntent, payload: undefined }),
    ).resolves.toMatchObject({ outcome: "proceed" });
  });

  it("never turns a dry run into an execution permit", async () => {
    const authority = new GlobiguardAuthority(mockBackend(response("ALLOW")));

    await expect(
      authority.govern({ ...baseIntent, dryRun: true }),
    ).resolves.toMatchObject({
      simulation: true,
      decision: "ALLOW",
      canExecute: false,
      next: { action: "authorize_for_execution" },
      reason: { codes: expect.arrayContaining(["DRY_RUN_ONLY"]) },
    });
  });

  it.each([
    { executable: false },
    { nextAction: "REAUTHORIZE_EXACT_ACTION" as const },
  ])("honors an explicit non-executable control-plane ALLOW", async (extra) => {
    const authority = new GlobiguardAuthority(
      mockBackend({ ...response("ALLOW"), ...extra }),
    );

    await expect(authority.govern(baseIntent)).resolves.toMatchObject({
      decision: "ALLOW",
      canExecute: false,
      next: { action: "authorize_for_execution" },
      reason: {
        codes: expect.arrayContaining(["CONTROL_PLANE_MARKED_NON_EXECUTABLE"]),
      },
    });
  });

  it("never exposes an expired or unbounded ALLOW as executable", async () => {
    for (const expiresAt of [
      undefined,
      "2020-01-01T00:00:00.000Z",
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ]) {
      const authority = new GlobiguardAuthority(
        mockBackend({ ...response("ALLOW"), expiresAt }),
      );
      await expect(authority.govern(baseIntent)).resolves.toMatchObject({
        decision: "ALLOW",
        canExecute: false,
        next: { action: "authorize_for_execution" },
        reason: {
          codes: expect.arrayContaining(["AUTHORIZATION_EXPIRY_INVALID"]),
        },
      });
    }
  });

  it("keeps obligation-bearing ALLOW non-executable", async () => {
    const authorization = {
      ...response("ALLOW"),
      obligations: ["mask recipient"],
    };
    const authority = new GlobiguardAuthority(mockBackend(authorization));

    await expect(authority.govern(baseIntent)).resolves.toMatchObject({
      decision: "ALLOW",
      outcome: "revise",
      canExecute: false,
      reason: {
        codes: expect.arrayContaining(["UNFULFILLED_OBLIGATIONS"]),
      },
    });
  });

  it.each(["PENDING", "REJECTED", "EXPIRED", "CANCELLED"] as const)(
    "keeps ALLOW with %s approval non-executable",
    async (approvalState) => {
      const authority = new GlobiguardAuthority(
        mockBackend({ ...response("ALLOW"), approvalState }),
      );
      await expect(authority.govern(baseIntent)).resolves.toMatchObject({
        decision: "ALLOW",
        canExecute: false,
        next: { action: "check_approval" },
        reason: {
          codes: expect.arrayContaining(["APPROVAL_STATE_NOT_EXECUTABLE"]),
        },
      });
    },
  );

  it("allows an explicitly APPROVED bounded ALLOW", async () => {
    const authority = new GlobiguardAuthority(
      mockBackend({ ...response("ALLOW"), approvalState: "APPROVED" }),
    );
    await expect(authority.govern(baseIntent)).resolves.toMatchObject({
      outcome: "proceed",
      canExecute: true,
    });
  });

  it("keeps modification-bearing ALLOW non-executable", async () => {
    const authority = new GlobiguardAuthority(
      mockBackend({
        ...response("ALLOW"),
        modifications: { recipient: "reviewed@example.invalid" },
      }),
    );
    await expect(authority.govern(baseIntent)).resolves.toMatchObject({
      outcome: "revise",
      canExecute: false,
      reason: { codes: expect.arrayContaining(["UNAPPLIED_MODIFICATIONS"]) },
      next: { action: "apply_changes_and_reauthorize" },
    });
  });

  it("rejects malformed runtime decision and approval states", async () => {
    for (const malformed of [
      { ...response("ALLOW"), decision: "PERMIT" },
      { ...response("ALLOW"), approvalState: "UNKNOWN" },
    ]) {
      const authority = new GlobiguardAuthority(
        mockBackend(
          malformed as unknown as GlobiguardActionAuthorizationResponse,
        ),
      );
      await expect(authority.govern(baseIntent)).rejects.toThrow(/unknown/);
    }
  });

  it("treats retrieved ALLOW decisions as history, not fresh permits", async () => {
    const authority = new GlobiguardAuthority(mockBackend(response("ALLOW")));

    await expect(
      authority.getAuthorization("authz_allow"),
    ).resolves.toMatchObject({
      decision: "ALLOW",
      canExecute: false,
      next: { action: "authorize_for_execution" },
      reason: {
        codes: expect.arrayContaining([
          "HISTORICAL_AUTHORIZATION_REQUIRES_REAUTHORIZATION",
        ]),
      },
    });
  });

  it("treats a resumed approval as consumed, never reusable", async () => {
    const backend = mockBackend(response("QUEUE"));
    backend.getQueueEntry = vi.fn(
      async (): Promise<GlobiguardQueueEntry> => ({
        id: "queue_123",
        orgId: "org_123",
        actionType: "email.send",
        destinationSystem: "email",
        riskScore: 0.9,
        policyId: "policy_123",
        payloadSummary: {},
        fieldsInvolved: [],
        status: "RESUMED",
        createdAt: "2026-07-25T12:00:00.000Z",
      }),
    );
    const authority = new GlobiguardAuthority(backend);

    await expect(authority.checkApproval("queue_123")).resolves.toMatchObject({
      status: "RESUMED",
      canExecute: false,
      terminal: true,
      next: { action: "do_not_execute", retryable: false },
    });
  });

  it("changes idempotency when a material authorization input changes", () => {
    const digest = "a".repeat(64);
    const original = deriveIntentIdempotencyKey(baseIntent, digest);

    expect(
      deriveIntentIdempotencyKey(
        { ...baseIntent, purpose: "Export claims for analytics" },
        digest,
      ),
    ).not.toBe(original);
    expect(
      deriveIntentIdempotencyKey(
        {
          ...baseIntent,
          destination: { ...baseIntent.destination, resource: "mailbox:legal" },
        },
        digest,
      ),
    ).not.toBe(original);
    expect(
      deriveIntentIdempotencyKey(
        { ...baseIntent, policyId: "policy_2" },
        digest,
      ),
    ).not.toBe(original);
  });

  it("validates required intent fields and clamps risk scores", async () => {
    let captured: GlobiguardActionAuthorizationRequest | undefined;
    const authority = new GlobiguardAuthority(
      mockBackend(response("ALLOW"), (request) => {
        captured = request;
      }),
    );

    await expect(
      authority.govern({ ...baseIntent, actionType: " " }),
    ).rejects.toThrow(/actionType/);
    await authority.govern({ ...baseIntent, riskScore: 9 });
    expect(captured?.context.metadata?.riskScore).toBe(1);
  });
});

function mockBackend(
  authorization: GlobiguardActionAuthorizationResponse,
  onAuthorize?: (request: GlobiguardActionAuthorizationRequest) => void,
): AuthorityBackend {
  return {
    authorize: vi.fn(async (request) => {
      onAuthorize?.(request);
      return authorization;
    }),
    getAuthorization: vi.fn(async () => authorization),
    getQueueEntry: vi.fn(async () => {
      throw new Error("not used");
    }),
    getEvidence: vi.fn(async () => {
      throw new Error("not used");
    }),
    getAuditEvent: vi.fn(async () => {
      throw new Error("not used");
    }),
    getEvidencePackageSummary: vi.fn(async () => {
      throw new Error("not used");
    }),
    getIncidentReplay: vi.fn(async () => {
      throw new Error("not used");
    }),
    listActivePolicies: vi.fn(async () => []),
    getPolicy: vi.fn(async () => {
      throw new Error("not used");
    }),
  };
}

function response(
  decision: GlobiguardActionAuthorizationResponse["decision"],
): GlobiguardActionAuthorizationResponse {
  return {
    contractVersion: "2026-04-action-beta",
    authorizationId: `authz_${decision.toLowerCase()}`,
    decision,
    executable: decision === "ALLOW",
    nextAction:
      decision === "ALLOW"
        ? "EXECUTE_EXACT_ACTION_ONCE"
        : decision === "MODIFY"
          ? "APPLY_MODIFICATIONS_AND_REAUTHORIZE"
          : decision === "QUEUE"
            ? "WAIT_FOR_APPROVAL"
            : "STOP",
    approvalState: decision === "QUEUE" ? "PENDING" : "NOT_REQUIRED",
    approval:
      decision === "QUEUE"
        ? {
            id: "approval_123",
            state: "PENDING",
            createdAt: "2026-07-25T12:00:00.000Z",
          }
        : null,
    queueEntryId: decision === "QUEUE" ? "queue_123" : null,
    evidenceRefs: [
      {
        id: "evidence_123",
        uri: "globiguard://evidence/evidence_123",
        kind: "audit_event",
      },
    ],
    reason: `POLICY_${decision}`,
    obligations: [],
    modifications:
      decision === "MODIFY" ? { redact: ["claimNumber"] } : undefined,
    correlationId: "4bf92f3577b34da6a3ce929d0e0e4736",
    expiresAt:
      decision === "ALLOW"
        ? new Date(Date.now() + 60_000).toISOString()
        : undefined,
  };
}
