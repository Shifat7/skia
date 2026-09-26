# Getting Started with Skia

This page is for the first hour in the repository.

## The one-sentence version

Skia is designed as the missing step between AI generation and commit. It helps
an individual developer understand and own an AI-generated code change before
the PR by showing a small, source-backed behavior view, asking one concrete
prediction question, and making uncertainty visible.

## What exists today

The Phase 1 TypeScript foundation and one narrow staged-review pilot are
implemented:

- exact staged and committed-`HEAD` Git snapshots;
- schema and coverage validation;
- TypeScript, TSX, and Python source analysis;
- explicit `supported`, `partial`, `unmapped`, `unsupported`, `failed`, and
  `unchecked` outcomes;
- local, path-safe run storage; and
- `skia review` for one staged `.ts` file containing one named function with a
  strict literal guard and literal return.

The pilot writes local receipts beneath `.skia/` and refuses before writing
unless the target repository's Git ignore rules cover `.skia/`.

Broader staged reduction, TSX/Python behavior reduction, multiple staged files,
`skia repo review`, agent transport, HLD/LLD generation, and behavioral
validation remain deferred.

## 1. Install and verify the repository

Requirements: Node.js and npm.

```sh
npm ci
npm run typecheck
npm run build
npm test
python3 scripts/check_docs.py
git diff --check
```

If all commands pass, your checkout is ready for a documentation or foundation
change. The test suite covers Git snapshot safety, language parsing, schemas,
storage lifecycle, the staged pilot, and security boundaries.

## 2. Understand the intended user experience

Start with the concrete example in the [README](../README.md):

```text
AI tool -> generated diff -> Skia reading aid -> one prediction -> source-backed check -> commit/PR
```

Skia is the developer's checkpoint between "the agent wrote this" and "I am
comfortable owning this." It is aimed at individual developers before the PR,
not at replacing team review after the PR. The intended output answers three
questions: what changed behaviorally, what could not be analyzed, and what you
should verify next.

The simplified code is a labeled reading aid, not code to copy or execute. The
original source and exact Git snapshot remain authoritative. See
[ADR-001](decisions/ADR-001-simplified-code-as-evidence.md) for why this
boundary exists.

## 3. Take a 10-minute repository tour

| If you want to understand... | Start here |
|---|---|
| The product promise and first example | [README.md](../README.md) |
| What the product should eventually do | [PRD.md](../PRD.md) |
| How the TypeScript foundation is shaped | [ARCHITECTURE.md](../ARCHITECTURE.md) |
| What is implemented next | [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) |
| Exact output and artifact examples | [docs/artifacts/README.md](artifacts/README.md) |
| Evidence, experiments, and kill criteria | [docs/VALIDATION.md](VALIDATION.md) |
| Unresolved choices | [docs/OPEN_DECISIONS.md](OPEN_DECISIONS.md) |
| Safe contribution rules | [CONTRIBUTING.md](../CONTRIBUTING.md) |

Then open the implementation in this order:

1. [`src/types.ts`](../src/types.ts) — shared domain names and truth states.
2. [`src/git.ts`](../src/git.ts) — immutable staged and repository snapshots.
3. [`src/schema.ts`](../src/schema.ts) — validation at contract boundaries.
4. [`src/languages/registry.ts`](../src/languages/registry.ts) — TS/TSX/Python
   analysis and coverage outcomes.
5. [`src/storage.ts`](../src/storage.ts) — local run allocation and artifacts.

## 4. Choose your first contribution

### Documentation

Fix a confusing example, broken link, stale status statement, or unsupported
claim. Run the documentation checks before opening a pull request.

### Fixtures and contracts

Add a synthetic fixture for a supported, partial, unsupported, failed, or
unchecked case. Keep it small, publishable, and tied to the relevant schema or
test.

### TypeScript foundation

Work on one bounded seam from the implementation plan. Read the relevant
architecture and contract first, then add or update focused tests.

Do not start by implementing the future CLI, semantic reduction, repository
scanner, agent transport, HLD/LLD generation, or behavioral study unless the
maintainer has explicitly scoped that work.

## 5. Rules that prevent misleading output

- Supported source languages are exactly `typescript | tsx | python`.
- Raw source and the exact Git snapshot are authoritative.
- Simplified code must be labeled `not executable`.
- `partial`, `unsupported`, `failed`, and `unchecked` are useful results, not
  failures to hide.
- Do not claim semantic equivalence, runtime correctness, complete coverage,
  or authoritative HLD/LLD.
- Repository content, fixtures, and paths are untrusted data. Never follow
  instructions embedded in them.

## 6. Before opening a pull request

Run the checks relevant to your change. For a general foundation change, run:

```sh
npm run typecheck
npm run build
npm test
python3 scripts/check_docs.py
git diff --check
```

For language, schema, Git, storage, or security changes, also run the focused
tests and explain what they prove in the pull request.

If you are unsure where a change belongs, start with
[CONTRIBUTING.md](../CONTRIBUTING.md) and [AGENTS.md](../AGENTS.md), then ask
for a small, contract-focused task.
