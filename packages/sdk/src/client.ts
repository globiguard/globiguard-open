import type {
  GlobiguardActionGatewayConfig,
  GlobiguardActionsClient,
  GlobiguardActionsReadClient,
  GlobiguardAuditClient,
  GlobiguardAuditReadClient,
  GlobiguardEnvironment,
  GlobiguardInstallsClient,
  GlobiguardLocalCredential,
  GlobiguardOrgsClient,
  GlobiguardPoliciesClient,
  GlobiguardPoliciesReadClient,
  GlobiguardPublishableCredential,
  GlobiguardQueueClient,
  GlobiguardQueueReadClient,
  GlobiguardResolvedActionGatewayConfig,
  GlobiguardSecretCredential,
  GlobiguardServiceTargets,
  GlobiguardWorkflowsReadClient,
  GlobiguardWorkflowsClient
} from "@globiguard/contracts";

import { GlobiguardConfigError } from "./errors.js";
import {
  createGovernedActionsClient,
  type GlobiguardGovernedActionsClient
} from "./governed-actions.js";
import {
  createGovernanceClient,
  type GlobiguardGovernanceClient
} from "./governance.js";
import { createActionsClient, createActionsReadClient } from "./resources/actions.js";
import { requestJson, type GlobiguardRequestOptions } from "./fetch.js";
import { createAuditClient, createAuditReadClient } from "./resources/audit.js";
import { createInstallsClient } from "./resources/installs.js";
import { createOrgsClient } from "./resources/orgs.js";
import { createPoliciesClient, createPoliciesReadClient } from "./resources/policies.js";
import { createQueueClient, createQueueReadClient } from "./resources/queue.js";
import {
  createWorkflowsClient,
  createWorkflowsReadClient
} from "./resources/workflows.js";

export interface GlobiguardClientBaseConfig {
  environment: GlobiguardEnvironment;
  services: GlobiguardServiceTargets;
  clientName?: string;
  fetch?: typeof fetch;
  /** Default deadline for every GlobiGuard HTTP request. Defaults to 10 seconds. */
  requestTimeoutMs?: number;
}

export interface GlobiguardServerClientConfig extends GlobiguardClientBaseConfig {
  credential: GlobiguardSecretCredential | GlobiguardLocalCredential;
  actionGateway?: GlobiguardActionGatewayConfig;
}

export interface GlobiguardBrowserClientConfig
  extends Omit<GlobiguardClientBaseConfig, "services"> {
  credential: GlobiguardPublishableCredential | GlobiguardLocalCredential;
  services: Pick<GlobiguardServiceTargets, "controlPlane">;
}

export interface GlobiguardTransport {
  request<TResponse>(
    path: string,
    options?: GlobiguardRequestOptions
  ): Promise<TResponse>;
}

export interface GlobiguardReadTransport {
  request<TResponse>(
    path: string,
    options?: Omit<GlobiguardRequestOptions, "body"> & {
      method?: "GET";
      body?: never;
    }
  ): Promise<TResponse>;
}

export interface GlobiguardServerClient {
  kind: "server";
  environment: GlobiguardEnvironment;
  actionGateway: GlobiguardResolvedActionGatewayConfig;
  controlPlane: GlobiguardTransport;
  brain?: GlobiguardTransport;
  gateway?: GlobiguardTransport;
  sidecar?: GlobiguardTransport;
  actions: GlobiguardActionsClient;
  audit: GlobiguardAuditClient;
  installs: GlobiguardInstallsClient;
  orgs: GlobiguardOrgsClient;
  policies: GlobiguardPoliciesClient;
  queue: GlobiguardQueueClient;
  workflows: GlobiguardWorkflowsClient;
  governedActions: GlobiguardGovernedActionsClient;
  governance: GlobiguardGovernanceClient;
}

export interface GlobiguardBrowserClient {
  kind: "browser";
  environment: GlobiguardEnvironment;
  actions: GlobiguardActionsReadClient;
  audit: GlobiguardAuditReadClient;
  installs: GlobiguardInstallsClient;
  policies: GlobiguardPoliciesReadClient;
  queue: GlobiguardQueueReadClient;
  workflows: GlobiguardWorkflowsReadClient;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assertSecretCredentialShape(
  credential: { token?: unknown; projectId?: unknown }
): void {
  if (!isNonEmptyString(credential.token) || !isNonEmptyString(credential.projectId)) {
    throw new GlobiguardConfigError(
      "Secret credentials require non-empty projectId and token values."
    );
  }
}

function assertPublishableCredentialShape(
  credential: { token?: unknown; projectId?: unknown }
): void {
  if (!isNonEmptyString(credential.token) || !isNonEmptyString(credential.projectId)) {
    throw new GlobiguardConfigError(
      "Publishable credentials require non-empty projectId and token values."
    );
  }
}

function assertServiceUrl(
  serviceName: string,
  serviceUrl: string,
  environment: GlobiguardEnvironment,
  requireLocalHost = false
): void {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(serviceUrl);
  } catch {
    throw new GlobiguardConfigError(`${serviceName} service URL must be a valid URL.`);
  }

  if (environment !== "local" && parsedUrl.protocol !== "https:") {
    throw new GlobiguardConfigError(
      `${serviceName} service URL must use HTTPS outside the local environment.`
    );
  }

  if (parsedUrl.pathname !== "/" && parsedUrl.pathname !== "") {
    throw new GlobiguardConfigError(
      `${serviceName} service URL must be a service origin, not a versioned API path.`
    );
  }

  if (
    requireLocalHost &&
    parsedUrl.hostname !== "localhost" &&
    parsedUrl.hostname !== "127.0.0.1" &&
    parsedUrl.hostname !== "::1" &&
    !parsedUrl.hostname.endsWith(".localhost")
  ) {
    throw new GlobiguardConfigError(
      `${serviceName} service URL must use a localhost or loopback host with local credentials.`
    );
  }
}

function getFetch(fetchImpl?: typeof fetch): typeof fetch {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (typeof fetch !== "function") {
    throw new GlobiguardConfigError(
      "A fetch implementation is required in this runtime."
    );
  }

  return fetch;
}

function createTransport(config: {
  baseUrl: string;
  clientName: string;
  credential:
    | GlobiguardSecretCredential
    | GlobiguardPublishableCredential
    | GlobiguardLocalCredential;
  environment: GlobiguardEnvironment;
  fetchImpl: typeof fetch;
  requestTimeoutMs: number;
}): GlobiguardTransport {
  return {
    request<TResponse>(path: string, options?: GlobiguardRequestOptions) {
      return requestJson<TResponse>({
        baseUrl: config.baseUrl,
        clientName: config.clientName,
        credential: config.credential,
        environment: config.environment,
        fetchImpl: config.fetchImpl,
        path,
        options,
        requestTimeoutMs: config.requestTimeoutMs
      });
    }
  };
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MAX_REQUEST_TIMEOUT_MS = 300_000;

function resolveRequestTimeoutMs(value: number | undefined): number {
  const timeoutMs = value ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_REQUEST_TIMEOUT_MS) {
    throw new GlobiguardConfigError(
      `requestTimeoutMs must be greater than 0 and at most ${MAX_REQUEST_TIMEOUT_MS}.`
    );
  }
  return timeoutMs;
}

function resolveActionGatewayConfig(
  actionGateway: GlobiguardActionGatewayConfig | undefined,
  services: GlobiguardServiceTargets
): GlobiguardResolvedActionGatewayConfig {
  const config = actionGateway ?? { mode: "control_plane" as const };

  switch (config.mode) {
    case "control_plane":
      return {
        ...config,
        baseUrl: services.controlPlane
      };
    case "sidecar":
      if (!services.sidecar) {
        throw new GlobiguardConfigError(
          "Action gateway mode 'sidecar' requires services.sidecar."
        );
      }

      return {
        ...config,
        baseUrl: services.sidecar
      };
    case "gateway":
      if (!services.gateway) {
        throw new GlobiguardConfigError(
          "Action gateway mode 'gateway' requires services.gateway."
        );
      }

      return {
        ...config,
        baseUrl: services.gateway
      };
    default:
      throw new GlobiguardConfigError(
        "Action gateway mode must be control_plane, sidecar, or gateway."
      );
  }
}


export function createServerClient(
  config: GlobiguardServerClientConfig
): GlobiguardServerClient {
  const fetchImpl = getFetch(config.fetch);
  const clientName = config.clientName ?? "@globiguard/sdk";
  const credentialKind = (config.credential as { kind: string }).kind;
  const requestTimeoutMs = resolveRequestTimeoutMs(config.requestTimeoutMs);

  if (!config.services.controlPlane) {
    throw new GlobiguardConfigError("controlPlane service URL is required.");
  }

  assertServiceUrl(
    "controlPlane",
    config.services.controlPlane,
    config.environment,
    credentialKind === "local"
  );

  if (credentialKind === "publishable") {
    throw new GlobiguardConfigError(
      "Server clients require secret or local credentials."
    );
  }

  if (credentialKind !== "secret" && credentialKind !== "local") {
    throw new GlobiguardConfigError(
      "Server clients require a recognized secret or local credential kind."
    );
  }

  if (config.credential.kind === "local" && config.environment !== "local") {
    throw new GlobiguardConfigError(
      "Local credentials may only be used with the local environment."
    );
  }

  if (credentialKind === "secret") {
    assertSecretCredentialShape(config.credential);
  }

  if (
    config.credential.kind === "secret" &&
    config.credential.environment !== config.environment
  ) {
    throw new GlobiguardConfigError(
      "Secret credential environment must match the client environment."
    );
  }

  const controlPlane = createTransport({
    baseUrl: config.services.controlPlane,
    clientName,
    credential: config.credential,
    environment: config.environment,
    fetchImpl,
    requestTimeoutMs
  });

  const brain = config.services.brain
    ? createTransport({
        baseUrl: config.services.brain,
        clientName,
        credential: config.credential,
        environment: config.environment,
        fetchImpl,
        requestTimeoutMs
      })
    : undefined;

  const gateway = config.services.gateway
    ? createTransport({
        baseUrl: config.services.gateway,
        clientName,
        credential: config.credential,
        environment: config.environment,
        fetchImpl,
        requestTimeoutMs
      })
    : undefined;

  const sidecar = config.services.sidecar
    ? createTransport({
        baseUrl: config.services.sidecar,
        clientName,
        credential: config.credential,
        environment: config.environment,
        fetchImpl,
        requestTimeoutMs
      })
    : undefined;

  if (config.services.brain) {
    assertServiceUrl(
      "brain",
      config.services.brain,
      config.environment,
      credentialKind === "local"
    );
  }

  if (config.services.gateway) {
    assertServiceUrl(
      "gateway",
      config.services.gateway,
      config.environment,
      credentialKind === "local"
    );
  }

  if (config.services.sidecar) {
    assertServiceUrl(
      "sidecar",
      config.services.sidecar,
      config.environment,
      credentialKind === "local"
    );
  }

  const actionGateway = resolveActionGatewayConfig(
    config.actionGateway,
    config.services
  );
  const actionTransport =
    actionGateway.mode === "sidecar"
      ? sidecar
      : actionGateway.mode === "gateway"
        ? gateway
        : controlPlane;

  if (!actionTransport) {
    throw new GlobiguardConfigError(
      "Action gateway transport could not be resolved."
    );
  }

  const actions = createActionsClient(actionTransport);
  const audit = createAuditClient(controlPlane);
  const queue = createQueueClient(controlPlane);

  return {
    kind: "server",
    environment: config.environment,
    actionGateway,
    controlPlane,
    brain,
    gateway,
    sidecar,
    actions,
    audit,
    installs: createInstallsClient(controlPlane),
    orgs: createOrgsClient(controlPlane),
    policies: createPoliciesClient(controlPlane),
    queue,
    workflows: createWorkflowsClient(controlPlane),
    governedActions: createGovernedActionsClient({
      actions,
      audit,
      queue
    }),
    governance: createGovernanceClient(controlPlane),
  };
}

export function createBrowserClient(
  config: GlobiguardBrowserClientConfig
): GlobiguardBrowserClient {
  const fetchImpl = getFetch(config.fetch);
  const clientName = config.clientName ?? "@globiguard/sdk";
  const credentialKind = (config.credential as { kind: string }).kind;
  const requestTimeoutMs = resolveRequestTimeoutMs(config.requestTimeoutMs);

  if (!config.services.controlPlane) {
    throw new GlobiguardConfigError("controlPlane service URL is required.");
  }

  assertServiceUrl(
    "controlPlane",
    config.services.controlPlane,
    config.environment,
    credentialKind === "local"
  );

  if (credentialKind === "secret") {
    throw new GlobiguardConfigError(
      "Browser clients require publishable or local credentials."
    );
  }

  if (credentialKind !== "publishable" && credentialKind !== "local") {
    throw new GlobiguardConfigError(
      "Browser clients require a recognized publishable or local credential kind."
    );
  }

  if (config.credential.kind === "local" && config.environment !== "local") {
    throw new GlobiguardConfigError(
      "Local credentials may only be used with the local environment."
    );
  }

  if (credentialKind === "publishable") {
    assertPublishableCredentialShape(config.credential);
  }

  const controlPlane = createTransport({
    baseUrl: config.services.controlPlane,
    clientName,
    credential: config.credential,
    environment: config.environment,
    fetchImpl,
    requestTimeoutMs
  });

  return {
    kind: "browser",
    environment: config.environment,
    actions: createActionsReadClient(controlPlane),
    audit: createAuditReadClient(controlPlane),
    installs: createInstallsClient(controlPlane),
    policies: createPoliciesReadClient(controlPlane),
    queue: createQueueReadClient(controlPlane),
    workflows: createWorkflowsReadClient(controlPlane)
  };
}
