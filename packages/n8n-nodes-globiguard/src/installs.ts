import type {
  GlobiguardBootstrapProfile,
  GlobiguardBuildInstallHeartbeatInput,
  GlobiguardBuildInstallRegistrationInput,
  GlobiguardInstallHeartbeatRequest,
  GlobiguardInstallRegistrationRequest
} from "@globiguard/contracts";
import {
  buildInstallHeartbeatRequest,
  buildInstallRegistrationRequest
} from "@globiguard/sdk";

import { N8N_PACKAGE_NAME } from "./config.js";

export interface BuildN8nInstallRegistrationInput {
  packageVersion: string;
  metadata?: GlobiguardBuildInstallRegistrationInput["metadata"];
}

export interface BuildN8nInstallHeartbeatInput {
  packageVersion: string;
  metadata?: GlobiguardBuildInstallHeartbeatInput["metadata"];
}

export function buildN8nInstallRegistrationRequest(
  profile: GlobiguardBootstrapProfile,
  input: BuildN8nInstallRegistrationInput
): GlobiguardInstallRegistrationRequest {
  return buildInstallRegistrationRequest(profile, {
    packageName: N8N_PACKAGE_NAME,
    packageVersion: input.packageVersion,
    integrationKind: "n8n",
    runtimeKind: "n8n",
    metadata: input.metadata
  });
}

export function buildN8nInstallHeartbeatRequest(
  profile: GlobiguardBootstrapProfile,
  input: BuildN8nInstallHeartbeatInput
): GlobiguardInstallHeartbeatRequest {
  return buildInstallHeartbeatRequest(profile, {
    packageVersion: input.packageVersion,
    runtimeKind: "n8n",
    metadata: input.metadata
  });
}
