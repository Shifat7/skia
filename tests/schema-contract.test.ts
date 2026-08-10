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

test("schema staged receipt accepts the valid fixture envelope", () => {
  const fixture = readFixture<unknown>("valid-staged-receipt.json");
  const validation = validateStagedReceipt(fixture);

  assert.strictEqual(validation.valid, true);
});

test("schema staged receipt rejects repository snapshots in the staged envelope", () => {
  const fixture = readFixture<unknown>("invalid-staged-receipt-snapshot-kind.json");
  const validation = validateStagedReceipt(fixture);

  expectInvalid(validation, "staged");
});

test("schema repository manifest accepts the valid fixture envelope", () => {
  const fixture = readFixture<unknown>("valid-repository-manifest.json");
  const validation = validateRepositoryManifest(fixture);

  assert.strictEqual(validation.valid, true);
});

test("schema repository manifest rejects coverage and card references that do not resolve", () => {
  const fixture = readFixture<unknown>("invalid-repository-manifest-artifacts.json");
  const validation = validateRepositoryManifest(fixture);

  expectInvalid(validation, "coverage_file");
});
