import type {
  GlobiguardActionAuthorizationRequest,
  GlobiguardActionAuthorizationResponse,
  GlobiguardDataClass,
  GlobiguardDestinationSystemType
} from "@globiguard/contracts";

export const N8N_GOVERNED_ACTION_TYPES = [
  "email.send",
  "crm.update",
  "slack.post",
  "webhook.call",
  "database.write",
  "ticket.create"
] as const;

export type N8nGovernedActionType =
  (typeof N8N_GOVERNED_ACTION_TYPES)[number];

export const N8N_ACTION_ENFORCEMENT_MODES = [
  "annotate",
  "stop_on_block",
  "stop_until_allowed"
] as const;

export type N8nActionEnforcementMode =
  (typeof N8N_ACTION_ENFORCEMENT_MODES)[number];

export interface N8nActionCheckpointInput {
  actionType: string;
  destinationType: GlobiguardDestinationSystemType;
  destinationName: string;
  dataClasses: GlobiguardDataClass[];
  itemJson: Record<string, unknown>;
  nodeName: string;
  itemIndex: number;
  purpose?: string;
  idempotencyKey?: string;
}

export function buildN8nActionAuthorizationRequest({
  actionType,
  destinationType,
  destinationName,
  dataClasses,
  itemJson,
  nodeName,
  itemIndex,
  purpose,
  idempotencyKey
}: N8nActionCheckpointInput): GlobiguardActionAuthorizationRequest {
  return {
    context: {
      actionType,
      destination: {
        type: destinationType,
        name: destinationName
      },
      dataClasses,
      payloadSummary: summarizeN8nJsonPayload(itemJson),
      idempotencyKey,
      purpose,
      metadata: {
        integrationKind: "n8n",
        nodeName,
        itemIndex
      }
    }
  };
}

export function summarizeN8nJsonPayload(
  itemJson: Record<string, unknown>
): GlobiguardActionAuthorizationRequest["context"]["payloadSummary"] {
  const topLevelKeys = Object.keys(itemJson).sort();
  const topLevelValueKinds = Object.fromEntries(
    topLevelKeys.map((key) => [key, valueKind(itemJson[key])])
  );

  return {
    approxBytes: new TextEncoder().encode(JSON.stringify(itemJson)).byteLength,
    topLevelKeys,
    topLevelValueKinds
  };
}

export function shouldStopForGovernedAction(
  decision: GlobiguardActionAuthorizationResponse,
  enforcementMode: N8nActionEnforcementMode
): boolean {
  if (enforcementMode === "annotate") {
    return false;
  }

  if (enforcementMode === "stop_on_block") {
    return decision.decision === "BLOCK";
  }

  return decision.decision === "BLOCK" || decision.decision === "QUEUE";
}

function valueKind(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return typeof value;
}
