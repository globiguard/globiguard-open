import { createHash } from "node:crypto";

export interface SafePayloadSummary {
  sha256: string;
  approxBytes: number;
  topLevelKeys: string[];
  topLevelValueKinds: Record<string, string>;
  recordCount: number;
  description: string;
}

export const MAX_GOVERNED_PAYLOAD_BYTES = 10 * 1024 * 1024;

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(value, new WeakSet<object>()));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function summarizePayload(
  value: unknown,
  description = "MCP tool arguments",
): SafePayloadSummary {
  const canonical = canonicalJson(value);
  const record = isRecord(value) ? value : {};
  const originalTopLevelKeys = Object.keys(record).sort().slice(0, 64);
  const topLevelKeys = originalTopLevelKeys.map(safeFieldName);

  return {
    sha256: sha256(canonical),
    approxBytes: Buffer.byteLength(canonical, "utf8"),
    topLevelKeys,
    topLevelValueKinds: Object.fromEntries(
      originalTopLevelKeys.map((key, index) => [
        topLevelKeys[index]!,
        valueKind(record[key]),
      ]),
    ),
    recordCount: Array.isArray(value) ? value.length : value == null ? 0 : 1,
    description,
  };
}

export function assertPayloadSize(summary: SafePayloadSummary): void {
  if (summary.approxBytes > MAX_GOVERNED_PAYLOAD_BYTES) {
    throw new RangeError(
      `Governed payload exceeds the ${MAX_GOVERNED_PAYLOAD_BYTES}-byte local safety limit`,
    );
  }
}

/** Counts JSON UTF-8 bytes without constructing a second full result string. */
export function boundedJsonUtf8Size(
  value: unknown,
  maximumBytes: number,
): { bytes: number; exceeded: boolean } {
  const seen = new WeakSet<object>();
  let bytes = 0;
  const add = (valueToAdd: number): void => {
    bytes += valueToAdd;
    if (bytes > maximumBytes) throw SIZE_LIMIT;
  };

  const visit = (current: unknown, depth: number, inArray: boolean): void => {
    if (depth > 128)
      throw new TypeError("JSON result nesting exceeds 128 levels");
    if (
      current === undefined ||
      typeof current === "function" ||
      typeof current === "symbol"
    ) {
      if (inArray) add(4);
      return;
    }
    if (typeof current === "bigint") {
      throw new TypeError("JSON result cannot contain bigint values");
    }
    if (current === null || typeof current !== "object") {
      add(Buffer.byteLength(JSON.stringify(current), "utf8"));
      return;
    }
    if (seen.has(current))
      throw new TypeError("JSON result must not be circular");
    seen.add(current);
    try {
      if (Array.isArray(current)) {
        add(2 + Math.max(0, current.length - 1));
        for (const item of current) visit(item, depth + 1, true);
        return;
      }
      const entries = Object.entries(current).filter(
        ([, item]) =>
          item !== undefined &&
          typeof item !== "function" &&
          typeof item !== "symbol",
      );
      add(2 + Math.max(0, entries.length - 1));
      for (const [key, item] of entries) {
        add(Buffer.byteLength(JSON.stringify(key), "utf8") + 1);
        visit(item, depth + 1, false);
      }
    } finally {
      seen.delete(current);
    }
  };

  try {
    visit(value, 0, false);
    return { bytes, exceeded: false };
  } catch (error) {
    if (error === SIZE_LIMIT) return { bytes, exceeded: true };
    throw error;
  }
}

const SIZE_LIMIT = Symbol("json-size-limit");

function sortJson(value: unknown, seen: WeakSet<object>): unknown {
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return null;
  }
  if (typeof value === "bigint") {
    throw new TypeError(
      "Payload values must be JSON-compatible; bigint is not supported",
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }
  if (Array.isArray(value)) {
    assertNotCircular(value, seen);
    const sorted = value.map((item) => sortJson(item, seen));
    seen.delete(value);
    return sorted;
  }
  if (!isRecord(value)) {
    return value;
  }

  assertNotCircular(value, seen);
  const sorted = Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJson(value[key], seen)]),
  );
  seen.delete(value);
  return sorted;
}

function valueKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertNotCircular(value: object, seen: WeakSet<object>): void {
  if (seen.has(value)) {
    throw new TypeError("Payload values must not contain circular references");
  }
  seen.add(value);
}

function safeFieldName(value: string): string {
  if (
    value.length <= 128 &&
    /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value) &&
    !/\d{3,}/.test(value)
  ) {
    return value;
  }
  return `field_sha256_${sha256(value).slice(0, 16)}`;
}
