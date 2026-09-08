import type { GlobiguardActionsClient } from "@globiguard/contracts";
import { GlobiguardAuthorityError, GlobiguardConfigError } from "./errors.js";
import { assertExecutableAuthorization } from "./governed-actions.js";
import {
  assertDetectionAllowsContinuation,
  projectDetectionActionEvidence,
  projectSafeDetectedFields,
  validateDetectionResponse,
  type GlobiguardDetectionClient
} from "./resources/detection.js";

export type AiInterceptMode = "scan_input" | "scan_output" | "scan_both";

const AI_INTERCEPT_MODES = new Set<AiInterceptMode>([
  "scan_input",
  "scan_output",
  "scan_both"
]);

export interface AiInterceptOptions {
  mode?: AiInterceptMode;
  actionType?: string;
  destination?: string;
  onBlock?: (decision: Record<string, unknown>) => void;
}

export interface AiInterceptWrapResult<T> {
  response: T;
  inputDecision: Record<string, unknown> | null;
  outputDecision: Record<string, unknown> | null;
  inputEntities: unknown[] | null;
  outputEntities: unknown[] | null;
}

export interface GlobiguardAiIntercept {
  wrap<T>(
    inputText: string,
    callFn: (options?: unknown) => Promise<T>,
    callOptions?: unknown
  ): Promise<AiInterceptWrapResult<T>>;
  openai<T extends object>(client: T): T;
  anthropic<T extends object>(client: T): T;
  google<T extends object>(model: T): T;
  bedrock<T extends { send(command: unknown): Promise<unknown> }>(
    client: T
  ): { send(command: unknown): Promise<unknown> } & Omit<T, "send">;
  cohere<T extends object>(client: T): T;
  mistral<T extends object>(client: T): T;
  ollama<T extends object>(client: T): T;
  vercel<T extends { doGenerate(options: unknown): Promise<unknown> }>(
    model: T
  ): T & { doGenerate(options: unknown): Promise<unknown> };
  langchain<T extends { invoke(input: unknown, options?: unknown): Promise<unknown> }>(
    llm: T
  ): T & { invoke(input: unknown, options?: unknown): Promise<unknown> };
  generic<T extends (...args: unknown[]) => Promise<unknown>>(
    callFn: T,
    opts?: { extractInput?: (...args: Parameters<T>) => string }
  ): (...args: Parameters<T>) => Promise<unknown>;
}

export interface AiInterceptDeps {
  actions: GlobiguardActionsClient;
  detection: GlobiguardDetectionClient;
}

export function createAiIntercept(
  deps: AiInterceptDeps,
  options: AiInterceptOptions = {}
): GlobiguardAiIntercept {
  const mode = options.mode ?? "scan_both";
  const actionType = options.actionType ?? "ai.request";
  const destination = options.destination ?? "ai_model";
  if (!AI_INTERCEPT_MODES.has(mode)) {
    throw new GlobiguardConfigError("mode must be scan_input, scan_output, or scan_both.");
  }
  if (!actionType.trim()) {
    throw new GlobiguardConfigError("actionType must be a non-empty string.");
  }
  if (!destination.trim()) {
    throw new GlobiguardConfigError("destination must be a non-empty string.");
  }
  if (!deps.detection || typeof deps.detection.evaluate !== "function") {
    throw new GlobiguardConfigError(
      "AI interception requires the authenticated Control Plane detection client."
    );
  }

  const self: GlobiguardAiIntercept = {
    async wrap<T>(
      inputText: string,
      callFn: (options?: unknown) => Promise<T>,
      callOptions?: unknown
    ): Promise<AiInterceptWrapResult<T>> {
      let inputDecision: Record<string, unknown> | null = null;
      let outputDecision: Record<string, unknown> | null = null;
      let inputEntities: unknown[] | null = null;
      let outputEntities: unknown[] | null = null;

      if (mode === "scan_input" || mode === "scan_both") {
        const detection = validateDetectionResponse(
          await deps.detection.evaluate({ text: inputText })
        );
        inputEntities = projectSafeDetectedFields(detection);
        assertDetectionAllowsContinuation(detection, "input", options.onBlock);
        const evidence = projectDetectionActionEvidence(detection);
        inputDecision = (await deps.actions.authorize({
          context: {
            actionType,
            destination: { type: "custom", name: destination },
            dataClasses: evidence.dataClasses,
            fieldsInvolved: evidence.fieldTypes,
            metadata: evidence.metadata
          }
        })) as unknown as Record<string, unknown>;
        assertAiDecisionExecutable(inputDecision, "input", options.onBlock);
      }

      const response = await callFn(callOptions);

      if (mode === "scan_output" || mode === "scan_both") {
        const outputText = extractResponseText(response);
        if (typeof outputText !== "string" || outputText.length === 0) {
          throw new GlobiguardAuthorityError({
            kind: "CONTROL_PLANE_UNAVAILABLE",
            message: "The AI response could not be inspected; it was not released.",
            safeDetails: { reason: "OUTPUT_NOT_INSPECTABLE" }
          });
        }
        const detection = validateDetectionResponse(
          await deps.detection.evaluate({ text: outputText })
        );
        outputEntities = projectSafeDetectedFields(detection);
        assertDetectionAllowsContinuation(detection, "output", options.onBlock);
        const evidence = projectDetectionActionEvidence(detection);
        outputDecision = (await deps.actions.authorize({
          context: {
            actionType: "ai.response",
            destination: { type: "custom", name: destination },
            dataClasses: evidence.dataClasses,
            fieldsInvolved: evidence.fieldTypes,
            metadata: evidence.metadata
          }
        })) as unknown as Record<string, unknown>;
        assertAiDecisionExecutable(outputDecision, "output", options.onBlock);
      }

      return { response, inputDecision, outputDecision, inputEntities, outputEntities };
    },

    openai<T extends object>(client: T): T {
      return new Proxy(client, {
        get(target, prop) {
          if (prop !== "chat") return (target as Record<string | symbol, unknown>)[prop];
          return {
            completions: {
              async create(params: Record<string, unknown>) {
                const inputText = ((params.messages as Array<Record<string, unknown>>) ?? [])
                  .map((m) => (typeof m.content === "string" ? m.content : ""))
                  .join("\n");
                const result = await self.wrap(
                  inputText,
                  () =>
                    (
                      (target as Record<string, unknown>).chat as {
                        completions: { create(p: unknown): Promise<unknown> };
                      }
                    ).completions.create(params),
                  params
                );
                return result.response;
              }
            }
          };
        }
      }) as T;
    },

    anthropic<T extends object>(client: T): T {
      return new Proxy(client, {
        get(target, prop) {
          if (prop !== "messages") return (target as Record<string | symbol, unknown>)[prop];
          return {
            async create(params: Record<string, unknown>) {
              const inputText = ((params.messages as Array<Record<string, unknown>>) ?? [])
                .map((m) => (typeof m.content === "string" ? m.content : ""))
                .join("\n");
              const result = await self.wrap(
                inputText,
                () =>
                  (
                    (target as Record<string, unknown>).messages as {
                      create(p: unknown): Promise<unknown>;
                    }
                  ).create(params),
                params
              );
              return result.response;
            }
          };
        }
      }) as T;
    },

    google<T extends object>(model: T): T {
      return new Proxy(model, {
        get(target, prop) {
          if (prop !== "generateContent")
            return (target as Record<string | symbol, unknown>)[prop];
          return async function generateContent(request: unknown) {
            let inputText = "";
            if (typeof request === "string") {
              inputText = request;
            } else if (request && typeof request === "object") {
              const r = request as Record<string, unknown>;
              inputText = ((r.contents as Array<Record<string, unknown>>) ?? [])
                .flatMap((c) => (c.parts as Array<Record<string, unknown>>) ?? [])
                .map((p) => (p.text as string) ?? "")
                .join("\n");
            }
            const result = await self.wrap(
              inputText,
              (req) =>
                (
                  target as {
                    generateContent(r: unknown): Promise<unknown>;
                  }
                ).generateContent(req),
              request
            );
            return result.response;
          };
        }
      }) as T;
    },

    bedrock<T extends { send(command: unknown): Promise<unknown> }>(client: T) {
      const original = client.send.bind(client);
      return {
        ...client,
        send(command: unknown) {
          const c = command as Record<string, unknown> | null;
          const inputText =
            (
              (c?.input as Record<string, unknown> | undefined)
                ?.messages as Array<Record<string, unknown>> | undefined
            )
              ?.at(-1)
              ?.content as string | undefined ?? "";
          return self.wrap(inputText, original, command).then((r) => r.response);
        }
      };
    },

    cohere<T extends object>(client: T): T {
      return new Proxy(client, {
        get(target, prop) {
          if (prop !== "chat") return (target as Record<string | symbol, unknown>)[prop];
          return async function chat(params: Record<string, unknown>) {
            const msgs = params.messages as Array<Record<string, unknown>> | undefined;
            const inputText =
              params.message != null
                ? (params.message as string)
                : (msgs?.at(-1)?.message as string | undefined) ?? "";
            const result = await self.wrap(
              inputText,
              (p) =>
                (target as { chat(p: unknown): Promise<unknown> }).chat(
                  p as Record<string, unknown>
                ),
              params
            );
            return result.response;
          };
        }
      }) as T;
    },

    mistral<T extends object>(client: T): T {
      return new Proxy(client, {
        get(target, prop) {
          if (prop !== "chat") return (target as Record<string | symbol, unknown>)[prop];
          return {
            async complete(params: Record<string, unknown>) {
              const msgs = params.messages as Array<Record<string, unknown>> | undefined;
              const last = msgs?.at(-1);
              const inputText =
                (typeof last?.content === "string" ? last.content : "") ?? "";
              const result = await self.wrap(
                inputText,
                (p) =>
                  (
                    target as { chat: { complete(p: unknown): Promise<unknown> } }
                  ).chat.complete(p as Record<string, unknown>),
                params
              );
              return result.response;
            }
          };
        }
      }) as T;
    },

    ollama<T extends object>(client: T): T {
      return new Proxy(client, {
        get(target, prop) {
          if (prop !== "chat") return (target as Record<string | symbol, unknown>)[prop];
          return async function chat(params: Record<string, unknown>) {
            const msgs = params.messages as Array<Record<string, unknown>> | undefined;
            const inputText = (msgs?.at(-1)?.content as string | undefined) ?? "";
            const result = await self.wrap(
              inputText,
              (p) => (target as { chat(p: unknown): Promise<unknown> }).chat(p),
              params
            );
            return result.response;
          };
        }
      }) as T;
    },

    vercel<T extends { doGenerate(options: unknown): Promise<unknown> }>(model: T) {
      const originalGenerate = model.doGenerate.bind(model);
      return {
        ...model,
        async doGenerate(options: unknown) {
          const opts = options as Record<string, unknown> | undefined;
          const lastMsg = (opts?.prompt as Array<Record<string, unknown>> | undefined)?.at(-1);
          let inputText = "";
          if (typeof lastMsg?.content === "string") {
            inputText = lastMsg.content;
          } else if (Array.isArray(lastMsg?.content)) {
            inputText = (lastMsg.content as Array<Record<string, unknown>>)
              .filter((p) => p.type === "text")
              .map((p) => p.text as string)
              .join("\n");
          }
          const result = await self.wrap(inputText, originalGenerate, options);
          return result.response;
        }
      };
    },

    langchain<T extends { invoke(input: unknown, options?: unknown): Promise<unknown> }>(
      llm: T
    ) {
      const originalInvoke = llm.invoke.bind(llm);
      return {
        ...llm,
        async invoke(input: unknown, invokeOptions?: unknown) {
          let inputText = "";
          if (typeof input === "string") {
            inputText = input;
          } else if (Array.isArray(input)) {
            inputText = (input as Array<Record<string, unknown>>)
              .map((m) => (typeof m.content === "string" ? m.content : ""))
              .join("\n");
          }
          const result = await self.wrap(
            inputText,
            () => originalInvoke(input, invokeOptions),
            {}
          );
          return result.response;
        }
      };
    },

    generic<T extends (...args: unknown[]) => Promise<unknown>>(
      callFn: T,
      opts?: { extractInput?: (...args: Parameters<T>) => string }
    ) {
      return function governed(...args: Parameters<T>): Promise<unknown> {
        const inputText = opts?.extractInput ? opts.extractInput(...args) : "";
        return self.wrap(inputText, () => callFn(...args), {}).then((r) => r.response);
      };
    }
  };

  return self;
}

function assertAiDecisionExecutable(
  decision: Record<string, unknown>,
  phase: "input" | "output",
  onBlock?: (decision: Record<string, unknown>) => void
): void {
  try {
    assertExecutableAuthorization(
      decision as unknown as Parameters<typeof assertExecutableAuthorization>[0]
    );
  } catch (error) {
    if (decision.decision === "BLOCK") {
      onBlock?.(decision);
    }
    if (error instanceof GlobiguardAuthorityError) {
      throw new GlobiguardAuthorityError({
        ...error.toJSON(),
        message: `${error.message} The AI ${phase} was not released.`
      });
    }
    throw error;
  }
}

function extractResponseText(response: unknown): string | null {
  if (typeof response === "string") return response;
  if (response && typeof response === "object") {
    const r = response as Record<string, unknown>;
    const choices = r.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const msg = (choices[0] as Record<string, unknown>).message as
        | Record<string, unknown>
        | undefined;
      return (msg?.content as string | undefined) ?? null;
    }
    const content = r.content;
    if (Array.isArray(content) && content.length > 0) {
      return ((content[0] as Record<string, unknown>).text as string | undefined) ?? null;
    }
    if (typeof content === "string") return content;
    const msg = r.message as Record<string, unknown> | undefined;
    if (typeof msg?.content === "string") return msg.content;
  }
  return null;
}
