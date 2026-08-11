import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const TEMP_PREFIX = "/private/tmp/skia-task4-";
const FIXTURE_DIRECTORY = path.join(process.cwd(), "fixtures/git");

export interface GitRunOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface DirectoryFileRecord {
  readonly path: string;
  readonly mode: number;
  readonly sha256: string;
}

export function readGitFixture(filename: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIRECTORY, filename), "utf8");
}

export function createTempGitRepository(): string {
  const repositoryRoot = fs.mkdtempSync(TEMP_PREFIX);
  runGit(repositoryRoot, ["init", "-q"]);
  runGit(repositoryRoot, ["config", "user.name", "skia"]);
  runGit(repositoryRoot, ["config", "user.email", "skia@example.com"]);
  return repositoryRoot;
}

export function writeRepoTextFile(
  repositoryRoot: string,
  relativePath: string,
  content: string,
): void {
  const absolutePath = path.join(repositoryRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf8");
}

export function writeRepoBinaryFile(
  repositoryRoot: string,
  relativePath: string,
  bytes: Uint8Array,
): void {
  const absolutePath = path.join(repositoryRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, bytes);
}

export function removeRepoPath(
  repositoryRoot: string,
  relativePath: string,
): void {
  fs.rmSync(path.join(repositoryRoot, relativePath), {
    force: true,
    recursive: true,
  });
}

export function renameRepoPath(
  repositoryRoot: string,
  currentRelativePath: string,
  nextRelativePath: string,
): void {
  const nextAbsolutePath = path.join(repositoryRoot, nextRelativePath);
  fs.mkdirSync(path.dirname(nextAbsolutePath), { recursive: true });
  fs.renameSync(
    path.join(repositoryRoot, currentRelativePath),
    nextAbsolutePath,
  );
}

export function createRepoSymlink(
  repositoryRoot: string,
  relativePath: string,
  target: string,
): void {
  const absolutePath = path.join(repositoryRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.symlinkSync(target, absolutePath);
}

export function stagePaths(
  repositoryRoot: string,
  ...relativePaths: readonly string[]
): void {
  runGit(repositoryRoot, ["add", "--", ...relativePaths]);
}

export function stageAll(repositoryRoot: string): void {
  runGit(repositoryRoot, ["add", "-A"]);
}

export function commitAll(repositoryRoot: string, message: string): void {
  runGit(repositoryRoot, ["commit", "-qm", message]);
}

export function checkoutDetachedHead(repositoryRoot: string): void {
  runGit(repositoryRoot, ["checkout", "--detach", "-q"]);
}

export function headCommit(repositoryRoot: string): string {
  return runGit(repositoryRoot, ["rev-parse", "HEAD"]).stdout.trim();
}

export function writeGitBlob(
  repositoryRoot: string,
  content: string | Uint8Array,
): string {
  const result = spawnSync("git", ["hash-object", "-w", "--stdin"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    input: typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content),
  });
  const stdout = String(result.stdout);
  const stderr = String(result.stderr);

  if (result.status !== 0) {
    throw new Error(
      `git hash-object -w --stdin failed (${result.status ?? "signal"}): ${stderr}`,
    );
  }

  return stdout.trim();
}

export function stageRawIndexEntry(
  repositoryRoot: string,
  blobOid: string,
  pathBytes: Uint8Array,
  mode = "100644",
): void {
  const result = spawnSync("git", ["update-index", "--add", "-z", "--index-info"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    input: Buffer.concat([
      Buffer.from(`${mode} ${blobOid}\t`, "utf8"),
      Buffer.from(pathBytes),
      Buffer.from([0x00]),
    ]),
  });
  const stderr = String(result.stderr);

  if (result.status !== 0) {
    throw new Error(
      `git update-index --add -z --index-info failed (${result.status ?? "signal"}): ${stderr}`,
    );
  }
}

export function removeLooseGitObject(
  repositoryRoot: string,
  objectId: string,
): void {
  fs.rmSync(
    path.join(repositoryRoot, ".git", "objects", objectId.slice(0, 2), objectId.slice(2)),
    { force: true },
  );
}

export function snapshotGitDirectory(
  repositoryRoot: string,
): readonly DirectoryFileRecord[] {
  const gitRoot = path.join(repositoryRoot, ".git");
  return walkDirectory(gitRoot, gitRoot);
}

function walkDirectory(
  rootPath: string,
  currentPath: string,
): readonly DirectoryFileRecord[] {
  const records: DirectoryFileRecord[] = [];

  for (const entryName of fs.readdirSync(currentPath)) {
    const absolutePath = path.join(currentPath, entryName);
    const stats = fs.lstatSync(absolutePath);

    if (stats.isDirectory()) {
      records.push(...walkDirectory(rootPath, absolutePath));
      continue;
    }

    if (!stats.isFile()) {
      continue;
    }

    const bytes = fs.readFileSync(absolutePath);
    records.push({
      path: absolutePath.slice(rootPath.length + 1),
      mode: stats.mode & 0o777,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  return records.sort((left, right) => left.path.localeCompare(right.path));
}

export function createWrapperScript(
  scriptBody: string,
): string {
  const wrapperPath = path.join(
    fs.mkdtempSync(TEMP_PREFIX),
    "git-wrapper.sh",
  );
  fs.writeFileSync(wrapperPath, scriptBody, { encoding: "utf8", mode: 0o755 });
  fs.chmodSync(wrapperPath, 0o755);
  return wrapperPath;
}

export function resolveGitExecutable(): string {
  const result = spawnSync("which", ["git"], {
    encoding: "utf8",
  });
  const stdout = String(result.stdout);
  const stderr = String(result.stderr);

  if (result.status !== 0 || stdout.trim().length === 0) {
    throw new Error(`unable to resolve git executable: ${stderr}`);
  }

  return stdout.trim();
}

export function runGit(
  repositoryRoot: string,
  args: readonly string[],
  options?: GitRunOptions,
): { readonly stdout: string; readonly stderr: string } {
  const result =
    options?.env === undefined
      ? spawnSync("git", [...args], {
          cwd: repositoryRoot,
          encoding: "utf8",
        })
      : spawnSync("git", [...args], {
          cwd: repositoryRoot,
          encoding: "utf8",
          env: options.env,
        });
  const stdout = String(result.stdout);
  const stderr = String(result.stderr);

  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (${result.status ?? "signal"}): ${stderr}`,
    );
  }

  return {
    stdout,
    stderr,
  };
}

export function setExecutableEnvironment(
  values: Readonly<Record<string, string>>,
): Readonly<Record<string, string | undefined>> {
  return {
    PATH: process.env.PATH,
    ...values,
  };
}

export function asBinary(bytes: readonly number[]): Uint8Array {
  return Buffer.from(bytes);
}
