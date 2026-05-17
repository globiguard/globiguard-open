import type {
  GlobiguardBootstrapProfile,
  GlobiguardBuildInstallHeartbeatInput,
  GlobiguardBuildInstallRegistrationInput,
  GlobiguardInstallHeartbeatRequest,
  GlobiguardInstallRegistrationRequest,
  GlobiguardResolvedBootstrapProfile
} from "@globiguard/contracts";
import {
  GLOBIGUARD_DEPLOYMENT_MODES,
  GLOBIGUARD_ENVIRONMENTS,
  GLOBIGUARD_INSTALL_ISSUER_MODES,
  GLOBIGUARD_INSTALL_REPORTING_MODES
} from "@globiguard/contracts";

import { GlobiguardConfigError } from "./errors.js";

export function resolveBootstrapProfile(
  profile: GlobiguardBootstrapProfile
): GlobiguardResolvedBootstrapProfile {
  assertAllowedValue(
    profile.environment,
    GLOBIGUARD_ENVIRONMENTS,
    "environment"
  );
  assertAllowedValue(
    profile.deploymentMode,
    GLOBIGUARD_DEPLOYMENT_MODES,
    "deploymentMode"
  );
  assertAllowedValue(
    profile.issuerMode,
    GLOBIGUARD_INSTALL_ISSUER_MODES,
    "issuerMode"
  );
  assertAllowedValue(
    profile.installReporting,
    GLOBIGUARD_INSTALL_REPORTING_MODES,
    "installReporting"
  );

  if (
    profile.deploymentMode === "hosted" &&
    profile.issuerMode !== "globiguard_issued"
  ) {
    throw new GlobiguardConfigError(
      "Hosted deployments must use globiguard-issued bootstrap credentials."
    );
  }

  if (
    profile.deploymentMode !== "hosted" &&
    profile.issuerMode !== "customer_issued"
  ) {
    throw new GlobiguardConfigError(
      "Self-hosted and sovereign deployments must use customer-issued bootstrap credentials."
    );
  }

  if (
    profile.deploymentMode !== "hosted" &&
    profile.installReporting === "default"
  ) {
    throw new GlobiguardConfigError(
      "Self-hosted and sovereign deployments must set installReporting to opt_in or disabled explicitly."
    );
  }

  return {
    ...profile,
    installRegistrationAllowed: profile.installReporting !== "disabled"
  };
}

function assertAllowedValue<const TAllowed extends readonly string[]>(
  value: string,
  allowedValues: TAllowed,
  fieldName: string
): asserts value is TAllowed[number] {
  if (!allowedValues.includes(value as TAllowed[number])) {
    throw new GlobiguardConfigError(
      `${fieldName} must be one of: ${allowedValues.join(", ")}.`
    );
  }
}

export function buildInstallRegistrationRequest(
  profile: GlobiguardBootstrapProfile,
  input: GlobiguardBuildInstallRegistrationInput
): GlobiguardInstallRegistrationRequest {
  const resolved = resolveBootstrapProfile(profile);
  assertInstallRegistrationAllowed(resolved);

  return {
    packageName: input.packageName,
    packageVersion: input.packageVersion,
    integrationKind: input.integrationKind,
    runtimeKind: input.runtimeKind,
    environment: resolved.environment,
    deploymentMode: resolved.deploymentMode,
    issuerMode: resolved.issuerMode,
    installReporting: resolved.installReporting,
    installLabel: resolved.installLabel,
    installFingerprint: resolved.installFingerprint,
    metadata: input.metadata
  };
}

export function buildInstallHeartbeatRequest(
  profile: GlobiguardBootstrapProfile,
  input: GlobiguardBuildInstallHeartbeatInput
): GlobiguardInstallHeartbeatRequest {
  const resolved = resolveBootstrapProfile(profile);
  assertInstallRegistrationAllowed(resolved);

  return {
    packageVersion: input.packageVersion,
    runtimeKind: input.runtimeKind,
    environment: resolved.environment,
    deploymentMode: resolved.deploymentMode,
    issuerMode: resolved.issuerMode,
    installReporting: resolved.installReporting,
    installLabel: resolved.installLabel,
    installFingerprint: resolved.installFingerprint,
    metadata: input.metadata
  };
}

function assertInstallRegistrationAllowed(
  profile: GlobiguardResolvedBootstrapProfile
): void {
  if (!profile.installRegistrationAllowed) {
    throw new GlobiguardConfigError(
      "Install registration and heartbeat are disabled for this bootstrap profile."
    );
  }
}
