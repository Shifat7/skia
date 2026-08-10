import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import type {
  CoverageEnvelope,
  GitObjectId,
  RepositoryManifest,
  RepositoryRelativePath,
  RepositorySnapshotIdentity,
  RunArtifactPath,
  RunId,
  Sha256Hex,
  StagedReceipt,
} from "../src/types.js";
import {
  RUN_METADATA_FILENAME,
  allocateRepositoryRun,
  completeRepositoryRun,
  deleteRun,
  inspectRun,
  listRuns,
  writeArtifactFile,
  writeStagedReceipt,
} from "../src/storage.js";
import {
  deriveRepositoryArtifactPath,
  deriveRepositoryManifestPath,
  validateRelativePath,
  validateSessionId,
} from "../src/paths.js";

const FIXTURE_DIRECTORY = path.join(process.cwd(), "fixtures/schema");
const TEMP_PREFIX = "/private/tmp/skia-task3-";

function readFixture<T>(filename: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIRECTORY, filename), "utf8"),
  ) as T;
}

function createTempRepository(): string {
  const repositoryRoot = fs.mkdtempSync(TEMP_PREFIX);
  fs.mkdirSync(path.join(repositoryRoot, ".git"));
  return repositoryRoot;
}

function brand<T>(value: string): T {
  return value as T;
}

function createRepositorySnapshotIdentity(): RepositorySnapshotIdentity {
  return {
    kind: "repository",
    commit_oid: brand<GitObjectId>("a".repeat(40)),
    tree_sha256: brand<Sha256Hex>("b".repeat(64)),
    working_changes_included: false,
    entries: [
      {
        path: validateRelativePath("src/example.ts") as RepositoryRelativePath,
        mode: "100644",
        language: "typescript",
        base_blob_oid: brand<GitObjectId>("c".repeat(40)),
        snapshot_blob_oid: brand<GitObjectId>("d".repeat(40)),
      },
    ],
  };
}

function createRepositoryManifest(
  runId: RunId,
  coveragePath: RunArtifactPath,
  coverageSha: Sha256Hex,
  cardsPath: RunArtifactPath,
  cardsSha: Sha256Hex,
): RepositoryManifest {
  return {
    schema_version: 1,
    run_id: runId,
    status: "partial",
    completed_at: "2026-08-10T01:02:05Z",
    snapshot: createRepositorySnapshotIdentity(),
    coverage: readFixture<CoverageEnvelope>("valid-coverage.json"),
    artifacts: [
      {
        kind: "hld",
        path: brand<RunArtifactPath>(`repo-hld-${runId}.md`),
        state: "not_available",
        not_available_reason: "agent_consent_declined",
      },
      {
        kind: "lld",
        path: brand<RunArtifactPath>(`repo-lld-${runId}.md`),
        state: "not_available",
        not_available_reason: "agent_consent_declined",
      },
      {
        kind: "collapsed_evidence",
        path: brand<RunArtifactPath>(`repo-collapsed-evidence-${runId}.md`),
        state: "not_available",
        not_available_reason: "agent_consent_declined",
      },
      {
        kind: "behavior_cards",
        path: cardsPath,
        state: "complete",
        sha256: cardsSha,
      },
      {
        kind: "coverage",
        path: coveragePath,
        state: "complete",
        sha256: coverageSha,
      },
    ],
    coverage_file: coveragePath,
    cards_file: cardsPath,
    errors: [],
    privacy_caveat: "Local-only artifact. Explicit deletion is required.",
  };
}

function createStagedReceipt(runId: RunId): StagedReceipt {
  const fixture = readFixture<StagedReceipt>("valid-staged-receipt.json");

  return {
    ...fixture,
    run_id: runId,
    session_id: validateSessionId("8f5d1a2c"),
    artifact_hashes: [
      {
        kind: "receipt",
        path: brand<RunArtifactPath>(`receipts/${runId}-8f5d1a2c-session.json`),
        sha256: brand<Sha256Hex>("e".repeat(64)),
      },
    ],
  };
}

test("repository run allocation writes incomplete metadata before artifacts and uses deterministic collision suffixes", () => {
  const repositoryRoot = createTempRepository();
  const createdAt = new Date("2026-08-10T01:02:03Z");

  const firstRun = allocateRepositoryRun(
    repositoryRoot,
    createRepositorySnapshotIdentity(),
    createdAt,
  );
  const metadataPath = path.join(firstRun.runDirectoryPath, RUN_METADATA_FILENAME);

  assert.ok(fs.existsSync(metadataPath));
  assert.deepStrictEqual(listRuns(repositoryRoot), [
    {
      run_id: "20260810T010203Z",
      mode: "repo_review",
      status: "incomplete",
      created_at: "2026-08-10T01:02:03Z",
      completed_at: null,
      snapshot_identifier: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      artifact_bytes: 0,
    },
  ]);

  const secondRun = allocateRepositoryRun(
    repositoryRoot,
    createRepositorySnapshotIdentity(),
    createdAt,
  );

  assert.strictEqual(secondRun.runId, "20260810T010203Z-01");
});

test("repository run allocation rejects symlinked output roots", () => {
  const repositoryRoot = createTempRepository();
  const externalTarget = fs.mkdtempSync(TEMP_PREFIX);

  fs.mkdirSync(path.join(repositoryRoot, ".skia"));
  fs.symlinkSync(externalTarget, path.join(repositoryRoot, ".skia", "dist"));

  assert.throws(
    () =>
      allocateRepositoryRun(
        repositoryRoot,
        createRepositorySnapshotIdentity(),
        new Date("2026-08-10T01:02:03Z"),
      ),
    /symlink/i,
  );
});

test("artifact writes are create-new, reject nested symlink traversal, and fail closed on run-id exhaustion", () => {
  const repositoryRoot = createTempRepository();
  const run = allocateRepositoryRun(
    repositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T01:02:03Z"),
  );
  const coveragePath = deriveRepositoryArtifactPath(run.runId, "coverage");
  const cardsPath = deriveRepositoryArtifactPath(run.runId, "behavior_cards");
  const coverageJson = JSON.stringify(readFixture<CoverageEnvelope>("valid-coverage.json"));

  writeArtifactFile(run, coveragePath, coverageJson);
  const cardsWrite = writeArtifactFile(run, cardsPath, "{\"cards\":[]}");

  assert.throws(
    () => writeArtifactFile(run, coveragePath, coverageJson),
    /create-new|exist/i,
  );

  const externalTarget = fs.mkdtempSync(TEMP_PREFIX);
  fs.symlinkSync(externalTarget, path.join(run.runDirectoryPath, "linked"));
  assert.throws(
    () => writeArtifactFile(run, brand<RunArtifactPath>("linked/escape.txt"), "blocked"),
    /symlink/i,
  );

  const exhaustedRepositoryRoot = createTempRepository();
  const exhaustedDistRoot = path.join(exhaustedRepositoryRoot, ".skia", "dist");
  fs.mkdirSync(path.join(exhaustedRepositoryRoot, ".skia"));
  fs.mkdirSync(exhaustedDistRoot);

  for (let suffix = 0; suffix <= 99; suffix += 1) {
    const directoryName =
      suffix === 0
        ? "20260810T010203Z"
        : `20260810T010203Z-${suffix.toString().padStart(2, "0")}`;
    fs.mkdirSync(path.join(exhaustedDistRoot, directoryName));
  }

  assert.throws(
    () =>
      allocateRepositoryRun(
        exhaustedRepositoryRoot,
        createRepositorySnapshotIdentity(),
        new Date("2026-08-10T01:02:03Z"),
      ),
    /run_id_exhausted/i,
  );
});

test("repository completion validates hashes and coverage schema before writing the manifest", () => {
  const repositoryRoot = createTempRepository();
  const run = allocateRepositoryRun(
    repositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T01:02:03Z"),
  );
  const coveragePath = deriveRepositoryArtifactPath(run.runId, "coverage");
  const cardsPath = deriveRepositoryArtifactPath(run.runId, "behavior_cards");
  const coverageJson = JSON.stringify(readFixture<CoverageEnvelope>("valid-coverage.json"));

  writeArtifactFile(run, coveragePath, coverageJson);
  const cardsWrite = writeArtifactFile(run, cardsPath, "{\"cards\":[]}");

  assert.throws(
    () =>
      completeRepositoryRun(
        run,
        createRepositoryManifest(
          run.runId,
          coveragePath,
          brand<Sha256Hex>("0".repeat(64)),
          cardsPath,
          cardsWrite.sha256,
        ),
      ),
    /sha256|hash/i,
  );
  assert.strictEqual(
    fs.existsSync(path.join(run.runDirectoryPath, deriveRepositoryManifestPath(run.runId))),
    false,
  );

  const schemaRepositoryRoot = createTempRepository();
  const schemaRun = allocateRepositoryRun(
    schemaRepositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T01:02:03Z"),
  );
  const invalidCoveragePath = deriveRepositoryArtifactPath(schemaRun.runId, "coverage");
  const invalidCardsPath = deriveRepositoryArtifactPath(schemaRun.runId, "behavior_cards");
  const invalidCoverageWrite = writeArtifactFile(
    schemaRun,
    invalidCoveragePath,
    JSON.stringify(readFixture<CoverageEnvelope>("invalid-coverage-summary.json")),
  );
  const invalidCardsWrite = writeArtifactFile(schemaRun, invalidCardsPath, "{\"cards\":[]}");

  assert.throws(
    () =>
      completeRepositoryRun(
        schemaRun,
        createRepositoryManifest(
          schemaRun.runId,
          invalidCoveragePath,
          invalidCoverageWrite.sha256,
          invalidCardsPath,
          invalidCardsWrite.sha256,
        ),
      ),
    /coverage artifact validation failed/i,
  );
});

test("repository completion writes a manifest only after validated artifacts, and list/inspect cover repository and receipt runs without reading artifact content", () => {
  const repositoryRoot = createTempRepository();
  const run = allocateRepositoryRun(
    repositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T01:02:03Z"),
  );
  const coveragePath = deriveRepositoryArtifactPath(run.runId, "coverage");
  const cardsPath = deriveRepositoryArtifactPath(run.runId, "behavior_cards");
  const coverageWrite = writeArtifactFile(
    run,
    coveragePath,
    JSON.stringify(readFixture<CoverageEnvelope>("valid-coverage.json")),
  );
  const cardsWrite = writeArtifactFile(run, cardsPath, "{\"cards\":[]}");

  completeRepositoryRun(
    run,
    createRepositoryManifest(
      run.runId,
      coveragePath,
      coverageWrite.sha256,
      cardsPath,
      cardsWrite.sha256,
    ),
  );

  writeStagedReceipt(
    repositoryRoot,
    createStagedReceipt(brand<RunId>("20260810T020304Z")),
  );

  const listedRuns = listRuns(repositoryRoot);
  assert.strictEqual(listedRuns.length, 2);
  assert.deepStrictEqual(
    listedRuns.map((entry) => entry.run_id),
    ["20260810T010203Z", "20260810T020304Z"],
  );

  const inspectedRepositoryRun = inspectRun(repositoryRoot, run.runId);
  if (inspectedRepositoryRun.kind !== "repo_review") {
    throw new Error("expected repository run inspection");
  }
  assert.strictEqual(inspectedRepositoryRun.manifest?.run_id, run.runId);
  assert.strictEqual(inspectedRepositoryRun.manifest_path, deriveRepositoryManifestPath(run.runId));

  const inspectedReceiptRun = inspectRun(repositoryRoot, "20260810T020304Z");
  if (inspectedReceiptRun.kind !== "review") {
    throw new Error("expected staged receipt inspection");
  }
  assert.strictEqual(inspectedReceiptRun.receipt.run_id, "20260810T020304Z");
});

test("run deletion removes exactly one run and reports partial deletion failures beneath .skia", () => {
  const repositoryRoot = createTempRepository();
  const firstRun = allocateRepositoryRun(
    repositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T01:02:03Z"),
  );
  const secondRun = allocateRepositoryRun(
    repositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T01:02:04Z"),
  );

  const deleteResult = deleteRun(repositoryRoot, firstRun.runId);
  assert.deepStrictEqual(deleteResult, {
    deleted: true,
    remaining_paths: [],
  });
  assert.strictEqual(fs.existsSync(firstRun.runDirectoryPath), false);
  assert.strictEqual(fs.existsSync(secondRun.runDirectoryPath), true);

  const blockedRun = allocateRepositoryRun(
    repositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T01:02:05Z"),
  );
  fs.writeFileSync(path.join(blockedRun.runDirectoryPath, "leftover.txt"), "blocked", "utf8");
  fs.chmodSync(blockedRun.runDirectoryPath, 0o500);

  const blockedDelete = deleteRun(repositoryRoot, blockedRun.runId);

  fs.chmodSync(blockedRun.runDirectoryPath, 0o700);
  fs.rmSync(blockedRun.runDirectoryPath, { recursive: true, force: true });

  assert.strictEqual(blockedDelete.deleted, false);
  assert.ok(blockedDelete.remaining_paths.length > 0);
  assert.match(blockedDelete.remaining_paths[0] ?? "", /dist\/20260810T010205Z/);
});
