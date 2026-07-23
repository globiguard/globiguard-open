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

const SENSITIVE_CLASSES = new Set(["RESTRICTED", "SECRET", "PII", "PHI", "PCI"]);

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
        description: "Scan the user message for sensitive entities before sending to the AI model."
      },
      {
        displayName: "Scan Output",
        name: "scanOutput",
        type: "boolean",
        default: true,
        description: "Scan the AI response for sensitive entities before returning it."
      },
      {
        displayName: "Block on Sensitive Input",
        name: "blockOnSensitiveInput",
        type: "boolean",
        default: false,
        description: "Route to the blocked output if sensitive entities are detected in the input."
      },
      {
        displayName: "Block on Sensitive Output",
        name: "blockOnSensitiveOutput",
        type: "boolean",
        default: false,
        description: "Route to the blocked output if sensitive entities are detected in the AI response."
      },
      {
        displayName: "Govern Tool Calls",
        name: "governToolCalls",
        type: "boolean",
        default: true,
        description: "Run a GlobiGuard governance checkpoint before each tool call the AI requests."
      },
      {
        displayName: "Input Data Classes",
        name: "inputDataClasses",
        type: "multiOptions",
        default: ["INTERNAL"],
        description: "Data classes to declare on the input governance checkpoint when Brain is not configured.",
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
        try {
          const inputItem = inputItems[i] ?? { json: {} };
          const userMessage = this.getNodeParameter("userMessage", i, "") as string;
          const scanInput = this.getNodeParameter("scanInput", i, true) as boolean;
          const scanOutput = this.getNodeParameter("scanOutput", i, true) as boolean;
          const blockOnSensitiveInput = this.getNodeParameter("blockOnSensitiveInput", i, false) as boolean;
          const blockOnSensitiveOutput = this.getNodeParameter("blockOnSensitiveOutput", i, false) as boolean;
          const governToolCalls = this.getNodeParameter("governToolCalls", i, true) as boolean;
          const inputDataClasses = this.getNodeParameter("inputDataClasses", i, ["INTERNAL"]) as GlobiguardDataClass[];
          const correlationId = (this.getNodeParameter("correlationId", i, "") as string).trim() || undefined;

          const evidence: unknown[] = [];

          // --- Input scan ---
          if (scanInput) {
            let detectedInputClasses: GlobiguardDataClass[] = inputDataClasses;

            if (runtime.client.brain) {
              const classification = await runtime.client.brain.request<Record<string, unknown>>("/v1/brain/classify", {
                method: "POST",
                body: { text: userMessage }
              });
              const detectedClass = (classification.dataClass ?? classification.data_class) as string | undefined;
              if (detectedClass) {
                detectedInputClasses = [detectedClass as GlobiguardDataClass];
              }
            }

            if (blockOnSensitiveInput && detectedInputClasses.some((c) => SENSITIVE_CLASSES.has(c))) {
              const inputAuthz = await runtime.client.actions.authorize(
                buildN8nActionAuthorizationRequest({
                  actionType: "ai.request",
                  destinationType: "custom" as GlobiguardDestinationSystemType,
                  destinationName: "ai_model",
                  dataClasses: detectedInputClasses,
                  itemJson: { userMessage },
                  nodeName: this.getNode().name,
                  itemIndex: i,
                  correlationId
                })
              );
              evidence.push({ stage: "input", ...inputAuthz });

              if (inputAuthz.decision === "BLOCK") {
                blocked.push({ json: { ...inputItem.json, globiguard: { blocked: true, stage: "input", evidence } }, pairedItem: i });
                continue;
              }
              if (inputAuthz.decision === "QUEUE") {
                awaitingApproval.push({ json: { ...inputItem.json, globiguard: { awaiting_approval: true, stage: "input", queueEntryId: inputAuthz.queueEntryId, evidence } }, pairedItem: i });
                continue;
              }
            }
          }

          // --- Model call ---
          let aiResponse: string | null = null;
          const modelDataRecord = modelData as unknown as Record<string, unknown>;
          const invoke = modelDataRecord.invoke ?? modelDataRecord.call;
          if (typeof invoke === "function") {
            const rawResponse = await (invoke as (msg: string) => Promise<unknown>)(userMessage);
            aiResponse = typeof rawResponse === "string"
              ? rawResponse
              : ((rawResponse as Record<string, unknown>)?.content as string | undefined) ?? JSON.stringify(rawResponse);
          }

          // --- Tool call governance ---
          if (governToolCalls) {
            const toolsData = await this.getInputConnectionData(NodeConnectionTypes.AiTool, 0) as unknown[] | undefined;
            if (toolsData && toolsData.length > 0) {
              const toolAuthz = await runtime.client.actions.authorize(
                buildN8nActionAuthorizationRequest({
                  actionType: "ai.tool_call",
                  destinationType: "custom" as GlobiguardDestinationSystemType,
                  destinationName: "ai_tools",
                  dataClasses: inputDataClasses,
                  itemJson: { userMessage, toolCount: toolsData.length },
                  nodeName: this.getNode().name,
                  itemIndex: i,
                  correlationId
                })
              );
              evidence.push({ stage: "tool_call", ...toolAuthz });

              if (toolAuthz.decision === "BLOCK") {
                blocked.push({ json: { ...inputItem.json, globiguard: { blocked: true, stage: "tool_call", evidence } }, pairedItem: i });
                continue;
              }
              if (toolAuthz.decision === "QUEUE") {
                awaitingApproval.push({ json: { ...inputItem.json, globiguard: { awaiting_approval: true, stage: "tool_call", queueEntryId: toolAuthz.queueEntryId, evidence } }, pairedItem: i });
                continue;
              }
            }
          }

          // --- Output scan ---
          if (scanOutput && aiResponse) {
            let detectedOutputClasses: GlobiguardDataClass[] = [];

            if (runtime.client.brain) {
              const outClassification = await runtime.client.brain.request<Record<string, unknown>>("/v1/brain/classify", {
                method: "POST",
                body: { text: aiResponse }
              });
              const outClass = (outClassification.dataClass ?? outClassification.data_class) as string | undefined;
              if (outClass && SENSITIVE_CLASSES.has(outClass)) {
                detectedOutputClasses = [outClass as GlobiguardDataClass];
              }
            }

            if (detectedOutputClasses.length > 0) {
              const outputAuthz = await runtime.client.actions.authorize(
                buildN8nActionAuthorizationRequest({
                  actionType: "ai.response",
                  destinationType: "custom" as GlobiguardDestinationSystemType,
                  destinationName: "caller",
                  dataClasses: detectedOutputClasses,
                  itemJson: { response: aiResponse },
                  nodeName: this.getNode().name,
                  itemIndex: i,
                  correlationId
                })
              );
              evidence.push({ stage: "output", ...outputAuthz });

              if (outputAuthz.decision === "BLOCK") {
                if (blockOnSensitiveOutput) {
                  blocked.push({ json: { ...inputItem.json, globiguard: { blocked: true, stage: "output", evidence } }, pairedItem: i });
                  continue;
                }
              } else if (outputAuthz.decision === "QUEUE") {
                awaitingApproval.push({ json: { ...inputItem.json, globiguard: { awaiting_approval: true, stage: "output", queueEntryId: outputAuthz.queueEntryId, evidence } }, pairedItem: i });
                continue;
              }
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
                output_governed: evidence.some((e) => (e as Record<string, unknown>).stage === "output")
              }
            },
            pairedItem: i
          });
        } catch (itemError) {
          if (this.continueOnFail()) {
            errors.push({ json: { error: itemError instanceof Error ? itemError.message : "Unknown error", stage: "item" }, pairedItem: i });
          } else {
            throw new NodeOperationError(this.getNode(), itemError as Error, { itemIndex: i });
          }
        }
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
