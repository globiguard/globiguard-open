import {
  createServerClient,
  type GlobiguardServerClient,
  type GlobiguardServerClientConfig
} from "@globiguard/sdk";

export * from "./config.js";
export * from "./credential-policy.js";
export * from "./installs.js";
export * from "./observability.js";
export * from "./runtime.js";
export * from "./actions.js";
export { GlobiGuard } from "./nodes/GlobiGuard/GlobiGuard.node.js";
export { GlobiGuardDetect } from "./nodes/GlobiGuardDetect/GlobiGuardDetect.node.js";
export { GlobiGuardAiAgent } from "./nodes/GlobiGuardAiAgent/GlobiGuardAiAgent.node.js";

export function createN8nGlobiGuardClient(
  config: GlobiguardServerClientConfig
): GlobiguardServerClient {
  return createServerClient(config);
}
