import type { GlobiguardTransport } from "@globiguard/sdk";

type QueryValue = string | number | boolean | null | undefined;

export interface N8nObservabilityClient {
  getDashboard(query?: Record<string, QueryValue>): Promise<unknown>;
  getTraces(query?: Record<string, QueryValue>): Promise<unknown>;
  getTrace(traceId: string): Promise<unknown>;
  getEvidenceDetail(evidencePackageId: string): Promise<unknown>;
  getMetrics(query?: Record<string, QueryValue>): Promise<unknown>;
}

export function createN8nObservabilityClient(
  transport: GlobiguardTransport
): N8nObservabilityClient {
  return {
    getDashboard(query = {}) {
      return transport.request("/v1/observability/dashboard", { method: "GET", query });
    },
    getTraces(query = {}) {
      return transport.request("/v1/observability/traces", { method: "GET", query });
    },
    getTrace(traceId: string) {
      return transport.request(
        `/v1/observability/traces/${encodeURIComponent(traceId)}`,
        { method: "GET" }
      );
    },
    getEvidenceDetail(evidencePackageId: string) {
      return transport.request(
        `/v1/observability/evidence/${encodeURIComponent(evidencePackageId)}`,
        { method: "GET" }
      );
    },
    getMetrics(query = {}) {
      return transport.request("/v1/observability/metrics", { method: "GET", query });
    }
  };
}
