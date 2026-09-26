import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../../src/main.js";

test("security harness boots without executing repository behavior", () => {
  assert.deepStrictEqual(runCli(["repo", "review"]), {
    argv: ["repo", "review"],
    exit_code: 2,
    kind: "unimplemented_shell",
    output: "Command is not implemented: repo review\n",
  });
});
