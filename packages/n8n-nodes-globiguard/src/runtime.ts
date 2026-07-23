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
import {
  createN8nObservabilityClient,
  type N8nObservabilityClient
} from "./observability.js";

export interface N8nExecutionBoundary {
  browserAccessible: false;
  directBrainAccess: boolean;
  serverSideOnly: true;
}

export interface N8nRuntimeConfig {
  bootstrapProfile: GlobiguardBootstrapProfile;
  client: GlobiguardServerClientConfig;
}

export type N8nAugmentedServerClient = GlobiguardServerClient & {
  observe: N8nObservabilityClient;
};

export interface N8nRuntime {
  bootstrapProfile: GlobiguardResolvedBootstrapProfile;
  client: N8nAugmentedServerClient;
  executionBoundary: N8nExecutionBoundary;
}

export function createN8nRuntime(config: N8nRuntimeConfig): N8nRuntime {
  const bootstrapProfile = resolveBootstrapProfile(config.bootstrapProfile);
  if (bootstrapProfile.environment !== config.client.environment) {
    throw new Error(
      "N8n runtime client environment must match the bootstrap profile environment."
    );
  }
  const baseClient = createServerClient(config.client);
  const client: N8nAugmentedServerClient = Object.assign(baseClient, {
    observe: createN8nObservabilityClient(baseClient.controlPlane)
  });

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
