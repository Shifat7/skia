import assert from "node:assert/strict";
import fs from "node:fs";
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

test("pilot analyzer rejects nested and async functions", () => {
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

  assert.deepStrictEqual(nested, {
    kind: "unsupported",
    reason: "no_supported_staged_entity",
  });
  assert.deepStrictEqual(asyncFunction, {
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
      "  if (code === 0) return -0;",
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
});
