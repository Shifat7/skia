import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  captureStagedSnapshot,
  GitSnapshotError,
} from "../../src/git.js";
import {
  commitAll,
  createTempGitRepository,
  createWrapperScript,
  readGitFixture,
  resolveGitExecutable,
  setExecutableEnvironment,
  snapshotGitDirectory,
  stageAll,
  stagePaths,
  writeRepoTextFile,
} from "../git-test-helpers.js";

const TEMP_PREFIX = path.join(os.tmpdir(), "skia-task4-security-");

test("git security uses the fixed allowlisted environment, clears inherited redirect/network variables, and disables ext-diff/textconv", () => {
  const repositoryRoot = createTempGitRepository();
  const logDirectory = fs.mkdtempSync(TEMP_PREFIX);
  const logPath = path.join(logDirectory, "git-env.log");
  const realGit = resolveGitExecutable();

  writeRepoTextFile(repositoryRoot, "src/example.ts", readGitFixture("sample.ts"));
  stageAll(repositoryRoot);
  commitAll(repositoryRoot, "seed");
  writeRepoTextFile(
    repositoryRoot,
    "src/example.ts",
    `${readGitFixture("sample.ts")}\nexport const updated = true;\n`,
  );
  stagePaths(repositoryRoot, "src/example.ts");

  const wrapper = createWrapperScript(`#!/bin/sh
{
  printf 'ARGV='
  for arg in "$@"; do
    printf '[%s]' "$arg"
  done
  printf '\\n'
  for key in GIT_OPTIONAL_LOCKS GIT_NO_LAZY_FETCH GIT_PAGER PAGER GIT_TERMINAL_PROMPT LC_ALL GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_CONFIG GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_SSH GIT_SSH_COMMAND SSH_AUTH_SOCK SSH_AGENT_PID HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy all_proxy no_proxy; do
    value=$(printenv "$key")
    printf '%s=%s\\n' "$key" "$value"
  done
} >> "${logPath}"
exec "${realGit}" "$@"
`);

  captureStagedSnapshot(repositoryRoot, {
    git_executable: wrapper,
    process_env: setExecutableEnvironment({
      GIT_DIR: "/tmp/evil-git-dir",
      GIT_WORK_TREE: "/tmp/evil-worktree",
      GIT_OBJECT_DIRECTORY: "/tmp/evil-objects",
      GIT_SSH_COMMAND: "ssh -o ProxyCommand=evil",
      HTTP_PROXY: "http://127.0.0.1:9",
      HTTPS_PROXY: "http://127.0.0.1:9",
      ALL_PROXY: "socks5://127.0.0.1:9",
      NO_PROXY: "internal.example",
    }),
  });

  const log = fs.readFileSync(logPath, "utf8");

  assert.match(log, /GIT_OPTIONAL_LOCKS=0/);
  assert.match(log, /GIT_NO_LAZY_FETCH=1/);
  assert.match(log, /GIT_PAGER=cat/);
  assert.match(log, /PAGER=cat/);
  assert.match(log, /GIT_TERMINAL_PROMPT=0/);
  assert.match(log, /LC_ALL=C/);
  assert.match(log, /GIT_DIR=$/m);
  assert.match(log, /GIT_WORK_TREE=$/m);
  assert.match(log, /GIT_OBJECT_DIRECTORY=$/m);
  assert.match(log, /GIT_SSH_COMMAND=$/m);
  assert.match(log, /HTTP_PROXY=$/m);
  assert.match(log, /HTTPS_PROXY=$/m);
  assert.match(log, /ALL_PROXY=$/m);
  assert.match(log, /NO_PROXY=$/m);
  assert.match(log, /ARGV=\[[^\n]*--no-ext-diff\]/);
  assert.match(log, /ARGV=\[[^\n]*--no-textconv\]/);
});

test("git security bounds hung subprocesses and escapes diagnostics", () => {
  const repositoryRoot = createTempGitRepository();
  const wrapper = createWrapperScript(`#!/bin/sh
printf 'bad\\033[31m\\001detail\\n' >&2
sleep 2
exit 1
`);

  try {
    captureStagedSnapshot(repositoryRoot, {
      git_executable: wrapper,
      timeout_ms: 100,
    });
  } catch (error) {
    if (error instanceof GitSnapshotError) {
      assert.strictEqual(error.reason, "git_timeout");
      assert.strictEqual((error.detail ?? "").includes("\u001b"), false);
      assert.strictEqual((error.detail ?? "").includes("\u0001"), false);
      return;
    }

    throw error;
  }

  throw new Error("expected a timeout GitSnapshotError");
});

test("git security escapes carriage returns in process diagnostics", () => {
  const repositoryRoot = createTempGitRepository();
  const wrapper = createWrapperScript(`#!/bin/sh
printf 'bad\\rdetail\\n' >&2
exit 1
`);

  let thrown: unknown = null;
  try {
    captureStagedSnapshot(repositoryRoot, { git_executable: wrapper });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof GitSnapshotError);
  if (!(thrown instanceof GitSnapshotError)) {
    throw new Error("expected a GitSnapshotError");
  }

  assert.strictEqual(thrown.reason, "git_process_failed");
  assert.strictEqual((thrown.detail ?? "").includes("\r"), false);
  assert.match(thrown.detail ?? "", /\\r/);
});

test("git security enforces subprocess output bounds", () => {
  const repositoryRoot = createTempGitRepository();
  const wrapper = createWrapperScript(`#!/bin/sh
i=0
while [ "$i" -lt 200 ]; do
  printf '0123456789abcdef'
  i=$((i + 1))
done
`);

  try {
    captureStagedSnapshot(repositoryRoot, {
      git_executable: wrapper,
      output_limit_bytes: 128,
    });
  } catch (error) {
    if (error instanceof GitSnapshotError) {
      assert.strictEqual(error.reason, "git_output_limit_exceeded");
      return;
    }

    throw error;
  }

  throw new Error("expected a git_output_limit_exceeded error");
});

test("git security snapshot capture does not write the live index or any git internals", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, "src/example.ts", readGitFixture("sample.ts"));
  stageAll(repositoryRoot);
  commitAll(repositoryRoot, "seed");
  writeRepoTextFile(
    repositoryRoot,
    "src/example.ts",
    `${readGitFixture("sample.ts")}\nexport const updated = true;\n`,
  );
  stagePaths(repositoryRoot, "src/example.ts");

  const before = snapshotGitDirectory(repositoryRoot);
  captureStagedSnapshot(repositoryRoot);
  const after = snapshotGitDirectory(repositoryRoot);

  assert.deepStrictEqual(after, before);
  assert.strictEqual(
    fs.existsSync(path.join(repositoryRoot, ".git", "index.lock")),
    false,
  );
});
