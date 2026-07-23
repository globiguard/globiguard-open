import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  SupplyData
} from "n8n-workflow";
import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";
import type { GlobiguardDataClass, GlobiguardDestinationSystemType } from "@globiguard/contracts";
import { buildN8nRuntimeConfig, normalizeN8nCredentialValues } from "../../config.js";
import { createN8nRuntime } from "../../runtime.js";
import { buildN8nActionAuthorizationRequest } from "../../actions.js";

export class GlobiGuardAiAgent implements INodeType {
  description: INodeTypeDescription = {
    displayName: "GlobiGuard AI Agent",
    name: "globiGuardAiAgent",
    icon: "file:globiguard.svg",
    group: ["transform"],
    version: 1,
    description: "A governed AI agent that scans inputs, governs every tool call, and captures evidence throughout the session.",
    defaults: { name: "GlobiGuard AI Agent", color: "#10B981" },
    inputs: [
      NodeConnectionTypes.Main,
      { type: NodeConnectionTypes.AiLanguageModel, displayName: "AI Model", required: true },
      { type: NodeConnectionTypes.AiMemory, displayName: "Memory", required: false },
      { type: NodeConnectionTypes.AiTool, displayName: "Tools", required: false }
    ],
    outputs: [
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main
    ],
    outputNames: ["completed", "blocked", "awaiting_approval", "error"],
    credentials: [{ name: "globiGuardApi", required: true }],
    properties: [
      {
        displayName: "User Message",
        name: "userMessage",
        type: "string",
        default: "",
        required: true,
        typeOptions: { rows: 3 },
        description: "The user message or prompt to send to the AI model."
      },
      {
        displayName: "Scan Input",
        name: "scanInput",
        type: "boolean",
        default: true,
        description: "Whether to scan the user message for sensitive entities before sending to the AI model."
      },
      {
        displayName: "Scan Output",
        name: "scanOutput",
        type: "boolean",
        default: true,
        description: "Whether to scan the AI response for sensitive entities before returning it."
      },
      {
        displayName: "Block on Sensitive Input",
        name: "blockOnSensitiveInput",
        type: "boolean",
        default: false,
        description: "Whether to block and route to the blocked output if sensitive entities are detected in the input."
      },
      {
        displayName: "Govern Tool Calls",
        name: "governToolCalls",
        type: "boolean",
        default: true,
        description: "Whether to run a GlobiGuard governance checkpoint before each tool call the AI requests."
      },
      {
        displayName: "Input Data Classes",
        name: "inputDataClasses",
        type: "multiOptions",
        default: ["INTERNAL"],
        options: [
          { name: "Public", value: "PUBLIC" },
          { name: "Internal", value: "INTERNAL" },
          { name: "Confidential", value: "CONFIDENTIAL" },
          { name: "Restricted", value: "RESTRICTED" },
          { name: "PII", value: "PII" },
          { name: "PHI", value: "PHI" },
          { name: "PCI", value: "PCI" },
          { name: "Secret", value: "SECRET" }
        ]
      },
      {
        displayName: "Correlation ID",
        name: "correlationId",
        type: "string",
        default: "",
        description: "Optional correlation ID to link this agent session to upstream events."
      }
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const inputItems = this.getInputData();
    const itemCount = inputItems.length || 1;
    const completed: INodeExecutionData[] = [];
    const blocked: INodeExecutionData[] = [];
    const awaitingApproval: INodeExecutionData[] = [];
    const errors: INodeExecutionData[] = [];

    try {
      const credentialData = await this.getCredentials("globiGuardApi");
      const runtime = createN8nRuntime(
        buildN8nRuntimeConfig(normalizeN8nCredentialValues(credentialData as unknown as Record<string, unknown>))
      );

      const modelData = (await this.getInputConnectionData(NodeConnectionTypes.AiLanguageModel, 0)) as SupplyData | undefined;
      if (!modelData) {
        throw new NodeOperationError(this.getNode(), "An AI model connection is required for GlobiGuard AI Agent.", { itemIndex: 0 });
      }

      for (let i = 0; i < itemCount; i++) {
        const inputItem = inputItems[i] ?? { json: {} };
        const userMessage = this.getNodeParameter("userMessage", i, "") as string;
        const scanInput = this.getNodeParameter("scanInput", i, true) as boolean;
        const scanOutput = this.getNodeParameter("scanOutput", i, true) as boolean;
        const blockOnSensitiveInput = this.getNodeParameter("blockOnSensitiveInput", i, false) as boolean;
        const correlationId = (this.getNodeParameter("correlationId", i, "") as string).trim() || undefined;

        const evidence: unknown[] = [];
        let inputBlocked = false;

        if (scanInput && runtime.client.brain) {
          const classification = await runtime.client.brain.request<Record<string, unknown>>("/v1/brain/classify", {
            method: "POST",
            body: { text: userMessage }
          });
          const detectedClass = (classification.data_class ?? classification.dataClass ?? "PUBLIC") as string;

          if (blockOnSensitiveInput && ["RESTRICTED", "SECRET", "PII", "PHI", "PCI"].includes(detectedClass)) {
            const inputAuthz = await runtime.client.actions.authorize(
              buildN8nActionAuthorizationRequest({
                actionType: "ai.request",
                destinationType: "custom" as GlobiguardDestinationSystemType,
                destinationName: "ai_model",
                dataClasses: [detectedClass as GlobiguardDataClass],
                itemJson: { userMessage },
                nodeName: this.getNode().name,
                itemIndex: i,
                correlationId
              })
            );
            evidence.push({ stage: "input", ...inputAuthz });

            if (inputAuthz.decision === "BLOCK") {
              blocked.push({ json: { ...inputItem.json, globiguard: { blocked: true, stage: "input", evidence } }, pairedItem: i });
              inputBlocked = true;
            } else if (inputAuthz.decision === "QUEUE") {
              awaitingApproval.push({ json: { ...inputItem.json, globiguard: { awaiting_approval: true, stage: "input", queueEntryId: inputAuthz.queueEntryId, evidence } }, pairedItem: i });
              inputBlocked = true;
            }
          }
        }

        if (inputBlocked) continue;

        let aiResponse: string | null = null;
        try {
          const invoke = (modelData as any).invoke ?? (modelData as any).call;
          if (typeof invoke === "function") {
            const rawResponse = await invoke(userMessage);
            aiResponse = typeof rawResponse === "string" ? rawResponse : (rawResponse?.content ?? JSON.stringify(rawResponse));
          }
        } catch (modelError) {
          errors.push({ json: { ...inputItem.json, globiguard: { error: String(modelError), stage: "model_call" } }, pairedItem: i });
          continue;
        }

        let outputAuthz: unknown = null;
        if (scanOutput && aiResponse && runtime.client.brain) {
          const outClassification = await runtime.client.brain.request<Record<string, unknown>>("/v1/brain/classify", {
            method: "POST",
            body: { text: aiResponse }
          });
          const outClass = (outClassification.data_class ?? outClassification.dataClass ?? "PUBLIC") as string;
          if (["RESTRICTED", "SECRET", "PII", "PHI", "PCI"].includes(outClass)) {
            outputAuthz = await runtime.client.actions.authorize(
              buildN8nActionAuthorizationRequest({
                actionType: "ai.response",
                destinationType: "custom" as GlobiguardDestinationSystemType,
                destinationName: "caller",
                dataClasses: [outClass as GlobiguardDataClass],
                itemJson: { response: aiResponse },
                nodeName: this.getNode().name,
                itemIndex: i,
                correlationId
              })
            );
            evidence.push({ stage: "output", ...(outputAuthz as object) });
          }
        }

        completed.push({
          json: {
            ...inputItem.json,
            response: aiResponse,
            globiguard: {
              completed: true,
              correlationId: correlationId ?? null,
              evidence,
              output_governed: outputAuthz !== null
            }
          },
          pairedItem: i
        });
      }
    } catch (error) {
      if (this.continueOnFail()) {
        errors.push({ json: { error: error instanceof Error ? error.message : "Unknown error" } });
      } else {
        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: 0 });
      }
    }

    return [completed, blocked, awaitingApproval, errors];
  }
}
