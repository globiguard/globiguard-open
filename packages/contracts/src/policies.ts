import type { GlobiguardIndustry } from "./industry.js";

export const GLOBIGUARD_SENSITIVITY_TIERS = [
  "PUBLIC",
  "RESTRICTED",
  "CONFIDENTIAL",
  "BLOCKED"
] as const;

export type GlobiguardSensitivityTier =
  (typeof GLOBIGUARD_SENSITIVITY_TIERS)[number];

export const GLOBIGUARD_RULE_ACTIONS = [
  "ALLOW",
  "MASK",
  "BLOCK",
  "REQUIRE_APPROVAL"
] as const;

export type GlobiguardRuleAction = (typeof GLOBIGUARD_RULE_ACTIONS)[number];

export interface GlobiguardPolicyRule {
  id: string;
  policyId: string;
  fieldName: string;
  fieldPattern?: string | null;
  sensitivityTier: GlobiguardSensitivityTier;
  action: GlobiguardRuleAction;
  notes?: string | null;
  order: number;
}

export interface GlobiguardPolicyRuleInput {
  fieldName: string;
  fieldPattern?: string;
  sensitivityTier: GlobiguardSensitivityTier;
  action: GlobiguardRuleAction;
  notes?: string;
}

export interface GlobiguardPolicy {
  id: string;
  orgId: string;
  name: string;
  industry: GlobiguardIndustry;
  version: number;
  active: boolean;
  templateId?: string | null;
  createdAt: string;
  updatedAt: string;
  rules: GlobiguardPolicyRule[];
}

export interface GlobiguardPolicyTemplate {
  id: string;
  industry: GlobiguardIndustry;
  name: string;
  description: string;
  version: number;
  rulesJson: unknown;
  gatesJson: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface GlobiguardPolicyListRequest {
  industry?: GlobiguardIndustry;
  active: boolean;
}

export interface GlobiguardPolicyCreateRequest {
  name: string;
  industry?: GlobiguardIndustry;
  rules?: GlobiguardPolicyRuleInput[];
}

export interface GlobiguardPolicyUpdateRequest {
  name?: string;
  active?: boolean;
  rules?: GlobiguardPolicyRuleInput[];
}

export interface GlobiguardPoliciesReadClient {
  list(request: GlobiguardPolicyListRequest): Promise<GlobiguardPolicy[]>;
  listTemplates(industry?: GlobiguardIndustry): Promise<GlobiguardPolicyTemplate[]>;
  get(policyId: string): Promise<GlobiguardPolicy>;
}

export interface GlobiguardPoliciesClient extends GlobiguardPoliciesReadClient {
  create(request: GlobiguardPolicyCreateRequest): Promise<GlobiguardPolicy>;
  createFromTemplate(templateId: string): Promise<GlobiguardPolicy>;
  update(
    policyId: string,
    request: GlobiguardPolicyUpdateRequest
  ): Promise<GlobiguardPolicy>;
  remove(policyId: string): Promise<void>;
  activate(policyId: string): Promise<GlobiguardPolicy>;
}
