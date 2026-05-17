import type {
  GlobiguardInstallHeartbeatRequest,
  GlobiguardInstallHeartbeatResponse,
  GlobiguardInstallRegistrationRequest,
  GlobiguardInstallRegistrationResponse,
  GlobiguardInstallsClient
} from "@globiguard/contracts";

import type { GlobiguardTransport } from "../client.js";
import { encodePathSegment } from "./path-segments.js";

export function createInstallsClient(
  transport: GlobiguardTransport
): GlobiguardInstallsClient {
  return {
    register(request: GlobiguardInstallRegistrationRequest) {
      return transport.request<GlobiguardInstallRegistrationResponse>(
        "/v1/installs",
        {
          method: "POST",
          body: request
        }
      );
    },

    heartbeat(
      installId: string,
      request: GlobiguardInstallHeartbeatRequest
    ) {
      const encodedInstallId = encodePathSegment(installId);

      return transport.request<GlobiguardInstallHeartbeatResponse>(
        `/v1/installs/${encodedInstallId}/heartbeats`,
        {
          method: "POST",
          body: request
        }
      );
    }
  };
}
