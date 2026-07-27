import { describe, expect, it } from "vitest";

import {
  assertPayloadSize,
  canonicalJson,
  MAX_GOVERNED_PAYLOAD_BYTES,
  summarizePayload,
} from "../summarize.js";

describe("safe MCP payload summaries", () => {
  it("hashes semantically identical objects deterministically", () => {
    const first = summarizePayload({
      customer: { ssn: "111-22-3333", name: "Ada" },
      amount: 42,
    });
    const second = summarizePayload({
      amount: 42,
      customer: { name: "Ada", ssn: "111-22-3333" },
    });

    expect(first.sha256).toBe(second.sha256);
    expect(first.topLevelKeys).toEqual(["amount", "customer"]);
    expect(first.topLevelValueKinds).toEqual({
      amount: "number",
      customer: "object",
    });
  });

  it("never includes raw values in its summary", () => {
    const secret = "sk_live_super_secret";
    const summary = summarizePayload({
      apiKey: secret,
      nested: { patient: "Jane Doe", diagnosis: "private" },
    });

    expect(JSON.stringify(summary)).not.toContain(secret);
    expect(JSON.stringify(summary)).not.toContain("Jane Doe");
    expect(JSON.stringify(summary)).not.toContain("private");
  });

  it("hashes field names that could themselves contain customer data", () => {
    const summary = summarizePayload({
      "patient@example.com": "record",
      ssn_111_22_3333: "record",
      ordinaryField: "safe",
    });

    expect(summary.topLevelKeys).toContain("ordinaryField");
    expect(summary.topLevelKeys).not.toContain("patient@example.com");
    expect(summary.topLevelKeys).not.toContain("ssn_111_22_3333");
    expect(
      summary.topLevelKeys.filter((key) => key.startsWith("field_sha256_")),
    ).toHaveLength(2);
  });

  it("supports omitted payloads and normalizes JSON edge cases", () => {
    expect(canonicalJson(undefined)).toBe("null");
    expect(summarizePayload(undefined)).toMatchObject({
      approxBytes: 4,
      recordCount: 0,
      topLevelKeys: [],
    });
    expect(canonicalJson({ missing: undefined, invalid: Number.NaN })).toBe(
      '{"invalid":null,"missing":null}',
    );
  });

  it("rejects values that cannot be represented safely and deterministically", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => canonicalJson(circular)).toThrow(/circular/i);
    expect(() => canonicalJson({ value: 1n })).toThrow(/bigint/i);
  });

  it("rejects payload summaries above the local safety ceiling", () => {
    expect(() =>
      assertPayloadSize({
        ...summarizePayload({ ok: true }),
        approxBytes: MAX_GOVERNED_PAYLOAD_BYTES + 1,
      }),
    ).toThrow(/safety limit/);
  });
});
