import crypto from "node:crypto";

import type {
  GlobiguardEntitlementManifestEnvironment,
  GlobiguardOfflineDeploymentMode,
  GlobiguardSignedEntitlementManifest,
  GlobiguardSignedEntitlementManifestProtectedHeader,
  GlobiguardEntitlementManifestPayload
} from "@globiguard/contracts";
import {
  GLOBIGUARD_ENTITLEMENT_MANIFEST_TYPE,
  GLOBIGUARD_ENTITLEMENT_SIGNING_ALGORITHM
} from "@globiguard/contracts";

import { GlobiguardConfigError } from "./errors.js";

const COMMERCIAL_PLANS = new Set([
  "FREE",
  "STARTER",
  "GROWTH",
  "SCALE",
  "ENTERPRISE"
] as const);

const BILLING_STATUSES = new Set([
  "FREE",
  "PILOT",
  "ACTIVE",
  "GRACE",
  "PAST_DUE",
  "SUSPENDED",
  "CANCELED"
] as const);

const OVERAGE_MODES = new Set([
  "NONE",
  "METERED",
  "CONTRACT"
] as const);

const OFFLINE_DEPLOYMENT_MODES = new Set([
  "self_hosted",
  "sovereign"
] as const);

const MANIFEST_ENVIRONMENTS = new Set([
  "sandbox",
  "live"
] as const);

export interface VerifySignedEntitlementManifestOptions {
  publicKeysById: Record<string, string>;
  expectedIssuer?: string;
  expectedOrgId?: string;
  expectedProjectId?: string;
  expectedEnvironment?: GlobiguardEntitlementManifestEnvironment;
  expectedDeploymentMode?: GlobiguardOfflineDeploymentMode;
  now?: Date;
}

export function verifySignedEntitlementManifest(
  manifest: GlobiguardSignedEntitlementManifest,
  options: VerifySignedEntitlementManifestOptions
): GlobiguardEntitlementManifestPayload {
  const decoded = decodeManifestToken(manifest.token);

  if (manifest.serialization !== "jws-compact") {
    throw new GlobiguardConfigError(
      "Unsupported entitlement manifest serialization."
    );
  }
  if (JSON.stringify(manifest.protected) !== JSON.stringify(decoded.protected)) {
    throw new GlobiguardConfigError(
      "Entitlement manifest protected header does not match the signed token."
    );
  }
  if (JSON.stringify(manifest.payload) !== JSON.stringify(decoded.payload)) {
    throw new GlobiguardConfigError(
      "Entitlement manifest payload does not match the signed token."
    );
  }

  const rawPublicKey = options.publicKeysById[decoded.protected.kid];
  if (!rawPublicKey) {
    throw new GlobiguardConfigError(
      `Unknown entitlement manifest signing key "${decoded.protected.kid}".`
    );
  }

  const verified = crypto.verify(
    null,
    Buffer.from(decoded.signingInput, "utf8"),
    createEd25519PublicKey(rawPublicKey),
    decoded.signature
  );
  if (!verified) {
    throw new GlobiguardConfigError(
      "Entitlement manifest signature verification failed."
    );
  }

  const now = options.now ?? new Date();
  const issuedAt = parseIsoDate(decoded.payload.issuedAt, "issuedAt");
  const notBefore = parseIsoDate(decoded.payload.notBefore, "notBefore");
  const expiresAt = parseIsoDate(decoded.payload.expiresAt, "expiresAt");
  if (!issuedAt) {
    throw new GlobiguardConfigError(
      "Entitlement manifest field \"issuedAt\" must be present."
    );
  }
  if (!notBefore) {
    throw new GlobiguardConfigError(
      "Entitlement manifest field \"notBefore\" must be present."
    );
  }
  if (!expiresAt) {
    throw new GlobiguardConfigError(
      "Entitlement manifest field \"expiresAt\" must be present."
    );
  }
  if (issuedAt.getTime() > expiresAt.getTime()) {
    throw new GlobiguardConfigError(
      "Entitlement manifest timestamps are inconsistent."
    );
  }

  if (notBefore.getTime() > now.getTime()) {
    throw new GlobiguardConfigError(
      "Entitlement manifest is not active yet."
    );
  }
  if (expiresAt.getTime() <= now.getTime()) {
    throw new GlobiguardConfigError("Entitlement manifest has expired.");
  }
  if (
    options.expectedIssuer &&
    decoded.payload.issuer !== options.expectedIssuer
  ) {
    throw new GlobiguardConfigError(
      "Entitlement manifest issuer does not match the expected issuer."
    );
  }
  if (
    options.expectedOrgId &&
    decoded.payload.subject.orgId !== options.expectedOrgId
  ) {
    throw new GlobiguardConfigError(
      "Entitlement manifest workspace does not match the expected workspace."
    );
  }
  if (
    options.expectedProjectId &&
    decoded.payload.subject.projectId !== options.expectedProjectId
  ) {
    throw new GlobiguardConfigError(
      "Entitlement manifest project does not match the expected project."
    );
  }
  if (
    options.expectedEnvironment &&
    decoded.payload.subject.environment !== options.expectedEnvironment
  ) {
    throw new GlobiguardConfigError(
      "Entitlement manifest environment does not match the expected environment."
    );
  }
  if (
    options.expectedDeploymentMode &&
    decoded.payload.subject.deploymentMode !== options.expectedDeploymentMode
  ) {
    throw new GlobiguardConfigError(
      "Entitlement manifest deployment mode does not match the expected deployment mode."
    );
  }

  return decoded.payload;
}

function decodeManifestToken(token: string): {
  protected: GlobiguardSignedEntitlementManifestProtectedHeader;
  payload: GlobiguardEntitlementManifestPayload;
  signature: Buffer;
  signingInput: string;
} {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new GlobiguardConfigError("Invalid entitlement manifest token.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const protectedHeader = decodeJson<GlobiguardSignedEntitlementManifestProtectedHeader>(
    encodedHeader,
    "Invalid entitlement manifest protected header."
  );
  const payload = decodeJson<GlobiguardEntitlementManifestPayload>(
    encodedPayload,
    "Invalid entitlement manifest payload."
  );

  if (
    protectedHeader.alg !== GLOBIGUARD_ENTITLEMENT_SIGNING_ALGORITHM ||
    protectedHeader.typ !== GLOBIGUARD_ENTITLEMENT_MANIFEST_TYPE ||
    !protectedHeader.kid
  ) {
    throw new GlobiguardConfigError(
      "Unsupported entitlement manifest protected header."
    );
  }
  if (
    payload.manifestType !== GLOBIGUARD_ENTITLEMENT_MANIFEST_TYPE ||
    payload.manifestVersion !== 1
  ) {
    throw new GlobiguardConfigError(
      "Unsupported entitlement manifest payload."
    );
  }
  validateManifestPayload(payload);

  return {
    protected: protectedHeader,
    payload,
    signature: decodeBase64Url(encodedSignature),
    signingInput: `${encodedHeader}.${encodedPayload}`
  };
}

function parseIsoDate(
  value: string | undefined,
  fieldName: string
): Date | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new GlobiguardConfigError(
      `Entitlement manifest field "${fieldName}" must be a valid ISO timestamp.`
    );
  }
  return new Date(timestamp);
}

function validateManifestPayload(
  payload: GlobiguardEntitlementManifestPayload
): void {
  requireNonEmptyString(payload.manifestId, "manifestId");
  requireNonEmptyString(payload.issuer, "issuer");
  requireNonEmptyString(payload.issuedAt, "issuedAt");
  requireNonEmptyString(payload.notBefore, "notBefore");
  requireNonEmptyString(payload.expiresAt, "expiresAt");

  validateManifestSubject(payload.subject);
  validateCommercialState(payload.commercial);
  validateEntitlements(payload.entitlements);
}

function validateManifestSubject(
  subject: GlobiguardEntitlementManifestPayload["subject"]
): void {
  requireNonEmptyString(subject.orgId, "subject.orgId");
  requireNonEmptyString(subject.workspaceName, "subject.workspaceName");
  requireNonEmptyString(subject.orgSlug, "subject.orgSlug");
  requireNonEmptyString(subject.projectId, "subject.projectId");
  requireNonEmptyString(subject.projectSlug, "subject.projectSlug");
  requireRequiredEnvironment(subject.environment, "subject.environment");
  if (!OFFLINE_DEPLOYMENT_MODES.has(subject.deploymentMode)) {
    throw new GlobiguardConfigError(
      "Entitlement manifest field \"subject.deploymentMode\" is invalid."
    );
  }
}

function validateCommercialState(
  commercial: GlobiguardEntitlementManifestPayload["commercial"]
): void {
  if (!COMMERCIAL_PLANS.has(commercial.commercialPlan)) {
    throw new GlobiguardConfigError(
      "Entitlement manifest field \"commercial.commercialPlan\" is invalid."
    );
  }
  if (!BILLING_STATUSES.has(commercial.billingStatus)) {
    throw new GlobiguardConfigError(
      "Entitlement manifest field \"commercial.billingStatus\" is invalid."
    );
  }
  if (typeof commercial.pilotActive !== "boolean") {
    throw new GlobiguardConfigError(
      "Entitlement manifest field \"commercial.pilotActive\" is invalid."
    );
  }
}

function validateEntitlements(
  entitlements: GlobiguardEntitlementManifestPayload["entitlements"]
): void {
  requireNullableNonNegativeInteger(
    entitlements.includedQueriesPerMonth,
    "entitlements.includedQueriesPerMonth"
  );
  requireNullableNonNegativeInteger(
    entitlements.frameworkSlots,
    "entitlements.frameworkSlots"
  );
  if (!OVERAGE_MODES.has(entitlements.overageMode)) {
    throw new GlobiguardConfigError(
      "Entitlement manifest field \"entitlements.overageMode\" is invalid."
    );
  }
}

function requireNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new GlobiguardConfigError(
      `Entitlement manifest field "${fieldName}" must be a non-empty string.`
    );
  }
}

function requireRequiredEnvironment(
  value: string,
  fieldName: string
): void {
  if (!MANIFEST_ENVIRONMENTS.has(value as "sandbox" | "live")) {
    throw new GlobiguardConfigError(
      `Entitlement manifest field "${fieldName}" is invalid.`
    );
  }
}

function requireNullableNonNegativeInteger(
  value: number | null,
  fieldName: string
): void {
  if (value === null) {
    return;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new GlobiguardConfigError(
      `Entitlement manifest field "${fieldName}" must be a non-negative integer or null.`
    );
  }
}

function createEd25519PublicKey(base64UrlKey: string): crypto.KeyObject {
  const rawKey = decodeBase64Url(base64UrlKey);
  if (rawKey.length !== 32) {
    throw new GlobiguardConfigError(
      "Entitlement manifest public key must be a base64url-encoded Ed25519 key."
    );
  }
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  return crypto.createPublicKey({
    key: Buffer.concat([spkiPrefix, rawKey]),
    format: "der",
    type: "spki"
  });
}

function decodeJson<T>(value: string, message: string): T {
  try {
    return JSON.parse(decodeBase64Url(value).toString("utf8")) as T;
  } catch {
    throw new GlobiguardConfigError(message);
  }
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    normalized.length % 4 === 0
      ? ""
      : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}
