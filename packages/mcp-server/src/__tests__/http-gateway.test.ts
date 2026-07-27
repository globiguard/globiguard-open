import type { GlobiguardActionAuthorizationResponse } from "@globiguard/contracts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobiguardAuthority, type AuthorityBackend } from "../authority.js";
import { InMemoryGatewayExecutionLedger } from "../execution-ledger.js";
import { GovernedMcpGateway, type DownstreamMcpClient } from "../gateway.js";
import { GovernedHttpGateway } from "../http-gateway.js";

const token = "test-token-that-is-at-least-thirty-two-characters-long";
const downstreamTool: Tool = {
  name: "move_job",
  description: "Dispatch a supervised robot job.",
  inputSchema: {
    type: "object",
    required: ["jobId"],
    properties: { jobId: { type: "string" } },
  },
  annotations: { destructiveHint: true },
};

describe("governed Streamable HTTP gateway", () => {
  const running: GovernedHttpGateway[] = [];
  const clients: Client[] = [];

  afterEach(async () => {
    await Promise.allSettled(clients.splice(0).map((client) => client.close()));
    await Promise.allSettled(running.splice(0).map((server) => server.close()));
  });

  it("requires bearer authentication and carries a governed MCP session", async () => {
    const allowedHosts = ["placeholder.invalid"];
    const downstream = downstreamClient();
    const server = createServer(allowedHosts, downstream);
    running.push(server);
    const address = await server.start();
    allowedHosts.push(`${address.host}:${address.port}`);
    const endpoint = `http://${address.host}:${address.port}${address.path}`;

    const unauthorized = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("cache-control")).toBe("no-store");

    const client = new Client(
      { name: "http-gateway-test", version: "1.0.0" },
      { capabilities: {} },
    );
    clients.push(client);
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: {
        headers: { authorization: `Bearer ${token}` },
      },
    });
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "globiguard_check_approval",
      "globiguard_reauthorize_action",
      "robots.move_job",
    ]);
    const result = await client.callTool({
      name: "robots.move_job",
      arguments: { jobId: "job_123" },
    });

    expect(result.isError).toBe(false);
    expect(downstream.callTool).toHaveBeenCalledWith(
      { name: "move_job", arguments: { jobId: "job_123" } },
      expect.objectContaining({ timeout: 60_000 }),
    );
    expect(result._meta?.["io.globiguard/governance"]).toMatchObject({
      decision: "ALLOW",
      authorizationId: "auth_http",
    });
  });

  it("rejects untrusted origins and oversized bodies before MCP handling", async () => {
    const allowedHosts = ["placeholder.invalid"];
    const server = createServer(allowedHosts, downstreamClient(), {
      maxBodyBytes: 256,
    });
    running.push(server);
    const address = await server.start();
    allowedHosts.push(`${address.host}:${address.port}`);
    const endpoint = `http://${address.host}:${address.port}${address.path}`;

    const untrustedOrigin = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        origin: "https://attacker.example",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    expect(untrustedOrigin.status).toBe(403);

    const oversized = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        padding: "x".repeat(512),
      }),
    });
    expect(oversized.status).toBe(413);
  });

  it("validates Host on every route and isolates unauthenticated rate limits", async () => {
    const allowedHosts = ["placeholder.invalid"];
    const server = createServer(allowedHosts, downstreamClient(), {
      requestsPerMinute: 1,
    });
    running.push(server);
    const address = await server.start();
    const allowedHost = `${address.host}:${address.port}`;
    const endpoint = `http://${address.host}:${address.port}${address.path}`;

    const rejectedHealth = await fetch(
      `http://${address.host}:${address.port}/healthz`,
    );
    expect(rejectedHealth.status).toBe(403);
    allowedHosts.push(allowedHost);

    const firstUnauthorized = await fetch(endpoint, {
      method: "POST",
      headers: {
        host: allowedHost,
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    expect(firstUnauthorized.status).toBe(401);

    const secondUnauthorized = await fetch(endpoint, {
      method: "POST",
      headers: {
        host: allowedHost,
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "initialize" }),
    });
    expect(secondUnauthorized.status).toBe(429);

    const authenticated = await fetch(endpoint, {
      method: "POST",
      headers: {
        host: allowedHost,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "not-initialize" }),
    });
    expect(authenticated.status).toBe(400);
  });
});

function createServer(
  allowedHosts: string[],
  downstream: DownstreamMcpClient,
  overrides: {
    maxBodyBytes?: number;
    requestsPerMinute?: number;
  } = {},
): GovernedHttpGateway {
  const authority = new GlobiguardAuthority(authorityBackend());
  return new GovernedHttpGateway({
    bearerToken: token,
    host: "127.0.0.1",
    port: 0,
    allowedHosts,
    maxBodyBytes: overrides.maxBodyBytes,
    requestsPerMinute: overrides.requestsPerMinute,
    createGateway: () =>
      GovernedMcpGateway.create({
        authority,
        downstream,
        serverName: "robots",
        toolGovernance: { move_job: { consequence: "medium" } },
        executionLedger: new InMemoryGatewayExecutionLedger(),
      }),
  });
}

function downstreamClient(): DownstreamMcpClient {
  return {
    listTools: vi.fn(async () => ({ tools: [downstreamTool] })),
    callTool: vi.fn(async () => ({
      content: [{ type: "text" as const, text: "job dispatched" }],
      structuredContent: { accepted: true },
      isError: false,
    })),
  };
}

function authorityBackend(): AuthorityBackend {
  const response: GlobiguardActionAuthorizationResponse = {
    contractVersion: "2026-04-action-beta",
    authorizationId: "auth_http",
    decision: "ALLOW",
    executable: true,
    nextAction: "EXECUTE_EXACT_ACTION_ONCE",
    approvalState: "NOT_REQUIRED",
    evidenceRefs: [],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  return {
    authorize: vi.fn(async () => response),
    getAuthorization: vi.fn(async () => response),
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
