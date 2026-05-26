import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSignedWebhookPayload } from "@globiguard/sdk/server";

import { buildN8nRuntimeConfig } from "../config.js";
import { GlobiGuardApi } from "../credentials/GlobiGuardApi.credentials.js";
import { GlobiGuard } from "../nodes/GlobiGuard/GlobiGuard.node.js";
import type { IExecuteFunctions } from "n8n-workflow";

describe("n8n node skeleton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exports a loadable credential and node description", () => {
    const credential = new GlobiGuardApi();
    const node = new GlobiGuard();

    expect(credential.name).toBe("globiGuardApi");
    expect(node.description.name).toBe("globiGuard");
    expect(node.description.icon).toBe("file:globiguard.svg");
    expect(node.description.defaults).toMatchObject({ color: "#10B981" });
    expect(node.description.credentials).toEqual([
      { name: "globiGuardApi", required: true }
    ]);
    expect(
      node.description.properties
        .find((property) => property.name === "operation")
        ?.options?.map((option) => (option as { value: string }).value)
    ).toEqual([
      "governAction",
      "waitForApproval",
      "exportEvidencePackage",
      "incidentReplayLookup",
      "verifyWebhook",
      "registerInstall"
    ]);
  });

  it("builds runtime config from secret credential values", () => {
    const config = buildN8nRuntimeConfig({
      controlPlaneUrl: "https://control.example.com",
      environment: "sandbox",
      credentialKind: "secret",
      projectId: "proj_123",
      token: "sk_test_123",
      deploymentMode: "hosted",
      issuerMode: "globiguard_issued",
      installReporting: "default",
      brainUrl: ""
    });

    expect(config.bootstrapProfile.environment).toBe("sandbox");
    expect(config.client.credential).toMatchObject({
      kind: "secret",
      projectId: "proj_123",
      token: "sk_test_123",
      environment: "sandbox"
    });
  });

  it("rejects publishable credentials in the n8n node config path", () => {
    expect(() =>
      buildN8nRuntimeConfig({
        controlPlaneUrl: "https://control.example.com",
        environment: "sandbox",
        credentialKind: "publishable",
        deploymentMode: "hosted",
        issuerMode: "globiguard_issued",
        installReporting: "default"
      })
    ).toThrowError(/secret or local credential kind/);
  });

  it("registers the install once per node run even with multiple input items", async () => {
    const fetchMock = vi.fn(async (input: URL | string) => {
      const url = String(input);

      if (url.includes("/heartbeats")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            "content-type": "application/json"
          }),
          async json() {
            return { heartbeatId: "hb_123" };
          }
        };
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "application/json"
        }),
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

    const result = await node.execute.call(
      context as unknown as IExecuteFunctions
    );

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


  it("authorizes a governed action checkpoint before downstream n8n actions", async () => {
    const fetchMock = vi.fn(async (input: URL | string, init?: RequestInit) => {
      expect(String(input)).toBe("https://control.example.com/v1/actions/authorize");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(
        JSON.stringify({
          context: {
            actionType: "email.send",
            destination: {
              type: "email",
              name: "customer-email"
            },
            dataClasses: ["PII"],
            payloadSummary: {
              approxBytes: 51,
              topLevelKeys: ["body", "recipient"],
              topLevelValueKinds: {
                body: "string",
                recipient: "string"
              }
            },
            idempotencyKey: "email-123",
            purpose: "Customer notice",
            metadata: {
              integrationKind: "n8n",
              nodeName: "globiGuard",
              itemIndex: 0
            }
          }
        })
      );

      return new Response(
        JSON.stringify({
          contractVersion: "2026-04-action-beta",
          authorizationId: "auth_123",
          decision: "ALLOW",
          approvalState: "NOT_REQUIRED",
          evidenceRefs: [
            {
              id: "ev_123",
              uri: "evidence://auth_123/audit_123",
              kind: "audit_event"
            }
          ]
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      );
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
      getInputData: () => [
        {
          json: {
            recipient: "customer@example.com",
            body: "hello"
          }
        }
      ],
      getNode: () => ({ name: "globiGuard" }),
      getNodeParameter: (
        name: string,
        _itemIndex: number,
        defaultValue?: unknown
      ) => {
        const values: Record<string, unknown> = {
          operation: "governAction",
          actionType: "email.send",
          destinationType: "email",
          destinationName: "customer-email",
          dataClasses: ["PII"],
          purpose: "Customer notice",
          idempotencyKey: "email-123",
          enforcementMode: "stop_until_allowed"
        };

        return values[name] ?? defaultValue;
      }
    };

    const result = await node.execute.call(
      context as unknown as IExecuteFunctions
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result[0][0]).toMatchObject({
      json: {
        recipient: "customer@example.com",
        body: "hello",
        globiguard: {
          authorizationId: "auth_123",
          decision: "ALLOW",
          approvalState: "NOT_REQUIRED",
          evidenceRefs: [
            {
              uri: "evidence://auth_123/audit_123"
            }
          ]
        }
      },
      pairedItem: 0
    });
  });

  it("stops queued governed actions before downstream n8n actions by default", async () => {
    const fetchMock = vi.fn(
      async (_input: URL | string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            contractVersion: "2026-04-action-beta",
            authorizationId: "auth_queued",
            decision: "QUEUE",
            approvalState: "PENDING",
            queueEntryId: "queue_123",
            evidenceRefs: []
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        )
    );

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
      getInputData: () => [{ json: { ticketId: "ticket_123" } }],
      getNode: () => ({ name: "globiGuard" }),
      getNodeParameter: (
        name: string,
        _itemIndex: number,
        defaultValue?: unknown
      ) => {
        const values: Record<string, unknown> = {
          operation: "governAction",
          actionType: "ticket.create",
          destinationType: "ticketing",
          destinationName: "zendesk",
          dataClasses: ["CONFIDENTIAL"],
          enforcementMode: "stop_until_allowed"
        };

        return values[name] ?? defaultValue;
      }
    };

    await expect(
      node.execute.call(context as unknown as IExecuteFunctions)
    ).rejects.toThrowError(/QUEUE decision/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("routes annotate-only blocked decisions to the blocked output branch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_input: URL | string, _init?: RequestInit) =>
          new Response(
            JSON.stringify({
              contractVersion: "2026-04-action-beta",
              authorizationId: "auth_blocked",
              decision: "BLOCK",
              approvalState: "NOT_REQUIRED",
              evidenceRefs: [],
              reason: "Policy blocked"
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            }
          )
      )
    );

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
      getInputData: () => [{ json: { ticketId: "ticket_123" } }],
      getNode: () => ({ name: "globiGuard" }),
      getNodeParameter: (
        name: string,
        _itemIndex: number,
        defaultValue?: unknown
      ) => {
        const values: Record<string, unknown> = {
          operation: "governAction",
          actionType: "ticket.create",
          destinationType: "ticketing",
          destinationName: "zendesk",
          dataClasses: ["CONFIDENTIAL"],
          enforcementMode: "annotate"
        };

        return values[name] ?? defaultValue;
      }
    };

    const result = await node.execute.call(
      context as unknown as IExecuteFunctions
    );

    expect(result[0]).toEqual([]);
    expect(result[2][0]?.json.globiguard).toMatchObject({
      authorizationId: "auth_blocked",
      decision: "BLOCK",
      reason: "Policy blocked"
    });
  });

  it("waits for approval through the SDK queue helper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_input: URL | string, _init?: RequestInit) =>
          new Response(
            JSON.stringify({
              id: "queue_123",
              orgId: "org_123",
              workflowRunId: "run_123",
              workflowStepId: "step_123",
              actionType: "email.send",
              destinationSystem: "email",
              riskScore: 0.9,
              policyId: "pol_123",
              payloadSummary: {},
              fieldsInvolved: ["PII"],
              status: "APPROVED",
              authorizationId: "auth_123",
              correlationId: "4bf92f3577b34da6a3ce929d0e0e4736",
              evidencePackageId: "evpkg_123",
              createdAt: "2026-05-17T20:00:00.000Z"
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            }
          )
      )
    );

    const node = new GlobiGuard();
    const context = baseContext({
      operation: "waitForApproval",
      queueEntryId: "queue_123",
      maxAttempts: 1,
      intervalMs: 1
    });

    const result = await node.execute.call(
      context as unknown as IExecuteFunctions
    );

    expect(result[0][0]?.json.globiguard).toMatchObject({
      queueEntryId: "queue_123",
      status: "APPROVED",
      authorizationId: "auth_123",
      evidencePackageId: "evpkg_123"
    });
  });

  it("verifies GlobiGuard webhooks with the credential signing secret", async () => {
    const timestamp = new Date().toISOString();
    const rawBody = JSON.stringify({
      contractVersion: "2026-05-trust-webhook-beta",
      id: "whdel_123",
      timestamp,
      type: "approval.approved",
      apiFamily: "webhooks.v1",
      data: { approvalId: "approval_123" }
    });
    const signature = await signWebhook("whsec_123", rawBody, timestamp);
    const node = new GlobiGuard();
    const context = baseContext(
      {
        operation: "verifyWebhook",
        webhookRawBody: rawBody,
        webhookDeliveryId: "whdel_123",
        webhookTimestamp: timestamp,
        webhookEventType: "approval.approved",
        webhookSignature: `v1=${signature}`,
        webhookToleranceSeconds: 300
      },
      {
        webhookSigningSecret: "whsec_123"
      }
    );

    const result = await node.execute.call(
      context as unknown as IExecuteFunctions
    );

    expect(result[0][0]?.json.globiguard).toMatchObject({
      webhookVerified: true,
      deliveryId: "whdel_123",
      eventType: "approval.approved"
    });
  });

});

function baseContext(
  parameters: Record<string, unknown>,
  credentialOverrides: Record<string, unknown> = {}
) {
  return {
    continueOnFail: () => false,
    getCredentials: async () => ({
      controlPlaneUrl: "https://control.example.com",
      environment: "sandbox",
      credentialKind: "secret",
      projectId: "proj_123",
      token: "sk_test_123",
      deploymentMode: "hosted",
      issuerMode: "globiguard_issued",
      installReporting: "default",
      ...credentialOverrides
    }),
    getInputData: () => [{ json: { id: "item_123" } }],
    getNode: () => ({ name: "globiGuard" }),
    getNodeParameter: (
      name: string,
      _itemIndex: number,
      defaultValue?: unknown
    ) => parameters[name] ?? defaultValue
  };
}

async function signWebhook(
  secret: string,
  rawBody: string,
  timestamp: string
): Promise<string> {
  const payload = buildSignedWebhookPayload(
    {
      deliveryId: "whdel_123",
      timestamp,
      eventType: "approval.approved",
      signature: ""
    },
    rawBody
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );

  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
