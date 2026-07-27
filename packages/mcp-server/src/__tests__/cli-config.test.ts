import { describe, expect, it } from "vitest";

import {
  gatewayOptionsFromConfig,
  executionLedgerFromConfig,
  parseGatewayConfig,
  resolveHttpGatewayStartup,
  selectChildEnvironment,
} from "../cli-config.js";

describe("MCP gateway configuration", () => {
  it("resolves HTTP bearer configuration before downstream startup", () => {
    const config = parseGatewayConfig({
      serverName: "github",
      downstream: { command: "npx" },
      http: {
        allowedHosts: ["mcp.example.com"],
        bearerTokenEnvironment: "MCP_TOKEN",
      },
    });

    expect(() => resolveHttpGatewayStartup(config, {})).toThrow(
      "MCP_TOKEN to be set",
    );
    expect(() =>
      resolveHttpGatewayStartup(config, { MCP_TOKEN: "too-short" }),
    ).toThrow("at least 32 characters");
    expect(
      resolveHttpGatewayStartup(config, {
        MCP_TOKEN: "a".repeat(32),
      }).bearerToken,
    ).toBe("a".repeat(32));
  });

  it("parses a least-privilege downstream configuration", () => {
    const config = parseGatewayConfig({
      serverName: "github",
      downstream: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        passEnvironment: ["GITHUB_TOKEN"],
      },
      defaults: {
        purpose: "Maintain approved repositories",
        dataClasses: ["INTERNAL"],
      },
      tools: {
        create_issue: {
          actionType: "github.issue.create",
          riskScore: 0.6,
        },
        delete_repository: { enabled: false },
      },
      http: {
        allowedHosts: ["mcp.example.com"],
      },
    });

    expect(config.downstreamTimeoutMs).toBe(60_000);
    expect(config.http).toMatchObject({
      host: "127.0.0.1",
      port: 3001,
      bearerTokenEnvironment: "GLOBIGUARD_MCP_BEARER_TOKEN",
    });
    expect(gatewayOptionsFromConfig(config)).toMatchObject({
      serverName: "github",
      defaultPurpose: "Maintain approved repositories",
      toolGovernance: {
        create_issue: {
          actionType: "github.issue.create",
          riskScore: 0.6,
        },
        delete_repository: { enabled: false },
      },
    });
  });

  it("rejects unknown fields and unsafe environment variable names", () => {
    expect(() =>
      parseGatewayConfig({
        serverName: "github",
        downstream: {
          command: "npx",
          passEnvironment: ["GITHUB_TOKEN;echo"],
        },
      }),
    ).toThrow();
    expect(() =>
      parseGatewayConfig({
        serverName: "github",
        downstream: { command: "npx" },
        secretKey: "must-not-live-in-config",
      }),
    ).toThrow();
  });

  it("passes only explicitly selected downstream secrets", () => {
    expect(
      selectChildEnvironment(
        { PATH: "safe-path" },
        {
          GITHUB_TOKEN: "github-secret",
          AWS_SECRET_ACCESS_KEY: "unrelated-secret",
        },
        ["GITHUB_TOKEN", "GITHUB_TOKEN"],
      ),
    ).toEqual({
      PATH: "safe-path",
      GITHUB_TOKEN: "github-secret",
    });
  });

  it("fails clearly when an explicitly requested variable is absent", () => {
    expect(() => selectChildEnvironment({}, {}, ["GITHUB_TOKEN"])).toThrow(
      /GITHUB_TOKEN.*not set/,
    );
  });

  it("requires an explicit TLS proxy declaration for non-loopback binding", () => {
    expect(() =>
      parseGatewayConfig({
        serverName: "github",
        downstream: { command: "npx" },
        http: {
          host: "0.0.0.0",
          allowedHosts: ["mcp.example.com"],
        },
      }),
    ).toThrow(/TLS termination/);

    expect(
      parseGatewayConfig({
        serverName: "github",
        downstream: { command: "npx" },
        http: {
          host: "0.0.0.0",
          allowedHosts: ["mcp.example.com"],
          tlsTerminatedByProxy: true,
        },
      }).http,
    ).toMatchObject({ host: "0.0.0.0", tlsTerminatedByProxy: true });
  });

  it("requires a durable ledger outside local development", () => {
    const missing = parseGatewayConfig({
      serverName: "github",
      downstream: { command: "npx" },
    });
    expect(() => executionLedgerFromConfig(missing, {})).toThrow(
      /executionLedger.mode=file/,
    );
    expect(() =>
      executionLedgerFromConfig(
        parseGatewayConfig({
          serverName: "github",
          downstream: { command: "npx" },
          executionLedger: { mode: "memory" },
        }),
        { GLOBIGUARD_ENVIRONMENT: "live" },
      ),
    ).toThrow(/permitted only.*local/);

    expect(
      executionLedgerFromConfig(missing, { GLOBIGUARD_ENVIRONMENT: "local" }),
    ).toBeDefined();
  });
});
