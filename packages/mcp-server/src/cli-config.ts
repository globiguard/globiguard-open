import {
  GLOBIGUARD_DATA_CLASSES,
  GLOBIGUARD_DESTINATION_SYSTEM_TYPES,
} from "@globiguard/contracts";
import { z } from "zod";

import type {
  GatewayToolGovernance,
  GovernedGatewayOptions,
} from "./gateway.js";
import {
  FileGatewayExecutionLedger,
  InMemoryGatewayExecutionLedger,
  type GatewayExecutionLedger,
} from "./execution-ledger.js";

const governanceSchema = z
  .object({
    enabled: z.boolean().optional(),
    actionType: z.string().trim().min(1).max(128).optional(),
    destination: z
      .object({
        type: z.enum(GLOBIGUARD_DESTINATION_SYSTEM_TYPES).optional(),
        name: z.string().trim().min(1).max(256).optional(),
        resource: z.string().trim().min(1).max(512).optional(),
        tenantId: z.string().trim().min(1).max(256).optional(),
        region: z.string().trim().min(1).max(128).optional(),
      })
      .strict()
      .optional(),
    purpose: z.string().trim().min(1).max(1000).optional(),
    dataClasses: z.array(z.enum(GLOBIGUARD_DATA_CLASSES)).max(16).optional(),
    fieldsInvolved: z
      .array(z.string().trim().min(1).max(256))
      .max(128)
      .optional(),
    riskScore: z.number().min(0).max(1).optional(),
    policyId: z.string().trim().min(1).max(256).optional(),
    idempotencyKeyArgument: z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/)
      .optional(),
    consequence: z.enum(["low", "medium", "high"]).optional(),
  })
  .strict();

export const gatewayConfigSchema = z
  .object({
    serverName: z.string().trim().min(1).max(128),
    connectorInstanceId: z.string().trim().min(1).max(256).optional(),
    connectorManifestVersion: z.string().trim().min(1).max(128).optional(),
    namespace: z.string().trim().min(1).max(48).optional(),
    downstream: z
      .object({
        command: z.string().trim().min(1).max(1024),
        args: z.array(z.string().max(4096)).max(256).default([]),
        cwd: z.string().trim().min(1).max(4096).optional(),
        passEnvironment: z
          .array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/))
          .max(128)
          .default([]),
      })
      .strict(),
    actor: z
      .object({
        id: z.string().trim().min(1).max(256).optional(),
        type: z
          .enum(["human", "agent", "service", "workflow"])
          .default("agent"),
        displayName: z.string().trim().min(1).max(256).optional(),
      })
      .strict()
      .optional(),
    defaults: z
      .object({
        purpose: z.string().trim().min(1).max(1000).optional(),
        dataClasses: z
          .array(z.enum(GLOBIGUARD_DATA_CLASSES))
          .max(16)
          .optional(),
        destination: z
          .object({
            type: z.enum(GLOBIGUARD_DESTINATION_SYSTEM_TYPES).optional(),
            name: z.string().trim().min(1).max(256).optional(),
            resource: z.string().trim().min(1).max(512).optional(),
            tenantId: z.string().trim().min(1).max(256).optional(),
            region: z.string().trim().min(1).max(128).optional(),
          })
          .strict()
          .optional(),
        policyId: z.string().trim().min(1).max(256).optional(),
      })
      .strict()
      .default({}),
    tools: z.record(z.string(), governanceSchema).default({}),
    downstreamTimeoutMs: z
      .number()
      .int()
      .positive()
      .max(3_600_000)
      .default(60_000),
    maxDiscoveredTools: z.number().int().positive().max(10_000).default(1_000),
    maxDownstreamResultBytes: z
      .number()
      .int()
      .positive()
      .max(64 * 1024 * 1024)
      .default(8 * 1024 * 1024),
    executionLedger: z
      .discriminatedUnion("mode", [
        z
          .object({
            mode: z.literal("file"),
            directory: z.string().trim().min(1).max(4096),
            maxEntries: z
              .number()
              .int()
              .positive()
              .max(1_000_000)
              .default(100_000),
          })
          .strict(),
        z
          .object({
            mode: z.literal("memory"),
            maxEntries: z
              .number()
              .int()
              .positive()
              .max(100_000)
              .default(10_000),
            ttlMs: z
              .number()
              .int()
              .min(60_000)
              .max(7 * 24 * 60 * 60 * 1000)
              .default(24 * 60 * 60 * 1000),
          })
          .strict(),
      ])
      .optional(),
    http: z
      .object({
        host: z.string().trim().min(1).max(253).default("127.0.0.1"),
        port: z.number().int().min(1).max(65_535).default(3001),
        path: z
          .string()
          .trim()
          .regex(/^\/[A-Za-z0-9._~/-]*$/)
          .default("/mcp"),
        bearerTokenEnvironment: z
          .string()
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
          .default("GLOBIGUARD_MCP_BEARER_TOKEN"),
        allowedHosts: z.array(z.string().trim().min(1).max(253)).min(1).max(64),
        allowedOrigins: z.array(z.string().url().max(2048)).max(64).default([]),
        maxBodyBytes: z
          .number()
          .int()
          .positive()
          .max(10 * 1024 * 1024)
          .default(2 * 1024 * 1024),
        maxSessions: z.number().int().positive().max(10_000).default(100),
        sessionTtlMs: z
          .number()
          .int()
          .positive()
          .max(7 * 24 * 60 * 60 * 1000)
          .default(24 * 60 * 60 * 1000),
        requestsPerMinute: z
          .number()
          .int()
          .positive()
          .max(100_000)
          .default(600),
        tlsTerminatedByProxy: z.boolean().default(false),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((config, context) => {
    if (
      config.http &&
      !isLoopbackHost(config.http.host) &&
      !config.http.tlsTerminatedByProxy
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["http", "tlsTerminatedByProxy"],
        message:
          "Non-loopback HTTP binding requires explicit TLS termination by a trusted reverse proxy",
      });
    }
  });

export type GatewayFileConfig = z.infer<typeof gatewayConfigSchema>;
export type HttpGatewayConfig = NonNullable<GatewayFileConfig["http"]>;

export function parseGatewayConfig(value: unknown): GatewayFileConfig {
  return gatewayConfigSchema.parse(value);
}

export function resolveHttpGatewayStartup(
  config: GatewayFileConfig,
  environment: NodeJS.ProcessEnv,
): { http: HttpGatewayConfig; bearerToken: string } {
  if (!config.http) {
    throw new Error(
      "gateway-http requires an http section in the gateway config",
    );
  }
  const bearerToken = environment[config.http.bearerTokenEnvironment];
  if (!bearerToken) {
    throw new Error(
      `gateway-http requires ${config.http.bearerTokenEnvironment} to be set`,
    );
  }
  if (bearerToken.length < 32) {
    throw new Error(
      `gateway-http requires ${config.http.bearerTokenEnvironment} to contain at least 32 characters`,
    );
  }
  return { http: config.http, bearerToken };
}

export function gatewayOptionsFromConfig(
  config: GatewayFileConfig,
): Pick<
  GovernedGatewayOptions,
  | "serverName"
  | "connectorInstanceId"
  | "connectorManifestVersion"
  | "namespace"
  | "actor"
  | "defaultPurpose"
  | "defaultDataClasses"
  | "defaultDestination"
  | "defaultPolicyId"
  | "toolGovernance"
  | "downstreamTimeoutMs"
  | "maxDiscoveredTools"
  | "maxDownstreamResultBytes"
> {
  return {
    serverName: config.serverName,
    connectorInstanceId: config.connectorInstanceId,
    connectorManifestVersion: config.connectorManifestVersion,
    namespace: config.namespace,
    actor: config.actor,
    defaultPurpose: config.defaults.purpose,
    defaultDataClasses: config.defaults.dataClasses,
    defaultDestination: config.defaults.destination,
    defaultPolicyId: config.defaults.policyId,
    toolGovernance: config.tools as Record<string, GatewayToolGovernance>,
    downstreamTimeoutMs: config.downstreamTimeoutMs,
    maxDiscoveredTools: config.maxDiscoveredTools,
    maxDownstreamResultBytes: config.maxDownstreamResultBytes,
  };
}

export function executionLedgerFromConfig(
  config: GatewayFileConfig,
  environment: NodeJS.ProcessEnv,
): GatewayExecutionLedger {
  const ledger = config.executionLedger;
  const globiguardEnvironment = environment.GLOBIGUARD_ENVIRONMENT ?? "sandbox";
  if (!ledger) {
    if (globiguardEnvironment === "local") {
      return new InMemoryGatewayExecutionLedger();
    }
    throw new Error(
      "gateway requires executionLedger.mode=file outside GLOBIGUARD_ENVIRONMENT=local",
    );
  }
  if (ledger.mode === "memory") {
    if (globiguardEnvironment !== "local") {
      throw new Error(
        "executionLedger.mode=memory is permitted only in GLOBIGUARD_ENVIRONMENT=local",
      );
    }
    return new InMemoryGatewayExecutionLedger(ledger.maxEntries, ledger.ttlMs);
  }
  return new FileGatewayExecutionLedger({
    directory: ledger.directory,
    maxEntries: ledger.maxEntries,
  });
}

export function selectChildEnvironment(
  inheritedSafeEnvironment: Record<string, string>,
  parentEnvironment: NodeJS.ProcessEnv,
  names: string[],
): Record<string, string> {
  const selected = { ...inheritedSafeEnvironment };
  for (const name of [...new Set(names)]) {
    const value = parentEnvironment[name];
    if (value === undefined) {
      throw new Error(
        `Downstream environment variable ${name} was requested but is not set`,
      );
    }
    selected[name] = value;
  }
  return selected;
}

function isLoopbackHost(value: string): boolean {
  return (
    value === "127.0.0.1" ||
    value === "::1" ||
    value === "localhost" ||
    value.endsWith(".localhost")
  );
}
