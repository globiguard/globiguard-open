import { describe, expect, it, vi } from "vitest";

import type {
  GlobiguardActionAuthorizationResponse,
  GlobiguardActionsClient
} from "@globiguard/contracts";

import { createAiIntercept } from "../ai-intercept.js";
import type {
  GlobiguardDetectionClient,
  GlobiguardDetectionEvaluateResponse
} from "../resources/detection.js";

function decision(
  value: GlobiguardActionAuthorizationResponse["decision"],
  extras: Partial<GlobiguardActionAuthorizationResponse> = {}
): GlobiguardActionAuthorizationResponse {
  return {
    contractVersion: "2026-04-action-beta",
    authorizationId: `authz_${value.toLowerCase()}`,
    decision: value,
    executable: value === "ALLOW",
    nextAction:
      value === "ALLOW"
        ? "EXECUTE_EXACT_ACTION_ONCE"
        : value === "MODIFY"
          ? "APPLY_MODIFICATIONS_AND_REAUTHORIZE"
          : value === "QUEUE"
            ? "WAIT_FOR_APPROVAL"
            : "STOP",
    approvalState: value === "QUEUE" ? "PENDING" : "NOT_REQUIRED",
    evidenceRefs: [],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...extras
  };
}

function detection(
  value: GlobiguardDetectionEvaluateResponse["decision"] = "ALLOW",
  fields: GlobiguardDetectionEvaluateResponse["masked_fields"] = []
): GlobiguardDetectionEvaluateResponse {
  return {
    brain_contract_version: "1.0",
    trace_id: `trace-${value.toLowerCase()}`,
    decision: value,
    masked_fields: fields,
    blocked_fields: [],
    inference: {
      status: "complete",
      policy_authority: "control_plane",
      route: "sensitive_information",
      specialists: [
        {
          role: "sensitive_contextual_span",
          status: "complete",
          confidence_band: "high",
          finding_count: fields.length
        }
      ],
      deterministic_layers: ["regex"],
      total_latency_ms: 2,
      provenance_digest: "c".repeat(64)
    }
  };
}

function actions(authorize: ReturnType<typeof vi.fn>): GlobiguardActionsClient {
  return { authorize } as unknown as GlobiguardActionsClient;
}

function detector(evaluate: ReturnType<typeof vi.fn>): GlobiguardDetectionClient {
  return { evaluate } as unknown as GlobiguardDetectionClient;
}

describe("AI intercept authority boundary", () => {
  it.each(["BLOCK", "QUEUE", "MODIFY"] as const)(
    "does not call a provider after a %s input detection decision",
    async (outcome) => {
      const call = vi.fn(async () => "provider response");
      const authorize = vi.fn(async () => decision("ALLOW"));
      const onBlock = vi.fn();
      const intercept = createAiIntercept(
        {
          actions: actions(authorize),
          detection: detector(vi.fn(async () => detection(outcome)))
        },
        { mode: "scan_input", onBlock }
      );

      await expect(intercept.wrap("sensitive input", call)).rejects.toThrow(
        "AI input was not released"
      );
      expect(call).not.toHaveBeenCalled();
      expect(authorize).not.toHaveBeenCalled();
      expect(onBlock).toHaveBeenCalledTimes(outcome === "BLOCK" ? 1 : 0);
    }
  );

  it.each(["BLOCK", "QUEUE", "MODIFY"] as const)(
    "does not release a provider response after a %s action decision",
    async (outcome) => {
      const authorize = vi
        .fn()
        .mockResolvedValueOnce(decision("ALLOW"))
        .mockResolvedValueOnce(decision(outcome));
      const evaluate = vi
        .fn()
        .mockResolvedValueOnce(detection("ALLOW"))
        .mockResolvedValueOnce(
          detection("ALLOW", [
            {
              field_type: "PHI",
              confidence: 0.99,
              method: "GLINER",
              sensitivity_tier: "RESTRICTED"
            }
          ])
        );
      const call = vi.fn(async () => ({ content: "patient diagnosis" }));
      const onBlock = vi.fn();
      const intercept = createAiIntercept(
        { actions: actions(authorize), detection: detector(evaluate) },
        { mode: "scan_both", onBlock }
      );

      await expect(intercept.wrap("draft", call)).rejects.toThrow(
        "AI output was not released"
      );
      expect(call).toHaveBeenCalledOnce();
      expect(onBlock).toHaveBeenCalledTimes(outcome === "BLOCK" ? 1 : 0);
    }
  );

  it("does not release an ALLOW with unresolved obligations", async () => {
    const intercept = createAiIntercept(
      {
        actions: actions(
          vi.fn(async () => decision("ALLOW", { obligations: ["mask recipient"] }))
        ),
        detection: detector(vi.fn(async () => detection("ALLOW")))
      },
      { mode: "scan_input" }
    );
    const call = vi.fn(async () => "provider response");

    await expect(intercept.wrap("draft", call)).rejects.toMatchObject({
      kind: "STEP_UP_REQUIRED"
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("forwards only privacy-minimized detection evidence to action authority", async () => {
    const authorize = vi.fn(async (_request: unknown) => decision("ALLOW"));
    const evaluate = vi.fn(async () => ({
      ...detection("ALLOW", [
        {
          field_type: "EMAIL_ADDRESS",
          token: "[[EMAIL_1]]",
          confidence: 0.99,
          method: "REGEX",
          sensitivity_tier: "RESTRICTED",
          value: "patient@example.com"
        },
        {
          field_type: "patient@example.com",
          token: "sk_live_do_not_export",
          confidence: 0.8,
          method: "GLINER",
          sensitivity_tier: "BLOCKED"
        }
      ]),
      unexpected_payload: "must-not-cross-authority-boundary"
    }));
    const intercept = createAiIntercept(
      { actions: actions(authorize), detection: detector(evaluate) },
      { mode: "scan_input" }
    );

    const result = await intercept.wrap(
      "patient@example.com",
      vi.fn(async () => "ok")
    );

    const serialized = JSON.stringify(authorize.mock.calls[0]?.[0]);
    expect(serialized).not.toContain("patient@example.com");
    expect(serialized).not.toContain("sk_live_do_not_export");
    expect(serialized).not.toContain("must-not-cross-authority-boundary");
    expect(authorize.mock.calls[0]?.[0]).toMatchObject({
      context: {
        dataClasses: ["RESTRICTED", "SECRET"],
        fieldsInvolved: ["EMAIL_ADDRESS"],
        metadata: {
          detectionSource: "control_plane",
          brainContractVersion: "1.0",
          inferenceStatus: "complete",
          detectedFieldCount: 2
        }
      }
    });
    expect(JSON.stringify(result.inputEntities)).not.toContain("patient@example.com");
    expect(JSON.stringify(result.inputEntities)).not.toContain("sk_live_do_not_export");
  });

  it("fails construction without the authenticated detection client", () => {
    expect(() =>
      createAiIntercept({ actions: actions(vi.fn()) } as never, {
        mode: "scan_input"
      })
    ).toThrow("Control Plane detection client");
  });
});
