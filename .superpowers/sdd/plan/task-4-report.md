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
