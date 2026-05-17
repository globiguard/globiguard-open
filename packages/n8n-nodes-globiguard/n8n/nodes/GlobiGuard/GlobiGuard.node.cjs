const { NodeConnectionTypes, NodeOperationError } = require("n8n-workflow");

const GOVERNED_ACTION_TYPES = [
  "email.send",
  "crm.update",
  "slack.post",
  "webhook.call",
  "database.write",
  "ticket.create"
];

class GlobiGuard {
  constructor() {
    this.description = {
      displayName: "GlobiGuard",
      name: "globiGuard",
      icon: "fa:shield-halved",
      group: ["transform"],
      version: 1,
      description:
        "Register installs and place governance checkpoints before risky n8n actions.",
      defaults: {
        name: "GlobiGuard"
      },
      inputs: [NodeConnectionTypes.Main],
      outputs: [NodeConnectionTypes.Main],
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
            { name: "Register Install", value: "registerInstall" }
          ]
        },
        {
          displayName: "Package Version",
          name: "packageVersion",
          type: "string",
          default: "0.1.0",
          displayOptions: { show: { operation: ["registerInstall"] } }
        },
        {
          displayName: "Send Heartbeat",
          name: "sendHeartbeat",
          type: "boolean",
          default: true,
          description:
            "Whether to emit an immediate heartbeat after successful install registration.",
          displayOptions: { show: { operation: ["registerInstall"] } }
        },
        {
          displayName: "Governed Action",
          name: "actionType",
          type: "options",
          default: "email.send",
          options: GOVERNED_ACTION_TYPES.map((actionType) => ({
            name: actionType,
            value: actionType
          })),
          displayOptions: { show: { operation: ["governAction"] } }
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
          displayOptions: { show: { operation: ["governAction"] } }
        },
        {
          displayName: "Destination Name",
          name: "destinationName",
          type: "string",
          default: "",
          placeholder: "customer-notification-email",
          description:
            "Human-readable destination for the action that follows this checkpoint.",
          displayOptions: { show: { operation: ["governAction"] } }
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
          displayOptions: { show: { operation: ["governAction"] } }
        },
        {
          displayName: "Purpose",
          name: "purpose",
          type: "string",
          default: "",
          displayOptions: { show: { operation: ["governAction"] } }
        },
        {
          displayName: "Idempotency Key",
          name: "idempotencyKey",
          type: "string",
          default: "",
          description:
            "Optional stable key from the upstream workflow item. Keep this server-side in n8n.",
          displayOptions: { show: { operation: ["governAction"] } }
        },
        {
          displayName: "Enforcement Mode",
          name: "enforcementMode",
          type: "options",
          default: "stop_until_allowed",
          options: [
            {
              name: "Annotate Only",
              value: "annotate",
              description: "Pass all items through with GlobiGuard decision metadata"
            },
            {
              name: "Stop on Block",
              value: "stop_on_block",
              description: "Stop only BLOCK decisions"
            },
            {
              name: "Stop Until Allowed",
              value: "stop_until_allowed",
              description:
                "Stop BLOCK and QUEUE decisions before downstream action nodes run"
            }
          ],
          displayOptions: { show: { operation: ["governAction"] } }
        }
      ]
    };
  }

  async execute() {
    const inputItems = this.getInputData();
    const itemCount = inputItems.length || 1;

    try {
      const operation = this.getNodeParameter(
        "operation",
        0,
        "governAction"
      );
      const rawCredentials = await this.getCredentials("globiGuardApi");
      const runtime = buildRuntime(rawCredentials);

      if (operation === "registerInstall") {
        return [await executeRegisterInstall(this, runtime, inputItems, itemCount)];
      }

      if (operation === "governAction") {
        return [await executeGovernedAction(this, runtime, inputItems, itemCount)];
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
          )
        ];
      }

      throw new NodeOperationError(this.getNode(), error, { itemIndex: 0 });
    }
  }
}

async function executeRegisterInstall(context, runtime, inputItems, itemCount) {
  if (!runtime.installRegistrationAllowed) {
    throw new NodeOperationError(
      context.getNode(),
      "Install registration and heartbeat are disabled for this bootstrap profile.",
      { itemIndex: 0 }
    );
  }

  const packageVersion = context.getNodeParameter(
    "packageVersion",
    0,
    "0.1.0"
  );
  const sendHeartbeat = context.getNodeParameter("sendHeartbeat", 0, true);
  const metadata = {
    nodeName: context.getNode().name,
    operation: "registerInstall"
  };

  const registration = await requestJson(runtime, "/v1/installs", {
    method: "POST",
    body: JSON.stringify({
      packageName: "n8n-nodes-globiguard",
      packageVersion,
      integrationKind: "n8n",
      runtimeKind: "n8n",
      environment: runtime.environment,
      deploymentMode: runtime.deploymentMode,
      issuerMode: runtime.issuerMode,
      installReporting: runtime.installReporting,
      installLabel: runtime.installLabel,
      installFingerprint: runtime.installFingerprint,
      metadata
    })
  });

  let heartbeatId;
  if (sendHeartbeat) {
    const heartbeat = await requestJson(
      runtime,
      `/v1/installs/${registration.installId}/heartbeats`,
      {
        method: "POST",
        body: JSON.stringify({
          packageVersion,
          runtimeKind: "n8n",
          environment: runtime.environment,
          deploymentMode: runtime.deploymentMode,
          issuerMode: runtime.issuerMode,
          installReporting: runtime.installReporting,
          installLabel: runtime.installLabel,
          installFingerprint: runtime.installFingerprint,
          metadata
        })
      }
    );
    heartbeatId = heartbeat.heartbeatId;
  }

  return buildOutputItems(
    itemCount,
    {
      installId: registration.installId,
      ...(heartbeatId ? { heartbeatId } : {}),
      environment: runtime.environment,
      deploymentMode: runtime.deploymentMode,
      installReporting: runtime.installReporting,
      directBrainAccess: Boolean(runtime.brainUrl)
    },
    inputItems.length > 0
  );
}

async function executeGovernedAction(context, runtime, inputItems, itemCount) {
  const outputItems = [];

  for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
    const inputItem = inputItems[itemIndex] || { json: {} };
    const actionType = context.getNodeParameter(
      "actionType",
      itemIndex,
      "email.send"
    );
    const destinationType = context.getNodeParameter(
      "destinationType",
      itemIndex,
      "email"
    );
    const destinationName = context.getNodeParameter(
      "destinationName",
      itemIndex,
      ""
    );
    const dataClasses = context.getNodeParameter(
      "dataClasses",
      itemIndex,
      ["INTERNAL"]
    );
    const purpose = stringOrUndefined(
      context.getNodeParameter("purpose", itemIndex, "")
    );
    const idempotencyKey = stringOrUndefined(
      context.getNodeParameter("idempotencyKey", itemIndex, "")
    );
    const enforcementMode = context.getNodeParameter(
      "enforcementMode",
      itemIndex,
      "stop_until_allowed"
    );

    if (!String(destinationName).trim()) {
      throw new NodeOperationError(
        context.getNode(),
        "Destination Name is required for GlobiGuard governance checkpoints.",
        { itemIndex }
      );
    }

    const authorization = await requestJson(runtime, "/v1/actions/authorize", {
      method: "POST",
      body: JSON.stringify({
        context: {
          actionType,
          destination: {
            type: destinationType,
            name: destinationName
          },
          dataClasses,
          payloadSummary: summarizeJsonPayload(inputItem.json || {}),
          idempotencyKey,
          purpose,
          metadata: {
            integrationKind: "n8n",
            nodeName: context.getNode().name,
            itemIndex
          }
        }
      })
    });

    if (shouldStopForGovernedAction(authorization, enforcementMode)) {
      throw new NodeOperationError(
        context.getNode(),
        `GlobiGuard ${authorization.decision} decision for ${actionType}; downstream action not executed.`,
        { itemIndex }
      );
    }

    outputItems.push({
      json: {
        ...(inputItem.json || {}),
        globiguard: {
          authorizationId: authorization.authorizationId,
          decision: authorization.decision,
          approvalState: authorization.approvalState,
          queueEntryId: authorization.queueEntryId || null,
          evidenceRefs: authorization.evidenceRefs || [],
          reason: authorization.reason || null
        }
      },
      ...(inputItems.length > 0 ? { pairedItem: itemIndex } : {})
    });
  }

  return outputItems;
}

function buildRuntime(rawValues) {
  const environment = assertOneOf(
    String(rawValues.environment || ""),
    ["local", "sandbox", "live"],
    "environment"
  );
  const deploymentMode = assertOneOf(
    String(rawValues.deploymentMode || ""),
    ["hosted", "self_hosted", "sovereign"],
    "deploymentMode"
  );
  const issuerMode = assertOneOf(
    String(rawValues.issuerMode || ""),
    ["globiguard_issued", "customer_issued"],
    "issuerMode"
  );
  const installReporting = assertOneOf(
    String(rawValues.installReporting || ""),
    ["default", "opt_in", "disabled"],
    "installReporting"
  );
  const credentialKind = String(rawValues.credentialKind || "");
  const normalizedProjectId =
    credentialKind === "secret"
      ? trimmedStringOrUndefined(rawValues.projectId)
      : stringOrUndefined(rawValues.projectId);
  const normalizedToken =
    credentialKind === "secret"
      ? trimmedStringOrUndefined(rawValues.token)
      : stringOrUndefined(rawValues.token);

  if (deploymentMode === "hosted" && issuerMode !== "globiguard_issued") {
    throw new Error(
      "Hosted deployments must use globiguard-issued bootstrap credentials."
    );
  }
  if (deploymentMode !== "hosted" && issuerMode !== "customer_issued") {
    throw new Error(
      "Self-hosted and sovereign deployments must use customer-issued bootstrap credentials."
    );
  }
  if (deploymentMode !== "hosted" && installReporting === "default") {
    throw new Error(
      "Self-hosted and sovereign deployments must set installReporting to opt_in or disabled explicitly."
    );
  }
  if (credentialKind !== "secret" && credentialKind !== "local") {
    throw new Error(
      "n8n credentials must use secret or local credential kind."
    );
  }
  if (!rawValues.controlPlaneUrl) {
    throw new Error("Control Plane URL is required.");
  }
  assertServiceUrl(
    "controlPlane",
    String(rawValues.controlPlaneUrl),
    environment,
    credentialKind === "local"
  );
  if (rawValues.brainUrl) {
    assertServiceUrl(
      "brain",
      String(rawValues.brainUrl),
      environment,
      credentialKind === "local"
    );
  }
  if (credentialKind === "local" && environment !== "local") {
    throw new Error(
      "Local credentials may only be used with the local environment."
    );
  }
  if (credentialKind === "secret" && environment === "local") {
    throw new Error(
      "Secret n8n credentials require sandbox or live environment."
    );
  }
  if (credentialKind === "secret" && !normalizedProjectId) {
    throw new Error("Project ID is required for secret n8n credentials.");
  }
  if (credentialKind === "secret" && !normalizedToken) {
    throw new Error("Token is required for secret n8n credentials.");
  }

  return {
    environment,
    deploymentMode,
    issuerMode,
    installReporting,
    installLabel: stringOrUndefined(rawValues.installLabel),
    installFingerprint: stringOrUndefined(rawValues.installFingerprint),
    installRegistrationAllowed: installReporting !== "disabled",
    controlPlaneUrl: String(rawValues.controlPlaneUrl),
    brainUrl: stringOrUndefined(rawValues.brainUrl),
    headers: buildHeaders({
      credentialKind,
      projectId: normalizedProjectId,
      token: normalizedToken,
      environment
    })
  };
}

function buildHeaders(runtime) {
  const headers = {
    "content-type": "application/json",
    "x-globiguard-client": "n8n-nodes-globiguard",
    "x-globiguard-environment": runtime.environment
  };

  if (runtime.projectId) {
    headers["x-globiguard-project-id"] = runtime.projectId;
  }
  if (runtime.credentialKind === "secret") {
    headers["x-globiguard-secret-key"] = runtime.token;
  } else {
    headers["x-globiguard-local-mode"] = "true";
    if (runtime.token) {
      headers["x-globiguard-local-token"] = runtime.token;
    }
  }

  return headers;
}

async function requestJson(runtime, path, init) {
  const response = await fetch(new URL(path, runtime.controlPlaneUrl), {
    ...init,
    headers: {
      ...runtime.headers,
      ...(init.headers || {})
    }
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `GlobiGuard control-plane request failed (${response.status}): ${JSON.stringify(body)}`
    );
  }
  return body;
}

function summarizeJsonPayload(itemJson) {
  const topLevelKeys = Object.keys(itemJson).sort();
  const topLevelValueKinds = Object.fromEntries(
    topLevelKeys.map((key) => [key, valueKind(itemJson[key])])
  );

  return {
    approxBytes: Buffer.byteLength(JSON.stringify(itemJson)),
    topLevelKeys,
    topLevelValueKinds
  };
}

function shouldStopForGovernedAction(authorization, enforcementMode) {
  if (enforcementMode === "annotate") {
    return false;
  }

  if (enforcementMode === "stop_on_block") {
    return authorization.decision === "BLOCK";
  }

  return authorization.decision === "BLOCK" || authorization.decision === "QUEUE";
}

function buildOutputItems(itemCount, json, includePairedItems) {
  return Array.from({ length: itemCount }, (_value, itemIndex) => ({
    json: { ...json },
    ...(includePairedItems ? { pairedItem: itemIndex } : {})
  }));
}

function assertServiceUrl(
  serviceName,
  serviceUrl,
  environment,
  requireLocalHost = false
) {
  let parsedUrl;

  try {
    parsedUrl = new URL(serviceUrl);
  } catch {
    throw new Error(`${serviceName} service URL must be a valid URL.`);
  }

  if (environment !== "local" && parsedUrl.protocol !== "https:") {
    throw new Error(
      `${serviceName} service URL must use HTTPS outside the local environment.`
    );
  }

  if (parsedUrl.pathname !== "/" && parsedUrl.pathname !== "") {
    throw new Error(
      `${serviceName} service URL must be a service origin, not a versioned API path.`
    );
  }

  if (
    requireLocalHost &&
    parsedUrl.hostname !== "localhost" &&
    parsedUrl.hostname !== "127.0.0.1" &&
    parsedUrl.hostname !== "::1" &&
    !parsedUrl.hostname.endsWith(".localhost")
  ) {
    throw new Error(
      `${serviceName} service URL must use a localhost or loopback host with local credentials.`
    );
  }
}

function assertOneOf(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new Error(
      `${fieldName} must be one of: ${allowedValues.join(", ")}.`
    );
  }
  return value;
}

function stringOrUndefined(value) {
  if (typeof value !== "string" || value === "") {
    return undefined;
  }
  return value;
}

function trimmedStringOrUndefined(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue === "" ? undefined : normalizedValue;
}

function valueKind(value) {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return typeof value;
}

module.exports = { GlobiGuard };
