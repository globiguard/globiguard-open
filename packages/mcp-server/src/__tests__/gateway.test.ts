import type {
  GlobiguardActionAuthorizationRequest,
  GlobiguardActionAuthorizationResponse,
} from "@globiguard/contracts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";

import { GlobiguardAuthority, type AuthorityBackend } from "../authority.js";
import { InMemoryGatewayExecutionLedger } from "../execution-ledger.js";
import { GovernedMcpGateway, type DownstreamMcpClient } from "../gateway.js";
import { summarizePayload } from "../summarize.js";

const downstreamTool: Tool = {
  name: "send_email",
  title: "Send email",
  description: "Send an outbound email.",
  inputSchema: {
    type: "object",
    required: ["to", "subject"],
    properties: {
      to: { type: "string" },
      subject: { type: "string" },
      requestId: { type: "string" },
    },
  },
  outputSchema: {
    type: "object",
    required: ["messageId"],
    properties: { messageId: { type: "string" } },
  },
  annotations: {
    destructiveHint: true,
    readOnlyHint: false,
    openWorldHint: true,
  },
};

describe("governed MCP tool gateway", () => {
  it("mirrors downstream tools under a governed namespace", async () => {
    const harness = await connectGateway("ALLOW");
    try {
      const listed = await harness.client.listTools();
      expect(listed.tools).toHaveLength(3);
      expect(
        listed.tools.find((tool) => tool.name === "mail.send_email"),
      ).toMatchObject({
        name: "mail.send_email",
        title: "Governed: Send email",
        inputSchema: downstreamTool.inputSchema,
        outputSchema: {
          type: "object",
          anyOf: expect.arrayContaining([downstreamTool.outputSchema]),
        },
        _meta: {
          "io.globiguard/governed": true,
          "io.globiguard/downstream-tool": "send_email",
        },
      });
    } finally {
      await harness.close();
    }
  });

  it("forwards the exact arguments only after ALLOW", async () => {
    let authorityRequest: GlobiguardActionAuthorizationRequest | undefined;
    const harness = await connectGateway("ALLOW", (request) => {
      authorityRequest = request;
    });
    try {
      const args = {
        to: "patient@example.com",
        subject: "Claim CLAIM-SECRET-123",
      };
      const result = await harness.client.callTool({
        name: "mail.send_email",
        arguments: args,
      });

      expect(result.isError).toBe(false);
      expect(result.structuredContent).toEqual({ messageId: "msg_123" });
      expect(result._meta?.["io.globiguard/governance"]).toMatchObject({
        decision: "ALLOW",
        authorizationId: "authz_allow",
        payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(harness.downstream.callTool).toHaveBeenCalledTimes(1);
      expect(harness.downstream.callTool).toHaveBeenCalledWith(
        { name: "send_email", arguments: args },
        expect.objectContaining({ timeout: 60_000 }),
      );

      const serializedAuthorityRequest = JSON.stringify(authorityRequest);
      expect(serializedAuthorityRequest).not.toContain("patient@example.com");
      expect(serializedAuthorityRequest).not.toContain("CLAIM-SECRET-123");
      expect(authorityRequest?.context).toMatchObject({
        actionType: "mcp.mail.send_email",
        destination: {
          type: "custom",
          name: "mail",
          resource: "send_email",
        },
        dataClasses: ["INTERNAL"],
        connector: {
          instanceId: "mail",
          manifestVersion: "mcp-discovery-v1",
          schemaSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          schemaSnapshot: {
            protocol: "mcp",
            downstreamServer: "mail",
            downstreamTool: "send_email",
            consequence: "medium",
            inputSchemaSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          },
        },
        metadata: { riskScore: 0.9 },
      });
    } finally {
      await harness.close();
    }
  });

  it.each([
    ["MODIFY", "revise"],
    ["QUEUE", "wait"],
    ["BLOCK", "stop"],
  ] as const)(
    "does not call downstream when the decision is %s",
    async (decision, outcome) => {
      const harness = await connectGateway(decision);
      try {
        const result = await callGoverned(harness.client);
        expect(result.isError).toBe(false);
        expect(result.structuredContent).toMatchObject({
          decision,
          outcome,
          canExecute: false,
        });
        expect(harness.downstream.callTool).not.toHaveBeenCalled();
      } finally {
        await harness.close();
      }
    },
  );

  it("checks approval without execution and requires explicit fresh reauthorization", async () => {
    const exactArguments = {
      to: "patient@example.com",
      subject: "Approved claim update",
    };
    let continuationAuthorization:
      | GlobiguardActionAuthorizationRequest
      | undefined;
    const harness = await connectGateway(
      "ALLOW",
      (request) => {
        continuationAuthorization = request;
      },
      {
        queueStatus: "APPROVED",
        queuePayloadSha256: summarizePayload(exactArguments).sha256,
      },
    );
    try {
      const status = await harness.client.callTool({
        name: "globiguard_check_approval",
        arguments: { queueEntryId: "queue_123" },
      });
      expect(status.structuredContent).toMatchObject({
        status: "APPROVED",
        canExecute: false,
        next: { action: "reauthorize_action" },
      });
      expect(harness.downstream.callTool).not.toHaveBeenCalled();

      const continued = await harness.client.callTool({
        name: "globiguard_reauthorize_action",
        arguments: {
          queueEntryId: "queue_123",
          governedTool: "mail.send_email",
          arguments: exactArguments,
        },
      });
      expect(continued.isError).toBe(false);
      expect(harness.downstream.callTool).toHaveBeenCalledTimes(1);
      expect(continuationAuthorization?.context).toMatchObject({
        approvalQueueEntryId: "queue_123",
        actionType: "mcp.mail.send_email",
        destination: { name: "mail", resource: "send_email" },
      });

      const changed = await harness.client.callTool({
        name: "globiguard_reauthorize_action",
        arguments: {
          queueEntryId: "queue_123",
          governedTool: "mail.send_email",
          arguments: { ...exactArguments, subject: "Changed after approval" },
        },
      });
      expect(changed.structuredContent).toMatchObject({
        canExecute: false,
        actionBinding: { matchesCurrentAction: false },
        next: { action: "do_not_execute" },
      });
      expect(harness.downstream.callTool).toHaveBeenCalledTimes(1);
    } finally {
      await harness.close();
    }
  });

  it("fails closed when authority is unavailable or authorization expired", async () => {
    const unavailable = await connectGateway("ALLOW", undefined, {
      authorityFailure: new Error("secret upstream details"),
    });
    try {
      const result = await callGoverned(unavailable.client);
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain(
        "downstream tool was not called",
      );
      expect(JSON.stringify(result)).not.toContain("secret upstream details");
      expect(unavailable.downstream.callTool).not.toHaveBeenCalled();
    } finally {
      await unavailable.close();
    }

    const expired = await connectGateway("ALLOW", undefined, {
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    try {
      const result = await callGoverned(expired.client);
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toMatchObject({
        canExecute: false,
        reason: {
          codes: expect.arrayContaining(["AUTHORIZATION_EXPIRY_INVALID"]),
        },
      });
      expect(expired.downstream.callTool).not.toHaveBeenCalled();
    } finally {
      await expired.close();
    }

    const unbounded = await connectGateway("ALLOW", undefined, {
      omitExpiry: true,
    });
    try {
      const result = await callGoverned(unbounded.client);
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toMatchObject({
        canExecute: false,
        reason: {
          codes: expect.arrayContaining(["AUTHORIZATION_EXPIRY_INVALID"]),
        },
      });
      expect(unbounded.downstream.callTool).not.toHaveBeenCalled();
    } finally {
      await unbounded.close();
    }
  });

  it("sanitizes downstream failures and preserves the authorization evidence", async () => {
    const harness = await connectGateway("ALLOW", undefined, {
      downstreamFailure: new Error("smtp password is hunter2"),
    });
    try {
      const result = await callGoverned(harness.client);
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain("downstream MCP tool failed");
      expect(JSON.stringify(result)).not.toContain("hunter2");
      expect(result._meta?.["io.globiguard/governance"]).toMatchObject({
        authorizationId: "authz_allow",
      });
      expect(result.structuredContent).toMatchObject({
        executionState: "outcome_unknown",
        downstreamCalled: true,
        outcomeKnown: false,
        retryable: false,
      });
    } finally {
      await harness.close();
    }
  });

  it("suppresses oversized downstream results and consumes the execution key", async () => {
    const harness = await connectGateway("ALLOW", undefined, {
      downstreamResultText: "x".repeat(1_024),
      maxDownstreamResultBytes: 256,
    });
    try {
      const first = await callGoverned(harness.client);
      expect(first.isError).toBe(true);
      expect(first.structuredContent).toMatchObject({
        executionState: "result_suppressed",
        downstreamCalled: true,
        outcomeKnown: true,
        retryable: false,
      });
      expect(JSON.stringify(first)).not.toContain("x".repeat(1_024));
      expect(harness.downstream.callTool).toHaveBeenCalledTimes(1);
    } finally {
      await harness.close();
    }
  });

  it("fails closed on obligation-bearing ALLOW without a typed handler", async () => {
    const harness = await connectGateway("ALLOW", undefined, {
      obligations: ["mask recipient before send"],
    });
    try {
      const result = await callGoverned(harness.client);
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toMatchObject({
        decision: "ALLOW",
        outcome: "revise",
        canExecute: false,
        reason: {
          codes: expect.arrayContaining(["UNFULFILLED_OBLIGATIONS"]),
        },
      });
      expect(harness.downstream.callTool).not.toHaveBeenCalled();
    } finally {
      await harness.close();
    }
  });

  it("requires and hashes a configured idempotency argument before authorization", async () => {
    let authorityRequest: GlobiguardActionAuthorizationRequest | undefined;
    const harness = await connectGateway(
      "ALLOW",
      (request) => {
        authorityRequest = request;
      },
      { idempotencyKeyArgument: "requestId" },
    );
    try {
      const missing = await callGoverned(harness.client);
      expect(missing.isError).toBe(true);
      expect(
        (missing.structuredContent as Record<string, unknown> | undefined)
          ?.error,
      ).toContain('non-empty string argument named "requestId"');
      expect(harness.downstream.callTool).not.toHaveBeenCalled();

      const requestId = "customer-visible-retry-key-123";
      const allowed = await harness.client.callTool({
        name: "mail.send_email",
        arguments: {
          to: "patient@example.com",
          subject: "Claim update",
          requestId,
        },
      });
      expect(allowed.isError).toBe(false);
      expect(authorityRequest?.context.idempotencyKey).toMatch(
        /^mcp:mail:send_email:[a-f0-9]{64}$/,
      );
      expect(authorityRequest?.context.idempotencyKey).not.toContain(requestId);
      expect(harness.downstream.callTool).toHaveBeenCalledTimes(1);

      const duplicate = await harness.client.callTool({
        name: "mail.send_email",
        arguments: {
          to: "patient@example.com",
          subject: "Claim update",
          requestId,
        },
      });
      expect(duplicate.isError).toBe(true);
      expect(JSON.stringify(duplicate)).toContain("already consumed");
      expect(harness.downstream.callTool).toHaveBeenCalledTimes(1);

      const conflict = await harness.client.callTool({
        name: "mail.send_email",
        arguments: {
          to: "different@example.com",
          subject: "Changed action",
          requestId,
        },
      });
      expect(conflict.isError).toBe(true);
      expect(JSON.stringify(conflict)).toContain("execution ledger rejected");
      expect(harness.downstream.callTool).toHaveBeenCalledTimes(1);
    } finally {
      await harness.close();
    }
  });

  it("joins concurrent calls with one configured execution key", async () => {
    const harness = await connectGateway("ALLOW", undefined, {
      idempotencyKeyArgument: "requestId",
      downstreamDelayMs: 25,
    });
    try {
      const invocation = {
        name: "mail.send_email",
        arguments: {
          to: "patient@example.com",
          subject: "Claim update",
          requestId: "one-logical-send",
        },
      };
      const [first, second] = await Promise.all([
        harness.client.callTool(invocation),
        harness.client.callTool(invocation),
      ]);

      expect(first.isError).toBe(false);
      expect(second.isError).toBe(false);
      expect(harness.downstream.callTool).toHaveBeenCalledTimes(1);
      expect(
        [first, second].some(
          (result) =>
            (
              result._meta?.["io.globiguard/governance"] as
                | Record<string, unknown>
                | undefined
            )?.joinedInFlightExecution === true,
        ),
      ).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it("supports paginated discovery and explicit tool disabling", async () => {
    const downstream: DownstreamMcpClient = {
      listTools: vi
        .fn()
        .mockResolvedValueOnce({
          tools: [downstreamTool],
          nextCursor: "page-2",
        })
        .mockResolvedValueOnce({
          tools: [
            {
              ...downstreamTool,
              name: "draft_email",
              annotations: { readOnlyHint: true },
            },
          ],
        }),
      callTool: vi.fn(),
    };
    const gateway = await GovernedMcpGateway.create({
      authority: new GlobiguardAuthority(backendFor("ALLOW")),
      downstream,
      serverName: "mail",
      toolGovernance: {
        send_email: { consequence: "medium" },
        draft_email: { enabled: false },
      },
      executionLedger: new InMemoryGatewayExecutionLedger(),
    });

    expect(downstream.listTools).toHaveBeenNthCalledWith(1, undefined);
    expect(downstream.listTools).toHaveBeenNthCalledWith(2, {
      cursor: "page-2",
    });
    expect(gateway.listDescriptors().map((tool) => tool.exposedName)).toEqual([
      "mail.send_email",
    ]);
  });

  it("refuses to expose high-consequence tools without downstream-native idempotency", async () => {
    const downstream: DownstreamMcpClient = {
      listTools: vi.fn(async () => ({ tools: [downstreamTool] })),
      callTool: vi.fn(),
    };
    await expect(
      GovernedMcpGateway.create({
        authority: new GlobiguardAuthority(backendFor("ALLOW")),
        downstream,
        serverName: "mail",
        executionLedger: new InMemoryGatewayExecutionLedger(),
      }),
    ).rejects.toThrow(/High-consequence.*idempotencyKeyArgument/);

    await expect(
      GovernedMcpGateway.create({
        authority: new GlobiguardAuthority(backendFor("ALLOW")),
        downstream,
        serverName: "mail",
        toolGovernance: {
          send_email: { idempotencyKeyArgument: "undeclaredKey" },
        },
        executionLedger: new InMemoryGatewayExecutionLedger(),
      }),
    ).rejects.toThrow(/does not declare.*undeclaredKey/);
  });
});

async function callGoverned(client: Client) {
  return client.callTool({
    name: "mail.send_email",
    arguments: {
      to: "patient@example.com",
      subject: "Claim update",
    },
  });
}

async function connectGateway(
  decision: GlobiguardActionAuthorizationResponse["decision"],
  onAuthorize?: (request: GlobiguardActionAuthorizationRequest) => void,
  faults: {
    authorityFailure?: Error;
    downstreamFailure?: Error;
    expiresAt?: string;
    obligations?: string[];
    idempotencyKeyArgument?: string;
    downstreamDelayMs?: number;
    omitExpiry?: boolean;
    downstreamResultText?: string;
    maxDownstreamResultBytes?: number;
    queueStatus?: "PENDING" | "APPROVED" | "REJECTED";
    queuePayloadSha256?: string;
  } = {},
) {
  const backend = backendFor(decision, onAuthorize, faults);
  const downstream: DownstreamMcpClient = {
    listTools: vi.fn(async () => ({ tools: [downstreamTool] })),
    callTool: vi.fn(async () => {
      if (faults.downstreamFailure) throw faults.downstreamFailure;
      if (faults.downstreamDelayMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, faults.downstreamDelayMs),
        );
      }
      return {
        content: [
          {
            type: "text" as const,
            text: faults.downstreamResultText ?? "Sent as msg_123",
          },
        ],
        structuredContent: { messageId: "msg_123" },
        isError: false,
      };
    }),
  };
  const gateway = await GovernedMcpGateway.create({
    authority: new GlobiguardAuthority(backend),
    downstream,
    serverName: "mail",
    actor: { id: "agent_123", type: "agent" },
    toolGovernance: {
      send_email: faults.idempotencyKeyArgument
        ? { idempotencyKeyArgument: faults.idempotencyKeyArgument }
        : { consequence: "medium" },
    },
    maxDownstreamResultBytes: faults.maxDownstreamResultBytes,
    executionLedger: new InMemoryGatewayExecutionLedger(),
  });
  const client = new Client(
    { name: "gateway-test", version: "1.0.0" },
    { capabilities: {} },
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    gateway.server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return {
    client,
    gateway,
    downstream,
    close: async () => {
      await Promise.allSettled([client.close(), gateway.server.close()]);
    },
  };
}

function backendFor(
  decision: GlobiguardActionAuthorizationResponse["decision"],
  onAuthorize?: (request: GlobiguardActionAuthorizationRequest) => void,
  faults: {
    authorityFailure?: Error;
    expiresAt?: string;
    obligations?: string[];
    omitExpiry?: boolean;
    queueStatus?: "PENDING" | "APPROVED" | "REJECTED";
    queuePayloadSha256?: string;
  } = {},
): AuthorityBackend {
  const authorization = response(
    decision,
    faults.omitExpiry
      ? null
      : (faults.expiresAt ?? new Date(Date.now() + 60_000).toISOString()),
    faults.obligations,
  );
  return {
    authorize: vi.fn(async (request) => {
      if (faults.authorityFailure) throw faults.authorityFailure;
      onAuthorize?.(request);
      return authorization;
    }),
    getAuthorization: vi.fn(async () => authorization),
    getQueueEntry: vi.fn(async (queueEntryId) => ({
      id: queueEntryId,
      orgId: "org_123",
      actionType: "mcp.mail.send_email",
      destinationSystem: "mail",
      riskScore: 0.9,
      policyId: "policy_123",
      payloadSummary: {
        sha256: faults.queuePayloadSha256 ?? "0".repeat(64),
      },
      fieldsInvolved: [],
      status: faults.queueStatus ?? "PENDING",
      createdAt: new Date().toISOString(),
      authorizationId: "authz_queue",
    })),
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
  expiresAt?: string | null,
  obligations?: string[],
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
    queueEntryId: decision === "QUEUE" ? "queue_123" : null,
    evidenceRefs: [
      {
        id: "evidence_123",
        uri: "globiguard://evidence/evidence_123",
        kind: "audit_event",
      },
    ],
    reason: `POLICY_${decision}`,
    expiresAt: expiresAt ?? undefined,
    obligations,
  };
}
