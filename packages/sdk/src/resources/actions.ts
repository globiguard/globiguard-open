import type {
  GlobiguardActionAuthorizationRequest,
  GlobiguardActionAuthorizationResponse,
  GlobiguardActionsClient,
  GlobiguardActionsReadClient,
  GlobiguardApproval,
  GlobiguardApprovalCreateRequest,
  GlobiguardEvidenceListRequest,
  GlobiguardEvidenceRef
} from "@globiguard/contracts";

import type { GlobiguardTransport } from "../client.js";
import { encodePathSegment } from "./path-segments.js";

export function createActionsReadClient(
  transport: GlobiguardTransport
): GlobiguardActionsReadClient {
  return {
    getAuthorization(authorizationId: string) {
      const encodedAuthorizationId = encodePathSegment(authorizationId);

      return transport.request<GlobiguardActionAuthorizationResponse>(
        `/v1/actions/authorizations/${encodedAuthorizationId}`
      );
    },

    getApproval(approvalId: string) {
      const encodedApprovalId = encodePathSegment(approvalId);

      return transport.request<GlobiguardApproval>(
        `/v1/actions/approvals/${encodedApprovalId}`
      );
    },

    listEvidence(request?: GlobiguardEvidenceListRequest) {
      const query = request
        ? {
            authorizationId: request.authorizationId,
            approvalId: request.approvalId,
            workflowRunId: request.workflowRunId
          }
        : undefined;

      return transport.request<GlobiguardEvidenceRef[]>("/v1/actions/evidence", {
        query
      });
    },

    getEvidence(evidenceRefId: string) {
      const encodedEvidenceRefId = encodePathSegment(evidenceRefId);

      return transport.request<GlobiguardEvidenceRef>(
        `/v1/actions/evidence/${encodedEvidenceRefId}`
      );
    }
  };
}

export function createActionsClient(
  transport: GlobiguardTransport
): GlobiguardActionsClient {
  const readClient = createActionsReadClient(transport);

  return {
    ...readClient,

    authorize(request: GlobiguardActionAuthorizationRequest) {
      return transport.request<GlobiguardActionAuthorizationResponse>(
        "/v1/actions/authorize",
        {
          method: "POST",
          body: request
        }
      );
    },

    createApproval(request: GlobiguardApprovalCreateRequest) {
      return transport.request<GlobiguardApproval>("/v1/actions/approvals", {
        method: "POST",
        body: request
      });
    }
  };
}
