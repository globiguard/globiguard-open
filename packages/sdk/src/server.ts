import {
  GLOBIGUARD_SERVER_AUTHORITY_BOUNDARY,
  GLOBIGUARD_TRUST_WEBHOOK_HEADER_NAMES,
  GLOBIGUARD_TRUST_WEBHOOK_SIGNATURE_SCHEME,
  type GlobiguardTrustWebhookEnvelope,
  type GlobiguardTrustWebhookHeaders,
  type GlobiguardTrustWebhookVerificationRequest,
  type GlobiguardTrustWebhookVerificationResult
} from "@globiguard/contracts";

import { GlobiguardConfigError } from "./errors.js";
export {
  createGovernedActionsClient,
  deriveActionIdempotencyKey,
  generateCorrelationId
} from "./governed-actions.js";
export type {
  GlobiguardGovernedActionsClient,
  GlobiguardGovernedActionRuntimeConfig,
  GlobiguardIdempotencyKeyInput,
  GlobiguardWaitForApprovalOptions
} from "./governed-actions.js";

export async function verifyTrustWebhook(
  request: Omit<
    GlobiguardTrustWebhookVerificationRequest,
    "boundary" | "headers"
  > & {
    headers: GlobiguardTrustWebhookHeaders | Headers;
  }
): Promise<GlobiguardTrustWebhookVerificationResult> {
  assertServerOnlyRuntime();
  const headers = normalizeHeaders(request.headers);
  const toleranceSeconds = request.toleranceSeconds ?? 300;
  const now = request.now ?? new Date();
  const rawBody = toUint8Array(request.rawBody);
  const bodyText = new TextDecoder().decode(rawBody);

  if (!headers.deliveryId || !headers.timestamp || !headers.eventType) {
    return verificationFailure("Missing required GlobiGuard webhook headers.", headers);
  }

  const parsedTimestamp = Date.parse(headers.timestamp);
  if (!Number.isFinite(parsedTimestamp)) {
    return verificationFailure("Invalid GlobiGuard webhook timestamp.", headers);
  }

  const ageSeconds = Math.abs(now.getTime() - parsedTimestamp) / 1000;
  if (ageSeconds > toleranceSeconds) {
    return verificationFailure(
      "GlobiGuard webhook timestamp is outside the accepted replay window.",
      headers
    );
  }

  let envelope: GlobiguardTrustWebhookEnvelope;
  try {
    envelope = JSON.parse(bodyText) as GlobiguardTrustWebhookEnvelope;
  } catch {
    return verificationFailure("GlobiGuard webhook body is not valid JSON.", headers);
  }

  if (envelope.id !== headers.deliveryId || envelope.type !== headers.eventType) {
    return verificationFailure(
      "GlobiGuard webhook headers do not match the signed envelope.",
      headers
    );
  }

  const signedPayload = buildSignedWebhookPayload(headers, bodyText);
  const expectedSignature = await hmacSha256Hex(
    request.signingSecret,
    signedPayload
  );
  const providedSignature = normalizeSignature(headers.signature);

  if (!constantTimeEqualHex(expectedSignature, providedSignature)) {
    return verificationFailure("Invalid GlobiGuard webhook signature.", headers);
  }

  const duplicateDelivery = request.seenDelivery
    ? await request.seenDelivery(headers.deliveryId)
    : false;

  return {
    ok: true,
    deliveryId: headers.deliveryId,
    eventType: headers.eventType,
    timestamp: headers.timestamp,
    envelope,
    duplicateDelivery
  };
}

export function buildSignedWebhookPayload(
  headers: GlobiguardTrustWebhookHeaders,
  rawBody: string
): string {
  return [
    GLOBIGUARD_TRUST_WEBHOOK_SIGNATURE_SCHEME,
    headers.deliveryId,
    headers.timestamp,
    headers.eventType,
    rawBody
  ].join(".");
}

function assertServerOnlyRuntime(): void {
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    throw new GlobiguardConfigError(
      "Trust webhook verification is server-only and must not run in a browser."
    );
  }
}

function normalizeHeaders(
  headers: GlobiguardTrustWebhookHeaders | Headers
): GlobiguardTrustWebhookHeaders {
  if (headers instanceof Headers) {
    return {
      deliveryId: headers.get(GLOBIGUARD_TRUST_WEBHOOK_HEADER_NAMES.deliveryId) ?? "",
      timestamp: headers.get(GLOBIGUARD_TRUST_WEBHOOK_HEADER_NAMES.timestamp) ?? "",
      eventType: headers.get(GLOBIGUARD_TRUST_WEBHOOK_HEADER_NAMES.eventType) ?? "",
      signature: headers.get(GLOBIGUARD_TRUST_WEBHOOK_HEADER_NAMES.signature) ?? ""
    };
  }

  return headers;
}

function normalizeSignature(signature: string): string {
  return signature.startsWith("v1=") ? signature.slice(3) : signature;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const cryptoImpl = globalThis.crypto;
  if (!cryptoImpl?.subtle) {
    throw new GlobiguardConfigError(
      "A Web Crypto subtle implementation is required to verify webhooks."
    );
  }

  const key = await cryptoImpl.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await cryptoImpl.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );

  return bytesToHex(new Uint8Array(signature));
}

function verificationFailure(
  message: string,
  headers: Partial<GlobiguardTrustWebhookHeaders>
): GlobiguardTrustWebhookVerificationResult {
  return {
    ok: false,
    deliveryId: headers.deliveryId,
    eventType: headers.eventType,
    timestamp: headers.timestamp,
    error: {
      kind: "WEBHOOK_VERIFICATION_FAILED",
      message,
      safeDetails: {
        boundary: GLOBIGUARD_SERVER_AUTHORITY_BOUNDARY.authorityLevel
      }
    }
  };
}

function toUint8Array(body: string | Uint8Array): Uint8Array {
  return typeof body === "string" ? new TextEncoder().encode(body) : body;
}

function constantTimeEqualHex(left: string, right: string): boolean {
  const leftBytes = hexToBytes(left);
  const rightBytes = hexToBytes(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[\da-f]*$/i.test(hex) || hex.length % 2 !== 0) {
    return new Uint8Array();
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

