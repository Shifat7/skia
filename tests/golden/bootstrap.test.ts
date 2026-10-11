import assert from "node:assert/strict";
import test from "node:test";

import { createCliShell } from "../../src/main.js";

test("golden harness reports the staged review command as implemented", () => {
  assert.strictEqual(createCliShell().implemented, "partial");
  assert.deepStrictEqual(createCliShell().implementedCommandSurfaces, ["review"]);
});
