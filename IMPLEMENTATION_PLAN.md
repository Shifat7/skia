# Skia -- Phase 0 Implementation Plan

> **Planning only.** The repository has no Cargo workspace, source
> code, tests, package, or runnable command. This plan defines the
> smallest implementation that can test the product hypothesis; it is
> not evidence that the product works.

---

## 1. Phase 0 outcome

Phase 0 is complete only when a developer can run one manual command
against a staged TypeScript diff, inspect evidence from each supported
changed function or method within the pilot budget (at most 3 entities
and 150 added-plus-deleted TypeScript lines), fill or skip a typed Behavior Card
for each, see a narrow source check when applicable, receive a probe
spec when eligible, and receive a local comprehension receipt bound to
the exact staged snapshot. The receipt must expose total, mapped, and
unmapped changed TypeScript lines so card completion cannot masquerade
as full review coverage.

The implementation must answer two separate questions:

1. **Mechanical:** Can the tool review the correct staged bytes and
   derive supported syntax-delta evidence, validate strongly typed
   Behavior Cards, perform narrow source checks, produce probe specs
   (structured JSON, never source code), and enforce budget limits
   without inventing semantics or executing code?
2. **Behavioral:** Does the Behavior Card interaction cause developers
   to inspect and predict code they would otherwise have shipped
   without reading, and does it outperform a raw-diff-only control?

Feature breadth is not a success criterion.

---

## 2. Deliverables

1. One synchronous Rust binary exposing `skia review` as the proposed
   command name.
2. Git index/base snapshot reader with staged-diff hashing.
3. TypeScript and TSX parser for named functions and methods.
4. Conservative syntax-delta evidence extractor.
5. Ordered Behavior Card templates and narrow source-check logic.
6. Optional probe spec generator for exported top-level functions
   whose JSON arguments map unambiguously to declared parameter order
   and whose cards predict return/throw outcomes (structured JSON,
   never source code).
7. Diff-first terminal interaction.
8. Versioned local comprehension receipt writer with session scope
   and per-entity entries.
9. Pure fixtures, temporary-git-repository tests, and golden
   interaction/receipt tests covering source-check eligibility, probe
   spec eligibility, and budget-refusal behavior.
10. A four-week manual-command dogfood pilot comparing raw-diff-only
    versus Behavior Card, with a decision memo.

No hook, installer, package publication, additional language, LLM,
CI review bot, or semantic graph is part of Phase 0. No probe spec
is written into the project, run, or treated as a passed test.

---

## 3. Acceptance criteria

### AC-1: Git snapshot integrity

| ID | Criterion |
|----|-----------|
| 1.1 | Outside a git repository, the command prints a clear error and exits non-zero. |
| 1.2 | With no staged supported files, the command exits cleanly without a comprehension receipt. |
| 1.3 | Added and modified `.ts`/`.tsx` paths are read from a NUL-delimited index status command. |
| 1.4 | The staged file is read from the index; adjacent unstaged edits in the working tree never appear in displayed code, evidence, prompts, or receipts. |
| 1.5 | The base snapshot is read from `HEAD`; a new file uses an empty base. |
| 1.6 | The exact raw staged diff bytes are hashed with SHA-256, and the same index state yields the same hash. |
| 1.7 | Paths with spaces and non-ASCII characters are preserved. |
| 1.8 | Renames, deletions, binary files, submodules, and unsupported status codes are rejected or skipped with an explicit reason. |
| 1.9 | Detached HEAD is represented explicitly rather than reported as a branch. |
| 1.10 | Every git process uses structured arguments through `std::process::Command`; no shell string is constructed. |

### AC-2: Parsing and deterministic entity processing

| ID | Criterion |
|----|-----------|
| 2.1 | `.ts` snapshots use the TypeScript grammar and `.tsx` snapshots use the TSX grammar. |
| 2.2 | Named function declarations and named methods are extracted with kind, name, path, and staged line span. |
| 2.3 | An entity qualifies when its staged span overlaps an added/new-side range or its paired base span overlaps a deleted/old-side range. Wholly deleted entities remain unsupported and their lines stay unmapped. |
| 2.4 | All supported entities are processed in deterministic path/line order (not a randomly or heuristically selected single entity). |
| 2.5 | The same review snapshot always processes the same entities in the same order. |
| 2.6 | A syntax error overlapping a candidate entity is reported; the tool does not derive confident evidence from that invalid region. |
| 2.7 | If no supported entity qualifies, the command explains the limit and writes no comprehension receipt. |
| 2.8 | Interfaces, aliases, enums, anonymous callbacks, and whole classes are not silently treated as supported Phase 0 entities. |
| 2.9 | When the staged change exceeds 3 supported entities or 150 added-plus-deleted TypeScript lines, the tool refuses to process, asks the developer to re-stage a smaller coherent change, and writes no receipt. The 3/150 budgets are product-experiment defaults, not risk-science benchmarks. |
| 2.10 | One Behavior Card per entity; therefore 1-3 cards per session within the pilot budget. |
| 2.11 | Every added and deleted TypeScript diff line is counted as mapped to a supported staged/base entity or unmapped. The terminal and receipt expose both counts; completed cards never imply coverage of unmapped lines. |

### AC-3: Conservative syntax-delta evidence

| ID | Criterion |
|----|-----------|
| 3.1 | A changed declared signature produces exact before/after signature evidence. |
| 3.2 | Added or removed call expressions produce callee text, direction, and staged line evidence. |
| 3.3 | Added or removed branch/loop conditions produce source-derived condition evidence. |
| 3.4 | Added `throw` or `catch` constructs produce error-related evidence without claiming complete error flow. |
| 3.5 | Unsupported body changes produce the generic changed-hunk fallback, not fabricated semantic evidence. |
| 3.6 | Evidence is diff-first and source-grounded: changed lines plus conservative syntax delta are shown before the card prompt. No summary-first UI, whole-codebase graph, or hidden AI judgment. |
| 3.7 | Every evidence item has a base/staged fixture pair and expected output. |
| 3.8 | The accepted fixture corpus has no false positive evidence; uncertain cases fall back or stop. |

### AC-4: Behavior Card and diff-first interaction

| ID | Criterion |
|----|-----------|
| 4.1 | The terminal shows each entity, staged location, changed lines, and conservative syntax delta before the card prompt for that entity. |
| 4.2 | Card template selection follows this order: error, signature, branch, call, fallback. |
| 4.3 | The card collects GIVEN (`{arguments: object|array|null, state_note: string|null}`), WHEN (`{entity: string, invocation: string}`), THEN (`{kind: return_value|thrown_error|side_effect, value: JSON value|string|null}`), BECAUSE (one or two causal sentences), and IMPACT (one caller consequence or risk). |
| 4.4 | The card is rendered in a typed, compact form in the terminal and stored as structured JSON. It is not labeled correct or incorrect in Phase 0. |
| 4.5 | Show more code prints the full staged entity plus bounded local context and then prompts again. |
| 4.6 | Skip exits for that entity without implying that review passed. |
| 4.7 | Invalid menu input re-prompts safely. |
| 4.8 | The tool works without ANSI color in a non-interactive terminal. |
| 4.9 | The submitted card is persisted before source-check feedback and is not rewritten afterward in Phase 0. |
| 4.10 | One card per entity; 1-3 cards per session within the pilot budget. |

### AC-4b: Narrow source check

| ID | Criterion |
|----|-----------|
| 4b.1 | A check is eligible only when JSON arguments evaluate one allowlisted atomic branch predicate (boolean parameter, `!parameter`, or parameter-to-JSON-literal comparison with `===`, `!==`, `<`, `<=`, `>`, or `>=`) ending in a JSON-scalar literal return or a throw with a literal message. |
| 4b.2 | The receipt enum result is `source_derived_match`, `source_derived_mismatch`, or `not_checkable`. The terminal UI shows human-readable labels (`source-derived match`, `source-derived mismatch`, `not checkable`). |
| 4b.3 | No source check is ever labeled correct, incorrect, or runtime verified; a match concerns the displayed local branch only and never proves whole-function reachability. |
| 4b.4 | Method state, property access, helper calls, coercive equality, mutation, compound predicates, non-literal endpoints, and side-effect-only cards report `not_checkable` and stay ungraded. |

### AC-4c: Optional probe spec

| ID | Criterion |
|----|-----------|
| 4c.1 | A probe spec is eligible only for an exported top-level function whose JSON arguments map unambiguously to declared parameter order (no receiver, destructuring, rest/default ambiguity, missing, or extra values) and whose THEN predicts a return or throw. |
| 4c.2 | Every eligible probe spec is `{status: draft_unexecuted, invoke: {entity, arguments}, expect: {kind, value}}`. Ineligible cards produce `{status: not_available, reason}`. |
| 4c.3 | Phase 0 never writes a probe spec into the project, runs it, treats it as a test, or includes a `framework_hint` or code text. |
| 4c.4 | Side-effect predictions (THEN kind = `side_effect`) are not eligible without a later adapter. |
| 4c.5 | The probe spec may be printed or stored alongside the receipt. |

### AC-5: Versioned local comprehension receipt and privacy

| ID | Criterion |
|----|-----------|
| 5.1 | Each session creates one JSON comprehension receipt matching PRD.md Section 7, covering 1-3 entities within the pilot budget. |
| 5.2 | The receipt includes schema version, UTC timestamp, duration, session `card_status` (complete/partial/skipped), session scope counts (supported entity count plus total, mapped, and unmapped changed TS lines), base commit, branch/detached state, staged paths, staged-diff hash, an entry for every supported entity (kind, name, path, span, evidence, behavior card with template/given `{arguments, state_note}`/when `{entity, invocation}`/then `{kind, value}`/because/impact, source check with status `source_derived_match`/`source_derived_mismatch`/`not_checkable` and observed_endpoint when present, probe spec with status `draft_unexecuted`/`not_available` and invoke/expect or reason, show-code state, per-entity action), and privacy caveat. |
| 5.3 | `behavior_card` is present only for entities whose action is `complete`. No correctness field exists. `card_status` describes supported-entity card completion only; it never implies diff coverage or a review pass, and it never suppresses the unmapped-line count. |
| 5.4 | The filename is path-safe and collision-resistant across supported platforms. |
| 5.5 | `.skia/` is created when needed and remains gitignored. |
| 5.6 | Receipt write failures are visible and return non-zero. |
| 5.7 | No code, diff, receipt, card, probe spec, telemetry, update check, or identifier leaves the machine. A network-denial test or equivalent verification documents this. |
| 5.8 | No process execution beyond read-only git occurs. No project file writes occur. No package commands are run. |
| 5.9 | `changed_ts_lines` equals `mapped_changed_ts_lines + unmapped_changed_ts_lines` in every receipt. |

### AC-6: Test corpus and end-to-end proof

| ID | Criterion |
|----|-----------|
| 6.1 | At least 20 base/staged fixtures cover every evidence kind, fallback, TSX, overloads, generics, decorators, nested functions, anonymous callbacks, syntax errors, new files, unsupported entities, and over-budget changes. Fixtures include expected source-check eligibility, expected probe spec eligibility, and expected budget status. |
| 6.2 | Fixtures cover every allowlisted predicate operator with JSON arguments, JSON-scalar return endpoints, and throws with literal messages. Method state, property access, helper calls, coercive equality, mutation, compound predicates, non-literal endpoints, and side effects verify `not_checkable`. |
| 6.3 | Every eligible exported top-level function fixture produces `{status: draft_unexecuted, invoke, expect}`. Methods, destructured/rest/default-ambiguous signatures, missing/extra arguments, and side effects produce `{status: not_available, reason}`. No probe spec contains source code, a `framework_hint`, or code text or causes a project write/package command. |
| 6.4 | Temporary-repository tests cover index-vs-working-tree isolation, detached HEAD, path edge cases, unsupported statuses, stable diff hashing, budget refusal (over 3 entities or 150 lines), and no process execution beyond read-only git. |
| 6.5 | Golden interaction tests cover fill card, show-more-code, skip, invalid input, source-check feedback after card persistence, multi-entity sessions, budget refusal, no supported entity, and write failure. |
| 6.6 | Golden comprehension receipts normalize timestamp and duration while preserving diff hash, total/mapped/unmapped line counts, per-entity entries (evidence, card, source check, probe spec, action), and session `card_status`. |
| 6.7 | All tests run offline and deterministically. |
| 6.8 | Once source exists, CI runs formatting, linting, tests, and a dependency/license check on pull requests. CI is not added before there is code to exercise. |

### AC-7: Behavioral pilot

| ID | Criterion |
|----|-----------|
| 7.1 | The manual command is dogfooded for four weeks before any automatic hook is added. |
| 7.2 | Participants explicitly consent before sharing receipt-derived metrics; default operation remains local with no telemetry. |
| 7.3 | The pilot compares raw-diff-only (control) versus Behavior Card. A third plain-pseudocode arm may be added if sample size allows. |
| 7.4 | The pilot records code-open/scroll behavior, card completion rate, skip rate, repeat use, maintenance/change-explanation performance, friction (duration, qualitative reports), budget-refusal and restaging behavior, unmapped-line ratio, and abandonment reasons. |
| 7.5 | A blinded manual sample checks whether cards contain causal content rather than copied syntax. |
| 7.6 | The decision memo applies the thresholds and kill criteria in PRD.md Sections 8-9 without moving the goalposts. Kill if ritual cards, no behavioral gain over raw-diff-only, or excessive friction. |

---

## 4. Implementation order

### Step 0: Resolve blockers

- Decide the project name before any package, binary, registry entry,
  or public launch.
- Confirm the comprehension receipt privacy model and pilot consent process.
- Freeze the supported Phase 0 file/status matrix.

### Step 1: Scaffold and git snapshot tests

Create the minimal Cargo workspace and implement AC-1 first. A review
question is worthless if it is bound to the wrong bytes.

### Step 2: Parser and entity fixtures

Implement AC-2 using pure base/staged fixtures. Keep the supported
entity set narrow until it is reliable.

### Step 3: Evidence, Behavior Card templates, and source checks

Implement AC-3, AC-4, AC-4b, and AC-4c together so every card prompt
is backed by visible source-derived evidence and every source check
is truthfully labelled. Implement probe spec generation as structured
JSON with explicit eligibility rules and no source code.

### Step 4: Interaction and comprehension receipt

Implement AC-5 and golden terminal tests. Do not add card grading,
hooks, or network behavior. Verify probe spec eligibility rules and
no project writes.

### Step 5: Harden and automate tests

Complete AC-6, publish the fixture corpus, and add CI only after the
repository contains runnable code and tests.

### Step 6: Dogfood before distribution

Run AC-7 with the manual command. Publish a decision memo that either:

- proceeds to an opt-in non-blocking hook;
- changes the interaction based on observed failure modes; or
- stops the project because the behavioral wedge did not hold.

---

## 5. Definition of Phase 0 done

Phase 0 is done only when all mechanical acceptance criteria pass and
the behavioral pilot reaches a documented proceed/pivot/stop decision.
A green test suite alone is not product validation.

Package publication, installation scripts, badges, launch campaigns,
additional languages, and the name `Skia` itself are outside the done
definition until the name and adoption decisions are resolved. No
probe spec may be treated as a passed test, run, or written into the
project.

---

## 6. Explicit exclusions

This plan contains no person-hour estimates, AI implementation-time
estimates, week-by-week delivery promises, adoption claims, or
performance guarantees. It does not authorize intent inference,
type-flow analysis, complete error-flow analysis, pattern intelligence,
SARIF, plugins, LLM judging, CI review comments, a full-codebase
semantic graph, arbitrary TypeScript execution, project file writes
beyond the comprehension receipt, package command execution, source
code generation, or treating a probe spec as a run, passed, or
executed test.
