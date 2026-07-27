import type {
  GlobiguardActionAuthorizationResponse,
  GlobiguardAuditEvent,
  GlobiguardEvidencePackageSummary,
  GlobiguardEvidenceRef,
  GlobiguardIncidentReplay,
  GlobiguardPolicy,
  GlobiguardQueueEntry,
} from "@globiguard/contracts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { describe, expect, it, vi } from "vitest";

import { GlobiguardAuthority, type AuthorityBackend } from "../authority.js";
import { createAuthorityMcpServer } from "../server.js";

describe("GlobiGuard authority MCP server", () => {
  it("advertises action-oriented tools with structured output schemas", async () => {
    const harness = await connect(response("ALLOW"));
    try {
      const listed = await harness.client.listTools();
      const govern = listed.tools.find(
        (tool) => tool.name === "globiguard_govern_action",
      );

      expect(listed.tools.map((tool) => tool.name)).toEqual([
        "globiguard_govern_action",
        "globiguard_get_authorization",
        "globiguard_check_approval",
        "globiguard_get_evidence",
        "globiguard_get_audit_event",
        "globiguard_get_evidence_package_summary",
        "globiguard_get_incident_replay",
        "globiguard_list_active_policies",
        "globiguard_get_policy",
      ]);
      expect(govern?.description).toContain("only when canExecute is true");
      expect(govern?.outputSchema).toMatchObject({
        type: "object",
        required: expect.arrayContaining(["outcome", "canExecute", "next"]),
      });
    } finally {
      await harness.close();
    }
  });

  it("returns ALLOW and BLOCK as normal business outcomes", async () => {
    const allow = await connect(response("ALLOW"));
    try {
      const result = await govern(allow.client);
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toMatchObject({
        outcome: "proceed",
        canExecute: true,
      });
    } finally {
      await allow.close();
    }

    const block = await connect(response("BLOCK"));
    try {
      const result = await govern(block.client);
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toMatchObject({
        outcome: "stop",
        canExecute: false,
        next: { action: "do_not_execute" },
      });
    } finally {
      await block.close();
    }
  });

  it("does not expose a dry-run ALLOW as executable", async () => {
    const harness = await connect(response("ALLOW"));
    try {
      const result = await harness.client.callTool({
        name: "globiguard_govern_action",
        arguments: {
          actionType: "email.send",
          destination: { type: "email", name: "claims-outbound" },
          purpose: "Plan a claim update",
          dataClasses: ["PII"],
          dryRun: true,
        },
      });
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toMatchObject({
        simulation: true,
        decision: "ALLOW",
        canExecute: false,
        next: { action: "authorize_for_execution" },
      });
    } finally {
      await harness.close();
    }
  });

  it("returns retrieved ALLOW records as non-executable history", async () => {
    const harness = await connect(response("ALLOW"));
    try {
      const result = await harness.client.callTool({
        name: "globiguard_get_authorization",
        arguments: { authorizationId: "authz_allow" },
      });
      expect(result.structuredContent).toMatchObject({
        decision: "ALLOW",
        canExecute: false,
        next: { action: "authorize_for_execution" },
      });
    } finally {
      await harness.close();
    }
  });

  it("returns actionable tool errors without leaking backend details", async () => {
    const backend = backendFor(response("ALLOW"));
    backend.authorize = vi.fn(async () => {
      throw new Error("upstream secret: sk_live_do_not_leak");
    });
    const harness = await connectBackend(backend);

    try {
      const invalid = await harness.client.callTool({
        name: "globiguard_govern_action",
        arguments: { actionType: "email.send" },
      });
      expect(invalid.isError).toBe(true);
      expect(JSON.stringify(invalid)).toContain("Invalid tool arguments");

      const failed = await govern(harness.client);
      expect(failed.isError).toBe(true);
      expect(JSON.stringify(failed)).toContain("Verify the endpoint");
      expect(JSON.stringify(failed)).not.toContain("sk_live_do_not_leak");
    } finally {
      await harness.close();
    }
  });

  it("never treats approval resolution itself as permission to execute", async () => {
    const backend = backendFor(response("QUEUE"));
    backend.getQueueEntry = vi.fn(async () => queueEntry("APPROVED"));
    const harness = await connectBackend(backend);

    try {
      const result = await harness.client.callTool({
        name: "globiguard_check_approval",
        arguments: { queueEntryId: "queue_123" },
      });
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toMatchObject({
        status: "APPROVED",
        canExecute: false,
        terminal: true,
        next: { action: "reauthorize_action" },
      });
    } finally {
      await harness.close();
    }
  });

  it("exposes metadata-safe evidence and gap-aware incident replay", async () => {
    const harness = await connect(response("ALLOW"));
    try {
      const evidence = await harness.client.callTool({
        name: "globiguard_get_evidence",
        arguments: { evidenceRefId: "evidence_123" },
      });
      expect(evidence.structuredContent).toMatchObject({
        id: "evidence_123",
        kind: "audit_event",
      });

      const audit = await harness.client.callTool({
        name: "globiguard_get_audit_event",
        arguments: { auditEventId: "audit_123" },
      });
      expect(audit.structuredContent).toMatchObject({
        id: "audit_123",
        decision: "ALLOW",
      });

      const summary = await harness.client.callTool({
        name: "globiguard_get_evidence_package_summary",
        arguments: { evidencePackageId: "package_123" },
      });
      expect(summary.structuredContent).toMatchObject({
        evidencePackageId: "package_123",
        redaction: { rawPayloadIncluded: false },
      });

      const replay = await harness.client.callTool({
        name: "globiguard_get_incident_replay",
        arguments: { correlationId: "corr_123" },
      });
      expect(replay.structuredContent).toMatchObject({
        incidentReplayId: "replay_123",
        complete: false,
        gaps: [expect.objectContaining({ status: "missing" })],
      });

      const ambiguous = await harness.client.callTool({
        name: "globiguard_get_incident_replay",
        arguments: {
          correlationId: "corr_123",
          authorizationId: "authz_allow",
        },
      });
      expect(ambiguous.isError).toBe(true);
      expect(JSON.stringify(ambiguous)).toContain("exactly one");
    } finally {
      await harness.close();
    }
  });

  it("exposes active policies as both concise tools and MCP resources", async () => {
    const harness = await connect(response("ALLOW"));
    try {
      const listResult = await harness.client.callTool({
        name: "globiguard_list_active_policies",
        arguments: {},
      });
      expect(listResult.structuredContent).toMatchObject({
        policies: [
          {
            id: "policy_123",
            name: "Outbound PII",
            resourceUri: "globiguard://policies/policy_123",
          },
        ],
      });

      const resources = await harness.client.listResources();
      expect(resources.resources).toHaveLength(1);
      const resource = await harness.client.readResource({
        uri: resources.resources[0]!.uri,
      });
      const content = resource.contents[0]!;
      expect("text" in content).toBe(true);
      if (!("text" in content)) {
        throw new Error("Expected a text policy resource");
      }
      expect(JSON.parse(content.text)).toMatchObject({
        id: "policy_123",
        rules: [{ action: "REQUIRE_APPROVAL" }],
      });
    } finally {
      await harness.close();
    }
  });

  it("does not leak backend details through MCP resources", async () => {
    const backend = backendFor(response("ALLOW"));
    backend.listActivePolicies = vi.fn(async () => {
      throw new Error("upstream secret: ggsk_do_not_leak");
    });
    backend.getPolicy = vi.fn(async () => {
      throw new Error("database password: do_not_leak");
    });
    const harness = await connectBackend(backend);

    try {
      await expect(harness.client.listResources()).rejects.toThrow(
        "policy resources are temporarily unavailable",
      );
      await expect(
        harness.client.readResource({
          uri: "globiguard://policies/policy_123",
        }),
      ).rejects.toThrow("policy resource is unavailable");

      await expect(harness.client.listResources()).rejects.not.toThrow(
        /ggsk_do_not_leak|database password|do_not_leak/,
      );
    } finally {
      await harness.close();
    }
  });
});

async function govern(client: Client) {
  return client.callTool({
    name: "globiguard_govern_action",
    arguments: {
      actionType: "email.send",
      destination: { type: "email", name: "claims-outbound" },
      purpose: "Send a claim update",
      dataClasses: ["PII"],
      payload: {
        recipient: "patient@example.com",
        claim: "CLAIM-SECRET-123",
      },
    },
  });
}

async function connect(authorization: GlobiguardActionAuthorizationResponse) {
  return connectBackend(backendFor(authorization));
}

async function connectBackend(backend: AuthorityBackend): Promise<{
  client: Client;
  server: Server;
  close: () => Promise<void>;
}> {
  const server = createAuthorityMcpServer(new GlobiguardAuthority(backend));
  const client = new Client(
    { name: "globiguard-mcp-test", version: "1.0.0" },
    { capabilities: {} },
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return {
    client,
    server,
    close: async () => {
      await Promise.allSettled([client.close(), server.close()]);
    },
  };
}

function backendFor(
  authorization: GlobiguardActionAuthorizationResponse,
): AuthorityBackend {
  return {
    authorize: vi.fn(async () => authorization),
    getAuthorization: vi.fn(async () => authorization),
    getQueueEntry: vi.fn(async () => queueEntry("PENDING")),
    getEvidence: vi.fn(async () => evidenceRef),
    getAuditEvent: vi.fn(async () => auditEvent),
    getEvidencePackageSummary: vi.fn(async () => evidenceSummary),
    getIncidentReplay: vi.fn(async () => incidentReplay),
    listActivePolicies: vi.fn(async () => [policy]),
    getPolicy: vi.fn(async () => policy),
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
    queueEntryId: decision === "QUEUE" ? "queue_123" : null,
    evidenceRefs: [],
    reason: `POLICY_${decision}`,
    expiresAt:
      decision === "ALLOW"
        ? new Date(Date.now() + 60_000).toISOString()
        : undefined,
  };
}

function queueEntry(
  status: GlobiguardQueueEntry["status"],
): GlobiguardQueueEntry {
  return {
    id: "queue_123",
    orgId: "org_123",
    actionType: "email.send",
    destinationSystem: "email",
    riskScore: 0.9,
    policyId: "policy_123",
    payloadSummary: {},
    fieldsInvolved: ["recipient"],
    status,
    authorizationId: "authz_queue",
    createdAt: "2026-07-25T12:00:00.000Z",
    resolvedAt: status === "PENDING" ? null : "2026-07-25T12:05:00.000Z",
  };
}

const policy: GlobiguardPolicy = {
  id: "policy_123",
  orgId: "org_123",
  name: "Outbound PII",
  industry: "MEDICAL",
  version: 3,
  active: true,
  createdAt: "2026-07-20T12:00:00.000Z",
  updatedAt: "2026-07-25T12:00:00.000Z",
  rules: [
    {
      id: "rule_123",
      policyId: "policy_123",
      fieldName: "email",
      sensitivityTier: "CONFIDENTIAL",
      action: "REQUIRE_APPROVAL",
      order: 1,
    },
  ],
};

const evidenceRef: GlobiguardEvidenceRef = {
  id: "evidence_123",
  uri: "evidence://audit-events/audit_123",
  kind: "audit_event",
  checksum: "a".repeat(64),
};

const auditEvent: GlobiguardAuditEvent = {
  id: "audit_123",
  orgId: "org_123",
  policyId: "policy_123",
  policyVersion: 3,
  agentIdHash: "agent_hash",
  actionType: "email.send",
  destinationSystem: "email",
  decision: "ALLOW",
  governanceScore: 0.92,
  maskedFieldCount: 1,
  maskedFieldTypes: ["EMAIL"],
  blockedFieldCount: 0,
  frameworkTags: ["HIPAA"],
  controlRefs: ["HIPAA-164.312"],
  evidenceRefs: ["evidence://audit-events/audit_123"],
  timestamp: "2026-07-25T12:00:00.000Z",
  maskedFields: [],
  _scoreDisclaimer:
    "Governance score is policy evidence, not a safety guarantee.",
};

const evidenceSummary: GlobiguardEvidencePackageSummary = {
  boundary: {
    authorityLevel: "browser_read",
    browserSafe: true,
    serverSecretRequired: false,
    rawPayloadAllowed: false,
  },
  schemaVersion: "2026-05-evidence-summary-beta",
  evidencePackageId: "package_123",
  status: "ready",
  scope: {},
  decisionCounts: { ALLOW: 1 },
  redaction: {
    mode: "metadata_only",
    rawPayloadIncluded: false,
  },
  sourceRefs: [{ kind: "audit_event", id: "audit_123" }],
  disclaimers: ["Raw customer payloads are excluded."],
};

const incidentReplay: GlobiguardIncidentReplay = {
  boundary: {
    authorityLevel: "browser_read",
    browserSafe: true,
    serverSecretRequired: false,
    rawPayloadAllowed: false,
  },
  schemaVersion: "2026-05-incident-replay-beta",
  incidentReplayId: "replay_123",
  generatedAt: "2026-07-25T12:10:00.000Z",
  lookup: { correlationId: "corr_123" },
  complete: false,
  correlationIds: ["corr_123"],
  timeline: [],
  gaps: [
    {
      id: "gap_123",
      status: "missing",
      expectedKind: "evidence_exported",
      reason: "No evidence package has been generated.",
    },
  ],
  disclaimers: ["A missing segment is not evidence that no event occurred."],
};
