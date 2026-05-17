import { describe, expect, it, vi } from "vitest";

import {
  buildN8nRuntimeConfig,
  buildN8nInstallHeartbeatRequest,
  buildN8nInstallRegistrationRequest,
  createN8nRuntime
} from "../index.js";

describe("n8n runtime bootstrap", () => {
  it("builds n8n-specific install payloads from the shared bootstrap profile", () => {
    const profile = {
      environment: "sandbox" as const,
      deploymentMode: "hosted" as const,
      issuerMode: "globiguard_issued" as const,
      installReporting: "opt_in" as const
    };

    const registration = buildN8nInstallRegistrationRequest(profile, {
      packageVersion: "0.1.0",
      metadata: { workflow: "demo" }
    });
    const heartbeat = buildN8nInstallHeartbeatRequest(profile, {
      packageVersion: "0.1.0",
      metadata: { workflow: "demo" }
    });

    expect(registration).toMatchObject({
      packageName: "n8n-nodes-globiguard",
      integrationKind: "n8n",
      runtimeKind: "n8n",
      environment: "sandbox",
      deploymentMode: "hosted"
    });
    expect(heartbeat).toMatchObject({
      runtimeKind: "n8n",
      environment: "sandbox",
      deploymentMode: "hosted"
    });
  });

  it("keeps brain access off unless the runtime is configured with a brain endpoint", () => {
    const runtime = createN8nRuntime({
      bootstrapProfile: {
        environment: "sandbox",
        deploymentMode: "hosted",
        issuerMode: "globiguard_issued",
        installReporting: "opt_in"
      },
      client: {
        environment: "sandbox",
        credential: {
          kind: "secret",
          projectId: "proj_123",
          token: "sk_test_123",
          environment: "sandbox"
        },
        services: {
          controlPlane: "https://control.example.com"
        },
        fetch: vi.fn()
      }
    });

    expect(runtime.executionBoundary.directBrainAccess).toBe(false);
  });

  it("shows direct brain access only when the runtime is explicitly configured for it", () => {
    const runtime = createN8nRuntime({
      bootstrapProfile: {
        environment: "sandbox",
        deploymentMode: "hosted",
        issuerMode: "globiguard_issued",
        installReporting: "opt_in"
      },
      client: {
        environment: "sandbox",
        credential: {
          kind: "secret",
          projectId: "proj_123",
          token: "sk_test_123",
          environment: "sandbox"
        },
        services: {
          controlPlane: "https://control.example.com",
          brain: "https://brain.example.com"
        },
        fetch: vi.fn()
      }
    });

    expect(runtime.executionBoundary.directBrainAccess).toBe(true);
  });

  it("rejects hosted n8n runtimes that try to use customer-issued bootstrap identity", () => {
    expect(() =>
      createN8nRuntime({
        bootstrapProfile: {
          environment: "live",
          deploymentMode: "hosted",
          issuerMode: "customer_issued",
          installReporting: "default"
        },
        client: {
          environment: "live",
          credential: {
            kind: "secret",
            projectId: "proj_123",
            token: "sk_test_123",
            environment: "live"
          },
          services: {
            controlPlane: "https://control.example.com"
          },
          fetch: vi.fn()
        }
      })
    ).toThrowError(/globiguard-issued bootstrap credentials/);
  });

  it("rejects self-hosted n8n runtimes that do not choose reporting explicitly", () => {
    expect(() =>
      createN8nRuntime({
        bootstrapProfile: {
          environment: "sandbox",
          deploymentMode: "self_hosted",
          issuerMode: "customer_issued",
          installReporting: "default"
        },
        client: {
          environment: "sandbox",
          credential: {
            kind: "secret",
            projectId: "proj_123",
            token: "sk_test_123",
            environment: "sandbox"
          },
          services: {
            controlPlane: "https://control.example.com"
          },
          fetch: vi.fn()
        }
      })
    ).toThrowError(/must set installReporting to opt_in or disabled explicitly/);
  });

  it("rejects n8n runtimes whose bootstrap and client environments drift", () => {
    expect(() =>
      createN8nRuntime({
        bootstrapProfile: {
          environment: "live",
          deploymentMode: "hosted",
          issuerMode: "globiguard_issued",
          installReporting: "default"
        },
        client: {
          environment: "sandbox",
          credential: {
            kind: "secret",
            projectId: "proj_123",
            token: "sk_test_123",
            environment: "sandbox"
          },
          services: {
            controlPlane: "https://control.example.com"
          },
          fetch: vi.fn()
        }
      })
    ).toThrowError(/must match the bootstrap profile environment/);
  });

  it("rejects local credentials outside the local environment", () => {
    expect(() =>
      buildN8nRuntimeConfig({
        controlPlaneUrl: "https://control.example.com",
        environment: "sandbox",
        credentialKind: "local",
        deploymentMode: "hosted",
        issuerMode: "globiguard_issued",
        installReporting: "opt_in"
      })
    ).toThrowError(/Local credentials may only be used with the local environment/);
  });

  it("allows local credentials in the local environment", () => {
    const config = buildN8nRuntimeConfig({
      controlPlaneUrl: "http://127.0.0.1:3000",
      environment: "local",
      credentialKind: "local",
      deploymentMode: "self_hosted",
      issuerMode: "customer_issued",
      installReporting: "disabled"
    });

    expect(config.client).toMatchObject({
      environment: "local",
      credential: {
        kind: "local"
      }
    });
  });

  it("identifies the ESM helper path as the n8n package client", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ installId: "ins_123" }), {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        })
    );

    const config = buildN8nRuntimeConfig({
      controlPlaneUrl: "https://control.example.com",
      environment: "sandbox",
      credentialKind: "secret",
      projectId: "proj_123",
      token: "sk_test_123",
      deploymentMode: "hosted",
      issuerMode: "globiguard_issued",
      installReporting: "default"
    });

    const runtime = createN8nRuntime({
      ...config,
      client: {
        ...config.client,
        fetch: fetchMock
      }
    });

    await runtime.client.installs.register({
      packageName: "n8n-nodes-globiguard",
      packageVersion: "0.1.0",
      integrationKind: "n8n",
      runtimeKind: "n8n",
      environment: "sandbox",
      deploymentMode: "hosted",
      issuerMode: "globiguard_issued",
      installReporting: "default"
    });

    const requestHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(requestHeaders.get("x-globiguard-client")).toBe(
      "n8n-nodes-globiguard"
    );
  });
});
