import {
  createServerClient,
  type GlobiguardServerClient,
  type GlobiguardServerClientConfig
} from "@globiguard/sdk";

export * from "./config.js";
export * from "./credential-policy.js";
export * from "./installs.js";
export * from "./runtime.js";
export * from "./actions.js";

export function createN8nGlobiGuardClient(
  config: GlobiguardServerClientConfig
): GlobiguardServerClient {
  return createServerClient(config);
}
