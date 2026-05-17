import type { GlobiguardIndustry } from "./industry.js";

export type GlobiguardUuid = `${string}-${string}-${string}-${string}-${string}`;

export const GLOBIGUARD_PLAN_TIERS = [
  "DEMO",
  "PILOT",
  "STARTER",
  "PROFESSIONAL",
  "ENTERPRISE"
] as const;

export type GlobiguardPlanTier = (typeof GLOBIGUARD_PLAN_TIERS)[number];

export const GLOBIGUARD_API_KEY_SCOPES = [
  "ADMIN",
  "SIDECAR",
  "READ_ONLY",
  "DEMO"
] as const;

export type GlobiguardApiKeyScope =
  (typeof GLOBIGUARD_API_KEY_SCOPES)[number];

export interface GlobiguardOrg {
  id: string;
  name: string;
  slug: string;
  industry: GlobiguardIndustry;
  plan: GlobiguardPlanTier;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GlobiguardOrgCreateRequest {
  id?: GlobiguardUuid;
  name: string;
  slug: string;
  industry?: GlobiguardIndustry;
}

export interface GlobiguardOrgUpdateRequest {
  name?: string;
  industry?: GlobiguardIndustry;
}

export interface GlobiguardApiKey {
  id: string;
  keyPrefix: string;
  label: string;
  scope: GlobiguardApiKeyScope;
  active: boolean;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

export interface GlobiguardApiKeyCreateRequest {
  label: string;
  scope: GlobiguardApiKeyScope;
  expiresAt?: string;
}

export interface GlobiguardApiKeyCreateResponse {
  key: string;
  prefix: string;
  scope: GlobiguardApiKeyScope;
  label: string;
}

export interface GlobiguardOrgsClient {
  findBySlug(slug: string): Promise<GlobiguardOrg>;
  create(request: GlobiguardOrgCreateRequest): Promise<GlobiguardOrg>;
  get(orgId: string): Promise<GlobiguardOrg>;
  update(
    orgId: string,
    request: GlobiguardOrgUpdateRequest
  ): Promise<GlobiguardOrg>;
  createApiKey(
    orgId: string,
    request: GlobiguardApiKeyCreateRequest
  ): Promise<GlobiguardApiKeyCreateResponse>;
  listApiKeys(orgId: string): Promise<GlobiguardApiKey[]>;
  revokeApiKey(orgId: string, apiKeyId: string): Promise<void>;
}
