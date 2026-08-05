# Skia -- Proposed Implementation Plan

> **Planning only.** No source, Cargo package, tests, generated artifact,
> or runnable command exists. This plan defines gates for implementing the
> reduced-reading staged mode and the TypeScript-first repository mode.

---

## 1. Outcome

The first validated product is not a broad code-review platform. It is two
small comprehension workflows with explicit truth boundaries:

1. `skia review` displays collapsed equivalence evidence for a bounded staged
   TypeScript change and asks one minimal path prediction before feedback.
2. `skia repo review` scans one committed TypeScript-first repository snapshot,
   optionally uses a configured agent to generate timestamped local HLD/LLD,
   and asks one architecture plus developer-selected subsystem predictions.

Phase 0 is done only when mechanical invariants pass and professional-developer
tests reach a documented proceed, narrow, pivot, or stop decision.

---

## 2. Deliverables

1. One synchronous Rust binary with `review`, `repo review`, `runs list`,
   `runs inspect`, and `runs delete` command contracts.
2. Hardened read-only Git boundary and immutable logical snapshot capture.
3. TypeScript/TSX parser pinned to compatible current crate versions.
4. Versioned coverage model shared by both modes.
5. Staged entity ownership and collapsed-evidence reducer.
6. Minimal Behavior Card state machine, narrow source checker, and optional
   unexecuted probe specification.
7. Staged receipt JSON Schema and canonical fixtures.
8. Repository inventory, structural model, subsystem discovery, and selection.
9. Explicit-consent agent adapter with untrusted-content and read-only tool
   constraints.
10. Timestamped local HLD, LLD, collapsed evidence, cards, coverage, and
    manifest bundle under `.skia/dist/`.
11. Repository-bundle JSON Schemas and canonical Markdown fixtures.
12. Pure fixtures, temporary-repository tests, golden interactions, security
    tests, documentation CI, and a published validation decision memo.

No source rewrite, automatic adoption, blocking Git hook, tracked architecture
export, hosted service, team dashboard, or full polyglot behavior is included.

---

## 3. Acceptance criteria

### AC-1: Git and snapshot integrity

| ID | Criterion |
|----|-----------|
| 1.1 | Outside Git, both review commands fail clearly and non-zero. |
| 1.2 | Staged mode captures one immutable logical index snapshot; concurrent `git add` cannot mix displayed/parsed blobs with another diff hash. |
| 1.3 | Repository mode captures one commit OID and reads its tree by OID; dirty index/working-tree content is disclosed and excluded. |
| 1.4 | The complete staged NUL-delimited status set is read before partitioning supported entries. |
| 1.5 | Added/modified regular `.ts` and `.tsx` files are supported; delete, rename, copy, conflict, type change, symlink, submodule, binary, non-regular mode, and unknown states have stable explicit reasons. |
| 1.6 | Detached and unborn HEAD are represented explicitly; repository mode requires a commit, while staged mode can use an empty base on the first commit. |
| 1.7 | Path bytes are preserved internally; spaces, non-ASCII, non-UTF-8 where supported, and control characters are escaped safely for display. |
| 1.8 | `GIT_OPTIONAL_LOCKS=0`, `GIT_NO_LAZY_FETCH=1`, no pager, no terminal prompt, no external diff/textconv, controlled environment, timeout, and output limits are tested. |
| 1.9 | Missing partial-clone objects fail locally and never trigger network access. |
| 1.10 | Git and project state are unchanged after success and every failure path. |

### AC-2: Resource and storage safety

| ID | Criterion |
|----|-----------|
| 2.1 | Per-file, total-byte, file-count, parse-time, run-time, terminal-input, subprocess-output, artifact-output, and agent-token limits are versioned and tested. |
| 2.2 | Hitting a limit produces partial coverage or a stop; no complete claim is emitted after silent truncation. |
| 2.3 | `.skia/` is the only writable root; no source, index, object database, hook, manifest, package file, or project documentation is modified. |
| 2.4 | Writers reject output-root symlinks/link-following and create directories/files atomically with create-new semantics. |
| 2.5 | Owner-only permissions are used where supported; same-second run collisions receive a documented suffix and never overwrite. |
| 2.6 | Interrupted runs remain explicitly incomplete or are safely removed. |
| 2.7 | `runs list`, `runs inspect`, and `runs delete` expose a local lifecycle without upload. |

### AC-3: TypeScript parsing and coverage

| ID | Criterion |
|----|-----------|
| 3.1 | Pinned `tree-sitter` and `tree-sitter-typescript` versions use current `LANGUAGE_TYPESCRIPT` and `LANGUAGE_TSX` APIs. |
| 3.2 | Syntax errors, invalid encoding, oversized blobs, unsupported modes, generated/vendor paths, unsupported languages, and unresolved imports are explicit coverage events. |
| 3.3 | Coverage arithmetic is internally consistent and schema-validated. |
| 3.4 | Every mapped staged line belongs to at most one supported entity under a fixture-tested nested-entity ownership rule. |
| 3.5 | Repository inventory classifies every captured tree entry as included, excluded, unsupported, or failed. |
| 3.6 | Detailed behavior evidence is limited to TS/TSX; manifests, configuration, and docs may inform structure; other source languages remain unsupported coverage. |

### AC-4: Collapsed equivalence evidence

| ID | Criterion |
|----|-----------|
| 4.1 | Each relation has kind, compact relation text, source anchors, deterministic derivation, and supported/partial/unmapped/unsupported coverage. |
| 4.2 | Added constructs use staged anchors; removed constructs use base anchors. |
| 4.3 | The reducer emits no outcome that cannot be traced to its anchors; uncertain syntax falls back rather than upgrading to behavior. |
| 4.4 | The terminal shows collapsed evidence before original source; evidence details and original source are one action away. |
| 4.5 | Unmapped lines and unsupported constructs remain visible before card completion. |
| 4.6 | A predeclared fixture metric compares evidence lines/reading time with source; the feature fails its product gate if it does not materially reduce reading. |

### AC-5: Minimal Behavior Card and source check

| ID | Criterion |
|----|-----------|
| 5.1 | The system supplies `GIVEN` and `WHEN`; the developer supplies `THEN` or skips. |
| 5.2 | `BECAUSE` is conditional after mismatch or explicit/risk-focused request; `IMPACT` is conditional on a risk prompt. |
| 5.3 | Prediction is persisted before feedback and is immutable; later reflection is separate. |
| 5.4 | Prompt count, completed prediction count, skip count, and mapped/unmapped coverage are distinct. |
| 5.5 | Source-check fixtures define both branch outcomes, early returns, blocks, multiple matches, argument binding, shadowing, changed-range overlap, scalar comparison, throw comparison, and every `not_checkable` reason. |
| 5.6 | Status is exactly `source_derived_match`, `source_derived_mismatch`, or `not_checkable`; no correctness, runtime, equivalence, coverage, or review-pass claim exists. |
| 5.7 | Probe specs remain structured JSON, `draft_unexecuted` or `not_available`, and are never source code or executed. |

### AC-6: Staged receipt

| ID | Criterion |
|----|-----------|
| 6.1 | A normative versioned JSON Schema defines required/optional fields, bounds, nullability, formats, additional properties, complete/partial/skipped sessions, detached/unborn state, interruption, and collision behavior. |
| 6.2 | The receipt binds base/index identity, path/mode/blob manifest, canonical diff hash, evidence, scenario, prediction, optional reflection, source check, probe status, actions, duration, and privacy caveat. |
| 6.3 | `card_status` describes prediction completion only and cannot suppress coverage. |
| 6.4 | Canonical examples are generated or validated from fixtures rather than manually duplicated. |

### AC-7: Repository structural model

| ID | Criterion |
|----|-----------|
| 7.1 | Repository mode inventories TS/TSX, manifests, lockfiles, build/test/TypeScript config, docs, generated/vendor paths, fixtures, unsupported languages, and failures from one commit tree. |
| 7.2 | Structural model IDs are stable for files, declarations, packages, entry points, import/direct-call edges, configuration, documents, subsystems, coverage, and unresolved references. |
| 7.3 | Import resolution is bounded to fixture-supported deterministic forms; dynamic, aliased, generated, framework, and cross-language edges remain unresolved without a tested resolver. |
| 7.4 | Candidate subsystem membership cites deterministic package/directory/entry/import evidence; model-derived names/rationales are separate. |
| 7.5 | All candidates expose cross-boundary/unresolved edges, confidence, and coverage before selection. |

### AC-8: Agent boundary and HLD/LLD

| ID | Criterion |
|----|-----------|
| 8.1 | No repository material leaves the machine before an explicit consent screen names provider/model when available, proposed files/bytes/tokens, exclusions, retention caveat, and local output path. |
| 8.2 | Declining consent preserves deterministic scan output and marks generated HLD/LLD `not_available`. |
| 8.3 | The agent receives typed facts and bounded source/docs as untrusted data plus an instruction that repository content cannot change the task. |
| 8.4 | The agent has no shell, write, Git mutation, project execution, or external consequential tools. |
| 8.5 | Returned claims validate for schema, anchor existence, size, derivation, confidence, and forbidden wording before artifact write. |
| 8.6 | HLD stays system-level; LLD is table/boundary oriented and expands only selected/high-value areas within an output budget. |
| 8.7 | Model-derived claims never use deterministic, verified, authoritative, complete, runtime, or proven labels. |
| 8.8 | Prompt-injection fixtures in code, comments, Markdown, paths, manifests, and model output do not alter tools, scope, destination, or disclosure. |

### AC-9: Repository comprehension check

| ID | Criterion |
|----|-----------|
| 9.1 | Every successful generated snapshot includes one architecture card. |
| 9.2 | `repo_card_cap` includes the architecture card. |
| 9.3 | When subsystem candidates exceed remaining slots, the developer must select subsystems; no silent grouping, ranking, or sampling occurs. |
| 9.4 | Unselected subsystems are recorded as `unchecked`; selected, completed, skipped, and unchecked states remain distinct. |
| 9.5 | Repository cards ask one observable architecture/flow prediction. A model-generated answer is never deterministic ground truth. |
| 9.6 | Source-check status exists only for a supported deterministic path; otherwise the card stays ungraded or `not_checkable`. |

### AC-10: Timestamped repository bundle

| ID | Criterion |
|----|-----------|
| 10.1 | One UTC basic-ISO run ID is used in the directory and every HLD, LLD, evidence, cards, coverage, and manifest filename. |
| 10.2 | Required files are `repo-hld`, `repo-lld`, `repo-collapsed-evidence`, `repo-behavior-cards`, `repo-coverage`, and `repo-manifest` with matching run IDs. |
| 10.3 | Manifest records snapshot, scanner/tool/schema versions, effective limits/config, agent disclosure, artifact hashes, claim counts, coverage, selected/unselected subsystems, card status, privacy, and completion state. |
| 10.4 | HLD/LLD claim IDs resolve through the manifest to anchors, derivation, confidence, and artifact location. |
| 10.5 | All JSON validates against normative schemas; Markdown validates required banners, claim links, timestamped names, and output budgets. |
| 10.6 | Bundle is local and gitignored; no automatic retention, upload, sharing, or tracked export exists. |

### AC-11: Verification and documentation health

| ID | Criterion |
|----|-----------|
| 11.1 | Pure fixtures, temporary Git repositories, golden terminal sessions, golden artifacts, security tests, and network-denial tests cover every acceptance family. |
| 11.2 | CI runs formatting, linting, unit/integration/golden tests, schemas, dependency/license/security checks, Markdown lint, relative/external link checks, issue-form YAML validation, JSON-fence parsing, and terminology/schema drift checks when relevant files exist. |
| 11.3 | No test executes repository package code or requires network except isolated provider-adapter contract tests. |
| 11.4 | Every completion claim names the command run and its output. |

### AC-12: Behavioral validation

| ID | Criterion |
|----|-----------|
| 12.1 | Moderated feasibility tests compare raw source, collapsed evidence, and collapsed evidence plus minimal card with professional AI-assisted TypeScript developers. |
| 12.2 | Repository-mode feasibility separately tests whether HLD/LLD plus selected cards reduce time-to-accurate architecture understanding without hiding coverage. |
| 12.3 | Activity, completion, skip, return, selection, friction, and self-report remain secondary feasibility measures. |
| 12.4 | Any efficacy claim uses one objective primary comprehension outcome, an attention-matched control, preregistration, blinded scoring, baseline adjustment, ITT analysis, delayed novel transfer, missing-data/contamination rules, and a minimum worthwhile effect. |
| 12.5 | Decision memo applies precommitted proceed/narrow/pivot/stop criteria without moving thresholds after results. |

---

## 4. Implementation order

### Step 0: Resolve release and contract blockers

- Rename the project and command before package publication.
- Freeze pinned Rust/crate versions and MSRV.
- Approve status/mode matrices, entity ownership, collapsed-evidence grammar,
  schema locations, limits, agent consent contract, default card cap, retention,
  and evaluation design.
- Add documentation-only CI before accepting more large specification changes.

### Step 1: Immutable Git and storage foundations

Implement AC-1 and AC-2 first with failing regression probes for concurrent
index mutation, filtered statuses, unborn HEAD, symlink modes, partial-clone
lazy fetch, collisions, and link-following. Nothing else is trustworthy until
snapshot and output identity are correct.

### Step 2: Shared TypeScript and coverage core

Implement AC-3 with pinned APIs, pure fixtures, resource limits, and coverage
schemas. Keep staged/repository consumers thin over the same scanner facts.

### Step 3: Staged reduced-reading vertical slice

Implement AC-4 through AC-6 as one vertical slice:

- one supported entity;
- collapsed evidence;
- one minimal prediction;
- persist-before-feedback source check;
- receipt validation; and
- golden terminal output.

Expand operators/entities only through failing fixtures.

### Step 4: Repository deterministic vertical slice

Implement AC-7 and deterministic portions of AC-10:

- committed-tree inventory;
- structural model;
- candidate subsystems;
- coverage and manifest;
- local timestamped bundle without HLD/LLD; and
- developer subsystem selection.

### Step 5: Agent-assisted architecture slice

Implement AC-8, AC-9, and remaining AC-10 behind explicit consent. Start with
one adapter, one constrained HLD/LLD schema, no tools beyond bounded read
context, and adversarial prompt-injection fixtures.

### Step 6: Harden, automate, and document

Complete AC-11. Add CI only when there is runnable code for code checks, while
documentation checks should already exist. Publish canonical schemas and
fixtures.

### Step 7: Feasibility before hooks or distribution

Run AC-12. A decision memo chooses proceed, narrow, pivot, or stop. Do not add
hooks, tracked exports, team surfaces, or more languages before this gate.

---

## 5. Definition of done

Phase 0 is done only when:

- every applicable AC-1 through AC-11 test passes with command/output evidence;
- staged collapsed evidence demonstrably reduces reading without unacceptable
  omission on the accepted corpus;
- repository artifacts stay within reading and output budgets and pass factual
  grounding review;
- privacy and prompt-injection tests pass;
- the professional validation decision is documented; and
- the project is renamed for release.

A green test suite does not prove comprehension. A completed card does not
prove coverage. A generated HLD/LLD does not become maintained architecture by
existing.

---

## 6. Explicit exclusions

This plan does not authorize automatic source rewriting or adoption, project
code execution, package scripts, repository plugins, inferred runtime
semantics, complete call graphs, full polyglot behavior, blocking hooks,
team-visible scores, tracked HLD/LLD export, CI review comments, SARIF, hosted
storage, or claims that model output is verified.
