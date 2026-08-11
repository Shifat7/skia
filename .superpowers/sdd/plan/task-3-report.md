# Task 3 Report

Date: 2026-08-10

Status: DONE

Base commit hash: `e56382d`

Implementation commit hash: `61479a2`

Implementation commit message: `feat: implement task 3 path and storage safety`

Changed files:

- `.superpowers/sdd/plan/task-3-report.md`
- `src/limits.ts`
- `src/paths.ts`
- `src/storage.ts`
- `tests/path-safety.test.ts`
- `tests/storage-lifecycle.test.ts`
- `types/node-shim.d.ts`

Scope summary:

- Added byte-preserving internal path handling with deterministic escaped
  display output for control characters plus strict safe-relative-path, run-ID,
  session-ID, and artifact-path validation/derivation helpers.
- Added local storage foundations for Task 3: protected `.skia` roots,
  deterministic OD-10 run allocation, incomplete run metadata before artifact
  writes, create-new artifact writes, coverage/hash validation before manifest
  completion, staged-receipt persistence, metadata-only list/inspect, and
  exact-ID deletion with partial-failure reporting.
- Added focused path/storage lifecycle tests for positive and negative cases,
  including collision suffixes, `-99` exhaustion, symlink-root rejection,
  nested-link rejection, hash/schema gating, metadata-only inspection, and
  partial deletion failure reporting.
- Kept Task 3 within TypeScript/Node boundaries only. No parser, Git snapshot,
  language registry, or target-repository execution work was added.

Focused diff self-review:

- Correctness: checked deterministic run ID allocation, flat artifact naming,
  staged receipt path derivation, and manifest/coverage validation against the
  frozen Task 2 schemas before completion.
- Safety: guarded `.skia` and output roots against symlinks, rejected
  traversal/absolute/control-character paths, prevented nested symlink
  following on artifact writes, and kept deletion link-safe with explicit
  remaining-path reporting on failure.
- Durability/retention: recorded the OD-11 no-auto-retention and documented
  fsync/platform-durability caveats in the internal incomplete-run metadata and
  storage constants used by the new lifecycle layer.
- Scope: limited changes to the new Task 3 path/storage modules, the required
  test coverage, and the minimal Node shim expansion needed for the filesystem
  and hashing APIs used by those tests.

Exact commands and output summaries:

1. `npm test -- --test-name-pattern='path|storage|run'`

   Summary:

   - exit 0
   - 24 tests passed, 0 failed
   - included the new `path-safety` and `storage-lifecycle` coverage alongside
     the existing bootstrap/schema/security tests that also match the pattern

2. `node --test dist/tests/path-safety.test.js dist/tests/storage-lifecycle.test.js`

   Summary:

   - exit 0
   - 9 focused Task 3 tests passed, 0 failed

3. `npm run typecheck`

   Summary:

   - exit 0
   - `tsc --noEmit -p tsconfig.json` completed without diagnostics

4. `npm run build`

   Summary:

   - exit 0
   - `tsc -p tsconfig.json` completed without diagnostics

5. `npm test`

   Summary:

   - exit 0
   - 24 tests passed, 0 failed

6. `git diff --check`

   Summary:

   - exit 0
   - no whitespace or patch-format errors reported

Concerns:

- None blocking for Task 3. The new incomplete-run metadata file is an
  internal storage detail for the Phase 1 lifecycle layer and is not yet wired
  to the future CLI surfaces, which remains in-scope for later tasks only.

## Fix round 1

Date: 2026-08-10

Reviewer implementation commit hash: `d9ab1bc`

Reviewer implementation commit message:
`fix: address task 3 storage review findings`

Fix-round changed files:

- `src/storage.ts`
- `tests/storage-lifecycle.test.ts`

Findings addressed:

1. `listRuns()` and `inspectRun()` no longer create `.skia/`, `.skia/dist/`,
   or `.skia/receipts/` on fresh repositories. They now discover existing
   roots read-only, return an empty list when no local storage exists, and
   keep fresh repositories unchanged.
2. `completeRepositoryRun()` now preflights every complete artifact path before
   any content read or manifest write. It rejects symlinked artifact targets,
   missing files, non-regular files, and parent-path symlink traversal before
   hashing or coverage validation.
3. Partial allocation is now surfaced safely. Readers tolerate a run directory
   that exists without `run-metadata.json`, report it as an incomplete
   repository run in `listRuns()`, and return metadata `null` in
   `inspectRun()` instead of throwing.
4. Permission tests now assert owner-only modes where supported for `.skia`,
   `.skia/dist`, `.skia/receipts`, the run directory, run metadata, a
   repository artifact, and a staged receipt file.

Fix-round verification:

1. `npm run build`

   Summary:

   - exit 0
   - `tsc -p tsconfig.json` completed without diagnostics

2. `npm test -- --test-name-pattern='path|storage|run'`

   Summary:

   - exit 0
   - 27 tests passed, 0 failed
   - includes the new read-only lifecycle, partial-allocation, symlink
     completion, and owner-permissions assertions

3. `npm run typecheck`

   Summary:

   - exit 0
   - `tsc --noEmit -p tsconfig.json` completed without diagnostics

4. `git diff --check`

   Summary:

   - exit 0
   - no whitespace or patch-format errors reported

Remaining concerns:

- None for this fix round.

## Fix round 2

Date: 2026-08-10

Reviewer implementation commit hash: `f5d1083`

Reviewer implementation commit message:
`fix: reject symlinked .skia roots in inspectRun`

Fix-round changed files:

- `src/storage.ts`
- `tests/storage-lifecycle.test.ts`

Finding addressed:

1. `inspectRun()` no longer bypasses `.skia` root validation for explicit
   repository-run lookups. Repository-run inspection now discovers an existing
   validated `.skia/dist` root via the same non-creating read path used by
   `listRuns()`, so a symlinked `.skia` root is rejected before any external
   run metadata or manifest content can be read.

Fix-round verification:

1. `npm run build`

   Summary:

   - exit 0
   - `tsc -p tsconfig.json` completed without diagnostics

2. `node --test dist/tests/path-safety.test.js dist/tests/storage-lifecycle.test.js`

   Summary:

   - exit 0
   - 13 focused path/storage tests passed, 0 failed
   - includes the new symlinked `.skia` root regression case for `inspectRun()`

3. `npm run typecheck`

   Summary:

   - exit 0
   - `tsc --noEmit -p tsconfig.json` completed without diagnostics

4. `git diff --check`

   Summary:

   - exit 0
   - no whitespace or patch-format errors reported

Remaining concerns:

- None for this fix round.

## Fix round 3

Date: 2026-08-11

Reviewer implementation commit hash: `ebe0e5b`

Reviewer implementation commit message:
`fix: harden storage exact-id receipt handling`

Fix-round changed files:

- `src/storage.ts`
- `tests/storage-lifecycle.test.ts`

Findings addressed:

1. `writeStagedReceipt()` now enforces a single staged-receipt invariant per
   exact `run_id`. Before any write, it discovers the existing
   `.skia/receipts/` root read-only and rejects a second legal receipt whose
   filename would share the same `run_id` with a different session ID. This
   keeps OD-11's exact-ID inspect/delete contract manageable because a valid
   `run_id` can no longer accumulate multiple legal receipt files.
2. `inspectRun()` and `deleteRun()` now share explicit single-receipt
   resolution for staged receipts. If an older repository already contains
   multiple matching receipt files for one `run_id`, the commands fail closed
   with an ambiguity error instead of silently treating the run as missing.
3. `deleteRun()` is now metadata-only for misses. Missing-ID lookups reuse the
   existing read-only root discovery path and no longer create `.skia/`,
   `.skia/dist/`, or `.skia/receipts/` on a fresh repository or while probing
   a missing run beneath an existing partial storage tree.
4. Storage lifecycle regression coverage now proves both fixes: duplicate
   staged-receipt writes are rejected before they can create an undeletable or
   uninspectable state, and failed `deleteRun()` lookups leave the repository
   byte-for-byte unchanged in fresh, dist-only, and receipts-only cases.

Fix-round verification:

Frozen toolchain used:

- Node: `/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`
  → `v24.14.0`
- npm CLI: `/private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js`
  → `11.18.0`

1. `/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js run build`

   Summary:

   - exit 0
   - `tsc -p tsconfig.json` completed without diagnostics

2. `/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js run typecheck`

   Summary:

   - exit 0
   - `tsc --noEmit -p tsconfig.json` completed without diagnostics

3. `/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test dist/tests/storage-lifecycle.test.js`

   Summary:

   - exit 0
   - 12 storage lifecycle tests passed, 0 failed
   - includes the new duplicate-receipt exact-ID regression and the
     read-only missing-delete regression coverage

4. `git diff --check`

   Summary:

   - exit 0
   - no whitespace or patch-format errors reported

Remaining concerns:

- None for this fix round.

## Final broad-review storage fix round 2

Date: 2026-08-11

Reviewer implementation commit hash: `e4c5cdd`

Reviewer implementation commit message:
`fix: finalize storage broad-review round 2`

Fix-round changed files:

- `.superpowers/sdd/plan/task-3-report.md`
- `src/limits.ts`
- `src/storage.ts`
- `tests/storage-lifecycle.test.ts`

Findings addressed:

1. `writeStagedReceipt()` no longer relies on a check-then-create uniqueness
   probe. Repository runs and staged receipts now claim one shared exact
   `run_id` namespace through an atomic create-new marker beneath
   `.skia/run-ids/`, so an interleaved second writer fails before it can leave
   multiple valid receipts for one `run_id`.
2. `allocateRepositoryRun()` now uses the same shared `run_id` claim space.
   Existing receipts occupy the unsuffixed ID and deterministically force the
   next legal OD-10 suffix, while staged receipts reject a `run_id` that is
   already reserved by a repository run or another receipt.
3. `inspectRun()` and `deleteRun()` now fail closed when older storage already
   contains both a repository bundle and a staged receipt for the same exact
   `run_id`. They no longer prefer `.skia/dist/` and silently leave a receipt
   behind in that ambiguous legacy state.
4. Storage lifecycle regressions now cover both broad-review findings: an
   injected interleaving hook proves receipt uniqueness stays atomic under
   re-entrant writers, and cross-mode collisions are rejected under the shared
   namespace while legacy repo+receipt collisions remain exact-ID ambiguous and
   therefore fail closed.

Fix-round verification:

Frozen toolchain used:

- Node: `/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`
- npm CLI: `/private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js`

1. `/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test dist/tests/storage-lifecycle.test.js`

   Summary:

   - exit 0
   - 14 storage lifecycle tests passed, 0 failed
   - includes the new interleaved staged-receipt claim regression and the
     shared-namespace legacy-collision regression coverage

2. `/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js run typecheck`

   Summary:

   - exit 0
   - `tsc --noEmit -p tsconfig.json` completed without diagnostics

3. `/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js run build`

   Summary:

   - exit 0
   - `tsc -p tsconfig.json` completed without diagnostics

4. `git diff --check`

   Summary:

   - exit 0
   - no whitespace or patch-format errors reported

Remaining concerns:

- None for this fix round.

## Final storage fix round 3

Date: 2026-08-11

Reviewer implementation commit hash: `4322488`

Reviewer implementation commit message:
`fix: retry exact-id deletion after claim cleanup`

Fix-round changed files:

- `src/storage.ts`
- `tests/storage-lifecycle.test.ts`

Findings addressed:

1. Exact-ID target discovery for `deleteRun()` now includes the matching
   `.skia/run-ids/<run-id>.json` claim marker read-only. When a prior delete
   already removed the repository bundle or staged receipt but could not unlink
   the claim file, the same exact `run_id` remains discoverable for retry.
2. `deleteRun()` now treats a surviving claim file as an exact cleanup target
   instead of reporting the run as missing. This preserves OD-11's exact-ID
   deletion contract without broadening deletion scope, traversing directories,
   or following symlinks.
3. Storage lifecycle regression coverage now injects a real claim-removal
   failure by making `.skia/run-ids/` temporarily non-writable, asserts the
   reported remaining path is exactly `run-ids/<run-id>.json`, restores
   permissions, and proves that retrying `deleteRun(runId)` succeeds against
   that exact leftover target.

Fix-round verification:

Frozen toolchain used:

- Node: `/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`
- npm CLI: `/private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js`

1. `/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js run build`

   Summary:

   - exit 0
   - `tsc -p tsconfig.json` completed without diagnostics

2. `/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test dist/tests/storage-lifecycle.test.js`

   Summary:

   - exit 0
   - 15 storage lifecycle tests passed, 0 failed
   - includes the new claim-file partial-delete retry regression alongside the
     prior namespace, read-only, and partial-failure coverage

3. `/Users/shifatr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node /private/tmp/skia-task1-frozen-toolchain-wvkkiS/node_modules/npm/bin/npm-cli.js run typecheck`

   Summary:

   - exit 0
   - `tsc --noEmit -p tsconfig.json` completed without diagnostics

4. `git diff --check`

   Summary:

   - exit 0
   - no whitespace or patch-format errors reported

Remaining concerns:

- None for this fix round.
