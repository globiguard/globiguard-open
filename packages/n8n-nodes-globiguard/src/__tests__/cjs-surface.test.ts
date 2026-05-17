import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const currentDir = path.dirname(fileURLToPath(import.meta.url));

describe("n8n cjs surface", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the built credential and node artifacts with require()", () => {
    const { GlobiGuardApi } = require(
      path.resolve(
        currentDir,
        "../../dist/credentials/GlobiGuardApi.credentials.cjs"
      )
    );
    const { GlobiGuard } = require(
      path.resolve(currentDir, "../../dist/nodes/GlobiGuard/GlobiGuard.node.cjs")
    );

    expect(new GlobiGuardApi().name).toBe("globiGuardApi");
    expect(new GlobiGuard().description.name).toBe("globiGuard");
  });

  it("keeps the package root import loadable in plain Node", async () => {
    const module = await import(
      pathToFileURL(path.resolve(currentDir, "../../dist/index.js")).href
    );

    expect(module.createN8nRuntime).toBeTypeOf("function");
    expect(module.describeN8nCredentialPolicy).toBeTypeOf("function");
  }, 15000);

  it("sends the local mode header from the shipped cjs node artifact", async () => {
    const { GlobiGuard } = require(
      path.resolve(currentDir, "../../dist/nodes/GlobiGuard/GlobiGuard.node.cjs")
    );

    const fetchMock = vi.fn(async (input: URL | string, _init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/heartbeats")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { heartbeatId: "hb_123" };
          }
        };
      }

      return {
        ok: true,
        status: 200,
        async json() {
          return { installId: "ins_123" };
        }
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    const node = new GlobiGuard();
    const context = {
      continueOnFail: () => false,
      getCredentials: async () => ({
        controlPlaneUrl: "http://127.0.0.1:3000",
        environment: "local",
        credentialKind: "local",
        token: "local_test_token",
        deploymentMode: "self_hosted",
        issuerMode: "customer_issued",
        installReporting: "opt_in"
      }),
      getInputData: () => [{}],
      getNode: () => ({ name: "globiGuard" }),
      getNodeParameter: (
        name: string,
        _itemIndex: number,
        defaultValue?: unknown
      ) => {
        if (name === "operation") {
          return "registerInstall";
        }
        if (name === "packageVersion") {
          return "0.1.0";
        }
        if (name === "sendHeartbeat") {
          return true;
        }

        return defaultValue;
      }
    };

    const result = await node.execute.call(context);

    expect(result[0][0]?.json.installId).toBe("ins_123");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstRequestHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(firstRequestHeaders.get("x-globiguard-local-mode")).toBe("true");
    expect(firstRequestHeaders.get("x-globiguard-local-token")).toBe(
      "local_test_token"
    );
  });

  it("keeps the local mode header when the shipped cjs node has no local token", async () => {
    const { GlobiGuard } = require(
      path.resolve(currentDir, "../../dist/nodes/GlobiGuard/GlobiGuard.node.cjs")
    );

    const fetchMock = vi.fn(async (_input: URL | string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      async json() {
        return { installId: "ins_456" };
      }
    }));

    vi.stubGlobal("fetch", fetchMock);

    const node = new GlobiGuard();
    const context = {
      continueOnFail: () => false,
      getCredentials: async () => ({
        controlPlaneUrl: "http://127.0.0.1:3000",
        environment: "local",
        credentialKind: "local",
        token: "",
        deploymentMode: "self_hosted",
        issuerMode: "customer_issued",
        installReporting: "opt_in"
      }),
      getInputData: () => [{}],
      getNode: () => ({ name: "globiGuard" }),
      getNodeParameter: (
        name: string,
        _itemIndex: number,
        defaultValue?: unknown
      ) => {
        if (name === "operation") {
          return "registerInstall";
        }
        if (name === "packageVersion") {
          return "0.1.0";
        }
        if (name === "sendHeartbeat") {
          return false;
        }

        return defaultValue;
      }
    };

    const result = await node.execute.call(context);

    expect(result[0][0]?.json.installId).toBe("ins_456");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const firstRequestHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(firstRequestHeaders.get("x-globiguard-local-mode")).toBe("true");
    expect(firstRequestHeaders.has("x-globiguard-local-token")).toBe(false);
  });

  it("registers the install once per node run even from the shipped cjs node artifact", async () => {
    const { GlobiGuard } = require(
      path.resolve(currentDir, "../../dist/nodes/GlobiGuard/GlobiGuard.node.cjs")
    );

    const fetchMock = vi.fn(async (input: URL | string) => {
      const url = String(input);

      if (url.includes("/heartbeats")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { heartbeatId: "hb_123" };
          }
        };
      }

      return {
        ok: true,
        status: 200,
        async json() {
          return { installId: "ins_123" };
        }
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    const node = new GlobiGuard();
    const context = {
      continueOnFail: () => false,
      getCredentials: async () => ({
        controlPlaneUrl: "https://control.example.com",
        environment: "sandbox",
        credentialKind: "secret",
        projectId: "proj_123",
        token: "sk_test_123",
        deploymentMode: "hosted",
        issuerMode: "globiguard_issued",
        installReporting: "default"
      }),
      getInputData: () => [{ json: { step: 1 } }, { json: { step: 2 } }],
      getNode: () => ({ name: "globiGuard" }),
      getNodeParameter: (
        name: string,
        _itemIndex: number,
        defaultValue?: unknown
      ) => {
        if (name === "operation") {
          return "registerInstall";
        }
        if (name === "packageVersion") {
          return "0.1.0";
        }
        if (name === "sendHeartbeat") {
          return true;
        }

        return defaultValue;
      }
    };

    const result = await node.execute.call(context);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result[0]).toHaveLength(2);
    expect(result[0][0]).toMatchObject({
      json: {
        installId: "ins_123",
        heartbeatId: "hb_123"
      },
      pairedItem: 0
    });
    expect(result[0][1]).toMatchObject({
      json: {
        installId: "ins_123",
        heartbeatId: "hb_123"
      },
      pairedItem: 1
    });
    expect(result[0][0]?.json).not.toBe(result[0][1]?.json);

    result[0][0]!.json.extra = "mutated";
    expect(result[0][1]?.json).not.toHaveProperty("extra");
  });

  it("rejects non-loopback control-plane URLs for local credentials in the shipped cjs node artifact", async () => {
    const { GlobiGuard } = require(
      path.resolve(currentDir, "../../dist/nodes/GlobiGuard/GlobiGuard.node.cjs")
    );

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const node = new GlobiGuard();
    const context = {
      continueOnFail: () => false,
      getCredentials: async () => ({
        controlPlaneUrl: "http://control.example.com",
        environment: "local",
        credentialKind: "local",
        token: "local_test_token",
        deploymentMode: "self_hosted",
        issuerMode: "customer_issued",
        installReporting: "opt_in"
      }),
      getInputData: () => [{}],
      getNode: () => ({ name: "globiGuard" }),
      getNodeParameter: (
        name: string,
        _itemIndex: number,
        defaultValue?: unknown
      ) => {
        if (name === "operation") {
          return "registerInstall";
        }
        if (name === "packageVersion") {
          return "0.1.0";
        }
        if (name === "sendHeartbeat") {
          return false;
        }

        return defaultValue;
      }
    };

    await expect(node.execute.call(context)).rejects.toThrowError(
      /localhost or loopback host with local credentials/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-https control-plane URLs outside the local environment in the shipped cjs node artifact", async () => {
    const { GlobiGuard } = require(
      path.resolve(currentDir, "../../dist/nodes/GlobiGuard/GlobiGuard.node.cjs")
    );

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const node = new GlobiGuard();
    const context = {
      continueOnFail: () => false,
      getCredentials: async () => ({
        controlPlaneUrl: "http://control.example.com",
        environment: "sandbox",
        credentialKind: "secret",
        projectId: "proj_123",
        token: "sk_test_123",
        deploymentMode: "hosted",
        issuerMode: "globiguard_issued",
        installReporting: "default"
      }),
      getInputData: () => [{}],
      getNode: () => ({ name: "globiGuard" }),
      getNodeParameter: (
        name: string,
        _itemIndex: number,
        defaultValue?: unknown
      ) => {
        if (name === "operation") {
          return "registerInstall";
        }
        if (name === "packageVersion") {
          return "0.1.0";
        }
        if (name === "sendHeartbeat") {
          return false;
        }

        return defaultValue;
      }
    };

    await expect(node.execute.call(context)).rejects.toThrowError(
      /must use HTTPS outside the local environment/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only secret credentials in the shipped cjs node artifact", async () => {
    const { GlobiGuard } = require(
      path.resolve(currentDir, "../../dist/nodes/GlobiGuard/GlobiGuard.node.cjs")
    );

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const node = new GlobiGuard();
    const context = {
      continueOnFail: () => false,
      getCredentials: async () => ({
        controlPlaneUrl: "https://control.example.com",
        environment: "sandbox",
        credentialKind: "secret",
        projectId: "   ",
        token: "   ",
        deploymentMode: "hosted",
        issuerMode: "globiguard_issued",
        installReporting: "default"
      }),
      getInputData: () => [{}],
      getNode: () => ({ name: "globiGuard" }),
      getNodeParameter: (
        name: string,
        _itemIndex: number,
        defaultValue?: unknown
      ) => {
        if (name === "operation") {
          return "registerInstall";
        }
        if (name === "packageVersion") {
          return "0.1.0";
        }
        if (name === "sendHeartbeat") {
          return false;
        }

        return defaultValue;
      }
    };

    await expect(node.execute.call(context)).rejects.toThrowError(
      /Project ID is required for secret n8n credentials/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });


  it("authorizes governed actions from the shipped cjs node artifact", async () => {
    const { GlobiGuard } = require(
      path.resolve(currentDir, "../../dist/nodes/GlobiGuard/GlobiGuard.node.cjs")
    );

    const fetchMock = vi.fn(async (input: URL | string, init?: RequestInit) => {
      expect(String(input)).toBe("https://control.example.com/v1/actions/authorize");
      expect(init?.method).toBe("POST");

      return {
        ok: true,
        status: 200,
        async json() {
          return {
            contractVersion: "2026-04-action-beta",
            authorizationId: "auth_cjs",
            decision: "MODIFY",
            approvalState: "NOT_REQUIRED",
            evidenceRefs: [
              {
                id: "ev_cjs",
                uri: "evidence://auth_cjs/audit_123",
                kind: "audit_event"
              }
            ],
            reason: "Action allowed with modifications."
          };
        }
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    const node = new GlobiGuard();
    const context = {
      continueOnFail: () => false,
      getCredentials: async () => ({
        controlPlaneUrl: "https://control.example.com",
        environment: "sandbox",
        credentialKind: "secret",
        projectId: "proj_123",
        token: "sk_test_123",
        deploymentMode: "hosted",
        issuerMode: "globiguard_issued",
        installReporting: "default"
      }),
      getInputData: () => [{ json: { text: "hello" } }],
      getNode: () => ({ name: "globiGuard" }),
      getNodeParameter: (
        name: string,
        _itemIndex: number,
        defaultValue?: unknown
      ) => {
        const values: Record<string, unknown> = {
          operation: "governAction",
          actionType: "slack.post",
          destinationType: "slack",
          destinationName: "alerts",
          dataClasses: ["INTERNAL"],
          enforcementMode: "annotate"
        };

        return values[name] ?? defaultValue;
      }
    };

    const result = await node.execute.call(context);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result[0][0]?.json).toMatchObject({
      text: "hello",
      globiguard: {
        authorizationId: "auth_cjs",
        decision: "MODIFY",
        approvalState: "NOT_REQUIRED",
        reason: "Action allowed with modifications."
      }
    });
  });

});
