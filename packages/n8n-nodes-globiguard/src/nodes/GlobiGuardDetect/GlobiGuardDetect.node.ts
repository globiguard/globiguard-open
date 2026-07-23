import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from "n8n-workflow";
import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";
import { buildN8nRuntimeConfig, normalizeN8nCredentialValues } from "../../config.js";
import { createN8nRuntime } from "../../runtime.js";

export class GlobiGuardDetect implements INodeType {
  description: INodeTypeDescription = {
    displayName: "GlobiGuard Detect",
    name: "globiGuardDetect",
    icon: "file:globiguard.svg",
    group: ["transform"],
    version: 1,
    description: "Scan text for sensitive entities and PII before it reaches AI models, databases, or external services.",
    defaults: { name: "GlobiGuard Detect", color: "#10B981" },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main, NodeConnectionTypes.Main],
    outputNames: ["detected", "clean"],
    credentials: [{ name: "globiGuardApi", required: true }],
    properties: [
      {
        displayName: "Text",
        name: "text",
        type: "string",
        default: "",
        required: true,
        typeOptions: { rows: 4 },
        description: "Text to scan for sensitive entities."
      },
      {
        displayName: "Labels",
        name: "labels",
        type: "string",
        default: "",
        description: "Comma-separated entity labels to detect. Leave empty for all labels."
      },
      {
        displayName: "Redaction Strategy",
        name: "redactionStrategy",
        type: "options",
        default: "none",
        options: [
          { name: "None", value: "none" },
          { name: "Mask", value: "mask" },
          { name: "Replace", value: "replace" },
          { name: "Drop", value: "drop" }
        ]
      },
      {
        displayName: "Threshold",
        name: "threshold",
        type: "number",
        default: 0.5,
        typeOptions: { minValue: 0, maxValue: 1, numberStepSize: 0.05 }
      }
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const inputItems = this.getInputData();
    const itemCount = inputItems.length || 1;
    const detected: INodeExecutionData[] = [];
    const clean: INodeExecutionData[] = [];

    try {
      const credentialData = await this.getCredentials("globiGuardApi");
      const runtime = createN8nRuntime(
        buildN8nRuntimeConfig(normalizeN8nCredentialValues(credentialData as unknown as Record<string, unknown>))
      );

      if (!runtime.client.brain) {
        throw new NodeOperationError(this.getNode(), "Brain URL is required for GlobiGuard Detect. Set it in the GlobiGuard credentials.", { itemIndex: 0 });
      }

      const brain = runtime.client.brain;

      for (let i = 0; i < itemCount; i++) {
        const inputItem = inputItems[i] ?? { json: {} };
        const text = this.getNodeParameter("text", i, "") as string;
        const labelsRaw = this.getNodeParameter("labels", i, "") as string;
        const redactionStrategy = this.getNodeParameter("redactionStrategy", i, "none") as string;
        const threshold = this.getNodeParameter("threshold", i, 0.5) as number;

        if (!text.trim()) {
          clean.push({ json: { ...inputItem.json, globiguard: { scanned: false, reason: "empty_text" } }, pairedItem: i });
          continue;
        }

        const labels = labelsRaw ? labelsRaw.split(",").map((l) => l.trim()).filter(Boolean) : undefined;

        let result: Record<string, unknown>;
        if (redactionStrategy !== "none") {
          result = await (brain as any).request("/v1/brain/redact", {
            method: "POST",
            body: { text, ...(labels ? { labels } : {}), strategy: redactionStrategy, threshold }
          });
        } else {
          result = await (brain as any).request("/v1/brain/scan", {
            method: "POST",
            body: { text, ...(labels ? { labels } : {}), threshold }
          });
        }

        const entities = (result.entities as unknown[]) ?? [];
        const hasSensitive = entities.length > 0;
        const outputItem: INodeExecutionData = {
          json: {
            ...inputItem.json,
            globiguard: {
              scanned: true,
              has_sensitive: hasSensitive,
              data_class: result.data_class ?? null,
              entities,
              ...(redactionStrategy !== "none" ? { redacted_text: result.redacted_text } : {})
            }
          },
          pairedItem: i
        };

        if (hasSensitive) {
          detected.push(outputItem);
        } else {
          clean.push(outputItem);
        }
      }

      return [detected, clean];
    } catch (error) {
      if (this.continueOnFail()) {
        return [[{ json: { error: error instanceof Error ? error.message : "Unknown error" } }], []];
      }
      throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: 0 });
    }
  }
}
