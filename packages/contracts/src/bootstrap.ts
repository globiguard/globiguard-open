import type { GlobiguardEnvironment } from "./environment.js";

export const GLOBIGUARD_DEPLOYMENT_MODES = [
  "hosted",
  "self_hosted",
  "sovereign"
] as const;

export type GlobiguardDeploymentMode =
  (typeof GLOBIGUARD_DEPLOYMENT_MODES)[number];

export const GLOBIGUARD_INSTALL_ISSUER_MODES = [
  "globiguard_issued",
  "customer_issued"
] as const;

export type GlobiguardInstallIssuerMode =
  (typeof GLOBIGUARD_INSTALL_ISSUER_MODES)[number];

export const GLOBIGUARD_INSTALL_REPORTING_MODES = [
  "default",
  "opt_in",
  "disabled"
] as const;

export type GlobiguardInstallReportingMode =
  (typeof GLOBIGUARD_INSTALL_REPORTING_MODES)[number];

export interface GlobiguardBootstrapProfile {
  environment: GlobiguardEnvironment;
  deploymentMode: GlobiguardDeploymentMode;
  issuerMode: GlobiguardInstallIssuerMode;
  installReporting: GlobiguardInstallReportingMode;
  installLabel?: string;
  installFingerprint?: string;
}
