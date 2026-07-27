import type {
  GlobiguardActionActor,
  GlobiguardDataClass,
  GlobiguardDestinationSystem,
} from "@globiguard/contracts";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { GlobiguardAuthority } from "./authority.js";
import type { GatewayExecutionLedger } from "./execution-ledger.js";
import {
  boundedJsonUtf8Size,
  canonicalJson,
  sha256,
  summarizePayload,
} from "./summarize.js";
import type {
  GovernedToolDescriptor,
  GovernanceDecisionEnvelope,
} from "./types.js";

export interface DownstreamMcpClient {
  listTools(params?: {
    cursor?: string;
  }): Promise<{ tools: Tool[]; nextCursor?: string }>;
  callTool(
    params: { name: string; arguments?: Record<string, unknown> },
    options?: { signal?: AbortSignal; timeout?: number },
  ): Promise<CallToolResult>;
}

export interface GatewayToolGovernance {
  enabled?: boolean;
  actionType?: string;
  destination?: Partial<GlobiguardDestinationSystem>;
  purpose?: string;
  dataClasses?: GlobiguardDataClass[];
  fieldsInvolved?: string[];
  riskScore?: number;
  policyId?: string;
  idempotencyKeyArgument?: string;
  consequence?: "low" | "medium" | "high";
}

export interface GovernedGatewayOptions {
  authority: GlobiguardAuthority;
  downstream: DownstreamMcpClient;
  serverName: string;
  /** Stable identity of this configured downstream connection. */
  connectorInstanceId?: string;
  /** Version of the administrator-approved connector mapping. */
  connectorManifestVersion?: string;
  namespace?: string;
  actor?: GlobiguardActionActor;
  defaultPurpose?: string;
  defaultDataClasses?: GlobiguardDataClass[];
  defaultDestination?: Partial<GlobiguardDestinationSystem>;
  defaultPolicyId?: string;
  toolGovernance?: Record<string, GatewayToolGovernance>;
  downstreamTimeoutMs?: number;
  maxToolPages?: number;
  maxDiscoveredTools?: number;
  maxDownstreamResultBytes?: number;
  executionLedger: GatewayExecutionLedger;
  onError?: (error: unknown) => void;
}

export class GovernedMcpGateway {
  readonly server: Server;
  private readonly executionLedger: GatewayExecutionLedger;

  private readonly toolByExposedName = new Map<
    string,
    { tool: Tool; descriptor: GovernedToolDescriptor }
  >();

  private constructor(private readonly options: GovernedGatewayOptions) {
    this.executionLedger = options.executionLedger;
    this.server = new Server(
      {
        name: `globiguard-gateway-${normalizeNamespace(options.serverName)}`,
        version: "0.1.0",
      },
      {
        capabilities: { tools: { listChanged: true } },
        instructions:
          "Every tool in this server is execution-gated by GlobiGuard. A downstream tool is called only after an exact-argument ALLOW decision. MODIFY, QUEUE, and BLOCK return structured governance outcomes without side effects.",
      },
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        approvalStatusTool(),
        reauthorizationTool(),
        ...[...this.toolByExposedName.values()].map(({ tool, descriptor }) =>
          mirroredTool(tool, descriptor),
        ),
      ],
    }));
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request, extra) =>
        this.call(
          request.params.name,
          request.params.arguments,
          extra.signal,
          `${extra.sessionId ?? "stdio"}:${String(extra.requestId)}`,
        ),
    );
  }

  static async create(
    options: GovernedGatewayOptions,
  ): Promise<GovernedMcpGateway> {
    assertOptions(options);
    const gateway = new GovernedMcpGateway(options);
    await gateway.refreshTools();
    return gateway;
  }

  listDescriptors(): GovernedToolDescriptor[] {
    return [...this.toolByExposedName.values()].map(
      ({ descriptor }) => descriptor,
    );
  }

  async refreshTools(): Promise<void> {
    const discovered: Tool[] = [];
    let cursor: string | undefined;
    const maxPages = this.options.maxToolPages ?? 100;
    const maxTools = this.options.maxDiscoveredTools ?? 1_000;

    for (let page = 0; page < maxPages; page += 1) {
      const result = await this.options.downstream.listTools(
        cursor ? { cursor } : undefined,
      );
      discovered.push(...result.tools);
      if (discovered.length > maxTools) {
        throw new Error(
          `Downstream MCP server exceeded the ${maxTools}-tool discovery limit`,
        );
      }
      cursor = result.nextCursor;
      if (!cursor) break;
      if (page === maxPages - 1) {
        throw new Error(
          `Downstream MCP server exceeded the ${maxPages}-page discovery limit`,
        );
      }
    }

    const namespace = normalizeNamespace(
      this.options.namespace ?? this.options.serverName,
    );
    const next = new Map<
      string,
      { tool: Tool; descriptor: GovernedToolDescriptor }
    >();

    for (const tool of discovered) {
      const governance = this.options.toolGovernance?.[tool.name];
      if (governance?.enabled === false) continue;
      const exposedName = governedToolName(namespace, tool.name);
      if (next.has(exposedName)) {
        throw new Error(
          `Downstream MCP tools collide on governed name "${exposedName}"`,
        );
      }

      const descriptor = buildDescriptor(
        exposedName,
        tool,
        governance,
        this.options,
      );
      assertHighConsequenceIdempotency(tool, descriptor);
      next.set(exposedName, {
        tool,
        descriptor,
      });
    }

    this.toolByExposedName.clear();
    for (const [name, entry] of next) {
      this.toolByExposedName.set(name, entry);
    }
    if (this.server.transport) {
      await this.server.sendToolListChanged();
    }
  }

  private async call(
    exposedName: string,
    args: Record<string, unknown> | undefined,
    signal: AbortSignal,
    requestIdentity: string,
    approvalQueueEntryId?: string,
  ): Promise<CallToolResult> {
    if (exposedName === APPROVAL_STATUS_TOOL) {
      try {
        const queueEntryId = requiredStringArgument(args, "queueEntryId", 256);
        return structuredResult(
          await this.options.authority.checkApproval(queueEntryId),
        );
      } catch (error) {
        this.options.onError?.(error);
        return gatewayError(
          "GlobiGuard could not retrieve the approval status. The downstream tool remains stopped.",
          true,
        );
      }
    }
    if (exposedName === REAUTHORIZE_TOOL) {
      return this.continueApprovedAction(args, signal, requestIdentity);
    }
    const entry = this.toolByExposedName.get(exposedName);
    if (!entry) {
      return gatewayError(
        `Unknown governed tool "${exposedName}". Refresh the tool list and try again.`,
        true,
      );
    }

    const exactArguments = args ?? {};
    const before = summarizePayload(
      exactArguments,
      `Arguments for ${entry.descriptor.serverName}.${entry.descriptor.downstreamName}`,
    );
    let idempotencyKey: string | undefined;
    try {
      idempotencyKey = deriveIdempotencyKey(entry.descriptor, exactArguments);
    } catch {
      return gatewayError(
        `The governed tool requires a non-empty string argument named "${entry.descriptor.governance.idempotencyKeyArgument}" for retry-safe execution, so the downstream tool was not called.`,
        false,
      );
    }
    let decision: GovernanceDecisionEnvelope;
    try {
      decision = await this.options.authority.govern({
        actionType:
          entry.descriptor.governance.actionType ??
          `mcp.${entry.descriptor.serverName}.${entry.descriptor.downstreamName}`,
        destination: {
          type: entry.descriptor.governance.destinationType ?? "custom",
          name:
            entry.descriptor.governance.destinationName ??
            entry.descriptor.serverName,
          resource:
            entry.descriptor.governance.destinationResource ??
            entry.descriptor.downstreamName,
          tenantId: entry.descriptor.governance.destinationTenantId,
          region: entry.descriptor.governance.destinationRegion,
        },
        purpose:
          entry.descriptor.governance.purpose ??
          `Invoke ${entry.descriptor.downstreamName} on ${entry.descriptor.serverName}`,
        dataClasses: entry.descriptor.governance.dataClasses,
        fieldsInvolved: entry.descriptor.governance.fieldsInvolved,
        actor: this.options.actor ?? { type: "agent" },
        payloadSummary: before,
        riskScore: entry.descriptor.governance.riskScore,
        policyId:
          this.options.toolGovernance?.[entry.descriptor.downstreamName]
            ?.policyId ?? this.options.defaultPolicyId,
        idempotencyKey,
        approvalQueueEntryId,
        connector: entry.descriptor.connector,
      });
    } catch (error) {
      this.options.onError?.(error);
      return gatewayError(
        "GlobiGuard authorization is unavailable, so the downstream tool was not called. Verify authority connectivity and credentials before retrying.",
        true,
      );
    }

    if (!decision.canExecute || decision.decision !== "ALLOW") {
      return governanceStop(decision);
    }
    if (decision.obligations.length > 0) {
      return gatewayError(
        "GlobiGuard authorized the action with obligations that this gateway cannot safely interpret or enforce, so the downstream tool was not called. Apply the obligations through a typed enforcement handler and request a new authorization.",
        false,
        decision,
      );
    }
    if (!authorizationIsCurrent(decision.expiresAt)) {
      return gatewayError(
        "GlobiGuard authorization expired or had an invalid expiry, so the downstream tool was not called. Request a new authorization.",
        true,
        decision,
      );
    }

    const after = summarizePayload(
      exactArguments,
      `Arguments for ${entry.descriptor.serverName}.${entry.descriptor.downstreamName}`,
    );
    if (before.sha256 !== after.sha256) {
      return gatewayError(
        "Tool arguments changed after authorization, so the downstream tool was not called. Retry with stable arguments.",
        true,
        decision,
      );
    }

    const executionKey = idempotencyKey
      ? `idempotency:${idempotencyKey}`
      : `request:${sha256(requestIdentity)}`;
    try {
      const execution = await this.executionLedger.run(
        executionKey,
        before.sha256,
        async () => {
          try {
            const result = await this.options.downstream.callTool(
              {
                name: entry.descriptor.downstreamName,
                arguments: exactArguments,
              },
              {
                signal,
                timeout: this.options.downstreamTimeoutMs ?? 60_000,
              },
            );
            const maximumResultBytes =
              this.options.maxDownstreamResultBytes ?? 8 * 1024 * 1024;
            const measuredResult = boundedJsonUtf8Size(
              result,
              maximumResultBytes,
            );
            if (measuredResult.exceeded) {
              return gatewayError(
                `The downstream MCP tool completed, but its result exceeded the gateway's ${maximumResultBytes}-byte response limit. The result was suppressed and this execution key remains consumed.`,
                false,
                decision,
                "result_suppressed",
              );
            }
            return result;
          } catch (error) {
            this.options.onError?.(error);
            return gatewayError(
              "GlobiGuard authorized the action, but the downstream MCP tool failed or its execution outcome is unknown. The gateway will not repeat this execution key automatically.",
              false,
              decision,
              "outcome_unknown",
            );
          }
        },
      );
      if (execution.kind === "duplicate") {
        return gatewayError(
          "This execution key was already consumed, so the downstream tool was not called again. Inspect the earlier result or the downstream system before creating a new execution key.",
          false,
          decision,
        );
      }
      const result = execution.result;
      return {
        ...result,
        _meta: {
          ...(result._meta ?? {}),
          "io.globiguard/governance": {
            ...executionMetadata(decision, before.sha256),
            executionKeySha256: sha256(executionKey),
            joinedInFlightExecution: execution.kind === "joined",
          },
        },
      };
    } catch (error) {
      this.options.onError?.(error);
      return gatewayError(
        "The execution ledger rejected this call, so the downstream tool was not called. The key may conflict with different arguments or the bounded ledger may be at capacity.",
        false,
        decision,
      );
    }
  }

  private async continueApprovedAction(
    args: Record<string, unknown> | undefined,
    signal: AbortSignal,
    requestIdentity: string,
  ): Promise<CallToolResult> {
    let queueEntryId: string;
    let governedTool: string;
    let exactArguments: Record<string, unknown>;
    try {
      queueEntryId = requiredStringArgument(args, "queueEntryId", 256);
      governedTool = requiredStringArgument(args, "governedTool", 128);
      const suppliedArguments = args?.arguments;
      if (
        !suppliedArguments ||
        typeof suppliedArguments !== "object" ||
        Array.isArray(suppliedArguments)
      ) {
        throw new Error("arguments must be an object");
      }
      exactArguments = suppliedArguments as Record<string, unknown>;
    } catch {
      return gatewayError(
        "Approval continuation requires queueEntryId, governedTool, and the exact current arguments object. The downstream tool was not called.",
        false,
      );
    }

    const entry = this.toolByExposedName.get(governedTool);
    if (!entry) {
      return gatewayError(
        "Approval continuation named an unknown governed tool. Refresh the tool list; the downstream tool was not called.",
        false,
      );
    }
    const payloadSummary = summarizePayload(
      exactArguments,
      `Arguments for ${entry.descriptor.serverName}.${entry.descriptor.downstreamName}`,
    );
    try {
      const approval = await this.options.authority.checkApprovalForAction(
        queueEntryId,
        {
          actionType:
            entry.descriptor.governance.actionType ??
            `mcp.${entry.descriptor.serverName}.${entry.descriptor.downstreamName}`,
          destinationName:
            entry.descriptor.governance.destinationName ??
            entry.descriptor.serverName,
          payloadSha256: payloadSummary.sha256,
          policyId:
            this.options.toolGovernance?.[entry.descriptor.downstreamName]
              ?.policyId ?? this.options.defaultPolicyId,
        },
      );
      if (
        approval.next.action !== "reauthorize_action" ||
        approval.actionBinding?.matchesCurrentAction !== true
      ) {
        return structuredResult(approval);
      }
    } catch (error) {
      this.options.onError?.(error);
      return gatewayError(
        "GlobiGuard could not verify the approval against the exact current action. The downstream tool was not called.",
        true,
      );
    }

    // Approval never calls the downstream tool. This explicit continuation
    // performs an entirely fresh exact-argument authorization first.
    return this.call(
      governedTool,
      exactArguments,
      signal,
      `${requestIdentity}:approval:${sha256(queueEntryId)}`,
      queueEntryId,
    );
  }
}

const APPROVAL_STATUS_TOOL = "globiguard_check_approval";
const REAUTHORIZE_TOOL = "globiguard_reauthorize_action";

function approvalStatusTool(): Tool {
  return {
    name: APPROVAL_STATUS_TOOL,
    title: "Check GlobiGuard approval",
    description:
      "Read a queued action's status. This tool never executes or authorizes the downstream action.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["queueEntryId"],
      properties: {
        queueEntryId: { type: "string", minLength: 1, maxLength: 256 },
      },
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  };
}

function reauthorizationTool(): Tool {
  return {
    name: REAUTHORIZE_TOOL,
    title: "Reauthorize approved action",
    description:
      "Continue an approved queue entry by binding it to the exact current tool arguments and requesting a fresh authorization. Approval alone never executes.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["queueEntryId", "governedTool", "arguments"],
      properties: {
        queueEntryId: { type: "string", minLength: 1, maxLength: 256 },
        governedTool: { type: "string", minLength: 1, maxLength: 128 },
        arguments: { type: "object" },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  };
}

function requiredStringArgument(
  args: Record<string, unknown> | undefined,
  name: string,
  maximumLength: number,
): string {
  const value = args?.[name];
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximumLength
  ) {
    throw new Error(`${name} must be a non-empty bounded string`);
  }
  return value.trim();
}

function structuredResult(value: object): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
    isError: false,
  };
}

export function sdkDownstreamClient(client: Client): DownstreamMcpClient {
  return {
    listTools: async (params) => client.listTools(params),
    callTool: async (params, options) => {
      const result = await client.callTool(
        params,
        CallToolResultSchema,
        options,
      );
      const parsed = CallToolResultSchema.safeParse(result);
      if (!parsed.success) {
        throw new Error(
          "Downstream server returned a task result where an immediate tool result was required",
        );
      }
      return parsed.data;
    },
  };
}

function buildDescriptor(
  exposedName: string,
  tool: Tool,
  governance: GatewayToolGovernance | undefined,
  options: GovernedGatewayOptions,
): GovernedToolDescriptor {
  const destination = {
    ...options.defaultDestination,
    ...governance?.destination,
  };
  const resolvedGovernance: GovernedToolDescriptor["governance"] = {
    actionType: governance?.actionType,
    destinationType: destination.type ?? "custom",
    destinationName: destination.name ?? options.serverName,
    destinationResource: destination.resource,
    destinationTenantId: destination.tenantId,
    destinationRegion: destination.region,
    purpose: governance?.purpose ?? options.defaultPurpose,
    dataClasses:
      governance?.dataClasses ?? options.defaultDataClasses ?? ["INTERNAL"],
    fieldsInvolved: governance?.fieldsInvolved,
    riskScore: governance?.riskScore ?? inferredRiskScore(tool.annotations),
    idempotencyKeyArgument: governance?.idempotencyKeyArgument,
    consequence: governance?.consequence ?? inferredConsequence(tool.annotations),
  };
  const schemaSnapshot = {
    protocol: "mcp",
    downstreamServer: options.serverName,
    downstreamTool: tool.name,
    inputSchemaSha256: sha256(canonicalJson(tool.inputSchema)),
    outputSchemaSha256: tool.outputSchema
      ? sha256(canonicalJson(tool.outputSchema))
      : null,
    annotations: {
      readOnlyHint: tool.annotations?.readOnlyHint ?? null,
      destructiveHint: tool.annotations?.destructiveHint ?? null,
      idempotentHint: tool.annotations?.idempotentHint ?? null,
      openWorldHint: tool.annotations?.openWorldHint ?? null,
    },
    actionType:
      resolvedGovernance.actionType ??
      `mcp.${options.serverName}.${tool.name}`,
    consequence: resolvedGovernance.consequence,
    idempotencyKeyArgument:
      resolvedGovernance.idempotencyKeyArgument ?? null,
  };
  return {
    exposedName,
    downstreamName: tool.name,
    serverName: options.serverName,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    annotations: tool.annotations,
    connector: {
      instanceId: options.connectorInstanceId ?? options.serverName,
      manifestVersion:
        options.connectorManifestVersion ?? "mcp-discovery-v1",
      schemaSnapshot,
      schemaSha256: sha256(canonicalJson(schemaSnapshot)),
    },
    governance: resolvedGovernance,
  };
}

function deriveIdempotencyKey(
  descriptor: GovernedToolDescriptor,
  args: Record<string, unknown>,
): string | undefined {
  const argumentName = descriptor.governance.idempotencyKeyArgument;
  if (!argumentName) return undefined;
  const value = args[argumentName];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(
      `Governed tool ${descriptor.exposedName} requires a non-empty string ${argumentName} idempotency argument`,
    );
  }
  return `mcp:${descriptor.serverName}:${descriptor.downstreamName}:${sha256(
    value.trim(),
  )}`;
}

function mirroredTool(tool: Tool, descriptor: GovernedToolDescriptor): Tool {
  const outputSchema = tool.outputSchema
    ? {
        type: "object" as const,
        anyOf: [tool.outputSchema, governanceEnvelopeSchema()],
      }
    : undefined;
  return {
    ...tool,
    inputSchema: withRequiredIdempotencyArgument(
      tool.inputSchema,
      descriptor.governance.idempotencyKeyArgument,
    ),
    name: descriptor.exposedName,
    title: tool.title ? `Governed: ${tool.title}` : undefined,
    description: [
      "Execution-gated by GlobiGuard; the downstream call occurs only after ALLOW.",
      tool.description,
    ]
      .filter(Boolean)
      .join(" "),
    outputSchema,
    _meta: {
      ...(tool._meta ?? {}),
      "io.globiguard/governed": true,
      "io.globiguard/downstream-server": descriptor.serverName,
      "io.globiguard/downstream-tool": descriptor.downstreamName,
      "io.globiguard/consequence": descriptor.governance.consequence,
    },
  };
}

function inferredConsequence(
  annotations: Tool["annotations"],
): "low" | "medium" | "high" {
  if (annotations?.destructiveHint === true) return "high";
  if (annotations?.readOnlyHint === true) return "low";
  return "medium";
}

function assertHighConsequenceIdempotency(
  tool: Tool,
  descriptor: GovernedToolDescriptor,
): void {
  if (descriptor.governance.consequence !== "high") return;
  const argumentName = descriptor.governance.idempotencyKeyArgument;
  if (!argumentName) {
    throw new Error(
      `High-consequence tool ${descriptor.exposedName} requires a configured downstream-native idempotencyKeyArgument`,
    );
  }
  const properties = (tool.inputSchema as { properties?: unknown }).properties;
  if (
    !properties ||
    typeof properties !== "object" ||
    !(argumentName in properties)
  ) {
    throw new Error(
      `High-consequence tool ${descriptor.exposedName} does not declare the configured idempotency argument ${argumentName} in its input schema`,
    );
  }
}

function withRequiredIdempotencyArgument(
  inputSchema: Tool["inputSchema"],
  argumentName: string | undefined,
): Tool["inputSchema"] {
  if (!argumentName) return inputSchema;
  const required = Array.isArray(inputSchema.required)
    ? inputSchema.required.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  return {
    ...inputSchema,
    required: [...new Set([...required, argumentName])],
  };
}

function inferredRiskScore(annotations: Tool["annotations"]): number {
  if (annotations?.destructiveHint === true) return 0.9;
  return annotations?.openWorldHint === true ? 0.8 : 0.7;
}

function governedToolName(namespace: string, downstreamName: string): string {
  const safeToolName = normalizeToolName(downstreamName);
  const candidate = `${namespace}.${safeToolName}`;
  if (candidate.length <= 128) return candidate;
  const suffix = sha256(candidate).slice(0, 12);
  return `${candidate.slice(0, 115)}-${suffix}`;
}

function normalizeNamespace(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  if (!normalized) {
    throw new Error("Gateway namespace must contain a letter or number");
  }
  return normalized.slice(0, 48);
}

function normalizeToolName(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  if (!normalized) {
    throw new Error("Downstream MCP tool name must contain a letter or number");
  }
  return normalized;
}

function assertOptions(options: GovernedGatewayOptions): void {
  if (!options.serverName.trim()) {
    throw new Error("serverName must be a non-empty string");
  }
  if (options.connectorInstanceId !== undefined && !options.connectorInstanceId.trim()) {
    throw new Error("connectorInstanceId must be a non-empty string");
  }
  if (
    options.connectorManifestVersion !== undefined &&
    !options.connectorManifestVersion.trim()
  ) {
    throw new Error("connectorManifestVersion must be a non-empty string");
  }
  if (
    options.downstreamTimeoutMs !== undefined &&
    (!Number.isFinite(options.downstreamTimeoutMs) ||
      options.downstreamTimeoutMs <= 0)
  ) {
    throw new Error("downstreamTimeoutMs must be a positive number");
  }
  for (const [name, value, maximum] of [
    ["maxToolPages", options.maxToolPages, 1_000],
    ["maxDiscoveredTools", options.maxDiscoveredTools, 10_000],
    [
      "maxDownstreamResultBytes",
      options.maxDownstreamResultBytes,
      64 * 1024 * 1024,
    ],
  ] as const) {
    if (
      value !== undefined &&
      (!Number.isInteger(value) || value <= 0 || value > maximum)
    ) {
      throw new Error(
        `${name} must be a positive integer no greater than ${maximum}`,
      );
    }
  }
  normalizeNamespace(options.namespace ?? options.serverName);
}

function authorizationIsCurrent(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > Date.now();
}

function governanceStop(decision: GovernanceDecisionEnvelope): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: `${decision.outcome.toUpperCase()}: ${decision.reason.summary}\n${decision.next.description}`,
      },
    ],
    structuredContent: decision as unknown as Record<string, unknown>,
    isError: false,
    _meta: {
      "io.globiguard/governance": executionMetadata(decision),
    },
  };
}

function gatewayError(
  message: string,
  retryable: boolean,
  decision?: GovernanceDecisionEnvelope,
  executionState:
    | "not_called"
    | "outcome_unknown"
    | "result_suppressed" = "not_called",
): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: {
      schemaVersion: "globiguard.gateway-error.v1",
      executionState,
      downstreamCalled: executionState !== "not_called",
      outcomeKnown: executionState !== "outcome_unknown",
      error: message,
      retryable,
      ...(decision
        ? {
            authorizationId: decision.authorizationId,
            correlationId: decision.correlationId,
          }
        : {}),
    },
    isError: true,
    ...(decision
      ? {
          _meta: {
            "io.globiguard/governance": executionMetadata(decision),
          },
        }
      : {}),
  };
}

function executionMetadata(
  decision: GovernanceDecisionEnvelope,
  payloadSha256?: string,
): Record<string, unknown> {
  return {
    schemaVersion: decision.schemaVersion,
    decision: decision.decision,
    outcome: decision.outcome,
    authorizationId: decision.authorizationId,
    correlationId: decision.correlationId,
    evidence: decision.evidence,
    expiresAt: decision.expiresAt,
    ...(payloadSha256 ? { payloadSha256 } : {}),
  };
}

function governanceEnvelopeSchema(): Record<string, unknown> {
  return {
    type: "object",
    required: [
      "schemaVersion",
      "simulation",
      "outcome",
      "canExecute",
      "decision",
      "authorizationId",
      "next",
    ],
    properties: {
      schemaVersion: { const: "globiguard.agent-decision.v1" },
      simulation: { type: "boolean" },
      outcome: { enum: ["proceed", "revise", "wait", "stop"] },
      canExecute: { type: "boolean" },
      decision: { enum: ["ALLOW", "MODIFY", "QUEUE", "BLOCK"] },
      authorizationId: { type: "string" },
      next: { type: "object" },
    },
  };
}
