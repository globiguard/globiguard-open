import {
  GLOBIGUARD_DEPLOYMENT_MODES,
  GLOBIGUARD_ENVIRONMENTS,
  GLOBIGUARD_INSTALL_ISSUER_MODES,
  GLOBIGUARD_INSTALL_REPORTING_MODES,
  type GlobiguardBootstrapProfile,
  type GlobiguardEnvironment
} from "@globiguard/contracts";
import {
  GlobiguardConfigError,
  type GlobiguardServerClientConfig
} from "@globiguard/sdk";

export const N8N_PACKAGE_NAME = "n8n-nodes-globiguard";

export interface N8nCredentialValues {
  controlPlaneUrl: string;
  environment: string;
  credentialKind: string;
  projectId?: string;
  token?: string;
  deploymentMode: string;
  issuerMode: string;
  installReporting: string;
  brainUrl?: string;
  installLabel?: string;
  installFingerprint?: string;
}

export interface N8nRuntimeResolvedConfig {
  bootstrapProfile: GlobiguardBootstrapProfile;
  client: GlobiguardServerClientConfig;
}

export function normalizeN8nCredentialValues(
  rawValues: Record<string, unknown>
): N8nCredentialValues {
  return {
    controlPlaneUrl: String(rawValues.controlPlaneUrl ?? ""),
    environment: String(rawValues.environment ?? ""),
    credentialKind: String(rawValues.credentialKind ?? ""),
    projectId: stringOrUndefined(rawValues.projectId),
    token: stringOrUndefined(rawValues.token),
    deploymentMode: String(rawValues.deploymentMode ?? ""),
    issuerMode: String(rawValues.issuerMode ?? ""),
    installReporting: String(rawValues.installReporting ?? ""),
    brainUrl: stringOrUndefined(rawValues.brainUrl),
    installLabel: stringOrUndefined(rawValues.installLabel),
    installFingerprint: stringOrUndefined(rawValues.installFingerprint)
  };
}

export function buildN8nRuntimeConfig(
  values: N8nCredentialValues
): N8nRuntimeResolvedConfig {
  const environment = parseAllowedValue(
    values.environment,
    GLOBIGUARD_ENVIRONMENTS,
    "environment"
  );
  const deploymentMode = parseAllowedValue(
    values.deploymentMode,
    GLOBIGUARD_DEPLOYMENT_MODES,
    "deploymentMode"
  );
  const issuerMode = parseAllowedValue(
    values.issuerMode,
    GLOBIGUARD_INSTALL_ISSUER_MODES,
    "issuerMode"
  );
  const installReporting = parseAllowedValue(
    values.installReporting,
    GLOBIGUARD_INSTALL_REPORTING_MODES,
    "installReporting"
  );

  const bootstrapProfile: GlobiguardBootstrapProfile = {
    environment,
    deploymentMode,
    issuerMode,
    installReporting,
    installLabel: values.installLabel || undefined,
    installFingerprint: values.installFingerprint || undefined
  };

  if (!values.controlPlaneUrl) {
    throw new GlobiguardConfigError("Control Plane URL is required.");
  }

  const client: GlobiguardServerClientConfig = {
    clientName: N8N_PACKAGE_NAME,
    environment,
    credential: buildServerCredential(values, environment),
    services: {
      controlPlane: values.controlPlaneUrl,
      ...(values.brainUrl ? { brain: values.brainUrl } : {})
    }
  };

  return {
    bootstrapProfile,
    client
  };
}

function stringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value || undefined;
}

function buildServerCredential(
  values: N8nCredentialValues,
  environment: GlobiguardEnvironment
): GlobiguardServerClientConfig["credential"] {
  switch (values.credentialKind) {
    case "local":
      if (environment !== "local") {
        throw new GlobiguardConfigError(
          "Local credentials may only be used with the local environment."
        );
      }
      return {
        kind: "local",
        ...(values.token ? { token: values.token } : {})
      };
    case "secret":
      if (environment === "local") {
        throw new GlobiguardConfigError(
          "Secret n8n credentials require sandbox or live environment."
        );
      }
      if (!values.projectId) {
        throw new GlobiguardConfigError(
          "Project ID is required for secret n8n credentials."
        );
      }
      if (!values.token) {
        throw new GlobiguardConfigError(
          "Token is required for secret n8n credentials."
        );
      }
      return {
        kind: "secret",
        projectId: values.projectId,
        token: values.token,
        environment
      };
    default:
      throw new GlobiguardConfigError(
        "n8n credentials must use secret or local credential kind."
      );
  }
}

function parseAllowedValue<const TAllowed extends readonly string[]>(
  rawValue: string,
  allowedValues: TAllowed,
  fieldName: string
): TAllowed[number] {
  if (!allowedValues.includes(rawValue as TAllowed[number])) {
    throw new GlobiguardConfigError(
      `${fieldName} must be one of: ${allowedValues.join(", ")}.`
    );
  }
  return rawValue as TAllowed[number];
}
