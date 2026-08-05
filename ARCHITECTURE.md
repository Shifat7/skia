# Skia Architecture -- Proposed Target

> **Unimplemented design.** The repository contains no Cargo package,
> source code, tests, generated HLD/LLD, or runnable command. Every module,
> type, command, and data flow below is a proposal.

---

## 1. Architecture goals

The implementation must support two bounded workflows without conflating
deterministic evidence with model output:

- `skia review` -- a reduced-reading checkpoint over one staged TypeScript
  snapshot;
- `skia repo review` -- a TypeScript-first structural snapshot plus
  agent-generated HLD/LLD and architecture/subsystem comprehension checks.

Both workflows are local-first, read-only with respect to source and Git, and
schema-first. They may write only beneath `.skia/`.

The staged path is deterministic and has no network capability. Repository
mode is deterministic through structural scanning, then optionally crosses an
explicit agent boundary after consent. Agent output is never silently promoted
to a deterministic fact.

---

## 2. Package structure

One synchronous Rust binary is sufficient for the first implementation:

```text
src/
  main.rs             command parsing and orchestration
  git.rs              hardened Git process boundary and snapshot capture
  limits.rs           file, byte, time, output, and terminal-input limits
  paths.rs            path-byte handling and escaped display
  typescript.rs       TS/TSX parsing and declarations
  coverage.rs         included/excluded/unsupported/failed accounting
  staged/
    entities.rs       changed-entity ownership and mapping
    collapse.rs       collapsed equivalence evidence
    card.rs           minimal prediction card and validation
    source_check.rs   narrow path comparison
    probe.rs          structured unexecuted probe specification
    receipt.rs        staged receipt schema and writer
    prompt.rs         staged terminal interaction
  repository/
    inventory.rs      committed-tree file classification
    structure.rs      packages, entry points, exports, imports, direct calls
    subsystems.rs     evidence-backed subsystem candidates and selection
    agent.rs          consent, adapter, prompt contract, and output validation
    bundle.rs         HLD/LLD/evidence/cards/coverage/manifest assembly
    prompt.rs         repository terminal interaction
  schema.rs           JSON Schema versions and validation
  storage.rs          atomic local run creation, listing, inspection, deletion
```

A multi-crate workspace, plugin system, async runtime, daemon, watcher, hosted
service, and source-rewrite engine are excluded until a second consumer or
measured requirement justifies them.

---

## 3. Technology choices

| Concern | Proposed dependency or API | Constraint |
|---------|----------------------------|------------|
| CLI | `clap` derive | Commands and flags have golden help tests |
| TypeScript parsing | pinned compatible `tree-sitter` and `tree-sitter-typescript` | Use current `LANGUAGE_TYPESCRIPT` and `LANGUAGE_TSX` APIs; record versions |
| Git | `std::process::Command` | Structured arguments, hardened environment, no shell |
| Serialization | `serde`, `serde_json` | Every JSON output validates against a versioned schema |
| Hashing | `sha2` | SHA-256 for snapshots and artifacts |
| Time | `time` | UTC path-safe run IDs and RFC 3339 manifest timestamps |
| Errors | `anyhow` plus typed boundary errors | User output is escaped and actionable |
| Terminal | `std::io` | No TUI in Phase 0; degrades without color |
| Agent | narrow adapter trait owned by repository mode | No provider SDK in deterministic modules |

Exact crate versions and the minimum supported Rust version are release
blockers. Architecture documentation must point to the docs for those pinned
versions rather than `latest` alone.

---

## 4. Shared safety model

### 4.1 Trust boundaries

The process crosses these boundaries:

1. Git executable and repository metadata;
2. untrusted path and source bytes;
3. terminal input and rendering;
4. local filesystem output beneath `.skia/`; and
5. the optional repository-mode agent/provider.

Repository text is data, never instruction. That includes code, comments,
Markdown, package scripts, generated files, fixtures, model prompts checked into
the repository, and dependency documentation.

### 4.2 Fixed process environment

Every Git subprocess uses structured arguments and a controlled environment:

- `GIT_OPTIONAL_LOCKS=0` prevents optional index-refresh writes;
- `GIT_NO_LAZY_FETCH=1` prevents a partial clone from fetching missing objects;
- `GIT_PAGER=cat` and `PAGER=cat` disable paging;
- `GIT_TERMINAL_PROMPT=0` prevents credential prompts;
- `LC_ALL=C` stabilizes diagnostics where supported;
- external diff and text conversion are disabled on diff-producing commands;
- process timeout, output-byte limit, and exit status are enforced; and
- inherited variables that redirect Git directories, object stores, worktrees,
  configuration, or SSH/network behavior are cleared unless explicitly needed.

The implementation treats stderr and stdout as untrusted bytes and escapes
control characters before display.

### 4.3 Path and file-mode handling

Internal Git paths remain byte-preserving platform path values. They are not
lossily coerced to UTF-8 for identity or Git arguments. Display uses escaped,
quoted output.

Before parsing a `.ts` or `.tsx` blob, the scanner verifies an allowed regular
file mode. Symlinks, submodules, type changes, directories, conflicts, and
unknown modes are rejected or counted as unsupported. File extension alone is
not evidence that a blob is TypeScript source.

### 4.4 Resource limits

The scanner enforces explicit limits for:

- number of files;
- bytes per blob and total bytes;
- source lines and changed lines;
- parse time and total run time;
- subprocess output;
- terminal input length;
- generated artifact bytes; and
- agent input/output tokens.

Limit values are versioned configuration. Hitting a limit records partial
coverage or stops the run; no mode silently truncates and then claims complete
coverage.

### 4.5 Local storage

`.skia/` is the only writable root. Writers:

- reject symlinked roots and link-following;
- create run directories and files atomically;
- use create-new semantics and never overwrite an existing run;
- use owner-only permissions where supported;
- write temporary data only inside the protected run directory;
- fsync or document durability limits before marking a run complete;
- mark interrupted runs incomplete; and
- provide list, inspect, and delete operations.

---

## 5. Immutable Git snapshots

### 5.1 Staged snapshot

Separate live-index reads are not a snapshot. The staged capture algorithm
must create one immutable logical view before it hashes, parses, or displays
content.

Proposed sequence:

1. Discover repository root without changing state.
2. Resolve `HEAD`; represent an unborn branch explicitly.
3. Resolve branch or detached state.
4. Read the index under a consistency strategy that cannot mix generations.
5. Enumerate the complete staged status set before filtering.
6. Capture supported staged blob OIDs, modes, paths, base blob OIDs, and hunk
   metadata.
7. Compute snapshot identity from the base OID, index identity, ordered path and
   mode list, blob OIDs, and canonical staged patch bytes.
8. Revalidate the live index identity before interaction; abort when it changed.
9. Use only captured OIDs and bytes after the snapshot is accepted.

An implementation may use a temporary copied index with `GIT_INDEX_FILE`, a
captured index checksum plus blob-OID manifest and final revalidation, or
another tested design. It must not write a tree object merely to obtain
immutability, because Phase 0 promises read-only Git object state.

### 5.2 Repository snapshot

Repository mode captures one commit OID and traverses its tree by OID. It does
not read working-tree files, include staged/unstaged changes, or execute
repository configuration.

The command reports dirty index/working-tree state as excluded context:

```text
Repository snapshot uses HEAD c8d1a18.
Uncommitted changes are not included.
```

A missing object in a partial clone fails locally because lazy fetch is
disabled. The coverage artifact records the failure; the command does not
phone home.

### 5.3 Status matrix

The complete status and mode matrix is a versioned contract. Initial staged
support is regular-file added or modified TypeScript/TSX only. Deletions,
renames, copies, conflicts, type changes, submodules, symlinks, binaries, and
unknown statuses must appear in terminal and coverage output with a stable
reason code.

---

## 6. Staged-mode pipeline

```text
immutable staged snapshot
        |
        v
TS/TSX parse + changed-range mapping
        |
        v
supported entity ownership + coverage
        |
        v
collapsed equivalence evidence
        |
        v
minimal Behavior Card prediction
        |
        v
persist prediction
        |
        +--> narrow source check
        +--> optional probe spec
        |
        v
versioned local receipt
```

### 6.1 Entity ownership

Each changed line belongs to at most one supported entity. Nested declarations
require a deterministic rule, such as innermost supported entity ownership,
with enclosing context recorded separately. Wholly deleted entities remain
unmapped until a dedicated base-only design exists.

### 6.2 Collapsed evidence reducer

The reducer emits ordered compact relations from directly observed syntax:

```text
condition/input -> observable local outcome
```

It may represent guards, branches, transformations, direct calls, direct side
effects, error endpoints, and declared contract changes. Each relation carries
base/staged anchors, derivation, and coverage state.

The reducer must prefer:

1. fewer truthful relations;
2. explicit partial coverage; and
3. source fallback

over a longer or stronger claim that the syntax cannot support.

No LLM is required or permitted in Phase 0 staged evidence. This preserves a
model-free comparison arm and a deterministic truth boundary.

### 6.3 Minimal card state machine

```text
evidence_shown
  -> prediction_complete | skipped | stopped
prediction_complete
  -> prediction_persisted
prediction_persisted
  -> source_checked | not_checkable
source_checked | not_checkable
  -> next_entity | session_complete
```

`GIVEN` and `WHEN` are system-owned. The developer enters `THEN`. `BECAUSE` is
conditional after mismatch or explicit request. `IMPACT` is conditional on a
risk prompt. The persisted pre-feedback prediction is immutable; any later
reflection is stored separately.

### 6.4 Source check

The source checker has a formal decision table, not ad hoc AST walking. It
must define argument binding, eligible predicates, selected branch, negative
branch, endpoint ownership, multiple-match precedence, changed-range overlap,
JSON scalar comparison, throw comparison, and every `not_checkable` reason.

### 6.5 Receipt

A staged receipt is one schema-validated JSON file. It stores snapshot identity,
scope, mapped/unmapped counts, evidence, scenario, prediction, optional
reflection, source-check result, probe status, user actions, duration, and
privacy caveat. It contains no `correct` or `review_passed` field.

---

## 7. Repository-mode pipeline

```text
captured HEAD commit tree
        |
        v
inventory + deterministic coverage
        |
        v
TypeScript structural model
        |
        +--> packages/workspaces/config/docs
        +--> entry points/exports/imports/direct calls
        +--> subsystem candidates + uncertainty
        |
        v
explicit agent consent
        |
        +--> declined: deterministic bundle only
        |
        v
agent generation from facts + bounded source
        |
        +--> HLD draft
        +--> LLD draft
        +--> collapsed architecture evidence
        +--> claim provenance/confidence
        |
        v
architecture card + selected subsystem cards
        |
        v
local timestamped bundle + manifest
```

### 7.1 Inventory

The scanner reads the captured tree and classifies every entry. Default
classification considers:

- `.ts` and `.tsx` source;
- `package.json`, workspace manifests, lockfiles, `tsconfig*`, and build/test
  configuration;
- repository Markdown and decision records;
- common generated and vendor directories;
- fixtures and tests;
- unsupported source-language extensions; and
- mode, size, parse, and encoding failures.

Ignore rules used for the product are internal and versioned. The scanner does
not execute `.gitignore`, package scripts, custom parsers, or repository
plugins. Configuration files are parsed as untrusted data with size and depth
limits.

### 7.2 Structural model

The versioned model has stable IDs for files, declarations, edges, packages,
entry points, configuration, documents, candidate subsystems, coverage events,
and unresolved references.

Tree-sitter provides syntax only. Import resolution is bounded to deterministic
relative and manifest-declared paths supported by fixtures. Dynamic imports,
path aliases, generated modules, framework conventions, and cross-language
edges remain unresolved unless a dedicated tested resolver exists.

### 7.3 Subsystem discovery

Deterministic features may propose candidate groups from package/workspace
boundaries, directory roots, entry points, and import communities. The agent
may propose human-readable subsystem names or merge/split suggestions. Every
candidate records:

- deterministic membership evidence;
- model-derived label or rationale;
- unresolved and cross-boundary edges;
- confidence; and
- coverage counts.

Subsystem discovery is not domain proof. The developer sees the candidates
before selection.

### 7.4 Agent adapter

The agent boundary accepts a typed request containing:

- snapshot and scan-model identifiers;
- bounded facts and source slices;
- desired artifacts and schemas;
- untrusted-content instruction;
- source-anchor requirements;
- maximum output size; and
- provider/model disclosure.

It returns typed claims, HLD/LLD sections, collapsed relations, citations, and
uncertainty. The host validates shape, anchor existence, size, and forbidden
claims before writing artifacts. Validation cannot prove semantic truth; that
limit is included in the manifest.

The adapter exposes no write, shell, network, Git mutation, or project-execution
tools to the generating agent. Provider transport is outside the deterministic
core, begins only after consent, and may reach only the explicitly disclosed
provider endpoint set; redirects or fallback providers cannot expand that
allowlist silently.

### 7.5 HLD

The HLD is concise and system-level. It includes:

- snapshot and coverage banner;
- observed packages, entry points, and external interfaces;
- model-derived subsystem map with confidence;
- major data/control flows anchored to source;
- unresolved architecture questions; and
- unsupported-language and exclusion summary.

It does not include file-by-file prose.

### 7.6 LLD

The LLD is bounded and navigable. It includes:

- package/module tables rather than narrative repetition;
- key exported declarations and direct dependencies;
- selected subsystem details;
- source-anchored local flow relations;
- unresolved edges; and
- links to claim IDs in the manifest.

Full-repository low-level prose would defeat the reduced-reading objective. The
LLD lists unexpanded modules compactly and expands only selected or high-value
areas within a documented output budget.

### 7.7 Repository Behavior Cards

One architecture card is mandatory for a successful generated snapshot. The
configured `repo_card_cap` includes that card. When subsystem count exceeds the
remaining slots, the developer selects subsystems; the rest are stored as
`unchecked` with no implied coverage.

Cards remain minimal predictions. Example architecture relation:

```text
HTTP route -> application service -> repository adapter -> database
```

The scenario asks where an observable request, state change, or failure
propagates. Repository cards have no deterministic source-check verdict unless
the answer maps to a specifically supported deterministic path. Model-generated
answers are not used as ground truth.

---

## 8. Timestamped repository bundle

### 8.1 Layout

One UTC run ID is created before artifact writing:

```text
.skia/dist/20260805T001500Z/
  repo-hld-20260805T001500Z.md
  repo-lld-20260805T001500Z.md
  repo-collapsed-evidence-20260805T001500Z.md
  repo-behavior-cards-20260805T001500Z.json
  repo-coverage-20260805T001500Z.json
  repo-manifest-20260805T001500Z.json
```

Run IDs follow `basic-utc-timestamp [ "-" two-digit-sequence ]`. The writer
uses atomic create-new retries: `20260805T001500Z`, then
`20260805T001500Z-01`, `-02`, and so on. It never checks and opens in separate
steps. The directory and every filename use the resolved run ID.

### 8.2 Write sequence

1. Create the new run directory atomically.
2. Write an incomplete manifest with expected artifact names.
3. Write each artifact with create-new semantics and owner-only permissions.
4. Hash and validate every completed non-manifest artifact.
5. Write coverage and cards.
6. Replace the manifest state with `complete` only after all required artifacts
   validate and are durable under the documented platform contract.
7. On interruption, retain or clean an explicitly `incomplete` run; never
   present it as complete.

### 8.3 Manifest relationships

HLD and LLD sections cite stable claim IDs. The manifest maps claim IDs to
anchors, derivation, confidence, and artifact locations. Coverage is referenced
rather than copied into conflicting prose.

---

## 9. Error model

Errors have stable codes, escaped display, and documented exit status. Initial
classes include:

- not a Git repository;
- no `HEAD` for repository mode;
- unborn `HEAD` in staged mode;
- index changed during snapshot capture;
- missing local object with lazy fetch disabled;
- unsupported status or file mode;
- path or source encoding not supported by the parser;
- binary or oversized blob;
- parse timeout or invalid region;
- no supported staged entity;
- staged pilot budget exceeded;
- repository inventory or structural limit exceeded;
- unsupported language coverage;
- agent consent declined;
- agent unavailable, malformed output, missing anchors, or output limit;
- card cap requiring subsystem selection;
- output root symlink, unsafe permissions, collision, disk full, or write error;
- schema validation failure; and
- interrupted run.

Partial operation is allowed only when the coverage and manifest contracts
represent it explicitly.

---

## 10. Testing architecture

### 10.1 Pure fixtures

Fixture families cover:

- TS and TSX declarations, nested entities, added/removed constructs, source
  checks, collapsed evidence, and safe fallback;
- package/workspace layouts, monorepos, circular imports, aliases, dynamic
  imports, generated/vendor paths, unsupported languages, and subsystem
  candidates;
- agent responses with valid, missing, wrong, stale, fabricated, duplicate,
  and out-of-budget source anchors; and
- complete, partial, skipped, unchecked, declined-agent, failed-agent, and
  interrupted output schemas.

### 10.2 Temporary Git repositories

Tests reproduce:

- concurrent index mutation;
- full status discovery versus supported filtering;
- detached and unborn HEAD;
- partial clone missing objects without lazy fetch;
- spaces, non-UTF-8 path bytes, control characters, symlinks, submodules,
  conflicts, type changes, binaries, and large blobs;
- same-second output collision;
- output-root symlinks and link-following attempts; and
- no writes outside `.skia/`.

### 10.3 Golden terminal and artifact tests

Golden tests cover reduced-reading staged output, on-demand source expansion,
minimal prediction, mismatch reflection, skip, unmapped warning, architecture
card, subsystem selection, unchecked subsystems, agent consent/decline, HLD,
LLD, coverage, cards, and manifest.

Golden JSON validates against normative schemas. Markdown artifacts are checked
for required banners, claim IDs, source anchors, timestamped filenames, and
size budgets.

### 10.4 Security and privacy tests

Tests inject prompt instructions through code, comments, Markdown, package
metadata, paths, and model output. The agent receives them as data and has no
consequential tools. Network-denial tests cover staged mode. Agent-mode tests
prove no egress before consent and, after consent, no network destination beyond
the explicitly disclosed provider endpoint allowlist, including redirect and
fallback-provider cases.

---

## 11. Configuration

Phase 0A staged mode has no repository configuration file. Repository mode may
accept command flags or a local `.skia/config.json`, but a repository-controlled
config cannot silently expand egress, execution, file, or output limits.

Initial configurable values:

- provider/model adapter;
- agent consent preference that still requires first-use confirmation;
- repository include/exclude paths within safety limits;
- file, byte, parse, agent-context, and output budgets;
- `repo_card_cap`; and
- local artifact retention preference.

Configuration origin and effective values are written to the manifest.
