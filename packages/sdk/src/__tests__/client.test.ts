import { describe, expect, it, vi } from "vitest";

import type { GlobiguardAuditEvidencePackageArtifact } from "@globiguard/contracts";

import { createBrowserClient, createServerClient } from "../client.js";
import { GlobiguardConfigError } from "../errors.js";

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

describe("@globiguard/sdk", () => {
  it("creates a browser-safe client with read-only management surfaces", () => {
    const client = createBrowserClient({
      environment: "sandbox",
      credential: {
        kind: "publishable",
        projectId: "proj_123",
        token: "pk_test_123"
      },
      services: {
        controlPlane: "https://control.example.com"
      },
      fetch: vi.fn()
    });

    expect(client.kind).toBe("browser");
    expect(client.audit).toBeDefined();
    expect(client.installs).toBeDefined();
    expect(client.policies).toBeDefined();
    expect(client.queue).toBeDefined();
    expect(client.workflows).toBeDefined();
    expect("create" in client.policies).toBe(false);
    expect("decide" in client.queue).toBe(false);
    expect("create" in client.workflows).toBe(false);
    expect("orgs" in client).toBe(false);
    expect("controlPlane" in client).toBe(false);
    expect("brain" in client).toBe(false);
    expect("governedActions" in client).toBe(false);
  });

  it("does not expose raw browser transport access", () => {
    const client = createBrowserClient({
      environment: "sandbox",
      credential: {
        kind: "publishable",
        projectId: "proj_123",
        token: "pk_test_123"
      },
      services: {
        controlPlane: "https://control.example.com"
      },
      fetch: vi.fn()
    });

    expect("controlPlane" in client).toBe(false);
  });

  it("rejects invalid browser credential and local-host combinations", () => {
    expect(() =>
      createBrowserClient({
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
      } as never)
    ).toThrow(GlobiguardConfigError);

    expect(() =>
      createBrowserClient({
        environment: "sandbox",
        credential: {
          kind: "publishable"
        },
        services: {
          controlPlane: "https://control.example.com"
        },
        fetch: vi.fn()
      } as never)
    ).toThrow(GlobiguardConfigError);

    expect(() =>
      createBrowserClient({
        environment: "sandbox",
        credential: {
          kind: "bogus"
        },
        services: {
          controlPlane: "https://control.example.com"
        },
        fetch: vi.fn()
      } as never)
    ).toThrow(GlobiguardConfigError);

    expect(() =>
      createBrowserClient({
        environment: "sandbox",
        credential: {
          kind: "local"
        },
        services: {
          controlPlane: "https://control.example.com"
        },
        fetch: vi.fn()
      })
    ).toThrow(GlobiguardConfigError);

    expect(() =>
      createBrowserClient({
        environment: "local",
        credential: {
          kind: "local"
        },
        services: {
          controlPlane: "https://control.example.com"
        },
        fetch: vi.fn()
      })
    ).toThrow(GlobiguardConfigError);
  });

  it("uses the control plane for install registration from the browser-safe client", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://control.example.com/v1/installs");

      const headers = new Headers(init?.headers);
      expect(headers.get("x-globiguard-publishable-key")).toBe("pk_test_123");
      expect(headers.get("x-globiguard-client")).toBe("@globiguard/sdk");
      expect(headers.get("x-globiguard-environment")).toBe("sandbox");

      return createJsonResponse({ installId: "ins_123" });
    });

    const client = createBrowserClient({
      environment: "sandbox",
      credential: {
        kind: "publishable",
        projectId: "proj_123",
        token: "pk_test_123"
      },
      services: {
        controlPlane: "https://control.example.com"
      },
      fetch: fetchImpl
    });

    const response = await client.installs.register({
      packageName: "@globiguard/react",
      packageVersion: "0.1.0",
      integrationKind: "react",
      runtimeKind: "browser",
      environment: "sandbox",
      deploymentMode: "hosted",
      issuerMode: "globiguard_issued",
      installReporting: "default"
    });

    expect(response).toEqual({ installId: "ins_123" });
  });

  it("lists and fetches audit events from browser-safe control-plane routes", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/v1/audit/audit_123")) {
        return createJsonResponse({
          id: "audit_123",
          orgId: "org_123",
          agentIdHash: "sha256:abc",
          actionType: "send",
          destinationSystem: "salesforce",
          decision: "QUEUE",
          governanceScore: 0.82,
          maskedFieldCount: 1,
          maskedFieldTypes: ["SSN"],
          blockedFieldCount: 0,
          frameworkTags: ["soc2"],
          controlRefs: ["CC6.1"],
          evidenceRefs: ["evidence://pkg_123"],
          timestamp: "2026-04-01T12:00:00.000Z",
          maskedFields: [],
          _scoreDisclaimer:
            "This score reflects data governance policy compliance, not actuarial or financial risk."
        });
      }

      expect(url).toBe(
        "https://control.example.com/v1/audit?decision=QUEUE&workflow=run_123&page=2&limit=25"
      );

      return createJsonResponse({
        items: [
          {
            id: "audit_123",
            orgId: "org_123",
            agentIdHash: "sha256:abc",
            actionType: "send",
            destinationSystem: "salesforce",
            decision: "QUEUE",
            governanceScore: 0.82,
            maskedFieldCount: 1,
            maskedFieldTypes: ["SSN"],
            blockedFieldCount: 0,
            frameworkTags: ["soc2"],
            controlRefs: ["CC6.1"],
            evidenceRefs: ["evidence://pkg_123"],
            timestamp: "2026-04-01T12:00:00.000Z",
            maskedFields: [],
            _scoreDisclaimer:
              "This score reflects data governance policy compliance, not actuarial or financial risk."
          }
        ],
        total: 1,
        page: 2,
        pages: 1
      });
    });

    const client = createBrowserClient({
      environment: "sandbox",
      credential: {
        kind: "publishable",
        projectId: "proj_123",
        token: "pk_test_123"
      },
      services: {
        controlPlane: "https://control.example.com"
      },
      fetch: fetchImpl
    });

    const list = await client.audit.list({
      decision: "QUEUE",
      workflowRunId: "run_123",
      page: 2,
      limit: 25
    });
    const event = await client.audit.get("audit_123");

    expect(list.items[0]?.id).toBe("audit_123");
    expect(event.decision).toBe("QUEUE");
  });

  it("lists policies from the control plane in browser-safe mode", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        "https://control.example.com/v1/policies?industry=INSURANCE&active=true"
      );
      expect(init?.method ?? "GET").toBe("GET");

      return createJsonResponse([
        {
          id: "pol_123",
          orgId: "org_123",
          name: "Insurance baseline",
          industry: "INSURANCE",
          version: 2,
          active: true,
          templateId: null,
          createdAt: "2026-04-01T12:00:00.000Z",
          updatedAt: "2026-04-02T12:00:00.000Z",
          rules: []
        }
      ]);
    });

    const client = createBrowserClient({
      environment: "sandbox",
      credential: {
        kind: "publishable",
        projectId: "proj_123",
        token: "pk_test_123"
      },
      services: {
        controlPlane: "https://control.example.com"
      },
      fetch: fetchImpl
    });

    const response = await client.policies.list({
      industry: "INSURANCE",
      active: true
    });

    expect(response[0]?.id).toBe("pol_123");
  });

  it("requires an explicit active filter for policy and workflow lists", () => {
    const client = createBrowserClient({
      environment: "sandbox",
      credential: {
        kind: "publishable",
        projectId: "proj_123",
        token: "pk_test_123"
      },
      services: {
        controlPlane: "https://control.example.com"
      },
      fetch: vi.fn()
    });

    expect(() =>
      client.policies.list({ industry: "INSURANCE" } as never)
    ).toThrow(GlobiguardConfigError);
    expect(() => client.workflows.list({} as never)).toThrow(GlobiguardConfigError);
  });

  it("lists and reads queue items through browser-safe control-plane routes", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/v1/queue/queue_123")) {
        return createJsonResponse({
          id: "queue_123",
          orgId: "org_123",
          workflowRunId: "run_123",
          workflowStepId: "step_123",
          actionType: "send",
          destinationSystem: "salesforce",
          riskScore: 0.82,
          policyId: "pol_123",
          payloadSummary: { kind: "crm-sync" },
          fieldsInvolved: ["SSN"],
          status: "PENDING",
          createdAt: "2026-04-01T12:00:00.000Z",
          resolvedAt: null
        });
      }

      return createJsonResponse([
        {
          id: "queue_123",
          orgId: "org_123",
          workflowRunId: "run_123",
          workflowStepId: "step_123",
          actionType: "send",
          destinationSystem: "salesforce",
          riskScore: 0.82,
          policyId: "pol_123",
          payloadSummary: { kind: "crm-sync" },
          fieldsInvolved: ["SSN"],
          status: "PENDING",
          createdAt: "2026-04-01T12:00:00.000Z",
          resolvedAt: null
        }
      ]);
    });

    const client = createBrowserClient({
      environment: "sandbox",
      credential: {
        kind: "publishable",
        projectId: "proj_123",
        token: "pk_test_123"
      },
      services: {
        controlPlane: "https://control.example.com"
      },
      fetch: fetchImpl
    });

    const items = await client.queue.list({ status: "PENDING" });
    const item = await client.queue.get("queue_123");

    expect(items[0]?.status).toBe("PENDING");
    expect(item.destinationSystem).toBe("salesforce");
  });

  it("lists and fetches workflows from browser-safe control-plane routes", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/v1/workflows/wf_123")) {
        return createJsonResponse({
          id: "wf_123",
          orgId: "org_123",
          name: "Claims review",
          description: "Handle inbound claim data",
          triggerType: "MANUAL",
          triggerConfig: {},
          active: true,
          industry: "INSURANCE",
          templateId: null,
          createdAt: "2026-04-01T12:00:00.000Z",
          updatedAt: "2026-04-01T12:00:00.000Z",
          steps: [
            {
              id: "step_123",
              workflowId: "wf_123",
              order: 0,
              name: "Review payload",
              stepType: "REQUIRE_APPROVAL",
              config: {},
              nextStepId: null,
              onApproveStepId: null,
              onRejectStepId: null,
              condition: null
            }
          ]
        });
      }

      expect(url).toBe("https://control.example.com/v1/workflows?active=true");
      return createJsonResponse([
        {
          id: "wf_123",
          orgId: "org_123",
          name: "Claims review",
          description: "Handle inbound claim data",
          triggerType: "MANUAL",
          triggerConfig: {},
          active: true,
          industry: "INSURANCE",
          templateId: null,
          createdAt: "2026-04-01T12:00:00.000Z",
          updatedAt: "2026-04-01T12:00:00.000Z",
          steps: []
        }
      ]);
    });

    const client = createBrowserClient({
      environment: "sandbox",
      credential: {
        kind: "publishable",
        projectId: "proj_123",
        token: "pk_test_123"
      },
      services: {
        controlPlane: "https://control.example.com"
      },
      fetch: fetchImpl
    });

    const items = await client.workflows.list({ active: true });
    const workflow = await client.workflows.get("wf_123");

    expect(items[0]?.id).toBe("wf_123");
    expect(workflow.steps[0]?.stepType).toBe("REQUIRE_APPROVAL");
  });

  it("posts queue approvals through the canonical server route", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://control.example.com/v1/queue/queue_123/approve");
      expect(init?.method).toBe("POST");

      const headers = new Headers(init?.headers);
      expect(headers.get("x-globiguard-secret-key")).toBe("sk_test_123");
      expect(headers.get("content-type")).toBe("application/json");
      expect(init?.body).toBe(
        JSON.stringify({
          reviewedBy: "operator@example.com",
          notes: "Approved by operator"
        })
      );

      return createJsonResponse({
        id: "queue_123",
        decision: "APPROVED",
        status: "APPROVED"
      });
    });

    const client = createServerClient({
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
      fetch: fetchImpl
    });

    const response = await client.queue.decide("queue_123", {
      action: "approve",
      reviewedBy: "operator@example.com",
      notes: "Approved by operator"
    });

    expect(response.status).toBe("APPROVED");
  });

  it("creates workflow and policy resources from the server client", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/v1/workflows")) {
        expect(init?.method).toBe("POST");
        return createJsonResponse({
          id: "wf_123",
          orgId: "org_123",
          name: "Claims review",
          description: null,
          triggerType: "MANUAL",
          triggerConfig: {},
          active: false,
          industry: "INSURANCE",
          templateId: null,
          createdAt: "2026-04-01T12:00:00.000Z",
          updatedAt: "2026-04-01T12:00:00.000Z",
          steps: []
        });
      }

      expect(url).toBe("https://control.example.com/v1/policies");
      expect(init?.method).toBe("POST");
      return createJsonResponse({
        id: "pol_123",
        orgId: "org_123",
        name: "Insurance baseline",
        industry: "INSURANCE",
        version: 1,
        active: false,
        templateId: null,
        createdAt: "2026-04-01T12:00:00.000Z",
        updatedAt: "2026-04-01T12:00:00.000Z",
        rules: []
      });
    });

    const client = createServerClient({
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
      fetch: fetchImpl
    });

    const workflow = await client.workflows.create({
      name: "Claims review",
      triggerType: "MANUAL",
      industry: "INSURANCE"
    });
    const policy = await client.policies.create({
      name: "Insurance baseline",
      industry: "INSURANCE"
    });

    expect(workflow.id).toBe("wf_123");
    expect(policy.id).toBe("pol_123");
  });

  it("runs workflows and lists workflow runs from the server client", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/v1/workflows/wf_123/run")) {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(JSON.stringify({ claimId: "claim_123" }));

        return createJsonResponse({
          id: "run_123",
          workflowId: "wf_123",
          orgId: "org_123",
          status: "RUNNING",
          triggerData: {
            sha256: "abc123",
            approxBytes: 24,
            topLevelKeys: ["claimId"],
            topLevelValueKinds: {
              claimId: "string"
            }
          },
          startedAt: "2026-04-01T12:00:00.000Z"
        });
      }

      expect(url).toBe("https://control.example.com/v1/workflows/wf_123/runs");
      return createJsonResponse([
        {
          id: "run_123",
          workflowId: "wf_123",
          orgId: "org_123",
          status: "RUNNING",
          triggerData: {
            sha256: "abc123",
            approxBytes: 24,
            topLevelKeys: ["claimId"],
            topLevelValueKinds: {
              claimId: "string"
            }
          },
          startedAt: "2026-04-01T12:00:00.000Z",
          steps: []
        }
      ]);
    });

    const client = createServerClient({
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
      fetch: fetchImpl
    });

    const run = await client.workflows.run("wf_123", {
      claimId: "claim_123"
    });
    const runs = await client.workflows.listRuns("wf_123");

    expect(run.status).toBe("RUNNING");
    expect(run.triggerData.topLevelKeys).toEqual(["claimId"]);
    expect(runs[0]?.workflowId).toBe("wf_123");
  });

  it("creates and revokes org API keys from the server client", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/v1/orgs/org_123/api-keys") && init?.method === "POST") {
        return createJsonResponse({
          key: "gg_ad_123",
          prefix: "gg_ad_123",
          scope: "ADMIN",
          label: "Primary admin key"
        });
      }

      if (
        url.endsWith("/v1/orgs/org_123/api-keys/key_123") &&
        init?.method === "DELETE"
      ) {
        return new Response(null, { status: 204 });
      }

      return createJsonResponse([
        {
          id: "key_123",
          keyPrefix: "gg_ad_123",
          label: "Primary admin key",
          scope: "ADMIN",
          active: true,
          lastUsedAt: null,
          expiresAt: null,
          createdAt: "2026-04-01T12:00:00.000Z"
        }
      ]);
    });

    const client = createServerClient({
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
      fetch: fetchImpl
    });

    const created = await client.orgs.createApiKey("org_123", {
      label: "Primary admin key",
      scope: "ADMIN"
    });
    const keys = await client.orgs.listApiKeys("org_123");
    const revoked = await client.orgs.revokeApiKey("org_123", "key_123");

    expect(created.scope).toBe("ADMIN");
    expect(keys[0]?.id).toBe("key_123");
    expect(revoked).toBeUndefined();
  });

  it("exports audit evidence from the trusted server client", async () => {
    const artifact = {
      artifactId: "GG-EVIDENCE-SOC2-20260401120000",
      frameworkId: "soc2",
      generatedAt: "2026-04-01T12:00:00.000Z",
      scopeStatement:
        "GlobiGuard evidence package for soc2 composed from governed audit events and human review history visible at export time.",
      requestedScope: {
        from: null,
        to: null,
        workflowRunId: "run_123",
        frameworkId: "soc2",
        snapshotAt: "2026-04-01T11:59:59.000Z"
      },
      workflowRunReferences: ["run_123"],
      policyVersions: ["policy-v2"],
      modelVersionReferences: ["model_2026_04"],
      connectorManifestVersions: ["salesforce@1.4.0"],
      evidenceReferences: ["evidence://pkg_123"],
      provenanceReferences: ["audit-event:audit_123", "workflow-run:run_123"],
      controlMappings: [
        {
          controlRef: "CC6.1",
          auditEventCount: 1,
          evidenceRefs: ["evidence://pkg_123"],
          provenanceRefs: ["audit-event:audit_123"]
        }
      ],
      humanReviewHistory: [
        {
          id: "queue_123",
          status: "APPROVED",
          reviewedBy: "operator@example.com",
          resolvedAt: "2026-04-01T12:00:00.000Z",
          createdAt: "2026-04-01T11:58:00.000Z",
          workflowRunId: "run_123",
          workflowStepId: "step_123"
        }
      ],
      summary: {
        auditEventCount: 1,
        queuedReviewCount: 1,
        decisionCounts: {
          ALLOW: 1
        },
        fieldTypes: ["phi"],
        frameworkTags: ["soc2"],
        connectorInstanceIds: ["conn_123"],
        firstEventAt: "2026-04-01T11:57:00.000Z",
        lastEventAt: "2026-04-01T11:57:00.000Z"
      },
      disclaimers: [
        "This export contains governance metadata, evidence references, and human review history only.",
        "Raw customer payloads are excluded from coordination-plane evidence artifacts.",
        "The package covers audit events matched within the requested scope up to the recorded snapshot timestamp."
      ]
    } satisfies GlobiguardAuditEvidencePackageArtifact;

    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://control.example.com/v1/audit/export");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(
        JSON.stringify({
          workflowRunId: "run_123",
          frameworkId: "soc2",
          format: "JSON"
        })
      );

      return createJsonResponse({
        status: "ready",
        artifact_export_id: "art_123",
        evidence_package_id: "pkg_123",
        format: "json",
        checksum: "sha256:abc",
        artifact_json: JSON.stringify(artifact),
        artifact
      });
    });

    const client = createServerClient({
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
      fetch: fetchImpl
    });

    const response = await client.audit.export({
      workflowRunId: "run_123",
      frameworkId: "soc2",
      format: "JSON"
    });

    expect(response.status).toBe("ready");
    expect(response.artifactExportId).toBe("art_123");
    expect(response.artifact.frameworkId).toBe("soc2");
    expect(response.artifact.requestedScope.workflowRunId).toBe("run_123");
    expect(response.artifact.controlMappings[0]?.controlRef).toBe("CC6.1");
    expect(response.artifact.summary.decisionCounts.ALLOW).toBe(1);
  });

  it("encodes dynamic resource identifiers before building control-plane paths", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }

      if (url.includes("/approve")) {
        return createJsonResponse({
          id: "queue_123",
          decision: "APPROVED",
          status: "APPROVED"
        });
      }

      if (url.endsWith("/runs")) {
        return createJsonResponse([]);
      }

      return createJsonResponse({
        id: "ok"
      });
    });

    const client = createServerClient({
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
      fetch: fetchImpl
    });

    await client.queue.get("../queue?x=1#frag");
    await client.queue.decide("../queue?x=1#frag", {
      action: "approve"
    });
    await client.workflows.get("../workflow?x=1#frag");
    await client.workflows.listRuns("../workflow?x=1#frag");
    await client.policies.get("../policy?x=1#frag");
    await client.policies.createFromTemplate("../template?x=1#frag");
    await client.policies.remove("../policy?x=1#frag");
    await client.orgs.get("../org?x=1#frag");
    await client.orgs.revokeApiKey("../org?x=1#frag", "../key?x=1#frag");

    expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual([
      "https://control.example.com/v1/queue/..%2Fqueue%3Fx%3D1%23frag",
      "https://control.example.com/v1/queue/..%2Fqueue%3Fx%3D1%23frag/approve",
      "https://control.example.com/v1/workflows/..%2Fworkflow%3Fx%3D1%23frag",
      "https://control.example.com/v1/workflows/..%2Fworkflow%3Fx%3D1%23frag/runs",
      "https://control.example.com/v1/policies/..%2Fpolicy%3Fx%3D1%23frag",
      "https://control.example.com/v1/policies/from-template/..%2Ftemplate%3Fx%3D1%23frag",
      "https://control.example.com/v1/policies/..%2Fpolicy%3Fx%3D1%23frag",
      "https://control.example.com/v1/orgs/..%2Forg%3Fx%3D1%23frag",
      "https://control.example.com/v1/orgs/..%2Forg%3Fx%3D1%23frag/api-keys/..%2Fkey%3Fx%3D1%23frag"
    ]);
  });

  it("sends secret-backed requests to a trusted brain endpoint from the server client", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://brain.example.com/v1/jobs");

      const headers = new Headers(init?.headers);
      expect(headers.get("x-globiguard-secret-key")).toBe("sk_test_123");
      expect(headers.get("x-globiguard-project-id")).toBe("proj_123");
      expect(headers.get("x-globiguard-environment")).toBe("sandbox");

      return createJsonResponse({ accepted: true });
    });

    const client = createServerClient({
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
      fetch: fetchImpl
    });

    const response = await client.brain?.request<{ accepted: boolean }>("/v1/jobs", {
      method: "POST",
      body: {
        kind: "scan-document"
      }
    });

    expect(response).toEqual({ accepted: true });
  });



  it("keeps browser action APIs read-only while exposing approval and evidence status", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method ?? "GET").toBe("GET");

      const url = String(input);
      if (url.endsWith("/v1/actions/approvals/app_123")) {
        return createJsonResponse({
          id: "app_123",
          authorizationId: "auth_123",
          queueEntryId: "queue_123",
          state: "PENDING",
          requestedBy: "agent@example.com",
          reviewedBy: null,
          reviewNotes: null,
          createdAt: "2026-04-01T12:00:00.000Z",
          updatedAt: null,
          resolvedAt: null,
          expiresAt: null
        });
      }

      expect(url).toBe(
        "https://control.example.com/v1/actions/evidence?authorizationId=auth_123"
      );
      return createJsonResponse([
        {
          id: "ev_123",
          uri: "evidence://auth_123/audit_123",
          label: "Governed action audit event",
          kind: "audit_event",
          createdAt: "2026-04-01T12:00:00.000Z"
        }
      ]);
    });

    const client = createBrowserClient({
      environment: "sandbox",
      credential: {
        kind: "publishable",
        projectId: "proj_123",
        token: "pk_test_123"
      },
      services: {
        controlPlane: "https://control.example.com"
      },
      fetch: fetchImpl
    });

    expect("authorize" in client.actions).toBe(false);
    expect("createApproval" in client.actions).toBe(false);

    const approval = await client.actions.getApproval("app_123");
    const evidence = await client.actions.listEvidence({
      authorizationId: "auth_123"
    });

    expect(approval.state).toBe("PENDING");
    expect(evidence[0]?.uri).toBe("evidence://auth_123/audit_123");
  });

  it("authorizes governed actions through the trusted server action gateway", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://sidecar.example.com/v1/actions/authorize");
      expect(init?.method).toBe("POST");

      const headers = new Headers(init?.headers);
      expect(headers.get("x-globiguard-secret-key")).toBe("sk_test_123");
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
              topLevelKeys: ["recipient", "body"]
            },
            idempotencyKey: "email-123"
          }
        })
      );

      return createJsonResponse({
        contractVersion: "2026-04-action-beta",
        authorizationId: "auth_123",
        decision: "QUEUE",
        approvalState: "PENDING",
        queueEntryId: "queue_123",
        evidenceRefs: [
          {
            id: "ev_123",
            uri: "evidence://auth_123/audit_123",
            kind: "audit_event"
          }
        ],
        reason: "PII email requires approval."
      });
    });

    const client = createServerClient({
      environment: "sandbox",
      credential: {
        kind: "secret",
        projectId: "proj_123",
        token: "sk_test_123",
        environment: "sandbox"
      },
      services: {
        controlPlane: "https://control.example.com",
        sidecar: "https://sidecar.example.com"
      },
      actionGateway: {
        mode: "sidecar"
      },
      fetch: fetchImpl
    });

    const decision = await client.actions.authorize({
      context: {
        actionType: "email.send",
        destination: {
          type: "email",
          name: "customer-email"
        },
        dataClasses: ["PII"],
        payloadSummary: {
          topLevelKeys: ["recipient", "body"]
        },
        idempotencyKey: "email-123"
      }
    });

    expect(client.actionGateway).toMatchObject({
      mode: "sidecar",
      baseUrl: "https://sidecar.example.com"
    });
    expect(decision.decision).toBe("QUEUE");
    expect(decision.evidenceRefs[0]?.uri).toBe("evidence://auth_123/audit_123");
  });

  it("rejects invalid server credential and service combinations", () => {
    expect(() =>
      createServerClient({
        environment: "sandbox",
        credential: {
          kind: "publishable",
          projectId: "proj_123",
          token: "pk_test_123"
        },
        services: {
          controlPlane: "https://control.example.com",
          brain: "https://brain.example.com"
        },
        fetch: vi.fn()
      } as never)
    ).toThrow(GlobiguardConfigError);

    expect(() =>
      createServerClient({
        environment: "sandbox",
        credential: {
          kind: "secret",
          environment: "sandbox"
        },
        services: {
          controlPlane: "https://control.example.com"
        },
        fetch: vi.fn()
      } as never)
    ).toThrow(GlobiguardConfigError);

    expect(() =>
      createServerClient({
        environment: "sandbox",
        credential: {
          kind: "bogus"
        },
        services: {
          controlPlane: "https://control.example.com"
        },
        fetch: vi.fn()
      } as never)
    ).toThrow(GlobiguardConfigError);

    expect(() =>
      createServerClient({
        environment: "sandbox",
        credential: {
          kind: "secret",
          projectId: "proj_123",
          token: "sk_test_123",
          environment: "sandbox"
        },
        services: {
          controlPlane: "http://control.example.com"
        },
        fetch: vi.fn()
      })
    ).toThrow(GlobiguardConfigError);

    expect(() =>
      createServerClient({
        environment: "sandbox",
        credential: {
          kind: "secret",
          projectId: "proj_123",
          token: "sk_test_123",
          environment: "sandbox"
        },
        services: {
          controlPlane: "https://control.example.com/v1"
        },
        fetch: vi.fn()
      })
    ).toThrow(GlobiguardConfigError);

    expect(() =>
      createServerClient({
        environment: "sandbox",
        credential: {
          kind: "local"
        },
        services: {
          controlPlane: "https://control.example.com"
        },
        fetch: vi.fn()
      })
    ).toThrow(GlobiguardConfigError);

    expect(() =>
      createServerClient({
        environment: "local",
        credential: {
          kind: "local"
        },
        services: {
          controlPlane: "https://control.example.com"
        },
        fetch: vi.fn()
      })
    ).toThrow(GlobiguardConfigError);
  });

  it("passes typed-array bodies through without JSON stringifying them", async () => {
    const payload = new Uint8Array([1, 2, 3]);

    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.body).toBeInstanceOf(ArrayBuffer);
      expect(new Headers(init?.headers).get("content-type")).toBeNull();

      const bytes = new Uint8Array(init?.body as ArrayBuffer);
      expect(Array.from(bytes)).toStrictEqual(Array.from(payload));

      return createJsonResponse({ accepted: true });
    });

    const client = createServerClient({
      environment: "local",
      credential: {
        kind: "local"
      },
      services: {
        controlPlane: "http://127.0.0.1:3000",
        brain: "http://127.0.0.1:4000"
      },
      fetch: fetchImpl
    });

    const response = await client.brain?.request<{ accepted: boolean }>("/v1/files", {
      method: "POST",
      body: payload
    });

    expect(response).toEqual({ accepted: true });
  });

  it("rejects absolute request URLs so credentials stay on the configured origin", async () => {
    const fetchImpl = vi.fn();

    const client = createServerClient({
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
      fetch: fetchImpl
    });

    await expect(
      client.controlPlane.request("https://evil.example/steal", {
        method: "POST",
        body: {
          hello: "world"
        }
      })
    ).rejects.toBeInstanceOf(GlobiguardConfigError);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects path escape tricks before any request is sent", async () => {
    const fetchImpl = vi.fn();

    const client = createServerClient({
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
      fetch: fetchImpl
    });

    await expect(client.controlPlane.request("../admin")).rejects.toBeInstanceOf(
      GlobiguardConfigError
    );
    await expect(client.controlPlane.request("/%2e%2e/admin")).rejects.toBeInstanceOf(
      GlobiguardConfigError
    );
    await expect(
      client.controlPlane.request("/\\evil.example/steal")
    ).rejects.toBeInstanceOf(GlobiguardConfigError);
    await expect(client.controlPlane.request("/%ZZ")).rejects.toBeInstanceOf(
      GlobiguardConfigError
    );

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
