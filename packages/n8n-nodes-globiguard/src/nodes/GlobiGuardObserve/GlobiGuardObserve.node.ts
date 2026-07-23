import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from "n8n-workflow";
import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";
import { buildN8nRuntimeConfig, normalizeN8nCredentialValues } from "../../config.js";
import { createN8nRuntime } from "../../runtime.js";
import { createN8nObservabilityClient } from "../../observability.js";

export class GlobiGuardObserve implements INodeType {
  description: INodeTypeDescription = {
    displayName: "GlobiGuard Observe",
    name: "globiGuardObserve",
    icon: "file:globiguard.svg",
    group: ["transform"],
    version: 1,
    description: "Query GlobiGuard for scan evidence, traces, and metrics using your API token.",
    defaults: { name: "GlobiGuard Observe", color: "#10B981" },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    outputNames: ["result"],
    credentials: [{ name: "globiGuardApi", required: true }],
    properties: [
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        default: "getTraces",
        noDataExpression: true,
        options: [
          {
            name: "Get Dashboard",
            value: "getDashboard",
            description: "Retrieve summary metrics and activity for the observability dashboard."
          },
          {
            name: "Get Traces",
            value: "getTraces",
            description: "List governance traces for recent AI and action calls."
          },
          {
            name: "Get Trace",
            value: "getTrace",
            description: "Retrieve a single trace by ID."
          },
          {
            name: "Get Evidence Detail",
            value: "getEvidenceDetail",
            description: "Retrieve full evidence package detail by ID."
          },
          {
            name: "Get Metrics",
            value: "getMetrics",
            description: "Retrieve aggregated governance metrics."
          }
        ]
      },
      {
        displayName: "Trace ID",
        name: "traceId",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { operation: ["getTrace"] } },
        description: "The trace ID to retrieve."
      },
      {
        displayName: "Evidence Package ID",
        name: "evidencePackageId",
        type: "string",
        default: "",
        required: true,
        displayOptions: { show: { operation: ["getEvidenceDetail"] } },
        description: "The evidence package ID to retrieve."
      },
      {
        displayName: "From",
        name: "from",
        type: "string",
        default: "",
        displayOptions: {
          show: { operation: ["getTraces", "getDashboard", "getMetrics"] }
        },
        description: "ISO 8601 start timestamp for the query window (e.g. 2026-07-01T00:00:00Z)."
      },
      {
        displayName: "To",
        name: "to",
        type: "string",
        default: "",
        displayOptions: {
          show: { operation: ["getTraces", "getDashboard", "getMetrics"] }
        },
        description: "ISO 8601 end timestamp for the query window."
      },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        default: 50,
        displayOptions: { show: { operation: ["getTraces"] } },
        typeOptions: { minValue: 1, maxValue: 500 },
        description: "Maximum number of traces to return."
      },
      {
        displayName: "Correlation ID",
        name: "correlationId",
        type: "string",
        default: "",
        displayOptions: { show: { operation: ["getTraces"] } },
        description: "Filter traces by correlation ID."
      }
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const inputItems = this.getInputData();
    const itemCount = inputItems.length || 1;
    const results: INodeExecutionData[] = [];

    try {
      const credentialData = await this.getCredentials("globiGuardApi");
      const runtime = createN8nRuntime(
        buildN8nRuntimeConfig(normalizeN8nCredentialValues(credentialData as unknown as Record<string, unknown>))
      );
      const observe = createN8nObservabilityClient(runtime.client.controlPlane);

      for (let i = 0; i < itemCount; i++) {
        try {
          const inputItem = inputItems[i] ?? { json: {} };
          const operation = this.getNodeParameter("operation", i) as string;

          let data: unknown;

          if (operation === "getTrace") {
            const traceId = this.getNodeParameter("traceId", i, "") as string;
            if (!traceId.trim()) {
              throw new NodeOperationError(this.getNode(), "Trace ID is required.", { itemIndex: i });
            }
            data = await observe.getTrace(traceId.trim());

          } else if (operation === "getEvidenceDetail") {
            const evidencePackageId = this.getNodeParameter("evidencePackageId", i, "") as string;
            if (!evidencePackageId.trim()) {
              throw new NodeOperationError(this.getNode(), "Evidence Package ID is required.", { itemIndex: i });
            }
            data = await observe.getEvidenceDetail(evidencePackageId.trim());

          } else {
            const from = (this.getNodeParameter("from", i, "") as string).trim() || undefined;
            const to = (this.getNodeParameter("to", i, "") as string).trim() || undefined;
            const query: Record<string, string | number> = {};
            if (from) query.from = from;
            if (to) query.to = to;

            if (operation === "getTraces") {
              const limit = this.getNodeParameter("limit", i, 50) as number;
              const correlationId = (this.getNodeParameter("correlationId", i, "") as string).trim();
              query.limit = limit;
              if (correlationId) query.correlationId = correlationId;
              data = await observe.getTraces(query);
            } else if (operation === "getDashboard") {
              data = await observe.getDashboard(query);
            } else if (operation === "getMetrics") {
              data = await observe.getMetrics(query);
            } else {
              throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
            }
          }

          results.push({
            json: { ...inputItem.json, globiguard: { operation, data } },
            pairedItem: i
          });
        } catch (itemError) {
          if (this.continueOnFail()) {
            results.push({
              json: { error: itemError instanceof Error ? itemError.message : "Unknown error", operation: "observe" },
              pairedItem: i
            });
          } else {
            throw itemError instanceof NodeOperationError
              ? itemError
              : new NodeOperationError(this.getNode(), itemError as Error, { itemIndex: i });
          }
        }
      }
    } catch (error) {
      if (this.continueOnFail()) {
        return [[{ json: { error: error instanceof Error ? error.message : "Unknown error" } }]];
      }
      throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: 0 });
    }

    return [results];
  }
}
