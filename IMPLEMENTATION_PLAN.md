# Skia -- Phase 0 Implementation Plan

> **Planning only.** The repository has no Cargo workspace, source
> code, tests, package, or runnable command. This plan defines the
> smallest implementation that can test the product hypothesis; it is
> not evidence that the product works.

---

## 1. Phase 0 outcome

Phase 0 is complete only when a developer can run one manual command
against a staged TypeScript diff, inspect evidence from one changed
function or method, answer or skip one causal question, and receive a
local receipt bound to the exact staged snapshot.

The implementation must answer two separate questions:

1. **Mechanical:** Can the tool review the correct staged bytes and
   derive supported syntax-delta evidence without inventing semantics?
2. **Behavioral:** Does the interaction cause developers to inspect and
   explain code they would otherwise have shipped without reading?

Feature breadth is not a success criterion.

---

## 2. Deliverables

1. One synchronous Rust binary exposing `skia review` as the proposed
   command name.
2. Git index/base snapshot reader with staged-diff hashing.
3. TypeScript and TSX parser for named functions and methods.
4. Conservative syntax-delta evidence extractor.
5. Ordered causal-question catalogue.
6. Diff-first terminal interaction.
7. Versioned local receipt writer.
8. Pure fixtures, temporary-git-repository tests, and golden
   interaction/receipt tests.
9. A four-week manual-command dogfood pilot and decision memo.

No hook, installer, package publication, additional language, LLM,
CI review bot, or semantic graph is part of Phase 0.

---

## 3. Acceptance criteria

### AC-1: Git snapshot integrity

| ID | Criterion |
|----|-----------|
| 1.1 | Outside a git repository, the command prints a clear error and exits non-zero. |
| 1.2 | With no staged supported files, the command exits cleanly without a receipt. |
| 1.3 | Added and modified `.ts`/`.tsx` paths are read from a NUL-delimited index status command. |
| 1.4 | The staged file is read from the index; adjacent unstaged edits in the working tree never appear in displayed code, evidence, prompts, or receipts. |
| 1.5 | The base snapshot is read from `HEAD`; a new file uses an empty base. |
| 1.6 | The exact raw staged diff bytes are hashed with SHA-256, and the same index state yields the same hash. |
| 1.7 | Paths with spaces and non-ASCII characters are preserved. |
| 1.8 | Renames, deletions, binary files, submodules, and unsupported status codes are rejected or skipped with an explicit reason. |
| 1.9 | Detached HEAD is represented explicitly rather than reported as a branch. |
| 1.10 | Every git process uses structured arguments through `std::process::Command`; no shell string is constructed. |

### AC-2: Parsing and deterministic entity selection

| ID | Criterion |
|----|-----------|
| 2.1 | `.ts` snapshots use the TypeScript grammar and `.tsx` snapshots use the TSX grammar. |
| 2.2 | Named function declarations and named methods are extracted with kind, name, path, and staged line span. |
| 2.3 | An entity qualifies only when its staged span overlaps a changed staged-line range. |
| 2.4 | When several entities qualify, the entity with the most changed lines is selected; path and starting line break ties. |
| 2.5 | The same review snapshot always selects the same entity. |
| 2.6 | A syntax error overlapping a candidate entity is reported; the tool does not derive confident evidence from that invalid region. |
| 2.7 | If no supported entity qualifies, the command explains the limit and writes no receipt. |
| 2.8 | Interfaces, aliases, enums, anonymous callbacks, and whole classes are not silently treated as supported Phase 0 entities. |

### AC-3: Conservative syntax-delta evidence

| ID | Criterion |
|----|-----------|
| 3.1 | A changed declared signature produces exact before/after signature evidence. |
| 3.2 | Added or removed call expressions produce callee text, direction, and staged line evidence. |
| 3.3 | Added or removed branch/loop conditions produce source-derived condition evidence. |
| 3.4 | Added `throw` or `catch` constructs produce error-related evidence without claiming complete error flow. |
| 3.5 | Unsupported body changes produce the generic changed-hunk fallback, not fabricated semantic evidence. |
| 3.6 | Every evidence item has a base/staged fixture pair and expected output. |
| 3.7 | The accepted fixture corpus has no false positive evidence; uncertain cases fall back or stop. |

### AC-4: Causal question and diff-first interaction

| ID | Criterion |
|----|-----------|
| 4.1 | The terminal shows the selected entity, staged location, changed lines, and evidence before the prompt. |
| 4.2 | Question selection follows this order: error, signature, branch, call, fallback. |
| 4.3 | The prompt asks for a causal explanation of behavior, data/control movement, caller impact, or failure -- never a trivia count. |
| 4.4 | Answer accepts a one-to-three-sentence free-text explanation and does not label it correct or incorrect. |
| 4.5 | Show more code prints the full staged entity plus bounded local context and then prompts again. |
| 4.6 | Skip exits without implying that review passed. |
| 4.7 | Invalid menu input re-prompts safely. |
| 4.8 | The tool works without ANSI color in a non-interactive terminal. |

### AC-5: Versioned local receipt and privacy

| ID | Criterion |
|----|-----------|
| 5.1 | Answer and skip sessions each create one JSON receipt matching PRD.md Section 7. |
| 5.2 | The receipt includes schema version, UTC timestamp, duration, base commit, branch/detached state, staged paths, staged-diff hash, entity, evidence, question, response action, and show-code state. |
| 5.3 | `response.explanation` is present only for an answer. No correctness field exists in Phase 0. |
| 5.4 | The filename is path-safe and collision-resistant across supported platforms. |
| 5.5 | `.skia/` is created when needed and remains gitignored. |
| 5.6 | Receipt write failures are visible and return non-zero. |
| 5.7 | No code, diff, receipt, telemetry, update check, or identifier leaves the machine. A network-denial test or equivalent verification documents this. |

### AC-6: Test corpus and end-to-end proof

| ID | Criterion |
|----|-----------|
| 6.1 | At least 20 base/staged fixtures cover every evidence kind, fallback, TSX, overloads, generics, decorators, nested functions, anonymous callbacks, syntax errors, new files, and unsupported entities. |
| 6.2 | Temporary-repository tests cover index-vs-working-tree isolation, detached HEAD, path edge cases, unsupported statuses, and stable diff hashing. |
| 6.3 | Golden interaction tests cover answer, show-more-code, skip, invalid input, no supported entity, and write failure. |
| 6.4 | Golden receipts normalize timestamp and duration while preserving diff hash, evidence, prompt, and response fields. |
| 6.5 | All tests run offline and deterministically. |
| 6.6 | Once source exists, CI runs formatting, linting, tests, and a dependency/license check on pull requests. CI is not added before there is code to exercise. |

### AC-7: Behavioral pilot

| ID | Criterion |
|----|-----------|
| 7.1 | The manual command is dogfooded for four weeks before any automatic hook is added. |
| 7.2 | Participants explicitly consent before sharing receipt-derived metrics; default operation remains local with no telemetry. |
| 7.3 | The pilot records answer/show/skip rates, duration, repeat use, and abandonment reasons. |
| 7.4 | A blinded manual sample checks whether explanations contain causal content rather than copied syntax. |
| 7.5 | The decision memo applies the thresholds and kill criteria in PRD.md Sections 8-9 without moving the goalposts. |

---

## 4. Implementation order

### Step 0: Resolve blockers

- Decide the project name before any package, binary, registry entry,
  or public launch.
- Confirm the receipt privacy model and pilot consent process.
- Freeze the supported Phase 0 file/status matrix.

### Step 1: Scaffold and git snapshot tests

Create the minimal Cargo workspace and implement AC-1 first. A review
question is worthless if it is bound to the wrong bytes.

### Step 2: Parser and entity fixtures

Implement AC-2 using pure base/staged fixtures. Keep the supported
entity set narrow until it is reliable.

### Step 3: Evidence and question catalogue

Implement AC-3 and AC-4 together so every prompt is backed by visible
source-derived evidence.

### Step 4: Interaction and receipt

Implement AC-5 and golden terminal tests. Do not add grading, hooks, or
network behavior.

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
definition until the name and adoption decisions are resolved.

---

## 6. Explicit exclusions

This plan contains no person-hour estimates, AI implementation-time
estimates, week-by-week delivery promises, adoption claims, or
performance guarantees. It does not authorize intent inference,
type-flow analysis, complete error-flow analysis, pattern intelligence,
SARIF, plugins, LLM judging, CI review comments, or a full-codebase
semantic graph.