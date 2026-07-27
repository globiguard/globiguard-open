import { mkdir, open, readFile, readdir, rename } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { sha256 } from "./summarize.js";

export type GatewayExecutionLedgerResult =
  | { kind: "executed" | "joined"; result: CallToolResult }
  | { kind: "duplicate" };

/**
 * A claim is consumed before the downstream side effect starts. Implementations
 * must never run the operation when the same key has already been claimed.
 */
export interface GatewayExecutionLedger {
  run(
    key: string,
    payloadSha256: string,
    operation: () => Promise<CallToolResult>,
  ): Promise<GatewayExecutionLedgerResult>;
}

interface ExecutionLedgerEntry {
  payloadSha256: string;
  expiresAt: number;
  operation?: Promise<CallToolResult>;
  completed: boolean;
}

/** Development-only: process loss also loses every completed claim. */
export class InMemoryGatewayExecutionLedger implements GatewayExecutionLedger {
  private readonly entries = new Map<string, ExecutionLedgerEntry>();

  constructor(
    private readonly maxEntries = 10_000,
    private readonly ttlMs = 24 * 60 * 60 * 1000,
  ) {
    assertMaxEntries(maxEntries);
    if (
      !Number.isInteger(ttlMs) ||
      ttlMs < 60_000 ||
      ttlMs > 7 * 24 * 60 * 60 * 1000
    ) {
      throw new Error(
        "Execution-ledger ttlMs must be between one minute and seven days",
      );
    }
  }

  async run(
    key: string,
    payloadSha256: string,
    operation: () => Promise<CallToolResult>,
  ): Promise<GatewayExecutionLedgerResult> {
    this.removeExpired();
    const existing = this.entries.get(key);
    if (existing) {
      assertSamePayload(existing.payloadSha256, payloadSha256);
      if (existing.completed || !existing.operation) {
        return { kind: "duplicate" };
      }
      return { kind: "joined", result: await existing.operation };
    }
    if (this.entries.size >= this.maxEntries) {
      throw new Error("Execution ledger reached its fail-closed capacity");
    }

    const entry: ExecutionLedgerEntry = {
      payloadSha256,
      expiresAt: Date.now() + this.ttlMs,
      completed: false,
    };
    const operationPromise = operation();
    entry.operation = operationPromise;
    this.entries.set(key, entry);
    try {
      return { kind: "executed", result: await operationPromise };
    } finally {
      entry.completed = true;
      entry.operation = undefined;
    }
  }

  private removeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.completed && entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}

export interface FileGatewayExecutionLedgerOptions {
  directory: string;
  maxEntries?: number;
}

interface PersistedClaim {
  schemaVersion: "globiguard.execution-claim.v1";
  keySha256: string;
  payloadSha256: string;
  claimedAt: string;
}

interface PersistedOutcome {
  schemaVersion: "globiguard.execution-outcome.v1";
  keySha256: string;
  payloadSha256: string;
  completedAt: string;
  state: "completed" | "outcome_unknown" | "result_suppressed";
  outcomeMetadataSha256: string;
}

/**
 * Restart-safe filesystem ledger. An atomic directory creation consumes the
 * key before execution. A crash leaves a consumed claim with unknown outcome,
 * which deliberately cannot be retried through the gateway.
 */
export class FileGatewayExecutionLedger implements GatewayExecutionLedger {
  private readonly directory: string;
  private readonly maxEntries: number;
  private readonly localOperations = new Map<string, Promise<CallToolResult>>();

  constructor(options: FileGatewayExecutionLedgerOptions) {
    if (!options.directory.trim()) {
      throw new Error("File execution-ledger directory must be non-empty");
    }
    this.directory = resolve(options.directory);
    this.maxEntries = options.maxEntries ?? 100_000;
    assertMaxEntries(this.maxEntries);
  }

  async run(
    key: string,
    payloadSha256: string,
    operation: () => Promise<CallToolResult>,
  ): Promise<GatewayExecutionLedgerResult> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const keySha256 = sha256(key);
    const local = this.localOperations.get(keySha256);
    if (local) return { kind: "joined", result: await local };

    const entryDirectory = join(this.directory, keySha256);
    try {
      if ((await readdir(this.directory)).length >= this.maxEntries) {
        throw new Error("Execution ledger reached its fail-closed capacity");
      }
      await mkdir(entryDirectory, { mode: 0o700 });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      const prior = await readClaim(entryDirectory);
      if (prior) assertSamePayload(prior.payloadSha256, payloadSha256);
      return { kind: "duplicate" };
    }

    const claim: PersistedClaim = {
      schemaVersion: "globiguard.execution-claim.v1",
      keySha256,
      payloadSha256,
      claimedAt: new Date().toISOString(),
    };
    await atomicWriteJson(entryDirectory, "claim.json", claim);

    const operationPromise = operation();
    this.localOperations.set(keySha256, operationPromise);
    try {
      const result = await operationPromise;
      const outcome: PersistedOutcome = {
        schemaVersion: "globiguard.execution-outcome.v1",
        keySha256,
        payloadSha256,
        completedAt: new Date().toISOString(),
        state: resultExecutionState(result),
        outcomeMetadataSha256: sha256(
          JSON.stringify({
            state: resultExecutionState(result),
            isError: result.isError === true,
            contentItems: result.content.length,
            hasStructuredContent: result.structuredContent !== undefined,
          }),
        ),
      };
      await atomicWriteJson(entryDirectory, "outcome.json", outcome);
      return { kind: "executed", result };
    } catch (error) {
      const outcome: PersistedOutcome = {
        schemaVersion: "globiguard.execution-outcome.v1",
        keySha256,
        payloadSha256,
        completedAt: new Date().toISOString(),
        state: "outcome_unknown",
        outcomeMetadataSha256: sha256("operation-rejected"),
      };
      await atomicWriteJson(entryDirectory, "outcome.json", outcome).catch(
        () => undefined,
      );
      throw error;
    } finally {
      this.localOperations.delete(keySha256);
    }
  }
}

async function atomicWriteJson(
  directory: string,
  fileName: string,
  value: PersistedClaim | PersistedOutcome,
): Promise<void> {
  const temporary = join(
    directory,
    `.${fileName}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  const destination = join(directory, fileName);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, destination);
}

async function readClaim(directory: string): Promise<PersistedClaim | null> {
  try {
    const value = JSON.parse(
      await readFile(join(directory, "claim.json"), "utf8"),
    ) as Partial<PersistedClaim>;
    return value.schemaVersion === "globiguard.execution-claim.v1" &&
      typeof value.payloadSha256 === "string"
      ? (value as PersistedClaim)
      : null;
  } catch {
    // A directory without a readable claim may be a crashed claimant. It is
    // still consumed and must never be treated as available.
    return null;
  }
}

function resultExecutionState(
  result: CallToolResult,
): PersistedOutcome["state"] {
  const state = (
    result.structuredContent as Record<string, unknown> | undefined
  )?.executionState;
  return state === "outcome_unknown" || state === "result_suppressed"
    ? state
    : "completed";
}

function isAlreadyExists(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EEXIST"
  );
}

function assertSamePayload(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(
      "Execution key was already bound to different tool arguments",
    );
  }
}

function assertMaxEntries(maxEntries: number): void {
  if (
    !Number.isInteger(maxEntries) ||
    maxEntries < 1 ||
    maxEntries > 1_000_000
  ) {
    throw new Error(
      "Execution-ledger maxEntries must be between 1 and 1000000",
    );
  }
}
