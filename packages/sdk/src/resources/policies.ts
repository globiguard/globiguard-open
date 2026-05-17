import type {
  GlobiguardIndustry,
  GlobiguardPoliciesClient,
  GlobiguardPoliciesReadClient,
  GlobiguardPolicy,
  GlobiguardPolicyCreateRequest,
  GlobiguardPolicyListRequest,
  GlobiguardPolicyTemplate,
  GlobiguardPolicyUpdateRequest
} from "@globiguard/contracts";

import type { GlobiguardTransport } from "../client.js";
import { GlobiguardConfigError } from "../errors.js";
import { encodePathSegment } from "./path-segments.js";

export function createPoliciesReadClient(
  transport: GlobiguardTransport
): GlobiguardPoliciesReadClient {
  return {
    list(request: GlobiguardPolicyListRequest) {
      if (request.active === undefined) {
        throw new GlobiguardConfigError(
          "Policies list requires an explicit active filter."
        );
      }

      return transport.request<GlobiguardPolicy[]>("/v1/policies", {
        query: {
          industry: request.industry,
          active: request.active
        }
      });
    },

    listTemplates(industry?: GlobiguardIndustry) {
      return transport.request<GlobiguardPolicyTemplate[]>("/v1/policies/templates", {
        query: industry ? { industry } : undefined
      });
    },

    get(policyId: string) {
      const encodedPolicyId = encodePathSegment(policyId);

      return transport.request<GlobiguardPolicy>(`/v1/policies/${encodedPolicyId}`);
    }
  };
}

export function createPoliciesClient(
  transport: GlobiguardTransport
): GlobiguardPoliciesClient {
  const readClient = createPoliciesReadClient(transport);

  return {
    ...readClient,

    create(request: GlobiguardPolicyCreateRequest) {
      return transport.request<GlobiguardPolicy>("/v1/policies", {
        method: "POST",
        body: request
      });
    },

    createFromTemplate(templateId: string) {
      const encodedTemplateId = encodePathSegment(templateId);

      return transport.request<GlobiguardPolicy>(
        `/v1/policies/from-template/${encodedTemplateId}`,
        {
          method: "POST"
        }
      );
    },

    update(policyId: string, request: GlobiguardPolicyUpdateRequest) {
      const encodedPolicyId = encodePathSegment(policyId);

      return transport.request<GlobiguardPolicy>(
        `/v1/policies/${encodedPolicyId}`,
        {
          method: "PUT",
          body: request
        }
      );
    },

    remove(policyId: string) {
      const encodedPolicyId = encodePathSegment(policyId);

      return transport.request<void>(`/v1/policies/${encodedPolicyId}`, {
        method: "DELETE"
      });
    },

    activate(policyId: string) {
      const encodedPolicyId = encodePathSegment(policyId);

      return transport.request<GlobiguardPolicy>(
        `/v1/policies/${encodedPolicyId}/activate`,
        {
          method: "POST"
        }
      );
    }
  };
}
