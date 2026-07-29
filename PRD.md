# Skia -- Product Requirements Document

**Product:** Skia -- local evidence-driven review checkpoint
**Status:** Documentation-only. No runnable CLI exists. This PRD
describes a proposed product, not a shipping one.
**Version:** PRD v2 (repositions concept from autonomous semantic
reviewer to local review checkpoint)

---

## 1. Product thesis

AI-assisted coding tools can increase output faster than developers
absorb the code. The product risk is not simply defective code; it is
code that no human can explain well enough to maintain.

Most review tools optimize for another machine-generated verdict:
findings, comments, summaries, or graphs. Those may improve detection,
but they do not prove that the author inspected or understood the
change. Skia proposes a different product primitive: a local
comprehension checkpoint.

For one entity in a staged TypeScript diff, Skia surfaces structural
evidence about the change and asks the developer to explain a causal
property in their own words: what changed, how control or data moves
through it, what can fail, or what a caller now observes. Phase 0 does
not use an LLM to grade the explanation and does not claim the code is
correct. It records the interaction in a local receipt bound to the
staged diff.

The product hypothesis is behavioral: a small amount of targeted
friction can create a repeatable read-explain-ship habit. The first
milestone is not feature breadth. It is evidence that developers
inspect code they would otherwise have shipped on autopilot.

---

## 2. Target user and jobs-to-be-done

### Primary user: AI-assisted developer

An individual developer who uses AI coding assistants (e.g., Copilot,
Cursor, Claude Code) to generate a significant portion of their code.
They stage and commit diffs that contain code they did not write
line-by-line and may not have fully read.

**Job-to-be-done:** "When I stage an AI-assisted TypeScript change,
make me inspect one meaningful changed behavior and explain it in my
own words before I move on -- without pretending that this replaces a
full code review."

### Secondary users are deferred

Team leads may eventually value shared or aggregated review evidence,
but Phase 0 receipts are local and gitignored. Skia must not claim a
team-level assurance benefit until teams test whether these receipts
are trustworthy, useful, and safe to share.

### What Skia is not for

Skia is not for developers who write every line by hand and already
read their own diffs carefully. It is not a replacement for human
code review. It is not a linter or type checker. It is a checkpoint,
not a gate.

---

## 3. Proposed workflow

The following workflow is the target for Phase 0. It has not been
implemented.

1. The developer stages changes with `git add`.
2. The developer runs `skia review`.
3. Skia compares the git index with `HEAD`, reads the staged version of
   changed `.ts` and `.tsx` files from the index, and computes a hash
   for the exact staged diff.
4. Skia parses the base and staged versions with Tree-sitter and maps
   changed hunks to functions or methods.
5. Skia selects exactly one changed entity using a deterministic
   strategy and derives one or two structural evidence items, such as
   a new call, added branch, or changed signature.
6. Skia shows the entity, evidence, and changed source context before
   asking a causal question from the catalogue in Section 6.
7. The developer chooses one action:
   - **Answer** -- write a one-to-three-sentence explanation.
   - **Show more code** -- inspect the full entity plus bounded local
     context, then answer or skip.
   - **Skip** -- continue without an explanation; the skip is recorded.
8. Skia records the prompt, response, show-code action, duration, and
   staged-diff hash in a local JSON receipt. It does not grade free
   text in Phase 0.
9. The session ends: one entity, one question, one receipt.

### What the workflow does not do

- It does not block a commit or claim that the code passed review.
- It does not scan the whole codebase, resolve a complete call graph,
  or analyze changes outside the staged set.
- It does not infer intent, prove type flow, or determine error-path
  completeness.
- It does not use an LLM or send code, prompts, or receipts over the
  network.
- It does not share receipts with a team unless a later, separately
  validated design adds an explicit opt-in mechanism.

---

## 4. Functional requirements

### FR-1: Staged snapshot and diff reading

Skia must inspect the git index, not the working-tree copy, so
unstaged edits cannot leak into the review. It must obtain the staged
diff, changed file paths, changed line ranges, the staged file content,
and the corresponding `HEAD` content when available. All git commands
must use structured process arguments rather than a shell string.
Phase 0 supports added and modified `.ts`/`.tsx` files; renames,
deletions, submodules, and binary files must fail or skip explicitly.

### FR-2: Base and staged TypeScript parsing

Skia must parse the base and staged snapshots of supported TypeScript
files with the matching Tree-sitter TypeScript or TSX grammar. It must
report syntax-error nodes and avoid producing evidence that depends on
an invalid region. Partial parsing may still support unaffected
entities, but silent recovery is not acceptable.

### FR-3: Changed-entity extraction and selection

Skia must identify named function declarations and named methods whose
staged source span overlaps a changed hunk. Phase 0 deliberately omits
classes as whole entities, interfaces, aliases, and enums because they
do not support the initial causal-question catalogue. If multiple
entities qualify, Skia must choose one reproducibly using a documented
risk proxy, initially the entity with the most changed lines and then
file/line order as a tie-breaker.

### FR-4: Evidence derivation and question selection

Skia must compare the base and staged syntax for the selected entity
and derive only evidence it can support directly: changed signature,
new or removed call expression, added or removed branch, added throw,
or added catch. It must select one applicable causal question template
from Section 6. Evidence is deterministic; the developer's free-text
explanation is not automatically judged.

### FR-5: Diff-first terminal interaction

Skia must present the entity, staged source location, changed lines,
and structural evidence before the question. It must offer three
actions: answer, show more code, and skip. An answer is one to three
sentences. Skia must not label a free-text explanation correct or
incorrect in Phase 0. On request, it displays the full staged entity
plus bounded local context and records that action.

### FR-6: Local receipt writing

Skia must write a JSON receipt to `.skia/receipts/` after each
session. The receipt schema is defined in Section 7 and must bind the
interaction to a hash of the staged diff. It records evidence,
response, whether more code was shown, duration, and skip state. The
`.skia/` directory is gitignored and the tool makes no network calls.

### FR-7: Non-git graceful failure

Outside a git repository, Skia must print a clear error and exit
non-zero. With no supported staged TypeScript changes, it must explain
that there is nothing to review, exit successfully, and write no
receipt.

---

## 5. Non-functional requirements

### NFR-1: Single-threaded, synchronous

Phase 0 must be single-threaded and synchronous. No async runtime,
no background tasks, no file watchers. The tool runs, interacts, and
exits.

### NFR-2: No external network calls

Skia must not make any network calls. No telemetry, no update checks,
no LLM API calls. All processing is local.

### NFR-3: Reproducible selection

Given the same staged diff, Skia must select the same entity, derive
the same evidence, and ask the same question. Receipt timestamps,
durations, and user responses are session-specific; the staged-diff
hash allows a receipt to be traced to the reviewed snapshot.

### NFR-4: Minimal dependencies

Phase 0 must use the smallest practical set of Rust crates. No
plugin frameworks, no async runtimes, no serialization libraries
beyond what is needed for JSON receipt output.

### NFR-5: Honest failure

Unsupported statuses, entities, or parse regions must produce a clear
limitation message. Skia must never turn uncertainty, a skip, or an
internal failure into language that implies the change passed review.

---

## 6. Question catalogue

Question selection is deterministic, but answers are open-ended. The
catalogue ties a directly observed syntax delta to a causal explanation
prompt. Phase 0 records the explanation; it does not score it.

### Q-ERROR-1: Failure-path change

**Trigger:** The staged entity adds a `throw_statement`, `catch_clause`,
or a call inside a newly added catch block.

**Evidence shown:** The added error-related construct and changed lines.

**Question:** "Explain the failure path introduced or changed here.
What triggers it, where is it handled, and what can the caller observe?"

### Q-SIG-1: Signature change

**Trigger:** Parameters or the declared return type differ between the
base and staged entity.

**Evidence shown:** The before and after signatures.

**Question:** "Explain the contract change to `{name}`. Which callers
or consumers may need to adapt, and what breaks if they do not?"

Skia does not claim to identify every caller in Phase 0.

### Q-BRANCH-1: Branch change

**Trigger:** A staged hunk adds or removes an `if`, `switch`, ternary,
or loop condition inside the selected entity.

**Evidence shown:** The changed condition and its local branch body.

**Question:** "What input or state reaches this branch, what happens
on that path, and what result or side effect leaves the entity?"

### Q-CALL-1: Call change

**Trigger:** A call expression is added or removed inside the selected
entity.

**Evidence shown:** The callee text, add/remove direction, and changed
line.

**Question:** "Explain why `{callee}` is now called (or no longer
called) here. What data reaches it, what comes back, and what changes
for the caller of `{name}`?"

### Q-CHANGE-1: Fallback explanation

**Trigger:** The entity changed but none of the higher-priority syntax
deltas apply.

**Evidence shown:** The changed hunks within the entity.

**Question:** "In one to three sentences, explain the behavior changed
inside `{name}` and name one input or state that exercises it."

### Selection order

When more than one trigger applies, Phase 0 selects the first match in
this order: Q-ERROR-1, Q-SIG-1, Q-BRANCH-1, Q-CALL-1, Q-CHANGE-1. This
order is a testable design choice, not a claim that it reflects risk.

### Catalogue expansion criteria

A new question may be added only when:

1. Its trigger and displayed evidence are deterministic and
   AST-derivable.
2. It asks for a causal explanation, not a trivia fact or automated
   quality verdict.
3. It can be exercised by a base/staged fixture pair with an expected
   trigger and prompt.
4. Dogfood or user evidence shows that the question is useful enough
   to justify additional friction.

---

## 7. Receipt schema

Each session produces one local JSON receipt in `.skia/receipts/`.
The proposed schema is intentionally an interaction record, not a
certificate that the change is correct.

```json
{
  "schema_version": 1,
  "timestamp": "2026-01-15T10:32:00Z",
  "duration_ms": 47000,
  "git": {
    "base_commit": "abc123def456",
    "branch": "feature/email-normalize",
    "staged_diff_sha256": "4c6d...f921",
    "staged_files": ["src/utils/email.ts"]
  },
  "entity": {
    "kind": "function",
    "name": "normalizeEmail",
    "file": "src/utils/email.ts",
    "start_line": 12,
    "end_line": 24
  },
  "evidence": [
    {
      "kind": "added_branch",
      "line": 13,
      "summary": "Added early return when email is falsy"
    }
  ],
  "question": {
    "id": "Q-BRANCH-1",
    "text": "What input reaches this branch, what happens on that path, and what result leaves the entity?"
  },
  "response": {
    "action": "answer",
    "explanation": "Undefined input now returns an empty string, so callers can no longer distinguish missing from empty.",
    "showed_code": true
  }
}
```

### Required semantics

| Field | Description |
|-------|-------------|
| `schema_version` | Integer schema version; starts at 1. |
| `timestamp` | UTC completion time. Filenames use a compact, path-safe UTC form. |
| `duration_ms` | Time from first display of evidence to answer or skip. |
| `git.base_commit` | `HEAD` used as the base snapshot. |
| `git.staged_diff_sha256` | SHA-256 of the exact raw staged diff reviewed. |
| `git.branch` | Current branch name, including detached-HEAD handling. |
| `git.staged_files` | Supported staged paths included in the review snapshot. |
| `entity` | Kind, name, staged path, and staged source span. |
| `evidence` | One or more deterministic AST-derived change facts; never a quality verdict. |
| `question.id` | Catalogue identifier from Section 6. |
| `question.text` | Prompt shown to the developer. |
| `response.action` | `answer` or `skip`. |
| `response.explanation` | Free text when the user answers; omitted on skip. |
| `response.showed_code` | Whether the user requested expanded code context. |

Receipt filenames use
`.skia/receipts/{YYYYMMDDTHHMMSSZ}-{diffHashPrefix}-{entitySlug}.json`.
The implementation must sanitize entity names for cross-platform file
systems. Receipts are gitignored and contain source-derived summaries;
users should treat them as potentially sensitive local data.

---

## 8. Validation metrics

Phase 0 has two separate bars: mechanical correctness and behavioral
usefulness. Local receipts are not uploaded by default; pilot
participants must explicitly export or share aggregate results.

### Mechanical bar

| Metric | Proposed bar |
|--------|--------------|
| Supported-file snapshot correctness | Staged content, not working-tree content, is used in every fixture. |
| Entity selection accuracy | 100% on the accepted base/staged fixture corpus. |
| Evidence trigger accuracy | 100% precision on the accepted fixture corpus; unsupported cases must fall back rather than invent evidence. |
| Determinism | Same staged diff produces the same entity, evidence, prompt, and diff hash. |
| Receipt validity | Every generated receipt validates against the versioned schema. |

Passing a curated fixture set is necessary, not proof of real-world
reliability. The fixture corpus must include TSX, overloads, generics,
decorators, nested functions, anonymous callbacks, syntax errors,
new files, unstaged edits beside staged edits, and paths with spaces.

### Behavioral pilot bar

Run a four-week opt-in dogfood pilot before adding hooks, packages, or
additional languages. Track:

- answer, show-more-code, and skip rates;
- median time from evidence display to response;
- repeat use by participant and week;
- explanation length and a blinded manual sample for causal depth;
- whether participants report opening or reading code they otherwise
  would have skipped;
- uninstall or abandonment reasons.

Initial decision thresholds, chosen to make the hypothesis falsifiable:

- skip rate below 70% by week 4;
- at least 50% of pilot users still use the manual command in week 4;
- at least 40% report that the checkpoint changed what they inspected;
- no evidence that the tool reviews unstaged or stale content.

These are product decision thresholds, not externally validated
benchmarks. A later controlled test should compare maintenance or
change-explanation performance with and without the checkpoint.

---

## 9. Kill or pivot criteria

Stop, redesign, or narrow the project if any of the following holds:

1. **Snapshot integrity is unreliable.** The tool cannot consistently
   bind questions and receipts to the exact staged content.
2. **Useful evidence requires pretending syntax is semantics.** If
   causal prompts cannot be grounded without a compiler, LSP, or LLM,
   add that dependency explicitly or abandon the claim.
3. **Users route around the friction.** Skip rate remains at or above
   70%, fewer than half of pilot users return in week 4, or the prompt
   becomes a ritual response that does not require inspection.
4. **No behavioral signal appears.** Pilot users do not inspect more
   code, cannot explain changes better, or report only annoyance.
5. **The wedge is not distinct.** Existing explanation-gate tools
   deliver equal or better behavior change with less setup, leaving no
   reason to adopt this project.
6. **The name remains unresolved.** Do not publish packages or launch
   publicly under a name dominated by Google's Skia project.

---

## 10. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Open-ended prompts become ritual answers | High | High | Show evidence first, sample explanations manually, measure repeat behavior, and enforce kill criteria. |
| Tree-sitter evidence is mistaken for semantic proof | High | High | Limit claims to syntax deltas; fail or fall back on unsupported cases; add compiler, LSP, or LLM support only as an explicit later decision. |
| Working-tree content contaminates a staged review | Medium | High | Read snapshots from the git index and bind receipts to the staged-diff hash. |
| Users skip or abandon the tool | High | High | Start with a manual command, record friction, and add hooks only after four-week retention evidence. |
| Receipts expose sensitive design information | Medium | Medium | Keep them local and gitignored, document their contents, and do not add automatic upload. |
| Name collision with Google's Skia prevents discovery | High | High | Resolve the rename before package publication or launch. |
| A broader review tool absorbs the feature | Medium | High | Compete on verified behavior change and a narrow habit loop, not feature breadth. |

---

## 11. Phased roadmap

### Phase 0 (proposed, not started)

TypeScript, staged snapshot integrity, function/method extraction,
syntax-delta evidence, causal question templates, diff-first terminal
interaction, local receipts, fixture/golden tests, and a four-week
manual-command dogfood pilot. No hook ships before the pilot meets the
behavioral thresholds in Section 8.

### Phase 1 (conditional on Phase 0 evidence)

Refine evidence and prompts using pilot failures. Evaluate an opt-in
non-blocking hook and a privacy-preserving local summary. Unstaged or
branch-diff support is allowed only if snapshot identity remains clear.
Team-visible receipts require a separate privacy and trust design.

### Phase 2 (conditional on Phase 1 evidence)

Evaluate additional entity types (enums, decorators, exported
variables). Evaluate whether the checkpoint concept generalizes to
other languages. No polyglot support without evidence.

### Beyond Phase 2

No features are planned beyond Phase 2. Inferred intent, type-flow
analysis, error-path completeness, pattern intelligence, SARIF,
plugins, LLM judging, CI PR comments, and full-codebase semantic
graphs are explicitly deferred until evidence from prior phases
justifies them.
