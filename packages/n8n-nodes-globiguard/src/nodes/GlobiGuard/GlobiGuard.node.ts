import type {
  GlobiguardDataClass,
  GlobiguardDestinationSystemType,
  GlobiguardTrustWebhookHeaders
} from "@globiguard/contracts";
import { verifyTrustWebhook } from "@globiguard/sdk/server";

import {
  N8N_GOVERNED_ACTION_TYPES,
  buildN8nActionAuthorizationRequest,
  shouldStopForGovernedAction,
  type N8nActionEnforcementMode
} from "../../actions.js";
import {
  buildN8nInstallHeartbeatRequest,
  buildN8nInstallRegistrationRequest
} from "../../installs.js";
import {
  buildN8nRuntimeConfig,
  normalizeN8nCredentialValues
} from "../../config.js";
import { createN8nRuntime, type N8nRuntime } from "../../runtime.js";

import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription
} from "n8n-workflow";
import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";

export class GlobiGuard implements INodeType {
  description: INodeTypeDescription = {
    displayName: "GlobiGuard",
    name: "globiGuard",
    icon: "file:globiguard.svg",
    group: ["transform"],
    version: 1,
    description:
      "Register installs and place governance checkpoints before risky n8n actions.",
    defaults: {
      name: "GlobiGuard",
      color: "#10B981"
    },
    inputs: [NodeConnectionTypes.Main],
    outputs: [
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main
    ],
    outputNames: ["allow", "modified", "blocked", "queued", "error"],
    credentials: [
      {
        name: "globiGuardApi",
        required: true
      }
    ],
    properties: [
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        default: "governAction",
        options: [
          {
            name: "Governance Checkpoint",
            value: "governAction",
            description:
              "Authorize a risky action before email, CRM, Slack, webhook, database, or ticket nodes run"
          },
          {
            name: "Wait for Approval",
            value: "waitForApproval",
            description:
              "Poll a queued governed action until approval or fail closed before downstream action nodes run"
          },
          {
            name: "Export Evidence Package",
            value: "exportEvidencePackage",
            description:
              "Export a metadata-safe evidence package after a governed decision"
          },
          {
            name: "Incident Replay Lookup",
            value: "incidentReplayLookup",
            description:
              "Look up the replay timeline for a workflow, queue item, audit event, or correlation ID"
          },
          {
            name: "Verify GlobiGuard Webhook",
            value: "verifyWebhook",
            description:
              "Verify a GlobiGuard trust webhook signature, timestamp, delivery ID, and replay window"
          },
          {
            name: "View Traces & Evidence",
            value: "getObservabilityData",
            description:
              "Pull traces, evidence packages, and metrics from your GlobiGuard dashboard using your API token"
          },
          {
            name: "Register Install",
            value: "registerInstall"
          }
        ]
      },
      {
        displayName: "Observability View",
        name: "observabilityView",
        type: "options",
        default: "dashboard",
        options: [
          { name: "Dashboard", value: "dashboard" },
          { name: "Traces", value: "traces" },
          { name: "Trace", value: "trace" },
          { name: "Evidence", value: "evidence" },
          { name: "Metrics", value: "metrics" }
        ],
        displayOptions: {
          show: {
            operation: ["getObservabilityData"]
          }
        }
      },
      {
        displayName: "Trace ID",
        name: "traceId",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            operation: ["getObservabilityData"],
            observabilityView: ["trace"]
          }
        }
      },
      {
        displayName: "Evidence Package ID",
        name: "evidencePackageId",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            operation: ["getObservabilityData"],
            observabilityView: ["evidence"]
          }
        }
      },
      {
        displayName: "Limit",
        name: "observabilityLimit",
        type: "number",
        default: 50,
        displayOptions: {
          show: {
            operation: ["getObservabilityData"],
            observabilityView: ["traces", "metrics"]
          }
        }
      },
      {
        displayName: "Package Version",
        name: "packageVersion",
        type: "string",
        default: "1.0.4",
        displayOptions: {
          show: {
            operation: ["registerInstall"]
          }
        }
      },
      {
        displayName: "Send Heartbeat",
        name: "sendHeartbeat",
        type: "boolean",
        default: true,
        description:
          "Whether to emit an immediate heartbeat after successful install registration.",
        displayOptions: {
          show: {
            operation: ["registerInstall"]
          }
        }
      },
      {
        displayName: "Governed Action",
        name: "actionType",
        type: "options",
        default: "email.send",
        options: N8N_GOVERNED_ACTION_TYPES.map((actionType) => ({
          name: actionType,
          value: actionType
        })),
        displayOptions: {
          show: {
            operation: ["governAction"]
          }
        }
      },
      {
        displayName: "Destination Type",
        name: "destinationType",
        type: "options",
        default: "email",
        options: [
          { name: "Email", value: "email" },
          { name: "CRM", value: "crm" },
          { name: "Slack", value: "slack" },
          { name: "Webhook", value: "webhook" },
          { name: "Database", value: "database" },
          { name: "Ticketing", value: "ticketing" },
          { name: "Custom", value: "custom" }
        ],
        displayOptions: {
          show: {
            operation: ["governAction"]
          }
        }
      },
      {
        displayName: "Destination Name",
        name: "destinationName",
        type: "string",
        default: "",
        placeholder: "customer-notification-email",
        description:
          "Human-readable destination for the action that follows this checkpoint.",
        displayOptions: {
          show: {
            operation: ["governAction"]
          }
        }
      },
      {
        displayName: "Data Classes",
        name: "dataClasses",
        type: "multiOptions",
        default: ["INTERNAL"],
        options: [
          { name: "Public", value: "PUBLIC" },
          { name: "Internal", value: "INTERNAL" },
          { name: "Confidential", value: "CONFIDENTIAL" },
          { name: "Restricted", value: "RESTRICTED" },
          { name: "PII", value: "PII" },
          { name: "PHI", value: "PHI" },
          { name: "PCI", value: "PCI" },
          { name: "Secret", value: "SECRET" }
        ],
        displayOptions: {
          show: {
            operation: ["governAction"]
          }
        }
      },
      {
        displayName: "Purpose",
        name: "purpose",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            operation: ["governAction"]
          }
        }
      },
      {
        displayName: "Idempotency Key",
        name: "idempotencyKey",
        type: "string",
        default: "",
        description:
          "Optional stable key from the upstream workflow item. Keep this server-side in n8n.",
        displayOptions: {
          show: {
            operation: ["governAction"]
          }
        }
      },
      {
        displayName: "Enforcement Mode",
        name: "enforcementMode",
        type: "options",
        default: "route_by_decision",
        options: [
          {
            name: "Route by Decision",
            value: "route_by_decision",
            description:
              "Send each item only to its ALLOW, MODIFY, BLOCK, or QUEUE branch"
          },
          {
            name: "Fail on Block",
            value: "fail_on_block",
            description:
              "Fail the node on BLOCK and route ALLOW, MODIFY, and QUEUE decisions"
          },
          {
            name: "Fail on Block or Queue",
            value: "fail_on_block_or_queue",
            description:
              "Fail the node on BLOCK or unresolved QUEUE decisions"
          }
        ],
        displayOptions: {
          show: {
            operation: ["governAction"]
          }
        }
      },
      {
        displayName: "Queue Entry ID",
        name: "queueEntryId",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            operation: ["waitForApproval", "incidentReplayLookup"]
          }
        }
      },
      {
        displayName: "Max Poll Attempts",
        name: "maxAttempts",
        type: "number",
        default: 60,
        displayOptions: {
          show: {
            operation: ["waitForApproval"]
          }
        }
      },
      {
        displayName: "Poll Interval MS",
        name: "intervalMs",
        type: "number",
        default: 1000,
        displayOptions: {
          show: {
            operation: ["waitForApproval"]
          }
        }
      },
      {
        displayName: "Framework ID",
        name: "frameworkId",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            operation: ["exportEvidencePackage"]
          }
        }
      },
      {
        displayName: "Workflow Run ID",
        name: "workflowRunId",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            operation: ["exportEvidencePackage", "incidentReplayLookup"]
          }
        }
      },
      {
        displayName: "Audit Event ID",
        name: "auditEventId",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            operation: ["incidentReplayLookup"]
          }
        }
      },
      {
        displayName: "Authorization ID",
        name: "authorizationId",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            operation: ["incidentReplayLookup"]
          }
        }
      },
      {
        displayName: "Correlation ID",
        name: "correlationId",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            operation: ["incidentReplayLookup"]
          }
        }
      },
      {
        displayName: "Webhook Raw Body",
        name: "webhookRawBody",
        type: "string",
        default: "",
        typeOptions: {
          rows: 6
        },
        displayOptions: {
          show: {
            operation: ["verifyWebhook"]
          }
        }
      },
      {
        displayName: "Webhook Delivery ID",
        name: "webhookDeliveryId",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            operation: ["verifyWebhook"]
          }
        }
      },
      {
        displayName: "Webhook Timestamp",
        name: "webhookTimestamp",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            operation: ["verifyWebhook"]
          }
        }
      },
      {
        displayName: "Webhook Event Type",
        name: "webhookEventType",
        type: "string",
        default: "",
        displayOptions: {
          show: {
            operation: ["verifyWebhook"]
          }
        }
      },
      {
        displayName: "Webhook Signature",
        name: "webhookSignature",
        type: "string",
        default: "",
        typeOptions: {
          password: true
        },
        displayOptions: {
          show: {
            operation: ["verifyWebhook"]
          }
        }
      },
      {
        displayName: "Webhook Tolerance Seconds",
        name: "webhookToleranceSeconds",
        type: "number",
        default: 300,
        displayOptions: {
          show: {
            operation: ["verifyWebhook"]
          }
        }
      }
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const inputItems = this.getInputData();
    const itemCount = inputItems.length || 1;
    try {
      const operation = this.getNodeParameter(
        "operation",
        0,
        "governAction"
      ) as string;
      const credentialData = await this.getCredentials("globiGuardApi");
      const runtime = createN8nRuntime(
        buildN8nRuntimeConfig(
          normalizeN8nCredentialValues(
            credentialData as unknown as Record<string, unknown>
          )
        )
      );

      if (operation === "registerInstall") {
        return withPrimaryOutput(
          await executeRegisterInstall.call(this, runtime, inputItems, itemCount)
        );
      }

      if (operation === "governAction") {
        return await executeGovernedAction.call(this, runtime, inputItems, itemCount);
      }

      if (operation === "waitForApproval") {
        return withPrimaryOutput(
          await executeWaitForApproval.call(this, runtime, inputItems, itemCount)
        );
      }

      if (operation === "exportEvidencePackage") {
        return withPrimaryOutput(
          await executeExportEvidencePackage.call(this, runtime, inputItems, itemCount)
        );
      }

      if (operation === "incidentReplayLookup") {
        return withPrimaryOutput(
          await executeIncidentReplayLookup.call(this, runtime, inputItems, itemCount)
        );
      }

      if (operation === "getObservabilityData") {
        return withPrimaryOutput(
          await executeGetObservabilityData.call(this, runtime, inputItems, itemCount)
        );
      }

      if (operation === "verifyWebhook") {
        return withPrimaryOutput(
          await executeVerifyWebhook.call(
            this,
            credentialData as Record<string, unknown>,
            inputItems,
            itemCount
          )
        );
      }

      throw new NodeOperationError(
        this.getNode(),
        `Unsupported GlobiGuard operation: ${operation}`,
        { itemIndex: 0 }
      );
    } catch (error) {
      if (this.continueOnFail()) {
        return [
          buildOutputItems(
            itemCount,
            {
              error:
                error instanceof Error ? error.message : "Unknown GlobiGuard error"
            },
            inputItems.length > 0
          ),
          [],
          [],
          [],
          []
        ];
      }

      throw new NodeOperationError(this.getNode(), error as Error, {
        itemIndex: 0
      });
    }
  }
}

async function executeRegisterInstall(
  this: IExecuteFunctions,
  runtime: N8nRuntime,
  inputItems: INodeExecutionData[],
  itemCount: number
): Promise<INodeExecutionData[]> {
  const packageVersion = this.getNodeParameter(
    "packageVersion",
    0,
    "1.0.4"
  ) as string;
  const sendHeartbeat = this.getNodeParameter(
    "sendHeartbeat",
    0,
    true
  ) as boolean;
  const metadata = {
    nodeName: this.getNode().name,
    operation: "registerInstall"
  };

  const registration = buildN8nInstallRegistrationRequest(
    runtime.bootstrapProfile,
    {
      packageVersion,
      metadata
    }
  );
  const result = await runtime.client.installs.register(registration);

  let heartbeatId: string | undefined;
  if (sendHeartbeat) {
    const heartbeat = buildN8nInstallHeartbeatRequest(
      runtime.bootstrapProfile,
      {
        packageVersion,
        metadata
      }
    );
    const heartbeatResult = await runtime.client.installs.heartbeat(
      result.installId,
      heartbeat
    );
    heartbeatId = heartbeatResult.heartbeatId;
  }

  return buildOutputItems(
    itemCount,
    {
      installId: result.installId,
      ...(heartbeatId ? { heartbeatId } : {}),
      environment: runtime.bootstrapProfile.environment,
      deploymentMode: runtime.bootstrapProfile.deploymentMode,
      installReporting: runtime.bootstrapProfile.installReporting,
      directBrainAccess: runtime.executionBoundary.directBrainAccess
    },
    inputItems.length > 0
  );
}

async function executeGovernedAction(
  this: IExecuteFunctions,
  runtime: N8nRuntime,
  inputItems: INodeExecutionData[],
  itemCount: number
): Promise<INodeExecutionData[][]> {
  const outputs = createEmptyOutputs();

  for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
    const inputItem = inputItems[itemIndex] ?? { json: {} };
    const actionType = this.getNodeParameter(
      "actionType",
      itemIndex,
      "email.send"
    ) as string;
    const destinationType = this.getNodeParameter(
      "destinationType",
      itemIndex,
      "email"
    ) as GlobiguardDestinationSystemType;
    const destinationName = this.getNodeParameter(
      "destinationName",
      itemIndex,
      ""
    ) as string;
    const dataClasses = this.getNodeParameter(
      "dataClasses",
      itemIndex,
      ["INTERNAL"]
    ) as GlobiguardDataClass[];
    const purpose = stringOrUndefined(
      this.getNodeParameter("purpose", itemIndex, "")
    );
    const idempotencyKey = stringOrUndefined(
      this.getNodeParameter("idempotencyKey", itemIndex, "")
    );
    const enforcementMode = this.getNodeParameter(
      "enforcementMode",
      itemIndex,
      "route_by_decision"
    ) as N8nActionEnforcementMode;

    if (!destinationName.trim()) {
      throw new NodeOperationError(
        this.getNode(),
        "Destination Name is required for GlobiGuard governance checkpoints.",
        { itemIndex }
      );
    }

    const authorization = await runtime.client.actions.authorize(
      buildN8nActionAuthorizationRequest({
        actionType,
        destinationType,
        destinationName,
        dataClasses,
        itemJson: inputItem.json as Record<string, unknown>,
        nodeName: this.getNode().name,
        itemIndex,
        purpose,
        idempotencyKey
      })
    );

    if (shouldStopForGovernedAction(authorization, enforcementMode)) {
      throw new NodeOperationError(
        this.getNode(),
        `GlobiGuard ${authorization.decision} decision for ${actionType}; downstream action not executed.`,
        { itemIndex }
      );
    }

    const outputItem = {
      json: {
        ...inputItem.json,
        globiguard: {
          authorizationId: authorization.authorizationId,
          correlationId: authorization.correlationId ?? null,
          decision: authorization.decision,
          approvalState: authorization.approvalState,
          queueEntryId: authorization.queueEntryId ?? null,
          evidenceRefs: authorization.evidenceRefs,
          reason: authorization.reason ?? null
        }
      },
      ...(inputItems.length > 0 ? { pairedItem: itemIndex } : {})
    };
    outputs[decisionOutputIndex(authorization.decision)].push(outputItem);
  }

  return outputs;
}

async function executeWaitForApproval(
  this: IExecuteFunctions,
  runtime: N8nRuntime,
  inputItems: INodeExecutionData[],
  itemCount: number
): Promise<INodeExecutionData[]> {
  const queueEntryId = requireStringParameter.call(this, "queueEntryId", 0);
  const maxAttempts = this.getNodeParameter("maxAttempts", 0, 60) as number;
  const intervalMs = this.getNodeParameter("intervalMs", 0, 1000) as number;
  const queueEntry = await runtime.client.governedActions.waitForApproval({
    queueEntryId,
    maxAttempts,
    intervalMs
  });

  return buildOutputItems(
    itemCount,
    {
      globiguard: {
        queueEntryId: queueEntry.id,
        status: queueEntry.status,
        authorizationId: queueEntry.authorizationId ?? null,
        correlationId: queueEntry.correlationId ?? null,
        evidencePackageId: queueEntry.evidencePackageId ?? null,
        resumeTokenRef: queueEntry.resumeTokenRef ?? null
      }
    },
    inputItems.length > 0
  );
}

async function executeExportEvidencePackage(
  this: IExecuteFunctions,
  runtime: N8nRuntime,
  inputItems: INodeExecutionData[],
  itemCount: number
): Promise<INodeExecutionData[]> {
  const frameworkId = stringOrUndefined(this.getNodeParameter("frameworkId", 0, ""));
  const workflowRunId = stringOrUndefined(
    this.getNodeParameter("workflowRunId", 0, "")
  );
  const exportResult = await runtime.client.governedActions.exportEvidencePackage({
    ...(frameworkId ? { frameworkId } : {}),
    ...(workflowRunId ? { workflowRunId } : {})
  });

  return buildOutputItems(
    itemCount,
    {
      globiguard: {
        evidencePackageId: exportResult.evidencePackageId,
        artifactExportId: exportResult.artifactExportId,
        status: exportResult.status,
        checksum: exportResult.checksum,
        summary: exportResult.summary ?? null,
        descriptor: exportResult.descriptor ?? null
      }
    },
    inputItems.length > 0
  );
}

async function executeIncidentReplayLookup(
  this: IExecuteFunctions,
  runtime: N8nRuntime,
  inputItems: INodeExecutionData[],
  itemCount: number
): Promise<INodeExecutionData[]> {
  const lookup = {
    workflowRunId: stringOrUndefined(this.getNodeParameter("workflowRunId", 0, "")),
    auditEventId: stringOrUndefined(this.getNodeParameter("auditEventId", 0, "")),
    authorizationId: stringOrUndefined(
      this.getNodeParameter("authorizationId", 0, "")
    ),
    correlationId: stringOrUndefined(this.getNodeParameter("correlationId", 0, "")),
    queueEntryId: stringOrUndefined(this.getNodeParameter("queueEntryId", 0, ""))
  };
  if (Object.values(lookup).filter(Boolean).length !== 1) {
    throw new NodeOperationError(
      this.getNode(),
      "Incident Replay Lookup requires exactly one workflow run, audit event, authorization, correlation, or queue entry ID.",
      { itemIndex: 0 }
    );
  }
  const replay = await runtime.client.governedActions.getIncidentReplay(lookup);

  return buildOutputItems(
    itemCount,
    {
      globiguard: {
        incidentReplay: replay
      }
    },
    inputItems.length > 0
  );
}

async function executeGetObservabilityData(
  this: IExecuteFunctions,
  runtime: N8nRuntime,
  inputItems: INodeExecutionData[],
  itemCount: number
): Promise<INodeExecutionData[]> {
  const view = this.getNodeParameter("observabilityView", 0, "dashboard") as string;
  const observe = runtime.client.observe;

  if (!observe) {
    throw new NodeOperationError(
      this.getNode(),
      "Observability client is not available on the current runtime.",
      { itemIndex: 0 }
    );
  }

  let data: unknown;
  if (view === "dashboard") {
    data = await observe.getDashboard();
  } else if (view === "traces") {
    const limit = this.getNodeParameter("observabilityLimit", 0, 50) as number;
    data = await observe.getTraces({ limit });
  } else if (view === "trace") {
    const traceId = requireStringParameter.call(this, "traceId", 0);
    data = await observe.getTrace(traceId);
  } else if (view === "evidence") {
    const evidencePackageId = requireStringParameter.call(this, "evidencePackageId", 0);
    data = await observe.getEvidenceDetail(evidencePackageId);
  } else if (view === "metrics") {
    const limit = this.getNodeParameter("observabilityLimit", 0, 50) as number;
    data = await observe.getMetrics({ limit });
  } else {
    throw new NodeOperationError(
      this.getNode(),
      `Unsupported observability view: ${view}`,
      { itemIndex: 0 }
    );
  }

  return buildOutputItems(
    itemCount,
    { globiguard: { observabilityView: view, data } },
    inputItems.length > 0
  );
}

async function executeVerifyWebhook(
  this: IExecuteFunctions,
  credentialData: Record<string, unknown>,
  inputItems: INodeExecutionData[],
  itemCount: number
): Promise<INodeExecutionData[]> {
  const signingSecret = stringOrUndefined(credentialData.webhookSigningSecret);
  if (!signingSecret) {
    throw new NodeOperationError(
      this.getNode(),
      "Webhook Signing Secret is required for Verify GlobiGuard Webhook.",
      { itemIndex: 0 }
    );
  }

  const headers: GlobiguardTrustWebhookHeaders = {
    deliveryId: requireStringParameter.call(this, "webhookDeliveryId", 0),
    timestamp: requireStringParameter.call(this, "webhookTimestamp", 0),
    eventType: requireStringParameter.call(this, "webhookEventType", 0),
    signature: requireStringParameter.call(this, "webhookSignature", 0)
  };
  const result = await verifyTrustWebhook({
    headers,
    rawBody: requireStringParameter.call(this, "webhookRawBody", 0),
    signingSecret,
    toleranceSeconds: this.getNodeParameter(
      "webhookToleranceSeconds",
      0,
      300
    ) as number
  });

  if (!result.ok) {
    throw new NodeOperationError(this.getNode(), result.error.message, {
      itemIndex: 0
    });
  }

  return buildOutputItems(
    itemCount,
    {
      globiguard: {
        webhookVerified: true,
        duplicateDelivery: result.duplicateDelivery,
        deliveryId: result.deliveryId,
        eventType: result.eventType,
        timestamp: result.timestamp,
        envelope: result.envelope
      }
    },
    inputItems.length > 0
  );
}

function buildOutputItems(
  itemCount: number,
  json: INodeExecutionData["json"],
  includePairedItems: boolean
): INodeExecutionData[] {
  return Array.from({ length: itemCount }, (_value, itemIndex) => ({
    json: { ...json },
    ...(includePairedItems ? { pairedItem: itemIndex } : {})
  }));
}

function withPrimaryOutput(items: INodeExecutionData[]): INodeExecutionData[][] {
  return [items, [], [], [], []];
}

function createEmptyOutputs(): INodeExecutionData[][] {
  return [[], [], [], [], []];
}

function decisionOutputIndex(decision: string): number {
  switch (decision) {
    case "ALLOW":
      return 0;
    case "MODIFY":
      return 1;
    case "BLOCK":
      return 2;
    case "QUEUE":
      return 3;
    default:
      return 4;
  }
}

function requireStringParameter(
  this: IExecuteFunctions,
  name: string,
  itemIndex: number
): string {
  const value = stringOrUndefined(this.getNodeParameter(name, itemIndex, ""));
  if (!value) {
    throw new NodeOperationError(
      this.getNode(),
      `${name} is required for this GlobiGuard operation.`,
      { itemIndex }
    );
  }
  return value;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
