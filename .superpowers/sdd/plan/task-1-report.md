# Task 1 Report

Date: 2026-08-09

Status: DONE_WITH_CONCERNS

Commit hash: `e21aec4`

Commit message: `chore: bootstrap task 1 package shell`

Changed files:

- `.superpowers/sdd/plan/task-1-report.md`
- `AGENTS.md`
- `CODE_OF_CONDUCT.md`
- `CONTRIBUTING.md`
- `GOVERNANCE.md`
- `README.md`
- `SECURITY.md`
- `package-lock.json`
- `package.json`
- `src/main.ts`
- `tests/bootstrap.test.ts`
- `tests/golden/bootstrap.test.ts`
- `tests/security/bootstrap.test.ts`
- `tsconfig.json`
- `types/node-shim.d.ts`

Scope summary:

- Added the first private package shell with the frozen package contract fields:
  ESM, exact pinned dependencies, `packageManager: npm@11.18.0`,
  `engines.node: >=24.0.0 <25`, and npm lockfile v3.
- Added a strict NodeNext TypeScript configuration that emits package code and
  test harness output into `dist/`.
- Added a side-effect-free CLI bootstrap entry point in `src/main.ts` without
  implementing parser, Git, storage, schema, or later task behavior.
- Added built-in `node:test` bootstrap coverage for unit, golden, and security
  harness scripts, with assertions limited to the package shell contract.
- Updated repository status documentation that would otherwise have become false
  after introducing the package shell and tests.

Focused diff self-review:

- Correctness: verified the package shell exposes only frozen command-surface
  metadata and an explicit `unimplemented_shell` result; no staged/repository
  behavior was implemented.
- Scope: confirmed the diff stays inside Task 1 scaffolding plus necessary
  truth-maintenance documentation updates. No parser, Git, storage, schema, or
  later feature modules were added.
- Testability: verified `npm run typecheck`, `npm run build`, and `npm test`
  pass against the generated lockfile, and that the placeholder
  `test:golden` / `test:security` scripts also execute cleanly.
- Concern retained at report close: after Fix round 1 resolved the original
  frozen-toolchain/runtime-mismatch evidence gap, the only remaining concern is
  the `npm ci` `allow-scripts` warning for Tree-sitter packages under the
  frozen-toolchain verification run.

Exact commands and output:

1. `node --version`

   Output:

   ```text
   v23.7.0
   ```

2. `npm --version`

   Output:

   ```text
   10.9.2
   ```

3. `npx tsc --version`

   Output:

   ```text
   Version 5.5.4
   ```

4. `npx tsc --noEmit -p /Users/shifatr/Documents/Dev/Repos/skia/skia/tsconfig.json`

   Output:

   ```text
   error TS2318: Cannot find global type 'Array'.
   error TS2318: Cannot find global type 'Boolean'.
   error TS2318: Cannot find global type 'CallableFunction'.
   error TS2318: Cannot find global type 'Function'.
   error TS2318: Cannot find global type 'IArguments'.
   error TS2318: Cannot find global type 'NewableFunction'.
   error TS2318: Cannot find global type 'Number'.
   error TS2318: Cannot find global type 'Object'.
   error TS2318: Cannot find global type 'RegExp'.
   error TS2318: Cannot find global type 'String'.
   tsconfig.json(3,15): error TS6046: Argument for '--target' option must be: 'es5', 'es6', 'es2015', 'es2016', 'es2017', 'es2018', 'es2019', 'es2020', 'es2021', 'es2022', 'es2023', 'esnext'.
   tsconfig.json(19,7): error TS6046: Argument for '--lib' option must be: 'es5', 'es6', 'es2015', 'es7', 'es2016', 'es2017', 'es2018', 'es2019', 'es2020', 'es2021', 'es2022', 'es2023', 'esnext', 'dom', 'dom.iterable', 'dom.asynciterable', 'webworker', 'webworker.importscripts', 'webworker.iterable', 'webworker.asynciterable', 'scripthost', 'es2015.core', 'es2015.collection', 'es2015.generator', 'es2015.iterable', 'es2015.promise', 'es2015.proxy', 'es2015.reflect', 'es2015.symbol', 'es2015.symbol.wellknown', 'es2016.array.include', 'es2016.intl', 'es2017.date', 'es2017.object', 'es2017.sharedmemory', 'es2017.string', 'es2017.intl', 'es2017.typedarrays', 'es2018.asyncgenerator', 'es2018.asynciterable', 'es2018.intl', 'es2018.promise', 'es2018.regexp', 'es2019.array', 'es2019.object', 'es2019.string', 'es2019.symbol', 'es2019.intl', 'es2020.bigint', 'es2020.date', 'es2020.promise', 'es2020.sharedmemory', 'es2020.string', 'es2020.symbol.wellknown', 'es2020.intl', 'es2020.number', 'es2021.promise', 'es2021.string', 'es2021.weakref', 'es2021.intl', 'es2022.array', 'es2022.error', 'es2022.intl', 'es2022.object', 'es2022.sharedmemory', 'es2022.string', 'es2022.regexp', 'es2023.array', 'es2023.collection', 'es2023.intl', 'esnext.array', 'esnext.collection', 'esnext.symbol', 'esnext.asynciterable', 'esnext.intl', 'esnext.disposable', 'esnext.bigint', 'esnext.string', 'esnext.promise', 'esnext.weakref', 'esnext.decorators', 'esnext.object', 'esnext.regexp', 'decorators', 'decorators.legacy'.
   ```

5. `npm install --package-lock-only`

   Output:

   ```text
   npm warn EBADENGINE Unsupported engine {
   npm warn EBADENGINE   package: 'skia@0.0.0',
   npm warn EBADENGINE   required: { node: '>=24.0.0 <25' },
   npm warn EBADENGINE   current: { node: 'v23.7.0', npm: '10.9.2' }
   npm warn EBADENGINE }

   up to date, audited 34 packages in 5s

   2 packages are looking for funding
     run `npm fund` for details

   found 0 vulnerabilities
   ```

6. `npm ci`

   Output:

   ```text
   npm warn EBADENGINE Unsupported engine {
   npm warn EBADENGINE   package: 'skia@0.0.0',
   npm warn EBADENGINE   required: { node: '>=24.0.0 <25' },
   npm warn EBADENGINE   current: { node: 'v23.7.0', npm: '10.9.2' }
   npm warn EBADENGINE }

   added 14 packages, and audited 15 packages in 8s

   2 packages are looking for funding
     run `npm fund` for details

   found 0 vulnerabilities
   ```

7. `npm run typecheck`

   Output:

   ```text
   > skia@0.0.0 typecheck
   > tsc --noEmit -p tsconfig.json
   ```

8. `npm run build`

   Output:

   ```text
   > skia@0.0.0 build
   > tsc -p tsconfig.json
   ```

9. `npm test`

   Output:

   ```text
   > skia@0.0.0 test
   > node --test dist/tests/bootstrap.test.js

   ✔ bootstrap shell exposes the frozen command surfaces without side effects (1.536375ms)
   ✔ runCli returns an unimplemented shell result and copies argv (0.272833ms)
   ℹ tests 2
   ℹ suites 0
   ℹ pass 2
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ todo 0
   ℹ duration_ms 74.719209
   ```

10. `python3 scripts/check_docs.py`

    Output:

    ```text
    Checked 17 Markdown files, 5 issue-form YAML files, 7 JSON fences, and 24 external URLs.
    Documentation checks passed.
    ```

11. `git diff --check`

    Output:

    ```text
    <no output>
    ```

12. `npm run test:golden`

    Output:

    ```text
    > skia@0.0.0 test:golden
    > node --test dist/tests/golden/bootstrap.test.js

    ✔ golden harness boots against the package shell only (0.542292ms)
    ℹ tests 1
    ℹ suites 0
    ℹ pass 1
    ℹ fail 0
    ℹ cancelled 0
    ℹ skipped 0
    ℹ todo 0
    ℹ duration_ms 62.869625
    ```

13. `npm run test:security`

    Output:

    ```text
    > skia@0.0.0 test:security
    > node --test dist/tests/security/bootstrap.test.js

    ✔ security harness boots without executing repository behavior (0.931709ms)
    ℹ tests 1
    ℹ suites 0
    ℹ pass 1
    ℹ fail 0
    ℹ cancelled 0
    ℹ skipped 0
    ℹ todo 0
    ℹ duration_ms 62.712917
    ```

Concerns:

- Historical only, resolved in Fix round 1: the original local environment was
  `node v23.7.0`, `npm 10.9.2`, and ambient `tsc 5.5.4`, which is why the
  initial red check could not validate the frozen Node 24.x / `npm@11.18.0` /
  `typescript@7.0.2` contract. That baseline evidence is preserved above, but
  it is no longer a current concern after the frozen-toolchain rerun below.
- Current concern: the frozen-toolchain `npm ci` rerun emitted `allow-scripts`
  warnings for Tree-sitter packages even though the command exited
  successfully.
- `npm test`, `npm run test:golden`, and `npm run test:security` intentionally
  target compiled output under `dist/`, so the verification order matters:
  build must run before those harness scripts.

## Fix round 1

Date: 2026-08-10

Status: fixed reviewer finding; frozen-toolchain verification appended below.

Summary:

- Re-ran the full Task 1 verification under the bundled Node `v24.14.0`
  executable at
  `/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`.
- Provisioned `npm@11.18.0` only in `/private/tmp` and used that exact npm CLI
  for every package verification command.
- Verified the pinned project TypeScript under that runtime as
  `Version 7.0.2`.
- Preserved Task 1 scope: no parser, Git, storage, schema, or Task 2+ work was
  added.

Exact commands and output:

1. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' --version`

   Output:

   ```text
   v24.14.0
   ```

2. `mktemp -d /private/tmp/skia-task1-frozen-toolchain-XXXXXX`

   Output:

   ```text
   /private/tmp/skia-task1-frozen-toolchain-wvkkiS
   ```

3. `npm install --prefix /private/tmp/skia-task1-frozen-toolchain-wvkkiS npm@11.18.0 --cache /private/tmp/skia-task1-frozen-toolchain-wvkkiS/npm-cache --no-save --ignore-scripts`

   Output:

   ```text
   added 1 package in 5s

   15 packages are looking for funding
     run `npm fund` for details
   npm notice
   npm notice New major version of npm available! 10.9.2 -> 12.0.2
   npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.0.2
   npm notice To update run: npm install -g npm@12.0.2
   npm notice
   ```

4. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js --version`

   Output:

   ```text
   11.18.0
   ```

5. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' ./node_modules/typescript/bin/tsc --version`

   Output:

   ```text
   Version 7.0.2
   ```

6. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js --cache /private/tmp/skia-task1-frozen-toolchain-wvkkiS/npm-cache --userconfig /dev/null ci`

   Output:

   ```text
   added 14 packages, and audited 15 packages in 8s

   2 packages are looking for funding
     run `npm fund` for details

   found 0 vulnerabilities
   npm warn allow-scripts 4 packages have install scripts not yet covered by allowScripts:
   npm warn allow-scripts   tree-sitter@0.21.1 (install: node-gyp-build)
   npm warn allow-scripts   tree-sitter-javascript@0.23.1 (install: node-gyp-build)
   npm warn allow-scripts   tree-sitter-python@0.21.0 (install: node-gyp-build)
   npm warn allow-scripts   tree-sitter-typescript@0.23.2 (install: node-gyp-build)
   npm warn allow-scripts
   npm warn allow-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
   ```

7. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js --cache /private/tmp/skia-task1-frozen-toolchain-wvkkiS/npm-cache --userconfig /dev/null run typecheck`

   Output:

   ```text
   > skia@0.0.0 typecheck
   > tsc --noEmit -p tsconfig.json
   ```

8. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js --cache /private/tmp/skia-task1-frozen-toolchain-wvkkiS/npm-cache --userconfig /dev/null run build`

   Output:

   ```text
   > skia@0.0.0 build
   > tsc -p tsconfig.json
   ```

9. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js --cache /private/tmp/skia-task1-frozen-toolchain-wvkkiS/npm-cache --userconfig /dev/null test`

   Output:

   ```text
   > skia@0.0.0 test
   > node --test dist/tests/bootstrap.test.js

   ✔ bootstrap shell exposes the frozen command surfaces without side effects (2.816542ms)
   ✔ runCli returns an unimplemented shell result and copies argv (0.283125ms)
   ℹ tests 2
   ℹ suites 0
   ℹ pass 2
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ todo 0
   ℹ duration_ms 115.583709
   ```

10. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js --cache /private/tmp/skia-task1-frozen-toolchain-wvkkiS/npm-cache --userconfig /dev/null run test:golden`

    Output:

    ```text
    > skia@0.0.0 test:golden
    > node --test dist/tests/golden/bootstrap.test.js

    ✔ golden harness boots against the package shell only (0.65325ms)
    ℹ tests 1
    ℹ suites 0
    ℹ pass 1
    ℹ fail 0
    ℹ cancelled 0
    ℹ skipped 0
    ℹ todo 0
    ℹ duration_ms 115.635167
    ```

11. `'/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js --cache /private/tmp/skia-task1-frozen-toolchain-wvkkiS/npm-cache --userconfig /dev/null run test:security`

    Output:

    ```text
    > skia@0.0.0 test:security
    > node --test dist/tests/security/bootstrap.test.js

    ✔ security harness boots without executing repository behavior (2.82475ms)
    ℹ tests 1
    ℹ suites 0
    ℹ pass 1
    ℹ fail 0
    ℹ cancelled 0
    ℹ skipped 0
    ℹ todo 0
    ℹ duration_ms 115.665875
    ```

12. `python3 scripts/check_docs.py`

    Output:

    ```text
    Checked 18 Markdown files, 5 issue-form YAML files, 7 JSON fences, and 24 external URLs.
    Documentation checks passed.
    ```

13. `git diff --check`

    Output:

    ```text
    <no output>
    ```

Fix-round concerns:

- The reviewer’s frozen-toolchain evidence finding is resolved by the commands
  above: package verification ran under Node `v24.14.0`, npm `11.18.0`, and
  local TypeScript `7.0.2`.
- `npm ci` emitted `allow-scripts` warnings for Tree-sitter packages but still
  exited successfully; no target-repository code was executed as part of this
  fix round.

## Final report state

- Final status: `DONE_WITH_CONCERNS`.
- Sole current concern: the frozen-toolchain `npm ci` run emitted
  `allow-scripts` warnings for Tree-sitter packages.
- Historical note only: the original Node 23 / npm 10 / ambient `tsc` 5.5.4
  mismatch is preserved above as the pre-fix baseline and was resolved by Fix
  round 1.
