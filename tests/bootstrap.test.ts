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
    implemented: false,
  });
});

test("runCli returns an unimplemented shell result and copies argv", () => {
  const argv = ["review", "--repo", "/tmp/example"];
  const result = runCli(argv);

  assert.deepStrictEqual(result, {
    argv,
    kind: "unimplemented_shell",
  });
  assert.notStrictEqual(result.argv, argv);
});
