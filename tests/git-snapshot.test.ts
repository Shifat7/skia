import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import {
  captureRepositorySnapshot,
  captureStagedSnapshot,
  GitSnapshotError,
} from "../src/git.js";
import {
  asBinary,
  checkoutDetachedHead,
  commitAll,
  createRepoSymlink,
  createTempGitRepository,
  headCommit,
  readGitFixture,
  removeRepoPath,
  renameRepoPath,
  runGit,
  stageAll,
  stagePaths,
  writeRepoBinaryFile,
  writeRepoTextFile,
} from "./git-test-helpers.js";

test("git snapshot captures explicit branch state, raw staged records, and canonical full-index patch bytes", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, "src/example.ts", readGitFixture("sample.ts"));
  stageAll(repositoryRoot);
  commitAll(repositoryRoot, "seed");

  writeRepoTextFile(
    repositoryRoot,
    "src/example.ts",
    `${readGitFixture("sample.ts")}\nexport const version = 2;\n`,
  );
  stagePaths(repositoryRoot, "src/example.ts");

  const snapshot = captureStagedSnapshot(repositoryRoot);

  assert.strictEqual(snapshot.checkout.state, "branch");
  assert.ok((snapshot.checkout.branch_name ?? "").length > 0);
  assert.strictEqual(snapshot.identity.base_state, "present");
  assert.strictEqual(snapshot.identity.entries.length, 1);
  assert.strictEqual(snapshot.identity.entries[0]?.path, "src/example.ts");
  assert.strictEqual(snapshot.identity.entries[0]?.language, "typescript");
  assert.strictEqual(snapshot.status_entries.length, 1);
  assert.strictEqual(snapshot.status_entries[0]?.status, "M");
  assert.strictEqual(snapshot.raw_records.length, 1);
  assert.strictEqual(snapshot.raw_records[0]?.path_display, "\"src/example.ts\"");
  assert.match(
    Buffer.from(snapshot.patch_bytes).toString("utf8"),
    /diff --git a\/src\/example\.ts b\/src\/example\.ts/,
  );
  assert.match(
    Buffer.from(snapshot.patch_bytes).toString("utf8"),
    /index [0-9a-f]{40}\.\.[0-9a-f]{40} 100644/,
  );
});

test("git snapshot represents unborn staged branches explicitly", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, "born.ts", readGitFixture("sample.ts"));
  stagePaths(repositoryRoot, "born.ts");

  const snapshot = captureStagedSnapshot(repositoryRoot);

  assert.strictEqual(snapshot.checkout.state, "branch");
  assert.ok((snapshot.checkout.branch_name ?? "").length > 0);
  assert.strictEqual(snapshot.identity.base_state, "unborn");
  assert.strictEqual(snapshot.identity.base_commit, null);
  assert.strictEqual(snapshot.identity.entries[0]?.path, "born.ts");
});

test("git snapshot represents detached staged state explicitly", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, "src/example.ts", readGitFixture("sample.ts"));
  stageAll(repositoryRoot);
  commitAll(repositoryRoot, "seed");
  checkoutDetachedHead(repositoryRoot);

  writeRepoTextFile(
    repositoryRoot,
    "src/example.ts",
    `${readGitFixture("sample.ts")}\nexport const detached = true;\n`,
  );
  stagePaths(repositoryRoot, "src/example.ts");

  const snapshot = captureStagedSnapshot(repositoryRoot);

  assert.strictEqual(snapshot.checkout.state, "detached");
  assert.strictEqual(snapshot.checkout.branch_name, null);
  assert.strictEqual(snapshot.identity.base_state, "present");
});

test("git snapshot captures the complete staged status set before filtering supported entries", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, "src/keep.ts", readGitFixture("sample.ts"));
  writeRepoTextFile(repositoryRoot, "delete.py", readGitFixture("sample.py"));
  writeRepoTextFile(repositoryRoot, "kind.py", readGitFixture("sample.py"));
  writeRepoTextFile(repositoryRoot, "old-name.txt", "rename me\n");
  writeRepoBinaryFile(repositoryRoot, "asset.bin", asBinary([0, 255, 17, 33]));
  stageAll(repositoryRoot);
  commitAll(repositoryRoot, "seed");

  writeRepoTextFile(
    repositoryRoot,
    "src/keep.ts",
    `${readGitFixture("sample.ts")}\nexport const kept = true;\n`,
  );
  renameRepoPath(repositoryRoot, "old-name.txt", "new-name.txt");
  removeRepoPath(repositoryRoot, "delete.py");
  removeRepoPath(repositoryRoot, "kind.py");
  createRepoSymlink(repositoryRoot, "kind.py", "src/keep.ts");
  writeRepoBinaryFile(
    repositoryRoot,
    "asset.bin",
    asBinary([99, 1, 2, 3, 4, 5, 6, 7]),
  );
  stageAll(repositoryRoot);

  const snapshot = captureStagedSnapshot(repositoryRoot);
  const statuses = snapshot.status_entries.map((entry) => entry.status);
  const supportedPaths = snapshot.identity.entries.map((entry) => entry.path);
  const patchText = Buffer.from(snapshot.patch_bytes).toString("utf8");

  assert.deepStrictEqual(statuses, ["M", "D", "T", "R100", "M"]);
  assert.deepStrictEqual(supportedPaths, ["src/keep.ts"]);
  assert.match(patchText, /GIT binary patch/);
  assert.strictEqual(snapshot.raw_records[2]?.mode, "120000");
  assert.strictEqual(snapshot.raw_records[3]?.previous_path_display, "\"old-name.txt\"");
  assert.strictEqual(snapshot.raw_records[3]?.path_display, "\"new-name.txt\"");
});

test("git snapshot preserves control characters in raw path display without treating them as supported source paths", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, "odd\nname.ts", readGitFixture("sample.ts"));
  stagePaths(repositoryRoot, "odd\nname.ts");

  const snapshot = captureStagedSnapshot(repositoryRoot);

  assert.strictEqual(snapshot.status_entries.length, 1);
  assert.strictEqual(snapshot.status_entries[0]?.path_display, "\"odd\\x0aname.ts\"");
  assert.deepStrictEqual(snapshot.identity.entries, []);
});

test("git snapshot retries after live index mutation and accepts a clean later generation", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, "src/example.ts", readGitFixture("sample.ts"));
  stageAll(repositoryRoot);
  commitAll(repositoryRoot, "seed");

  writeRepoTextFile(
    repositoryRoot,
    "src/example.ts",
    `${readGitFixture("sample.ts")}\nexport const first = true;\n`,
  );
  stagePaths(repositoryRoot, "src/example.ts");

  let mutated = false;
  const snapshot = captureStagedSnapshot(repositoryRoot, {
    test_hooks: {
      before_live_index_revalidation: () => {
        if (mutated) {
          return;
        }

        mutated = true;
        writeRepoTextFile(
          repositoryRoot,
          "src/extra.py",
          `${readGitFixture("sample.py")}\n`,
        );
        stagePaths(repositoryRoot, "src/extra.py");
      },
    },
  });

  assert.strictEqual(mutated, true);
  assert.deepStrictEqual(
    snapshot.identity.entries.map((entry) => entry.path),
    ["src/example.ts", "src/extra.py"],
  );
  assert.strictEqual(
    snapshot.identity.copied_index_sha256,
    snapshot.identity.live_index_sha256,
  );
});

test("git snapshot returns index_changed after a third live-index mismatch", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, "src/example.ts", readGitFixture("sample.ts"));
  stageAll(repositoryRoot);
  commitAll(repositoryRoot, "seed");

  writeRepoTextFile(
    repositoryRoot,
    "src/example.ts",
    `${readGitFixture("sample.ts")}\nexport const first = true;\n`,
  );
  stagePaths(repositoryRoot, "src/example.ts");

  let mutationCount = 0;

  try {
    captureStagedSnapshot(repositoryRoot, {
      test_hooks: {
        before_live_index_revalidation: () => {
          mutationCount += 1;
          writeRepoTextFile(
            repositoryRoot,
            "src/example.ts",
            `${readGitFixture("sample.ts")}\nexport const value = ${mutationCount};\n`,
          );
          stagePaths(repositoryRoot, "src/example.ts");
        },
      },
    });
  } catch (error) {
    if (error instanceof GitSnapshotError) {
      assert.strictEqual(error.reason, "index_changed");
      return;
    }

    throw error;
  }

  throw new Error("expected captureStagedSnapshot to throw index_changed");
});

test("repository snapshot binds to HEAD and excludes staged or working-tree changes", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, "src/committed.ts", readGitFixture("sample.ts"));
  stageAll(repositoryRoot);
  commitAll(repositoryRoot, "seed");

  writeRepoTextFile(
    repositoryRoot,
    "src/committed.ts",
    `${readGitFixture("sample.ts")}\nexport const worktreeOnly = true;\n`,
  );
  writeRepoTextFile(repositoryRoot, "src/staged.py", readGitFixture("sample.py"));
  stagePaths(repositoryRoot, "src/staged.py");

  const snapshot = captureRepositorySnapshot(repositoryRoot);

  assert.strictEqual(snapshot.identity.commit_oid, headCommit(repositoryRoot));
  assert.strictEqual(snapshot.identity.working_changes_included, false);
  assert.deepStrictEqual(
    snapshot.identity.entries.map((entry) => entry.path),
    ["src/committed.ts"],
  );
});

test("repository snapshot rejects a repository with no HEAD using the stable shared reason", () => {
  const repositoryRoot = createTempGitRepository();

  try {
    captureRepositorySnapshot(repositoryRoot);
  } catch (error) {
    if (error instanceof GitSnapshotError) {
      assert.strictEqual(error.reason, "no_head_commit");
      return;
    }

    throw error;
  }

  throw new Error("expected captureRepositorySnapshot to throw no_head_commit");
});
