import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
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
  setStorageTestHooks,
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
  deriveRepositoryRunDirectory,
  deriveStagedArtifactPath,
  deriveStagedReceiptPath,
  validateRelativePath,
  validateSessionId,
} from "../src/paths.js";

const FIXTURE_DIRECTORY = path.join(process.cwd(), "fixtures/schema");
const TEMP_PREFIX = path.join(os.tmpdir(), "skia-task3-");

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

function absoluteSkiaPath(repositoryRoot: string, relativePath: string): string {
  return path.join(repositoryRoot, ".skia", relativePath);
}

function permissionsMask(statsMode: number): number {
  return statsMode & 0o777;
}

function snapshotRepositoryTree(repositoryRoot: string): readonly string[] {
  const entries: string[] = [];

  function visit(currentPath: string, relativePath: string): void {
    const stats = fs.lstatSync(currentPath);
    entries.push(relativePath);

    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      return;
    }

    for (const entryName of [...fs.readdirSync(currentPath)].sort()) {
      const childRelativePath = relativePath.length === 0
        ? entryName
        : path.join(relativePath, entryName);
      visit(path.join(currentPath, entryName), childRelativePath);
    }
  }

  for (const entryName of [...fs.readdirSync(repositoryRoot)].sort()) {
    visit(path.join(repositoryRoot, entryName), entryName);
  }

  return entries;
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
  coverage: CoverageEnvelope = repositoryCoverageFixture(),
  snapshot: RepositorySnapshotIdentity = createRepositorySnapshotIdentity(),
): RepositoryManifest {
  return {
    schema_version: 1,
    run_id: runId,
    status: "partial",
    completed_at: "2026-08-10T01:02:05Z",
    snapshot,
    coverage,
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

function repositoryCoverageFixture(): CoverageEnvelope {
  const coverage = readFixture<CoverageEnvelope>("valid-coverage.json");

  return {
    ...coverage,
    events: coverage.events.map((event) => ({
      ...event,
      anchors: event.anchors.map((anchor) => ({
        ...anchor,
        side: "repository" as const,
        blob_oid: brand<GitObjectId>("d".repeat(40)),
      })),
    })),
  };
}

function createStagedReceipt(
  runId: RunId,
  sessionId: string = "8f5d1a2c",
  extraArtifactHashes: StagedReceipt["artifact_hashes"] = [],
): StagedReceipt {
  const fixture = readFixture<StagedReceipt>("valid-staged-receipt.json");
  const validatedSessionId = validateSessionId(sessionId);
  const receiptWithoutSelf = {
    ...fixture,
    run_id: runId,
    session_id: validatedSessionId,
    artifact_hashes: extraArtifactHashes,
  } satisfies StagedReceipt;
  const receiptHash = createHash("sha256")
    .update(`${JSON.stringify(receiptWithoutSelf, null, 2)}\n`)
    .digest("hex");

  return {
    ...receiptWithoutSelf,
    artifact_hashes: [
      ...extraArtifactHashes,
      {
        kind: "receipt",
        path: deriveStagedReceiptPath(runId, validatedSessionId),
        sha256: brand<Sha256Hex>(receiptHash),
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

test("repository completion rejects a manifest for a snapshot different from the allocation", () => {
  const repositoryRoot = createTempRepository();
  const run = allocateRepositoryRun(
    repositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T01:02:03Z"),
  );
  const mismatchedSnapshot: RepositorySnapshotIdentity = {
    ...run.snapshot,
    commit_oid: brand<GitObjectId>("f".repeat(40)),
  };

  assert.throws(
    () =>
      completeRepositoryRun(
        run,
        createRepositoryManifest(
          run.runId,
          brand<RunArtifactPath>(`repo-coverage-${run.runId}.json`),
          brand<Sha256Hex>("a".repeat(64)),
          brand<RunArtifactPath>(`repo-cards-${run.runId}.json`),
          brand<Sha256Hex>("b".repeat(64)),
          undefined,
          mismatchedSnapshot,
        ),
      ),
    /snapshot does not match/i,
  );
});

test("listRuns and inspectRun stay read-only on a fresh repository", () => {
  const repositoryRoot = createTempRepository();

  assert.deepStrictEqual(listRuns(repositoryRoot), []);
  assert.strictEqual(fs.existsSync(path.join(repositoryRoot, ".skia")), false);

  assert.throws(
    () => inspectRun(repositoryRoot, "20260810T010203Z"),
    /does not exist beneath \.skia/i,
  );
  assert.strictEqual(fs.existsSync(path.join(repositoryRoot, ".skia")), false);
});

test("inspectRun rejects a symlinked .skia root before reading external repository-run metadata", () => {
  const repositoryRoot = createTempRepository();
  const externalStorageRoot = fs.mkdtempSync(TEMP_PREFIX);
  const externalRunDirectory = path.join(
    externalStorageRoot,
    "dist",
    "20260810T010203Z",
  );

  fs.mkdirSync(path.join(externalStorageRoot, "dist"));
  fs.mkdirSync(externalRunDirectory);
  fs.writeFileSync(
    path.join(externalRunDirectory, RUN_METADATA_FILENAME),
    "{not-json",
    "utf8",
  );
  fs.symlinkSync(externalStorageRoot, path.join(repositoryRoot, ".skia"));

  assert.throws(
    () => inspectRun(repositoryRoot, "20260810T010203Z"),
    /symlink/i,
  );
});

test("inspectRun rejects symlinked metadata, manifest, and staged receipt leaf files", () => {
  const metadataRepositoryRoot = createTempRepository();
  const metadataRun = allocateRepositoryRun(
    metadataRepositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T01:02:03Z"),
  );
  const externalMetadataPath = path.join(
    fs.mkdtempSync(TEMP_PREFIX),
    RUN_METADATA_FILENAME,
  );
  fs.writeFileSync(
    externalMetadataPath,
    fs.readFileSync(metadataRun.metadataPath),
  );
  fs.rmSync(metadataRun.metadataPath, { force: true });
  fs.symlinkSync(externalMetadataPath, metadataRun.metadataPath);

  assert.throws(
    () => inspectRun(metadataRepositoryRoot, metadataRun.runId),
    /symlink|regular file/i,
  );

  const manifestRepositoryRoot = createTempRepository();
  const manifestRun = allocateRepositoryRun(
    manifestRepositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T01:02:03Z"),
  );
  const externalManifestPath = path.join(
    fs.mkdtempSync(TEMP_PREFIX),
    deriveRepositoryManifestPath(manifestRun.runId),
  );
  fs.writeFileSync(
    externalManifestPath,
    `${JSON.stringify(
      createRepositoryManifest(
        manifestRun.runId,
        deriveRepositoryArtifactPath(manifestRun.runId, "coverage"),
        brand<Sha256Hex>("a".repeat(64)),
        deriveRepositoryArtifactPath(manifestRun.runId, "behavior_cards"),
        brand<Sha256Hex>("b".repeat(64)),
      ),
      null,
      2,
    )}\n`,
    "utf8",
  );
  fs.symlinkSync(externalManifestPath, manifestRun.manifestPath);

  assert.throws(
    () => inspectRun(manifestRepositoryRoot, manifestRun.runId),
    /symlink|regular file/i,
  );

  const receiptRepositoryRoot = createTempRepository();
  const receiptRunId = brand<RunId>("20260810T020304Z");
  const receipt = createStagedReceipt(receiptRunId);
  const receiptWrite = writeStagedReceipt(receiptRepositoryRoot, receipt);
  const externalReceiptPath = path.join(
    fs.mkdtempSync(TEMP_PREFIX),
    "20260810T020304Z-8f5d1a2c-session.json",
  );
  fs.writeFileSync(
    externalReceiptPath,
    fs.readFileSync(receiptWrite.path),
  );
  fs.rmSync(receiptWrite.path, { force: true });
  fs.symlinkSync(externalReceiptPath, receiptWrite.path);

  assert.throws(
    () => inspectRun(receiptRepositoryRoot, receiptRunId),
    /symlink|regular file/i,
  );
});

test("listRuns tolerates a partially allocated run directory without metadata and surfaces it as incomplete", () => {
  const repositoryRoot = createTempRepository();
  const partialRunDirectory = path.join(
    repositoryRoot,
    ".skia",
    deriveRepositoryRunDirectory(brand<RunId>("20260810T010203Z")),
  );

  fs.mkdirSync(path.join(repositoryRoot, ".skia"));
  fs.mkdirSync(path.join(repositoryRoot, ".skia", "dist"));
  fs.mkdirSync(partialRunDirectory);

  assert.deepStrictEqual(listRuns(repositoryRoot), [
    {
      run_id: "20260810T010203Z",
      mode: "repo_review",
      status: "incomplete",
      created_at: "2026-08-10T01:02:03Z",
      completed_at: null,
      snapshot_identifier: "not_available",
      artifact_bytes: 0,
    },
  ]);

  const inspectedRun = inspectRun(repositoryRoot, "20260810T010203Z");
  if (inspectedRun.kind !== "repo_review") {
    throw new Error("expected partial repository run inspection");
  }
  assert.strictEqual(inspectedRun.metadata, null);
  assert.strictEqual(inspectedRun.manifest, null);
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

test("storage rejects group or world writable existing .skia directories where POSIX mode bits are available", () => {
  if (process.platform === "win32") {
    return;
  }

  const skiaRootRepository = createTempRepository();
  fs.mkdirSync(path.join(skiaRootRepository, ".skia"), 0o777);
  fs.chmodSync(path.join(skiaRootRepository, ".skia"), 0o777);

  assert.throws(
    () => listRuns(skiaRootRepository),
    /unsafe_permissions/i,
  );

  const leafRepository = createTempRepository();
  fs.mkdirSync(path.join(leafRepository, ".skia"), 0o700);
  fs.mkdirSync(path.join(leafRepository, ".skia", "dist"), 0o770);
  fs.chmodSync(path.join(leafRepository, ".skia", "dist"), 0o770);

  assert.throws(
    () => allocateRepositoryRun(
      leafRepository,
      createRepositorySnapshotIdentity(),
      new Date("2026-08-10T01:02:03Z"),
    ),
    /unsafe_permissions/i,
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
  const coverageJson = JSON.stringify(repositoryCoverageFixture());

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
  const coverageJson = JSON.stringify(repositoryCoverageFixture());

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

  const symlinkRepositoryRoot = createTempRepository();
  const symlinkRun = allocateRepositoryRun(
    symlinkRepositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T01:02:03Z"),
  );
  const symlinkCoveragePath = deriveRepositoryArtifactPath(symlinkRun.runId, "coverage");
  const symlinkCardsPath = deriveRepositoryArtifactPath(symlinkRun.runId, "behavior_cards");

  writeArtifactFile(
    symlinkRun,
    symlinkCoveragePath,
    JSON.stringify(repositoryCoverageFixture()),
  );
  writeArtifactFile(symlinkRun, symlinkCardsPath, "{\"cards\":[]}");

  fs.rmSync(path.join(symlinkRun.runDirectoryPath, symlinkCardsPath), { force: true });
  fs.symlinkSync(
    fs.mkdtempSync(TEMP_PREFIX),
    path.join(symlinkRun.runDirectoryPath, symlinkCardsPath),
  );

  assert.throws(
    () =>
      completeRepositoryRun(
        symlinkRun,
        createRepositoryManifest(
          symlinkRun.runId,
          symlinkCoveragePath,
          brand<Sha256Hex>("0".repeat(64)),
          symlinkCardsPath,
          brand<Sha256Hex>("1".repeat(64)),
        ),
      ),
    /symlink/i,
  );
  assert.strictEqual(
    fs.existsSync(path.join(symlinkRun.runDirectoryPath, deriveRepositoryManifestPath(symlinkRun.runId))),
    false,
  );
});

test("repository completion rejects divergence between inline and coverage artifact envelopes", () => {
  const repositoryRoot = createTempRepository();
  const run = allocateRepositoryRun(
    repositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T01:02:03Z"),
  );
  const coveragePath = deriveRepositoryArtifactPath(run.runId, "coverage");
  const cardsPath = deriveRepositoryArtifactPath(run.runId, "behavior_cards");
  const coverage = repositoryCoverageFixture();
  const coverageWrite = writeArtifactFile(run, coveragePath, JSON.stringify(coverage));
  const cardsWrite = writeArtifactFile(run, cardsPath, "{\"cards\":[]}");
  const divergentCoverage = readFixture<CoverageEnvelope>("valid-coverage-visibility.json");

  assert.throws(
    () =>
      completeRepositoryRun(
        run,
        createRepositoryManifest(
          run.runId,
          coveragePath,
          coverageWrite.sha256,
          cardsPath,
          cardsWrite.sha256,
          divergentCoverage,
        ),
      ),
    /inline manifest coverage/i,
  );
});

test("repository completion rejects incomplete manifests before writing the manifest file", () => {
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
    JSON.stringify(repositoryCoverageFixture()),
  );
  const cardsWrite = writeArtifactFile(run, cardsPath, "{\"cards\":[]}");
  const incompleteManifest = {
    ...createRepositoryManifest(
      run.runId,
      coveragePath,
      coverageWrite.sha256,
      cardsPath,
      cardsWrite.sha256,
    ),
    status: "incomplete",
    completed_at: null,
  } satisfies RepositoryManifest;

  assert.throws(
    () => completeRepositoryRun(run, incompleteManifest),
    /incomplete|terminal/i,
  );
  assert.strictEqual(fs.existsSync(run.manifestPath), false);
});

test("storage rejects impossible calendar run IDs at read and delete entry points", () => {
  const repositoryRoot = createTempRepository();

  assert.throws(
    () => inspectRun(repositoryRoot, "20260229T010203Z"),
    /real UTC calendar timestamp|invalid run ID/i,
  );
  assert.throws(
    () => deleteRun(repositoryRoot, "20260229T010203Z"),
    /real UTC calendar timestamp|invalid run ID/i,
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
    JSON.stringify(repositoryCoverageFixture()),
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

test("staged receipt run-id claims stay unique under interleaved writers", () => {
  const repositoryRoot = createTempRepository();
  const runId = brand<RunId>("20260810T020304Z");
  let nestedWriteError: unknown = null;
  let nestedWriteTriggered = false;

  setStorageTestHooks({
    afterRunIdClaim: ({ mode, runId: claimedRunId }) => {
      if (mode !== "review" || claimedRunId !== runId || nestedWriteTriggered) {
        return;
      }

      nestedWriteTriggered = true;

      try {
        writeStagedReceipt(repositoryRoot, createStagedReceipt(runId, "9f6e2b3d"));
      } catch (error) {
        nestedWriteError = error as Error;
      }
    },
  });

  try {
    writeStagedReceipt(repositoryRoot, createStagedReceipt(runId, "8f5d1a2c"));
  } finally {
    setStorageTestHooks(null);
  }

  assert.ok(nestedWriteError instanceof Error);
  if (!(nestedWriteError instanceof Error)) {
    throw new Error("expected the nested staged receipt write to fail");
  }
  assert.match(nestedWriteError.message, /already reserves run_id|already has a staged receipt/i);
  assert.deepStrictEqual(
    [...fs.readdirSync(absoluteSkiaPath(repositoryRoot, "receipts"))].sort(),
    ["20260810T020304Z-8f5d1a2c-session.json"],
  );

  const inspectedReceiptRun = inspectRun(repositoryRoot, runId);
  if (inspectedReceiptRun.kind !== "review") {
    throw new Error("expected staged receipt inspection");
  }
  assert.strictEqual(inspectedReceiptRun.receipt.session_id, "8f5d1a2c");
});

test("staged receipt lookup parses exact run and session components from filenames", () => {
  const repositoryRoot = createTempRepository();
  const suffixedRunId = brand<RunId>("20260810T020304Z-01");

  writeStagedReceipt(repositoryRoot, createStagedReceipt(suffixedRunId, "8f5d1a2c"));

  assert.throws(
    () => inspectRun(repositoryRoot, "20260810T020304Z"),
    /does not exist beneath \.skia/i,
  );

  const inspectedRun = inspectRun(repositoryRoot, suffixedRunId);
  if (inspectedRun.kind !== "review") {
    throw new Error("expected staged receipt inspection");
  }
  assert.strictEqual(inspectedRun.receipt.run_id, suffixedRunId);
  assert.strictEqual(inspectedRun.receipt.session_id, "8f5d1a2c");
});

test("staged receipt lookup rejects a filename whose envelope identity differs", () => {
  const repositoryRoot = createTempRepository();
  const runId = brand<RunId>("20260810T020304Z");
  const receipt = createStagedReceipt(runId, "8f5d1a2c");
  const receiptWrite = writeStagedReceipt(repositoryRoot, receipt);
  const mismatchedPath = path.join(
    path.dirname(receiptWrite.path),
    "20260810T020304Z-9f6e2b3d-session.json",
  );

  fs.renameSync(receiptWrite.path, mismatchedPath);

  assert.throws(
    () => inspectRun(repositoryRoot, runId),
    /filename .* does not match its envelope identity/i,
  );
});

test("receipt deletion fails closed on symlinked artifact ancestors", () => {
  const repositoryRoot = createTempRepository();
  const runId = brand<RunId>("20260810T030407Z");
  const artifactPath = deriveStagedArtifactPath(
    runId,
    validateSessionId("8f5d1a2c"),
    "hld",
  );
  const externalRoot = fs.mkdtempSync(TEMP_PREFIX);
  const linkedPath = absoluteSkiaPath(repositoryRoot, "artifacts");
  const artifactAbsolutePath = absoluteSkiaPath(repositoryRoot, artifactPath);
  fs.mkdirSync(path.dirname(artifactAbsolutePath), { recursive: true });
  fs.writeFileSync(artifactAbsolutePath, "# hld\n", "utf8");
  const artifactSha = createHash("sha256").update("# hld\n").digest("hex");

  const receipt = createStagedReceipt(runId, "8f5d1a2c", [
    {
      kind: "hld",
      path: artifactPath,
      sha256: brand<Sha256Hex>(artifactSha),
    },
  ]);

  writeStagedReceipt(repositoryRoot, receipt);
  fs.renameSync(linkedPath, `${linkedPath}-moved`);
  fs.symlinkSync(externalRoot, linkedPath);

  assert.throws(
    () => deleteRun(repositoryRoot, runId),
    /symlink/i,
  );
  assert.strictEqual(fs.readdirSync(externalRoot).length, 0);
});

test("staged receipts reject a duplicate run ID before the run becomes ambiguous to inspect or delete", () => {
  const repositoryRoot = createTempRepository();
  const runId = brand<RunId>("20260810T020304Z");

  writeStagedReceipt(repositoryRoot, createStagedReceipt(runId, "8f5d1a2c"));

  assert.throws(
    () => writeStagedReceipt(repositoryRoot, createStagedReceipt(runId, "9f6e2b3d")),
    /already reserves run_id|already has a staged receipt/i,
  );
  assert.deepStrictEqual(
    [...fs.readdirSync(absoluteSkiaPath(repositoryRoot, "receipts"))].sort(),
    ["20260810T020304Z-8f5d1a2c-session.json"],
  );

  const inspectedReceiptRun = inspectRun(repositoryRoot, runId);
  if (inspectedReceiptRun.kind !== "review") {
    throw new Error("expected staged receipt inspection");
  }
  assert.strictEqual(inspectedReceiptRun.receipt.session_id, "8f5d1a2c");
  assert.deepStrictEqual(deleteRun(repositoryRoot, runId), {
    deleted: true,
    remaining_paths: [],
  });
});

test("deleteRun removes receipt-owned artifacts before receipt and claim, and retries partial artifact deletion", () => {
  const repositoryRoot = createTempRepository();
  const runId = brand<RunId>("20260810T030405Z");
  const sessionId = "8f5d1a2c";
  const artifactPath = brand<RunArtifactPath>(`artifacts/${runId}-${sessionId}-hld.md`);
  const artifactContents = "# hld\n";
  const artifactAbsolutePath = absoluteSkiaPath(repositoryRoot, artifactPath);
  const artifactDirectory = path.dirname(artifactAbsolutePath);

  fs.mkdirSync(artifactDirectory, { recursive: true });
  fs.writeFileSync(artifactAbsolutePath, artifactContents, "utf8");
  const artifactSha = createHash("sha256").update(artifactContents).digest("hex");
  writeStagedReceipt(
    repositoryRoot,
    createStagedReceipt(runId, sessionId, [
      {
        kind: "hld",
        path: artifactPath,
        sha256: brand<Sha256Hex>(artifactSha),
      },
    ]),
  );

  fs.chmodSync(artifactDirectory, 0o500);
  const partialDelete = deleteRun(repositoryRoot, runId);
  fs.chmodSync(artifactDirectory, 0o700);

  assert.strictEqual(partialDelete.deleted, false);
  assert.deepStrictEqual(partialDelete.remaining_paths, [artifactPath]);
  assert.strictEqual(fs.existsSync(artifactAbsolutePath), true);
  assert.strictEqual(
    fs.existsSync(absoluteSkiaPath(repositoryRoot, `receipts/${runId}-${sessionId}-session.json`)),
    true,
  );
  assert.strictEqual(
    fs.existsSync(absoluteSkiaPath(repositoryRoot, `run-ids/${runId}.json`)),
    true,
  );

  assert.deepStrictEqual(deleteRun(repositoryRoot, runId), {
    deleted: true,
    remaining_paths: [],
  });
  assert.strictEqual(fs.existsSync(artifactAbsolutePath), false);
  assert.strictEqual(
    fs.existsSync(absoluteSkiaPath(repositoryRoot, `receipts/${runId}-${sessionId}-session.json`)),
    false,
  );
  assert.strictEqual(
    fs.existsSync(absoluteSkiaPath(repositoryRoot, `run-ids/${runId}.json`)),
    false,
  );
});

test("staged receipt writes verify stored artifact hashes and use a non-self-referential receipt hash", () => {
  const repositoryRoot = createTempRepository();
  const runId = brand<RunId>("20260810T030405Z");
  const artifactPath = deriveStagedArtifactPath(runId, validateSessionId("8f5d1a2c"), "hld");
  const artifactContents = "# hld\n";
  const artifactAbsolutePath = absoluteSkiaPath(repositoryRoot, artifactPath);
  fs.mkdirSync(path.dirname(artifactAbsolutePath), { recursive: true });
  fs.writeFileSync(artifactAbsolutePath, artifactContents, "utf8");
  const artifactSha = createHash("sha256").update(artifactContents).digest("hex");

  writeStagedReceipt(
    repositoryRoot,
    createStagedReceipt(runId, "8f5d1a2c", [
      {
        kind: "hld",
        path: artifactPath,
        sha256: brand<Sha256Hex>(artifactSha),
      },
    ]),
  );

  const badReceipt = createStagedReceipt(
    brand<RunId>("20260810T030406Z"),
    "8f5d1a2c",
  );
  const receiptArtifact = badReceipt.artifact_hashes[0];
  if (receiptArtifact === undefined) {
    throw new Error("expected a receipt artifact hash");
  }

  assert.throws(
    () =>
      writeStagedReceipt(repositoryRoot, {
        ...badReceipt,
        artifact_hashes: [
          {
            ...receiptArtifact,
            sha256: brand<Sha256Hex>("0".repeat(64)),
          },
        ],
      }),
    /non-self-referential|receipt artifact hash/i,
  );
});

test("repository runs and staged receipts share one exact run-id namespace and legacy cross-mode collisions fail closed", () => {
  const receiptFirstRepositoryRoot = createTempRepository();
  const sharedRunId = brand<RunId>("20260810T020304Z");

  writeStagedReceipt(
    receiptFirstRepositoryRoot,
    createStagedReceipt(sharedRunId, "8f5d1a2c"),
  );

  const suffixedRepositoryRun = allocateRepositoryRun(
    receiptFirstRepositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T02:03:04Z"),
  );
  assert.strictEqual(suffixedRepositoryRun.runId, "20260810T020304Z-01");

  const repositoryFirstRoot = createTempRepository();
  const repositoryRun = allocateRepositoryRun(
    repositoryFirstRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T02:03:04Z"),
  );

  assert.throws(
    () => writeStagedReceipt(repositoryFirstRoot, createStagedReceipt(repositoryRun.runId)),
    /already reserves run_id|already has a staged receipt/i,
  );

  const legacyCollisionRepositoryRoot = createTempRepository();
  const legacyRun = allocateRepositoryRun(
    legacyCollisionRepositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T02:03:04Z"),
  );
  const legacyReceiptPath = absoluteSkiaPath(
    legacyCollisionRepositoryRoot,
    "receipts/20260810T020304Z-8f5d1a2c-session.json",
  );
  fs.mkdirSync(path.dirname(legacyReceiptPath), { recursive: true });
  fs.writeFileSync(
    legacyReceiptPath,
    `${JSON.stringify(createStagedReceipt(legacyRun.runId), null, 2)}\n`,
    "utf8",
  );

  assert.throws(
    () => inspectRun(legacyCollisionRepositoryRoot, legacyRun.runId),
    /matches both a repository run and staged receipt/i,
  );
  assert.throws(
    () => deleteRun(legacyCollisionRepositoryRoot, legacyRun.runId),
    /matches both a repository run and staged receipt/i,
  );
  assert.strictEqual(fs.existsSync(legacyRun.runDirectoryPath), true);
  assert.strictEqual(fs.existsSync(legacyReceiptPath), true);
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

test("deleteRun can retry an exact run ID after claim-file cleanup was the only partial failure", () => {
  const repositoryRoot = createTempRepository();
  const run = allocateRepositoryRun(
    repositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T01:02:03Z"),
  );
  const runIdsRoot = absoluteSkiaPath(repositoryRoot, "run-ids");

  fs.chmodSync(runIdsRoot, 0o500);
  const partialDelete = deleteRun(repositoryRoot, run.runId);
  fs.chmodSync(runIdsRoot, 0o700);

  assert.deepStrictEqual(partialDelete, {
    deleted: false,
    remaining_paths: [`run-ids/${run.runId}.json`],
  });
  assert.strictEqual(fs.existsSync(run.runDirectoryPath), false);
  assert.strictEqual(
    fs.existsSync(absoluteSkiaPath(repositoryRoot, `run-ids/${run.runId}.json`)),
    true,
  );

  assert.deepStrictEqual(deleteRun(repositoryRoot, run.runId), {
    deleted: true,
    remaining_paths: [],
  });
  assert.strictEqual(
    fs.existsSync(absoluteSkiaPath(repositoryRoot, `run-ids/${run.runId}.json`)),
    false,
  );
});

test("deleteRun stays read-only on fresh repositories and missing IDs", () => {
  const freshRepositoryRoot = createTempRepository();
  const freshBefore = snapshotRepositoryTree(freshRepositoryRoot);

  assert.throws(
    () => deleteRun(freshRepositoryRoot, "20260810T010203Z"),
    /does not exist beneath \.skia/i,
  );
  assert.deepStrictEqual(snapshotRepositoryTree(freshRepositoryRoot), freshBefore);
  assert.strictEqual(fs.existsSync(path.join(freshRepositoryRoot, ".skia")), false);

  const distOnlyRepositoryRoot = createTempRepository();
  allocateRepositoryRun(
    distOnlyRepositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T01:02:03Z"),
  );
  const distOnlyBefore = snapshotRepositoryTree(distOnlyRepositoryRoot);

  assert.throws(
    () => deleteRun(distOnlyRepositoryRoot, "20260810T020304Z"),
    /does not exist beneath \.skia/i,
  );
  assert.deepStrictEqual(snapshotRepositoryTree(distOnlyRepositoryRoot), distOnlyBefore);
  assert.strictEqual(
    fs.existsSync(path.join(distOnlyRepositoryRoot, ".skia", "receipts")),
    false,
  );

  const receiptsOnlyRepositoryRoot = createTempRepository();
  writeStagedReceipt(
    receiptsOnlyRepositoryRoot,
    createStagedReceipt(brand<RunId>("20260810T010203Z")),
  );
  const receiptsOnlyBefore = snapshotRepositoryTree(receiptsOnlyRepositoryRoot);

  assert.throws(
    () => deleteRun(receiptsOnlyRepositoryRoot, "20260810T020304Z"),
    /does not exist beneath \.skia/i,
  );
  assert.deepStrictEqual(snapshotRepositoryTree(receiptsOnlyRepositoryRoot), receiptsOnlyBefore);
  assert.strictEqual(
    fs.existsSync(path.join(receiptsOnlyRepositoryRoot, ".skia", "dist")),
    false,
  );
});

test("storage roots, run directories, metadata, and artifacts request owner-only permissions where supported", () => {
  const repositoryRoot = createTempRepository();
  const run = allocateRepositoryRun(
    repositoryRoot,
    createRepositorySnapshotIdentity(),
    new Date("2026-08-10T01:02:03Z"),
  );
  const coveragePath = deriveRepositoryArtifactPath(run.runId, "coverage");

  writeArtifactFile(
    run,
    coveragePath,
    JSON.stringify(readFixture<CoverageEnvelope>("valid-coverage.json")),
  );
  writeStagedReceipt(
    repositoryRoot,
    createStagedReceipt(brand<RunId>("20260810T020304Z")),
  );

  assert.strictEqual(
    permissionsMask(fs.statSync(absoluteSkiaPath(repositoryRoot, "")).mode),
    0o700,
  );
  assert.strictEqual(
    permissionsMask(fs.statSync(absoluteSkiaPath(repositoryRoot, "dist")).mode),
    0o700,
  );
  assert.strictEqual(
    permissionsMask(fs.statSync(absoluteSkiaPath(repositoryRoot, "receipts")).mode),
    0o700,
  );
  assert.strictEqual(
    permissionsMask(fs.statSync(absoluteSkiaPath(repositoryRoot, "run-ids")).mode),
    0o700,
  );
  assert.strictEqual(permissionsMask(fs.statSync(run.runDirectoryPath).mode), 0o700);
  assert.strictEqual(permissionsMask(fs.statSync(run.metadataPath).mode), 0o600);
  assert.strictEqual(
    permissionsMask(
      fs.statSync(absoluteSkiaPath(repositoryRoot, "run-ids/20260810T010203Z.json")).mode,
    ),
    0o600,
  );
  assert.strictEqual(
    permissionsMask(
      fs.statSync(path.join(run.runDirectoryPath, coveragePath)).mode,
      ),
    0o600,
  );
  assert.strictEqual(
    permissionsMask(
      fs.statSync(
        absoluteSkiaPath(repositoryRoot, "receipts/20260810T020304Z-8f5d1a2c-session.json"),
      ).mode,
    ),
    0o600,
  );
});
