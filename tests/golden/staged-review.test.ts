import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import {
  readBoundedTerminalLineFrom,
  runCli,
  terminalPredictionPayload,
} from "../../src/main.js";
import {
  listRuns,
  nextStagedReceiptTemporarySuffix,
} from "../../src/storage.js";
import {
  commitAll,
  createTempGitRepository,
  removeRepoPath,
  runGit,
  stagePaths,
  writeRepoTextFile,
} from "../git-test-helpers.js";

function createSupportedRepository(): string {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, ".gitignore", ".skia/\n");
  stagePaths(repositoryRoot, ".gitignore");
  commitAll(repositoryRoot, "initial");
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") {',
      '    return "ok";',
      "  }",
      "",
      '  return "hold";',
      "}",
      "",
    ].join("\n"),
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");
  return repositoryRoot;
}

test("skia review refuses to write when .skia is not ignored", () => {
  const repositoryRoot = createTempGitRepository();
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
  const result = runCli(["review"], {
    input: '"ok"\n',
    repository_root: repositoryRoot,
  });

  assert.strictEqual(result.exit_code, 2);
  assert.strictEqual(result.kind, "review_failed");
  assert.match(result.output, /\.skia\/.*gitignore/i);
  assert.strictEqual(fs.existsSync(path.join(repositoryRoot, ".skia")), false);
});

test("skia review verifies each output subtree against ignore negation", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(
    repositoryRoot,
    ".gitignore",
    ".skia/*\n!.skia/artifacts/\n.skia/artifacts/behavior_cards/\n",
  );
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

  const result = runCli(["review"], {
    input: '"ok"\n',
    repository_root: repositoryRoot,
  });

  assert.strictEqual(result.kind, "review_failed");
  assert.match(
    result.output,
    /\.skia\/artifacts\/[0-9]{8}T[0-9]{6}Z-[0-9a-f]{16}-behavior_cards\.json/,
  );
  assert.strictEqual(fs.existsSync(path.join(repositoryRoot, ".skia")), false);
});

test("skia review probes a generated run id rather than a hexadecimal token", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(
    repositoryRoot,
    ".gitignore",
    [
      ".skia/*",
      "!.skia/artifacts/",
      ".skia/artifacts/????????[0-9a-f]???????-????????????????-behavior_cards.json",
      "",
    ].join("\n"),
  );
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

  const result = runCli(["review"], {
    input: '"ok"\n',
    repository_root: repositoryRoot,
  });

  assert.strictEqual(result.kind, "review_failed");
  assert.match(
    result.output,
    /\.skia\/artifacts\/[0-9]{8}T[0-9]{6}Z-[0-9a-f]{16}-behavior_cards\.json/,
  );
  assert.strictEqual(fs.existsSync(path.join(repositoryRoot, ".skia")), false);
});

test("skia review probes collision-suffixed run ids before writing", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(
    repositoryRoot,
    ".gitignore",
    [
      ".skia/*",
      "!.skia/artifacts/",
      ".skia/artifacts/????????T??????Z-????????????????-behavior_cards.json",
      "",
    ].join("\n"),
  );
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

  const result = runCli(["review"], {
    input: '"ok"\n',
    repository_root: repositoryRoot,
  });

  assert.strictEqual(result.kind, "review_failed");
  assert.match(
    result.output,
    /\.skia\/artifacts\/[0-9]{8}T[0-9]{6}Z-01-[0-9a-f]{16}-behavior_cards\.json/,
  );
  assert.strictEqual(fs.existsSync(path.join(repositoryRoot, ".skia")), false);
});

test("skia review probes receipt temporary names before writing", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(
    repositoryRoot,
    ".gitignore",
    [
      ".skia/*",
      "!.skia/receipts/",
      ".skia/receipts/*-session.json",
      "",
    ].join("\n"),
  );
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

  const temporarySuffix = nextStagedReceiptTemporarySuffix();
  const result = runCli(["review"], {
    input: '"ok"\n',
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.kind, "review_failed");
  assert.match(
    result.output,
    new RegExp(
      `\\.skia/receipts/\\.20260922T010203Z-8f5d1a2c-session\\.json\\.tmp-${temporarySuffix}`,
    ),
  );
  assert.strictEqual(fs.existsSync(path.join(repositoryRoot, ".skia")), false);
});

test("skia review unbinds interrupt cleanup when prediction input throws", () => {
  const repositoryRoot = createSupportedRepository();
  const before = process.listenerCount("SIGINT");
  const result = runCli(["review"], {
    now: () => new Date("2026-09-22T01:02:03Z"),
    read_input: () => {
      throw new Error("prediction input failed");
    },
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.kind, "review_failed");
  assert.match(result.output, /prediction input failed/);
  assert.strictEqual(process.listenerCount("SIGINT"), before);
  assert.deepStrictEqual(listRuns(repositoryRoot), []);
});

test("skia review probes the timestamp that will name the artifact", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(
    repositoryRoot,
    ".gitignore",
    [
      ".skia/*",
      "!.skia/artifacts/",
      ".skia/artifacts/*",
      "!.skia/artifacts/2026*",
      "",
    ].join("\n"),
  );
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

  const result = runCli(["review"], {
    input: '"ok"\n',
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.kind, "review_failed");
  assert.match(
    result.output,
    /\.skia\/artifacts\/20260922T010203Z-8f5d1a2c-behavior_cards\.json/,
  );
  assert.strictEqual(fs.existsSync(path.join(repositoryRoot, ".skia")), false);
});

test("skia review golden path shows evidence before prediction and feedback after persistence", () => {
  const repositoryRoot = createSupportedRepository();
  const result = runCli(["review"], {
    input: '"ok"\n',
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.exit_code, 0);
  assert.strictEqual(result.kind, "review_complete");
  assert.strictEqual(
    result.output,
    [
      "Skia staged review",
      'Evidence: code === "ready" -> return "ok"',
      "Coverage: supported=2 partial=0 unmapped=5 unsupported=0 failed=0",
      'GIVEN code = "ready"',
      'WHEN gateStatus("ready")',
      'Predict THEN as JSON, or type "skip":',
      "Source check: source_derived_match",
      'Expected source-derived return: "ok"',
      "Receipt: .skia/receipts/20260922T010203Z-8f5d1a2c-session.json",
      "",
    ].join("\n"),
  );

  const predictionIndex = result.output.indexOf("Predict THEN");
  const feedbackIndex = result.output.indexOf("Source check:");
  assert.ok(predictionIndex >= 0 && feedbackIndex > predictionIndex);
  assert.strictEqual(
    fs.existsSync(
      `${repositoryRoot}/.skia/artifacts/20260922T010203Z-8f5d1a2c-behavior_cards.json`,
    ),
    true,
  );
});

test("skia review invoked from a subdirectory stores output at the discovered root", () => {
  const repositoryRoot = createSupportedRepository();
  const nestedDirectory = path.join(repositoryRoot, "src/nested");
  fs.mkdirSync(nestedDirectory, { recursive: true });
  const result = runCli(["review"], {
    input: '"ok"\n',
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: nestedDirectory,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.exit_code, 0);
  assert.match(result.output, /Receipt: \.skia\/receipts\//);
  assert.strictEqual(fs.existsSync(path.join(repositoryRoot, ".skia/receipts")), true);
  assert.strictEqual(fs.existsSync(path.join(nestedDirectory, ".skia")), false);
});

test("skia review skip writes a receipt without source-derived feedback", () => {
  const repositoryRoot = createSupportedRepository();
  const result = runCli(["review"], {
    input: "skip\n",
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.exit_code, 0);
  assert.strictEqual(result.kind, "review_skipped");
  assert.match(result.output, /Prediction skipped/);
  assert.strictEqual(result.output.includes("Source check:"), false);
});

test("skia review reports a source-derived mismatch without a correctness verdict", () => {
  const repositoryRoot = createSupportedRepository();
  const result = runCli(["review"], {
    input: '"hold"\n',
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.exit_code, 0);
  assert.match(result.output, /Source check: source_derived_mismatch/);
  assert.strictEqual(result.output.includes("incorrect"), false);
  assert.strictEqual(result.output.includes("failed review"), false);
});

test("skia review accepts null as a JSON-scalar prediction", () => {
  const repositoryRoot = createSupportedRepository();
  const result = runCli(["review"], {
    input: "null\n",
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.exit_code, 0);
  assert.strictEqual(result.kind, "review_complete");
  assert.match(result.output, /source_derived_mismatch/);
});

test("skia review distinguishes the JSON string skip from the skip command", () => {
  const repositoryRoot = createSupportedRepository();
  const result = runCli(["review"], {
    input: '"skip"\n',
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.kind, "review_complete");
  assert.match(result.output, /source_derived_mismatch/);
  assert.strictEqual(result.output.includes("Prediction skipped"), false);
});

test("terminal prediction input settles when the input stream errors", async () => {
  const listeners: {
    data?: (chunk: Uint8Array) => void;
    end?: () => void;
    error?: (error: Error) => void;
  } = {};
  const stream = {
    on(
      event: "data" | "end" | "error",
      listener: ((chunk: Uint8Array) => void) | (() => void) | ((error: Error) => void),
    ): void {
      if (event === "data") {
        listeners.data = listener as (chunk: Uint8Array) => void;
      } else if (event === "end") {
        listeners.end = listener as () => void;
      } else {
        listeners.error = listener as (error: Error) => void;
      }
    },
    off(
      event: "data" | "end" | "error",
      _listener?: unknown,
    ): void {
      delete listeners[event];
    },
    pause(): void {},
    resume(): void {},
  };
  const pending = readBoundedTerminalLineFrom(stream);
  const error = new Error("EIO");
  listeners.error?.(error);

  try {
    await pending;
    throw new Error("expected the terminal read to reject");
  } catch (caught) {
    assert.strictEqual(caught, error);
  }
});

test("skia review accepts a maximum-length prediction before its line terminator", () => {
  const repositoryRoot = createSupportedRepository();
  const prediction = `"${"x".repeat(4_094)}"`;
  assert.strictEqual(Buffer.from(prediction).byteLength, 4_096);
  const payload = terminalPredictionPayload(Buffer.from(`${prediction}\n`));
  assert.strictEqual(payload.byteLength, 4_096);
  const result = runCli(["review"], {
    input: `${prediction}\n`,
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.exit_code, 0);
  assert.strictEqual(result.kind, "review_complete");
});

test("skia review rejects terminal input above the published limit", () => {
  const repositoryRoot = createSupportedRepository();
  const result = runCli(["review"], {
    input: `"${"x".repeat(4_097)}"\n`,
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.exit_code, 2);
  assert.strictEqual(result.kind, "invalid_prediction");
  assert.match(result.output, /4096-byte input limit/);
  assert.strictEqual(fs.existsSync(`${repositoryRoot}/.skia/receipts`), false);
  assert.deepStrictEqual(listRuns(repositoryRoot), []);
});

test("skia review rejects non-JSON predictions without writing a receipt", () => {
  const repositoryRoot = createSupportedRepository();
  const result = runCli(["review"], {
    input: "ok\n",
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.exit_code, 2);
  assert.strictEqual(result.kind, "invalid_prediction");
  assert.match(result.output, /valid JSON scalar/);
  assert.strictEqual(fs.existsSync(`${repositoryRoot}/.skia/receipts`), false);
  assert.deepStrictEqual(listRuns(repositoryRoot), []);
});

test("skia review displays coverage when syntax is outside the pilot", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, ".gitignore", ".skia/\n");
  stagePaths(repositoryRoot, ".gitignore");
  commitAll(repositoryRoot, "initial");
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    "export const gateStatus = (code: string) => code;\n",
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");

  const result = runCli(["review"], {
    input: '"ok"\n',
    repository_root: repositoryRoot,
  });

  assert.strictEqual(result.kind, "review_unsupported");
  assert.match(result.output, /Coverage: .*unsupported=1/);
});

test("skia review enforces the 150-line budget before interaction", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, ".gitignore", ".skia/\n");
  stagePaths(repositoryRoot, ".gitignore");
  commitAll(repositoryRoot, "initial");
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    [
      ...Array.from({ length: 151 }, (_, index) => `// line ${index + 1}`),
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "ok";',
      '  return "hold";',
      "}",
    ].join("\n"),
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");
  let interacted = false;

  const result = runCli(["review"], {
    read_input: () => {
      interacted = true;
      return '"ok"';
    },
    repository_root: repositoryRoot,
  });

  assert.strictEqual(result.kind, "review_unsupported");
  assert.strictEqual(result.exit_code, 1);
  assert.match(result.output, /staged_budget_exceeded/);
  assert.match(result.output, /unsupported=155/);
  assert.strictEqual(interacted, false);
  assert.deepStrictEqual(listRuns(repositoryRoot), []);
});

test("skia review reserves and then cleans the run around prediction input", () => {
  const repositoryRoot = createSupportedRepository();
  const result = runCli(["review"], {
    now: () => new Date("2026-09-22T01:02:03Z"),
    read_input: () => {
      assert.deepStrictEqual(
        listRuns(repositoryRoot).map((run) => run.status),
        ["incomplete"],
      );
      return "not-json\n";
    },
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.kind, "invalid_prediction");
  assert.deepStrictEqual(listRuns(repositoryRoot), []);
});

test("skia review escapes Unicode terminal formatting controls", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, ".gitignore", ".skia/\n");
  stagePaths(repositoryRoot, ".gitignore");
  commitAll(repositoryRoot, "initial");
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    [
      "export function gateStatus(code: string): string {",
      '  if (code === "\\u2028FORGED") return "ok";',
      '  return "hold";',
      "}",
    ].join("\n"),
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");

  const result = runCli(["review"], {
    input: '"ok"\n',
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.exit_code, 0);
  assert.strictEqual(result.output.includes("\u2028"), false);
  assert.match(result.output, /\\u2028FORGED/);
});

test("skia review escapes formatting controls in expected values and errors", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, ".gitignore", ".skia/\n");
  stagePaths(repositoryRoot, ".gitignore");
  commitAll(repositoryRoot, "initial");
  writeRepoTextFile(
    repositoryRoot,
    "src/gate-status.ts",
    [
      "export function gateStatus(code: string): string {",
      '  if (code === "ready") return "\\u2060EXPECTED";',
      '  return "hold";',
      "}",
    ].join("\n"),
  );
  stagePaths(repositoryRoot, "src/gate-status.ts");
  const completed = runCli(["review"], {
    input: '"wrong"\n',
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });
  const failed = runCli(["review"], {
    input: '"wrong"\n',
    now: () => new Date("2026-09-22T01:02:04Z"),
    repository_root: repositoryRoot,
    session_id: "abcd\u202eefgh",
  });

  assert.strictEqual(completed.output.includes("\u2060"), false);
  assert.match(completed.output, /\\u2060EXPECTED/);
  assert.strictEqual(failed.output.includes("\u202e"), false);
  assert.match(failed.output, /\\u202e/);
});

test("skia review probes the copied-index stamp shared with snapshot capture", () => {
  const createdAt = new Date("2026-09-22T01:02:03Z");
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(
    repositoryRoot,
    ".gitignore",
    [".skia/*", "!.skia/tmp/", ""].join("\n"),
  );
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

  const result = runCli(["review"], {
    input: '"ok"\n',
    now: () => createdAt,
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.kind, "review_failed");
  assert.match(
    result.output,
    new RegExp(
      `\\.skia/tmp/copied-index-${process.pid}-${createdAt.getTime()}-1\\.bin`,
    ),
  );
  assert.strictEqual(fs.existsSync(path.join(repositoryRoot, ".skia")), false);
});

test("skia review refuses a tracked artifact path missing from the work tree", () => {
  const repositoryRoot = createTempGitRepository();
  writeRepoTextFile(repositoryRoot, ".gitignore", ".skia/\n");
  stagePaths(repositoryRoot, ".gitignore");
  commitAll(repositoryRoot, "initial");
  const artifactPath =
    ".skia/artifacts/20260922T010203Z-8f5d1a2c-behavior_cards.json";
  writeRepoTextFile(repositoryRoot, artifactPath, "{}\n");
  runGit(repositoryRoot, ["add", "-f", "--", artifactPath]);
  commitAll(repositoryRoot, "track artifact");
  removeRepoPath(repositoryRoot, artifactPath);
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

  const result = runCli(["review"], {
    input: '"ok"\n',
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.kind, "review_failed");
  assert.match(
    result.output,
    /\.skia\/artifacts\/20260922T010203Z-8f5d1a2c-behavior_cards\.json/,
  );
  assert.strictEqual(
    fs.existsSync(path.join(repositoryRoot, artifactPath)),
    false,
  );
  assert.strictEqual(
    fs.existsSync(path.join(repositoryRoot, ".skia/receipts")),
    false,
  );
});

test("skia review rechecks ignore status before persisting a prediction", () => {
  const repositoryRoot = createSupportedRepository();
  const result = runCli(["review"], {
    now: () => new Date("2026-09-22T01:02:03Z"),
    read_input: () => {
      writeRepoTextFile(repositoryRoot, ".gitignore", "\n");
      return '"ok"\n';
    },
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });

  assert.strictEqual(result.exit_code, 2);
  assert.strictEqual(result.kind, "review_failed");
  assert.match(result.output, /not ignored/);
  assert.strictEqual(
    fs.existsSync(
      path.join(
        repositoryRoot,
        ".skia/artifacts/20260922T010203Z-8f5d1a2c-behavior_cards.json",
      ),
    ),
    false,
  );
  assert.strictEqual(
    fs.existsSync(
      path.join(
        repositoryRoot,
        ".skia/receipts/20260922T010203Z-8f5d1a2c-session.json",
      ),
    ),
    false,
  );
  assert.deepStrictEqual(listRuns(repositoryRoot), []);
});

test("skia review probes the receipt temporary the next write will use", () => {
  const repositoryRoot = createSupportedRepository();
  const completed = runCli(["review"], {
    input: '"ok"\n',
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: repositoryRoot,
    session_id: "8f5d1a2c",
  });
  assert.strictEqual(completed.kind, "review_complete");
  const temporarySuffix = nextStagedReceiptTemporarySuffix();
  assert.strictEqual(temporarySuffix.endsWith("-1"), false);
  writeRepoTextFile(
    repositoryRoot,
    ".gitignore",
    [
      ".skia/*",
      "!.skia/receipts/",
      ".skia/receipts/*-session.json",
      "",
    ].join("\n"),
  );

  const result = runCli(["review"], {
    input: '"ok"\n',
    now: () => new Date("2026-09-22T01:02:04Z"),
    repository_root: repositoryRoot,
    session_id: "9f6e2b3d",
  });

  assert.strictEqual(result.kind, "review_failed");
  assert.match(
    result.output,
    new RegExp(
      `\\.skia/receipts/\\.20260922T010204Z-9f6e2b3d-session\\.json\\.tmp-${temporarySuffix}`,
    ),
  );
});

test("default session IDs distinguish independent review sessions", () => {
  const first = runCli(["review"], {
    input: '"ok"\n',
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: createSupportedRepository(),
  });
  const second = runCli(["review"], {
    input: '"ok"\n',
    now: () => new Date("2026-09-22T01:02:03Z"),
    repository_root: createSupportedRepository(),
  });
  const sessionPattern = /-([a-f0-9]{16})-session\.json/;
  const firstSession = sessionPattern.exec(first.output)?.[1];
  const secondSession = sessionPattern.exec(second.output)?.[1];

  assert.notStrictEqual(firstSession, undefined);
  assert.notStrictEqual(secondSession, undefined);
  assert.notStrictEqual(firstSession, secondSession);
});
