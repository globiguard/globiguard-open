import type {
  GlobiguardQueueClient,
  GlobiguardQueueDecisionRequest,
  GlobiguardQueueDecisionResponse,
  GlobiguardQueueEntry,
  GlobiguardQueueListRequest,
  GlobiguardQueueReadClient
} from "@globiguard/contracts";

import type { GlobiguardTransport } from "../client.js";
import { encodePathSegment } from "./path-segments.js";

export function createQueueReadClient(
  transport: GlobiguardTransport
): GlobiguardQueueReadClient {
  return {
    list(request?: GlobiguardQueueListRequest) {
      const query = request
        ? {
            status: request.status
          }
        : undefined;

      return transport.request<GlobiguardQueueEntry[]>("/v1/queue", {
        query
      });
    },

    get(queueEntryId: string) {
      const encodedQueueEntryId = encodePathSegment(queueEntryId);

      return transport.request<GlobiguardQueueEntry>(
        `/v1/queue/${encodedQueueEntryId}`
      );
    }
  };
}

export function createQueueClient(
  transport: GlobiguardTransport
): GlobiguardQueueClient {
  const readClient = createQueueReadClient(transport);

  return {
    ...readClient,

    decide(queueEntryId: string, request: GlobiguardQueueDecisionRequest) {
      const encodedQueueEntryId = encodePathSegment(queueEntryId);
      const body = request.action === "resume"
        ? {}
        : Object.fromEntries(
            Object.entries(request).filter(([key]) => key !== "action")
          );

      return transport.request<GlobiguardQueueDecisionResponse>(
        `/v1/queue/${encodedQueueEntryId}/${request.action}`,
        {
          method: "POST",
          body
        }
      );
    }
  };
}

