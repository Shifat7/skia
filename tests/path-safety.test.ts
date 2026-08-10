import assert from "node:assert/strict";
import test from "node:test";

import {
  createInternalPath,
  deriveRepositoryArtifactPath,
  deriveRepositoryManifestPath,
  deriveStagedReceiptPath,
  escapePathForDisplay,
  formatRunIdAtUtc,
  validateRelativePath,
  validateRunArtifactPath,
  validateRunId,
  validateSessionId,
} from "../src/paths.js";

test("internal paths preserve bytes and escape control characters for display", () => {
  const bytes = new Uint8Array([0x73, 0x72, 0x63, 0x2f, 0x01, 0x0a, 0x61, 0x7f]);
  const internalPath = createInternalPath(bytes);

  assert.deepStrictEqual(Array.from(internalPath.bytes), Array.from(bytes));
  assert.strictEqual(internalPath.display, "\"src/\\x01\\x0aa\\x7f\"");
  assert.strictEqual(
    escapePathForDisplay("src/\u0007example.ts"),
    "\"src/\\x07example.ts\"",
  );
});

test("safe relative path validation accepts repository-relative paths and rejects unsafe inputs", () => {
  assert.strictEqual(validateRelativePath("src/example.ts"), "src/example.ts");
  assert.strictEqual(
    validateRunArtifactPath("repo-coverage-20260810T010203Z.json"),
    "repo-coverage-20260810T010203Z.json",
  );

  for (const invalidPath of [
    "",
    "/tmp/example.ts",
    "C:/tmp/example.ts",
    "../example.ts",
    "src/../example.ts",
    "src//example.ts",
    "src\\example.ts",
    "src/\u0000example.ts",
    "src/\u001fexample.ts",
  ]) {
    assert.throws(
      () => validateRelativePath(invalidPath),
      /relative path/i,
      invalidPath,
    );
  }
});

test("run ids and derived artifact paths stay deterministic and schema-compatible", () => {
  const runId = formatRunIdAtUtc(new Date("2026-08-10T01:02:03Z"));
  const sessionId = validateSessionId("8f5d1a2c");

  assert.strictEqual(runId, "20260810T010203Z");
  assert.strictEqual(validateRunId(runId), runId);
  assert.strictEqual(
    deriveRepositoryArtifactPath(runId, "coverage"),
    "repo-coverage-20260810T010203Z.json",
  );
  assert.strictEqual(
    deriveRepositoryArtifactPath(runId, "behavior_cards"),
    "repo-behavior-cards-20260810T010203Z.json",
  );
  assert.strictEqual(
    deriveRepositoryManifestPath(runId),
    "repo-manifest-20260810T010203Z.json",
  );
  assert.strictEqual(
    deriveStagedReceiptPath(runId, sessionId),
    "receipts/20260810T010203Z-8f5d1a2c-session.json",
  );
});
