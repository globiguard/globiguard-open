import type {
  GlobiguardBootstrapProfile,
  GlobiguardCredentialKind
} from "@globiguard/contracts";
import { resolveBootstrapProfile } from "@globiguard/sdk";

const N8N_LOCAL_ALLOWED_CREDENTIAL_KINDS = ["secret", "local"] as const;
const N8N_REMOTE_ALLOWED_CREDENTIAL_KINDS = ["secret"] as const;

export type N8nAllowedCredentialKind =
  (typeof N8N_LOCAL_ALLOWED_CREDENTIAL_KINDS)[number];

export interface N8nCredentialPolicy {
  environment: GlobiguardBootstrapProfile["environment"];
  deploymentMode: GlobiguardBootstrapProfile["deploymentMode"];
  issuerMode: GlobiguardBootstrapProfile["issuerMode"];
  installReporting: GlobiguardBootstrapProfile["installReporting"];
  allowedCredentialKinds: readonly N8nAllowedCredentialKind[];
  disallowedCredentialKinds: readonly GlobiguardCredentialKind[];
  controlPlaneRequired: true;
  defaultConnectionPath: "control_plane_first";
  directBrainAccess: "explicit_opt_in";
  packageDeliveryStage: "governance_checkpoint";
  publishReady: true;
}

export function describeN8nCredentialPolicy(
  profile: GlobiguardBootstrapProfile
): N8nCredentialPolicy {
  const resolved = resolveBootstrapProfile(profile);
  const allowedCredentialKinds = getN8nAllowedCredentialKinds(
    resolved.environment
  );

  return {
    environment: resolved.environment,
    deploymentMode: resolved.deploymentMode,
    issuerMode: resolved.issuerMode,
    installReporting: resolved.installReporting,
    allowedCredentialKinds,
    disallowedCredentialKinds:
      resolved.environment === "local" ? ["publishable"] : ["publishable", "local"],
    controlPlaneRequired: true,
    defaultConnectionPath: "control_plane_first",
    directBrainAccess: "explicit_opt_in",
    packageDeliveryStage: "governance_checkpoint",
    publishReady: true
  };
}

export function isN8nCredentialKindAllowed(
  credentialKind: GlobiguardCredentialKind,
  environment: GlobiguardBootstrapProfile["environment"]
): credentialKind is N8nAllowedCredentialKind {
  return getN8nAllowedCredentialKinds(environment).includes(
    credentialKind as N8nAllowedCredentialKind
  );
}

function getN8nAllowedCredentialKinds(
  environment: GlobiguardBootstrapProfile["environment"]
): readonly N8nAllowedCredentialKind[] {
  return environment === "local"
    ? N8N_LOCAL_ALLOWED_CREDENTIAL_KINDS
    : N8N_REMOTE_ALLOWED_CREDENTIAL_KINDS;
}
