import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { resolveLanguageRegistration } from "./languages/registry.js";
import { nextStagedReceiptTemporarySuffix } from "./storage.js";
import {
  ARTIFACTS_DIRECTORY_NAME,
  DEFAULT_GIT_OUTPUT_LIMIT_BYTES,
  DEFAULT_GIT_TIMEOUT_MS,
  MAX_GIT_CAPTURED_BLOB_BYTES,
  MAX_GIT_CAPTURED_BLOB_COUNT,
  MAX_GIT_INDEX_BYTES,
  MAX_RUN_ID_COLLISION_SUFFIX,
  OWNER_DIRECTORY_MODE,
  OWNER_FILE_MODE,
  RECEIPTS_DIRECTORY_NAME,
  RUN_ID_CLAIMS_DIRECTORY_NAME,
  SKIA_DIRECTORY_NAME,
  TMP_DIRECTORY_NAME,
} from "./limits.js";
import {
  escapePathForDisplay,
  formatRunIdAtUtc,
  validateRelativePath,
} from "./paths.js";
import type {
  GitCapturedBlob,
  GitObjectId,
  GitRawSnapshotRecord,
  GitStatusEntry,
  RepositorySnapshotCapture,
  RepositorySnapshotIdentity,
  Sha256Hex,
  SnapshotCheckout,
  SnapshotEntry,
  StableErrorReason,
  StagedSnapshotCapture,
  StagedSnapshotIdentity,
  SourceLanguage,
} from "./types.js";

const EMPTY_TREE_OIDS = {
  sha1: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
  sha256: "6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321",
} as const;
const GIT_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

type GitObjectFormat = keyof typeof EMPTY_TREE_OIDS;

export interface GitSnapshotTestHooks {
  readonly after_copied_index_created?: () => void;
  readonly before_live_index_revalidation?: () => void;
}

export interface CaptureGitSnapshotOptions {
  readonly git_executable?: string;
  readonly output_limit_bytes?: number;
  readonly process_env?: Readonly<Record<string, string | undefined>>;
  readonly temporary_stamp?: number;
  readonly test_hooks?: GitSnapshotTestHooks;
  readonly timeout_ms?: number;
}

interface GitCommandOptions {
  readonly gitExecutable: string;
  readonly outputLimitBytes: number;
  readonly processEnv: Readonly<Record<string, string | undefined>>;
  readonly repositoryRoot: string;
  readonly timeoutMs: number;
}

interface GitCommandResult {
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

interface ParsedHeadState {
  readonly branchRefName: string | null;
  readonly checkout: SnapshotCheckout;
  readonly baseCommit: GitObjectId | null;
  readonly baseState: "present" | "unborn";
}

interface ParsedTreeState {
  readonly checkout: SnapshotCheckout;
  readonly commitOid: GitObjectId;
}

interface ParsedRawRecordSeed {
  readonly status: string;
  readonly pathBytes: Uint8Array;
  readonly previousPathBytes: Uint8Array | null;
  readonly previousMode: string | null;
  readonly mode: string;
  readonly baseBlobOid: GitObjectId | null;
  readonly stagedBlobOid: GitObjectId | null;
}

export class GitSnapshotError extends Error {
  readonly detail: string | null;
  readonly reason: StableErrorReason;

  constructor(reason: StableErrorReason, detail: string | null = null) {
    super(detail === null ? reason : `${reason}: ${detail}`);
    this.name = "GitSnapshotError";
    this.reason = reason;
    this.detail = detail;
  }
}

function sha256Hex(bytes: Uint8Array): Sha256Hex {
  return createHash("sha256").update(bytes).digest("hex") as Sha256Hex;
}

function ensureProtectedDirectory(directoryPath: string, label: string): void {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { mode: OWNER_DIRECTORY_MODE });
  }

  const stats = fs.lstatSync(directoryPath);

  if (stats.isSymbolicLink()) {
    throw new GitSnapshotError("output_root_symlink", `${label} must not be a symlink`);
  }

  if (!stats.isDirectory()) {
    throw new GitSnapshotError("write_error", `${label} must be a directory`);
  }

  if (process.platform !== "win32" && (stats.mode & 0o022) !== 0) {
    throw new GitSnapshotError(
      "unsafe_permissions",
      `${label} unsafe_permissions: directory must not be group/world writable`,
    );
  }
}

function ensureGitTempRoot(repositoryRoot: string): string {
  const skiaRoot = path.join(repositoryRoot, SKIA_DIRECTORY_NAME);
  const tmpRoot = path.join(skiaRoot, TMP_DIRECTORY_NAME);

  ensureProtectedDirectory(skiaRoot, ".skia");
  ensureProtectedDirectory(tmpRoot, ".skia/tmp");

  return tmpRoot;
}

function createNewProtectedFile(filePath: string, bytes: Uint8Array): void {
  const fileDescriptor = fs.openSync(filePath, "wx", OWNER_FILE_MODE);

  try {
    let offset = 0;

    while (offset < bytes.length) {
      const written = fs.writeSync(fileDescriptor, bytes.slice(offset));

      if (written <= 0) {
        throw new GitSnapshotError("write_error", `could not write ${filePath}`);
      }

      offset += written;
    }

    fs.fsyncSync(fileDescriptor);
  } finally {
    fs.closeSync(fileDescriptor);
  }
}

function asBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes);
}

function splitNulDelimited(bytes: Uint8Array): readonly Uint8Array[] {
  const tokens: Uint8Array[] = [];
  let startIndex = 0;

  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0x00) {
      continue;
    }

    tokens.push(bytes.slice(startIndex, index));
    startIndex = index + 1;
  }

  if (startIndex < bytes.length) {
    tokens.push(bytes.slice(startIndex));
  }

  return tokens.filter((token) => token.length > 0);
}

function bytesToUtf8(bytes: Uint8Array): string {
  return asBuffer(bytes).toString("utf8");
}

function stripGitRecordTerminator(bytes: Uint8Array): string {
  const text = bytesToUtf8(bytes);

  if (text.endsWith("\r\n")) {
    return text.slice(0, -2);
  }

  if (text.endsWith("\n")) {
    return text.slice(0, -1);
  }

  return text;
}

function escapeDiagnosticBytes(bytes: Uint8Array): string {
  let escaped = "";

  for (const byte of bytes) {
    if (byte === 0x0a) {
      escaped += "\n";
      continue;
    }

    if (byte === 0x0d) {
      escaped += "\\r";
      continue;
    }

    if (byte === 0x09) {
      escaped += "\t";
      continue;
    }

    if (byte < 0x20 || byte === 0x7f) {
      escaped += `\\x${byte.toString(16).padStart(2, "0")}`;
      continue;
    }

    escaped += String.fromCharCode(byte);
  }

  return escaped;
}

function optionsWithOptionalEnv(
  baseOptions: {
    readonly cwd: string;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly maxBuffer: number;
    readonly shell: false;
    readonly timeout: number;
  },
): {
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly maxBuffer: number;
  readonly shell: false;
  readonly timeout: number;
} {
  return baseOptions.env === undefined
    ? {
        cwd: baseOptions.cwd,
        maxBuffer: baseOptions.maxBuffer,
        shell: false,
        timeout: baseOptions.timeout,
      }
    : baseOptions;
}

function mapGitFailureReason(
  stderr: Uint8Array,
  fallback: StableErrorReason,
): StableErrorReason {
  const diagnostic = bytesToUtf8(stderr).toLowerCase();

  if (diagnostic.includes("not a git repository")) {
    return "not_a_git_repository";
  }

  if (diagnostic.includes("bad object") || diagnostic.includes("missing")) {
    return "missing_local_object";
  }

  return fallback;
}

function runGit(
  args: readonly string[],
  commandOptions: GitCommandOptions,
  extraEnv?: Readonly<Record<string, string | undefined>>,
): GitCommandResult {
  const env = buildGitEnvironment(commandOptions.processEnv, extraEnv);
  const result = spawnSync(commandOptions.gitExecutable, ["-c", "core.fsmonitor=false", ...args], optionsWithOptionalEnv({
    cwd: commandOptions.repositoryRoot,
    env,
    maxBuffer: commandOptions.outputLimitBytes,
    shell: false,
    timeout: commandOptions.timeoutMs,
  }));

  if (result.error !== undefined) {
    const errorCode = "code" in result.error ? String((result.error as { readonly code?: string }).code ?? "") : "";
    if (errorCode === "ETIMEDOUT") {
      throw new GitSnapshotError(
        "git_timeout",
        escapeDiagnosticBytes(asBuffer(result.stderr as Uint8Array)),
      );
    }

    if (
      errorCode === "ENOBUFS" ||
      String(result.error.message).toLowerCase().includes("maxbuffer")
    ) {
      throw new GitSnapshotError("git_output_limit_exceeded");
    }

    throw new GitSnapshotError(
      "git_process_failed",
      gitSpawnFailureDetail(result.stderr, result.error),
    );
  }

  if (result.status !== 0) {
    const stderr = asBuffer(result.stderr as Uint8Array);
    throw new GitSnapshotError(
      mapGitFailureReason(stderr, "git_process_failed"),
      escapeDiagnosticBytes(stderr),
    );
  }

  return {
    stdout: asBuffer(result.stdout as Uint8Array),
    stderr: asBuffer(result.stderr as Uint8Array),
  };
}

function gitSpawnFailureDetail(
  stderr: Uint8Array | string | null | undefined,
  error: Error,
): string {
  const stderrBytes = stderr === undefined || stderr === null
    ? Buffer.alloc(0)
    : asBuffer(stderr as Uint8Array);

  if (stderrBytes.length > 0) {
    return escapeDiagnosticBytes(stderrBytes);
  }

  return escapeDiagnosticBytes(Buffer.from(error.message, "utf8"));
}

function buildGitEnvironment(
  processEnv: Readonly<Record<string, string | undefined>>,
  extraEnv?: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string | undefined>> {
  const merged: Record<string, string | undefined> = {
    PATH: processEnv.PATH ?? process.env.PATH,
    TMPDIR: processEnv.TMPDIR ?? process.env.TMPDIR,
    SYSTEMROOT: processEnv.SYSTEMROOT,
    GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_PAGER: "cat",
    PAGER: "cat",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    LC_ALL: "C",
  };

  if (extraEnv !== undefined) {
    for (const [key, value] of Object.entries(extraEnv)) {
      merged[key] = value;
    }
  }

  return merged;
}

function gitCommandOptions(
  repositoryRoot: string,
  options?: CaptureGitSnapshotOptions,
): GitCommandOptions {
  return {
    gitExecutable: options?.git_executable ?? "git",
    outputLimitBytes:
      options?.output_limit_bytes ?? DEFAULT_GIT_OUTPUT_LIMIT_BYTES,
    processEnv: options?.process_env ?? process.env,
    repositoryRoot,
    timeoutMs: options?.timeout_ms ?? DEFAULT_GIT_TIMEOUT_MS,
  };
}

function resolveGitRepositoryRoot(
  repositoryRoot: string,
  options?: CaptureGitSnapshotOptions,
): string {
  const requestedRoot = path.resolve(repositoryRoot);
  const requestedOptions = gitCommandOptions(requestedRoot, options);
  const discoveredRoot = stripGitRecordTerminator(
    runGit(["rev-parse", "--show-toplevel"], requestedOptions).stdout,
  );

  if (discoveredRoot.length === 0) {
    throw new GitSnapshotError("git_process_failed", "git returned an empty repository root");
  }

  return path.resolve(requestedRoot, discoveredRoot);
}

export function requireIgnoredSkiaOutputRoot(
  repositoryRoot: string,
  createdAt: Date,
  sessionId: string,
  temporaryStamp: number,
  options?: CaptureGitSnapshotOptions,
): string {
  const resolvedRoot = resolveGitRepositoryRoot(repositoryRoot, options);
  const commandOptions = gitCommandOptions(resolvedRoot, options);
  const probes = stagedOutputProbePaths(
    formatRunIdAtUtc(createdAt),
    sessionId,
    temporaryStamp,
  );
  const result = spawnSync(
    commandOptions.gitExecutable,
    [
      "-c",
      "core.fsmonitor=false",
      "check-ignore",
      "--",
      ...probes,
    ],
    optionsWithOptionalEnv({
      cwd: resolvedRoot,
      env: buildGitEnvironment(commandOptions.processEnv),
      maxBuffer: commandOptions.outputLimitBytes,
      shell: false,
      timeout: commandOptions.timeoutMs,
    }),
  );

  if (result.error !== undefined) {
    throw new GitSnapshotError(
      "git_process_failed",
      gitSpawnFailureDetail(result.stderr, result.error),
    );
  }

  if (result.status !== 0 && result.status !== 1) {
    throw new GitSnapshotError(
      mapGitFailureReason(
        asBuffer(result.stderr as Uint8Array),
        "git_process_failed",
      ),
      escapeDiagnosticBytes(asBuffer(result.stderr as Uint8Array)),
    );
  }

  const ignored = new Set(
    bytesToUtf8(asBuffer(result.stdout as Uint8Array))
      .split("\n")
      .filter((line) => line.length > 0),
  );
  const exposed = probes.find((probe) => !ignored.has(probe));

  if (exposed !== undefined) {
    throw new GitSnapshotError(
      "output_root_not_ignored",
      `${exposed} is not ignored; add .skia/ to the repository .gitignore before running skia review`,
    );
  }

  return resolvedRoot;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function stagedOutputProbePaths(
  runBase: string,
  sessionId: string,
  temporaryStamp: number,
): readonly string[] {
  const runIds = [
    runBase,
    ...Array.from(
      { length: MAX_RUN_ID_COLLISION_SUFFIX },
      (_, index) => `${runBase}-${pad2(index + 1)}`,
    ),
  ];

  return [
    ...[1, 2, 3].map((attempt) =>
      [
        SKIA_DIRECTORY_NAME,
        TMP_DIRECTORY_NAME,
        `copied-index-${process.pid}-${temporaryStamp}-${attempt}.bin`,
      ].join("/"),
    ),
    ...runIds.flatMap((runId) => {
      const receiptName = `${runId}-${sessionId}-session.json`;

      return [
        `${SKIA_DIRECTORY_NAME}/${RUN_ID_CLAIMS_DIRECTORY_NAME}/${runId}.json`,
        `${SKIA_DIRECTORY_NAME}/${ARTIFACTS_DIRECTORY_NAME}/${runId}-${sessionId}-behavior_cards.json`,
        `${SKIA_DIRECTORY_NAME}/${RECEIPTS_DIRECTORY_NAME}/${receiptName}`,
        `${SKIA_DIRECTORY_NAME}/${RECEIPTS_DIRECTORY_NAME}/.${receiptName}.tmp-${nextStagedReceiptTemporarySuffix()}`,
      ];
    }),
  ];
}

function parseBranchState(commandOptions: GitCommandOptions): SnapshotCheckout {
  try {
    const branch = bytesToUtf8(
      runGit(["symbolic-ref", "--quiet", "--short", "HEAD"], commandOptions).stdout,
    ).trim();

    return {
      state: "branch",
      branch_name: branch.length === 0 ? null : branch,
    };
  } catch (error) {
    if (error instanceof GitSnapshotError && error.reason === "git_process_failed") {
      return {
        state: "detached",
        branch_name: null,
      };
    }

    throw error;
  }
}

function currentBranchRefName(
  commandOptions: GitCommandOptions,
): string | null {
  try {
    const branchRefName = bytesToUtf8(
      runGit(["symbolic-ref", "--quiet", "HEAD"], commandOptions).stdout,
    ).trim();

    return branchRefName.length === 0 ? null : branchRefName;
  } catch (error) {
    if (error instanceof GitSnapshotError && error.reason === "git_process_failed") {
      return null;
    }

    throw error;
  }
}

function branchRefExists(
  commandOptions: GitCommandOptions,
  branchRefName: string,
): boolean {
  const matchingRefs = bytesToUtf8(
    runGit(
      ["for-each-ref", "--format=%(refname)", "--", branchRefName],
      commandOptions,
    ).stdout,
  )
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return matchingRefs.includes(branchRefName);
}

function sameHeadBaseState(
  left: ParsedHeadState,
  right: ParsedHeadState,
): boolean {
  return left.baseState === right.baseState &&
    left.baseCommit === right.baseCommit &&
    left.branchRefName === right.branchRefName &&
    left.checkout.state === right.checkout.state &&
    left.checkout.branch_name === right.checkout.branch_name;
}

function parseStagedHeadState(commandOptions: GitCommandOptions): ParsedHeadState {
  const checkout = parseBranchState(commandOptions);
  const branchRefName = currentBranchRefName(commandOptions);

  try {
    const headCommit = bytesToUtf8(
      runGit(["rev-parse", "--verify", "HEAD^{commit}"], commandOptions).stdout,
    ).trim() as GitObjectId;

    return {
      branchRefName,
      checkout,
      baseCommit: headCommit,
      baseState: "present",
    };
  } catch (error) {
    if (
      error instanceof GitSnapshotError &&
      error.reason === "git_process_failed" &&
      checkout.state === "branch" &&
      branchRefName !== null
    ) {
      if (branchRefExists(commandOptions, branchRefName)) {
        throw new GitSnapshotError(
          "git_process_failed",
          `current branch ref ${branchRefName} does not resolve to a valid commit`,
        );
      }

      return {
        branchRefName,
        checkout,
        baseCommit: null,
        baseState: "unborn",
      };
    }

    throw error;
  }
}

function parseRepositoryHeadState(commandOptions: GitCommandOptions): ParsedTreeState {
  const checkout = parseBranchState(commandOptions);
  const branchRefName = currentBranchRefName(commandOptions);

  try {
    const commitOid = bytesToUtf8(
      runGit(["rev-parse", "--verify", "HEAD^{commit}"], commandOptions).stdout,
    ).trim() as GitObjectId;

    return {
      checkout,
      commitOid,
    };
  } catch (error) {
    if (
      error instanceof GitSnapshotError &&
      error.reason === "git_process_failed" &&
      checkout.state === "branch" &&
      branchRefName !== null
    ) {
      if (branchRefExists(commandOptions, branchRefName)) {
        throw new GitSnapshotError(
          "git_process_failed",
          `current branch ref ${branchRefName} does not resolve to a valid commit`,
        );
      }

      throw new GitSnapshotError("no_head_commit");
    }

    throw error;
  }
}

function liveIndexPath(commandOptions: GitCommandOptions): string {
  const gitPath = bytesToUtf8(
    runGit(["rev-parse", "--git-path", "index"], commandOptions).stdout,
  ).trim();

  return path.resolve(commandOptions.repositoryRoot, gitPath);
}

function absoluteGitDirectory(commandOptions: GitCommandOptions): string {
  return stripGitRecordTerminator(
    runGit(["rev-parse", "--absolute-git-dir"], commandOptions).stdout,
  );
}

function readLiveIndexBytes(indexPath: string): Uint8Array {
  if (!fs.existsSync(indexPath)) {
    return Buffer.alloc(0);
  }

  const stats = fs.lstatSync(indexPath);

  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new GitSnapshotError("git_process_failed", "Git index must be a regular file");
  }

  if (stats.size > MAX_GIT_INDEX_BYTES) {
    throw new GitSnapshotError(
      "git_index_limit_exceeded",
      `Git index is ${stats.size} bytes; limit is ${MAX_GIT_INDEX_BYTES} bytes`,
    );
  }

  return fs.readFileSync(indexPath);
}

function liveIndexExists(indexPath: string): boolean {
  return fs.existsSync(indexPath);
}

function tempIndexFilePath(
  tmpRoot: string,
  attemptNumber: number,
  temporaryStamp: number,
): string {
  return path.join(
    tmpRoot,
    `copied-index-${process.pid}-${temporaryStamp}-${attemptNumber}.bin`,
  );
}

function createTemporaryAttributeWorkTree(
  tmpRoot: string,
  attemptNumber: number,
): string {
  return fs.mkdtempSync(path.join(
    tmpRoot,
    `attribute-worktree-${process.pid}-${attemptNumber}-`,
  ));
}

function gitObjectFormat(commandOptions: GitCommandOptions): GitObjectFormat {
  const format = bytesToUtf8(
    runGit(["rev-parse", "--show-object-format"], commandOptions).stdout,
  ).trim();

  if (format !== "sha1" && format !== "sha256") {
    throw new GitSnapshotError(
      "git_process_failed",
      `unsupported git object format ${format || "<empty>"}`,
    );
  }

  return format;
}

function gitObjectIdLength(format: GitObjectFormat): number {
  return format === "sha1" ? 40 : 64;
}

function maybeObjectId(
  value: string,
  objectIdLength: number,
  context: string,
): GitObjectId | null {
  if (value === "0".repeat(objectIdLength)) {
    return null;
  }

  if (
    value.length !== objectIdLength ||
    !/^[0-9a-f]+$/.test(value)
  ) {
    throw new GitSnapshotError(
      "git_process_failed",
      `invalid git object id for ${context}`,
    );
  }

  return value as GitObjectId;
}

function assertValidGitObjectId(
  oid: GitObjectId | null,
  context: string,
): GitObjectId {
  if (oid === null || !GIT_OBJECT_ID_PATTERN.test(oid)) {
    throw new GitSnapshotError(
      "git_process_failed",
      `invalid git object id for ${context}`,
    );
  }

  return oid;
}

function roundTripsUtf8(bytes: Uint8Array): boolean {
  const decoded = bytesToUtf8(bytes);
  const encoded = Buffer.from(decoded, "utf8");

  if (encoded.length !== bytes.length) {
    return false;
  }

  for (let index = 0; index < bytes.length; index += 1) {
    if (encoded[index] !== bytes[index]) {
      return false;
    }
  }

  return true;
}

function detectLanguage(pathBytes: Uint8Array): SourceLanguage | null {
  if (!roundTripsUtf8(pathBytes)) {
    return null;
  }

  const relativePath = validateRelativePath(bytesToUtf8(pathBytes));
  return resolveLanguageRegistration(relativePath)?.language ?? null;
}

function isSupportedRecord(record: GitRawSnapshotRecord): boolean {
  if (record.status !== "A" && record.status !== "M") {
    return false;
  }

  if (record.mode !== "100644" && record.mode !== "100755") {
    return false;
  }

  if (!roundTripsUtf8(record.path_bytes)) {
    return false;
  }

  try {
    return detectLanguage(record.path_bytes) !== null;
  } catch {
    return false;
  }
}

function toSnapshotEntry(record: GitRawSnapshotRecord): SnapshotEntry {
  const relativePath = validateRelativePath(bytesToUtf8(record.path_bytes));

  return {
    path: relativePath,
    mode: record.mode,
    language: detectLanguage(record.path_bytes),
    base_blob_oid: record.base_blob_oid,
    snapshot_blob_oid: record.staged_blob_oid,
  };
}

function supportedBlobOids(
  records: readonly GitRawSnapshotRecord[],
): readonly GitObjectId[] {
  const orderedOids: GitObjectId[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    if (!isSupportedRecord(record)) {
      continue;
    }

    const stagedBlobOid = assertValidGitObjectId(
      record.staged_blob_oid,
      `${record.path_display} staged blob`,
    );

    if (!seen.has(stagedBlobOid)) {
      seen.add(stagedBlobOid);
      orderedOids.push(stagedBlobOid);
    }

    if (record.status !== "M") {
      continue;
    }

    const baseBlobOid = assertValidGitObjectId(
      record.base_blob_oid,
      `${record.path_display} base blob`,
    );

    if (!seen.has(baseBlobOid)) {
      seen.add(baseBlobOid);
      orderedOids.push(baseBlobOid);
    }
  }

  return orderedOids;
}

function parseStatusEntries(bytes: Uint8Array): readonly GitStatusEntry[] {
  const tokens = splitNulDelimited(bytes);
  const entries: GitStatusEntry[] = [];

  for (let index = 0; index < tokens.length; index += 2) {
    const status = bytesToUtf8(tokens[index] ?? Buffer.alloc(0));
    const firstPath = tokens[index + 1];

    if (firstPath === undefined) {
      break;
    }

    if (status.startsWith("R") || status.startsWith("C")) {
      const secondPath = tokens[index + 2];

      if (secondPath === undefined) {
        break;
      }

      entries.push({
        status,
        path_bytes: secondPath,
        path_display: escapePathForDisplay(secondPath),
        previous_path_bytes: firstPath,
        previous_path_display: escapePathForDisplay(firstPath),
      });
      index += 1;
      continue;
    }

    entries.push({
      status,
      path_bytes: firstPath,
      path_display: escapePathForDisplay(firstPath),
      previous_path_bytes: null,
      previous_path_display: null,
    });
  }

  return entries;
}

function parseRawRecordHeader(
  headerBytes: Uint8Array,
  objectIdLength: number,
): ParsedRawRecordSeed {
  const header = bytesToUtf8(headerBytes);
  const pieces = header.slice(1).split(" ");
  const [previousMode, mode, baseBlob, stagedBlob, status] = pieces;

  if (
    previousMode === undefined ||
    mode === undefined ||
    baseBlob === undefined ||
    stagedBlob === undefined ||
    status === undefined
  ) {
    throw new GitSnapshotError("git_process_failed", `invalid git raw record ${header}`);
  }

  return {
    status,
    pathBytes: Buffer.alloc(0),
    previousPathBytes: null,
    previousMode,
    mode,
    baseBlobOid: maybeObjectId(baseBlob, objectIdLength, "raw record base blob"),
    stagedBlobOid: maybeObjectId(stagedBlob, objectIdLength, "raw record staged blob"),
  };
}

function parseRawRecords(
  bytes: Uint8Array,
  objectIdLength: number,
): readonly GitRawSnapshotRecord[] {
  const tokens = splitNulDelimited(bytes);
  const records: GitRawSnapshotRecord[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const headerToken = tokens[index];

    if (headerToken === undefined) {
      break;
    }

    const seed = parseRawRecordHeader(headerToken, objectIdLength);
    const firstPath = tokens[index + 1];

    if (firstPath === undefined) {
      break;
    }

    if (seed.status.startsWith("R") || seed.status.startsWith("C")) {
      const secondPath = tokens[index + 2];

      if (secondPath === undefined) {
        break;
      }

      records.push({
        status: seed.status,
        path_bytes: secondPath,
        path_display: escapePathForDisplay(secondPath),
        previous_path_bytes: firstPath,
        previous_path_display: escapePathForDisplay(firstPath),
        previous_mode: seed.previousMode,
        mode: seed.mode,
        base_blob_oid: seed.baseBlobOid,
        staged_blob_oid: seed.stagedBlobOid,
      });
      index += 2;
      continue;
    }

    records.push({
      status: seed.status,
      path_bytes: firstPath,
      path_display: escapePathForDisplay(firstPath),
      previous_path_bytes: null,
      previous_path_display: null,
      previous_mode: seed.previousMode,
      mode: seed.mode,
      base_blob_oid: seed.baseBlobOid,
      staged_blob_oid: seed.stagedBlobOid,
    });
    index += 1;
  }

  return records;
}

function uniqueBlobOids(records: readonly GitRawSnapshotRecord[]): readonly GitObjectId[] {
  const seen = new Set<string>();
  const ordered: GitObjectId[] = [];

  for (const record of records) {
    for (const oid of [record.base_blob_oid, record.staged_blob_oid]) {
      if (oid === null || seen.has(oid)) {
        continue;
      }

      seen.add(oid);
      ordered.push(oid);
    }
  }

  return ordered;
}

function readCapturedBlobs(
  commandOptions: GitCommandOptions,
  blobOids: readonly GitObjectId[],
): readonly GitCapturedBlob[] {
  if (blobOids.length > MAX_GIT_CAPTURED_BLOB_COUNT) {
    throw new GitSnapshotError(
      "git_output_limit_exceeded",
      `Git blob capture includes ${blobOids.length} objects; limit is ${MAX_GIT_CAPTURED_BLOB_COUNT}`,
    );
  }

  const captured: GitCapturedBlob[] = [];
  let totalBytes = 0;

  for (const oid of blobOids) {
    const bytes = runGit(["cat-file", "blob", oid], commandOptions).stdout;

    if (bytes.byteLength > MAX_GIT_CAPTURED_BLOB_BYTES - totalBytes) {
      throw new GitSnapshotError(
        "git_output_limit_exceeded",
        `Git blob capture exceeds aggregate byte limit of ${MAX_GIT_CAPTURED_BLOB_BYTES}`,
      );
    }

    totalBytes += bytes.byteLength;
    captured.push({ oid, bytes });
  }

  return captured;
}

function uniqueObjectIds(values: readonly GitObjectId[]): readonly GitObjectId[] {
  const seen = new Set<string>();
  const ordered: GitObjectId[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    ordered.push(value);
  }

  return ordered;
}

function captureStagedAttempt(
  repositoryRoot: string,
  attemptNumber: number,
  options?: CaptureGitSnapshotOptions,
): StagedSnapshotCapture | null {
  const commandOptions = gitCommandOptions(repositoryRoot, options);
  const tmpRoot = ensureGitTempRoot(repositoryRoot);
  const headState = parseStagedHeadState(commandOptions);
  const objectFormat = gitObjectFormat(commandOptions);
  const objectIdLength = gitObjectIdLength(objectFormat);
  const indexPath = liveIndexPath(commandOptions);
  const gitDirectory = absoluteGitDirectory(commandOptions);
  const indexWasPresent = liveIndexExists(indexPath);
  const liveIndexBytes = readLiveIndexBytes(indexPath);
  const copiedIndexSha256 = sha256Hex(liveIndexBytes);
  const copiedIndexPath = indexWasPresent
    ? tempIndexFilePath(
      tmpRoot,
      attemptNumber,
      options?.temporary_stamp ?? Date.now(),
    )
    : null;
  const attributeWorkTree = createTemporaryAttributeWorkTree(tmpRoot, attemptNumber);

  if (copiedIndexPath !== null) {
    createNewProtectedFile(copiedIndexPath, liveIndexBytes);
  }

  try {
    options?.test_hooks?.after_copied_index_created?.();

    const comparisonBase =
      headState.baseState === "present"
        ? assertValidGitObjectId(headState.baseCommit, "staged base commit")
        : (EMPTY_TREE_OIDS[objectFormat] as GitObjectId);
    const copiedIndexEnv = copiedIndexPath === null
      ? {
          GIT_DIR: gitDirectory,
          GIT_WORK_TREE: attributeWorkTree,
        }
      : {
          GIT_DIR: gitDirectory,
          GIT_INDEX_FILE: copiedIndexPath,
          GIT_WORK_TREE: attributeWorkTree,
        };
    const statusEntries = parseStatusEntries(
      runGit(
        ["diff-index", "--cached", "--name-status", "-z", "-M", comparisonBase],
        commandOptions,
        copiedIndexEnv,
      ).stdout,
    );
    const rawRecords = parseRawRecords(
      runGit(
        ["diff-index", "--cached", "--raw", "-z", "-M", "--full-index", comparisonBase],
        commandOptions,
        copiedIndexEnv,
      ).stdout,
      objectIdLength,
    );
    const patchBytes = runGit(
      [
        "diff-index",
        "--cached",
        "-p",
        "--binary",
        "--full-index",
        "--no-ext-diff",
        "--no-textconv",
        "-M",
        comparisonBase,
      ],
      commandOptions,
      copiedIndexEnv,
    ).stdout;
    const supportedEntries = rawRecords
      .filter((record) => isSupportedRecord(record))
      .map((record) => toSnapshotEntry(record));
    const capturedBlobs = readCapturedBlobs(
      commandOptions,
      supportedBlobOids(rawRecords),
    );

    options?.test_hooks?.before_live_index_revalidation?.();

    const revalidatedLiveIndexBytes = readLiveIndexBytes(indexPath);
    const liveIndexSha256 = sha256Hex(revalidatedLiveIndexBytes);
    const revalidatedIndexWasPresent = liveIndexExists(indexPath);
    const revalidatedHeadState = parseStagedHeadState(commandOptions);

    if (
      revalidatedIndexWasPresent !== indexWasPresent ||
      liveIndexSha256 !== copiedIndexSha256 ||
      !sameHeadBaseState(headState, revalidatedHeadState)
    ) {
      return null;
    }

    return {
      repository_root: repositoryRoot,
      checkout: headState.checkout,
      identity: {
        kind: "staged",
        checkout: headState.checkout,
        base_state: headState.baseState,
        base_commit: headState.baseCommit,
        copied_index_sha256: copiedIndexSha256,
        live_index_sha256: liveIndexSha256,
        diff_sha256: sha256Hex(patchBytes),
        entries: supportedEntries,
      },
      status_entries: statusEntries,
      raw_records: rawRecords,
      patch_bytes: patchBytes,
      captured_blobs: capturedBlobs,
    };
  } finally {
    if (copiedIndexPath !== null && fs.existsSync(copiedIndexPath)) {
      fs.rmSync(copiedIndexPath, { force: true });
    }
    fs.rmSync(attributeWorkTree, { force: true, recursive: true });
  }
}

function parseRepositoryEntries(
  lsTreeBytes: Uint8Array,
  objectIdLength: number,
): readonly SnapshotEntry[] {
  const tokens = splitNulDelimited(lsTreeBytes);
  const entries: SnapshotEntry[] = [];

  for (const token of tokens) {
    const tabIndex = token.indexOf(0x09);

    if (tabIndex < 0) {
      continue;
    }

    const prefix = bytesToUtf8(token.slice(0, tabIndex));
    const pathBytes = token.slice(tabIndex + 1);
    if (!roundTripsUtf8(pathBytes)) {
      continue;
    }

    const relativePath = bytesToUtf8(pathBytes);
    const [mode, objectKind, objectId] = prefix.split(" ");

    if (
      mode === undefined ||
      objectKind !== "blob" ||
      objectId === undefined ||
      objectId.length !== objectIdLength ||
      !GIT_OBJECT_ID_PATTERN.test(objectId)
    ) {
      continue;
    }

    if (mode !== "100644" && mode !== "100755") {
      continue;
    }

    let language: SourceLanguage | null;
    try {
      language = detectLanguage(pathBytes);
      validateRelativePath(relativePath);
    } catch {
      continue;
    }

    if (language === null) {
      continue;
    }

    entries.push({
      path: validateRelativePath(relativePath),
      mode,
      language,
      base_blob_oid: null,
      snapshot_blob_oid: objectId as GitObjectId,
    });
  }

  return entries;
}

export function captureStagedSnapshot(
  repositoryRoot: string,
  options?: CaptureGitSnapshotOptions,
): StagedSnapshotCapture {
  const resolvedRepositoryRoot = resolveGitRepositoryRoot(repositoryRoot, options);

  for (let attemptNumber = 1; attemptNumber <= 3; attemptNumber += 1) {
    const capture = captureStagedAttempt(
      resolvedRepositoryRoot,
      attemptNumber,
      options,
    );

    if (capture !== null) {
      return capture;
    }
  }

  throw new GitSnapshotError("index_changed");
}

export function captureRepositorySnapshot(
  repositoryRoot: string,
  options?: CaptureGitSnapshotOptions,
): RepositorySnapshotCapture {
  const resolvedRepositoryRoot = resolveGitRepositoryRoot(repositoryRoot, options);
  const commandOptions = gitCommandOptions(resolvedRepositoryRoot, options);
  const objectFormat = gitObjectFormat(commandOptions);
  const objectIdLength = gitObjectIdLength(objectFormat);

  const headState = parseRepositoryHeadState(commandOptions);
  const lsTreeBytes = runGit(
    ["ls-tree", "-r", "-z", headState.commitOid],
    commandOptions,
  ).stdout;
  const entries = parseRepositoryEntries(lsTreeBytes, objectIdLength);
  const capturedBlobs = readCapturedBlobs(commandOptions, uniqueObjectIds(
    entries.map((entry) =>
      assertValidGitObjectId(
        entry.snapshot_blob_oid,
        `${entry.path} repository blob`,
      ),
    ),
  ));

  const identity: RepositorySnapshotIdentity = {
    kind: "repository",
    commit_oid: headState.commitOid,
    tree_sha256: sha256Hex(lsTreeBytes),
    working_changes_included: false,
    entries,
  };

  return {
    checkout: headState.checkout,
    identity,
    captured_blobs: capturedBlobs,
  };
}
