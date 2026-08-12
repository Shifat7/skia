# Skia

> **AI wrote the code. Skia helps you understand it before you trust it.**

Skia is intended to be a local checkpoint between an AI-generated change and
your decision to keep it. Give it a staged Git change; get a short,
source-backed explanation of the behavior that matters, one concrete question
to answer, and an honest account of what was not covered.

## What Skia is for

```text
AI-generated change
        |
        v
Skia shows: “what behavior changed?”
        |
        v
You answer: “what should happen for this input?”
        |
        v
Skia shows source-backed evidence and coverage limits
        |
        v
You decide whether to trust it, inspect it, or ask for a change
```

Intended workflow — the experience in one small example:

```text
Change: active members receive a 10% discount

Skia asks: total=100, active member, promotion=10 — what should return?
You answer: 80
Skia shows: the matching source path, supporting evidence, and anything unmapped
```

**Current status:** The repository contains the implemented Phase 1 TypeScript
foundation for exact Git snapshots, schema validation, TypeScript/TSX/Python
analysis, coverage states, and local storage. The user-facing `skia review` and
`skia repo review` workflows below are intended product examples, not commands
you can run successfully today. Staged semantic reduction, repository
scanning, agent transport, HLD/LLD generation, and behavioral validation remain
deferred.

The project and command retain the `Skia`/`skia` name for now. Publication and
distribution risks from the existing Google Skia project remain an open release
decision; see [open decisions](docs/OPEN_DECISIONS.md).

## See it in examples

### Example 1: an AI change you do not want to blindly trust

Intended workflow — this is what the future staged review is meant to show.

The AI changes a pricing function:

```diff
 function calculateFinalPrice(total, member, promotion) {
-  return total;
+  if (member) total *= 0.9;
+  if (promotion > 0) total -= promotion;
+  return Math.max(0, Math.round(total));
 }
```

Instead of making you reread the whole diff, Skia is intended to produce a
small behavior check:

```text
$ skia review                         # intended workflow; not runnable yet

CHANGED BEHAVIOR
- active members receive a 10% discount
- a positive promotion is subtracted afterward
- the result is clamped at 0 and rounded

YOUR TURN
total=100, member=true, promotion=10
What should calculateFinalPrice(...) return?  > 80

SOURCE CHECK
src/pricing.ts:12-18  covered by the displayed evidence
```

You answer the question, then choose whether to trust the change, open the
original source, or investigate what Skia could not represent.

### Example 2: when Skia cannot make a claim

Implemented foundation — unsupported and failed inputs stay visible instead
of being presented as safe:

```text
src/view.tsx      partial     syntax error; inspect the highlighted range
docs/guide.md     unsupported unsupported_language; no semantic claim
scripts/job.py    failed      invalid_source_encoding; analysis stopped
src/config.ts     unchecked   not analyzed in this run
```

The useful result is not “everything looks fine.” It is knowing exactly which
files still require your attention.

### Example 3: a repository review with an honest remainder

Intended workflow — a future repository review would look like this:

```text
$ skia repo review                   # intended workflow; not runnable yet

SNAPSHOT  committed HEAD abc123
FOUND     84 TypeScript/TSX/Python files, 3 config files, 5 docs
SELECTED  authentication, billing, persistence
UNCHECKED generated code, deployment scripts, remaining subsystems

NEXT      answer one architecture question, then inspect the source behind it
```

---

## Two intended developer journeys

| | Intended staged journey | Intended repository journey |
|---|---|---|
| Command | `skia review` | `skia repo review` |
| Snapshot | Exact staged Git index | One committed `HEAD` |
| Default view | Collapsed changed behavior | Compact HLD, LLD, and architecture evidence |
| Human check | Predict one observable result | One architecture question plus selected subsystems |
| Source detail | `typescript | tsx | python` | `typescript | tsx | python` detail; manifests, config, and docs inform structure |
| Output | Local comprehension receipt | Timestamped local bundle under `.skia/dist/` |
| What stays visible | Unmapped changed lines | Unsupported languages and unchecked subsystems |

The product is built around one constraint:

> **A reduced view is useful only when it is shorter than the source and honest
> about what it could not represent.**

---

## Intended workflow: understand a staged change

The future staged flow is meant to feel like this:

```text
changed code -> exact staged snapshot -> short evidence -> developer prediction -> source check
```

Intended workflow only — the CLI transcript below is a product example, not
current executable behavior:

```text
$ skia review

calculateFinalPrice                  12 changed lines -> 4 evidence lines

  total <= 0       -> return 0
  active member    -> total * 0.90
  valid promotion  -> subtract promotion amount
  final result     -> clamp at 0, then round

BEHAVIOR CHECK
Given: total=100, member=active, promotion=10
When:  calculateFinalPrice(total, member, promotion)
Expected return: ___
> 80

Source check: source-derived match for this displayed path

[e] evidence details  [d] original staged diff  [n] next
```

### What the developer does next

The developer enters one prediction, checks whether the shown path matches the
staged source, then either moves on or opens the staged diff to inspect what
the reduced view did not cover.

### How this staged journey is meant to work

```text
Raw staged source
      |
      +-- deterministic syntax facts
      |
      +-- collapsed equivalence evidence       <- default reading surface
      |
      +-- system supplies GIVEN + WHEN
      |
      +-- developer supplies THEN
      |
      +-- prediction is saved
      |
      +-- narrow source check appears
```

The developer normally enters one value, not a five-field essay. `BECAUSE` is
requested only after a mismatch or an explicit causal/risk prompt. `IMPACT` is
reserved for a relevant high-risk path.

The original source and expanded evidence are behind one labelled menu action
and one terminal keystroke.

### Honest coverage when reduction is unsafe

Skia does not fill the gap with confident prose:

```text
WARNING: 7 changed TypeScript/TSX/Python lines are unmapped.

Not represented:
  - import change
  - deleted callback
  - compound stateful branch

[d] inspect unmapped diff  [s] skip  [q] stop
```

A realistic unsupported case should stay just as explicit:

```text
WARNING: docs/release-checklist.md is unsupported in staged mode.

Not represented:
  - Markdown checklist edits
  - release-note wording changes

[d] inspect staged diff  [s] skip  [q] stop
```

A completed prediction covers one supported path. It never turns unmapped or
unsupported code into reviewed coverage.

### Initial boundary

- `typescript | tsx | python` source files
- Named functions and methods only
- At most 3 supported changed entities
- At most 150 added-plus-deleted supported-language lines
- Manual command; no automatic Git hook

These are pilot limits, not risk or safety benchmarks.

---

## Intended workflow: understand a repository

The future repository flow is meant to start from one committed snapshot, show
the deterministic inventory first, require explicit consent before any
agent-assisted step, and leave the unselected remainder visible as `unchecked`.

Intended workflow only — the CLI transcript below is a product example, not
current executable behavior:

```text
$ skia repo review

Snapshot:     HEAD c8d1a18
Inventory:    84 typescript | tsx | python files, 3 config files, 5 docs
Unsupported:  2 Ruby files
Subsystems:   api, billing, persistence, notifications, web

Architecture check: included
Card cap: 3

Select up to 2 subsystems:
  [x] billing
  [x] persistence
  [ ] api
  [ ] notifications
  [ ] web
```

Before any HLD/LLD draft, the developer sees and accepts an explicit handoff:

```text
Agent consent required
Provider: local-model or approved remote provider
Will send: selected subsystem evidence only
Will keep local: manifest, coverage, raw snapshot identity

[y] continue  [n] stay local-only
```

Repository mode is intentionally layered:

```text
Committed repository snapshot
        |
        +-- deterministic scan facts
        |     paths, packages, entry points, imports, exports, direct calls
        |
        +-- explicit agent consent
        |
        +-- model_derived drafts
        |     HLD, LLD, subsystem labels, architecture relations
        |
        +-- architecture Behavior Card
        |
        +-- developer-selected subsystem cards
```

The architecture check is always included. When the repository has more
subsystems than one short session should cover, the developer chooses which
ones to check next and everything else remains `unchecked`; Skia does not
group, rank, or sample those areas silently.

Repository scanning plus HLD/LLD generation are still deferred product
surfaces. The current repository implements the snapshot, schema, analysis,
coverage, and storage contracts that those future steps will build on.

### What the developer does next

The developer selects one or two subsystems, decides whether to allow an
agent-assisted draft, then reads the generated cards alongside the recorded
`unchecked` remainder before widening coverage.

### Intended local output

One run ID is shared by the directory and every filename:

```text
.skia/dist/20260805T001500Z/
  repo-hld-20260805T001500Z.md
  repo-lld-20260805T001500Z.md
  repo-collapsed-evidence-20260805T001500Z.md
  repo-behavior-cards-20260805T001500Z.json
  repo-coverage-20260805T001500Z.json
  repo-manifest-20260805T001500Z.json
```

All artifacts are local and gitignored. The manifest binds them to the same
commit, run ID, scanner version, model/provider disclosure, claim provenance,
artifact hashes, selected/unchecked subsystems, and coverage.

HLD and LLD are review aids, not authoritative architecture documentation.

### Intended privacy boundary

Before any repository context leaves the machine, Skia must show:

- provider and model;
- proposed files and byte/token budget;
- sensitive-path exclusions;
- provider retention caveat;
- allowed provider endpoints; and
- local output location.

The developer must consent explicitly. Declining preserves deterministic scan
output and marks agent-generated HLD/LLD unavailable. A local-model adapter may
be used when source cannot leave the machine.

---

## The truth contract

| Label | What it means | What it does not mean |
|---|---|---|
| `deterministic` | Directly computed from the captured snapshot | Correct intent or runtime behavior |
| `model_derived` | Generated by the configured agent from bounded evidence | Verified, authoritative, or complete |
| `developer_supplied` | Entered by the developer before feedback | Proven understanding |
| `source_derived_match` | One prediction matches one supported source endpoint | Runtime verification or correctness |
| `not_checkable` | The safe checker cannot judge this path | Failure or success |
| `unchecked` | The subsystem was not selected | Reviewed coverage |

Across both modes:

- Raw source remains authoritative and available on demand.
- Predictions are recorded before feedback.
- Unsupported, excluded, failed, unmapped, and unchecked areas remain explicit.
- Comprehension runs do not modify source, Git state, hooks, or project config.
- Local artifacts may still be sensitive and require inspect/delete controls.

---

## How the implemented foundation supports both journeys

```text
Git snapshot -> shared identity/schema -> language analysis -> coverage -> local storage
```

- Git snapshot: the future review starts from an immutable staged index or
  committed `HEAD`, so every later claim can point back to one exact source
  capture.
- Shared identity/schema: the repository already validates snapshot identity,
  run metadata, and coverage shapes so staged and repository flows can speak
  one contract.
- Language analysis: the current parser layer accepts supported
  `typescript | tsx | python` inputs and distinguishes parsed, partial,
  failed, and unsupported outcomes instead of flattening them.
- Coverage: explicit `supported`, `partial`, `unmapped`, `unsupported`,
  `excluded`, `failed`, and `unchecked` states keep missing coverage visible
  instead of implying silent success.
- Local storage: run manifests, receipts, and artifacts are designed to stay
  local under `.skia/`, because even review metadata can be sensitive.

---

## Contributor navigation examples: implemented foundation

These are contributor navigation examples for the current TypeScript
foundation, not a supported public package API. The imports below point at the
real internal modules that the future CLI will build on:
[src/schema.ts](src/schema.ts), [src/git.ts](src/git.ts),
[src/storage.ts](src/storage.ts), [src/paths.ts](src/paths.ts), and
[src/languages/registry.ts](src/languages/registry.ts).

Implemented foundation — schema validation keeps the truth contract explicit:

```ts
import { validateCoverageEnvelope } from "./src/schema.js";

const validation = validateCoverageEnvelope({
  summary: {
    total_units: 4,
    supported_units: 1,
    partial_units: 1,
    unmapped_units: 0,
    unsupported_units: 1,
    excluded_units: 0,
    failed_units: 1,
    unchecked_units: 0,
  },
  events: [
    { id: "evt_ts", coverage: "supported", units: 1, reason: null, path: "src/app.ts", language: "typescript", anchors: [] },
    { id: "evt_tsx", coverage: "partial", units: 1, reason: "syntax_error", path: "src/view.tsx", language: "tsx", anchors: [] },
    { id: "evt_md", coverage: "unsupported", units: 1, reason: "unsupported_language", path: "docs/notes.md", language: null, anchors: [] },
    { id: "evt_py", coverage: "failed", units: 1, reason: "invalid_source_encoding", path: "scripts/job.py", language: "python", anchors: [] },
  ],
});

if (!validation.valid) {
  console.error(validation.errors);
}
```

Implemented foundation — snapshot capture uses current exports, then preserves
an exact staged or committed identity for later analysis:

```ts
import { captureRepositorySnapshot, captureStagedSnapshot } from "./src/git.js";

const staged = captureStagedSnapshot(repositoryRoot);
staged.identity.kind; // "staged"
staged.identity.copied_index_sha256; // copied-index read, not the live index itself

const repository = captureRepositorySnapshot(repositoryRoot);
repository.identity.kind; // "repository"
repository.identity.working_changes_included; // false
```

Implemented foundation — repository runs are local, path-safe, and tied to one
atomic run ID from allocation through manifest completion:

```ts
import {
  allocateRepositoryRun,
  completeRepositoryRun,
  deleteRun,
  inspectRun,
  listRuns,
  writeArtifactFile,
} from "./src/storage.js";
import {
  deriveRepositoryArtifactPath,
  deriveRepositoryManifestPath,
  formatRunIdAtUtc,
  validateRelativePath,
} from "./src/paths.js";

const formattedRunId = formatRunIdAtUtc(new Date("2026-08-11T00:15:00Z"));
const allocation = allocateRepositoryRun(repositoryRoot, repository.identity);
allocation.runId; // claimed atomically inside allocateRepositoryRun(...)
formattedRunId; // deterministic formatting helper only

validateRelativePath("../outside.txt"); // throws: traversal rejected

const coveragePath = deriveRepositoryArtifactPath(allocation.runId, "coverage");
writeArtifactFile(allocation, coveragePath, coverageJsonBytes);
completeRepositoryRun(allocation, manifest);

inspectRun(repositoryRoot, allocation.runId);
listRuns(repositoryRoot);
deleteRun(repositoryRoot, allocation.runId); // exact-ID delete; failed deletion returns remaining_paths for retry

deriveRepositoryManifestPath(allocation.runId);
```

Implemented foundation — incomplete repository allocation stays visible until
manifest completion:

```ts
const pending = allocateRepositoryRun(repositoryRoot, repository.identity);

inspectRun(repositoryRoot, pending.runId).status; // "incomplete"
// The new run is addressed by its exact allocated ID, not listRuns()[0].
inspectRun(repositoryRoot, pending.runId); // metadata visible, manifest still null

completeRepositoryRun(pending, manifest);
inspectRun(repositoryRoot, pending.runId); // completed manifest is now available
```

Implemented foundation — traversal validation and storage confinement are
separate checks:

```text
validateRelativePath(...) rejects ../traversal, absolute paths, backslashes, and non-normalized segments
writeArtifactFile(...) resolves the validated artifact path beneath the allocated .skia/ run directory
storage writes reject symlinked paths that would escape or redirect artifact resolution
```

Implemented foundation — language analysis currently supports exactly three
source-language registrations:

```text
.ts  -> typescript
.tsx -> tsx
.py  -> python
```

Implemented foundation — `analyzeSourceFile(options)` exposes supported,
unsupported, failed, and partial outcomes without inventing a success bucket:

```ts
import { analyzeSourceFile } from "./src/languages/registry.js";
import type { CoverageEventId } from "./src/types.js";

const coverageEventId = (value: string): CoverageEventId => value as CoverageEventId;

const options = {
  bytes: new TextEncoder().encode("export const answer = 42;\n"),
  coverage_event_id: coverageEventId("evt_supported"),
  max_bytes: 4096,
  mode: "100644",
  path: "src/example.ts",
  snapshot_kind: "staged",
  status: "M",
};
const analyzed = analyzeSourceFile(options);

analyzed.registration?.extension; // ".ts"
analyzed.coverage_event.coverage; // "supported"
analyzed.parse_result?.kind; // "parsed"
```

Implemented foundation — the current boundaries stay visible instead of being
collapsed into “close enough”:

```ts
analyzeSourceFile({ ...options, path: "docs/guide.md" }).coverage_event.coverage;
// "unsupported" with reason "unsupported_language"

analyzeSourceFile({ ...options, mode: "120000" }).coverage_event.reason;
// "unsupported_file_mode"

analyzeSourceFile({ ...options, status: "D" }).coverage_event.reason;
// "unsupported_status"

analyzeSourceFile({ ...options, bytes: new Uint8Array([0xef, 0xbb, 0xbf, 0x66]) }).decoded_source?.had_utf8_bom;
// true

analyzeSourceFile({ ...options, bytes: new Uint8Array([0xc3, 0x28]) }).parse_result?.kind;
// "failed" with reason "invalid_source_encoding"

analyzeSourceFile({ ...options, bytes: new Uint8Array([0x61, 0x00, 0x62]) }).parse_result?.kind;
// "failed" with reason "binary_source"

analyzeSourceFile({ ...options, max_bytes: 1 }).coverage_event.reason;
// "staged_budget_exceeded" or "repository_limit_exceeded"

analyzeSourceFile({
  ...options,
  bytes: new TextEncoder().encode("export const broken = (\n"),
}).parse_result?.kind;
// "partial" with non-empty syntax_error_ranges
```

Implemented foundation — storage and Git safety fail closed around local state:

```text
.skia/dist/<runId>/... only; no writes outside .skia/
run ID claim file is created before the repo-review directory is populated
../escape.json and symlinked artifact paths are rejected
deleteRun(repositoryRoot, runId) retries by exact run ID when remaining_paths stay visible
captureStagedSnapshot(...) reads through a copied index and deletes the temp copy afterward
captureRepositorySnapshot(...) reads committed HEAD with working_changes_included: false
```

Implemented foundation — corrupt refs or missing objects fail snapshot capture
instead of returning a best-effort repository snapshot:

```ts
import { captureRepositorySnapshot, GitSnapshotError } from "./src/git.js";

try {
  captureRepositorySnapshot(repositoryRoot);
} catch (error) {
  if (error instanceof GitSnapshotError) {
    error.reason;
    // "git_process_failed" for a corrupt current branch ref
    // "missing_local_object" for a missing committed object
  }
}

// no successful repository snapshot is returned after these failures
```

Implemented foundation — repository-mode coverage can still remain visibly
incomplete:

```text
selected subsystems -> reviewed now
unchecked remainder -> still recorded as unchecked
```

---

## What Skia is not

```text
not a linter              not a test runner
not semantic proof        not a code-quality verdict
not an AI PR reviewer     not a source-rewrite engine
not employee scoring      not authoritative architecture docs
```

The project must not claim improved comprehension, semantic equivalence,
complete repository coverage, or verified HLD/LLD until its own evidence
supports those claims.

---

## Why test this?

Research suggests that AI assistance can increase output while weakening
short-term understanding, and that causal teach-back can improve later
maintenance performance in one novice setting. None of that evidence validates
this product or its professional workflow.

The first real question is simpler:

> **Can collapsed evidence reduce reading while preserving enough truth for a
> developer to predict behavior more accurately than with a raw diff or passive
> summary?**

See [Validation and Evidence](docs/VALIDATION.md) for sources, competing tools,
experiment design, and kill criteria.

---

## Project status

```text
[x] Product and architecture specification
[x] Output contracts, validation plan, and canonical JSON Schemas
[x] Contribution, governance, and security boundaries
[x] Executable schema, Git, language, and storage fixtures
[x] Phase 1 snapshot, path, storage, and parser/coverage foundation
[ ] Staged reduced-reading prototype
[ ] Repository structural scanner
[ ] Agent-assisted HLD/LLD prototype
[ ] Professional developer validation
[ ] Rename and release readiness
```

No implementation begins by treating the specification as proof that the idea
works. The project should narrow, pivot, or stop if the reduced view is not
meaningfully shorter, hides behavior, becomes ritual friction, or produces
unreliable architecture drafts.

---

## Deferred surfaces and development commands

Still deferred nearby the implemented foundation:

- staged semantic reduction;
- repository structural scanning;
- agent transport and consented provider handoff;
- HLD/LLD generation; and
- behavioral validation of the product itself.

Development commands for the current repository foundation:

```text
npm run typecheck
npm run build
npm test
npm run test:golden
npm run test:security
python3 scripts/check_docs.py
```

The intended `skia review` and `skia repo review` transcripts above remain
product examples, not current executable CLI behavior.

---

## Contribute at the current stage

Useful contributions are evidence and design pressure, not unsolicited product
code:

- synthetic staged `typescript | tsx | python` fixtures;
- synthetic `typescript | tsx | python` repository layouts;
- cases that must remain unmapped or `not_checkable`;
- prompt-injection, privacy, and provider-boundary cases;
- schema, requirement, or citation corrections; and
- implementation proposals mapped to acceptance criteria.

Never submit proprietary source, secrets, personal data, private paths, or
sensitive architecture. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Document map

```text
README (you are here)
  |
  +-- PRD ----------------------- product behavior and success/kill criteria
  +-- ARCHITECTURE -------------- Git, scanner, agent, and storage design
  +-- IMPLEMENTATION_PLAN ------- acceptance criteria and build order
  +-- docs/artifacts/README ----- exact staged and repository output examples
  +-- docs/VALIDATION ----------- evidence, competitors, and experiments
  +-- docs/OPEN_DECISIONS ------- unresolved release and design choices
  +-- CONTRIBUTING -------------- safe ways to challenge or extend the design
  +-- SECURITY ------------------ reporting, threat model, and privacy boundary
```

| Document | Link |
|---|---|
| Product requirements | [PRD.md](PRD.md) |
| Technical design | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Acceptance criteria | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) |
| Output reference | [docs/artifacts/README.md](docs/artifacts/README.md) |
| Evidence and experiments | [docs/VALIDATION.md](docs/VALIDATION.md) |
| Open decisions | [docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md) |
| Governance | [GOVERNANCE.md](GOVERNANCE.md) |
| Security | [SECURITY.md](SECURITY.md) |
| Repository metadata guidance | [.github/REPOSITORY_METADATA.md](.github/REPOSITORY_METADATA.md) |

---

## License

MIT. See [LICENSE](LICENSE).
