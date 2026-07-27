import { describe, expect, it, vi } from "vitest";

import type {
  GlobiguardActionAuthorizationResponse,
  GlobiguardActionsClient,
} from "@globiguard/contracts";

import type { GlobiguardTransport } from "../client.js";
import { createAiIntercept } from "../ai-intercept.js";

function decision(
  value: GlobiguardActionAuthorizationResponse["decision"],
  extras: Partial<GlobiguardActionAuthorizationResponse> = {},
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
    ...extras,
  };
}

function actions(authorize: ReturnType<typeof vi.fn>): GlobiguardActionsClient {
  return { authorize } as unknown as GlobiguardActionsClient;
}

describe("AI intercept authority boundary", () => {
  it.each(["BLOCK", "QUEUE", "MODIFY"] as const)(
    "does not call a provider after a %s input decision",
    async (outcome) => {
      const call = vi.fn(async () => "provider response");
      const onBlock = vi.fn();
      const intercept = createAiIntercept(
        { actions: actions(vi.fn(async () => decision(outcome))) },
        { mode: "scan_input", onBlock },
      );

      await expect(intercept.wrap("sensitive input", call)).rejects.toThrow(
        "AI input was not released",
      );
      expect(call).not.toHaveBeenCalled();
      expect(onBlock).toHaveBeenCalledTimes(outcome === "BLOCK" ? 1 : 0);
    },
  );

  it.each(["BLOCK", "QUEUE", "MODIFY"] as const)(
    "does not release a sensitive provider response after a %s output decision",
    async (outcome) => {
      const authorize = vi
        .fn()
        .mockResolvedValueOnce(decision("ALLOW"))
        .mockResolvedValueOnce(decision(outcome));
      const classify = vi
        .fn()
        .mockResolvedValueOnce({ dataClass: "PUBLIC", detectedEntities: [] })
        .mockResolvedValueOnce({
          dataClass: "PHI",
          detectedEntities: [{ type: "PHI" }],
        });
      const call = vi.fn(async () => ({ content: "patient diagnosis" }));
      const onBlock = vi.fn();
      const intercept = createAiIntercept(
        {
          actions: actions(authorize),
          brain: { request: classify },
        },
        { mode: "scan_both", onBlock },
      );

      await expect(intercept.wrap("draft", call)).rejects.toThrow(
        "AI output was not released",
      );
      expect(call).toHaveBeenCalledOnce();
      expect(onBlock).toHaveBeenCalledTimes(outcome === "BLOCK" ? 1 : 0);
    },
  );

  it("does not release an ALLOW with unresolved obligations", async () => {
    const intercept = createAiIntercept(
      {
        actions: actions(
          vi.fn(async () =>
            decision("ALLOW", { obligations: ["mask recipient"] }),
          ),
        ),
      },
      { mode: "scan_input" },
    );
    const call = vi.fn(async () => "provider response");

    await expect(intercept.wrap("draft", call)).rejects.toMatchObject({
      kind: "STEP_UP_REQUIRED",
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("never forwards raw detector entities into action-authority metadata", async () => {
    const authorize = vi.fn(async (_request: unknown) => decision("ALLOW"));
    const classify = vi.fn(async (_path: string) => ({
      dataClass: "PII",
      detectedEntities: [
        {
          type: "EMAIL_ADDRESS",
          text: "patient@example.com",
          value: "patient@example.com",
          start: 0,
          end: 19,
        },
        { label: "API_KEY", value: "sk_live_do_not_export" },
        { type: "patient@example.com", value: "raw type injection" },
      ],
    }));
    const intercept = createAiIntercept(
      {
        actions: actions(authorize),
        brain: {
          request: classify as unknown as GlobiguardTransport["request"],
        },
      },
      { mode: "scan_input" },
    );

    await intercept.wrap("patient@example.com", vi.fn(async () => "ok"));

    const serialized = JSON.stringify(authorize.mock.calls[0]?.[0]);
    expect(serialized).not.toContain("patient@example.com");
    expect(serialized).not.toContain("sk_live_do_not_export");
    expect(authorize.mock.calls[0]?.[0]).toMatchObject({
      context: {
        dataClasses: ["PII"],
        fieldsInvolved: ["API_KEY", "EMAIL_ADDRESS"],
        metadata: {
          detectionSource: "brain",
          detectedEntityCount: 3,
        },
      },
    });
  });
});
