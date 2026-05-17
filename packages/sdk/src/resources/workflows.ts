import type {
  GlobiguardWorkflow,
  GlobiguardWorkflowCreateRequest,
  GlobiguardWorkflowListRequest,
  GlobiguardWorkflowRecord,
  GlobiguardWorkflowRun,
  GlobiguardWorkflowUpdateRequest,
  GlobiguardWorkflowsReadClient,
  GlobiguardWorkflowsClient,
} from "@globiguard/contracts";

import type { GlobiguardTransport } from "../client.js";
import { GlobiguardConfigError } from "../errors.js";
import { encodePathSegment } from "./path-segments.js";

export function createWorkflowsReadClient(
  transport: GlobiguardTransport
): GlobiguardWorkflowsReadClient {
  return {
    list(request: GlobiguardWorkflowListRequest) {
      if (request.active === undefined) {
        throw new GlobiguardConfigError(
          "Workflow list requires an explicit active filter."
        );
      }

      return transport.request<GlobiguardWorkflow[]>("/v1/workflows", {
        query: {
          active: request.active
        }
      });
    },

    get(workflowId: string) {
      const encodedWorkflowId = encodePathSegment(workflowId);

      return transport.request<GlobiguardWorkflow>(
        `/v1/workflows/${encodedWorkflowId}`
      );
    }
  };
}

export function createWorkflowsClient(
  transport: GlobiguardTransport
): GlobiguardWorkflowsClient {
  const readClient = createWorkflowsReadClient(transport);

  return {
    ...readClient,

    create(request: GlobiguardWorkflowCreateRequest) {
      return transport.request<GlobiguardWorkflow>("/v1/workflows", {
        method: "POST",
        body: request
      });
    },

    update(workflowId: string, request: GlobiguardWorkflowUpdateRequest) {
      const encodedWorkflowId = encodePathSegment(workflowId);

      return transport.request<GlobiguardWorkflowRecord>(
        `/v1/workflows/${encodedWorkflowId}`,
        {
          method: "PUT",
          body: request
        }
      );
    },

    remove(workflowId: string) {
      const encodedWorkflowId = encodePathSegment(workflowId);

      return transport.request<void>(`/v1/workflows/${encodedWorkflowId}`, {
        method: "DELETE"
      });
    },

    activate(workflowId: string) {
      const encodedWorkflowId = encodePathSegment(workflowId);

      return transport.request<GlobiguardWorkflowRecord>(
        `/v1/workflows/${encodedWorkflowId}/activate`,
        {
          method: "POST"
        }
      );
    },

    run(workflowId: string, triggerData?: Record<string, unknown>) {
      const encodedWorkflowId = encodePathSegment(workflowId);

      return transport.request<GlobiguardWorkflowRun>(
        `/v1/workflows/${encodedWorkflowId}/run`,
        {
          method: "POST",
          body: triggerData ?? {}
        }
      );
    },

    listRuns(workflowId: string) {
      const encodedWorkflowId = encodePathSegment(workflowId);

      return transport.request<GlobiguardWorkflowRun[]>(
        `/v1/workflows/${encodedWorkflowId}/runs`
      );
    }
  };
}

