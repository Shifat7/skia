import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import { listRuns } from "../../src/storage.js";
import {
  commitAll,
  createTempGitRepository,
  runGit,
  stagePaths,
  writeRepoTextFile,
} from "../git-test-helpers.js";

const NODE_EXECUTABLE = (process as unknown as {
  readonly execPath?: string;
}).execPath ?? "node";

test("executable rejects multiple staged files without executing or modifying target source", () => {
  const repositoryRoot = createTempGitRepository();
  const source = [
    "export function gateStatus(code: string): string {",
    '  if (code === "ready") {',
    '    return "ok";',
    "  }",
    "",
    '  return "hold";',
    "}",
    "",
  ].join("\n");
  writeRepoTextFile(repositoryRoot, ".gitignore", ".skia/\n");
  stagePaths(repositoryRoot, ".gitignore");
  commitAll(repositoryRoot, "initial");
  writeRepoTextFile(
    repositoryRoot,
    "package.json",
    JSON.stringify({
      scripts: {
        preinstall: "touch target-code-executed",
        test: "touch target-code-executed",
      },
    }),
  );
  writeRepoTextFile(repositoryRoot, "src/gate-status.ts", source);
  stagePaths(repositoryRoot, "package.json", "src/gate-status.ts");
  const stagedPatchBefore = runGit(repositoryRoot, ["diff", "--cached", "--binary"]).stdout;

  const result = spawnSync(
    NODE_EXECUTABLE,
    [path.join(process.cwd(), "dist/src/main.js"), "review"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      input: '"ok"\n',
    },
  );

  assert.strictEqual(result.status, 2);
  assert.match(String(result.stdout), /no_supported_staged_entity/);
  assert.strictEqual(
    fs.existsSync(path.join(repositoryRoot, "target-code-executed")),
    false,
  );
  assert.strictEqual(
    fs.readFileSync(path.join(repositoryRoot, "src/gate-status.ts"), "utf8"),
    source,
  );
  assert.strictEqual(
    runGit(repositoryRoot, ["diff", "--cached", "--binary"]).stdout,
    stagedPatchBefore,
  );
});

test("executable staged review succeeds for exactly one supported staged file", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, ".gitignore", ".skia/\n");
  const packageJson = JSON.stringify({
    scripts: {
      postinstall: "touch target-code-executed",
      test: "touch target-code-executed",
    },
  });
  writeRepoTextFile(repositoryRoot, "package.json", packageJson);
  stagePaths(repositoryRoot, ".gitignore", "package.json");
  commitAll(repositoryRoot, "initial");
  const source = [
    "export function gateStatus(code: string): string {",
    '  if (code === "ready") {',
    '    return "ok";',
    "  }",
    "",
    '  return "hold";',
    "}",
    "",
  ].join("\n");
  writeRepoTextFile(repositoryRoot, "src/gate-status.ts", source);
  stagePaths(repositoryRoot, "src/gate-status.ts");
  const patchBefore = runGit(repositoryRoot, ["diff", "--cached", "--binary"]).stdout;
  const headBefore = runGit(repositoryRoot, ["rev-parse", "HEAD"]).stdout;

  const result = spawnSync(
    NODE_EXECUTABLE,
    [path.join(process.cwd(), "dist/src/main.js"), "review"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      input: '"ok"\n',
    },
  );

  assert.strictEqual(
    result.status,
    0,
    `${String(result.stdout)}\n${String(result.stderr)}`,
  );
  assert.match(String(result.stdout), /Evidence: code === "ready"/);
  assert.match(String(result.stdout), /Source check: source_derived_match/);
  assert.strictEqual(
    fs.existsSync(path.join(repositoryRoot, "target-code-executed")),
    false,
  );
  assert.strictEqual(
    fs.readFileSync(path.join(repositoryRoot, "src/gate-status.ts"), "utf8"),
    source,
  );
  assert.strictEqual(
    fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
    packageJson,
  );
  assert.strictEqual(
    runGit(repositoryRoot, ["diff", "--cached", "--binary"]).stdout,
    patchBefore,
  );
  assert.strictEqual(runGit(repositoryRoot, ["rev-parse", "HEAD"]).stdout, headBefore);
  assert.strictEqual(
    fs.readdirSync(path.join(repositoryRoot, ".skia/receipts")).length,
    1,
  );
});

test("executable runs when Node receives an installed-bin style symlink path", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, ".gitignore", ".skia/\n");
  stagePaths(repositoryRoot, ".gitignore");
  commitAll(repositoryRoot, "initial");
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
    ].join("\n"),
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");
  const binPath = path.join(repositoryRoot, "skia-bin");
  fs.symlinkSync(path.join(process.cwd(), "dist/src/main.js"), binPath);

  const result = spawnSync(NODE_EXECUTABLE, [binPath, "review"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    input: '"ok"\n',
  });

  assert.strictEqual(result.status, 0);
  assert.match(String(result.stdout), /Source check: source_derived_match/);
});

test("executable rejects malformed UTF-8 prediction bytes", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, ".gitignore", ".skia/\n");
  stagePaths(repositoryRoot, ".gitignore");
  commitAll(repositoryRoot, "initial");
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
    ].join("\n"),
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");

  const result = spawnSync(
    NODE_EXECUTABLE,
    [path.join(process.cwd(), "dist/src/main.js"), "review"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      input: Buffer.from([0x22, 0xff, 0x22, 0x0a]),
    },
  );

  assert.strictEqual(result.status, 2);
  assert.match(String(result.stdout), /valid JSON scalar/);
});

test("executable removes the reserved run when prediction input is interrupted", async () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, ".gitignore", ".skia/\n");
  stagePaths(repositoryRoot, ".gitignore");
  commitAll(repositoryRoot, "initial");
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
    ].join("\n"),
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");
  const child = spawn(
    NODE_EXECUTABLE,
    [path.join(process.cwd(), "dist/src/main.js"), "review"],
    { cwd: repositoryRoot },
  );
  let output = "";
  const timers = globalThis as unknown as {
    clearTimeout(handle: number): void;
    setTimeout(callback: () => void, delayMs: number): number;
  };
  const exit = await new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
    const timeout = timers.setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`prompt was not reached:\n${output}`));
    }, 10_000);
    child.stdout.on("data", (chunk) => {
      output += Buffer.from(chunk).toString("utf8");
      if (output.includes("Predict THEN")) {
        child.kill("SIGINT");
      }
    });
    child.on("exit", (code, signal) => {
      timers.clearTimeout(timeout);
      resolve({ code, signal });
    });
  });

  assert.strictEqual(exit.code, 130);
  assert.deepStrictEqual(listRuns(repositoryRoot), []);
  assert.deepStrictEqual(listRuns(repositoryRoot), []);
});
