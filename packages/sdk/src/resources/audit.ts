import type {
  GlobiguardAuditClient,
  GlobiguardAuditEvidencePackageArtifact,
  GlobiguardAuditEvent,
  GlobiguardAuditExportRequest,
  GlobiguardAuditListRequest,
  GlobiguardAuditListResponse,
  GlobiguardAuditReadClient,
  GlobiguardEvidencePackageSummary,
  GlobiguardIncidentReplay,
  GlobiguardIncidentReplayLookupRequest
} from "@globiguard/contracts";

import type { GlobiguardTransport } from "../client.js";
import { encodePathSegment } from "./path-segments.js";

interface RawGlobiguardAuditExportResponse {
  status: "ready";
  artifact_export_id: string;
  evidence_package_id: string;
  format: "json";
  checksum: string;
  artifact_json: string;
  artifact: GlobiguardAuditEvidencePackageArtifact;
}

export function createAuditReadClient(
  transport: GlobiguardTransport
): GlobiguardAuditReadClient {
  return {
    list(request?: GlobiguardAuditListRequest) {
      const query = request
        ? {
            from: request.from,
            to: request.to,
            decision: request.decision,
            workflow: request.workflowRunId,
            page: request.page,
            limit: request.limit
          }
        : undefined;

      return transport.request<GlobiguardAuditListResponse>("/v1/audit", {
        query
      });
    },

    get(auditEventId: string) {
      const encodedAuditEventId = encodePathSegment(auditEventId);

      return transport.request<GlobiguardAuditEvent>(
        `/v1/audit/${encodedAuditEventId}`
      );
    },

    getEvidencePackageSummary(evidencePackageId: string) {
      const encodedEvidencePackageId = encodePathSegment(evidencePackageId);

      return transport.request<GlobiguardEvidencePackageSummary>(
        `/v1/audit/evidence-packages/${encodedEvidencePackageId}/summary`
      );
    },

    getIncidentReplay(request: GlobiguardIncidentReplayLookupRequest) {
      return transport.request<GlobiguardIncidentReplay>("/v1/audit/incident-replay", {
        query: {
          workflowRunId: request.workflowRunId,
          correlationId: request.correlationId,
          queueEntryId: request.queueEntryId,
          auditEventId: request.auditEventId,
          authorizationId: request.authorizationId
        }
      });
    }
  };
}

export function createAuditClient(
  transport: GlobiguardTransport
): GlobiguardAuditClient {
  const readClient = createAuditReadClient(transport);

  return {
    ...readClient,

    export(request?: GlobiguardAuditExportRequest) {
      return transport
        .request<RawGlobiguardAuditExportResponse>("/v1/audit/export", {
          method: "POST",
          body: request ?? {}
        })
        .then((response) => ({
          status: response.status,
          artifactExportId: response.artifact_export_id,
          evidencePackageId: response.evidence_package_id,
          format: response.format,
          checksum: response.checksum,
          artifactJson: response.artifact_json,
          artifact: response.artifact
        }));
    }
  };
}
