#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createAuthorityFromEnvironment } from "./authority.js";
import {
  gatewayOptionsFromConfig,
  executionLedgerFromConfig,
  parseGatewayConfig,
  resolveHttpGatewayStartup,
  selectChildEnvironment,
  type GatewayFileConfig,
} from "./cli-config.js";
import { GovernedMcpGateway, sdkDownstreamClient } from "./gateway.js";
import { GovernedHttpGateway } from "./http-gateway.js";
import { createAuthorityMcpServer } from "./server.js";

const HELP = `GlobiGuard MCP authority and governed tool gateway

Usage:
  globiguard-mcp authority
  globiguard-mcp gateway --config <path>
  globiguard-mcp gateway-http --config <path>
  globiguard-mcp --help

Authority environment:
  GLOBIGUARD_PROJECT_ID             Required outside local mode
  GLOBIGUARD_SECRET_KEY             Required outside local mode
  GLOBIGUARD_ENVIRONMENT            local, sandbox (default), or live
  GLOBIGUARD_CONTROL_PLANE_URL      Optional; defaults to api.globiguard.com
  GLOBIGUARD_REQUEST_TIMEOUT_MS     Optional bounded request deadline; default 10000

Gateway configuration never contains GlobiGuard credentials or bearer-token
values. Downstream secrets are inherited only when explicitly named in
downstream.passEnvironment. gateway-http reads its bearer token from the
environment name configured in http.bearerTokenEnvironment. Outside local
development, gateway commands require a durable file execution ledger.
`;

async function main(argv: string[]): Promise<void> {
  const command = argv[0] ?? "authority";
  if (command === "--help" || command === "-h" || command === "help") {
    process.stderr.write(HELP);
    return;
  }

  const authority = createAuthorityFromEnvironment();
  if (command === "authority") {
    if (argv.length !== 1) {
      throw new Error("authority does not accept additional arguments");
    }
    const server = createAuthorityMcpServer(authority, {
      onError: logInternalError,
    });
    await server.connect(new StdioServerTransport());
    return;
  }

  if (command !== "gateway" && command !== "gateway-http") {
    throw new Error(`Unknown command "${command}". Use --help for usage.`);
  }
  const configPath = parseConfigPath(argv.slice(1));
  const config = parseGatewayConfig(
    JSON.parse(await readFile(resolve(configPath), "utf8")) as unknown,
  );
  const httpStartup =
    command === "gateway-http"
      ? resolveHttpGatewayStartup(config, process.env)
      : undefined;

  const { downstreamClient } = await connectDownstream(config);
  try {
    const executionLedger = executionLedgerFromConfig(config, process.env);
    const createGateway = () =>
      GovernedMcpGateway.create({
        authority,
        downstream: sdkDownstreamClient(downstreamClient),
        executionLedger,
        ...gatewayOptionsFromConfig(config),
        onError: logInternalError,
      });

    if (command === "gateway") {
      const gateway = await createGateway();
      await gateway.server.connect(new StdioServerTransport());
      installShutdown(async () => {
        await Promise.allSettled([
          gateway.server.close(),
          downstreamClient.close(),
        ]);
      });
      return;
    }

    if (!httpStartup) {
      throw new Error("gateway-http configuration was not resolved");
    }
    const { http: httpConfig, bearerToken } = httpStartup;
    const httpGateway = new GovernedHttpGateway({
      createGateway,
      bearerToken,
      host: httpConfig.host,
      port: httpConfig.port,
      path: httpConfig.path,
      allowedHosts: httpConfig.allowedHosts,
      allowedOrigins: httpConfig.allowedOrigins,
      maxBodyBytes: httpConfig.maxBodyBytes,
      maxSessions: httpConfig.maxSessions,
      sessionTtlMs: httpConfig.sessionTtlMs,
      requestsPerMinute: httpConfig.requestsPerMinute,
      onError: logInternalError,
    });
    const address = await httpGateway.start();
    process.stderr.write(
      `[globiguard-mcp] gateway-http listening on ${address.host}:${address.port}${address.path}\n`,
    );
    installShutdown(async () => {
      await Promise.allSettled([httpGateway.close(), downstreamClient.close()]);
    });
  } catch (error) {
    await downstreamClient.close().catch(() => undefined);
    throw error;
  }
}

async function connectDownstream(config: GatewayFileConfig): Promise<{
  downstreamClient: Client;
}> {
  const downstreamTransport = new StdioClientTransport({
    command: config.downstream.command,
    args: config.downstream.args,
    cwd: config.downstream.cwd,
    env: selectChildEnvironment(
      getDefaultEnvironment(),
      process.env,
      config.downstream.passEnvironment,
    ),
    stderr: "inherit",
  });
  const downstreamClient = new Client(
    { name: "globiguard-governed-gateway", version: "0.1.0" },
    { capabilities: {} },
  );
  await downstreamClient.connect(downstreamTransport);
  return { downstreamClient };
}

function installShutdown(shutdown: () => Promise<void>): void {
  process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(130));
  });
  process.once("SIGTERM", () => {
    void shutdown().finally(() => process.exit(143));
  });
}

function parseConfigPath(args: string[]): string {
  if (args.length !== 2 || args[0] !== "--config" || !args[1]?.trim()) {
    throw new Error("gateway requires exactly --config <path>");
  }
  return args[1];
}

function logInternalError(error: unknown): void {
  const name = error instanceof Error ? error.name : "UnknownError";
  process.stderr.write(`[globiguard-mcp] ${name}\n`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown startup error";
  process.stderr.write(`[globiguard-mcp] ${message}\n`);
  process.exitCode = 1;
});
