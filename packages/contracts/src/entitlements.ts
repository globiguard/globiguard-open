import type { GlobiguardDeploymentMode } from "./bootstrap.js";
import type { GlobiguardEnvironment } from "./environment.js";

export const GLOBIGUARD_ENTITLEMENT_MANIFEST_TYPE =
  "globiguard.entitlement.v1" as const;

export const GLOBIGUARD_ENTITLEMENT_SIGNING_ALGORITHM = "EdDSA" as const;
export const GLOBIGUARD_ENTITLEMENT_SERIALIZATION = "jws-compact" as const;

export type GlobiguardCommercialPlanCode =
  | "FREE"
  | "STARTER"
  | "GROWTH"
  | "SCALE"
  | "ENTERPRISE";

export type GlobiguardBillingStatusCode =
  | "FREE"
  | "PILOT"
  | "ACTIVE"
  | "GRACE"
  | "PAST_DUE"
  | "SUSPENDED"
  | "CANCELED";

export type GlobiguardEntitlementOverageMode =
  | "NONE"
  | "METERED"
  | "CONTRACT";

export type GlobiguardOfflineDeploymentMode = Exclude<
  GlobiguardDeploymentMode,
  "hosted"
>;

export type GlobiguardEntitlementManifestEnvironment = Extract<
  GlobiguardEnvironment,
  "sandbox" | "live"
>;

export interface GlobiguardEntitlementManifestSubject {
  orgId: string;
  workspaceName: string;
  orgSlug: string;
  projectId: string;
  projectSlug: string;
  environment: GlobiguardEntitlementManifestEnvironment;
  deploymentMode: GlobiguardOfflineDeploymentMode;
}

export interface GlobiguardEntitlementManifestCommercialState {
  commercialPlan: GlobiguardCommercialPlanCode;
  billingStatus: GlobiguardBillingStatusCode;
  pilotActive: boolean;
}

export interface GlobiguardEntitlementManifestEntitlements {
  includedQueriesPerMonth: number | null;
  frameworkSlots: number | null;
  overageMode: GlobiguardEntitlementOverageMode;
}

export interface GlobiguardEntitlementManifestPayload {
  manifestType: typeof GLOBIGUARD_ENTITLEMENT_MANIFEST_TYPE;
  manifestVersion: 1;
  manifestId: string;
  issuer: string;
  issuedAt: string;
  notBefore: string;
  expiresAt: string;
  subject: GlobiguardEntitlementManifestSubject;
  commercial: GlobiguardEntitlementManifestCommercialState;
  entitlements: GlobiguardEntitlementManifestEntitlements;
}

export interface GlobiguardSignedEntitlementManifestProtectedHeader {
  alg: typeof GLOBIGUARD_ENTITLEMENT_SIGNING_ALGORITHM;
  kid: string;
  typ: typeof GLOBIGUARD_ENTITLEMENT_MANIFEST_TYPE;
}

export interface GlobiguardSignedEntitlementManifest {
  serialization: typeof GLOBIGUARD_ENTITLEMENT_SERIALIZATION;
  token: string;
  protected: GlobiguardSignedEntitlementManifestProtectedHeader;
  payload: GlobiguardEntitlementManifestPayload;
}
