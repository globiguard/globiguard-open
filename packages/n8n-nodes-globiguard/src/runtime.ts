import type {
  GlobiguardBootstrapProfile,
  GlobiguardResolvedBootstrapProfile
} from "@globiguard/contracts";
import {
  createServerClient,
  resolveBootstrapProfile,
  type GlobiguardServerClient,
  type GlobiguardServerClientConfig
} from "@globiguard/sdk";

export interface N8nExecutionBoundary {
  browserAccessible: false;
  directBrainAccess: boolean;
  serverSideOnly: true;
}

export interface N8nRuntimeConfig {
  bootstrapProfile: GlobiguardBootstrapProfile;
  client: GlobiguardServerClientConfig;
}

export interface N8nRuntime {
  bootstrapProfile: GlobiguardResolvedBootstrapProfile;
  client: GlobiguardServerClient;
  executionBoundary: N8nExecutionBoundary;
}

export function createN8nRuntime(config: N8nRuntimeConfig): N8nRuntime {
  const bootstrapProfile = resolveBootstrapProfile(config.bootstrapProfile);
  if (bootstrapProfile.environment !== config.client.environment) {
    throw new Error(
      "N8n runtime client environment must match the bootstrap profile environment."
    );
  }
  const client = createServerClient(config.client);

  return {
    bootstrapProfile,
    client,
    executionBoundary: describeN8nExecutionBoundary(client)
  };
}

export function describeN8nExecutionBoundary(
  client: GlobiguardServerClient
): N8nExecutionBoundary {
  return {
    browserAccessible: false,
    directBrainAccess: Boolean(client.brain),
    serverSideOnly: true
  };
}
