import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import { SOURCE_LANGUAGES } from "../src/types.js";
import {
  validateCoverageEnvelope,
  validateRepositoryManifest,
  validateSnapshotIdentity,
  validateStagedReceipt,
} from "../src/schema.js";

const FIXTURE_DIRECTORY = path.join(process.cwd(), "fixtures/schema");

function readFixture<T>(filename: string): T {
  const fixturePath = path.join(FIXTURE_DIRECTORY, filename);
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as T;
}

function expectInvalid(
  validation:
    | ReturnType<typeof validateSnapshotIdentity>
    | ReturnType<typeof validateCoverageEnvelope>
    | ReturnType<typeof validateStagedReceipt>
    | ReturnType<typeof validateRepositoryManifest>,
  expectedFragment: string,
): void {
  if (validation.valid) {
    throw new Error("expected validation to fail");
  }

  const errorText = validation.errors
    .map((error: { readonly message: string }) => error.message)
    .join("\n");
  assert.strictEqual(new RegExp(expectedFragment).test(errorText), true, errorText);
}

test("domain source-language discriminants remain frozen", () => {
  assert.deepStrictEqual(SOURCE_LANGUAGES, ["typescript", "tsx", "python"]);
});

test("schema snapshot identity accepts the valid staged fixture", () => {
  const fixture = readFixture<unknown>("valid-snapshot-identity.json");
  const validation = validateSnapshotIdentity(fixture);

  assert.strictEqual(validation.valid, true);
});

test("schema snapshot identity rejects a present base state without a base commit", () => {
  const fixture = readFixture<unknown>("invalid-snapshot-identity-base-state.json");
  const validation = validateSnapshotIdentity(fixture);

  expectInvalid(validation, "base_commit");
});

test("schema snapshot identity rejects Windows absolute and control-character paths", () => {
  const fixture = readFixture<Record<string, unknown>>("valid-snapshot-identity.json");
  const snapshot = fixture as {
    readonly entries: Array<Record<string, unknown>>;
  };
  snapshot.entries[0] = {
    ...snapshot.entries[0],
    path: "C:\\tmp\\example.ts",
  };

  expectInvalid(validateSnapshotIdentity(fixture), "pattern");
});

test("schema coverage accepts internally consistent event arithmetic", () => {
  const fixture = readFixture<unknown>("valid-coverage.json");
  const validation = validateCoverageEnvelope(fixture);

  assert.strictEqual(validation.valid, true);
});

test("schema coverage rejects mismatched summary arithmetic", () => {
  const fixture = readFixture<unknown>("invalid-coverage-summary.json");
  const validation = validateCoverageEnvelope(fixture);

  expectInvalid(validation, "summary");
});

test("schema coverage rejects units above Number.MAX_SAFE_INTEGER", () => {
  const fixture = readFixture<{
    readonly summary: Record<string, unknown>;
    readonly events: Array<Record<string, unknown>>;
  }>("valid-coverage.json");
  fixture.summary.total_units = Number.MAX_SAFE_INTEGER + 1;
  fixture.summary.supported_units = Number.MAX_SAFE_INTEGER + 1;
  fixture.events[0] = {
    ...fixture.events[0],
    units: Number.MAX_SAFE_INTEGER + 1,
  };

  expectInvalid(validateCoverageEnvelope(fixture), "must be <= 9007199254740991");
});

test("schema coverage rejects aggregate arithmetic above Number.MAX_SAFE_INTEGER", () => {
  const fixture = {
    summary: {
      total_units: Number.MAX_SAFE_INTEGER,
      supported_units: Number.MAX_SAFE_INTEGER,
      partial_units: 1,
      unmapped_units: 0,
      unsupported_units: 0,
      excluded_units: 0,
      failed_units: 0,
      unchecked_units: 0,
    },
    events: [
      {
        id: "coverage-max-safe",
        coverage: "supported",
        units: Number.MAX_SAFE_INTEGER,
        reason: null,
        path: "src/example.ts",
        language: "typescript",
        anchors: [],
      },
      {
        id: "coverage-one-more",
        coverage: "partial",
        units: 1,
        reason: "syntax_error",
        path: "src/example.ts",
        language: "typescript",
        anchors: [],
      },
    ],
  };

  expectInvalid(
    validateCoverageEnvelope(fixture),
    "coverage event unit aggregates must not exceed Number.MAX_SAFE_INTEGER",
  );
});

test("schema coverage fixtures keep partial, unsupported, failed, and unchecked inputs visible", () => {
  const fixture = readFixture<{
    readonly summary: {
      readonly total_units: number;
      readonly supported_units: number;
      readonly partial_units: number;
      readonly unmapped_units: number;
      readonly unsupported_units: number;
      readonly excluded_units: number;
      readonly failed_units: number;
      readonly unchecked_units: number;
    };
    readonly events: readonly {
      readonly coverage: string;
    }[];
  }>("valid-coverage-visibility.json");
  const validation = validateCoverageEnvelope(fixture);

  assert.strictEqual(validation.valid, true);
  assert.deepStrictEqual(
    fixture.events.map((event) => event.coverage),
    ["partial", "unsupported", "failed", "unchecked", "unchecked"],
  );
  assert.deepStrictEqual(fixture.summary, {
    total_units: 5,
    supported_units: 0,
    partial_units: 1,
    unmapped_units: 0,
    unsupported_units: 1,
    excluded_units: 0,
    failed_units: 1,
    unchecked_units: 2,
  });
});

test("schema staged receipt accepts the valid fixture envelope", () => {
  const fixture = readFixture<unknown>("valid-staged-receipt.json");
  const validation = validateStagedReceipt(fixture);

  assert.strictEqual(validation.valid, true);
});

test("schema staged receipt rejects impossible calendar timestamps", () => {
  const fixture = readFixture<Record<string, unknown>>("valid-staged-receipt.json");
  fixture.completed_at = "2026-02-29T01:02:03Z";

  expectInvalid(validateStagedReceipt(fixture), "real UTC calendar timestamp");
});

test("schema staged receipt rejects impossible calendar run IDs", () => {
  const fixture = readFixture<Record<string, unknown>>("valid-staged-receipt.json");
  fixture.run_id = "20260229T010203Z";

  expectInvalid(validateStagedReceipt(fixture), "run_id must be a real UTC calendar timestamp");
});

test("schema staged receipt rejects repository snapshots in the staged envelope", () => {
  const fixture = readFixture<unknown>("invalid-staged-receipt-snapshot-kind.json");
  const validation = validateStagedReceipt(fixture);

  expectInvalid(validation, "staged");
});

test("schema staged receipt rejects artifact hashes whose paths do not include the receipt run id", () => {
  const fixture = readFixture<unknown>("invalid-staged-receipt-artifact-hash-path.json");
  const validation = validateStagedReceipt(fixture);

  expectInvalid(validation, "canonical staged artifact path");
});

test("schema staged receipt rejects artifact paths outside its canonical run/session namespace", () => {
  const fixture = readFixture<Record<string, unknown>>("valid-staged-receipt.json");
  fixture.artifact_hashes = [
    ...(fixture.artifact_hashes as readonly Record<string, unknown>[]),
    {
      kind: "hld",
      path: "dist/20260810T010203Z-01/run-metadata.json",
      sha256: "e".repeat(64),
    },
  ];

  expectInvalid(
    validateStagedReceipt(fixture),
    "canonical staged artifact path",
  );
});

test("schema snapshot rejects inconsistent checkout identity", () => {
  const fixture = readFixture<Record<string, unknown>>("valid-snapshot-identity.json");
  fixture.checkout = {
    state: "branch",
    branch_name: null,
  };

  expectInvalid(
    validateSnapshotIdentity(fixture),
    "branch checkout must include a branch_name",
  );
});

test("schema snapshot rejects mixed Git object ID formats", () => {
  const fixture = readFixture<Record<string, unknown>>("valid-staged-receipt.json");
  const snapshot = fixture.snapshot as {
    base_commit: string;
    entries: Array<Record<string, unknown>>;
  };
  snapshot.entries[0] = {
    ...snapshot.entries[0],
    snapshot_blob_oid: "e".repeat(64),
  };

  expectInvalid(
    validateSnapshotIdentity(snapshot),
    "snapshot Git object IDs must use one object format",
  );
});

test("schema staged receipt binds coverage anchors to staged snapshot entries", () => {
  const fixture = readFixture<Record<string, unknown>>("valid-staged-receipt.json");
  const coverage = fixture.coverage as {
    readonly events: Array<Record<string, unknown>>;
  };
  coverage.events[0] = {
    ...coverage.events[0],
    anchors: [
      {
        side: "staged",
        path: "src/example.ts",
        blob_oid: "4444444444444444444444444444444444444444",
        language: "typescript",
        start_line: 1,
        start_column: 0,
        end_line: 1,
        end_column: 1,
      },
    ],
  };

  expectInvalid(
    validateStagedReceipt(fixture),
    "coverage source anchors must match a staged snapshot entry",
  );
});

test("schema repository manifest accepts the valid fixture envelope", () => {
  const fixture = readFixture<unknown>("valid-repository-manifest.json");
  const validation = validateRepositoryManifest(fixture);

  assert.strictEqual(validation.valid, true);
});

test("schema repository manifest rejects impossible calendar run IDs", () => {
  const fixture = readFixture<Record<string, unknown>>("valid-repository-manifest.json");
  fixture.run_id = "20261310T010203Z";

  expectInvalid(validateRepositoryManifest(fixture), "run_id must be a real UTC calendar timestamp");
});

test("schema repository manifest requires every artifact kind descriptor", () => {
  const fixture = readFixture<{
    readonly artifacts: readonly Record<string, unknown>[];
  } & Record<string, unknown>>("valid-repository-manifest.json");
  const withoutHld = {
    ...fixture,
    artifacts: fixture.artifacts.filter((artifact) => artifact.kind !== "hld"),
  };

  expectInvalid(validateRepositoryManifest(withoutHld), "contain at least 1");
});

test("schema repository manifest rejects coverage and card references that do not resolve", () => {
  const fixture = readFixture<unknown>("invalid-repository-manifest-artifacts.json");
  const validation = validateRepositoryManifest(fixture);

  expectInvalid(
    validation,
    "coverage_file must resolve to a complete coverage artifact in the manifest",
  );
});

test("schema repository manifest binds coverage anchors to repository snapshot entries", () => {
  const fixture = readFixture<Record<string, unknown>>("valid-repository-manifest.json") as {
    readonly coverage: {
      readonly events: Array<Record<string, unknown>>;
    };
  } & Record<string, unknown>;
  fixture.coverage.events[0] = {
    id: "coverage-1",
    coverage: "supported",
    units: 1,
    reason: null,
    path: "src/example.ts",
    language: "typescript",
    anchors: [
      {
        side: "repository",
        path: "src/example.ts",
        blob_oid: "4444444444444444444444444444444444444444",
        language: "typescript",
        start_line: 1,
        start_column: 0,
        end_line: 1,
        end_column: 1,
      },
    ],
  };

  expectInvalid(
    validateRepositoryManifest(fixture),
    "coverage source anchors must match a repository snapshot entry",
  );
});

test("schema repository manifest requires canonical artifact paths for each kind", () => {
  const fixture = readFixture<{
    readonly artifacts: Array<Record<string, unknown>>;
  } & Record<string, unknown>>("valid-repository-manifest.json");
  fixture.artifacts[0] = {
    ...fixture.artifacts[0],
    path: "archive/20260810T010203Z/repo-hld-20260810T010203Z.md",
  };

  expectInvalid(
    validateRepositoryManifest(fixture),
    "manifest artifact path must be the canonical path for its kind and run_id",
  );
});

test("schema repository manifest rejects incomplete terminal manifests", () => {
  const fixture = readFixture<Record<string, unknown>>("valid-repository-manifest.json");
  fixture.status = "incomplete";
  fixture.completed_at = null;

  expectInvalid(validateRepositoryManifest(fixture), "repository manifests must be terminal");
});

test("schema repository manifest rejects cards_file references that do not resolve", () => {
  const fixture = readFixture<unknown>("invalid-repository-manifest-cards-file.json");
  const validation = validateRepositoryManifest(fixture);

  expectInvalid(
    validation,
    "cards_file must resolve to a complete behavior_cards artifact in the manifest",
  );
});
