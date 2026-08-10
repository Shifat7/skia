# Skia Phase 1 Task List

## Contract and environment gate

- [x] Task 0: Freeze Node.js/TypeScript package, parser, schema, ID, OD-4,
      OD-10, and OD-11 decisions.
  - Verify: `node --version`, `npm --version`, `npx tsc --version`, docs check,
    and `git diff --check`.
  - Commit: `b27886f`; task review: spec PASS, quality APPROVED.

## Foundation slices

- [x] Task 1: Bootstrap the TypeScript package and `node:test` harness.
  - Depends on: Task 0.
  - Verify: `npm ci`, typecheck, build, tests.
  - Commits: `e21aec4`, `3c9ec1a`, `5078d9c`; task review: spec PASS after
    fix rounds, scoped re-review CLEAN.

- [x] Task 2: Define language-neutral schema and domain envelopes.
  - Depends on: Task 1.
  - Verify: schema/domain tests and typecheck.
  - Commits: `9f00ddc`, `067e95e`, `5dc0591`; task review: spec PASS after
    fix rounds, scoped re-review CLEAN.

- [ ] Task 3: Implement path, run-ID, and atomic storage safety.
  - Depends on: Tasks 1–2 and OD-10/OD-11.
  - Verify: path, storage, and lifecycle tests.

- [ ] Task 4: Implement the OD-4-selected hardened Git snapshot seam.
  - Depends on: Tasks 2–3 and OD-4.
  - Verify: Git snapshot, race, no-write, and security tests.

- [ ] Task 5: Add the TypeScript/TSX/Python language registry and parser
      coverage foundation.
  - Depends on: Tasks 2 and 4.
  - Verify: parser, syntax-error, encoding, and coverage fixtures.

- [ ] Task 6: Run the full Phase 1 integration checkpoint.
  - Depends on: Tasks 1–5.
  - Verify: typecheck, build, all tests, documentation checks, and diff check.

## Checkpoints

- [ ] Checkpoint A: Contract and bootstrap verified.
- [ ] Checkpoint B: Shared schema/path/storage/Git foundations verified.
- [ ] Checkpoint C: TypeScript/TSX/Python parser foundation and Phase 1 exit
      criteria verified.
