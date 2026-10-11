import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import {
  analyzeLiteralGuardFunction,
} from "../src/staged/analyze.js";
import {
  createPredictionSession,
} from "../src/staged/card.js";
import type {
  PilotSupportedAnalysis,
} from "../src/staged/types.js";
import type {
  GitObjectId,
  RepositoryRelativePath,
} from "../src/types.js";

const FIXTURE_DIRECTORY = path.join(process.cwd(), "fixtures/staged");
const PATH = "src/gate-status.ts" as RepositoryRelativePath;
const BLOB_OID = "1111111111111111111111111111111111111111" as GitObjectId;
const NODE_EXECUTABLE = (process as unknown as {
  readonly execPath?: string;
}).execPath ?? "node";

function analyzeFixture(
  filename = "literal-guard.ts",
  changedLines: readonly number[] = [1, 2, 3, 4, 5, 6, 7],
): PilotSupportedAnalysis {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: changedLines,
    path: PATH,
    source: fs.readFileSync(path.join(FIXTURE_DIRECTORY, filename), "utf8"),
  });

  if (result.kind !== "supported") {
    throw new Error(`expected supported pilot analysis, received ${result.reason}`);
  }

  return result;
}

test("pilot analyzer refuses a same-line edit outside the reviewed function", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1],
    path: PATH,
    source:
      'export function gateStatus(code: string): string { if (code === "ready") return "ok"; return "hold"; } const marker = 2;\n',
  });

  assert.strictEqual(result.kind, "unsupported");
  if (result.kind === "unsupported") {
    assert.strictEqual(result.reason, "unmapped_region");
  }
});

test("pilot analyzer refuses a same-line edit outside the evidence anchors", () => {
  const base =
    'export function gateStatus(code: string): string { if (code === "ready") return "ok"; return "hold"; }\n';
  const staged = base.replace('return "hold"', 'return "stop"');
  const result = analyzeLiteralGuardFunction({
    base_source: base,
    blob_oid: BLOB_OID,
    changed_lines: [1],
    path: PATH,
    source: staged,
  });

  assert.strictEqual(result.kind, "unsupported");
  if (result.kind === "unsupported") {
    assert.strictEqual(result.reason, "unmapped_region");
  }
});

test("pilot analyzer refuses a new one-line function with text outside the evidence anchors", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1],
    path: PATH,
    source:
      'export function gateStatus(code: string): string { if (code === "ready") return "ok"; return "hold"; }\n',
  });

  assert.strictEqual(result.kind, "unsupported");
  if (result.kind === "unsupported") {
    assert.strictEqual(result.reason, "unmapped_region");
  }
});

test("pilot analyzer refuses an export-only edit of a one-line function", () => {
  const base =
    'function gateStatus(code: string): string { if (code === "ready") return "ok"; return "hold"; }\n';
  const result = analyzeLiteralGuardFunction({
    base_source: base,
    blob_oid: BLOB_OID,
    changed_lines: [1],
    path: PATH,
    source: `export ${base}`,
  });

  assert.strictEqual(result.kind, "unsupported");
  if (result.kind === "unsupported") {
    assert.strictEqual(result.reason, "unmapped_region");
  }
});

test("pilot analyzer refuses an export-only edit of a multiline function whose guard starts on the signature line", () => {
  const base = [
    "function gateStatus(code: string): string { if (code === \"ready\") return \"ok\";",
    "  return \"hold\";",
    "}",
    "",
  ].join("\n");
  const result = analyzeLiteralGuardFunction({
    base_source: base,
    blob_oid: BLOB_OID,
    changed_lines: [1],
    path: PATH,
    source: `export ${base}`,
  });

  assert.strictEqual(result.kind, "unsupported");
  if (result.kind === "unsupported") {
    assert.strictEqual(result.reason, "unmapped_region");
  }
});

test("pilot analyzer refuses a one-line rewrite whose base is not a supported pilot shape", () => {
  const result = analyzeLiteralGuardFunction({
    base_source:
      'export function gateStatus(code: string): string { return code; }\n',
    blob_oid: BLOB_OID,
    changed_lines: [1],
    path: PATH,
    source:
      'export function gateStatus(code: string): string { if (code === "go") return "ok"; return "hold"; }\n',
  });

  assert.strictEqual(result.kind, "unsupported");
  if (result.kind === "unsupported") {
    assert.strictEqual(result.reason, "unmapped_region");
  }
});

test("pilot analyzer refuses a same-line edit that changes the guard and text outside it", () => {
  const base =
    'export function gateStatus(code: string): string { if (code === "ready") return "ok"; return "hold"; }\n';
  const result = analyzeLiteralGuardFunction({
    base_source: base,
    blob_oid: BLOB_OID,
    changed_lines: [1],
    path: PATH,
    source: base.replace('code === "ready"', 'code === "go"').replace(
      'return "hold"',
      'return "stop"',
    ),
  });

  assert.strictEqual(result.kind, "unsupported");
  if (result.kind === "unsupported") {
    assert.strictEqual(result.reason, "unmapped_region");
  }
});

test("pilot analyzer keeps a same-line default-export guard edit supported", () => {
  const base =
    'export default function gateStatus(code: string): string { if (code === "ready") return "ok"; return "hold"; }\n';
  const result = analyzeLiteralGuardFunction({
    base_source: base,
    blob_oid: BLOB_OID,
    changed_lines: [1],
    path: PATH,
    source: base.replace('code === "ready"', 'code === "go"'),
  });

  assert.strictEqual(result.kind, "supported");
});

test("pilot analyzer keeps a same-line guard edit supported", () => {
  const base =
    'export function gateStatus(code: string): string { if (code === "ready") return "ok"; return "hold"; }\n';
  const result = analyzeLiteralGuardFunction({
    base_source: base,
    blob_oid: BLOB_OID,
    changed_lines: [1],
    path: PATH,
    source: base.replace('code === "ready"', 'code === "go"'),
  });

  assert.strictEqual(result.kind, "supported");
});

test("pilot analyzer derives one anchored relation and deterministic scenario", () => {
  const analysis = analyzeFixture();

  assert.deepStrictEqual(
    {
      entity: analysis.entity.name,
      relation: analysis.evidence.relation,
      scenario: analysis.scenario,
    },
    {
      entity: "gateStatus",
      relation: 'code === "ready" -> return "ok"',
      scenario: {
        basis: "literal_guard_match",
        given: {
          parameter: "code",
          value: "ready",
        },
        when: 'gateStatus("ready")',
      },
    },
  );
  assert.strictEqual(analysis.evidence.derivation, "deterministic");
  assert.strictEqual(analysis.evidence.coverage, "supported");
  assert.strictEqual(analysis.evidence.claim_state, "observed");
  assert.strictEqual(analysis.evidence.details_available, false);
  assert.strictEqual(analysis.evidence.anchors.length, 2);

  for (const anchor of analysis.evidence.anchors) {
    assert.strictEqual(anchor.side, "staged");
    assert.strictEqual(anchor.path, PATH);
    assert.strictEqual(anchor.blob_oid, BLOB_OID);
    assert.strictEqual(anchor.language, "typescript");
  }
});

test("pilot analyzer refuses unsupported syntax instead of inventing evidence", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3],
    path: PATH,
    source: "export const gateStatus = (code: string) => code;\n",
  });

  assert.deepStrictEqual(result, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
});

test("pilot analyzer rejects nested, async, and generator functions", () => {
  const nested = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4, 5, 6, 7, 8],
    path: PATH,
    source: [
      "export const outer = () => {",
      "  function gateStatus(code: string) {",
      '    if (code === "ready") return "ok";',
      '    return "hold";',
      "  }",
      "  return gateStatus;",
      "}",
    ].join("\n"),
  });
  const asyncFunction = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4, 5],
    path: PATH,
    source: [
      "export async function gateStatus(code: string) {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
    ].join("\n"),
  });
  const generatorFunction = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4],
    path: PATH,
    source: [
      "export function* gateStatus(code: string) {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
    ].join("\n"),
  });

  assert.deepStrictEqual(nested, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
  assert.deepStrictEqual(asyncFunction, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
  assert.deepStrictEqual(generatorFunction, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
});

test("pilot analyzer rejects var rebinding of the reviewed function", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4, 5],
    path: PATH,
    source: [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
      'var gateStatus = (_code: string) => "evil";',
    ].join("\n"),
  });

  assert.deepStrictEqual(result, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
});

test("pilot analyzer rejects direct eval that can rebind the reviewed function", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4, 5],
    path: PATH,
    source: [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
      "eval('gateStatus = () => \"evil\"');",
    ].join("\n"),
  });

  assert.deepStrictEqual(result, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
});

test("pilot analyzer rejects for-of rebinding of the reviewed function", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4, 5],
    path: PATH,
    source: [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
      'for (gateStatus of [(_code: string) => "evil"]) {}',
    ].join("\n"),
  });

  assert.deepStrictEqual(result, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
});

test("pilot analyzer rejects reflective rebinding of the reviewed function", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4, 5],
    path: PATH,
    source: [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
      'Object.defineProperty(globalThis, "gateStatus", { value: () => "evil" });',
    ].join("\n"),
  });

  assert.deepStrictEqual(result, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
});

test("pilot analyzer rejects escaped dotted rebinding of the reviewed function", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4, 5],
    path: PATH,
    source: [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
      "(globalThis as any).gate\\u0053tatus = (_code: string) => \"evil\";",
    ].join("\n"),
  });

  assert.deepStrictEqual(result, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
});

test("pilot analyzer rejects dotted global rebinding of the reviewed function", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4, 5],
    path: PATH,
    source: [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
      "(globalThis as any).gateStatus = (_code: string) => \"evil\";",
    ].join("\n"),
  });

  assert.deepStrictEqual(result, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
});

test("pilot analyzer rejects a generator declaration that rebinds the reviewed name", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4, 5],
    path: PATH,
    source: [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
      "function* gateStatus(_code: string) { yield \"evil\"; }",
    ].join("\n"),
  });

  assert.deepStrictEqual(result, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
});

test("pilot analyzer rejects a block-scoped function that rebinds the reviewed name", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4, 5],
    path: PATH,
    source: [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
      "{ function gateStatus(_code: string) { return \"evil\"; } }",
    ].join("\n"),
  });

  assert.deepStrictEqual(result, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
});

test("pilot analyzer rejects constructor rebinding outside the reviewed function", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4, 5],
    path: PATH,
    source: [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
      "new (new Function(\"globalThis.gateStatus = () => 'evil'\"))();",
    ].join("\n"),
  });

  assert.deepStrictEqual(result, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
});

test("pilot analyzer rejects escaped template rebinding of the reviewed function", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4, 5],
    path: PATH,
    source: [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
      "(globalThis as any)[`gate\\x53tatus`] = (_code: string) => \"evil\";",
    ].join("\n"),
  });

  assert.deepStrictEqual(result, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
});

test("pilot analyzer keeps an unrelated template key unmapped", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4],
    path: PATH,
    source: [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
      "const counts: Record<string, number> = {};",
      "counts[`other`] = 1;",
    ].join("\n"),
  });

  assert.strictEqual(result.kind, "supported");
});

test("pilot analyzer rejects computed global rebinding of the reviewed function", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4, 5],
    path: PATH,
    source: [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
      '(globalThis as any)["gateStatus"] = (_code: string) => "evil";',
    ].join("\n"),
  });

  assert.deepStrictEqual(result, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
});

test("pilot analyzer keeps an unrelated computed assignment unmapped", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4],
    path: PATH,
    source: [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
      'const counts: Record<string, number> = {};',
      'counts["other"] = 1;',
    ].join("\n"),
  });

  assert.strictEqual(result.kind, "supported");
});

test("pilot analyzer rejects later rebinding of the reviewed function", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4, 5],
    path: PATH,
    source: [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
      '(gateStatus as any) = (_code: string) => "evil";',
    ].join("\n"),
  });

  assert.deepStrictEqual(result, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
});

test("pilot analyzer rejects parser ranges that are not safe integers", () => {
  const response = JSON.stringify({
    kind: "supported",
    entity_name: "gateStatus",
    parameter_name: "code",
    guard_text: 'code === "ready"',
    guard_value: "ready",
    return_text: 'return "ok"',
    return_value: "ok",
    invocation: 'gateStatus("ready")',
    entity_range: { start_line: 1e20, start_column: 0, end_line: 1e20, end_column: 1 },
    guard_range: { start_line: 1e20, start_column: 0, end_line: 1e20, end_column: 1 },
    return_range: { start_line: 1e20, start_column: 0, end_line: 1e20, end_column: 1 },
  });
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1],
    parser_command: {
      command: NODE_EXECUTABLE,
      args: ["-e", `process.stdout.write(${JSON.stringify(response)})`],
    },
    path: PATH,
    source: 'export function gateStatus(code: string): string { if (code === "ready") return "ok"; return "hold"; }\n',
  });

  assert.deepStrictEqual(result, {
    kind: "failed",
    reason: "parse_failed",
  });
});

test("pilot analyzer rejects parser columns past the source line", () => {
  const response = JSON.stringify({
    kind: "supported",
    entity_name: "gateStatus",
    parameter_name: "code",
    guard_text: 'code === "ready"',
    guard_value: "ready",
    return_text: 'return "ok"',
    return_value: "ok",
    invocation: 'gateStatus("ready")',
    entity_range: {
      start_line: 1,
      start_column: 0,
      end_line: 1,
      end_column: Number.MAX_SAFE_INTEGER,
    },
    guard_range: { start_line: 1, start_column: 0, end_line: 1, end_column: 1 },
    return_range: { start_line: 1, start_column: 1, end_line: 1, end_column: 2 },
  });
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1],
    parser_command: {
      command: NODE_EXECUTABLE,
      args: ["-e", `process.stdout.write(${JSON.stringify(response)})`],
    },
    path: PATH,
    source: 'export function gateStatus(code: string): string { if (code === "ready") return "ok"; return "hold"; }\n',
  });

  assert.deepStrictEqual(result, {
    kind: "failed",
    reason: "parse_failed",
  });
});

test("pilot analyzer rejects evidence ranges outside the parsed entity", () => {
  const source = [
    'export function gateStatus(code: string): string { if (code === "ready") return "ok"; return "hold"; }',
    "const extra = 1;",
    "",
  ].join("\n");
  const response = JSON.stringify({
    kind: "supported",
    entity_name: "gateStatus",
    parameter_name: "code",
    guard_text: 'code === "ready"',
    guard_value: "ready",
    return_text: 'return "ok"',
    return_value: "ok",
    invocation: 'gateStatus("ready")',
    entity_range: { start_line: 1, start_column: 0, end_line: 1, end_column: 20 },
    guard_range: { start_line: 2, start_column: 0, end_line: 2, end_column: 5 },
    return_range: { start_line: 1, start_column: 1, end_line: 1, end_column: 4 },
  });
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [2],
    parser_command: {
      command: NODE_EXECUTABLE,
      args: ["-e", `process.stdout.write(${JSON.stringify(response)})`],
    },
    path: PATH,
    source,
  });

  assert.deepStrictEqual(result, {
    kind: "failed",
    reason: "parse_failed",
  });
});

test("pilot analyzer rejects parser semantics that disagree with the source spans", () => {
  const source = 'export function gateStatus(code: string): string { if (code === "ready") return "ok"; return "hold"; }\n';
  const entityStart = source.indexOf("function");
  const entityEnd = source.lastIndexOf("}") + 1;
  const guardText = 'code === "ready"';
  const guardStart = source.indexOf(guardText);
  const returnText = 'return "ok"';
  const returnStart = source.indexOf(returnText);
  const response = JSON.stringify({
    kind: "supported",
    entity_name: "gateStatus",
    parameter_name: "code",
    guard_text: guardText,
    guard_value: "ready",
    return_text: '"no"',
    return_value: "no",
    invocation: 'gateStatus("ready")',
    entity_range: {
      start_line: 1,
      start_column: entityStart,
      end_line: 1,
      end_column: entityEnd,
    },
    guard_range: {
      start_line: 1,
      start_column: guardStart,
      end_line: 1,
      end_column: guardStart + guardText.length,
    },
    return_range: {
      start_line: 1,
      start_column: returnStart,
      end_line: 1,
      end_column: returnStart + returnText.length,
    },
  });
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1],
    parser_command: {
      command: NODE_EXECUTABLE,
      args: ["-e", `process.stdout.write(${JSON.stringify(response)})`],
    },
    path: PATH,
    source,
  });

  assert.deepStrictEqual(result, {
    kind: "failed",
    reason: "parse_failed",
  });
});

test("pilot analyzer rejects an entity name taken from a comment", () => {
  const source = 'export function gateStatus(code: string): string { /* function fake( */ if (code === "ready") return "ok"; return "hold"; }\n';
  const entityStart = source.indexOf("function");
  const entityEnd = source.lastIndexOf("}") + 1;
  const guardText = 'code === "ready"';
  const guardStart = source.indexOf(guardText);
  const returnText = 'return "ok"';
  const returnStart = source.indexOf(returnText);
  const response = JSON.stringify({
    kind: "supported",
    entity_name: "fake",
    parameter_name: "code",
    guard_text: guardText,
    guard_value: "ready",
    return_text: '"ok"',
    return_value: "ok",
    invocation: 'fake("ready")',
    entity_range: {
      start_line: 1,
      start_column: entityStart,
      end_line: 1,
      end_column: entityEnd,
    },
    guard_range: {
      start_line: 1,
      start_column: guardStart,
      end_line: 1,
      end_column: guardStart + guardText.length,
    },
    return_range: {
      start_line: 1,
      start_column: returnStart,
      end_line: 1,
      end_column: returnStart + returnText.length,
    },
  });
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1],
    parser_command: {
      command: NODE_EXECUTABLE,
      args: ["-e", `process.stdout.write(${JSON.stringify(response)})`],
    },
    path: PATH,
    source,
  });

  assert.deepStrictEqual(result, {
    kind: "failed",
    reason: "parse_failed",
  });
});

test("pilot analyzer does not execute a repository preload from NODE_OPTIONS", () => {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skia-preload-"));
  const marker = path.join(repositoryRoot, "preload-ran");
  fs.writeFileSync(
    path.join(repositoryRoot, "preload.cjs"),
    `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");\n`,
  );
  const env = process.env as Record<string, string | undefined>;
  const previousOptions = env.NODE_OPTIONS;
  const previousPath = env.NODE_PATH;
  const previousCwd = process.cwd();
  env.NODE_OPTIONS = "--require ./preload.cjs";
  env.NODE_PATH = repositoryRoot;
  process.chdir(repositoryRoot);
  try {
    analyzeLiteralGuardFunction({
      blob_oid: BLOB_OID,
      changed_lines: [1, 2, 3, 4],
      path: PATH,
      source: [
        "export function gateStatus(code: string): string {",
        '  if (code === "ready") return "ok";',
        '  return "hold";',
        "}",
        "",
      ].join("\n"),
    });
  } finally {
    process.chdir(previousCwd);
    if (previousOptions === undefined) {
      delete env.NODE_OPTIONS;
    } else {
      env.NODE_OPTIONS = previousOptions;
    }
    if (previousPath === undefined) {
      delete env.NODE_PATH;
    } else {
      env.NODE_PATH = previousPath;
    }
  }

  assert.strictEqual(fs.existsSync(marker), false);
});

test("pilot analyzer reports parser process failures as failed analysis", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1],
    parser_command: {
      command: NODE_EXECUTABLE,
      args: ["-e", "process.exit(1)"],
    },
    path: PATH,
    source: "export function gateStatus() {}\n",
  });

  assert.deepStrictEqual(result, {
    kind: "failed",
    reason: "parse_failed",
  });
});

test("pilot analyzer preserves parser-child internal failures", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1],
    parser_command: {
      command: NODE_EXECUTABLE,
      args: [
        "-e",
        'process.stdout.write(\'{"kind":"failed","reason":"parse_failed"}\\n\')',
      ],
    },
    path: PATH,
    source: "export function gateStatus() {}\n",
  });

  assert.deepStrictEqual(result, {
    kind: "failed",
    reason: "parse_failed",
  });
});

test("pilot analyzer rejects sources whose derived fields exceed receipt limits", () => {
  const literal = "x".repeat(4_096);
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4],
    path: PATH,
    source: [
      "export function gateStatus(code: string): string {",
      `  if (code === ${JSON.stringify(literal)}) return "ok";`,
      '  return "hold";',
      "}",
    ].join("\n"),
  });

  assert.deepStrictEqual(result, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
});

test("pilot analyzer requires the changed range to overlap guard and return", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1],
    path: PATH,
    source: fs.readFileSync(
      path.join(FIXTURE_DIRECTORY, "literal-guard.ts"),
      "utf8",
    ),
  });

  assert.deepStrictEqual(result, {
    kind: "unsupported",
    reason: "unmapped_region",
  });
});

test("prediction is persisted before source-derived feedback becomes available", () => {
  const analysis = analyzeFixture();
  const session = createPredictionSession(analysis);
  const events: string[] = [];

  assert.throws(() => session.sourceCheck(), /persisted prediction/i);

  const sealed = session.persistPrediction(
    { kind: "return_value", value: "ok" },
    (record) => {
      events.push(`persist:${JSON.stringify(record.prediction.value)}`);
    },
    new Date("2026-09-22T00:00:00Z"),
  );

  assert.strictEqual(sealed.sealed_at, "2026-09-22T00:00:00Z");
  events.push(`feedback:${session.sourceCheck().status}`);
  assert.deepStrictEqual(events, [
    'persist:"ok"',
    "feedback:source_derived_match",
  ]);
});

test("failed prediction persistence keeps source feedback sealed", () => {
  const session = createPredictionSession(analyzeFixture());

  assert.throws(
    () =>
      session.persistPrediction(
        { kind: "return_value", value: "ok" },
        () => {
          throw new Error("disk full");
        },
      ),
    /disk full/,
  );
  assert.throws(() => session.sourceCheck(), /persisted prediction/i);
});

test("source-derived check distinguishes mismatch without claiming correctness", () => {
  const session = createPredictionSession(analyzeFixture());

  session.persistPrediction(
    { kind: "return_value", value: "hold" },
    () => undefined,
  );

  assert.deepStrictEqual(session.sourceCheck(), {
    status: "source_derived_mismatch",
    expected: "ok",
    predicted: "hold",
  });
});

test("pilot evidence escapes literal control characters in terminal-safe relation text", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4, 5, 6, 7],
    path: PATH,
    source: [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready\\nFORGED") {',
      '    return "ok";',
      "  }",
      "",
      '  return "hold";',
      "}",
    ].join("\n"),
  });

  assert.strictEqual(result.kind, "supported");
  if (result.kind !== "supported") {
    return;
  }
  assert.strictEqual(
    result.evidence.relation,
    'code === "ready\\nFORGED" -> return "ok"',
  );
  assert.strictEqual(result.evidence.relation.includes("\n"), false);
});

test("source checking canonicalizes negative zero as a JSON scalar", () => {
  const result = analyzeLiteralGuardFunction({
    blob_oid: BLOB_OID,
    changed_lines: [1, 2, 3, 4],
    path: PATH,
    source: [
      "export function gateStatus(code: number): number {",
      "  if (code === -1e-999) return -0;",
      "  return 1;",
      "}",
    ].join("\n"),
  });
  assert.strictEqual(result.kind, "supported");
  if (result.kind !== "supported") {
    return;
  }
  const session = createPredictionSession(result);
  session.persistPrediction(
    { kind: "return_value", value: 0 },
    () => undefined,
  );

  assert.deepStrictEqual(session.sourceCheck(), {
    status: "source_derived_match",
    expected: 0,
    predicted: 0,
  });
  assert.strictEqual(Object.is(result.scenario.given.value, -0), false);
  assert.strictEqual(Object.is(result.expected_return, -0), false);
});
