import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

function run(...args: string[]): string {
  return execFileSync("node", ["scripts/key.ts", ...args], {
    encoding: "utf-8",
  }).trim();
}

describe("key", () => {
  it("defaults to 32 bytes (64 hex chars)", () => {
    assert.equal(run().length, 64);
  });

  it("generates key of specified length", () => {
    assert.equal(run("16").length, 32);
  });
});
