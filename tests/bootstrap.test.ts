import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMAND_SURFACES,
  createCliShell,
  runCli,
} from "../src/main.js";

test("bootstrap shell exposes the frozen command surfaces without side effects", () => {
  assert.deepStrictEqual(COMMAND_SURFACES, [
    "review",
    "repo review",
    "runs list",
    "runs inspect",
    "runs delete",
  ]);

  assert.deepStrictEqual(createCliShell(), {
    commandName: "skia",
    commandSurfaces: [
      "review",
      "repo review",
      "runs list",
      "runs inspect",
      "runs delete",
    ],
    implemented: "partial",
    implementedCommandSurfaces: ["review"],
  });
});

test("runCli escapes control characters in unimplemented command output", () => {
  const result = runCli(["repo", "review\u001b[31m"]);

  assert.strictEqual(result.kind, "unimplemented_shell");
  if (result.kind !== "unimplemented_shell") {
    return;
  }
  assert.strictEqual(result.output.includes("\u001b"), false);
  assert.match(result.output, /\\u001b/);
});

test("runCli rejects unimplemented command surfaces and copies argv", () => {
  const argv = ["review", "--repo", "/tmp/example"];
  const result = runCli(argv);

  assert.deepStrictEqual(result, {
    argv,
    exit_code: 2,
    kind: "unimplemented_shell",
    output: "Command is not implemented: review --repo /tmp/example\n",
  });
  if (result.kind !== "unimplemented_shell") {
    throw new Error("expected unimplemented shell result");
  }
  assert.notStrictEqual(result.argv, argv);
});
