import type {
  GlobiguardApiKey,
  GlobiguardApiKeyCreateRequest,
  GlobiguardApiKeyCreateResponse,
  GlobiguardOrg,
  GlobiguardOrgCreateRequest,
  GlobiguardOrgsClient,
  GlobiguardOrgUpdateRequest
} from "@globiguard/contracts";

import type { GlobiguardTransport } from "../client.js";
import { encodePathSegment } from "./path-segments.js";

export function createOrgsClient(
  transport: GlobiguardTransport
): GlobiguardOrgsClient {
  return {
    findBySlug(slug: string) {
      return transport.request<GlobiguardOrg>("/v1/orgs", {
        query: {
          slug
        }
      });
    },

    create(request: GlobiguardOrgCreateRequest) {
      return transport.request<GlobiguardOrg>("/v1/orgs", {
        method: "POST",
        body: request
      });
    },

    get(orgId: string) {
      const encodedOrgId = encodePathSegment(orgId);

      return transport.request<GlobiguardOrg>(`/v1/orgs/${encodedOrgId}`);
    },

    update(orgId: string, request: GlobiguardOrgUpdateRequest) {
      const encodedOrgId = encodePathSegment(orgId);

      return transport.request<GlobiguardOrg>(`/v1/orgs/${encodedOrgId}`, {
        method: "PATCH",
        body: request
      });
    },

    createApiKey(orgId: string, request: GlobiguardApiKeyCreateRequest) {
      const encodedOrgId = encodePathSegment(orgId);

      return transport.request<GlobiguardApiKeyCreateResponse>(
        `/v1/orgs/${encodedOrgId}/api-keys`,
        {
          method: "POST",
          body: request
        }
      );
    },

    listApiKeys(orgId: string) {
      const encodedOrgId = encodePathSegment(orgId);

      return transport.request<GlobiguardApiKey[]>(
        `/v1/orgs/${encodedOrgId}/api-keys`
      );
    },

    revokeApiKey(orgId: string, apiKeyId: string) {
      const encodedOrgId = encodePathSegment(orgId);
      const encodedApiKeyId = encodePathSegment(apiKeyId);

      return transport.request<void>(
        `/v1/orgs/${encodedOrgId}/api-keys/${encodedApiKeyId}`,
        {
          method: "DELETE"
        }
      );
    }
  };
}
