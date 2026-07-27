import {
  GLOBIGUARD_DATA_CLASSES,
  GLOBIGUARD_DESTINATION_SYSTEM_TYPES,
  type GlobiguardPolicy,
} from "@globiguard/contracts";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { GlobiguardAuthority } from "./authority.js";

export const AUTHORITY_SERVER_NAME = "globiguard-authority";
export const AUTHORITY_SERVER_VERSION = "0.1.0";

const destinationSchema = z
  .object({
    type: z.enum(GLOBIGUARD_DESTINATION_SYSTEM_TYPES),
    name: z.string().trim().min(1).max(256),
    resource: z.string().trim().min(1).max(512).optional(),
    tenantId: z.string().trim().min(1).max(256).optional(),
    region: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

const actorSchema = z
  .object({
    id: z.string().trim().min(1).max(256).optional(),
    type: z.enum(["human", "agent", "service", "workflow"]).optional(),
    displayName: z.string().trim().min(1).max(256).optional(),
  })
  .strict();

const payloadSummarySchema = z
  .object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    approxBytes: z.number().int().nonnegative().optional(),
    topLevelKeys: z.array(z.string().max(256)).max(64).optional(),
    topLevelValueKinds: z.record(z.string(), z.string().max(32)).optional(),
    fieldTypes: z.array(z.string().max(128)).max(128).optional(),
    recordCount: z.number().int().nonnegative().optional(),
    description: z.string().trim().min(1).max(512).optional(),
  })
  .strict();

const governActionSchema = z
  .object({
    actionType: z.string().trim().min(1).max(128),
    destination: destinationSchema,
    purpose: z.string().trim().min(1).max(1000),
    dataClasses: z.array(z.enum(GLOBIGUARD_DATA_CLASSES)).max(16).optional(),
    fieldsInvolved: z
      .array(z.string().trim().min(1).max(256))
      .max(128)
      .optional(),
    actor: actorSchema.optional(),
    payload: z.unknown().optional(),
    payloadSummary: payloadSummarySchema.optional(),
    policyId: z.string().trim().min(1).max(256).optional(),
    correlationId: z.string().trim().min(1).max(256).optional(),
    idempotencyKey: z.string().trim().min(1).max(256).optional(),
    workflowRunId: z.string().trim().min(1).max(256).optional(),
    workflowStepId: z.string().trim().min(1).max(256).optional(),
    riskScore: z.number().min(0).max(1).optional(),
    environmentSnapshotSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
    dryRun: z.boolean().optional(),
  })
  .strict()
  .refine((value) => !(value.payload !== undefined && value.payloadSummary), {
    message: "Provide payload or payloadSummary, not both",
  });

const idSchema = (name: string) =>
  z.object({ [name]: z.string().trim().min(1).max(256) }).strict();

const incidentReplaySchema = z
  .object({
    workflowRunId: z.string().trim().min(1).max(256).optional(),
    correlationId: z.string().trim().min(1).max(256).optional(),
    queueEntryId: z.string().trim().min(1).max(256).optional(),
    auditEventId: z.string().trim().min(1).max(256).optional(),
    authorizationId: z.string().trim().min(1).max(256).optional(),
  })
  .strict()
  .refine(
    (value) =>
      Object.values(value).filter(
        (entry) => typeof entry === "string" && entry.trim(),
      ).length === 1,
    { message: "Provide exactly one incident replay identifier" },
  );

const tools: Tool[] = [
  {
    name: "globiguard_govern_action",
    title: "Govern an action",
    description:
      "Authorize an intended action before execution. Raw payload values are hashed and summarized locally; only structural metadata is sent to GlobiGuard. Execute only when canExecute is true.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["actionType", "destination", "purpose"],
      properties: {
        actionType: {
          type: "string",
          minLength: 1,
          maxLength: 128,
          description: "Stable verb such as email.send or robot.navigate.",
        },
        destination: {
          type: "object",
          additionalProperties: false,
          required: ["type", "name"],
          properties: {
            type: {
              type: "string",
              enum: [...GLOBIGUARD_DESTINATION_SYSTEM_TYPES],
            },
            name: { type: "string", minLength: 1, maxLength: 256 },
            resource: { type: "string", minLength: 1, maxLength: 512 },
            tenantId: { type: "string", minLength: 1, maxLength: 256 },
            region: { type: "string", minLength: 1, maxLength: 128 },
          },
        },
        purpose: {
          type: "string",
          minLength: 1,
          maxLength: 1000,
          description: "Why this action is necessary, in business terms.",
        },
        dataClasses: {
          type: "array",
          maxItems: 16,
          items: { type: "string", enum: [...GLOBIGUARD_DATA_CLASSES] },
        },
        fieldsInvolved: {
          type: "array",
          maxItems: 128,
          items: { type: "string", minLength: 1, maxLength: 256 },
        },
        actor: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string", minLength: 1, maxLength: 256 },
            type: {
              type: "string",
              enum: ["human", "agent", "service", "workflow"],
            },
            displayName: { type: "string", minLength: 1, maxLength: 256 },
          },
        },
        payload: {
          description:
            "Optional action arguments. They remain local and are replaced with a structural summary and SHA-256 digest.",
        },
        payloadSummary: {
          type: "object",
          description:
            "Optional precomputed structural summary when raw arguments are unavailable. Do not provide together with payload.",
          additionalProperties: false,
          required: ["sha256"],
          properties: {
            sha256: { type: "string", pattern: "^[a-fA-F0-9]{64}$" },
            approxBytes: { type: "integer", minimum: 0 },
            topLevelKeys: {
              type: "array",
              maxItems: 64,
              items: { type: "string", maxLength: 256 },
            },
            topLevelValueKinds: {
              type: "object",
              additionalProperties: { type: "string", maxLength: 32 },
            },
            fieldTypes: {
              type: "array",
              maxItems: 128,
              items: { type: "string", maxLength: 128 },
            },
            recordCount: { type: "integer", minimum: 0 },
            description: { type: "string", minLength: 1, maxLength: 512 },
          },
        },
        policyId: { type: "string", minLength: 1, maxLength: 256 },
        correlationId: { type: "string", minLength: 1, maxLength: 256 },
        idempotencyKey: { type: "string", minLength: 1, maxLength: 256 },
        workflowRunId: { type: "string", minLength: 1, maxLength: 256 },
        workflowStepId: { type: "string", minLength: 1, maxLength: 256 },
        riskScore: { type: "number", minimum: 0, maximum: 1 },
        environmentSnapshotSha256: {
          type: "string",
          pattern: "^[a-fA-F0-9]{64}$",
        },
        dryRun: { type: "boolean", default: false },
      },
    },
    outputSchema: governanceOutputSchema(),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "globiguard_get_authorization",
    title: "Get authorization",
    description:
      "Retrieve a previous governance decision and its exact next step.",
    inputSchema: idInputSchema("authorizationId"),
    outputSchema: governanceOutputSchema(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "globiguard_check_approval",
    title: "Check approval",
    description:
      "Check a queued action. Even after approval, reauthorize the exact current action before execution.",
    inputSchema: idInputSchema("queueEntryId"),
    outputSchema: {
      type: "object",
      required: [
        "schemaVersion",
        "queueEntryId",
        "status",
        "canExecute",
        "terminal",
        "reviewNotesPresent",
        "next",
      ],
      properties: {
        schemaVersion: {
          type: "string",
          const: "globiguard.approval-check.v1",
        },
        queueEntryId: { type: "string" },
        authorizationId: { type: ["string", "null"] },
        status: { type: "string" },
        canExecute: { type: "boolean", const: false },
        terminal: { type: "boolean" },
        reasonCode: { type: ["string", "null"] },
        reviewNotes: { type: ["string", "null"] },
        reviewNotesPresent: { type: "boolean" },
        resolvedAt: { type: ["string", "null"] },
        next: { type: "object" },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "globiguard_get_evidence",
    title: "Get action evidence",
    description:
      "Dereference one metadata-safe evidence reference returned by an action decision.",
    inputSchema: idInputSchema("evidenceRefId"),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "globiguard_get_audit_event",
    title: "Get audit event",
    description:
      "Read one governed action audit event without retrieving raw customer payload values.",
    inputSchema: idInputSchema("auditEventId"),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "globiguard_get_evidence_package_summary",
    title: "Get evidence package summary",
    description:
      "Read a metadata-safe evidence package summary, integrity status, and source references.",
    inputSchema: idInputSchema("evidencePackageId"),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "globiguard_get_incident_replay",
    title: "Get incident replay",
    description:
      "Reconstruct the known governance timeline and explicit evidence gaps using exactly one lookup identifier.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        workflowRunId: { type: "string", minLength: 1, maxLength: 256 },
        correlationId: { type: "string", minLength: 1, maxLength: 256 },
        queueEntryId: { type: "string", minLength: 1, maxLength: 256 },
        auditEventId: { type: "string", minLength: 1, maxLength: 256 },
        authorizationId: { type: "string", minLength: 1, maxLength: 256 },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "globiguard_list_active_policies",
    title: "List active policies",
    description:
      "List the active policy identities available to this GlobiGuard project.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    outputSchema: {
      type: "object",
      required: ["policies"],
      properties: {
        policies: {
          type: "array",
          items: {
            type: "object",
            required: ["id", "name", "industry", "version", "active"],
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              industry: { type: "string" },
              version: { type: "integer" },
              active: { type: "boolean" },
            },
          },
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "globiguard_get_policy",
    title: "Get policy",
    description:
      "Read one policy and its ordered rules so the agent can understand the governing constraints.",
    inputSchema: idInputSchema("policyId"),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

export interface AuthorityServerOptions {
  onError?: (error: unknown) => void;
}

export function createAuthorityMcpServer(
  authority: GlobiguardAuthority,
  options: AuthorityServerOptions = {},
): Server {
  const server = new Server(
    { name: AUTHORITY_SERVER_NAME, version: AUTHORITY_SERVER_VERSION },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
      instructions:
        "GlobiGuard is the authority layer for agent actions. Call globiguard_govern_action before execution. Proceed only when canExecute is true; never treat MODIFY, QUEUE, or BLOCK as a transport failure or permission to execute.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const args = request.params.arguments ?? {};
      switch (request.params.name) {
        case "globiguard_govern_action":
          return structured(
            await authority.govern(governActionSchema.parse(args)),
          );
        case "globiguard_get_authorization": {
          const { authorizationId } = idSchema("authorizationId").parse(args);
          return structured(await authority.getAuthorization(authorizationId));
        }
        case "globiguard_check_approval": {
          const { queueEntryId } = idSchema("queueEntryId").parse(args);
          return structured(await authority.checkApproval(queueEntryId));
        }
        case "globiguard_get_evidence": {
          const { evidenceRefId } = idSchema("evidenceRefId").parse(args);
          return structured(await authority.getEvidence(evidenceRefId));
        }
        case "globiguard_get_audit_event": {
          const { auditEventId } = idSchema("auditEventId").parse(args);
          return structured(await authority.getAuditEvent(auditEventId));
        }
        case "globiguard_get_evidence_package_summary": {
          const { evidencePackageId } =
            idSchema("evidencePackageId").parse(args);
          return structured(
            await authority.getEvidencePackageSummary(evidencePackageId),
          );
        }
        case "globiguard_get_incident_replay":
          return structured(
            await authority.getIncidentReplay(incidentReplaySchema.parse(args)),
          );
        case "globiguard_list_active_policies":
          z.object({}).strict().parse(args);
          return structured({
            policies: (await authority.listActivePolicies()).map(policySummary),
          });
        case "globiguard_get_policy": {
          const { policyId } = idSchema("policyId").parse(args);
          return structured(await authority.getPolicy(policyId));
        }
        default:
          return toolError(
            `Unknown GlobiGuard tool "${request.params.name}". Refresh the tool list and try again.`,
            true,
          );
      }
    } catch (error) {
      options.onError?.(error);
      if (error instanceof z.ZodError) {
        return toolError(
          `Invalid tool arguments: ${error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ")}`,
          false,
        );
      }
      return toolError(
        "GlobiGuard could not evaluate this request. Verify the endpoint, project credentials, and service availability before retrying.",
        true,
      );
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      return {
        resources: (await authority.listActivePolicies()).map((policy) => ({
          uri: policyUri(policy.id),
          name: policy.name,
          title: `${policy.name} v${policy.version}`,
          description: `Active ${policy.industry} GlobiGuard policy`,
          mimeType: "application/json",
        })),
      };
    } catch (error) {
      options.onError?.(error);
      throw new Error(
        "GlobiGuard policy resources are temporarily unavailable.",
      );
    }
  });
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      const policyId = policyIdFromUri(request.params.uri);
      const policy = await authority.getPolicy(policyId);
      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: "application/json",
            text: JSON.stringify(policy, null, 2),
          },
        ],
      };
    } catch (error) {
      options.onError?.(error);
      throw new Error("GlobiGuard policy resource is unavailable.");
    }
  });

  return server;
}

function structured(value: object): CallToolResult {
  const structuredContent = value as Record<string, unknown>;
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent,
    isError: false,
  };
}

function toolError(message: string, retryable: boolean): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: {
      schemaVersion: "globiguard.tool-error.v1",
      error: message,
      retryable,
    },
    isError: true,
  };
}

function policySummary(policy: GlobiguardPolicy): Record<string, unknown> {
  return {
    id: policy.id,
    name: policy.name,
    industry: policy.industry,
    version: policy.version,
    active: policy.active,
    updatedAt: policy.updatedAt,
    resourceUri: policyUri(policy.id),
  };
}

function policyUri(policyId: string): string {
  return `globiguard://policies/${encodeURIComponent(policyId)}`;
}

function policyIdFromUri(uri: string): string {
  const parsed = new URL(uri);
  if (parsed.protocol !== "globiguard:" || parsed.hostname !== "policies") {
    throw new Error("Resource URI must identify a GlobiGuard policy");
  }
  const policyId = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!policyId || policyId.includes("/")) {
    throw new Error("Resource URI must contain one policy ID");
  }
  return policyId;
}

function idInputSchema(name: string): Tool["inputSchema"] {
  return {
    type: "object",
    additionalProperties: false,
    required: [name],
    properties: {
      [name]: { type: "string", minLength: 1, maxLength: 256 },
    },
  };
}

function governanceOutputSchema(): NonNullable<Tool["outputSchema"]> {
  return {
    type: "object",
    required: [
      "schemaVersion",
      "simulation",
      "outcome",
      "canExecute",
      "decision",
      "approvalState",
      "authorizationId",
      "reason",
      "obligations",
      "evidence",
      "next",
    ],
    properties: {
      schemaVersion: { type: "string", const: "globiguard.agent-decision.v1" },
      simulation: { type: "boolean" },
      outcome: {
        type: "string",
        enum: ["proceed", "revise", "wait", "stop"],
      },
      canExecute: { type: "boolean" },
      decision: { type: "string", enum: ["ALLOW", "MODIFY", "QUEUE", "BLOCK"] },
      approvalState: { type: "string" },
      authorizationId: { type: "string" },
      correlationId: { type: ["string", "null"] },
      queueEntryId: { type: ["string", "null"] },
      reason: { type: "object" },
      obligations: { type: "array", items: { type: "string" } },
      modifications: { type: ["object", "null"] },
      evidence: { type: "array", items: { type: "object" } },
      expiresAt: { type: ["string", "null"] },
      next: { type: "object" },
    },
  };
}
