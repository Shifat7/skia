# Skia -- Product Requirements Document

**Product:** Skia -- local evidence-driven comprehension checkpoint
**Status:** Documentation-only. No runnable CLI exists. This PRD
describes a proposed product, not a shipping one.
**Version:** PRD v3 (adds bounded multi-entity review, typed Behavior
Cards, narrow source checks, structured probe specs, and versioned
comprehension receipts)

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

For each supported changed entity in a staged TypeScript diff (up to
provisional pilot budgets), Skia surfaces structural evidence about the
change and asks the developer to fill a typed Behavior Card that predicts
the change's behavior: a concrete input/state example (GIVEN), the
auto-filled call context (WHEN), a predicted observable outcome typed as
a return value, thrown error, or side effect (THEN), one or two causal
sentences tracing the relevant branch or call (BECAUSE), and one
caller/user-visible consequence or risk (IMPACT). Phase 0 does not use an
LLM to grade the card and does not claim the code is correct. It performs
a narrow source check only when a small supported branch predicate can
be evaluated from the card's JSON arguments and ends in a directly
observed JSON-scalar return or throw with a literal message, and records the
interaction in a local comprehension receipt bound to the staged diff.

The product hypothesis is behavioral: a small amount of targeted
friction can create a repeatable read-predict-ship habit. The first
milestone is not feature breadth. It is evidence that developers
inspect code they would otherwise have shipped on autopilot.

### Representation strategy

Raw changed code remains the source of truth. Skia does not replace it
with generated pseudocode: a translation can be shorter while silently
omitting the branch, side effect, or failure path under review. Instead,
Skia uses the typed Behavior Card as a developer-authored prediction
layer anchored to displayed source evidence. If a change exceeds the
pilot budget, the tool asks the developer to re-stage a smaller coherent
unit rather than compressing review debt into a summary. The four-week
pilot compares this approach with raw-diff-only and may add a plain
pseudocode arm if the sample supports it.

---

## 2. Target user and jobs-to-be-done

### Primary user: AI-assisted developer

An individual developer who uses AI coding assistants (e.g., Copilot,
Cursor, Claude Code) to generate a significant portion of their code.
They stage and commit diffs that contain code they did not write
line-by-line and may not have fully read.

**Job-to-be-done:** "When I stage an AI-assisted TypeScript change,
make me inspect each supported changed behavior within the pilot budget
and predict it in a typed Behavior Card before I move on -- without
pretending that this replaces a full code review."

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
5. Skia identifies all supported changed entities and checks the staged
   change against provisional pilot budgets: at most 3 supported
   entities and at most 150 added-plus-deleted TypeScript lines. If either budget
   is exceeded, Skia refuses to summarize or sample away review debt,
   prints a clear message asking the developer to re-stage a smaller
   coherent change, and writes no receipt. The 3-entity and 150-line
   budgets are product-experiment defaults, not risk-science benchmarks.
6. Skia processes every supported changed entity in deterministic
   path/line order (not a randomly or heuristically selected single
   entity). For each entity it derives a conservative syntax delta:
   changed signature, new or removed call expression, added or removed
   branch, or added throw/catch.
7. Skia shows the changed lines plus the conservative syntax delta
   before presenting the Behavior Card prompt. No summary-first UI,
   whole-codebase graph, or hidden AI judgment is used.
8. The developer fills a typed Behavior Card for each supported entity:
   - **GIVEN:** `{ arguments: object|array|null, state_note: string|null }`
     -- one concrete input/state example. JSON-compatible where possible;
     `state_note` is free text only when state is not serializable.
   - **WHEN:** `{ entity: string, invocation: string }` -- auto-filled
     with the selected entity name and call context.
   - **THEN:** `{ kind: return_value|thrown_error|side_effect, value: JSON value|string|null }`
     -- the developer predicts one observable outcome.
   - **BECAUSE:** one or two causal sentences tracing the relevant
     branch or call.
   - **IMPACT:** one caller/user-visible consequence or risk.
9. When the changed branch uses the supported atomic predicate subset,
   its predicate can be evaluated from `given.arguments`, and its
   endpoint returns a JSON scalar literal or throws a literal message,
   Skia performs a local SOURCE
   CHECK and labels the result `source_derived_match`, `source_derived_mismatch`,
   or `not_checkable` in the receipt enum. In the terminal UI, the same
   statuses appear as human-readable labels (`source-derived match`,
   `source-derived mismatch`, `not checkable`). It never calls the
   result runtime verified or correct. Complex behavior stays ungraded;
   even a match concerns the displayed local branch only and does not
   prove whole-function reachability. The submitted card is recorded
   before the source-check result and is not rewritten after feedback
   in Phase 0.
10. For an exported top-level function whose JSON arguments map
    unambiguously to declared parameter order (no receiver,
    destructuring, rest/default ambiguity, missing, or extra values)
    and whose card predicts a return or throw, Skia may produce a
    PROBE SPEC from the
    card: a compact machine-readable experiment suggestion stored as
    structured JSON, never source code. For eligible cards it produces
    `{status: draft_unexecuted, invoke: {entity, arguments}, expect: {kind, value}}`;
    otherwise `{status: not_available, reason}`. It is never written
    into the project, never run, and has no `framework_hint` or code
    text. It may be printed or stored alongside the receipt. Side-effect
    predictions are not eligible without a later adapter.
11. For each entity, the developer chooses one action:
    - **Fill card** -- complete the typed Behavior Card.
    - **Show more code** -- inspect the full entity plus bounded local
      context, then fill or skip.
    - **Skip** -- continue without a card; the skip is recorded for
      that entity.
12. Skia records the session in a local JSON comprehension receipt. The
    receipt records total changed TypeScript lines, changed lines mapped
    to supported entities, unmapped changed TypeScript lines, an entry
    for every supported entity (each card or skip), evidence, behavior
    card, source-check status, probe spec status, show-code action,
    duration, and staged-diff hash. The session `card_status` is
    `complete` (all supported entities filled), `partial` (some filled,
    some skipped), or `skipped` (all skipped). Card status describes
    form completion only; it never implies full diff coverage or a
    passed review. Skia does not grade cards in Phase 0.
13. The session ends: one receipt covering 1-3 entities (within the
    pilot budget).

### What the workflow does not do

- It does not block a commit or claim that the code passed review.
- It does not scan the whole codebase, resolve a complete call graph,
  or analyze changes outside the staged set.
- It does not infer intent, prove type flow, or determine error-path
  completeness.
- It does not execute arbitrary TypeScript or run package commands.
- It does not use an LLM or send code, cards, or receipts over the
  network.
- It does not share receipts with a team unless a later, separately
  validated design adds an explicit opt-in mechanism.
- It does not write a probe spec or any other artifact into the
  project or treat a probe spec as a run, passed, or executed test.
- It does not silently sample away review debt: if the staged change
  exceeds the pilot budget, it asks the developer to re-stage a
  smaller coherent change rather than summarizing or selecting a
  subset.
- It does not claim that card completion covers imports, top-level
  statements, unsupported entities, or other changed lines that could
  not be mapped to a supported function or method; those lines are
  counted explicitly as unmapped.

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

### FR-3: Changed-entity extraction and bounded review unit

Skia must identify named function declarations and named methods whose
staged span overlaps an added/new-side hunk range or whose paired base
span overlaps a deleted/old-side range. Phase 0 deliberately omits
classes as whole entities, interfaces, aliases, and enums because they
do not support the Behavior Card templates. Phase 0 processes every
supported changed entity in deterministic path/line order, but only
when the staged TypeScript change is at or below provisional pilot
budgets of 3 supported entities and 150 added-plus-deleted TypeScript lines. If
either budget is exceeded, Skia must refuse to summarize or sample away
review debt: it prints a clear message asking the developer to re-stage
a smaller coherent change and writes no receipt. The 3-entity and
150-line budgets are product-experiment defaults, not risk-science
benchmarks. One Behavior Card per entity; therefore 1-3 cards per
session. Skia must count every added and deleted TypeScript diff line as
mapped to a supported staged/base entity or unmapped (for example
imports, top-level statements, wholly deleted entities, or unsupported
constructs) and display both counts. Unmapped
lines are never represented as covered by completed cards.

### FR-4: Evidence derivation and Behavior Card template selection

Skia must compare the base and staged syntax for the selected entity
and derive only evidence it can support directly: changed signature,
new or removed call expression, added or removed branch, added throw,
or added catch. Evidence is diff-first and source-grounded: changed
lines plus a conservative syntax delta are shown before the Behavior
Card prompt. Skia must select one applicable Behavior Card template
from Section 6 based on the observed syntax delta. Evidence is
deterministic; the developer's typed card is not automatically judged.

### FR-4b: Narrow source check

Skia may perform a SOURCE CHECK only when `given.arguments` supplies
all parameter values used by one atomic supported branch predicate
(boolean parameter, `!parameter`, or parameter-to-JSON-literal
comparison with `===`, `!==`, `<`, `<=`, `>`, or `>=`) and the selected
branch ends in `return` of a JSON scalar literal or `throw` of a string
literal / `new Error` with a literal message.
Method state, helper calls, property lookups, coercive equality,
mutation, and compound predicates are not checkable. The check compares
the card's THEN prediction with that local endpoint; it does not prove
whole-function reachability or runtime behavior. The receipt enum values
must be `source_derived_match`,
`source_derived_mismatch`, or `not_checkable`. In the terminal UI, the
same statuses appear as human-readable labels (`source-derived match`,
`source-derived mismatch`, `not checkable`). Skia must never call the
result runtime verified or correct. Complex behavior -- including
non-literal returns, conditional logic without a directly observable
endpoint, or side-effect-only cards -- stays `not_checkable` and
ungraded.

### FR-4c: Optional probe spec

A card is probe-eligible only for an exported top-level function whose
JSON arguments map unambiguously to declared parameter order (no
receiver, destructuring, rest/default ambiguity, missing, or extra
values) and whose THEN predicts a return or throw. Skia may then produce
a PROBE SPEC from the card. The probe spec is a compact machine-readable experiment
suggestion stored as structured JSON, never source code. For eligible
cards it produces `{status: draft_unexecuted, invoke: {entity, arguments}, expect: {kind, value}}`;
otherwise `{status: not_available, reason}`. Phase 0 must never write
the probe spec into the project, run it, treat it as a test, or include
a `framework_hint` or code text. It may be printed or stored alongside
the receipt. Side-effect predictions (THEN kind = `side_effect`) are
not eligible without a later adapter.

### FR-5: Diff-first terminal interaction

Skia must present each entity, staged source location, changed lines,
and conservative syntax delta before the Behavior Card prompt for that
entity. It must offer three actions per entity: fill card, show more
code, and skip. Filling a card collects the structured
GIVEN/WHEN/THEN/BECAUSE/IMPACT fields. The card is rendered in a typed,
compact form in the terminal but stored as structured JSON. Skia must
not label a card correct or incorrect in Phase 0. On request, it
displays the full staged entity plus bounded local context and records
that action. The card is recorded before source-check feedback and is
not rewritten afterward in Phase 0. One card per entity; 1-3 cards per
session.

### FR-6: Local comprehension receipt writing

Skia must write a JSON comprehension receipt to `.skia/receipts/`
after each session. The receipt schema is defined in Section 7 and
must bind the interaction to a hash of the staged diff. It records
session scope counts (supported entities, total changed TypeScript
lines, mapped lines, and unmapped lines), an entry for every supported
entity (each card or skip), evidence, behavior card, source-check
status, probe spec status, show-code action, session `card_status`, and
duration. `card_status` reports card completion only, not review
coverage or quality. The `.skia/` directory is gitignored and the tool
makes no network calls.

### FR-7: Non-git graceful failure

Outside a git repository, Skia must print a clear error and exit
non-zero. With no supported staged TypeScript changes, it must explain
that there is nothing to review, exit successfully, and write no
receipt. When the staged change exceeds the pilot budget (more than 3
supported entities or more than 150 added-plus-deleted TypeScript lines), it must
print a clear message asking the developer to re-stage a smaller
coherent change and exit without a receipt.

---

## 5. Non-functional requirements

### NFR-1: Single-threaded, synchronous

Phase 0 must be single-threaded and synchronous. No async runtime,
no background tasks, no file watchers. The tool runs, interacts, and
exits.

### NFR-2: No external network calls

Skia must not make any network calls. No telemetry, no update checks,
no LLM API calls. All processing is local.

### NFR-3: Reproducible entity processing

Given the same staged diff, Skia must process the same supported
entities in the same deterministic path/line order, derive the same
evidence, select the same Behavior Card templates, and perform the same
source checks. Receipt timestamps, durations, and user cards are
session-specific; the staged-diff hash allows a receipt to be traced
to the reviewed snapshot.

### NFR-4: Minimal dependencies

Phase 0 must use the smallest practical set of Rust crates. No
plugin frameworks, no async runtimes, no serialization libraries
beyond what is needed for JSON receipt output.

### NFR-5: Honest failure

Unsupported statuses, entities, parse regions, or unmapped changed
lines must produce a clear limitation message or count. Skia must never
turn uncertainty, a skip, a `partial` card status, an internal failure,
or a budget refusal into language that implies coverage or a passed
review.

---

## 6. Behavior Card templates and source checks

Card template selection is deterministic. Each template ties a directly
observed syntax delta to a typed Behavior Card prompt. The card is
collected as structured JSON (Section 7); it is not scored in Phase 0.
A narrow source check may label a card's THEN prediction as
`source_derived_match`, `source_derived_mismatch`, or `not_checkable`
(receipt enum values, shown in the terminal UI as `source-derived
match`, `source-derived mismatch`, `not checkable`), but never as
correct or runtime verified.

### Behavior Card structure

Every template collects the same five fields with strongly typed
schemas:

| Field | Type | Description |
|-------|------|-------------|
| `given` | `{ arguments: object\|array\|null, state_note: string\|null }` | One concrete input/state example. `arguments` holds JSON-compatible values where possible; `state_note` is free text only when state is not serializable. |
| `when` | `{ entity: string, invocation: string }` | Selected entity name and call context, filled by Skia. |
| `then` | `{ kind: return_value\|thrown_error\|side_effect, value: JSON value\|string\|null }` | One predicted observable outcome. `kind` is `return_value`, `thrown_error`, or `side_effect`. `value` is JSON-compatible where possible. |
| `because` | text | One or two causal sentences tracing the relevant branch or call. |
| `impact` | text | One caller/user-visible consequence or risk. |

### Card templates by syntax delta

| Template ID | Trigger (observed syntax delta) | Card focus |
|-------------|----------------------------------|------------|
| `BC-ERROR-1` | Added `throw_statement`, `catch_clause`, or call inside a new catch block | Failure path: what triggers it, what error is thrown, and what the caller observes. THEN kind is typically `thrown_error`. |
| `BC-SIG-1` | Parameters or declared return type differ between base and staged entity | Contract change: which callers may need to adapt and what breaks. THEN kind is typically `return_value` or `thrown_error`. |
| `BC-BRANCH-1` | Added or removed `if`, `switch`, ternary, or loop condition | Branch path: what input/state reaches it and what result or side effect leaves the entity. |
| `BC-CALL-1` | Call expression added or removed inside the entity | Call change: why the callee is now called (or no longer called), what data reaches it, and what changes for the caller. |
| `BC-CHANGE-1` | Entity changed but no higher-priority delta applies | Fallback: behavior change plus one input/state that exercises it. |

### Selection order

When more than one trigger applies, Phase 0 selects the first match in
this order: BC-ERROR-1, BC-SIG-1, BC-BRANCH-1, BC-CALL-1, BC-CHANGE-1.
This order is a testable design choice, not a claim that it reflects
risk.

### Source check

Phase 0 does not execute arbitrary TypeScript. A SOURCE CHECK is
eligible only when all of the following hold:

1. `given.arguments` supplies the named parameter values used by the
   changed branch;
2. the branch condition is one atomic supported predicate: a boolean
   parameter, `!parameter`, or a strict/numeric comparison between a
   parameter and a JSON literal using `===`, `!==`, `<`, `<=`, `>`, or
   `>=`;
3. the selected branch endpoint is either `return` of a JSON scalar
   literal (`null`, boolean, finite number, or string) or `throw` of a
   string literal / `new Error` with a literal message; and
4. no method state, helper call, property lookup, coercive equality,
   mutation, or compound predicate is needed to evaluate that local
   branch.

Return endpoints compare canonical JSON scalar values; throw endpoints
compare the literal error/message string. Anything outside that subset
is `not_checkable`. Even a match concerns the displayed local branch
only; it does not prove whole-function
reachability or runtime behavior.

| Source-check status (receipt enum) | UI label | Meaning |
|-------------------------------------|----------|---------|
| `source_derived_match` | `source-derived match` | The card's JSON arguments satisfy an allowlisted local branch predicate and its THEN prediction matches that branch's JSON-scalar return or literal-message throw. |
| `source_derived_mismatch` | `source-derived mismatch` | The arguments satisfy an allowlisted local branch predicate but the THEN prediction differs from that branch's JSON-scalar return or literal-message throw. |
| `not_checkable` | `not checkable` | Arguments are insufficient, the predicate or endpoint is outside the safe subset, or behavior depends on wider control flow/state. The card stays ungraded. |

The receipt stores the enum values (`source_derived_match`,
`source_derived_mismatch`, `not_checkable`); the terminal UI shows the
human-readable labels. Skia must never call a card runtime verified,
correct, or incorrect. Complex behavior -- non-literal returns,
conditional logic without a directly observable endpoint, or
side-effect-only cards -- stays `not_checkable`.

### Optional probe spec

A card is probe-eligible only for an exported top-level function whose
JSON arguments map unambiguously to declared parameter order (no
receiver, destructuring, rest/default ambiguity, missing, or extra
values) and whose THEN predicts a return or throw. Skia may then produce
a PROBE SPEC from the card. The probe spec is a compact machine-readable experiment
suggestion stored as structured JSON, never source code. For eligible
cards it produces `{status: draft_unexecuted, invoke: {entity, arguments}, expect: {kind, value}}`;
otherwise `{status: not_available, reason}`. Phase 0 must never write
the probe spec into the project, run it, treat it as a test, or include
a `framework_hint` or code text. It may be printed or stored alongside
the receipt. Side-effect predictions (THEN kind = `side_effect`) are
not eligible without a later adapter.

### Template expansion criteria

A new card template may be added only when:

1. Its trigger and displayed evidence are deterministic and
   AST-derivable.
2. It collects a typed causal prediction, not a trivia fact or
   automated quality verdict.
3. It can be exercised by a base/staged fixture pair with an expected
   trigger, card structure, and source-check eligibility.
4. Dogfood or user evidence shows that the template is useful enough
   to justify additional friction.

---

## 7. Comprehension receipt schema

Each session produces one local JSON comprehension receipt in
`.skia/receipts/`. The proposed schema is intentionally an interaction
record, not a certificate that the change is correct. One receipt per
session covers 1-3 entities within the pilot budget.

```json
{
  "schema_version": 3,
  "timestamp": "2026-01-15T10:32:00Z",
  "duration_ms": 47000,
  "session": {
    "card_status": "complete",
    "supported_entity_count": 1,
    "changed_ts_lines": 3,
    "mapped_changed_ts_lines": 3,
    "unmapped_changed_ts_lines": 0
  },
  "git": {
    "base_commit": "abc123def456",
    "branch": "feature/discount-guard",
    "staged_diff_sha256": "4c6d...f921",
    "staged_files": ["src/pricing/discount.ts"]
  },
  "entities": [
    {
      "kind": "function",
      "name": "calculateDiscount",
      "file": "src/pricing/discount.ts",
      "start_line": 8,
      "end_line": 16,
      "evidence": [
        {
          "kind": "added_branch",
          "line": 10,
          "summary": "Added early return when total <= 0"
        }
      ],
      "behavior_card": {
        "template": "BC-BRANCH-1",
        "given": {
          "arguments": { "total": -1, "member": false },
          "state_note": null
        },
        "when": {
          "entity": "calculateDiscount",
          "invocation": "calculateDiscount(total, member)"
        },
        "then": {
          "kind": "return_value",
          "value": 0
        },
        "because": "A non-positive total hits the new early-return branch on line 10 and returns the literal 0.",
        "impact": "Negative totals are normalized to zero rather than surfaced; callers that distinguish invalid from zero-priced lose that signal."
      },
      "source_check": {
        "status": "source_derived_match",
        "observed_endpoint": "return 0 at line 10"
      },
      "probe_spec": {
        "status": "draft_unexecuted",
        "invoke": {
          "entity": "calculateDiscount",
          "arguments": [-1, false]
        },
        "expect": {
          "kind": "return_value",
          "value": 0
        }
      },
      "show_code": true,
      "action": "complete"
    }
  ],
  "privacy_caveat": "Receipt contains source-derived summaries and behavior cards; treat as potentially sensitive local data."
}
```

### Required semantics

| Field | Description |
|-------|-------------|
| `schema_version` | Integer schema version; starts at 3 for the bounded review unit and probe spec revision. |
| `timestamp` | UTC completion time. Filenames use a compact, path-safe UTC form. |
| `duration_ms` | Time from first display of evidence to session completion or skip. |
| `session.card_status` | `complete` (all supported-entity cards filled), `partial` (some filled, some skipped), or `skipped` (all skipped). It describes card completion only, never diff coverage or a review pass. |
| `session.supported_entity_count` | Number of supported changed entities processed in this session (at most 3). |
| `session.changed_ts_lines` | Total added plus deleted TypeScript diff lines (at most 150). |
| `session.mapped_changed_ts_lines` | Added/deleted lines overlapping supported staged/base functions or methods. |
| `session.unmapped_changed_ts_lines` | Added/deleted lines outside supported entities, including wholly deleted entities. These remain explicit review debt even when `card_status` is `complete`. |
| `git.base_commit` | `HEAD` used as the base snapshot. |
| `git.staged_diff_sha256` | SHA-256 of the exact raw staged diff reviewed. |
| `git.branch` | Current branch name, including detached-HEAD handling. |
| `git.staged_files` | Supported staged paths included in the review snapshot. |
| `entities` | Array of one entry per supported changed entity. Each entry records kind, name, staged path, source span, evidence, behavior card, source check, probe spec, show-code action, and per-entity action. |
| `entities[].evidence` | One or more deterministic AST-derived change facts; never a quality verdict. |
| `entities[].behavior_card.template` | Template identifier from Section 6. Present only when the entity's action is `complete`. |
| `entities[].behavior_card.given` | `{ arguments: object\|array\|null, state_note: string\|null }`. One concrete input/state example. |
| `entities[].behavior_card.when` | `{ entity: string, invocation: string }`. Auto-filled entity name and call context. |
| `entities[].behavior_card.then` | `{ kind: return_value\|thrown_error\|side_effect, value: JSON value\|string\|null }`. Predicted outcome. |
| `entities[].behavior_card.because` | One or two causal sentences tracing the relevant branch or call. |
| `entities[].behavior_card.impact` | One caller/user-visible consequence or risk. |
| `entities[].source_check.status` | `source_derived_match`, `source_derived_mismatch`, or `not_checkable`. Never `correct`, `incorrect`, or `runtime verified`. |
| `entities[].source_check.observed_endpoint` | The directly observed JSON-scalar return or throw with a literal message, when present. Omitted when status is `not_checkable`. |
| `entities[].probe_spec.status` | `draft_unexecuted` or `not_available`. |
| `entities[].probe_spec.invoke` | `{ entity, arguments }` for eligible cards. Omitted when status is `not_available`. |
| `entities[].probe_spec.expect` | `{ kind, value }` for eligible cards. Omitted when status is `not_available`. |
| `entities[].probe_spec.reason` | Explanation when status is `not_available`. Omitted when status is `draft_unexecuted`. |
| `entities[].show_code` | Whether the user requested expanded code context for this entity. |
| `entities[].action` | `complete` or `skip` for this entity. |
| `privacy_caveat` | Explicit statement that the receipt contains source-derived summaries and behavior cards; users should treat it as potentially sensitive local data. |

Receipt filenames use
`.skia/receipts/{YYYYMMDDTHHMMSSZ}-{diffHashPrefix}-session.json`.
Timestamp and hash components must be path-safe across supported
platforms. Receipts are gitignored and contain source-derived summaries
and behavior cards; users should treat them as potentially sensitive
local data.

---

## 8. Validation metrics

Phase 0 has two separate bars: mechanical correctness and behavioral
usefulness. Local comprehension receipts are not uploaded by default;
pilot participants must explicitly export or share aggregate results.

### Mechanical bar

| Metric | Proposed bar |
|--------|--------------|
| Staged-index integrity | Staged content, not working-tree content, is used in every fixture. |
| Entity processing accuracy | 100% on the accepted base/staged fixture corpus: the same set of supported entities is identified in deterministic path/line order. |
| Evidence trigger accuracy | 100% precision on the accepted fixture corpus; unsupported cases must fall back rather than invent evidence. |
| Card validation | Every filled card validates against the strongly typed Behavior Card schema (`given` is `{arguments: object|array|null, state_note: string|null}`; `when` is `{entity: string, invocation: string}`; `then` is `{kind: return_value|thrown_error|side_effect, value: JSON value|string|null}`; plus `because` and `impact`). |
| Supported-predicate endpoint checks | When a fixture supplies JSON arguments for a supported atomic branch predicate and the branch ends in a JSON-scalar return or literal-message throw, the source check reports the expected enum status. |
| Not-checkable fallback | Compound/coercive predicates, property access, helper calls, method state, mutation, non-literal endpoints, and other complex behavior report `not_checkable`; no fixture produces a source-derived match or mismatch outside the safe subset. |
| Probe spec generation | Every eligible card produces `{status: draft_unexecuted, invoke: {entity, arguments}, expect: {kind, value}}`. Ineligible cards produce `{status: not_available, reason}`. No probe spec contains source code, a `framework_hint`, or any code text. No probe spec is written into the project, run, or treated as a test. |
| Budget refusal and restaging | When a staged change exceeds 3 supported entities or 150 added-plus-deleted TypeScript lines, the tool refuses to process, asks the developer to re-stage, and writes no receipt. Fixtures with over-budget changes verify this behavior. |
| Mapping transparency | Total changed TypeScript lines equal mapped plus unmapped lines; card completion never suppresses the unmapped count. |
| No project writes / network / process execution | No fixture or golden test causes a project file write, network call, or process execution beyond read-only git. |
| Determinism | Same staged diff produces the same entities in the same order, evidence, card templates, source checks, probe specs, and diff hash. |
| Receipt validity | Every generated comprehension receipt validates against the versioned schema. |

Passing a curated fixture set is necessary, not proof of real-world
reliability. The fixture corpus must include TSX, overloads, generics,
decorators, nested functions, anonymous callbacks, syntax errors,
new files, unstaged edits beside staged edits, and paths with spaces.

### Behavioral pilot bar

Run a four-week opt-in dogfood pilot before adding hooks, packages, or
additional languages. The pilot should compare raw-diff-only (the
control arm, where the developer sees only the staged diff with no
card prompt) versus the Behavior Card intervention. A third
plain-pseudocode arm may be added if sample size allows.

Primary metrics:

| Metric | Why it matters |
|--------|----------------|
| Code-open/scroll behavior | Whether developers open or scroll code they would otherwise have skipped. |
| Card completion rate | Whether developers fill the card rather than skipping. |
| Skip rate | Whether the friction is too high. |
| Repeat use by participant and week | Whether the habit persists. |
| Maintenance/change-explanation performance | Whether card users explain or maintain changes better than the raw-diff-only arm. |
| Friction (duration, qualitative reports) | Whether the cost is acceptable. |
| Budget-refusal and restaging behavior | How often the tool refuses because the staged change exceeds the 3-entity or 150-line budget, and whether developers successfully re-stage smaller coherent changes. Tracks whether the budget is too tight, too loose, or about right. |
| Unmapped-line ratio | Whether realistic TypeScript changes fit the supported function/method model or leave too much explicit review debt outside Behavior Cards. |

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

1. **Staged-index integrity is unreliable.** The tool cannot consistently
   bind cards and receipts to the exact staged content.
2. **Useful evidence requires pretending syntax is semantics.** If
   Behavior Card templates cannot be grounded without a compiler, LSP,
   or LLM, add that dependency explicitly or abandon the claim.
3. **Users route around the friction.** Skip rate remains at or above
   70%, fewer than half of pilot users return in week 4, or the card
   becomes a ritual response that does not require inspection.
4. **No behavioral gain over raw-diff-only.** The Behavior Card arm
   does not outperform the raw-diff-only control arm on code-open
   behavior, card completion, maintenance/change-explanation
   performance, or inspection quality.
5. **Excessive friction.** The card interaction takes too long or
   annoys users to the point of abandonment without a measurable
   comprehension benefit.
6. **Supported-entity coverage is too narrow.** Real pilot changes
   routinely leave most changed TypeScript lines unmapped, so completed
   cards describe too little of the actual diff.
7. **The wedge is not distinct.** Existing explanation-gate tools
   deliver equal or better behavior change with less setup, leaving no
   reason to adopt this project.
8. **The name remains unresolved.** Do not publish packages or launch
   publicly under a name dominated by Google's Skia project.

---

## 10. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Typed cards become ritual fill-in-the-blank | High | High | Show evidence first, sample cards manually, measure repeat behavior, and enforce kill criteria. |
| Tree-sitter evidence is mistaken for semantic proof | High | High | Limit claims to syntax deltas; fail or fall back on unsupported cases; label source checks with receipt enum values `source_derived_match`, `source_derived_mismatch`, or `not_checkable`. |
| Working-tree content contaminates a staged review | Medium | High | Read snapshots from the git index and bind receipts to the staged-diff hash. |
| Users skip or abandon the tool | High | High | Start with a manual command, record friction, and add hooks only after four-week retention evidence. |
| Receipts expose sensitive design information | Medium | Medium | Keep them local and gitignored, document their contents, and do not add automatic upload. |
| Name collision with Google's Skia prevents discovery | High | High | Resolve the rename before package publication or launch. |
| A broader review tool absorbs the feature | Medium | High | Compete on verified behavior change and a narrow habit loop, not feature breadth. |
| Probe spec is mistaken for a passed test | Medium | High | Probe specs are structured JSON, never source code, never run, never written into the project, and contain no `framework_hint` or code text. Label every probe spec `draft_unexecuted` or `not_available`. |
| Budget refusal frustrates users | Medium | Medium | Track budget-refusal and restaging behavior in the pilot. If developers frequently re-stage the same large diff unchanged, tune the budget or reconsider the refusal model. |
| Card completion hides unsupported changes | Medium | High | Count and display unmapped changed TypeScript lines; define `card_status` as form completion only; kill or expand support if most real changes remain unmapped. |

---

## 11. Phased roadmap

### Phase 0 (proposed, not started)

TypeScript, staged snapshot integrity, function/method extraction,
bounded review unit (at most 3 supported entities and 150 added-plus-
deleted TypeScript lines per session), syntax-delta evidence, strongly typed
Behavior Card templates, narrow source checks, optional probe specs
(structured JSON, never source code), diff-first terminal interaction,
local comprehension receipts with session scope and per-entity entries,
fixture/golden tests, and a four-week manual-command dogfood pilot
comparing raw-diff-only versus Behavior Card. No hook ships before the
pilot meets the behavioral thresholds in Section 8.

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
plugins, LLM judging, CI PR comments, full-codebase semantic graphs,
and side-effect adapters for probe specs are explicitly deferred
until evidence from prior phases justifies them.
fies them.
stifies them.
