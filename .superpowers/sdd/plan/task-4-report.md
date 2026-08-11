# Task 4 Report

Date: 2026-08-11

Status: DONE

Base commit hash: `c635f5e`

Implementation commit hash: `37554db`

Implementation commit message: `feat: implement task 4 git snapshot seam`

Changed files:

- `fixtures/git/sample.py`
- `fixtures/git/sample.ts`
- `fixtures/git/sample.tsx`
- `src/git.ts`
- `src/limits.ts`
- `src/types.ts`
- `tests/git-snapshot.test.ts`
- `tests/git-test-helpers.ts`
- `tests/security/git-security.test.ts`
- `types/node-shim.d.ts`
- `.superpowers/sdd/plan/task-4-report.md`

Scope summary:

- Added the hardened Git process boundary in `src/git.ts` with structured
  child-process arguments, no shell, fixed allowlisted Git environment,
  cleared inherited redirect/config/SSH/proxy variables, bounded timeout and
  output handling, and escaped diagnostics.
- Implemented the OD-4 copied-index strategy for staged snapshots: live-index
  copy under `.skia/tmp`, `GIT_INDEX_FILE`-scoped staged reads, copied-index
  hashing, complete NUL-delimited staged status discovery before filtering,
  ordered raw path/mode/base-blob/staged-blob records, canonical binary
  full-index patch bytes, and at-most-three-attempt live-index revalidation
  ending in stable `index_changed`.
- Added explicit staged branch/unborn and detached states plus repository
  `no_head_commit` rejection, while keeping repository snapshots bound only to
  committed `HEAD` tree content and excluding working-tree/index changes.
- Extended shared Git capture/domain types and Node shims only as needed for
  the hardened seam and focused tests; no parser registry, repository scanning,
  or Task 3 behavior changes were introduced.
- Added focused Git fixtures plus snapshot/security tests covering status
  discovery, control-character paths, rename/delete/type-change/binary/
  symlink handling, concurrent index mutation retry/index-changed behavior,
  fixed env clearing, timeout/output bounds, no-write snapshots, no lazy
  fetch, and no optional locks.

Focused diff self-review:

- Correctness: checked that staged snapshot acceptance is tied to one copied
  index generation, that retries restart the full capture instead of mixing
  partial state, and that repository mode reads committed tree state only.
- Safety: verified the Git boundary keeps shell disabled, neutralizes
  inherited Git/network redirection, disables external diff and text
  conversion, and writes only the protected copied index beneath `.skia/tmp`.
- Snapshot identity: confirmed the staged capture exposes complete status
  discovery plus ordered raw records and canonical patch bytes, while supported
  entries remain limited to regular-file `.ts`, `.tsx`, and `.py` staged
  adds/modifications.
- Scope: kept all work within the Task 4 seam, shared Git capture types, and
  focused fixtures/tests; no language parser, repository scanner, CLI
  workflow, or unrelated documentation changes were added.

Exact commands and output summaries:

1. `node --test dist/tests/git-snapshot.test.js dist/tests/security/git-security.test.js`

   Summary:

   - exit 0
   - 13 focused Task 4 tests passed, 0 failed
   - covers the hardened staged/repository snapshot seam plus the new security
     process-boundary checks

2. `npm test -- --test-name-pattern='git|snapshot|egress'`

   Summary:

   - exit 0
   - 41 built tests passed, 0 failed
   - includes the full built suite that matched the runner invocation,
     including all Task 4 Git snapshot/security coverage

3. `npm run typecheck`

   Summary:

   - exit 0
   - `tsc --noEmit -p tsconfig.json` completed without diagnostics

4. `npm run build`

   Summary:

   - exit 0
   - `tsc -p tsconfig.json` completed without diagnostics

5. `git diff --check`

   Summary:

   - exit 0
   - no whitespace or patch-format errors reported

Concerns:

- `tasks/spec.md` was referenced in the task request but is absent in this
  checkout. I implemented Task 4 against the available authoritative files:
  the Task 4 brief, `tasks/plan.md`, `docs/OPEN_DECISIONS.md`, the relevant
  snapshot sections of `docs/IMPLEMENTATION_SPEC.md`, `ARCHITECTURE.md`, and
  the existing shared TypeScript modules.
- No blocking correctness concerns remain for Task 4. The new Git seam is not
  yet wired into the future CLI/storage flows, which remains expected scope
  for later tasks only.

## Fix round 1

Date: 2026-08-11

Reviewer implementation commit hash: `18c558a`

Reviewer implementation commit message:
`fix: harden task 4 snapshot identity binding`

Fix-round changed files:

- `src/git.ts`
- `tests/git-snapshot.test.ts`

Findings addressed:

1. Repository snapshots now bind all committed-tree reads to the captured
   commit OID. `captureRepositorySnapshot()` resolves `HEAD` once, then uses
   that immutable OID for `ls-tree` and subsequent blob capture, so a moved ref
   cannot mix `identity.commit_oid` from commit 1 with entries from commit 2.
2. Staged snapshots now bind base-side comparisons to the captured base OID.
   When a staged base is present, the copied-index `diff-index` and patch reads
   use the resolved base commit directly instead of symbolic `HEAD`, closing
   the ref-move race between base capture and staged discovery.
3. Unsupported gitlinks no longer cause fatal blob reads. The staged seam still
   captures the full status/raw discovery set, but blob capture is now limited
   to supported regular-file staged records only. Unsupported mode `160000`
   remains visible in the raw/status records, while malformed supported blob
   identities still fail explicitly instead of being downgraded to unsupported.

Fix-round verification:

1. `npm test -- --test-name-pattern='git|snapshot|egress'`

   Summary:

   - exit 0
   - 44 built tests passed, 0 failed
   - includes the three new regression cases for repository/staged base
     immutability and unsupported gitlink handling

2. `npm run typecheck`

   Summary:

   - exit 0
   - `tsc --noEmit -p tsconfig.json` completed without diagnostics

3. `npm run build`

   Summary:

   - exit 0
   - `tsc -p tsconfig.json` completed without diagnostics

4. `git diff --check`

   Summary:

   - exit 0
   - no whitespace or patch-format errors reported

Remaining concerns:

- None for this fix round. The three Important findings now have deterministic
  regression coverage in temporary repositories and wrappers.

## Final broad-review fix round

Date: 2026-08-11

Reviewer implementation commit hash: `ff254ab`

Reviewer implementation commit message:
`fix: reject corrupt staged branch refs`

Fix-round changed files:

- `src/git.ts`
- `tests/git-snapshot.test.ts`

Finding addressed:

1. Staged snapshot capture now distinguishes a truly unborn branch from an
   existing-but-invalid current branch ref. `parseStagedHeadState()` still
   accepts symbolic-HEAD repos whose current branch ref does not exist at all
   as `base_state: unborn`, but it now checks whether the symbolic branch ref
   exists as a loose ref or packed ref before falling back. If the current
   branch ref exists and `HEAD^{commit}` cannot resolve to a valid commit,
   capture fails closed with `GitSnapshotError("git_process_failed", ...)`
   instead of producing an empty-base staged snapshot.

Fix-round verification:

1. `node --test dist/tests/git-snapshot.test.js dist/tests/security/git-security.test.js`

   Summary:

   - exit 0
   - 19 focused Git snapshot/security tests passed, 0 failed
   - includes the new corrupt-branch-ref regression while preserving true
     unborn, detached, captured-OID, and hardened-boundary coverage

2. `npm run typecheck`

   Summary:

   - exit 0
   - `tsc --noEmit -p tsconfig.json` completed without diagnostics

3. `npm run build`

   Summary:

   - exit 0
   - `tsc -p tsconfig.json` completed without diagnostics

4. `git diff --check`

   Summary:

   - exit 0
   - no whitespace or patch-format errors reported

Remaining concerns:

- None for this fix round. Corrupt current-branch refs now fail closed instead
  of being misclassified as unborn, and the regression is covered in the
  focused temporary-repository suite.

## Final broad-review fix round 2

Date: 2026-08-11

Reviewer implementation commit hash:
recorded in the Git commit created for this fix round (self-referential within
this same commit; reported in the final task handoff)

Reviewer implementation commit message:
`fix: resolve linked worktree branch refs through git`

Fix-round changed files:

- `src/git.ts`
- `tests/git-snapshot.test.ts`

Finding addressed:

1. Linked-worktree staged snapshots now ask Git's own ref backend whether the
   symbolic current-branch ref exists instead of manually searching only the
   per-worktree `--git-dir`. `branchRefExists()` now uses
   `git for-each-ref --format=%(refname) -- <refname>`, which sees refs stored
   in the common Git dir and packed refs through the same resolution path Git
   uses elsewhere. That keeps a genuinely missing current branch ref classified
   as unborn, but makes an existing invalid linked-worktree branch ref fail
   closed with the stable `git_process_failed` reason instead of silently
   falling back to the empty-tree base.
2. Added a linked-worktree regression that corrupts the common-dir branch ref
   backing the current worktree and proves staged capture now rejects it. The
   existing plain corrupt-ref, true unborn, detached, and captured-base-OID
   regression coverage remains green.

Fix-round verification:

1. Focused frozen Git slice:

   - compiled the Git source plus `tests/git-snapshot.test.ts`,
     `tests/git-test-helpers.ts`, and `tests/security/git-security.test.ts`
     into a repo-local temporary output tree with `npx tsc --ignoreConfig ...`
   - ran `node --test` against the compiled Git snapshot and security tests
   - exit 0
   - 20 focused Git tests passed, 0 failed
   - includes the new linked-worktree corrupt-common-ref regression plus the
     existing corrupt-ref, unborn, detached, captured-base-OID, and hardened
     boundary coverage

2. `npm run typecheck`

   Summary:

   - exit 0
   - `tsc --noEmit -p tsconfig.json` completed without diagnostics

3. `npm run build`

   Summary:

   - exit 0
   - `tsc -p tsconfig.json` completed without diagnostics

4. `git diff --check`

   Summary:

   - exit 0
   - no whitespace or patch-format errors reported

Remaining concerns:

- None for this fix round. Linked-worktree branch ref validation now follows
  Git's authoritative ref view instead of per-worktree filesystem heuristics.

## Final Task 4 Git fix round after broad review

Date: 2026-08-11

Reviewer implementation commit hash: `1c14f78`

Reviewer implementation commit message:
`fix: harden git snapshot head validation`

Fix-round changed files:

- `src/git.ts`
- `tests/git-snapshot.test.ts`

Findings addressed:

1. Staged snapshot capture now binds one accepted base state/OID to one
   copied-index generation. `captureStagedAttempt()` resolves the staged base
   before copying the live index, runs all base-side reads from that captured
   OID, and re-parses the staged base at final acceptance alongside the live
   index hash. If either the live index bytes or the base state/OID changed,
   the candidate is discarded and the full capture is retried, so a branch move
   after copied-index creation can no longer accept a mixed snapshot.
2. Repository snapshot capture now distinguishes a truly missing branch tip
   from a corrupt or dangling current branch ref. `parseRepositoryHeadState()`
   mirrors staged-mode handling by checking whether the symbolic current-branch
   ref still exists when `HEAD^{commit}` fails; absent refs keep the stable
   `no_head_commit` result, while existing invalid refs now fail closed with
   `git_process_failed`.
3. Added deterministic regressions for both paths. The staged suite now moves
   `refs/heads/main` immediately after copied-index creation and proves capture
   retries to the stable new base instead of accepting a mixed candidate, while
   repository mode now has a focused corrupt-branch-ref regression that keeps
   true no-HEAD behavior intact.

Fix-round verification:

1. `npm run build`

   Summary:

   - exit 0
   - `tsc -p tsconfig.json` completed without diagnostics

2. `node --test dist/tests/git-snapshot.test.js dist/tests/security/git-security.test.js`

   Summary:

   - exit 0
   - 22 focused Git snapshot/security tests passed, 0 failed
   - includes the new copied-index/base-ref retry regression and the new
     repository corrupt-ref classification regression

3. `npm run typecheck`

   Summary:

   - exit 0
   - `tsc --noEmit -p tsconfig.json` completed without diagnostics

4. `git diff --check`

   Summary:

   - exit 0
   - no whitespace or patch-format errors reported before the report-only
     update commit

Remaining concerns:

- None for this fix round. Accepted staged snapshots now revalidate both the
  copied index and the captured base state/OID, and repository snapshots no
  longer downgrade corrupt branch refs into the stable no-HEAD path.
