import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { resolveLanguageRegistration } from "./languages/registry.js";
import { nextStagedReceiptTemporarySuffix } from "./receipt-temporary.js";
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
  readonly before_capture_temporary_removal?: () => void;
  readonly before_live_index_revalidation?: () => void;
  readonly force_path_temporary_removal?: boolean;
  readonly force_unavailable_descriptor_cleanup?: boolean;
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
  let published = false;

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
    fs.closeSync(fileDescriptor);
    published = true;
  } catch (error) {
    if (!published) {
      try {
        fs.closeSync(fileDescriptor);
      } catch {
        // The descriptor may already be closed.
      }
      fs.rmSync(filePath, { force: true });
    }
    throw error;
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

function gitCandidateNames(
  requested: string,
  processEnv: Readonly<Record<string, string | undefined>>,
): readonly string[] {
  if (process.platform !== "win32") {
    return [requested];
  }

  const extensions = (processEnv.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter((extension) => extension.length > 0);
  const hasExtension = extensions.some((extension) =>
    requested.toLowerCase().endsWith(extension.toLowerCase()),
  );

  return hasExtension
    ? [requested]
    : [requested, ...extensions.map((extension) => `${requested}${extension}`)];
}

function pathIsInsideRoot(root: string, candidate: string): boolean {
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    return true;
  }

  let resolved = candidate;
  try {
    resolved = fs.realpathSync(candidate);
  } catch {
    resolved = path.resolve(candidate);
  }

  const relative = path.relative(realRoot, resolved);
  if (relative === "" || path.isAbsolute(relative)) {
    return relative === "";
  }

  return !relative.split(path.sep).includes("..");
}

function resolvedPathInsideRepository(
  candidate: string,
  roots: readonly string[],
): boolean {
  return roots.some((root) => pathIsInsideRoot(root, candidate));
}

function gitCandidateOutsideRepository(
  candidate: string,
  roots: readonly string[],
): string | null {
  if (resolvedPathInsideRepository(candidate, roots)) {
    return null;
  }

  try {
    const stats = fs.statSync(candidate);
    if (!stats.isFile()) {
      return null;
    }
    if (process.platform !== "win32" && (stats.mode & 0o111) === 0) {
      return null;
    }

    return fs.realpathSync(candidate);
  } catch {
    return null;
  }
}

function resolveTrustedGitExecutable(
  requested: string,
  processEnv: Readonly<Record<string, string | undefined>>,
  roots: readonly string[],
): string {
  if (path.isAbsolute(requested)) {
    if (resolvedPathInsideRepository(requested, roots)) {
      throw new GitSnapshotError(
        "git_process_failed",
        "git executable must resolve outside the repository",
      );
    }

    return gitCandidateOutsideRepository(requested, roots) ?? requested;
  }

  if (requested.includes("/") || requested.includes("\\")) {
    throw new GitSnapshotError(
      "git_process_failed",
      "git executable must be resolved from an absolute PATH entry",
    );
  }

  const resolved = resolveTrustedPathExecutable(requested, processEnv, roots);
  if (resolved === null) {
    throw new GitSnapshotError(
      "git_process_failed",
      "git executable was not found on an absolute PATH entry",
    );
  }

  return resolved;
}

function resolveTrustedPathExecutable(
  requested: string,
  processEnv: Readonly<Record<string, string | undefined>>,
  roots: readonly string[],
): string | null {
  if (path.isAbsolute(requested) || requested.includes("/") || requested.includes("\\")) {
    return null;
  }

  const pathValue = processEnv.PATH ?? process.env.PATH ?? "";
  for (const entry of pathValue.split(path.delimiter)) {
    if (entry.length === 0 || !path.isAbsolute(entry)) {
      continue;
    }

    for (const name of gitCandidateNames(requested, processEnv)) {
      const accepted = gitCandidateOutsideRepository(
        path.join(entry, name),
        roots,
      );
      if (accepted !== null) {
        return accepted;
      }
    }
  }

  return null;
}

function readSmallRegularFile(filePath: string, limit: number): string | null {
  let descriptor: number;
  try {
    descriptor = fs.openSync(
      filePath,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
  } catch {
    return null;
  }

  try {
    const stats = fs.fstatSync(descriptor);
    if (!stats.isFile() || stats.size > limit) {
      return null;
    }

    const bytes = Buffer.alloc(stats.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = fs.readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (read === 0) {
        break;
      }
      offset += read;
    }

    return Buffer.from(bytes.subarray(0, offset)).toString("utf8");
  } catch {
    return null;
  } finally {
    fs.closeSync(descriptor);
  }
}

function mainCheckoutForGitMarker(markerPath: string, containingDirectory: string): string | null {
  let stats: ReturnType<typeof fs.lstatSync>;
  try {
    stats = fs.lstatSync(markerPath);
  } catch {
    return null;
  }

  if (stats.isSymbolicLink()) {
    throw new GitSnapshotError(
      "git_process_failed",
      "git directory marker cannot be resolved",
    );
  }

  if (stats.isDirectory()) {
    return directoryMarkerCheckout(markerPath);
  }

  if (!stats.isFile()) {
    return null;
  }

  const marker = readSmallRegularFile(markerPath, 4_096);
  const gitDirMatch = marker?.match(/^gitdir: ([^\r\n]+)\s*$/m);
  const gitDirText = gitDirMatch?.[1];
  if (marker === null || gitDirText === undefined) {
    throw new GitSnapshotError(
      "git_process_failed",
      "git directory marker cannot be resolved",
    );
  }

  const lexicalGitDir = path.resolve(containingDirectory, gitDirText);
  let gitDir: string;
  try {
    gitDir = fs.realpathSync(lexicalGitDir);
  } catch {
    throw new GitSnapshotError(
      "git_process_failed",
      "git directory marker cannot be resolved",
    );
  }

  const commonText = readSmallRegularFile(path.join(gitDir, "commondir"), 4_096)?.trim();
  if (commonText === undefined || commonText.length === 0) {
    const submoduleParent = submoduleParentCheckout(gitDir);
    if (submoduleParent !== null) {
      return submoduleParent;
    }

    throw new GitSnapshotError(
      "git_process_failed",
      "git directory marker cannot be resolved",
    );
  }

  const commonDir = path.resolve(gitDir, commonText);
  const mainCheckout = path.dirname(commonDir);
  if (path.join(mainCheckout, ".git") === commonDir) {
    return mainCheckout;
  }

  throw new GitSnapshotError(
    "git_process_failed",
    "separate git directory is outside the trusted checkout layout",
  );
}

function directoryMarkerCheckout(gitDir: string): string | null {
  const commonText = readSmallRegularFile(path.join(gitDir, "commondir"), 4_096)?.trim();
  if (commonText === undefined || commonText.length === 0) {
    return null;
  }

  const commonDir = path.resolve(gitDir, commonText);
  let resolved: string;
  try {
    resolved = fs.realpathSync(commonDir);
  } catch {
    throw new GitSnapshotError(
      "git_process_failed",
      "git directory marker cannot be resolved",
    );
  }

  const mainCheckout = path.dirname(resolved);
  if (path.join(mainCheckout, ".git") === resolved) {
    return mainCheckout;
  }

  throw new GitSnapshotError(
    "git_process_failed",
    "separate git directory is outside the trusted checkout layout",
  );
}

function submoduleParentCheckout(gitDir: string): string | null {
  let resolved = gitDir;
  try {
    resolved = fs.realpathSync(gitDir);
  } catch {
    return null;
  }

  const parts = resolved.split(path.sep);
  const gitIndex = parts.lastIndexOf(".git");
  if (gitIndex < 1 || parts[gitIndex + 1] !== "modules") {
    return null;
  }

  const parent = parts.slice(0, gitIndex).join(path.sep);
  const modulesRoot = path.join(parent, ".git", "modules");
  return resolved === modulesRoot || resolved.startsWith(`${modulesRoot}${path.sep}`)
    ? parent
    : null;
}

function enclosingTrustRoots(start: string): readonly string[] {
  let current = path.resolve(start);
  try {
    current = fs.realpathSync(current);
  } catch {
    current = path.resolve(start);
  }

  const fallback = current;
  const roots = new Set<string>();
  let outermost: string | null = null;
  while (true) {
    const markerPath = path.join(current, ".git");
    let markerPresent = false;
    try {
      fs.lstatSync(markerPath);
      markerPresent = true;
    } catch {
      // A nested marker must not hide a worktree farther up.
    }

    if (markerPresent) {
      outermost = current;
      const mainCheckout = mainCheckoutForGitMarker(markerPath, current);
      if (mainCheckout !== null) {
        roots.add(mainCheckout);
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      roots.add(outermost ?? fallback);
      return [...roots];
    }
    current = parent;
  }
}

function gitCommandOptions(
  repositoryRoot: string,
  options?: CaptureGitSnapshotOptions,
): GitCommandOptions {
  return {
    gitExecutable: resolveTrustedGitExecutable(
      options?.git_executable ?? "git",
      options?.process_env ?? process.env,
      enclosingTrustRoots(repositoryRoot),
    ),
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

  const resolvedRoot = path.resolve(requestedRoot, discoveredRoot);
  if (!resolvedPathInsideRepository(resolvedRoot, enclosingTrustRoots(requestedRoot))) {
    throw new GitSnapshotError(
      "git_process_failed",
      "git worktree is outside the trusted checkout",
    );
  }

  return resolvedRoot;
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
  assertIgnoredRepositoryPaths(resolvedRoot, commandOptions, probes);
  return resolvedRoot;
}

export function assertStagedPersistencePathsIgnored(
  repositoryRoot: string,
  runId: string,
  sessionId: string,
): void {
  const resolvedRoot = resolveGitRepositoryRoot(repositoryRoot);
  const commandOptions = gitCommandOptions(resolvedRoot);
  assertIgnoredRepositoryPaths(
    resolvedRoot,
    commandOptions,
    stagedPersistenceProbePaths(runId, sessionId),
  );
}

function assertIgnoredRepositoryPaths(
  resolvedRoot: string,
  commandOptions: GitCommandOptions,
  probes: readonly string[],
): void {
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
    `${SKIA_DIRECTORY_NAME}/${TMP_DIRECTORY_NAME}`,
    `${SKIA_DIRECTORY_NAME}/${TMP_DIRECTORY_NAME}/attribute-worktree-${process.pid}-1-probe`,
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

function stagedPersistenceProbePaths(
  runId: string,
  sessionId: string,
): readonly string[] {
  const receiptName = `${runId}-${sessionId}-session.json`;

  return [
    `${SKIA_DIRECTORY_NAME}/${RUN_ID_CLAIMS_DIRECTORY_NAME}/${runId}.json`,
    `${SKIA_DIRECTORY_NAME}/${ARTIFACTS_DIRECTORY_NAME}/${runId}-${sessionId}-behavior_cards.json`,
    `${SKIA_DIRECTORY_NAME}/${RECEIPTS_DIRECTORY_NAME}/${receiptName}`,
    `${SKIA_DIRECTORY_NAME}/${RECEIPTS_DIRECTORY_NAME}/.${receiptName}.tmp-${nextStagedReceiptTemporarySuffix()}`,
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

function filesystemErrorCode(error: unknown): string | null {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
}

function readLiveIndexBytes(indexPath: string): Uint8Array {
  let descriptor: number;
  try {
    descriptor = fs.openSync(
      indexPath,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
  } catch (error) {
    if (filesystemErrorCode(error) === "ENOENT") {
      return Buffer.alloc(0);
    }
    throw new GitSnapshotError("git_process_failed", "Git index must be a regular file");
  }

  try {
    const stats = fs.fstatSync(descriptor);
    if (!stats.isFile()) {
      throw new GitSnapshotError("git_process_failed", "Git index must be a regular file");
    }
    if (stats.size > MAX_GIT_INDEX_BYTES) {
      throw new GitSnapshotError(
        "git_index_limit_exceeded",
        `Git index is ${stats.size} bytes; limit is ${MAX_GIT_INDEX_BYTES} bytes`,
      );
    }

    const bytes = Buffer.alloc(stats.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = fs.readSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        null,
      );
      if (read === 0) {
        break;
      }
      offset += read;
    }

    return offset === bytes.length ? bytes : bytes.subarray(0, offset);
  } finally {
    fs.closeSync(descriptor);
  }
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

function recordPath(bytes: Uint8Array | null): string | null {
  if (bytes === null || !roundTripsUtf8(bytes)) {
    return null;
  }

  try {
    return bytesToUtf8(bytes);
  } catch {
    return null;
  }
}

function concatPatchBytes(parts: readonly Uint8Array[]): Uint8Array {
  const present = parts.filter((part) => part.byteLength > 0);
  if (present.length === 1) {
    return present[0] ?? Buffer.alloc(0);
  }

  const chunks: Uint8Array[] = [];
  for (const part of present) {
    const previous = chunks[chunks.length - 1];
    if (previous !== undefined && previous[previous.length - 1] !== 0x0a) {
      chunks.push(Buffer.from("\n"));
    }
    chunks.push(part);
  }

  return Buffer.concat(chunks);
}

function blobContainsNul(
  commandOptions: GitCommandOptions,
  oid: GitObjectId | null,
): boolean {
  if (oid === null) {
    return false;
  }

  return runGit(["cat-file", "blob", oid], commandOptions).stdout.includes(0);
}

function cachedAttribute(
  commandOptions: GitCommandOptions,
  extraEnv: Readonly<Record<string, string | undefined>>,
  relativePath: string,
  attribute: "diff" | "text",
): string | null {
  const fields: string[] = [];
  const stdout = runGit(
    ["check-attr", "-z", "--cached", attribute, "--", relativePath],
    commandOptions,
    extraEnv,
  ).stdout;
  let start = 0;
  for (let index = 0; index <= stdout.length; index += 1) {
    if (index < stdout.length && stdout[index] !== 0) {
      continue;
    }
    fields.push(bytesToUtf8(stdout.subarray(start, index)));
    start = index + 1;
  }

  const [reportedPath, reportedAttribute, reportedValue] = fields;
  return reportedPath === relativePath && reportedAttribute === attribute
    ? reportedValue ?? null
    : null;
}

function patchSectionHasHunk(patch: Uint8Array, relativePath: string): boolean {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(patch);
  const header = `diff --git a/${relativePath} b/${relativePath}`;
  const start = text.indexOf(header);
  if (start < 0) {
    return false;
  }

  const next = text.indexOf("\ndiff --git ", start + header.length);
  const section = next < 0 ? text.slice(start) : text.slice(start, next);
  return section.includes("\n@@");
}

function stagedPatchBytes(
  commandOptions: GitCommandOptions,
  extraEnv: Readonly<Record<string, string | undefined>>,
  comparisonBase: string,
  rawRecords: readonly GitRawSnapshotRecord[],
): Uint8Array {
  const binaryArgv = [
    "-c",
    "diff.suppressBlankEmpty=false",
    "diff-index",
    "--cached",
    "--ignore-submodules=none",
    "-p",
    "--binary",
    "--full-index",
    "--no-ext-diff",
    "--no-textconv",
    "-M",
    "-C",
    "--find-copies-harder",
    comparisonBase,
  ];
  const binaryPatch = runGit(binaryArgv, commandOptions, extraEnv).stdout;
  const textPaths: string[] = [];

  for (const record of rawRecords) {
    if (!isSupportedRecord(record)) {
      continue;
    }

    const relativePath = recordPath(record.path_bytes);
    if (relativePath === null || patchSectionHasHunk(binaryPatch, relativePath)) {
      continue;
    }

    const diffAttribute = cachedAttribute(
      commandOptions,
      extraEnv,
      relativePath,
      "diff",
    );
    if (diffAttribute === "unset") {
      continue;
    }

    textPaths.push(relativePath);
  }

  if (textPaths.length === 0) {
    return binaryPatch;
  }

  return concatPatchBytes([
    binaryPatch,
    runGit(
      [
        "-c",
        "diff.suppressBlankEmpty=false",
        "diff-index",
        "--cached",
        "--ignore-submodules=none",
        "-p",
        "--text",
        "--full-index",
        "--no-ext-diff",
        "--no-textconv",
        "-M",
        "-C",
        "--find-copies-harder",
        comparisonBase,
        "--",
        ...textPaths,
      ],
      commandOptions,
      extraEnv,
    ).stdout,
  ]);
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

export function readRepositoryBlob(
  repositoryRoot: string,
  oid: GitObjectId,
): Uint8Array {
  if (!GIT_OBJECT_ID_PATTERN.test(oid)) {
    throw new GitSnapshotError(
      "git_process_failed",
      "Git blob identity is not a Git object id",
    );
  }

  const bytes = runGit(
    ["cat-file", "blob", oid],
    gitCommandOptions(path.resolve(repositoryRoot)),
  ).stdout;
  if (!gitBlobBytesMatchOid(oid, bytes)) {
    throw new GitSnapshotError(
      "git_process_failed",
      "Git blob bytes do not match the object id",
    );
  }

  return bytes;
}

function gitBlobBytesMatchOid(oid: string, bytes: Uint8Array): boolean {
  const algorithm = oid.length === 40 ? "sha1" : oid.length === 64 ? "sha256" : null;
  if (algorithm === null) {
    return false;
  }

  return createHash(algorithm)
    .update(`blob ${bytes.byteLength}\0`)
    .update(bytes)
    .digest("hex") === oid;
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
    if (!gitBlobBytesMatchOid(oid, bytes)) {
      throw new GitSnapshotError(
        "git_process_failed",
        "Git blob bytes do not match the object id",
      );
    }

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
  cleanup: CaptureCleanupRecord,
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
  const copiedIndexPath = tempIndexFilePath(
    tmpRoot,
    attemptNumber,
    options?.temporary_stamp ?? Date.now(),
  );
  let attributeWorkTree: string | null = null;
  const originalLiveIndexSha256 = sha256Hex(liveIndexBytes);
  let copiedIndexSha256 = originalLiveIndexSha256;
  let copiedIndexDescriptor: number | null = null;

  try {
    attributeWorkTree = createTemporaryAttributeWorkTree(tmpRoot, attemptNumber);
    rememberCaptureTemporary(cleanup, tmpRoot, attributeWorkTree);

    if (indexWasPresent) {
      createNewProtectedFile(copiedIndexPath, liveIndexBytes);
    } else {
      runGit(
        ["read-tree", "--empty"],
        commandOptions,
        {
          GIT_DIR: gitDirectory,
          GIT_INDEX_FILE: copiedIndexPath,
        },
      );
      copiedIndexSha256 = sha256Hex(readLiveIndexBytes(copiedIndexPath));
    }
    rememberCaptureTemporary(cleanup, tmpRoot, copiedIndexPath);
    copiedIndexDescriptor = fs.openSync(
      copiedIndexPath,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    const boundIndex = processDescriptorPath(copiedIndexDescriptor);
    if (boundIndex === null) {
      throw new GitSnapshotError(
        "git_process_failed",
        "Git index snapshot cannot be bound to its file",
      );
    }

    options?.test_hooks?.after_copied_index_created?.();

    const comparisonBase =
      headState.baseState === "present"
        ? assertValidGitObjectId(headState.baseCommit, "staged base commit")
        : (EMPTY_TREE_OIDS[objectFormat] as GitObjectId);
    const copiedIndexEnv = {
      GIT_DIR: gitDirectory,
      GIT_INDEX_FILE: boundIndex,
      GIT_WORK_TREE: attributeWorkTree,
    };
    const statusEntries = parseStatusEntries(
      runGit(
        ["diff-index", "--cached", "--ignore-submodules=none", "--name-status", "-z", "-M", "-C", "--find-copies-harder", comparisonBase],
        commandOptions,
        copiedIndexEnv,
      ).stdout,
    );
    const rawRecords = parseRawRecords(
      runGit(
        ["diff-index", "--cached", "--ignore-submodules=none", "--raw", "-z", "-M", "-C", "--find-copies-harder", "--full-index", comparisonBase],
        commandOptions,
        copiedIndexEnv,
      ).stdout,
      objectIdLength,
    );
    const patchBytes = stagedPatchBytes(
      commandOptions,
      copiedIndexEnv,
      comparisonBase,
      rawRecords,
    );
    const supportedEntries = rawRecords
      .filter((record) => isSupportedRecord(record))
      .map((record) => toSnapshotEntry(record));
    const capturedBlobs = readCapturedBlobs(
      commandOptions,
      supportedBlobOids(rawRecords),
    );

    options?.test_hooks?.before_live_index_revalidation?.();

    const copiedBytes = readDescriptorBytes(copiedIndexDescriptor);
    if (sha256Hex(copiedBytes) !== copiedIndexSha256) {
      return null;
    }

    const revalidatedLiveIndexBytes = readLiveIndexBytes(indexPath);
    const liveIndexSha256 = sha256Hex(revalidatedLiveIndexBytes);
    const revalidatedIndexWasPresent = liveIndexExists(indexPath);
    const revalidatedHeadState = parseStagedHeadState(commandOptions);

    if (
      revalidatedIndexWasPresent !== indexWasPresent ||
      liveIndexSha256 !== originalLiveIndexSha256 ||
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
    if (copiedIndexDescriptor !== null) {
      fs.closeSync(copiedIndexDescriptor);
    }
    removeRecordedCaptureTemporaries(cleanup);
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

interface CaptureCleanupRecord {
  tmpRoot: string | null;
  tmpDev: number;
  tmpIno: number;
  paths: string[];
  beforeDelete: (() => void) | null;
  forcePathDeletion: boolean;
  descriptorCleanupUnavailable: boolean;
}

function rememberCaptureTemporary(
  record: CaptureCleanupRecord,
  tmpRoot: string,
  createdPath: string,
): void {
  const stats = fs.lstatSync(tmpRoot);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new GitSnapshotError(
      "git_process_failed",
      "Git temporary directory must be a real directory",
    );
  }

  if (
    record.tmpRoot !== null &&
    (record.tmpRoot !== tmpRoot || record.tmpDev !== stats.dev || record.tmpIno !== stats.ino)
  ) {
    throw new GitSnapshotError(
      "git_process_failed",
      "Git temporary directory changed during capture",
    );
  }

  record.tmpRoot = tmpRoot;
  record.tmpDev = stats.dev;
  record.tmpIno = stats.ino;
  record.paths.push(createdPath);
}

function openCaptureTemporaryDirectory(tmpRoot: string): number | null {
  const flags = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
  try {
    return fs.openSync(tmpRoot, flags | fs.constants.O_DIRECTORY);
  } catch {
    try {
      return fs.openSync(tmpRoot, flags);
    } catch {
      return null;
    }
  }
}

function processDescriptorPath(descriptor: number): string | null {
  const magic = `/proc/${process.pid}/fd/${descriptor}`;
  try {
    const followed = fs.statSync(magic);
    const viaDescriptor = fs.fstatSync(descriptor);
    return followed.dev === viaDescriptor.dev && followed.ino === viaDescriptor.ino
      ? magic
      : null;
  } catch {
    return null;
  }
}

function descriptorPath(descriptor: number): string | null {
  for (const magic of [`/proc/self/fd/${descriptor}`, `/dev/fd/${descriptor}`]) {
    try {
      const followed = fs.statSync(magic);
      const viaDescriptor = fs.fstatSync(descriptor);
      if (followed.dev === viaDescriptor.dev && followed.ino === viaDescriptor.ino) {
        return magic;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function readDescriptorBytes(descriptor: number): Uint8Array {
  const stats = fs.fstatSync(descriptor);
  if (!stats.isFile()) {
    throw new GitSnapshotError("git_process_failed", "Git index must be a regular file");
  }
  if (stats.size > MAX_GIT_INDEX_BYTES) {
    throw new GitSnapshotError(
      "git_index_limit_exceeded",
      `Git index is ${stats.size} bytes; limit is ${MAX_GIT_INDEX_BYTES} bytes`,
    );
  }

  const bytes = Buffer.alloc(stats.size);
  let offset = 0;
  while (offset < bytes.length) {
    const read = fs.readSync(descriptor, bytes, offset, bytes.length - offset, offset);
    if (read === 0) {
      break;
    }
    offset += read;
  }

  return Buffer.from(bytes.subarray(0, offset));
}

function magicDirectoryMatches(directory: number, magic: string): boolean {
  try {
    const linkStats = fs.lstatSync(magic);
    if (!linkStats.isSymbolicLink() && !linkStats.isDirectory()) {
      return false;
    }

    const followed = fs.statSync(magic);
    const viaDescriptor = fs.fstatSync(directory);
    return followed.isDirectory()
      && followed.dev === viaDescriptor.dev
      && followed.ino === viaDescriptor.ino;
  } catch {
    return false;
  }
}

function captureTemporaryDeletionRoot(
  directory: number,
  forcePathDeletion: boolean,
  descriptorCleanupUnavailable: boolean,
): string | null {
  if (descriptorCleanupUnavailable) {
    return null;
  }

  const candidates = forcePathDeletion
    ? [`/dev/fd/${directory}`]
    : [`/proc/self/fd/${directory}`, `/dev/fd/${directory}`];
  for (const magic of candidates) {
    if (magicDirectoryMatches(directory, magic)) {
      return magic;
    }
  }

  return null;
}

function recordedChildNames(record: CaptureCleanupRecord): string[] {
  if (record.tmpRoot === null) {
    return [];
  }

  const names: string[] = [];
  for (const target of record.paths) {
    if (path.dirname(target) !== record.tmpRoot) {
      continue;
    }

    const childName = target.slice(record.tmpRoot.length + path.sep.length);
    if (
      childName.length === 0 ||
      childName.includes(path.sep) ||
      childName.includes("/") ||
      childName.includes("\\")
    ) {
      continue;
    }

    names.push(childName);
  }

  return names;
}

function removeRecordedCaptureTemporaries(record: CaptureCleanupRecord): void {
  if (record.tmpRoot === null) {
    return;
  }

  const directory = openCaptureTemporaryDirectory(record.tmpRoot);
  if (directory === null) {
    return;
  }

  try {
    const stats = fs.fstatSync(directory);
    if (
      !stats.isDirectory() ||
      stats.dev !== record.tmpDev ||
      stats.ino !== record.tmpIno
    ) {
      return;
    }

    const deletionRoot = captureTemporaryDeletionRoot(
      directory,
      record.forcePathDeletion,
      record.descriptorCleanupUnavailable,
    );
    record.beforeDelete?.();
    if (deletionRoot === null) {
      if (recordedChildNames(record).length > 0) {
        throw new GitSnapshotError(
          "git_process_failed",
          "Git temporary cleanup failed",
        );
      }
      return;
    }

    const childNames = recordedChildNames(record);

    for (const childName of childNames) {
      const childPath = path.join(deletionRoot, childName);
      try {
        const child = fs.lstatSync(childPath);
        if (child.isSymbolicLink()) {
          continue;
        }
        fs.rmSync(childPath, { force: true, recursive: child.isDirectory() });
      } catch {
        // The capture temporary is already gone.
      }
    }
  } finally {
    fs.closeSync(directory);
  }
}

function bindCaptureInterruptCleanup(record: CaptureCleanupRecord): () => void {
  const cleanupAndExit = (exitCode: number): void => {
    try {
      removeRecordedCaptureTemporaries(record);
    } catch {
      // Exit still has to leave the interrupted capture.
    }
    process.exit(exitCode);
  };
  const onSigint = (): void => {
    cleanupAndExit(130);
  };
  const onSigterm = (): void => {
    cleanupAndExit(143);
  };
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);
  return () => {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  };
}

export function captureStagedSnapshot(
  repositoryRoot: string,
  options?: CaptureGitSnapshotOptions,
): StagedSnapshotCapture {
  const resolvedRepositoryRoot = resolveGitRepositoryRoot(repositoryRoot, options);
  const cleanup: CaptureCleanupRecord = {
    tmpRoot: null,
    tmpDev: 0,
    tmpIno: 0,
    paths: [],
    beforeDelete: options?.test_hooks?.before_capture_temporary_removal ?? null,
    forcePathDeletion: options?.test_hooks?.force_path_temporary_removal === true,
    descriptorCleanupUnavailable:
      options?.test_hooks?.force_unavailable_descriptor_cleanup === true,
  };
  const unbindCaptureInterruptCleanup = bindCaptureInterruptCleanup(cleanup);

  try {
    for (let attemptNumber = 1; attemptNumber <= 3; attemptNumber += 1) {
      const capture = captureStagedAttempt(
        resolvedRepositoryRoot,
        attemptNumber,
        cleanup,
        options,
      );

      if (capture !== null) {
        return capture;
      }
    }

    throw new GitSnapshotError("index_changed");
  } finally {
    unbindCaptureInterruptCleanup();
  }
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
