import type {
  GlobiguardBootstrapProfile,
  GlobiguardDeploymentMode,
  GlobiguardInstallIssuerMode,
  GlobiguardInstallReportingMode
} from "./bootstrap.js";
import type { GlobiguardEnvironment } from "./environment.js";

export type GlobiguardInstallIntegrationKind =
  | "sdk"
  | "react"
  | "n8n"
  | "workflow"
  | "custom";

export type GlobiguardRuntimeKind =
  | "browser"
  | "node"
  | "n8n"
  | "worker"
  | "service";

export interface GlobiguardInstallRegistrationRequest {
  packageName: string;
  packageVersion: string;
  integrationKind: GlobiguardInstallIntegrationKind;
  runtimeKind: GlobiguardRuntimeKind;
  environment: GlobiguardEnvironment;
  deploymentMode: GlobiguardDeploymentMode;
  issuerMode: GlobiguardInstallIssuerMode;
  installReporting: GlobiguardInstallReportingMode;
  installLabel?: string;
  installFingerprint?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface GlobiguardInstallRegistrationResponse {
  installId: string;
}

export interface GlobiguardInstallHeartbeatRequest {
  packageVersion: string;
  runtimeKind: GlobiguardRuntimeKind;
  environment: GlobiguardEnvironment;
  deploymentMode: GlobiguardDeploymentMode;
  issuerMode: GlobiguardInstallIssuerMode;
  installReporting: GlobiguardInstallReportingMode;
  installLabel?: string;
  installFingerprint?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface GlobiguardInstallHeartbeatResponse {
  heartbeatId: string;
}

export interface GlobiguardInstallsClient {
  register(
    request: GlobiguardInstallRegistrationRequest
  ): Promise<GlobiguardInstallRegistrationResponse>;
  heartbeat(
    installId: string,
    request: GlobiguardInstallHeartbeatRequest
  ): Promise<GlobiguardInstallHeartbeatResponse>;
}

export interface GlobiguardBuildInstallRegistrationInput {
  packageName: string;
  packageVersion: string;
  integrationKind: GlobiguardInstallIntegrationKind;
  runtimeKind: GlobiguardRuntimeKind;
  metadata?: Record<string, string | number | boolean>;
}

export interface GlobiguardBuildInstallHeartbeatInput {
  packageVersion: string;
  runtimeKind: GlobiguardRuntimeKind;
  metadata?: Record<string, string | number | boolean>;
}

export interface GlobiguardBootstrapValidationResult {
  installRegistrationAllowed: boolean;
}

export type GlobiguardResolvedBootstrapProfile = GlobiguardBootstrapProfile &
  GlobiguardBootstrapValidationResult;

