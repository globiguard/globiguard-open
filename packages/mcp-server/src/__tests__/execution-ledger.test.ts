import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FileGatewayExecutionLedger } from "../execution-ledger.js";

describe("durable gateway execution ledger", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      directories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("persists an atomic claim and outcome across ledger restarts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "globiguard-ledger-"));
    directories.push(directory);
    const operation = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "completed" }],
      structuredContent: { id: "effect_123" },
      isError: false,
    }));

    const first = await new FileGatewayExecutionLedger({ directory }).run(
      "effect:key",
      "a".repeat(64),
      operation,
    );
    expect(first.kind).toBe("executed");

    const restartedOperation = vi.fn(operation);
    const duplicate = await new FileGatewayExecutionLedger({ directory }).run(
      "effect:key",
      "a".repeat(64),
      restartedOperation,
    );
    expect(duplicate).toEqual({ kind: "duplicate" });
    expect(restartedOperation).not.toHaveBeenCalled();

    const entries = await import("node:fs/promises").then(({ readdir }) =>
      readdir(directory),
    );
    expect(entries).toHaveLength(1);
    const outcome = JSON.parse(
      await readFile(join(directory, entries[0]!, "outcome.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(outcome).toMatchObject({
      schemaVersion: "globiguard.execution-outcome.v1",
      state: "completed",
    });
  });

  it("treats a crash-era incomplete directory as consumed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "globiguard-ledger-"));
    directories.push(directory);
    const { mkdir } = await import("node:fs/promises");
    const { sha256 } = await import("../summarize.js");
    await mkdir(join(directory, sha256("crashed:key")));
    const operation = vi.fn();

    await expect(
      new FileGatewayExecutionLedger({ directory }).run(
        "crashed:key",
        "b".repeat(64),
        operation,
      ),
    ).resolves.toEqual({ kind: "duplicate" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("rejects reuse of a claimed key with different exact arguments", async () => {
    const directory = await mkdtemp(join(tmpdir(), "globiguard-ledger-"));
    directories.push(directory);
    const ledger = new FileGatewayExecutionLedger({ directory });
    await ledger.run("effect:key", "c".repeat(64), async () => ({
      content: [],
    }));

    await expect(
      new FileGatewayExecutionLedger({ directory }).run(
        "effect:key",
        "d".repeat(64),
        async () => ({ content: [] }),
      ),
    ).rejects.toThrow("different tool arguments");
  });
});
