import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { captureStagedSnapshot } from "../src/git.js";
import {
  analyzeCapturedStagedSnapshot,
  changedLinesFromPatch,
} from "../src/staged/pipeline.js";
import {
  commitAll,
  createTempGitRepository,
  removeRepoPath,
  stageAll,
  stagePaths,
  writeRepoTextFile,
} from "./git-test-helpers.js";

function createRepository(): string {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, ".gitignore", ".skia/\n");
  stagePaths(repositoryRoot, ".gitignore");
  commitAll(repositoryRoot, "initial");
  return repositoryRoot;
}

test("changed-line parser returns only staged-side added lines", () => {
  const patch = [
    "diff --git a/src/gate.ts b/src/gate.ts",
    "index 1111111..2222222 100644",
    "--- a/src/gate.ts",
    "+++ b/src/gate.ts",
    "@@ -1,4 +1,4 @@",
    " export function gate(code: string) {",
    '-  if (code === "old") {',
    '+  if (code === "ready") {',
    '     return "ok";',
    "   }",
    "@@ -8,0 +9 @@",
    '+export const marker = "new";',
    "",
  ].join("\n");

  assert.deepStrictEqual(
    changedLinesFromPatch(Buffer.from(patch, "utf8")),
    new Map([["src/gate.ts", [2, 9]]]),
  );
});

test("changed-line parser decodes Git-quoted UTF-8 paths", () => {
  const patch = [
    'diff --git "a/src/g\\303\\242te.ts" "b/src/g\\303\\242te.ts"',
    '--- "a/src/g\\303\\242te.ts"',
    '+++ "b/src/g\\303\\242te.ts"',
    "@@ -0,0 +1 @@",
    "+export function gate() {}",
    "",
  ].join("\n");

  assert.deepStrictEqual(
    changedLinesFromPatch(Buffer.from(patch, "utf8")),
    new Map([["src/gâte.ts", [1]]]),
  );
});

test("changed-line parser keeps added source lines beginning with plus signs", () => {
  const patch = [
    "diff --git a/src/gate.ts b/src/gate.ts",
    "index 1111111..2222222 100644",
    "--- a/src/gate.ts",
    "+++ b/src/gate.ts",
    "@@ -0,0 +1,2 @@",
    "+++counter;",
    "+return counter;",
    "",
  ].join("\n");

  assert.deepStrictEqual(
    changedLinesFromPatch(Buffer.from(patch, "utf8")),
    new Map([["src/gate.ts", [1, 2]]]),
  );
});

test("captured staged snapshot produces one supported pilot analysis", () => {
  const repositoryRoot = createRepository();
  const source = [
    "export function gateStatus(code: string): string {",
    '  if (code === "ready") {',
    '    return "ok";',
    "  }",
    "",
    '  return "hold";',
    "}",
    "",
  ].join("\n");
  writeRepoTextFile(repositoryRoot, "src/gate-status.ts", source);
  stagePaths(repositoryRoot, "src/gate-status.ts");

  const capture = captureStagedSnapshot(repositoryRoot);
  const result = analyzeCapturedStagedSnapshot(capture);

  assert.strictEqual(result.kind, "supported");
  if (result.kind !== "supported") {
    return;
  }

  assert.strictEqual(result.analysis.entity.name, "gateStatus");
  assert.deepStrictEqual(result.changed_lines, [1, 2, 3, 4, 5, 6, 7]);
  assert.deepStrictEqual(result.coverage.summary, {
    total_units: 7,
    supported_units: 2,
    partial_units: 0,
    unmapped_units: 5,
    unsupported_units: 0,
    excluded_units: 0,
    failed_units: 0,
    unchecked_units: 0,
  });
  assert.strictEqual(result.coverage.events[0]?.anchors.length, 2);
  assert.strictEqual(result.coverage.events[1]?.coverage, "unmapped");
  assert.strictEqual(result.coverage.events[1]?.units, 5);
});

test("captured staged snapshot supports a modified guard line", () => {
  const repositoryRoot = createRepository();
  const initial = [
    "export function gateStatus(code: string): string {",
    '  if (code === "old") {',
    '    return "ok";',
    "  }",
    "",
    '  return "hold";',
    "}",
    "",
  ].join("\n");
  writeRepoTextFile(repositoryRoot, "src/gate-status.ts", initial);
  stagePaths(repositoryRoot, "src/gate-status.ts");
  commitAll(repositoryRoot, "add gate");
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    initial.replace('"old"', '"ready"'),
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");

  const result = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );

  assert.strictEqual(result.kind, "supported");
  if (result.kind !== "supported") {
    return;
  }
  assert.deepStrictEqual(result.changed_lines, [2]);
  assert.deepStrictEqual(result.deleted_lines, [2]);
  assert.strictEqual(result.coverage.summary.total_units, 2);
  assert.strictEqual(result.coverage.summary.supported_units, 1);
  assert.strictEqual(result.coverage.summary.unmapped_units, 1);
});

test("captured staged snapshot refuses a function when only unrelated lines changed", () => {
  const repositoryRoot = createRepository();
  const initial = [
    "export function gateStatus(code: string): string {",
    '  if (code === "ready") {',
    '    return "ok";',
    "  }",
    "",
    '  return "hold";',
    "}",
    "",
    'export const marker = "old";',
    "",
  ].join("\n");
  writeRepoTextFile(repositoryRoot, "src/gate-status.ts", initial);
  stagePaths(repositoryRoot, "src/gate-status.ts");
  commitAll(repositoryRoot, "add gate");
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    initial.replace('"old"', '"new"'),
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");

  const result = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );

  assert.strictEqual(result.kind, "unsupported");
  if (result.kind !== "unsupported") {
    return;
  }
  assert.strictEqual(result.reason, "unmapped_region");
  assert.strictEqual(result.coverage.summary.unmapped_units, 2);
});

test("deleted comments do not select an unchanged guard for review", () => {
  const repositoryRoot = createRepository();
  const initial = [
    "export function gateStatus(code: string): string {",
    "  // Remove this comment.",
    '  if (code === "ready") {',
    '    return "ok";',
    "  }",
    '  return "hold";',
    "}",
    "",
  ].join("\n");
  writeRepoTextFile(repositoryRoot, "src/gate-status.ts", initial);
  stagePaths(repositoryRoot, "src/gate-status.ts");
  commitAll(repositoryRoot, "add gate");
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    initial.replace("  // Remove this comment.\n", ""),
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");

  const result = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );

  assert.strictEqual(result.kind, "unsupported");
  if (result.kind !== "unsupported") {
    return;
  }
  assert.strictEqual(result.reason, "unmapped_region");
  assert.strictEqual(result.coverage.summary.unmapped_units, 1);
});

test("captured staged snapshot rejects NUL-containing source as binary", () => {
  const repositoryRoot = createRepository();
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    'export function gateStatus(code: string) {\u0000 return "ok"; }\n',
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");

  const result = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );

  assert.strictEqual(result.kind, "failed");
  if (result.kind !== "failed") {
    return;
  }
  assert.strictEqual(result.reason, "binary_source");
  assert.strictEqual(result.coverage.summary.failed_units, 1);
});

test("captured staged snapshot accepts an optional UTF-8 BOM", () => {
  const repositoryRoot = createRepository();
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    "\uFEFF" +
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

  const result = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );

  assert.strictEqual(result.kind, "supported");
});

test("captured staged snapshot rejects more than 150 changed lines before analysis", () => {
  const repositoryRoot = createRepository();
  const comments = Array.from(
    { length: 151 },
    (_, index) => `// changed line ${index + 1}`,
  );
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    [
      ...comments,
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
    ].join("\n"),
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");

  const result = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );

  assert.strictEqual(result.kind, "unsupported");
  if (result.kind !== "unsupported") {
    return;
  }
  assert.strictEqual(result.reason, "staged_budget_exceeded");
  assert.strictEqual(result.coverage.summary.total_units, 155);
  assert.strictEqual(result.coverage.summary.unsupported_units, 155);
});

test("deletion-only patches retain every deleted line for the staged budget", () => {
  const repositoryRoot = createRepository();
  writeRepoTextFile(
    repositoryRoot,
    "src/removed.ts",
    Array.from({ length: 200 }, (_, index) => `export const value${index} = ${index};`)
      .join("\n"),
  );
  stagePaths(repositoryRoot, "src/removed.ts");
  commitAll(repositoryRoot, "add source");
  removeRepoPath(repositoryRoot, "src/removed.ts");
  stageAll(repositoryRoot);

  const result = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );

  assert.strictEqual(result.kind, "unsupported");
  if (result.kind !== "unsupported") {
    return;
  }
  assert.strictEqual(result.reason, "staged_budget_exceeded");
  assert.strictEqual(result.coverage.summary.total_units, 200);
  assert.strictEqual(result.coverage.summary.unsupported_units, 200);
});

test("diff-suppressed TypeScript remains explicit unsupported coverage", () => {
  const repositoryRoot = createRepository();
  writeRepoTextFile(repositoryRoot, ".gitattributes", "*.ts -diff\n");
  stagePaths(repositoryRoot, ".gitattributes");
  commitAll(repositoryRoot, "disable TypeScript diffs");
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
    ].join("\n"),
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");

  const result = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );

  assert.strictEqual(result.kind, "unsupported");
  if (result.kind !== "unsupported") {
    return;
  }
  assert.strictEqual(result.coverage.summary.total_units, 1);
  assert.strictEqual(result.coverage.summary.unsupported_units, 1);
  assert.strictEqual(result.coverage.events[0]?.coverage, "unsupported");
});

test("malformed TypeScript preserves partial syntax-error coverage", () => {
  const repositoryRoot = createRepository();
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
    ].join("\n"),
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");

  const result = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );

  assert.strictEqual(result.kind, "unsupported");
  if (result.kind !== "unsupported") {
    return;
  }
  assert.strictEqual(result.reason, "syntax_error");
  assert.strictEqual(result.coverage.summary.partial_units, 3);
  assert.strictEqual(result.coverage.events[0]?.coverage, "partial");
  assert.strictEqual(result.coverage.events[0]?.reason, "syntax_error");
});
