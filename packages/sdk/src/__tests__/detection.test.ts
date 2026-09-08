import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validateDetectionResponse } from "../resources/detection.js";

const FIXTURE_SHA256 =
  "e247589e1ea3457481ba98f58d87d102171c642899273e2a9044880ac721f0a9";
const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../test/fixtures/brain-inference-v1.json"
);

describe("shared Brain inference contract", () => {
  const fixtureBytes = readFileSync(fixturePath);
  const fixture = JSON.parse(fixtureBytes.toString("utf8")) as {
    fixture_contract: string;
    cases: Array<{ id: string; expect: "accept" | "reject"; response: unknown }>;
  };

  it("uses the byte-identical canonical fixture mirror", () => {
    expect(createHash("sha256").update(fixtureBytes).digest("hex")).toBe(
      FIXTURE_SHA256
    );
    expect(fixture.fixture_contract).toBe(
      "globiguard.brain-inference.shared-fixtures.v1"
    );
  });

  for (const testCase of fixture.cases) {
    it(`${testCase.expect}s ${testCase.id}`, () => {
      if (testCase.expect === "accept") {
        expect(validateDetectionResponse(testCase.response)).toEqual(testCase.response);
      } else {
        expect(() => validateDetectionResponse(testCase.response)).toThrow();
      }
    });
  }
});
