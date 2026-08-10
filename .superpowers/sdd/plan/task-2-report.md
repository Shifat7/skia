# Task 2 Report

Date: 2026-08-10

Status: DONE_WITH_CONCERNS

Commit hash: `cdaa0f1` (initial Task 2 implementation commit before this
report backfill; the final amended task commit hash is returned in the
assistant response)

Commit message: `feat: add shared domain and schema envelopes`

Changed files:

- `.superpowers/sdd/plan/task-2-report.md`
- `fixtures/schema/invalid-coverage-summary.json`
- `fixtures/schema/invalid-repository-manifest-artifacts.json`
- `fixtures/schema/invalid-snapshot-identity-base-state.json`
- `fixtures/schema/invalid-staged-receipt-snapshot-kind.json`
- `fixtures/schema/valid-coverage.json`
- `fixtures/schema/valid-repository-manifest.json`
- `fixtures/schema/valid-snapshot-identity.json`
- `fixtures/schema/valid-staged-receipt.json`
- `package.json`
- `schemas/repository-manifest.ts`
- `schemas/shared.ts`
- `schemas/snapshot-identity.ts`
- `schemas/staged-receipt.ts`
- `src/schema.ts`
- `src/types.ts`
- `tests/schema-contract.test.ts`
- `tsconfig.json`
- `types/node-shim.d.ts`

Scope summary:

- Added shared language-neutral Task 2 domain contracts in `src/types.ts` for
  snapshot identity, source languages, anchors, parse results, coverage
  events, run/artifact states, and stable error reasons.
- Added strict Draft 2020-12 schema documents and Ajv 8.20.0 validators for
  snapshot identity, coverage envelopes, staged receipts, and repository
  manifests, including cross-field invariant checks for snapshot/base state,
  coverage arithmetic, artifact hash/path integrity, and manifest references.
- Added fixture-backed schema contract tests and expanded the compiled `npm test`
  harness so the new Task 2 suite runs in the normal package test flow.
- Preserved Task 2 scope: no parser node exposure, no parser execution,
  no Git/path/storage behavior, and no Task 3+ workflow implementation.

Focused diff self-review:

- Correctness: verified the validators reject staged/repository envelope
  mismatches, broken coverage arithmetic, duplicate or unresolved artifact
  references, and invalid snapshot identity combinations.
- Readability: kept the public domain surface concentrated in `src/types.ts`
  and the runtime validation/cross-field rules concentrated in `src/schema.ts`
  plus `schemas/`.
- Architecture: shared contracts remain language-neutral and mode-neutral;
  staged/repository differences are expressed only in discriminated envelopes.
- Security/safety: validation treats fixture and artifact inputs as untrusted,
  keeps strict additional-property rejection, and does not add filesystem,
  parser, Git, or network behavior.
- Scope: confirmed the diff stays inside Task 2 domain/schema envelopes,
  test fixtures, and the minimum test-harness changes needed to execute the
  new contracts.

Exact commands and output:

1. `npm run build`

   Output:

   ```text
   > skia@0.0.0 build
   > tsc -p tsconfig.json
   ```

2. `npm test -- --test-name-pattern='schema|domain'`

   Output:

   ```text
   > skia@0.0.0 test
   > node --test dist/tests/*.test.js dist/tests/golden/*.test.js dist/tests/security/*.test.js --test-name-pattern=schema|domain

   ✔ bootstrap shell exposes the frozen command surfaces without side effects (2.181625ms)
   ✔ runCli returns an unimplemented shell result and copies argv (0.286791ms)
   ✔ golden harness boots against the package shell only (1.351708ms)
   ✔ domain source-language discriminants remain frozen (1.098666ms)
   ✔ schema snapshot identity accepts the valid staged fixture (1.806042ms)
   ✔ schema snapshot identity rejects a present base state without a base commit (0.436458ms)
   ✔ schema coverage accepts internally consistent event arithmetic (1.964541ms)
   ✔ schema coverage rejects mismatched summary arithmetic (1.50975ms)
   ✔ schema staged receipt accepts the valid fixture envelope (3.248083ms)
   ✔ schema staged receipt rejects repository snapshots in the staged envelope (0.364292ms)
   ✔ schema repository manifest accepts the valid fixture envelope (3.3595ms)
   ✔ schema repository manifest rejects coverage and card references that do not resolve (0.721584ms)
   ✔ security harness boots without executing repository behavior (1.800875ms)
   ℹ tests 13
   ℹ suites 0
   ℹ pass 13
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ todo 0
   ℹ duration_ms 241.830458
   ```

3. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' --version`

   Output:

   ```text
   v24.14.0
   ```

4. `mktemp -d /private/tmp/skia-task2-frozen-toolchain-XXXXXX`

   Output:

   ```text
   /private/tmp/skia-task2-frozen-toolchain-kHDh9r
   ```

5. `test -f /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js && echo present`

   Output:

   ```text
   present
   ```

6. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js --version`

   Output:

   ```text
   11.18.0
   ```

7. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' ./node_modules/typescript/bin/tsc --version`

   Output:

   ```text
   Version 7.0.2
   ```

8. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js --cache /private/tmp/skia-task1-frozen-toolchain-wvkkiS/npm-cache --userconfig /dev/null ci`

   Output:

   ```text
   added 14 packages in 4s

   2 packages are looking for funding
     run `npm fund` for details
   npm warn allow-scripts 4 packages have install scripts not yet covered by allowScripts:
   npm warn allow-scripts   tree-sitter@0.21.1 (install: node-gyp-build)
   npm warn allow-scripts   tree-sitter-javascript@0.23.1 (install: node-gyp-build)
   npm warn allow-scripts   tree-sitter-python@0.21.0 (install: node-gyp-build)
   npm warn allow-scripts   tree-sitter-typescript@0.23.2 (install: node-gyp-build)
   npm warn allow-scripts
   npm warn allow-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
   ```

9. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js --cache /private/tmp/skia-task1-frozen-toolchain-wvkkiS/npm-cache --userconfig /dev/null run typecheck`

   Output:

   ```text
   > skia@0.0.0 typecheck
   > tsc --noEmit -p tsconfig.json
   ```

10. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js --cache /private/tmp/skia-task1-frozen-toolchain-wvkkiS/npm-cache --userconfig /dev/null run build`

    Output:

    ```text
    > skia@0.0.0 build
    > tsc -p tsconfig.json
    ```

11. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js --cache /private/tmp/skia-task1-frozen-toolchain-wvkkiS/npm-cache --userconfig /dev/null test -- --test-name-pattern='schema|domain'`

    Output:

    ```text
    > skia@0.0.0 test
    > node --test dist/tests/*.test.js dist/tests/golden/*.test.js dist/tests/security/*.test.js --test-name-pattern=schema|domain

    ✔ bootstrap shell exposes the frozen command surfaces without side effects (2.181625ms)
    ✔ runCli returns an unimplemented shell result and copies argv (0.286791ms)
    ✔ golden harness boots against the package shell only (1.351708ms)
    ✔ domain source-language discriminants remain frozen (1.098666ms)
    ✔ schema snapshot identity accepts the valid staged fixture (1.806042ms)
    ✔ schema snapshot identity rejects a present base state without a base commit (0.436458ms)
    ✔ schema coverage accepts internally consistent event arithmetic (1.964541ms)
    ✔ schema coverage rejects mismatched summary arithmetic (1.50975ms)
    ✔ schema staged receipt accepts the valid fixture envelope (3.248083ms)
    ✔ schema staged receipt rejects repository snapshots in the staged envelope (0.364292ms)
    ✔ schema repository manifest accepts the valid fixture envelope (3.3595ms)
    ✔ schema repository manifest rejects coverage and card references that do not resolve (0.721584ms)
    ✔ security harness boots without executing repository behavior (1.800875ms)
    ℹ tests 13
    ℹ suites 0
    ℹ pass 13
    ℹ fail 0
    ℹ cancelled 0
    ℹ skipped 0
    ℹ todo 0
    ℹ duration_ms 241.830458
    ```

12. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' --test dist/tests/schema-contract.test.js`

    Output:

    ```text
    ✔ domain source-language discriminants remain frozen (1.882167ms)
    ✔ schema snapshot identity accepts the valid staged fixture (1.719416ms)
    ✔ schema snapshot identity rejects a present base state without a base commit (0.447166ms)
    ✔ schema coverage accepts internally consistent event arithmetic (2.327584ms)
    ✔ schema coverage rejects mismatched summary arithmetic (0.33925ms)
    ✔ schema staged receipt accepts the valid fixture envelope (2.888166ms)
    ✔ schema staged receipt rejects repository snapshots in the staged envelope (0.351625ms)
    ✔ schema repository manifest accepts the valid fixture envelope (3.153208ms)
    ✔ schema repository manifest rejects coverage and card references that do not resolve (0.28875ms)
    ℹ tests 9
    ℹ suites 0
    ℹ pass 9
    ℹ fail 0
    ℹ cancelled 0
    ℹ skipped 0
    ℹ todo 0
    ℹ duration_ms 225.765833
    ```

13. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js --cache /private/tmp/skia-task1-frozen-toolchain-wvkkiS/npm-cache --userconfig /dev/null test`

    Output:

    ```text
    > skia@0.0.0 test
    > node --test dist/tests/*.test.js dist/tests/golden/*.test.js dist/tests/security/*.test.js

    ✔ bootstrap shell exposes the frozen command surfaces without side effects (1.227792ms)
    ✔ runCli returns an unimplemented shell result and copies argv (0.307625ms)
    ✔ golden harness boots against the package shell only (0.65725ms)
    ✔ domain source-language discriminants remain frozen (1.087167ms)
    ✔ schema snapshot identity accepts the valid staged fixture (1.867ms)
    ✔ schema snapshot identity rejects a present base state without a base commit (0.457625ms)
    ✔ schema coverage accepts internally consistent event arithmetic (1.969958ms)
    ✔ schema coverage rejects mismatched summary arithmetic (1.499083ms)
    ✔ schema staged receipt accepts the valid fixture envelope (3.06975ms)
    ✔ schema staged receipt rejects repository snapshots in the staged envelope (0.365375ms)
    ✔ schema repository manifest accepts the valid fixture envelope (3.553375ms)
    ✔ schema repository manifest rejects coverage and card references that do not resolve (0.703375ms)
    ✔ security harness boots without executing repository behavior (1.355166ms)
    ℹ tests 13
    ℹ suites 0
    ℹ pass 13
    ℹ fail 0
    ℹ cancelled 0
    ℹ skipped 0
    ℹ todo 0
    ℹ duration_ms 240.722042
    ```

14. `python3 scripts/check_docs.py`

    Output:

    ```text
    Checked 18 Markdown files, 5 issue-form YAML files, 7 JSON fences, and 24 external URLs.
    Documentation checks passed.
    ```

15. `git diff --check`

    Output:

    ```text
    <no output>
    ```

Concerns:

- `npm ci` under the frozen npm 11.18.0 CLI still emits `allow-scripts`
  warnings for the Tree-sitter packages. The command succeeds, but the warning
  remains part of the exact evidence.
- `npm test -- --test-name-pattern='schema|domain'` does not isolate only the
  schema/domain top-level tests under the current Node runner behavior, so I
  included a direct compiled `dist/tests/schema-contract.test.js` run as the
  focused evidence set.
