import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";

import {
  ARTIFACTS_DIRECTORY_NAME,
  DIST_DIRECTORY_NAME,
  LOCAL_DURABILITY_CAVEAT,
  LOCAL_RETENTION_CAVEAT,
  MAX_RUN_ID_COLLISION_SUFFIX,
  MAX_RUN_ID_CLAIM_BYTES,
  MAX_STAGED_ARTIFACT_BYTES,
  MAX_STAGED_RECEIPT_BYTES,
  OWNER_DIRECTORY_MODE,
  OWNER_FILE_MODE,
  OWNER_PERMISSION_CAVEAT,
  RECEIPTS_DIRECTORY_NAME,
  RUN_ID_CLAIMS_DIRECTORY_NAME,
  RUN_METADATA_FILENAME,
  SKIA_DIRECTORY_NAME,
  TOOL_VERSION,
} from "./limits.js";
import {
  createdAtFromRunId,
  deriveRepositoryArtifactPath,
  deriveRepositoryManifestPath,
  deriveRepositoryRunDirectory,
  deriveStagedArtifactPath,
  deriveStagedReceiptPath,
  formatRunIdAtUtc,
  validateRelativePath,
  validateRunArtifactPath,
  validateRunId,
  validateSessionId,
} from "./paths.js";
import { readRepositoryBlob } from "./git.js";
import {
  allocateStagedReceiptTemporarySuffix,
  nextStagedReceiptTemporarySuffix,
} from "./receipt-temporary.js";
import {
  validateCoverageEnvelope,
  validateRepositoryManifest,
  validateStagedReceipt,
  validRfc3339Utc,
} from "./schema.js";
import { analyzeLiteralGuardFunction } from "./staged/analyze.js";
import type {
  HashedArtifactKind,
  RepositoryManifest,
  RepositorySnapshotIdentity,
  RunArtifactPath,
  RunId,
  RunState,
  SessionId,
  Sha256Hex,
  CoverageEnvelope,
  StagedReceipt,
  StagedSnapshotIdentity,
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
  readonly snapshot: RepositorySnapshotIdentity;
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

export interface InspectedStagedReceipt {
  readonly schema_version: 1;
  readonly tool_version: string;
  readonly run_id: RunId;
  readonly session_id: StagedReceipt["session_id"];
  readonly status: RunState;
  readonly completed_at: string | null;
  readonly snapshot: StagedReceipt["snapshot"];
  readonly coverage: CoverageEnvelope;
  readonly artifact_hashes: StagedReceipt["artifact_hashes"];
  readonly errors: StagedReceipt["errors"];
  readonly privacy_caveat: string;
  readonly review: {
    readonly card_status: "complete" | "skipped";
    readonly session_counts: {
      readonly prompts_presented: number;
      readonly predictions_completed: number;
      readonly skips: number;
    };
  } | null;
}

export interface InspectedReceiptRun {
  readonly kind: "review";
  readonly run_id: RunId;
  readonly receipt_path: RunArtifactPath;
  readonly receipt: InspectedStagedReceipt;
}

export interface InspectedIncompleteStagedRun {
  readonly kind: "review_incomplete";
  readonly run_id: RunId;
  readonly status: "incomplete";
  readonly receipt_path: RunArtifactPath;
}

export type InspectedRun =
  | InspectedRepositoryRun
  | InspectedReceiptRun
  | InspectedIncompleteStagedRun;

export interface DeleteRunResult {
  readonly deleted: boolean;
  readonly remaining_paths: readonly string[];
}

export interface ArtifactWriteResult {
  readonly absolutePath: string;
  readonly bytes: number;
  readonly sha256: Sha256Hex;
}

export const STAGED_RECEIPT_PRIVACY_CAVEAT =
  "Local receipt contains code-derived evidence and a developer prediction; inspect and delete it when no longer needed.";

export interface StagedRunAllocation {
  readonly repositoryRoot: string;
  readonly runId: RunId;
  readonly sessionId: SessionId;
  readonly skiaRootPath: string;
  readonly artifactsRootPath: string;
}

export interface StagedArtifactWriteResult extends ArtifactWriteResult {
  readonly artifactPath: RunArtifactPath;
}

export interface StorageTestHooks {
  readonly afterCreateNewFile?: () => void;
  readonly closeNewFile?: (fileDescriptor: number) => void;
  readonly unlinkStagedReceiptTemporary?: (temporaryPath: string) => void;
  readonly beforeReceiptArtifactStat?: () => void;
  readonly afterRunIdClaim?: (claim: {
    readonly mode: RunMode;
    readonly runId: RunId;
  }) => void;
  readonly beforeStagedReceiptPublish?: (paths: {
    readonly temporaryPath: string;
    readonly receiptPath: string;
  }) => void;
}

interface RunIdClaimRecord {
  readonly schema_version: 1;
  readonly run_id: RunId;
  readonly mode: RunMode;
  readonly storage_path: RunArtifactPath;
  readonly staged_snapshot?: StagedSnapshotIdentity;
  readonly staged_coverage?: CoverageEnvelope;
}

interface ExistingRunTargets {
  readonly repositoryRunDirectoryPath: string | null;
  readonly receiptName: string | null;
  readonly claimPath: string | null;
}

interface ParsedReceiptFileName {
  readonly runId: RunId;
  readonly sessionId: StagedReceipt["session_id"];
}

let storageTestHooks: StorageTestHooks | null = null;

export { nextStagedReceiptTemporarySuffix };

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

function posixPermissionBitsAvailable(): boolean {
  return process.platform !== "win32";
}

function assertSafeDirectoryPermissions(
  stats: ReturnType<typeof fs.lstatSync>,
  label: string,
): void {
  if (!posixPermissionBitsAvailable()) {
    return;
  }

  if ((stats.mode & 0o022) !== 0) {
    throw createStorageError(
      `${label} unsafe_permissions: directory must not be group/world writable`,
    );
  }
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

  assertSafeDirectoryPermissions(stats, label);
}

function assertExistingDirectory(directoryPath: string, label: string): void {
  const stats = fs.lstatSync(directoryPath);

  if (stats.isSymbolicLink()) {
    throw createStorageError(`${label} must not be a symlink`);
  }

  if (!stats.isDirectory()) {
    throw createStorageError(`${label} must be a directory`);
  }

  assertSafeDirectoryPermissions(stats, label);
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
    let stats: ReturnType<typeof fs.lstatSync> | null = null;

    try {
      stats = fs.lstatSync(currentPath);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }

    if (stats?.isSymbolicLink()) {
      throw createStorageError("artifact path must not follow a symlink outside .skia");
    }

    if (currentPath === normalizedRootPath) {
      return;
    }

    currentPath = path.dirname(currentPath);
  }
}

function assertContainedAbsolutePath(rootPath: string, absolutePath: string): void {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedPath = path.resolve(absolutePath);

  if (
    normalizedPath !== normalizedRoot &&
    !normalizedPath.startsWith(`${normalizedRoot}/`) &&
    !normalizedPath.startsWith(`${normalizedRoot}\\`)
  ) {
    throw createStorageError("path escapes the protected .skia root");
  }
}

function assertRegularStorageFile(
  rootPath: string,
  filePath: string,
  label: string,
): void {
  assertContainedAbsolutePath(rootPath, filePath);
  assertNoSymlinkInPath(rootPath, filePath);

  const stats = fs.lstatSync(filePath);

  if (stats.isSymbolicLink()) {
    throw createStorageError(`${label} must not be a symlink`);
  }

  if (!stats.isFile()) {
    throw createStorageError(`${label} must be a regular file`);
  }
}

function assertSerializedReceiptBytes(serialized: string): void {
  if (asBytes(serialized).byteLength > MAX_STAGED_RECEIPT_BYTES) {
    throw createStorageError(
      `staged receipt exceeds ${MAX_STAGED_RECEIPT_BYTES} bytes`,
    );
  }
}

function openNoFollow(filePath: string, label: string): number {
  try {
    return fs.openSync(
      filePath,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ELOOP" || error.code === "EEXIST")
    ) {
      throw createStorageError(`${label} must be a regular file`);
    }

    throw error;
  }
}

function readBoundedBytes(filePath: string, label: string, limit: number): Uint8Array {
  const fileDescriptor = openNoFollow(filePath, label);

  try {
    const stats = fs.fstatSync(fileDescriptor);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw createStorageError(`${label} must be a regular file`);
    }
    if (stats.size > limit) {
      throw createStorageError(`${label} exceeds ${limit} bytes`);
    }

    const buffer = Buffer.alloc(stats.size);
    let offset = 0;
    while (offset < stats.size) {
      const read = fs.readSync(
        fileDescriptor,
        buffer,
        offset,
        stats.size - offset,
        null,
      );
      if (read <= 0) {
        throw createStorageError(`${label} could not be read`);
      }
      offset += read;
    }

    return buffer;
  } finally {
    fs.closeSync(fileDescriptor);
  }
}

function readBoundedFile(filePath: string, label: string, limit: number): string {
  return Buffer.from(readBoundedBytes(filePath, label, limit)).toString("utf8");
}

function parseRunIdClaim(
  rootPath: string,
  filePath: string,
): RunIdClaimRecord {
  assertNoSymlinkInPath(rootPath, filePath);
  return JSON.parse(
    readBoundedFile(filePath, "run-id claim", MAX_RUN_ID_CLAIM_BYTES),
  ) as RunIdClaimRecord;
}

function parseRegularJson<T>(
  rootPath: string,
  filePath: string,
  label: string,
): T {
  assertRegularStorageFile(rootPath, filePath, label);
  return parseJson<T>(filePath);
}

function isExistingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function writeNewFile(filePath: string, data: string | Uint8Array): void {
  const bytes = asBytes(data);
  const fileDescriptor = fs.openSync(filePath, "wx", OWNER_FILE_MODE);
  let completed = false;

  try {
    storageTestHooks?.afterCreateNewFile?.();
    let offset = 0;

    while (offset < bytes.length) {
      const written = fs.writeSync(fileDescriptor, bytes.subarray(offset));

      if (written <= 0) {
        throw createStorageError(`could not write ${filePath}`);
      }

      offset += written;
    }

    fs.fsyncSync(fileDescriptor);
    completed = true;
  } finally {
    let closeError: unknown;
    try {
      if (storageTestHooks?.closeNewFile !== undefined) {
        storageTestHooks.closeNewFile(fileDescriptor);
      } else {
        fs.closeSync(fileDescriptor);
      }
    } catch (error) {
      closeError = error;
      completed = false;
    }

    if (!completed) {
      try {
        fs.rmSync(filePath, { force: true });
      } catch (error) {
        closeError ??= error;
      }
    }

    if (closeError !== undefined) {
      throw closeError;
    }
  }
}

function writeNewFileAtomically(
  filePath: string,
  data: string | Uint8Array,
  beforeLink?: () => void,
): void {
  const directoryPath = path.dirname(filePath);
  const filename = filePath.slice(directoryPath.length + 1);
  const temporaryPath = path.join(
    directoryPath,
    `.${filename}.tmp-${allocateStagedReceiptTemporarySuffix()}`,
  );

  let published = false;
  let created = false;

  try {
    writeNewFile(temporaryPath, data);
    created = true;
    storageTestHooks?.beforeStagedReceiptPublish?.({
      temporaryPath,
      receiptPath: filePath,
    });
    beforeLink?.();
    fs.linkSync(temporaryPath, filePath);
    published = true;
  } finally {
    if (created && fs.existsSync(temporaryPath)) {
      try {
        if (storageTestHooks?.unlinkStagedReceiptTemporary !== undefined) {
          storageTestHooks.unlinkStagedReceiptTemporary(temporaryPath);
        } else {
          fs.unlinkSync(temporaryPath);
        }
      } catch (error) {
        if (!published) {
          throw error;
        }
      }
    }
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
  return parseRegularJson<IncompleteRepositoryRunMetadata>(
    runDirectoryPath,
    path.join(runDirectoryPath, RUN_METADATA_FILENAME),
    "repository run metadata",
  );
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

function validateRepositoryManifestFile(
  runDirectoryPath: string,
  filePath: string,
): RepositoryManifest {
  const manifest = parseRegularJson<unknown>(
    runDirectoryPath,
    filePath,
    "repository manifest",
  );
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

function validateStagedReceiptFile(
  skiaRootPath: string,
  filePath: string,
): StagedReceipt {
  assertNoSymlinkInPath(skiaRootPath, filePath);
  const receipt = JSON.parse(
    readBoundedFile(filePath, "staged receipt", MAX_STAGED_RECEIPT_BYTES),
  ) as unknown;
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
  let stats: ReturnType<typeof fs.lstatSync>;

  try {
    stats = fs.lstatSync(absolutePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
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
  assertContainedAbsolutePath(skiaRootPath, absolutePath);
  assertNoSymlinkInPath(skiaRootPath, absolutePath);
  const failures: string[] = [];

  function visit(entryPath: string): void {
    let stats: ReturnType<typeof fs.lstatSync>;

    try {
      stats = fs.lstatSync(entryPath);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return;
      }

      throw error;
    }

    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      try {
        fs.unlinkSync(entryPath);
      } catch {
        failures.push(relativePathUnderSkia(skiaRootPath, entryPath));
      }

      return;
    }

    for (const childName of fs.readdirSync(entryPath)) {
      visit(path.join(entryPath, childName));
    }

    try {
      fs.rmdirSync(entryPath);
    } catch {
      failures.push(relativePathUnderSkia(skiaRootPath, entryPath));
    }
  }

  visit(absolutePath);

  const remainingPaths = collectRemainingPaths(skiaRootPath, absolutePath);

  return {
    deleted: remainingPaths.length === 0,
    remaining_paths: remainingPaths,
  };
}

function assertReceiptFileBinding(
  entryName: string,
  receipt: StagedReceipt,
): void {
  const parsedName = parseStagedReceiptFileName(entryName);

  if (
    parsedName === null ||
    parsedName.runId !== receipt.run_id ||
    parsedName.sessionId !== receipt.session_id
  ) {
    throw createStorageError(
      `staged receipt filename ${entryName} does not match its envelope identity`,
    );
  }
}

function receiptOwnedArtifactPaths(
  skiaRootPath: string,
  receipt: StagedReceipt,
): readonly string[] {
  return receipt.artifact_hashes
    .filter((artifact) => artifact.kind !== "receipt")
    .map((artifact) => validateContainedPath(skiaRootPath, artifact.path));
}

function runIdClaimFilePath(repositoryRoot: string, runId: RunId): string {
  const { skiaRootPath } = ensureStorageRoots(repositoryRoot, RUN_ID_CLAIMS_DIRECTORY_NAME);
  return validateContainedPath(skiaRootPath, `${RUN_ID_CLAIMS_DIRECTORY_NAME}/${runId}.json`);
}

function receiptFilePath(repositoryRoot: string, receipt: StagedReceipt): string {
  const { skiaRootPath } = ensureStorageRoots(repositoryRoot, RECEIPTS_DIRECTORY_NAME);
  return validateContainedPath(
    skiaRootPath,
    deriveStagedReceiptPath(receipt.run_id, receipt.session_id),
  );
}

function canonicalStagedClaimPath(
  runId: RunId,
  storagePath: string,
): RunArtifactPath {
  const receiptName = storagePath.split("/").at(-1);
  const parsedReceipt =
    receiptName === undefined ? null : parseStagedReceiptFileName(receiptName);

  if (
    parsedReceipt === null ||
    parsedReceipt.runId !== runId ||
    storagePath !== deriveStagedReceiptPath(runId, parsedReceipt.sessionId)
  ) {
    throw createStorageError("staged run claim has an invalid storage path");
  }

  return deriveStagedReceiptPath(runId, parsedReceipt.sessionId);
}

function parseStagedReceiptFileName(entryName: string): ParsedReceiptFileName | null {
  const match =
    /^([0-9]{8}T[0-9]{6}Z(?:-[0-9]{2})?)-([a-z0-9]{8,32})-session\.json$/.exec(entryName);

  if (match === null) {
    return null;
  }

  const [, runIdValue, sessionIdValue] = match;

  if (runIdValue === undefined || sessionIdValue === undefined) {
    return null;
  }

  return {
    runId: validateRunId(runIdValue),
    sessionId: validateSessionId(sessionIdValue),
  };
}

function matchingReceiptNames(receiptsRootPath: string, runId: RunId): readonly string[] {
  return [...fs.readdirSync(receiptsRootPath)]
    .filter((entryName) => {
      const parsedName = parseStagedReceiptFileName(entryName);
      return parsedName !== null && parsedName.runId === runId;
    })
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

function releaseRunIdClaim(claimPath: string): void {
  if (!fs.existsSync(claimPath)) {
    return;
  }

  fs.unlinkSync(claimPath);
}

function removeRunIdClaim(
  repositoryRoot: string,
  runId: RunId,
): DeleteRunResult {
  const claimRoots = readStorageRoots(repositoryRoot, RUN_ID_CLAIMS_DIRECTORY_NAME);

  if (claimRoots === null) {
    return {
      deleted: true,
      remaining_paths: [],
    };
  }

  const absoluteClaimPath = path.join(claimRoots.leafRootPath, `${runId}.json`);

  if (!fs.existsSync(absoluteClaimPath)) {
    return {
      deleted: true,
      remaining_paths: [],
    };
  }

  try {
    fs.unlinkSync(absoluteClaimPath);
  } catch {
    return {
      deleted: false,
      remaining_paths: collectRemainingPaths(claimRoots.skiaRootPath, absoluteClaimPath),
    };
  }

  return {
    deleted: true,
    remaining_paths: [],
  };
}

function claimStoragePathForMode(runId: RunId, mode: RunMode, sessionId?: string): RunArtifactPath {
  if (mode === "repo_review") {
    return validateRunArtifactPath(`dist/${runId}`);
  }

  if (sessionId === undefined) {
    throw createStorageError("staged receipt claims require a session ID");
  }

  return deriveStagedReceiptPath(runId, sessionId as StagedReceipt["session_id"]);
}

function writeRunIdClaim(
  repositoryRoot: string,
  runId: RunId,
  mode: RunMode,
  sessionId?: string,
  stagedSnapshot?: StagedSnapshotIdentity,
  stagedCoverage?: CoverageEnvelope,
): string {
  const claimPath = runIdClaimFilePath(repositoryRoot, runId);
  const claimRecord: RunIdClaimRecord = {
    schema_version: 1,
    run_id: runId,
    mode,
    storage_path: claimStoragePathForMode(runId, mode, sessionId),
    ...(stagedSnapshot === undefined ? {} : { staged_snapshot: stagedSnapshot }),
    ...(stagedCoverage === undefined ? {} : { staged_coverage: stagedCoverage }),
  };

  const serializedClaim = `${JSON.stringify(claimRecord, null, 2)}\n`;
  if (asBytes(serializedClaim).byteLength > MAX_RUN_ID_CLAIM_BYTES) {
    throw createStorageError(
      `run-id claim exceeds ${MAX_RUN_ID_CLAIM_BYTES} bytes`,
    );
  }

  writeNewFile(claimPath, serializedClaim);
  storageTestHooks?.afterRunIdClaim?.({ mode, runId });
  return claimPath;
}

function existingRunTargets(repositoryRoot: string, runIdInput: string, runId: RunId): ExistingRunTargets {
  const repositoryDistRoots = readStorageRoots(repositoryRoot, DIST_DIRECTORY_NAME);
  const repositoryRunDirectoryPath = repositoryDistRoots !== null
    && fs.existsSync(path.join(repositoryDistRoots.leafRootPath, runId))
    ? path.join(repositoryDistRoots.leafRootPath, runId)
    : null;
  const receiptsRoots = readStorageRoots(repositoryRoot, RECEIPTS_DIRECTORY_NAME);
  const receiptName = receiptsRoots !== null
    ? resolveSingleReceiptName(
      runIdInput,
      runId,
      matchingReceiptNames(receiptsRoots.leafRootPath, runId),
    )
    : null;
  const claimRoots = readStorageRoots(repositoryRoot, RUN_ID_CLAIMS_DIRECTORY_NAME);
  const exactClaimPath = claimRoots === null
    ? null
    : validateContainedPath(
      claimRoots.skiaRootPath,
      `${RUN_ID_CLAIMS_DIRECTORY_NAME}/${runId}.json`,
    );
  const claimPath = exactClaimPath !== null && fs.existsSync(exactClaimPath)
    ? exactClaimPath
    : null;

  if (repositoryRunDirectoryPath !== null && receiptName !== null) {
    throw createStorageError(
      `run ${runIdInput} matches both a repository run and staged receipt beneath .skia`,
    );
  }

  return {
    repositoryRunDirectoryPath,
    receiptName,
    claimPath,
  };
}

function validateCoverageArtifact(
  runDirectoryPath: string,
  artifactPath: RunArtifactPath,
): CoverageEnvelope {
  const coverage = parseJson<unknown>(artifactAbsolutePath(runDirectoryPath, artifactPath));
  const validation = validateCoverageEnvelope(coverage);

  if (!validation.valid) {
    throw createStorageError(
      `coverage artifact validation failed: ${validation.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }

  return validation.value;
}

function stagedReceiptHashWithoutSelf(receipt: StagedReceipt): Sha256Hex {
  const receiptWithoutSelf = {
    ...receipt,
    artifact_hashes: receipt.artifact_hashes.filter((artifact) => artifact.kind !== "receipt"),
  };

  return sha256Hex(`${JSON.stringify(receiptWithoutSelf, null, 2)}\n`);
}

function serializeStagedReceipt(receipt: StagedReceipt): string {
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  const roundTrip = JSON.parse(serialized) as unknown;
  const validation = validateStagedReceipt(roundTrip);

  if (!validation.valid || !isDeepStrictEqual(validation.value, receipt)) {
    throw createStorageError(
      "staged receipt must remain valid and identical after JSON serialization",
    );
  }

  return serialized;
}

function validateStagedArtifactHashes(
  skiaRootPath: string,
  receipt: StagedReceipt,
): ReadonlyMap<string, Uint8Array> {
  const hashedArtifacts = new Map<string, Uint8Array>();
  const receiptArtifacts = receipt.artifact_hashes.filter((artifact) => artifact.kind === "receipt");

  if (receiptArtifacts.length !== 1) {
    throw createStorageError("staged receipt must contain exactly one receipt artifact hash");
  }

  const receiptArtifact = receiptArtifacts[0];
  if (receiptArtifact === undefined) {
    throw createStorageError("staged receipt is missing its receipt artifact hash");
  }

  if (receiptArtifact.path !== deriveStagedReceiptPath(receipt.run_id, receipt.session_id)) {
    throw createStorageError("receipt artifact hash path does not match the staged receipt path");
  }

  if (receiptArtifact.sha256 !== stagedReceiptHashWithoutSelf(receipt)) {
    throw createStorageError("receipt artifact hash does not match the non-self-referential receipt contents");
  }

  for (const artifact of receipt.artifact_hashes) {
    if (artifact.kind === "receipt") {
      continue;
    }

    const absolutePath = validateContainedPath(skiaRootPath, artifact.path);
    assertNoSymlinkInPath(skiaRootPath, absolutePath);

    let artifactBytes: Uint8Array;
    try {
      artifactBytes = readBoundedBytes(
        absolutePath,
        `staged artifact ${artifact.path}`,
        MAX_STAGED_ARTIFACT_BYTES,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw createStorageError(`staged artifact ${artifact.path} is missing`);
      }
      throw error;
    }

    const actualSha256 = sha256Hex(artifactBytes);
    if (actualSha256 !== artifact.sha256) {
      throw createStorageError(`staged artifact ${artifact.path} sha256 does not match the receipt`);
    }
    hashedArtifacts.set(artifact.path, artifactBytes);
  }

  return hashedArtifacts;
}

function assertCompleteStagedReceipt(receipt: StagedReceipt): void {
  if (receipt.status !== "complete" || receipt.completed_at === null) {
    throw createStorageError("staged run completion requires a complete receipt");
  }
}

function sourceLineCount(source: string): number {
  if (source.length === 0) {
    return 0;
  }

  let lines = 1;
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 0x0a) {
      lines += 1;
    }
  }

  return source.charCodeAt(source.length - 1) === 0x0a ? lines - 1 : lines;
}

function assertReviewMatchesSnapshot(
  repositoryRoot: string,
  receipt: StagedReceipt,
  capturedBlobs?: ReadonlyMap<string, Uint8Array>,
): void {
  const review = receipt.review;

  if (review === undefined) {
    return;
  }

  const sourceCheck = review.entity.source_check;
  const anchor = review.entity.anchor;

  if (anchor.side !== "staged") {
    throw createStorageError(
      "source check expected value must match the staged snapshot source",
    );
  }

  let source: string;

  try {
    const held = capturedBlobs?.get(anchor.blob_oid);
    source = new TextDecoder("utf-8", { fatal: true }).decode(
      held ?? readRepositoryBlob(repositoryRoot, anchor.blob_oid),
    );
  } catch {
    throw createStorageError(
      "source check expected value must match the staged snapshot source",
    );
  }

  const lineCount = sourceLineCount(source);
  const changedLines: number[] = [];
  const maxEvidenceLines = 4_096;
  let expandedLines = 0;

  for (const evidenceAnchor of review.entity.evidence.anchors) {
    if (
      !Number.isSafeInteger(evidenceAnchor.start_line) ||
      !Number.isSafeInteger(evidenceAnchor.end_line) ||
      evidenceAnchor.start_line < 1 ||
      evidenceAnchor.end_line < evidenceAnchor.start_line ||
      evidenceAnchor.end_line > lineCount
    ) {
      throw createStorageError(
        "source check expected value must match the staged snapshot source",
      );
    }

    expandedLines += evidenceAnchor.end_line - evidenceAnchor.start_line + 1;
    if (expandedLines > maxEvidenceLines) {
      throw createStorageError(
        "source check expected value must match the staged snapshot source",
      );
    }

    for (
      let line = evidenceAnchor.start_line;
      line <= evidenceAnchor.end_line;
      line += 1
    ) {
      changedLines.push(line);
    }
  }

  const snapshotEntry = receipt.snapshot.entries.find(
    (entry) => entry.path === anchor.path,
  );
  const baseOid = snapshotEntry?.base_blob_oid ?? null;
  let baseSource: string | null = null;
  if (baseOid !== null) {
    try {
      const heldBase = capturedBlobs?.get(baseOid);
      baseSource = new TextDecoder("utf-8", { fatal: true }).decode(
        heldBase ?? readRepositoryBlob(repositoryRoot, baseOid),
      );
    } catch {
      throw createStorageError(
        "source check expected value must match the staged snapshot source",
      );
    }
  }

  const analysis = analyzeLiteralGuardFunction({
    base_source: baseSource,
    blob_oid: anchor.blob_oid,
    changed_lines: changedLines,
    path: anchor.path,
    source,
  });
  const matchesSource = analysis.kind === "supported" &&
    isDeepStrictEqual(
      {
        id: analysis.entity.id,
        name: analysis.entity.name,
        anchor: analysis.entity.anchor,
        evidence: analysis.evidence,
        scenario: analysis.scenario,
      },
      {
        id: review.entity.id,
        name: review.entity.name,
        anchor: review.entity.anchor,
        evidence: review.entity.evidence,
        scenario: review.entity.scenario,
      },
    ) &&
    (sourceCheck === null ||
      isDeepStrictEqual(analysis.expected_return, sourceCheck.expected));

  if (!matchesSource) {
    throw createStorageError(
      "source check expected value must match the staged snapshot source",
    );
  }
}

function validateStagedBehaviorCardArtifact(
  skiaRootPath: string,
  receipt: StagedReceipt,
  hashedArtifacts: ReadonlyMap<string, Uint8Array>,
  earliestInstant?: string,
): void {
  if (receipt.review === undefined) {
    return;
  }

  const artifact = receipt.artifact_hashes.find(
    (candidate) => candidate.kind === "behavior_cards",
  );

  if (artifact === undefined) {
    throw createStorageError(
      "staged review receipt is missing its behavior-card artifact",
    );
  }

  const artifactBytes = hashedArtifacts.get(artifact.path);
  if (artifactBytes === undefined) {
    throw createStorageError("staged behavior-card artifact was not hashed");
  }

  let card: unknown;
  try {
    card = JSON.parse(Buffer.from(artifactBytes).toString("utf8")) as unknown;
  } catch {
    throw createStorageError("staged behavior-card artifact must be JSON");
  }

  if (receipt.review.card_status === "complete") {
    if (!isDeepStrictEqual(card, receipt.review.entity.prediction)) {
      throw createStorageError(
        "behavior-card artifact does not match the persisted prediction in the receipt",
      );
    }
    return;
  }

  if (card === null || typeof card !== "object") {
    throw createStorageError(
      "behavior-card artifact does not match the persisted skip in the receipt",
    );
  }

  const skip = card as Readonly<Record<string, unknown>>;
  const keys = Object.keys(skip).sort();
  const validSealedAt =
    typeof skip.sealed_at === "string" &&
    validRfc3339Utc(skip.sealed_at);

  if (
    !isDeepStrictEqual(keys, ["action", "scenario", "sealed_at"]) ||
    skip.action !== "skip" ||
    !isDeepStrictEqual(skip.scenario, receipt.review.entity.scenario) ||
    !validSealedAt
  ) {
    throw createStorageError(
      "behavior-card artifact does not match the persisted skip in the receipt",
    );
  }

  if (
    receipt.completed_at !== null &&
    typeof skip.sealed_at === "string" &&
    skip.sealed_at > receipt.completed_at
  ) {
    throw createStorageError(
      "skip sealed_at must not follow receipt completion",
    );
  }

  if (
    earliestInstant !== undefined &&
    typeof skip.sealed_at === "string" &&
    skip.sealed_at < earliestInstant
  ) {
    throw createStorageError(
      "staged run completion must not precede the allocated run",
    );
  }
}

function receiptOwnedArtifactBytes(
  skiaRootPath: string,
  receipt: StagedReceipt,
): number {
  storageTestHooks?.beforeReceiptArtifactStat?.();
  let totalBytes = 0;

  for (const artifact of receipt.artifact_hashes) {
    if (artifact.kind === "receipt") {
      continue;
    }

    const absolutePath = validateContainedPath(skiaRootPath, artifact.path);
    assertRegularStorageFile(skiaRootPath, absolutePath, "staged artifact");
    totalBytes += fs.lstatSync(absolutePath).size;
  }

  return totalBytes;
}

function incompleteStagedArtifactBytes(
  repositoryRoot: string,
  runId: RunId,
  sessionId: SessionId,
): number {
  const roots = readStorageRoots(repositoryRoot, ARTIFACTS_DIRECTORY_NAME);

  if (roots === null) {
    return 0;
  }

  const prefix = `${runId}-${sessionId}-`;
  let totalBytes = 0;

  for (const entryName of fs.readdirSync(roots.leafRootPath)) {
    if (!entryName.startsWith(prefix)) {
      continue;
    }

    const entryPath = path.join(roots.leafRootPath, entryName);
    assertRegularStorageFile(
      roots.skiaRootPath,
      entryPath,
      "incomplete staged artifact",
    );
    totalBytes += fs.lstatSync(entryPath).size;
  }

  return totalBytes;
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
    let claimPath: string;

    try {
      claimPath = writeRunIdClaim(repositoryRoot, runId, "repo_review");
    } catch (error) {
      if (isExistingPathError(error)) {
        continue;
      }

      throw error;
    }

    const existingReceiptRoots = readStorageRoots(repositoryRoot, RECEIPTS_DIRECTORY_NAME);
    if (
      existingReceiptRoots !== null &&
      matchingReceiptNames(existingReceiptRoots.leafRootPath, runId).length > 0
    ) {
      releaseRunIdClaim(claimPath);
      continue;
    }

    try {
      fs.mkdirSync(runDirectoryPath, { mode: OWNER_DIRECTORY_MODE });
    } catch (error) {
      releaseRunIdClaim(claimPath);

      if (isExistingPathError(error)) {
        continue;
      }

      throw error;
    }

    try {
      const metadataPath = path.join(runDirectoryPath, RUN_METADATA_FILENAME);
      const metadata = createIncompleteMetadata(runId, createdAtIso, snapshot);
      writeNewFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

      return {
        runId,
        runDirectoryPath,
        metadataPath,
        manifestPath: path.join(runDirectoryPath, deriveRepositoryManifestPath(runId)),
        snapshot,
      };
    } catch (error) {
      try {
        fs.rmdirSync(runDirectoryPath);
      } catch {
        // Keep the failed partial allocation visible if cleanup cannot be completed.
      }
      releaseRunIdClaim(claimPath);
      throw error;
    }
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

  if (!isDeepStrictEqual(manifest.snapshot, allocation.snapshot)) {
    throw createStorageError("repository manifest snapshot does not match the allocated snapshot");
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

  let coverageArtifactValue: CoverageEnvelope | null = null;

  for (const { artifact, absolutePath } of completeArtifacts) {
    const artifactBytes = fs.readFileSync(absolutePath);
    const actualSha256 = sha256Hex(artifactBytes);

    if (artifact.sha256 !== actualSha256) {
      throw createStorageError(`artifact ${artifact.path} sha256 does not match the manifest`);
    }

    if (artifact.kind === "coverage") {
      coverageArtifactValue = validateCoverageArtifact(allocation.runDirectoryPath, artifact.path);
    }
  }

  if (
    coverageArtifactValue === null ||
    !isDeepStrictEqual(coverageArtifactValue, validation.value.coverage)
  ) {
    throw createStorageError("coverage artifact does not match inline manifest coverage");
  }

  writeNewFile(allocation.manifestPath, `${JSON.stringify(validation.value, null, 2)}\n`);

  return {
    manifestPath: allocation.manifestPath,
    artifactBytes: totalArtifactBytes(allocation.runDirectoryPath),
  };
}

export function allocateStagedRun(
  repositoryRoot: string,
  sessionId: SessionId,
  createdAt: Date = new Date(),
  stagedSnapshot?: StagedSnapshotIdentity,
  stagedCoverage?: CoverageEnvelope,
  capturedBlobs: readonly { readonly oid: string; readonly bytes: Uint8Array }[] = [],
): StagedRunAllocation {
  const validatedSessionId = validateSessionId(sessionId);
  const { skiaRootPath, leafRootPath: artifactsRootPath } =
    ensureStorageRoots(repositoryRoot, ARTIFACTS_DIRECTORY_NAME);
  const baseRunId = formatRunIdAtUtc(createdAt);

  for (let suffix = 0; suffix <= MAX_RUN_ID_COLLISION_SUFFIX; suffix += 1) {
    const runId =
      suffix === 0 ? baseRunId : formatRunIdAtUtc(createdAt, suffix);
    let claimPath: string;

    try {
      claimPath = writeRunIdClaim(
        repositoryRoot,
        runId,
        "review",
        validatedSessionId,
        stagedSnapshot,
        stagedCoverage,
      );
    } catch (error) {
      if (isExistingPathError(error)) {
        continue;
      }

      throw error;
    }

    try {
      const targets = existingRunTargets(repositoryRoot, runId, runId);

      if (
        targets.repositoryRunDirectoryPath !== null ||
        targets.receiptName !== null
      ) {
        releaseRunIdClaim(claimPath);
        continue;
      }

      const allocation = {
        repositoryRoot: path.resolve(repositoryRoot),
        runId,
        sessionId: validatedSessionId,
        skiaRootPath,
        artifactsRootPath,
      };
      rememberStagedAllocation(
        allocation,
        capturedBlobs,
        stagedSnapshot,
        stagedCoverage,
      );
      return allocation;
    } catch (error) {
      releaseRunIdClaim(claimPath);
      throw error;
    }
  }

  throw createStorageError("run_id_exhausted");
}

const stagedArtifactsCreatedByAllocation = new WeakMap<
  StagedRunAllocation,
  Set<string>
>();

const stagedAllocationIdentity = new WeakMap<
  StagedRunAllocation,
  {
    readonly repositoryRoot: string;
    readonly runId: StagedRunAllocation["runId"];
    readonly sessionId: StagedRunAllocation["sessionId"];
    readonly skiaRootPath: string;
    readonly artifactsRootPath: string;
    readonly capturedBlobs: ReadonlyMap<string, Uint8Array>;
    readonly stagedSnapshot?: StagedSnapshotIdentity;
    readonly stagedCoverage?: CoverageEnvelope;
  }
>();

function capturedBlobMatchesOid(oid: string, bytes: Uint8Array): boolean {
  const algorithm = oid.length === 40 ? "sha1" : oid.length === 64 ? "sha256" : null;
  if (algorithm === null) {
    return false;
  }

  return createHash(algorithm)
    .update(`blob ${bytes.byteLength}\0`)
    .update(bytes)
    .digest("hex") === oid;
}

function cloneAllocationValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function rememberStagedAllocation(
  allocation: StagedRunAllocation,
  capturedBlobs: readonly { readonly oid: string; readonly bytes: Uint8Array }[],
  stagedSnapshot?: StagedSnapshotIdentity,
  stagedCoverage?: CoverageEnvelope,
): void {
  for (const blob of capturedBlobs) {
    if (!capturedBlobMatchesOid(blob.oid, blob.bytes)) {
      throw createStorageError(
        "captured blob bytes do not match their Git object id",
      );
    }
  }

  stagedAllocationIdentity.set(allocation, {
    repositoryRoot: allocation.repositoryRoot,
    runId: allocation.runId,
    sessionId: allocation.sessionId,
    skiaRootPath: allocation.skiaRootPath,
    artifactsRootPath: allocation.artifactsRootPath,
    capturedBlobs: new Map(
      capturedBlobs.map((blob) => [blob.oid, Uint8Array.from(blob.bytes)]),
    ),
    ...(stagedSnapshot === undefined
      ? {}
      : { stagedSnapshot: cloneAllocationValue(stagedSnapshot) }),
    ...(stagedCoverage === undefined
      ? {}
      : { stagedCoverage: cloneAllocationValue(stagedCoverage) }),
  });
}

function allocatedRunInstant(runId: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(runId);
  if (match === null) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
}

function rememberCreatedStagedArtifact(
  allocation: StagedRunAllocation,
  absolutePath: string,
): void {
  const created = stagedArtifactsCreatedByAllocation.get(allocation) ?? new Set();
  created.add(absolutePath);
  stagedArtifactsCreatedByAllocation.set(allocation, created);
}

function removeCreatedStagedArtifacts(
  allocation: StagedRunAllocation,
): DeleteRunResult {
  const created = stagedArtifactsCreatedByAllocation.get(allocation);

  if (created === undefined || created.size === 0) {
    return {
      deleted: true,
      remaining_paths: [],
    };
  }

  const failures: string[] = [];

  for (const absolutePath of created) {
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const result = deleteTree(allocation.skiaRootPath, absolutePath);
    failures.push(...result.remaining_paths);
  }

  return {
    deleted: failures.length === 0,
    remaining_paths: [...new Set(failures)].sort(),
  };
}

function assertStagedAllocationPaths(allocation: StagedRunAllocation): void {
  const held = stagedAllocationIdentity.get(allocation);
  const repositoryRoot = path.resolve(allocation.repositoryRoot);
  const skiaRootPath = path.join(repositoryRoot, SKIA_DIRECTORY_NAME);
  const artifactsRootPath = path.join(skiaRootPath, ARTIFACTS_DIRECTORY_NAME);

  if (
    held === undefined ||
    held.repositoryRoot !== repositoryRoot ||
    held.runId !== allocation.runId ||
    held.sessionId !== allocation.sessionId ||
    held.skiaRootPath !== skiaRootPath ||
    held.artifactsRootPath !== artifactsRootPath ||
    path.resolve(allocation.skiaRootPath) !== skiaRootPath ||
    path.resolve(allocation.artifactsRootPath) !== artifactsRootPath
  ) {
    throw createStorageError(
      "staged allocation paths must stay under the repository .skia root",
    );
  }
}

export function writeStagedArtifactFile(
  allocation: StagedRunAllocation,
  kind: Exclude<HashedArtifactKind, "receipt">,
  contents: string | Uint8Array,
): StagedArtifactWriteResult {
  assertStagedAllocationPaths(allocation);
  const artifactPath = deriveStagedArtifactPath(
    allocation.runId,
    allocation.sessionId,
    kind,
  );
  const absolutePath = validateContainedPath(
    allocation.skiaRootPath,
    artifactPath,
  );
  assertNoSymlinkInPath(allocation.skiaRootPath, absolutePath);
  const bytes = asBytes(contents);

  writeNewFile(absolutePath, bytes);
  rememberCreatedStagedArtifact(allocation, absolutePath);

  return {
    absolutePath,
    artifactPath,
    bytes: bytes.byteLength,
    sha256: sha256Hex(bytes),
  };
}

function removeIncompleteStagedArtifacts(
  repositoryRoot: string,
  runId: RunId,
  sessionId: SessionId,
): DeleteRunResult {
  const roots = readStorageRoots(repositoryRoot, ARTIFACTS_DIRECTORY_NAME);

  if (roots === null) {
    return {
      deleted: true,
      remaining_paths: [],
    };
  }

  const kinds: readonly Exclude<HashedArtifactKind, "receipt">[] = [
    "hld",
    "lld",
    "collapsed_evidence",
    "behavior_cards",
    "coverage",
    "manifest",
  ];
  const failures: string[] = [];

  for (const kind of kinds) {
    const artifactPath = validateContainedPath(
      roots.skiaRootPath,
      deriveStagedArtifactPath(runId, sessionId, kind),
    );

    if (!fs.existsSync(artifactPath)) {
      continue;
    }

    const result = deleteTree(roots.skiaRootPath, artifactPath);
    failures.push(...result.remaining_paths);
  }

  return {
    deleted: failures.length === 0,
    remaining_paths: [...new Set(failures)].sort(),
  };
}

export function abortStagedRun(allocation: StagedRunAllocation): void {
  assertStagedAllocationPaths(allocation);
  const targets = existingRunTargets(
    allocation.repositoryRoot,
    allocation.runId,
    allocation.runId,
  );

  if (targets.receiptName !== null) {
    throw createStorageError("cannot abort a completed staged run");
  }

  const artifactResult = removeCreatedStagedArtifacts(allocation);

  if (!artifactResult.deleted) {
    throw createStorageError(
      `could not abort staged run; remaining paths: ${artifactResult.remaining_paths.join(", ")}`,
    );
  }

  const claimResult = removeRunIdClaim(
    allocation.repositoryRoot,
    allocation.runId,
  );

  if (!claimResult.deleted) {
    throw createStorageError(
      `could not abort staged run; remaining paths: ${claimResult.remaining_paths.join(", ")}`,
    );
  }

  stagedAllocationIdentity.delete(allocation);
  stagedArtifactsCreatedByAllocation.delete(allocation);
}

export function completeStagedRun(
  allocation: StagedRunAllocation,
  receipt: StagedReceipt,
): { readonly receiptPath: string; readonly artifactBytes: number } {
  assertCompleteStagedReceipt(receipt);
  assertStagedAllocationPaths(allocation);

  if (receipt.tool_version !== TOOL_VERSION) {
    throw createStorageError("staged run completion requires the current tool version");
  }

  if (receipt.review === undefined) {
    throw createStorageError("staged run completion requires pilot review details");
  }

  if (receipt.errors.length !== 0) {
    throw createStorageError("staged run completion requires an empty error list");
  }

  if (receipt.privacy_caveat !== STAGED_RECEIPT_PRIVACY_CAVEAT) {
    throw createStorageError(
      "staged run completion requires the canonical privacy caveat",
    );
  }

  if (
    receipt.run_id !== allocation.runId ||
    receipt.session_id !== allocation.sessionId
  ) {
    throw createStorageError(
      "staged receipt identity does not match the allocated run",
    );
  }

  const runInstant = allocatedRunInstant(allocation.runId);
  const completedAt = receipt.completed_at;
  const sealedAt = receipt.review.entity.prediction?.sealed_at;
  if (
    runInstant === null ||
    completedAt === null ||
    completedAt < runInstant ||
    (sealedAt !== undefined && sealedAt < runInstant)
  ) {
    throw createStorageError(
      "staged run completion must not precede the allocated run",
    );
  }

  const validation = validateStagedReceipt(receipt);

  if (!validation.valid) {
    throw createStorageError(
      `staged receipt validation failed: ${validation.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }

  const claimPath = runIdClaimFilePath(
    allocation.repositoryRoot,
    allocation.runId,
  );

  if (!fs.existsSync(claimPath)) {
    throw createStorageError("staged run allocation claim is missing");
  }

  const claim = parseRunIdClaim(allocation.skiaRootPath, claimPath);

  if (
    claim.run_id !== allocation.runId ||
    claim.mode !== "review" ||
    claim.storage_path !==
      deriveStagedReceiptPath(allocation.runId, allocation.sessionId)
  ) {
    throw createStorageError(
      "staged run allocation claim does not match the receipt identity",
    );
  }

  const heldAllocation = stagedAllocationIdentity.get(allocation);

  if (
    heldAllocation?.stagedSnapshot === undefined ||
    !isDeepStrictEqual(heldAllocation.stagedSnapshot, validation.value.snapshot)
  ) {
    throw createStorageError(
      "staged receipt snapshot does not match the allocated snapshot",
    );
  }

  if (
    heldAllocation.stagedCoverage === undefined ||
    !isDeepStrictEqual(heldAllocation.stagedCoverage, validation.value.coverage)
  ) {
    throw createStorageError(
      "staged receipt coverage does not match the allocated coverage",
    );
  }

  const artifactKinds = validation.value.artifact_hashes
    .map((artifact) => artifact.kind)
    .sort();

  if (
    !isDeepStrictEqual(artifactKinds, ["behavior_cards", "receipt"])
  ) {
    throw createStorageError(
      "staged run completion requires only the behavior card and receipt",
    );
  }

  const hashedArtifacts = validateStagedArtifactHashes(
    allocation.skiaRootPath,
    validation.value,
  );
  validateStagedBehaviorCardArtifact(
    allocation.skiaRootPath,
    validation.value,
    hashedArtifacts,
    runInstant ?? undefined,
  );
  assertReviewMatchesSnapshot(
    allocation.repositoryRoot,
    validation.value,
    stagedAllocationIdentity.get(allocation)?.capturedBlobs,
  );
  const artifactBytes = receiptOwnedArtifactBytes(
    allocation.skiaRootPath,
    validation.value,
  );
  const rehashedArtifacts = validateStagedArtifactHashes(
    allocation.skiaRootPath,
    validation.value,
  );
  validateStagedBehaviorCardArtifact(
    allocation.skiaRootPath,
    validation.value,
    rehashedArtifacts,
    runInstant ?? undefined,
  );
  const absolutePath = receiptFilePath(
    allocation.repositoryRoot,
    validation.value,
  );
  const serializedReceipt = serializeStagedReceipt(validation.value);
  assertSerializedReceiptBytes(serializedReceipt);
  writeNewFileAtomically(absolutePath, serializedReceipt, () => {
    const publishedArtifacts = validateStagedArtifactHashes(
      allocation.skiaRootPath,
      validation.value,
    );
    validateStagedBehaviorCardArtifact(
      allocation.skiaRootPath,
      validation.value,
      publishedArtifacts,
      runInstant ?? undefined,
    );
  });
  stagedAllocationIdentity.delete(allocation);
  stagedArtifactsCreatedByAllocation.delete(allocation);

  return {
    receiptPath: absolutePath,
    artifactBytes: asBytes(serializedReceipt).byteLength + artifactBytes,
  };
}

export function writeStagedReceipt(
  repositoryRoot: string,
  receipt: StagedReceipt,
): { readonly path: string; readonly bytes: number } {
  assertCompleteStagedReceipt(receipt);
  const validation = validateStagedReceipt(receipt);

  if (!validation.valid) {
    throw createStorageError(
      `staged receipt validation failed: ${validation.errors
        .map((error) => error.message)
        .join("; ")}`,
    );
  }

  const { skiaRootPath } = ensureStorageRoots(repositoryRoot, RECEIPTS_DIRECTORY_NAME);
  const hashedArtifacts = validateStagedArtifactHashes(skiaRootPath, validation.value);
  validateStagedBehaviorCardArtifact(skiaRootPath, validation.value, hashedArtifacts);
  assertReviewMatchesSnapshot(repositoryRoot, validation.value);

  let claimPath: string;
  try {
    claimPath = writeRunIdClaim(
      repositoryRoot,
      validation.value.run_id,
      "review",
      validation.value.session_id,
    );
  } catch (error) {
    if (isExistingPathError(error)) {
      throw createStorageError(
        `run ${validation.value.run_id} already reserves run_id space beneath .skia`,
      );
    }

    throw error;
  }

  try {
    const targets = existingRunTargets(
      repositoryRoot,
      validation.value.run_id,
      validation.value.run_id,
    );

    if (targets.repositoryRunDirectoryPath !== null) {
      throw createStorageError(
        `run ${validation.value.run_id} already reserves run_id space beneath .skia`,
      );
    }

    if (targets.receiptName !== null) {
      throw createStorageError(
        `run ${validation.value.run_id} already has a staged receipt beneath .skia`,
      );
    }

    const absolutePath = receiptFilePath(repositoryRoot, validation.value);
    const serializedReceipt = serializeStagedReceipt(validation.value);
    assertSerializedReceiptBytes(serializedReceipt);
    writeNewFileAtomically(absolutePath, serializedReceipt, () => {
      const publishedArtifacts = validateStagedArtifactHashes(skiaRootPath, validation.value);
      validateStagedBehaviorCardArtifact(
        skiaRootPath,
        validation.value,
        publishedArtifacts,
      );
    });

    return {
      path: absolutePath,
      bytes: asBytes(serializedReceipt).byteLength,
    };
  } catch (error) {
    releaseRunIdClaim(claimPath);
    throw error;
  }
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
        const manifest = validateRepositoryManifestFile(runDirectoryPath, manifestPath);
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

      const parsedName = parseStagedReceiptFileName(entryName);

      if (parsedName === null) {
        continue;
      }

      const receipt = validateStagedReceiptFile(repositoryReceiptsRoots.skiaRootPath, receiptPath);
      assertReceiptFileBinding(entryName, receipt);
      const hashedArtifacts = validateStagedArtifactHashes(
        repositoryReceiptsRoots.skiaRootPath,
        receipt,
      );
      validateStagedBehaviorCardArtifact(
        repositoryReceiptsRoots.skiaRootPath,
        receipt,
        hashedArtifacts,
      );
      runs.push({
        run_id: receipt.run_id,
        mode: "review",
        status: receipt.status,
        created_at: createdAtFromRunId(receipt.run_id),
        completed_at: receipt.completed_at,
        snapshot_identifier: receipt.snapshot.diff_sha256,
        artifact_bytes:
          stats.size + receiptOwnedArtifactBytes(repositoryReceiptsRoots.skiaRootPath, receipt),
      });
    }
  }

  const claimRoots = readStorageRoots(
    repositoryRoot,
    RUN_ID_CLAIMS_DIRECTORY_NAME,
  );
  const listedRunIds = new Set(runs.map((run) => run.run_id));

  if (claimRoots !== null) {
    for (const entryName of [...fs.readdirSync(claimRoots.leafRootPath)].sort()) {
      if (!entryName.endsWith(".json")) {
        continue;
      }

      let runId: RunId;

      try {
        runId = validateRunId(entryName.slice(0, -5));
      } catch {
        continue;
      }

      if (listedRunIds.has(runId)) {
        continue;
      }

      const claim = parseRunIdClaim(
        claimRoots.skiaRootPath,
        path.join(claimRoots.leafRootPath, entryName),
      );

      if (claim.run_id !== runId || claim.mode !== "review") {
        continue;
      }

      const receiptPath = canonicalStagedClaimPath(runId, claim.storage_path);
      const parsedReceipt = parseStagedReceiptFileName(
        receiptPath.split("/").at(-1) ?? "",
      );

      if (parsedReceipt === null || parsedReceipt.runId !== runId) {
        throw createStorageError(
          `staged run claim ${entryName} has an invalid storage path`,
        );
      }

      runs.push({
        run_id: runId,
        mode: "review",
        status: "incomplete",
        created_at: createdAtFromRunId(runId),
        completed_at: null,
        snapshot_identifier: "not_available",
        artifact_bytes: incompleteStagedArtifactBytes(
          repositoryRoot,
          runId,
          parsedReceipt.sessionId,
        ),
      });
    }
  }

  return runs.sort((left, right) => left.run_id.localeCompare(right.run_id));
}

function redactStagedReceipt(receipt: StagedReceipt): InspectedStagedReceipt {
  return {
    schema_version: receipt.schema_version,
    tool_version: receipt.tool_version,
    run_id: receipt.run_id,
    session_id: receipt.session_id,
    status: receipt.status,
    completed_at: receipt.completed_at,
    snapshot: receipt.snapshot,
    coverage: receipt.coverage,
    artifact_hashes: receipt.artifact_hashes,
    errors: receipt.errors,
    privacy_caveat: receipt.privacy_caveat,
    review: receipt.review === undefined
      ? null
      : {
          card_status: receipt.review.card_status,
          session_counts: receipt.review.session_counts,
        },
  };
}

export function inspectRun(repositoryRoot: string, runIdInput: string): InspectedRun {
  const runId = validateRunId(runIdInput);
  const targets = existingRunTargets(repositoryRoot, runIdInput, runId);

  if (targets.repositoryRunDirectoryPath !== null) {
    const metadata = parseRepositoryMetadataOrNull(targets.repositoryRunDirectoryPath);
    const manifestPath = path.join(
      targets.repositoryRunDirectoryPath,
      deriveRepositoryManifestPath(runId),
    );

    return {
      kind: "repo_review",
      run_id: runId,
      metadata,
      manifest_path: deriveRepositoryManifestPath(runId),
      manifest: fs.existsSync(manifestPath)
        ? validateRepositoryManifestFile(targets.repositoryRunDirectoryPath, manifestPath)
        : null,
    };
  }

  if (targets.receiptName !== null) {
    const receiptsRoots = readStorageRoots(repositoryRoot, RECEIPTS_DIRECTORY_NAME);

    if (receiptsRoots === null) {
      throw createStorageError(`run ${runIdInput} does not exist beneath .skia`);
    }

    const absoluteReceiptPath = path.join(receiptsRoots.leafRootPath, targets.receiptName);
    const receipt = validateStagedReceiptFile(receiptsRoots.skiaRootPath, absoluteReceiptPath);
    assertReceiptFileBinding(targets.receiptName, receipt);
    const hashedArtifacts = validateStagedArtifactHashes(receiptsRoots.skiaRootPath, receipt);
    validateStagedBehaviorCardArtifact(
      receiptsRoots.skiaRootPath,
      receipt,
      hashedArtifacts,
    );

    return {
      kind: "review",
      run_id: runId,
      receipt_path: validateRunArtifactPath(`receipts/${targets.receiptName}`),
      receipt: redactStagedReceipt(receipt),
    };
  }

  if (targets.claimPath !== null) {
    const claimRoots = readStorageRoots(
      repositoryRoot,
      RUN_ID_CLAIMS_DIRECTORY_NAME,
    );

    if (claimRoots === null) {
      throw createStorageError(`run ${runIdInput} does not exist beneath .skia`);
    }

    const claim = parseRunIdClaim(claimRoots.skiaRootPath, targets.claimPath);

    if (claim.mode === "review" && claim.run_id === runId) {
      return {
        kind: "review_incomplete",
        run_id: runId,
        status: "incomplete",
        receipt_path: canonicalStagedClaimPath(runId, claim.storage_path),
      };
    }
  }

  throw createStorageError(`run ${runIdInput} does not exist beneath .skia`);
}

function removeStagedReceiptTemporaries(
  roots: NonNullable<ReturnType<typeof readStorageRoots>>,
  receiptName: string,
): DeleteRunResult {
  const temporaryPrefix = `.${receiptName}.tmp-`;
  const failures: string[] = [];

  for (const entryName of fs.readdirSync(roots.leafRootPath)) {
    const suffix = entryName.slice(temporaryPrefix.length);

    if (
      entryName.startsWith(temporaryPrefix) &&
      /^(?:[0-9]+-[0-9]+|[0-9a-f]{32})$/.test(suffix)
    ) {
      const result = deleteTree(
        roots.skiaRootPath,
        path.join(roots.leafRootPath, entryName),
      );
      failures.push(...result.remaining_paths);
    }
  }

  return {
    deleted: failures.length === 0,
    remaining_paths: [...new Set(failures)].sort(),
  };
}

export function deleteRun(repositoryRoot: string, runIdInput: string): DeleteRunResult {
  const runId = validateRunId(runIdInput);
  const targets = existingRunTargets(repositoryRoot, runIdInput, runId);

  if (targets.repositoryRunDirectoryPath !== null) {
    const repositoryDistRoots = readStorageRoots(repositoryRoot, DIST_DIRECTORY_NAME);

    if (repositoryDistRoots === null) {
      throw createStorageError(`run ${runIdInput} does not exist beneath .skia`);
    }

    const deleteResult = deleteTree(
      repositoryDistRoots.skiaRootPath,
      targets.repositoryRunDirectoryPath,
    );

    if (!deleteResult.deleted) {
      return deleteResult;
    }

    return removeRunIdClaim(repositoryRoot, runId);
  }

  if (targets.receiptName !== null) {
    const receiptsRoots = readStorageRoots(repositoryRoot, RECEIPTS_DIRECTORY_NAME);

    if (receiptsRoots === null) {
      throw createStorageError(`run ${runIdInput} does not exist beneath .skia`);
    }

    const absoluteReceiptPath = path.join(receiptsRoots.leafRootPath, targets.receiptName);

    const receipt = validateStagedReceiptFile(receiptsRoots.skiaRootPath, absoluteReceiptPath);
    assertReceiptFileBinding(targets.receiptName, receipt);
    const deleteTargets = [
      ...receiptOwnedArtifactPaths(receiptsRoots.skiaRootPath, receipt),
    ];
    const failures: string[] = [];

    for (const target of deleteTargets) {
      const result = deleteTree(receiptsRoots.skiaRootPath, target);
      failures.push(...result.remaining_paths);
    }

    if (failures.length > 0) {
      return {
        deleted: false,
        remaining_paths: [...new Set(failures)].sort(),
      };
    }

    const temporaryResult = removeStagedReceiptTemporaries(
      receiptsRoots,
      targets.receiptName,
    );
    if (!temporaryResult.deleted) {
      return temporaryResult;
    }

    const receiptDeleteResult = deleteTree(
      receiptsRoots.skiaRootPath,
      absoluteReceiptPath,
    );

    if (!receiptDeleteResult.deleted) {
      return receiptDeleteResult;
    }

    return removeRunIdClaim(repositoryRoot, runId);
  }

  if (targets.claimPath !== null) {
    const claimRoots = readStorageRoots(
      repositoryRoot,
      RUN_ID_CLAIMS_DIRECTORY_NAME,
    );

    if (claimRoots === null) {
      throw createStorageError(`run ${runIdInput} does not exist beneath .skia`);
    }

    const claim = parseRunIdClaim(claimRoots.skiaRootPath, targets.claimPath);

    if (claim.mode === "review") {
      if (claim.run_id !== runId) {
        throw createStorageError(
          `staged run claim for ${runIdInput} has an invalid storage path`,
        );
      }

      const receiptPath = canonicalStagedClaimPath(runId, claim.storage_path);
      const parsedReceipt = parseStagedReceiptFileName(
        receiptPath.split("/").at(-1) ?? "",
      );

      if (parsedReceipt === null || parsedReceipt.runId !== runId) {
        throw createStorageError(
          `staged run claim for ${runIdInput} has an invalid storage path`,
        );
      }

      const artifactResult = removeIncompleteStagedArtifacts(
        repositoryRoot,
        runId,
        parsedReceipt.sessionId,
      );

      if (!artifactResult.deleted) {
        return artifactResult;
      }

      const receiptsRoots = readStorageRoots(
        repositoryRoot,
        RECEIPTS_DIRECTORY_NAME,
      );
      const receiptName = receiptPath.split("/").at(-1);
      if (receiptsRoots !== null && receiptName !== undefined) {
        const temporaryResult = removeStagedReceiptTemporaries(
          receiptsRoots,
          receiptName,
        );
        if (!temporaryResult.deleted) {
          return temporaryResult;
        }
      }
    }

    return removeRunIdClaim(repositoryRoot, runId);
  }

  throw createStorageError(`run ${runIdInput} does not exist beneath .skia`);
}

export function setStorageTestHooks(hooks: StorageTestHooks | null): void {
  storageTestHooks = hooks;
}
