import assert from "node:assert/strict";
import test from "node:test";

import { createCliShell } from "../../src/main.js";

test("golden harness boots against the package shell only", () => {
  assert.strictEqual(createCliShell().implemented, false);
});
