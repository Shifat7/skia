import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { captureRepositorySnapshot, captureStagedSnapshot } from "../../src/git.js";
import { analyzeSourceFile } from "../../src/languages/registry.js";
import type { CoverageEventId } from "../../src/types.js";
import {
  commitAll,
  createTempGitRepository,
  stageAll,
  stagePaths,
  writeRepoTextFile,
} from "../git-test-helpers.js";

function coverageEventId(value: string): CoverageEventId {
  return value as CoverageEventId;
}

test("phase 1 foundation checks do not execute target repository package scripts or code", () => {
  const repositoryRoot = createTempGitRepository();
  const markerPath = path.join(repositoryRoot, "repo-script-ran.txt");

  writeRepoTextFile(
    repositoryRoot,
    "package.json",
    JSON.stringify({
      name: "target-repo",
      private: true,
      scripts: {
        prepare: "node scripts/side-effect.mjs",
        test: "node scripts/side-effect.mjs",
      },
    }, null, 2),
  );
  writeRepoTextFile(
    repositoryRoot,
    "scripts/side-effect.mjs",
    `import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(markerPath)}, "ran", "utf8");\nthrow new Error("target repository code should not execute");\n`,
  );
  writeRepoTextFile(repositoryRoot, "src/example.ts", "export const version = 1;\n");
  stageAll(repositoryRoot);
  commitAll(repositoryRoot, "seed");

  writeRepoTextFile(repositoryRoot, "src/example.ts", "export const version = 2;\n");
  stagePaths(repositoryRoot, "src/example.ts");

  const stagedSnapshot = captureStagedSnapshot(repositoryRoot);
  const repositorySnapshot = captureRepositorySnapshot(repositoryRoot);
  const analysis = analyzeSourceFile({
    coverage_event_id: coverageEventId("coverage:src/example.ts"),
    max_bytes: 4_096,
    mode: "100644",
    path: "src/example.ts",
    snapshot_kind: "staged",
    status: "M",
    bytes: fs.readFileSync(path.join(repositoryRoot, "src/example.ts")),
  });

  assert.strictEqual(fs.existsSync(markerPath), false);
  assert.strictEqual(stagedSnapshot.identity.entries[0]?.path, "src/example.ts");
  assert.strictEqual(repositorySnapshot.identity.entries[0]?.path, "src/example.ts");
  assert.strictEqual(analysis.coverage_event.coverage, "supported");
});
