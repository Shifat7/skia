import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { runCli } from "../../src/main.js";
import {
  commitAll,
  createTempGitRepository,
  stagePaths,
  writeRepoTextFile,
} from "../git-test-helpers.js";

function createSupportedRepository(): string {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, ".gitignore", ".skia/\n");
  stagePaths(repositoryRoot, ".gitignore");
  commitAll(repositoryRoot, "initial");
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") {',
      '    return "ok";',
      "  }",
      "",
      '  return "hold";',
      "}",
      "",
    ].join("\n"),
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");
  return repositoryRoot;
}

test("skia review golden path shows evidence before prediction and feedback after persistence", () => {
  const repositoryRoot = createSupportedRepository();
  const result = runCli(["review"], {
    input: '"ok"\n',
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.exit_code, 0);
  assert.strictEqual(result.kind, "review_complete");
  assert.strictEqual(
    result.output,
    [
      "Skia staged review",
      'Evidence: code === "ready" -> return "ok"',
      "Coverage: supported=2 partial=0 unmapped=5 unsupported=0 failed=0",
      'GIVEN code = "ready"',
      'WHEN gateStatus("ready")',
      'Predict THEN as JSON, or type "skip":',
      "Source check: source_derived_match",
      'Expected source-derived return: "ok"',
      "Receipt: .skia/receipts/20260922T010203Z-8f5d1a2c-session.json",
      "",
    ].join("\n"),
  );

  const predictionIndex = result.output.indexOf("Predict THEN");
  const feedbackIndex = result.output.indexOf("Source check:");
  assert.ok(predictionIndex >= 0 && feedbackIndex > predictionIndex);
  assert.strictEqual(
    fs.existsSync(
      `${repositoryRoot}/.skia/artifacts/20260922T010203Z-8f5d1a2c-behavior_cards.json`,
    ),
    true,
  );
});

test("skia review skip writes a receipt without source-derived feedback", () => {
  const repositoryRoot = createSupportedRepository();
  const result = runCli(["review"], {
    input: "skip\n",
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.exit_code, 0);
  assert.strictEqual(result.kind, "review_skipped");
  assert.match(result.output, /Prediction skipped/);
  assert.strictEqual(result.output.includes("Source check:"), false);
});

test("skia review reports a source-derived mismatch without a correctness verdict", () => {
  const repositoryRoot = createSupportedRepository();
  const result = runCli(["review"], {
    input: '"hold"\n',
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.exit_code, 0);
  assert.match(result.output, /Source check: source_derived_mismatch/);
  assert.strictEqual(result.output.includes("incorrect"), false);
  assert.strictEqual(result.output.includes("failed review"), false);
});

test("skia review accepts null as a JSON-scalar prediction", () => {
  const repositoryRoot = createSupportedRepository();
  const result = runCli(["review"], {
    input: "null\n",
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.exit_code, 0);
  assert.strictEqual(result.kind, "review_complete");
  assert.match(result.output, /source_derived_mismatch/);
});

test("skia review distinguishes the JSON string skip from the skip command", () => {
  const repositoryRoot = createSupportedRepository();
  const result = runCli(["review"], {
    input: '"skip"\n',
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.kind, "review_complete");
  assert.match(result.output, /source_derived_mismatch/);
  assert.strictEqual(result.output.includes("Prediction skipped"), false);
});

test("skia review rejects terminal input above the published limit", () => {
  const repositoryRoot = createSupportedRepository();
  const result = runCli(["review"], {
    input: `"${"x".repeat(4_097)}"\n`,
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.exit_code, 2);
  assert.strictEqual(result.kind, "invalid_prediction");
  assert.match(result.output, /4096-byte input limit/);
  assert.strictEqual(fs.existsSync(`${repositoryRoot}/.skia/receipts`), false);
});

test("skia review rejects non-JSON predictions without writing a receipt", () => {
  const repositoryRoot = createSupportedRepository();
  const result = runCli(["review"], {
    input: "ok\n",
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.exit_code, 2);
  assert.strictEqual(result.kind, "invalid_prediction");
  assert.match(result.output, /valid JSON scalar/);
  assert.strictEqual(fs.existsSync(`${repositoryRoot}/.skia/receipts`), false);
});
