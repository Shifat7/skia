# Implementation Plan: Skia Phase 1 Foundations

This plan executes the reviewed specification in small, verifiable slices.
The implementation language is TypeScript running on Node.js. The supported
source-language set is explicitly:

```text
typescript | tsx | python
```

Phase 1 establishes language-neutral foundations plus parser loading and
coverage reporting for those three source dialects. Collapsed behavior
reduction, Behavior Cards, repository subsystem discovery, agent transport,
HLD/LLD generation, and behavioral validation remain deferred.

## Contract and environment gate

### Task 0: Freeze the TypeScript package and product contracts

**Acceptance criteria:**

- [ ] Pin the supported Node.js major, package manager, module format,
      TypeScript compiler, parser packages, schema validator, JSON Schema
      draft, and lockfile policy.
- [ ] Record the source-language matrix as `typescript`, `tsx`, and `python`.
- [ ] Define initial `.ts`, `.tsx`, and `.py` decoding, parser, syntax-error,
      and unsupported-mode behavior.
- [ ] Resolve OD-4, OD-10, and OD-11 before their implementation slices;
      leave Python-specific semantic reduction and cross-language resolution
      explicitly deferred.
- [ ] Keep the retained `Skia`/`skia` name and record publication/distribution
      risk as a release decision, not a Phase 1 rename task.

**Verification:**

```sh
node --version
npm --version
npx tsc --version
python3 scripts/check_docs.py
git diff --check
```

**Status:** contract work in progress; no package has been created yet.

### Task 1: Bootstrap the TypeScript package and test harness

**Acceptance criteria:**

- [ ] Add one package with `package.json`, `package-lock.json`, and strict
      `tsconfig.json`.
- [ ] Add a side-effect-free CLI entry point and built-in `node:test` harness.
- [ ] Add scripts for type checking, building, unit tests, golden tests, and
      security tests without executing target-repository code.
- [ ] Keep compiled output and package metadata separate from source fixtures.

**Verification:**

```sh
npm ci
npm run typecheck
npm run build
npm test
python3 scripts/check_docs.py
git diff --check
```

**Dependencies:** Task 0.

**Files likely touched:** `package.json`, `package-lock.json`, `tsconfig.json`,
`src/main.ts`, `test/bootstrap.test.ts`, and package documentation.

## Foundation slices

### Task 2: Define shared domain and schema envelopes

**Acceptance criteria:**

- [ ] Define language-neutral types for snapshot identity, source language,
      paths, blob IDs, anchors, parse results, coverage events, run/artifact
      states, and stable error reasons.
- [ ] Use discriminated source-language values `typescript`, `tsx`, and
      `python`; do not expose parser-specific node objects in artifacts.
- [ ] Add strict schemas and cross-field invariants for snapshot identity,
      coverage, artifact hashes, receipts, and manifests.

**Verification:**

```sh
npm run typecheck
npm test -- --test-name-pattern='schema|domain'
```

**Dependencies:** Task 1.

**Files likely touched:** `src/types.ts`, `src/schema.ts`, `schemas/`,
`fixtures/schema/`, `test/schema-contract.test.ts`.

### Task 3: Implement path, run-ID, and local-storage safety

**Acceptance criteria:**

- [ ] Preserve path bytes internally where required and escape control
      characters for display.
- [ ] Reject absolute/traversal paths, symlinked output roots, and link
      following outside `.skia/`.
- [ ] Allocate runs atomically with incomplete state before artifact writes.
- [ ] Enforce create-new writes, hash/schema validation before completion,
      owner-only permissions where supported, and documented durability.
- [ ] Implement list, metadata-only inspect, exact single-run deletion, and
      partial-deletion failure reporting beneath `.skia/`.

**Verification:**

```sh
npm test -- --test-name-pattern='path|storage|run'
npm run typecheck
git diff --check
```

**Dependencies:** Tasks 1–2; OD-10 and OD-11 for final identity and retention
rules.

**Files likely touched:** `src/paths.ts`, `src/limits.ts`, `src/storage.ts`,
`fixtures/paths/`, `fixtures/storage/`, `test/path-safety.test.ts`,
`test/storage-lifecycle.test.ts`.

### Task 4: Implement the hardened Git snapshot seam

**Acceptance criteria:**

- [ ] Use structured child-process arguments, the fixed Git environment,
      bounded timeout/output, escaped diagnostics, and no external diff or
      text conversion.
- [ ] Represent staged unborn, normal, detached, and repository no-`HEAD`
      states explicitly.
- [ ] Implement only the OD-4-selected snapshot strategy; enumerate complete
      NUL-delimited status before filtering and expose captured paths, modes,
      blob IDs, and canonical diff bytes through shared types.
- [ ] Prove no Git/index/object/ref/project writes and no lazy fetch or
      optional locks in temporary repositories.

**Verification:**

```sh
npm test -- --test-name-pattern='git|snapshot|egress'
npm run typecheck
git diff --check
```

**Dependencies:** Tasks 2–3 and OD-4.

**Files likely touched:** `src/git.ts`, `src/limits.ts`, `fixtures/git/`,
`test/git-snapshot.test.ts`, `test/git-security.test.ts`.

### Task 5: Add the TypeScript/TSX/Python language registry

**Acceptance criteria:**

- [ ] Register `.ts`, `.tsx`, and `.py` with explicit language/dialect IDs.
- [ ] Provide parser/grammar version disclosure, strict source decoding,
      syntax-tree results, syntax-error ranges, and parse coverage events.
- [ ] Keep Python parser support distinct from later Python behavior reduction;
      unsupported constructs remain explicit coverage rather than confident
      evidence.
- [ ] Add fixtures for TypeScript, TSX, Python, syntax errors, invalid
      encoding, oversized blobs, unsupported extensions, and unsupported modes.

**Verification:**

```sh
npm run typecheck
npm test -- --test-name-pattern='language|parser|coverage'
npm run build
```

**Dependencies:** Tasks 2 and 4; parser package/version decisions from Task 0.

**Files likely touched:** `src/languages/registry.ts`,
`src/languages/types.ts`, `src/languages/typescript.ts`,
`src/languages/python.ts`, `fixtures/languages/`,
`test/language-registry.test.ts`.

### Task 6: Foundation integration checkpoint

**Acceptance criteria:**

- [ ] Temporary Git repositories cover index mutation, partial-clone behavior,
      path bytes/control characters, detached/unborn/no-`HEAD` states, and
      all-status discovery.
- [ ] Storage fixtures cover collisions, symlinks, interruption, inspection,
      deletion, and no-write boundaries.
- [ ] Every partial, unsupported, failed, or unchecked input remains visible
      in the coverage artifact.
- [ ] No Phase 1 test executes package scripts or code from the target
      repository.

**Verification:**

```sh
npm run typecheck
npm run build
npm test
python3 scripts/check_docs.py
git diff --check
```

**Dependencies:** Tasks 1–5.

## Checkpoints

### Checkpoint A: Contract and bootstrap

- [ ] Task 0 decisions are recorded and verified.
- [ ] Task 1 package checks pass with fresh output.

### Checkpoint B: Shared foundations

- [ ] Tasks 2–4 have fresh typecheck, build, and test evidence.
- [ ] No schema, path, storage, or Git task writes outside `.skia/`.

### Checkpoint C: Phase 1 exit

- [ ] Task 5 parser/coverage fixtures pass for TypeScript, TSX, and Python.
- [ ] Task 6 full verification passes after the final code change.
- [ ] Foundation portions of AC-1, AC-2, AC-3, AC-6, AC-10, and AC-11 are
      evidenced without claiming the deferred product surfaces.

## Parallelization

After Task 1 and shared DTO decisions are verified, Tasks 3 and 5 may proceed
in parallel because their primary write scopes are disjoint. Task 4 remains
sequential with respect to OD-4 and shared snapshot types. The main session
owns integration and final verification; subagents must not edit overlapping
files.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Node/package toolchain drift | High | Pin runtime, compiler, parser packages, lockfile, and CI image in Task 0. |
| OD-4 remains ambiguous | High | Block Git implementation until one strategy and race contract are recorded. |
| Python parser support is mistaken for semantic coverage | High | Separate parse coverage from behavior reduction and keep unsupported constructs visible. |
| Schema/storage states drift | High | Contract fixtures and strict cross-field validation before consumers. |
| Symlink/path traversal | High | Reject output-root links, preserve bytes, and test hostile paths. |
| Cross-language edges imply unsupported semantics | Medium | Leave TypeScript-to-Python resolution explicit and unresolved in Phase 1. |
| Uncommitted work accumulates | Medium | Keep slices small; do not commit without explicit user direction. |

