import type {
  GlobiguardSdkErrorShape,
  GlobiguardServerAuthorityContract
} from "./authority.js";

export const GLOBIGUARD_TRUST_WEBHOOK_CONTRACT_VERSION =
  "2026-05-trust-webhook-beta" as const;

export const GLOBIGUARD_TRUST_WEBHOOK_SIGNATURE_SCHEME =
  "globiguard-hmac-sha256-v1" as const;

export const GLOBIGUARD_TRUST_WEBHOOK_HEADER_NAMES = Object.freeze({
  deliveryId: "x-globiguard-delivery-id",
  timestamp: "x-globiguard-timestamp",
  eventType: "x-globiguard-event-type",
  signature: "x-globiguard-signature"
});

export const GLOBIGUARD_TRUST_WEBHOOK_EVENT_TYPES = [
  "approval.requested",
  "approval.approved",
  "approval.rejected",
  "action.blocked",
  "action.queued",
  "evidence.ready",
  "incident.replay_ready",
  "trust.material_updated"
] as const;

export type GlobiguardTrustWebhookEventType =
  (typeof GLOBIGUARD_TRUST_WEBHOOK_EVENT_TYPES)[number];

export interface GlobiguardTrustWebhookHeaders {
  deliveryId: string;
  timestamp: string;
  eventType: GlobiguardTrustWebhookEventType | string;
  signature: string;
}

export interface GlobiguardTrustWebhookEnvelope<TData = Record<string, unknown>> {
  contractVersion:
    | typeof GLOBIGUARD_TRUST_WEBHOOK_CONTRACT_VERSION
    | string;
  id: string;
  timestamp: string;
  type: GlobiguardTrustWebhookEventType | string;
  apiFamily: "webhooks.v1";
  data: TData;
  related?: {
    authorizationId?: string;
    queueEntryId?: string;
    approvalId?: string;
    evidencePackageId?: string;
    incidentReplayId?: string;
    workflowRunId?: string;
    correlationId?: string;
  };
}

export interface GlobiguardTrustWebhookVerificationRequest
  extends GlobiguardServerAuthorityContract {
  headers: GlobiguardTrustWebhookHeaders;
  rawBody: string | Uint8Array;
  signingSecret: string;
  toleranceSeconds?: number;
  now?: Date;
  seenDelivery?: (deliveryId: string) => boolean | Promise<boolean>;
}

export interface GlobiguardTrustWebhookVerificationSuccess {
  ok: true;
  deliveryId: string;
  eventType: GlobiguardTrustWebhookEventType | string;
  timestamp: string;
  envelope: GlobiguardTrustWebhookEnvelope;
  duplicateDelivery: boolean;
}

export interface GlobiguardTrustWebhookVerificationFailure {
  ok: false;
  deliveryId?: string;
  eventType?: string;
  timestamp?: string;
  error: GlobiguardSdkErrorShape & {
    kind: "WEBHOOK_VERIFICATION_FAILED";
  };
}

export type GlobiguardTrustWebhookVerificationResult =
  | GlobiguardTrustWebhookVerificationSuccess
  | GlobiguardTrustWebhookVerificationFailure;

