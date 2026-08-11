import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  DIST_DIRECTORY_NAME,
  LOCAL_DURABILITY_CAVEAT,
  LOCAL_RETENTION_CAVEAT,
  MAX_RUN_ID_COLLISION_SUFFIX,
  OWNER_DIRECTORY_MODE,
  OWNER_FILE_MODE,
  OWNER_PERMISSION_CAVEAT,
  RECEIPTS_DIRECTORY_NAME,
  RUN_METADATA_FILENAME,
  SKIA_DIRECTORY_NAME,
} from "./limits.js";
import {
  createdAtFromRunId,
  deriveRepositoryArtifactPath,
  deriveRepositoryManifestPath,
  deriveRepositoryRunDirectory,
  deriveStagedReceiptPath,
  formatRunIdAtUtc,
  validateRelativePath,
  validateRunArtifactPath,
  validateRunId,
} from "./paths.js";
import {
  validateCoverageEnvelope,
  validateRepositoryManifest,
  validateStagedReceipt,
} from "./schema.js";
import type {
  RepositoryManifest,
  RepositorySnapshotIdentity,
  RunArtifactPath,
  RunId,
  RunState,
  Sha256Hex,
  StagedReceipt,
} from "./types.js";

export { RUN_METADATA_FILENAME } from "./limits.js";

type RunMode = "review" | "repo_review";

export interface IncompleteRepositoryRunMetadata {
  readonly schema_version: 1;
  readonly mode: "repo_review";
  readonly run_id: RunId;
  readonly status: "incomplete";
  readonly created_at: string;
  readonly completed_at: null;
  readonly snapshot_identifier: string;
  readonly manifest_path: RunArtifactPath;
  readonly expected_artifact_paths: readonly RunArtifactPath[];
  readonly retention_caveat: string;
  readonly durability_caveat: string;
  readonly permissions_caveat: string;
}

export interface RepositoryRunAllocation {
  readonly runId: RunId;
  readonly runDirectoryPath: string;
  readonly metadataPath: string;
  readonly manifestPath: string;
}

export interface RunListEntry {
  readonly run_id: RunId;
  readonly mode: RunMode;
  readonly status: RunState;
  readonly created_at: string;
  readonly completed_at: string | null;
  readonly snapshot_identifier: string;
  readonly artifact_bytes: number;
}

export interface InspectedRepositoryRun {
  readonly kind: "repo_review";
  readonly run_id: RunId;
  readonly metadata: IncompleteRepositoryRunMetadata | null;
  readonly manifest_path: RunArtifactPath;
  readonly manifest: RepositoryManifest | null;
}

export interface InspectedReceiptRun {
  readonly kind: "review";
  readonly run_id: RunId;
  readonly receipt_path: RunArtifactPath;
  readonly receipt: StagedReceipt;
}

export type InspectedRun = InspectedRepositoryRun | InspectedReceiptRun;

export interface DeleteRunResult {
  readonly deleted: boolean;
  readonly remaining_paths: readonly string[];
}

export interface ArtifactWriteResult {
  readonly absolutePath: string;
  readonly bytes: number;
  readonly sha256: Sha256Hex;
}

function createStorageError(message: string): Error {
  return new Error(message);
}

function sha256Hex(data: string | Uint8Array): Sha256Hex {
  return createHash("sha256").update(data).digest("hex") as Sha256Hex;
}

function asBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
}

function parseJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function ensureDirectory(directoryPath: string, label: string): void {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { mode: OWNER_DIRECTORY_MODE });
  }

  const stats = fs.lstatSync(directoryPath);

  if (stats.isSymbolicLink()) {
    throw createStorageError(`${label} must not be a symlink`);
  }

  if (!stats.isDirectory()) {
    throw createStorageError(`${label} must be a directory`);
  }
}

function assertExistingDirectory(directoryPath: string, label: string): void {
  const stats = fs.lstatSync(directoryPath);

  if (stats.isSymbolicLink()) {
    throw createStorageError(`${label} must not be a symlink`);
  }

  if (!stats.isDirectory()) {
    throw createStorageError(`${label} must be a directory`);
  }
}

function ensureStorageRoots(repositoryRoot: string, leafDirectoryName: string): {
  readonly skiaRootPath: string;
  readonly leafRootPath: string;
} {
  const absoluteRepositoryRoot = path.resolve(repositoryRoot);
  const skiaRootPath = path.join(absoluteRepositoryRoot, SKIA_DIRECTORY_NAME);
  const leafRootPath = path.join(skiaRootPath, leafDirectoryName);

  ensureDirectory(skiaRootPath, ".skia root");
  ensureDirectory(leafRootPath, `.skia/${leafDirectoryName} root`);

  return {
    skiaRootPath,
    leafRootPath,
  };
}

function readStorageRoots(
  repositoryRoot: string,
  leafDirectoryName: string,
): { readonly skiaRootPath: string; readonly leafRootPath: string } | null {
  const absoluteRepositoryRoot = path.resolve(repositoryRoot);
  const skiaRootPath = path.join(absoluteRepositoryRoot, SKIA_DIRECTORY_NAME);

  if (!fs.existsSync(skiaRootPath)) {
    return null;
  }

  assertExistingDirectory(skiaRootPath, ".skia root");

  const leafRootPath = path.join(skiaRootPath, leafDirectoryName);

  if (!fs.existsSync(leafRootPath)) {
    return null;
  }

  assertExistingDirectory(leafRootPath, `.skia/${leafDirectoryName} root`);

  return {
    skiaRootPath,
    leafRootPath,
  };
}

function validateContainedPath(rootPath: string, relativePath: string): string {
  const safeRelativePath = validateRelativePath(relativePath);
  const absolutePath = path.resolve(rootPath, safeRelativePath);
  const normalizedRoot = path.resolve(rootPath);

  if (
    absolutePath !== normalizedRoot &&
    !absolutePath.startsWith(`${normalizedRoot}/`) &&
    !absolutePath.startsWith(`${normalizedRoot}\\`)
  ) {
    throw createStorageError(`path ${relativePath} escapes the protected .skia root`);
  }

  return absolutePath;
}

function assertNoSymlinkInPath(rootPath: string, absolutePath: string): void {
  const normalizedRootPath = path.resolve(rootPath);
  let currentPath = path.dirname(absolutePath);

  while (
    currentPath === normalizedRootPath ||
    currentPath.startsWith(`${normalizedRootPath}/`) ||
    currentPath.startsWith(`${normalizedRootPath}\\`)
  ) {
    if (fs.existsSync(currentPath) && fs.lstatSync(currentPath).isSymbolicLink()) {
      throw createStorageError("artifact path must not follow a symlink outside .skia");
    }

    if (currentPath === normalizedRootPath) {
      return;
    }

    currentPath = path.dirname(currentPath);
  }
}

function writeNewFile(filePath: string, data: string | Uint8Array): void {
  const bytes = asBytes(data);
  const fileDescriptor = fs.openSync(filePath, "wx", OWNER_FILE_MODE);

  try {
    fs.writeSync(fileDescriptor, bytes);
    fs.fsyncSync(fileDescriptor);
  } finally {
    fs.closeSync(fileDescriptor);
  }
}

function expectedRepositoryArtifactPaths(runId: RunId): readonly RunArtifactPath[] {
  return [
    deriveRepositoryArtifactPath(runId, "hld"),
    deriveRepositoryArtifactPath(runId, "lld"),
    deriveRepositoryArtifactPath(runId, "collapsed_evidence"),
    deriveRepositoryArtifactPath(runId, "behavior_cards"),
    deriveRepositoryArtifactPath(runId, "coverage"),
    deriveRepositoryManifestPath(runId),
  ];
}

function createIncompleteMetadata(
  runId: RunId,
  createdAt: string,
  snapshot: RepositorySnapshotIdentity,
): IncompleteRepositoryRunMetadata {
  return {
    schema_version: 1,
    mode: "repo_review",
    run_id: runId,
    status: "incomplete",
    created_at: createdAt,
    completed_at: null,
    snapshot_identifier: snapshot.commit_oid,
    manifest_path: deriveRepositoryManifestPath(runId),
    expected_artifact_paths: expectedRepositoryArtifactPaths(runId),
    retention_caveat: LOCAL_RETENTION_CAVEAT,
    durability_caveat: LOCAL_DURABILITY_CAVEAT,
    permissions_caveat: OWNER_PERMISSION_CAVEAT,
  };
}

function artifactAbsolutePath(
  runDirectoryPath: string,
  artifactPath: RunArtifactPath,
): string {
  return validateContainedPath(runDirectoryPath, artifactPath);
}

function totalArtifactBytes(runDirectoryPath: string): number {
  if (!fs.existsSync(runDirectoryPath)) {
    return 0;
  }

  let totalBytes = 0;

  for (const entryName of fs.readdirSync(runDirectoryPath)) {
    if (entryName === RUN_METADATA_FILENAME) {
      continue;
    }

    const entryPath = path.join(runDirectoryPath, entryName);
    const stats = fs.lstatSync(entryPath);

    if (stats.isSymbolicLink()) {
      throw createStorageError("run directory contains a symlinked artifact path");
    }

    if (stats.isFile()) {
      totalBytes += stats.size;
    }
  }

  return totalBytes;
}

function parseRepositoryMetadata(runDirectoryPath: string): IncompleteRepositoryRunMetadata {
  return parseJson<IncompleteRepositoryRunMetadata>(path.join(runDirectoryPath, RUN_METADATA_FILENAME));
}

function parseRepositoryMetadataOrNull(
  runDirectoryPath: string,
): IncompleteRepositoryRunMetadata | null {
  const metadataPath = path.join(runDirectoryPath, RUN_METADATA_FILENAME);

  if (!fs.existsSync(metadataPath)) {
    return null;
  }

  return parseRepositoryMetadata(runDirectoryPath);
}

function validateRepositoryManifestFile(filePath: string): RepositoryManifest {
  const manifest = parseJson<unknown>(filePath);
  const validation = validateRepositoryManifest(manifest);

  if (!validation.valid) {
    throw createStorageError(
      `repository manifest validation failed: ${validation.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }

  return validation.value;
}

function validateStagedReceiptFile(filePath: string): StagedReceipt {
  const receipt = parseJson<unknown>(filePath);
  const validation = validateStagedReceipt(receipt);

  if (!validation.valid) {
    throw createStorageError(
      `staged receipt validation failed: ${validation.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }

  return validation.value;
}

function relativePathUnderSkia(skiaRootPath: string, absolutePath: string): string {
  const normalizedSkiaRoot = path.resolve(skiaRootPath);
  const normalizedAbsolutePath = path.resolve(absolutePath);

  if (normalizedAbsolutePath === normalizedSkiaRoot) {
    return ".";
  }

  return normalizedAbsolutePath.slice(normalizedSkiaRoot.length + 1);
}

function collectRemainingPaths(
  skiaRootPath: string,
  absolutePath: string,
): readonly string[] {
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const stats = fs.lstatSync(absolutePath);

  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    return [relativePathUnderSkia(skiaRootPath, absolutePath)];
  }

  const remainingPaths: string[] = [relativePathUnderSkia(skiaRootPath, absolutePath)];

  for (const entryName of fs.readdirSync(absolutePath)) {
    remainingPaths.push(
      ...collectRemainingPaths(skiaRootPath, path.join(absolutePath, entryName)),
    );
  }

  return remainingPaths.sort();
}

function deleteTree(
  skiaRootPath: string,
  absolutePath: string,
): DeleteRunResult {
  const failures: string[] = [];

  function visit(entryPath: string): void {
    if (!fs.existsSync(entryPath)) {
      return;
    }

    const stats = fs.lstatSync(entryPath);

    if (stats.isDirectory() && !stats.isSymbolicLink()) {
      for (const childName of fs.readdirSync(entryPath)) {
        visit(path.join(entryPath, childName));
      }

      try {
        fs.rmdirSync(entryPath);
      } catch {
        failures.push(relativePathUnderSkia(skiaRootPath, entryPath));
      }

      return;
    }

    try {
      fs.unlinkSync(entryPath);
    } catch {
      failures.push(relativePathUnderSkia(skiaRootPath, entryPath));
    }
  }

  visit(absolutePath);

  const remainingPaths = failures.length === 0
    ? collectRemainingPaths(skiaRootPath, absolutePath)
    : collectRemainingPaths(skiaRootPath, absolutePath);

  return {
    deleted: remainingPaths.length === 0,
    remaining_paths: remainingPaths,
  };
}

function repositoryRunDirectoryPath(repositoryRoot: string, runId: RunId): string {
  const skiaRootPath = path.join(path.resolve(repositoryRoot), SKIA_DIRECTORY_NAME);
  return validateContainedPath(skiaRootPath, deriveRepositoryRunDirectory(runId));
}

function receiptFilePath(repositoryRoot: string, receipt: StagedReceipt): string {
  const { skiaRootPath } = ensureStorageRoots(repositoryRoot, RECEIPTS_DIRECTORY_NAME);
  return validateContainedPath(
    skiaRootPath,
    deriveStagedReceiptPath(receipt.run_id, receipt.session_id),
  );
}

function matchingReceiptNames(receiptsRootPath: string, runId: RunId): readonly string[] {
  return [...fs.readdirSync(receiptsRootPath)]
    .filter((entryName) => entryName.startsWith(`${runId}-`) && entryName.endsWith("-session.json"))
    .sort();
}

function resolveSingleReceiptName(
  runIdInput: string,
  runId: RunId,
  receiptNames: readonly string[],
): string | null {
  if (receiptNames.length === 0) {
    return null;
  }

  if (receiptNames.length > 1) {
    throw createStorageError(`run ${runIdInput} matches multiple staged receipts beneath .skia`);
  }

  const [receiptName] = receiptNames;

  if (receiptName === undefined) {
    throw createStorageError(`run ${runIdInput} does not exist beneath .skia`);
  }

  return receiptName;
}

function validateCoverageArtifact(runDirectoryPath: string, artifactPath: RunArtifactPath): void {
  const coverage = parseJson<unknown>(artifactAbsolutePath(runDirectoryPath, artifactPath));
  const validation = validateCoverageEnvelope(coverage);

  if (!validation.valid) {
    throw createStorageError(
      `coverage artifact validation failed: ${validation.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }
}

function validateCompleteArtifactPath(
  allocation: RepositoryRunAllocation,
  artifactPath: RunArtifactPath,
): string {
  const absolutePath = artifactAbsolutePath(allocation.runDirectoryPath, artifactPath);

  assertNoSymlinkInPath(allocation.runDirectoryPath, absolutePath);

  if (!fs.existsSync(absolutePath)) {
    throw createStorageError(`artifact ${artifactPath} is missing`);
  }

  const stats = fs.lstatSync(absolutePath);

  if (stats.isSymbolicLink()) {
    throw createStorageError(`artifact ${artifactPath} must not be a symlink`);
  }

  if (!stats.isFile()) {
    throw createStorageError(`artifact ${artifactPath} must be a regular file`);
  }

  return absolutePath;
}

function incompleteRunListEntryFromDirectory(runId: RunId, runDirectoryPath: string): RunListEntry {
  const metadata = parseRepositoryMetadataOrNull(runDirectoryPath);

  if (metadata !== null) {
    return {
      run_id: metadata.run_id,
      mode: metadata.mode,
      status: metadata.status,
      created_at: metadata.created_at,
      completed_at: metadata.completed_at,
      snapshot_identifier: metadata.snapshot_identifier,
      artifact_bytes: totalArtifactBytes(runDirectoryPath),
    };
  }

  return {
    run_id: runId,
    mode: "repo_review",
    status: "incomplete",
    created_at: createdAtFromRunId(runId),
    completed_at: null,
    snapshot_identifier: "not_available",
    artifact_bytes: totalArtifactBytes(runDirectoryPath),
  };
}

export function allocateRepositoryRun(
  repositoryRoot: string,
  snapshot: RepositorySnapshotIdentity,
  createdAt: Date = new Date(),
): RepositoryRunAllocation {
  const { leafRootPath } = ensureStorageRoots(repositoryRoot, DIST_DIRECTORY_NAME);
  const baseRunId = formatRunIdAtUtc(createdAt);
  const createdAtIso = createdAtFromRunId(baseRunId);

  for (let suffix = 0; suffix <= MAX_RUN_ID_COLLISION_SUFFIX; suffix += 1) {
    const runId = suffix === 0 ? baseRunId : formatRunIdAtUtc(createdAt, suffix);
    const runDirectoryPath = path.join(leafRootPath, runId);

    try {
      fs.mkdirSync(runDirectoryPath, { mode: OWNER_DIRECTORY_MODE });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (/exist/i.test(message)) {
        continue;
      }

      throw error;
    }

    const metadataPath = path.join(runDirectoryPath, RUN_METADATA_FILENAME);
    const metadata = createIncompleteMetadata(runId, createdAtIso, snapshot);
    writeNewFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

    return {
      runId,
      runDirectoryPath,
      metadataPath,
      manifestPath: path.join(runDirectoryPath, deriveRepositoryManifestPath(runId)),
    };
  }

  throw createStorageError("run_id_exhausted");
}

export function writeArtifactFile(
  allocation: RepositoryRunAllocation,
  artifactPath: RunArtifactPath,
  contents: string | Uint8Array,
): ArtifactWriteResult {
  const absolutePath = artifactAbsolutePath(
    allocation.runDirectoryPath,
    validateRunArtifactPath(artifactPath),
  );
  assertNoSymlinkInPath(allocation.runDirectoryPath, absolutePath);
  const bytes = asBytes(contents);

  writeNewFile(absolutePath, bytes);

  return {
    absolutePath,
    bytes: bytes.byteLength,
    sha256: sha256Hex(bytes),
  };
}

export function completeRepositoryRun(
  allocation: RepositoryRunAllocation,
  manifest: RepositoryManifest,
): { readonly manifestPath: string; readonly artifactBytes: number } {
  if (manifest.run_id !== allocation.runId) {
    throw createStorageError("repository manifest run_id does not match the allocated run");
  }

  const validation = validateRepositoryManifest(manifest);

  if (!validation.valid) {
    throw createStorageError(
      `repository manifest validation failed: ${validation.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }

  const completeArtifacts = manifest.artifacts
    .filter((artifact) => artifact.state === "complete")
    .map((artifact) => ({
      artifact,
      absolutePath: validateCompleteArtifactPath(allocation, artifact.path),
    }));

  for (const { artifact, absolutePath } of completeArtifacts) {
    const artifactBytes = fs.readFileSync(absolutePath);
    const actualSha256 = sha256Hex(artifactBytes);

    if (artifact.sha256 !== actualSha256) {
      throw createStorageError(`artifact ${artifact.path} sha256 does not match the manifest`);
    }

    if (artifact.kind === "coverage") {
      validateCoverageArtifact(allocation.runDirectoryPath, artifact.path);
    }
  }

  writeNewFile(allocation.manifestPath, `${JSON.stringify(validation.value, null, 2)}\n`);

  return {
    manifestPath: allocation.manifestPath,
    artifactBytes: totalArtifactBytes(allocation.runDirectoryPath),
  };
}

export function writeStagedReceipt(
  repositoryRoot: string,
  receipt: StagedReceipt,
): { readonly path: string; readonly bytes: number } {
  const validation = validateStagedReceipt(receipt);

  if (!validation.valid) {
    throw createStorageError(
      `staged receipt validation failed: ${validation.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }

  const existingReceiptsRoots = readStorageRoots(repositoryRoot, RECEIPTS_DIRECTORY_NAME);
  if (existingReceiptsRoots !== null) {
    const duplicateReceiptNames = matchingReceiptNames(
      existingReceiptsRoots.leafRootPath,
      validation.value.run_id,
    );

    if (duplicateReceiptNames.length > 0) {
      throw createStorageError(
        `run ${validation.value.run_id} already has a staged receipt beneath .skia`,
      );
    }
  }

  const absolutePath = receiptFilePath(repositoryRoot, validation.value);
  const serializedReceipt = `${JSON.stringify(validation.value, null, 2)}\n`;
  writeNewFile(absolutePath, serializedReceipt);

  return {
    path: absolutePath,
    bytes: asBytes(serializedReceipt).byteLength,
  };
}

export function listRuns(repositoryRoot: string): readonly RunListEntry[] {
  const runs: RunListEntry[] = [];
  const repositoryDistRoots = readStorageRoots(repositoryRoot, DIST_DIRECTORY_NAME);
  const repositoryReceiptsRoots = readStorageRoots(repositoryRoot, RECEIPTS_DIRECTORY_NAME);

  if (repositoryDistRoots !== null) {
    for (const entryName of [...fs.readdirSync(repositoryDistRoots.leafRootPath)].sort()) {
      let runId: RunId;

      try {
        runId = validateRunId(entryName);
      } catch {
        continue;
      }

      const runDirectoryPath = path.join(repositoryDistRoots.leafRootPath, entryName);
      const stats = fs.lstatSync(runDirectoryPath);

      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        continue;
      }

      const manifestPath = path.join(runDirectoryPath, deriveRepositoryManifestPath(runId));

      if (fs.existsSync(manifestPath)) {
        const manifest = validateRepositoryManifestFile(manifestPath);
        runs.push({
          run_id: manifest.run_id,
          mode: "repo_review",
          status: manifest.status,
          created_at: createdAtFromRunId(manifest.run_id),
          completed_at: manifest.completed_at,
          snapshot_identifier: manifest.snapshot.commit_oid,
          artifact_bytes: totalArtifactBytes(runDirectoryPath),
        });
        continue;
      }

      runs.push(incompleteRunListEntryFromDirectory(runId, runDirectoryPath));
    }
  }

  if (repositoryReceiptsRoots !== null) {
    for (const entryName of [...fs.readdirSync(repositoryReceiptsRoots.leafRootPath)].sort()) {
      const receiptPath = path.join(repositoryReceiptsRoots.leafRootPath, entryName);
      const stats = fs.lstatSync(receiptPath);

      if (!stats.isFile() || stats.isSymbolicLink()) {
        continue;
      }

      const receipt = validateStagedReceiptFile(receiptPath);
      runs.push({
        run_id: receipt.run_id,
        mode: "review",
        status: receipt.status,
        created_at: createdAtFromRunId(receipt.run_id),
        completed_at: receipt.completed_at,
        snapshot_identifier: receipt.snapshot.diff_sha256,
        artifact_bytes: stats.size,
      });
    }
  }

  return runs.sort((left, right) => left.run_id.localeCompare(right.run_id));
}

export function inspectRun(repositoryRoot: string, runIdInput: string): InspectedRun {
  const runId = validateRunId(runIdInput);
  const repositoryDistRoots = readStorageRoots(repositoryRoot, DIST_DIRECTORY_NAME);

  if (repositoryDistRoots !== null) {
    const runDirectoryPath = path.join(repositoryDistRoots.leafRootPath, runId);

    if (fs.existsSync(runDirectoryPath)) {
      const metadata = parseRepositoryMetadataOrNull(runDirectoryPath);
      const manifestPath = path.join(runDirectoryPath, deriveRepositoryManifestPath(runId));

      return {
        kind: "repo_review",
        run_id: runId,
        metadata,
        manifest_path: deriveRepositoryManifestPath(runId),
        manifest: fs.existsSync(manifestPath) ? validateRepositoryManifestFile(manifestPath) : null,
      };
    }
  }

  const receiptsRoots = readStorageRoots(repositoryRoot, RECEIPTS_DIRECTORY_NAME);

  if (receiptsRoots !== null) {
    const receiptName = resolveSingleReceiptName(
      runIdInput,
      runId,
      matchingReceiptNames(receiptsRoots.leafRootPath, runId),
    );

    if (receiptName !== null) {
      const absoluteReceiptPath = path.join(receiptsRoots.leafRootPath, receiptName);

      return {
        kind: "review",
        run_id: runId,
        receipt_path: validateRunArtifactPath(`receipts/${receiptName}`),
        receipt: validateStagedReceiptFile(absoluteReceiptPath),
      };
    }
  }

  throw createStorageError(`run ${runIdInput} does not exist beneath .skia`);
}

export function deleteRun(repositoryRoot: string, runIdInput: string): DeleteRunResult {
  const runId = validateRunId(runIdInput);
  const repositoryDistRoots = readStorageRoots(repositoryRoot, DIST_DIRECTORY_NAME);
  const receiptsRoots = readStorageRoots(repositoryRoot, RECEIPTS_DIRECTORY_NAME);

  if (repositoryDistRoots !== null) {
    const runDirectoryPath = path.join(repositoryDistRoots.leafRootPath, runId);

    if (fs.existsSync(runDirectoryPath)) {
      return deleteTree(repositoryDistRoots.skiaRootPath, runDirectoryPath);
    }
  }

  if (receiptsRoots !== null) {
    const receiptName = resolveSingleReceiptName(
      runIdInput,
      runId,
      matchingReceiptNames(receiptsRoots.leafRootPath, runId),
    );

    if (receiptName !== null) {
      const absoluteReceiptPath = path.join(receiptsRoots.leafRootPath, receiptName);

      try {
        fs.unlinkSync(absoluteReceiptPath);
      } catch {
        return {
          deleted: false,
          remaining_paths: collectRemainingPaths(receiptsRoots.skiaRootPath, absoluteReceiptPath),
        };
      }

      return {
        deleted: true,
        remaining_paths: [],
      };
    }
  }

  throw createStorageError(`run ${runIdInput} does not exist beneath .skia`);
}
