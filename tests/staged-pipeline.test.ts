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
  runGit,
  stageAll,
  stagePaths,
  writeRepoBinaryFile,
  writeRepoTextFile,
} from "./git-test-helpers.js";

function createRepository(): string {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, ".gitignore", ".skia/\n");
  stagePaths(repositoryRoot, ".gitignore");
  commitAll(repositoryRoot, "initial");
  return repositoryRoot;
}

test("changed-line parser keeps additions after a blank context line", () => {
  const patch = [
    "diff --git a/src/gate.ts b/src/gate.ts",
    "index 1111111..2222222 100644",
    "--- a/src/gate.ts",
    "+++ b/src/gate.ts",
    "@@ -1,4 +1,4 @@",
    " export function gate(code: string) {",
    "",
    '-  return "old";',
    '+  return "ok";',
    " }",
    "",
  ].join("\n");
  const changes = changedLinesFromPatch(Buffer.from(`${patch}\n`));

  assert.deepStrictEqual(changes.get("src/gate.ts"), [3]);
});

test("changed-line parser keeps additions when a deleted line is not UTF-8", () => {
  const patch = Buffer.concat([
    Buffer.from(
      [
        "diff --git a/src/gate.ts b/src/gate.ts",
        "index 1111111..2222222 100644",
        "--- a/src/gate.ts",
        "+++ b/src/gate.ts",
        "@@ -1,1 +1,1 @@",
        "",
      ].join("\n"),
    ),
    Buffer.from([0x2d, 0xff, 0x0a]),
    Buffer.from('+return "ok";\n'),
  ]);

  assert.deepStrictEqual(changedLinesFromPatch(patch).get("src/gate.ts"), [1]);
});

test("captured staged snapshot analyzes a UTF-8 replacement of non-UTF-8 source", () => {
  const repositoryRoot = createRepository();
  writeRepoBinaryFile(
    repositoryRoot,
    "src/gate-status.ts",
    Buffer.from([0xff, 0x0a]),
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");
  commitAll(repositoryRoot, "add non-utf8 source");
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
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

test("changed-line parser decodes astral characters inside Git-quoted paths", () => {
  const encoded = "emoji\u{1F600}\\\"gate.ts";
  const patch = [
    `diff --git "a/${encoded}" "b/${encoded}"`,
    `--- "a/${encoded}"`,
    `+++ "b/${encoded}"`,
    "@@ -0,0 +1 @@",
    "+export function gate() {}",
    "",
  ].join("\n");

  assert.deepStrictEqual(
    changedLinesFromPatch(Buffer.from(patch, "utf8")),
    new Map([["emoji\u{1F600}\"gate.ts", [1]]]),
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

test("a deleted or renamed typescript file keeps coverage identity", () => {
  const deletedRoot = createRepository();
  writeRepoTextFile(deletedRoot, "src/removed.ts", "export const value = 1;\n");
  stagePaths(deletedRoot, "src/removed.ts");
  commitAll(deletedRoot, "add source");
  removeRepoPath(deletedRoot, "src/removed.ts");
  stageAll(deletedRoot);
  const deleted = analyzeCapturedStagedSnapshot(captureStagedSnapshot(deletedRoot));
  assert.strictEqual(deleted.kind, "unsupported");
  if (deleted.kind === "unsupported") {
    assert.strictEqual(deleted.reason, "no_supported_staged_entity");
    assert.strictEqual(`${deleted.coverage.events[0]?.path}`, "src/removed.ts");
    assert.strictEqual(`${deleted.coverage.events[0]?.language}`, "typescript");
  }

  const renamedRoot = createRepository();
  writeRepoTextFile(renamedRoot, "src/old-gate.ts", "export const value = 1;\n");
  stagePaths(renamedRoot, "src/old-gate.ts");
  commitAll(renamedRoot, "add source");
  runGit(renamedRoot, ["mv", "src/old-gate.ts", "src/new-gate.ts"]);
  const renamed = analyzeCapturedStagedSnapshot(captureStagedSnapshot(renamedRoot));
  assert.strictEqual(renamed.kind, "unsupported");
  if (renamed.kind === "unsupported") {
    assert.strictEqual(renamed.reason, "no_supported_staged_entity");
    assert.strictEqual(`${renamed.coverage.events[0]?.path}`, "src/new-gate.ts");
    assert.strictEqual(`${renamed.coverage.events[0]?.language}`, "typescript");
  }
});

test("a sole supported-language file outside the TypeScript pilot keeps coverage identity", () => {
  for (const [filename, language] of [
    ["src/gate-status.tsx", "tsx"],
    ["src/gate_status.py", "python"],
  ] as const) {
    const repositoryRoot = createRepository();
    writeRepoTextFile(
      repositoryRoot,
      filename,
      filename.endsWith(".py")
        ? "def gate_status(code):\n    return 'ok'\n"
        : [
          "export function gateStatus(code: string): string {",
          '  if (code === "ready") return "ok";',
          '  return "hold";',
          "}",
        ].join("\n"),
    );
    stagePaths(repositoryRoot, filename);
    const result = analyzeCapturedStagedSnapshot(
      captureStagedSnapshot(repositoryRoot),
    );

    assert.strictEqual(result.kind, "unsupported");
    if (result.kind !== "unsupported") {
      continue;
    }
    assert.strictEqual(result.reason, "no_supported_staged_entity");
    assert.strictEqual(`${result.coverage.events[0]?.path}`, filename);
    assert.strictEqual(`${result.coverage.events[0]?.language}`, language);
  }
});

test("budget refusal leaves mixed-record coverage unattributed", () => {
  const repositoryRoot = createRepository();
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    `${Array.from({ length: 151 }, (_, index) => `export const value${index} = ${index};`).join("\n")}\n`,
  );
  writeRepoTextFile(repositoryRoot, "README.md", "notes\n");
  stagePaths(repositoryRoot, "src/gate-status.ts", "README.md");

  const result = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );

  assert.strictEqual(result.kind, "unsupported");
  if (result.kind !== "unsupported") {
    return;
  }
  assert.strictEqual(result.reason, "staged_budget_exceeded");
  assert.strictEqual(result.coverage.summary.total_units > 151, true);
  assert.strictEqual(result.coverage.events[0]?.path ?? null, null);
  assert.strictEqual(result.coverage.events[0]?.language ?? null, null);
});

test("unsupported-language changes do not consume the staged review budget", () => {
  const repositoryRoot = createRepository();
  writeRepoTextFile(
    repositoryRoot,
    "README.md",
    `${Array.from({ length: 151 }, (_, index) => `line ${index + 1}`).join("\n")}\n`,
  );
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
  stagePaths(repositoryRoot, "README.md", "src/gate-status.ts");

  const result = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );

  assert.strictEqual(result.kind, "unsupported");
  if (result.kind !== "unsupported") {
    return;
  }
  assert.strictEqual(result.reason, "no_supported_staged_entity");
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

test("a no-hunk TypeScript record remains counted beside a textual file", () => {
  const repositoryRoot = createRepository();
  writeRepoTextFile(repositoryRoot, ".gitattributes", "*.ts -diff\n");
  stagePaths(repositoryRoot, ".gitattributes");
  commitAll(repositoryRoot, "disable TypeScript diffs");
  writeRepoTextFile(repositoryRoot, "README.md", "changed\n");
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
  stagePaths(repositoryRoot, "README.md", "src/gate-status.ts");

  const result = analyzeCapturedStagedSnapshot(
    captureStagedSnapshot(repositoryRoot),
  );

  assert.strictEqual(result.kind, "unsupported");
  if (result.kind !== "unsupported") {
    return;
  }
  assert.strictEqual(result.coverage.summary.total_units, 2);
  assert.strictEqual(result.coverage.summary.unsupported_units, 2);
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
