# Phase 0 Output Reference

> **Proposed only.** No runnable tool or generated output exists yet.

Phase 0 produces one local artifact: a comprehension receipt.
Terminal evidence, Behavior Card, source check, and probe spec
are interaction elements, not separate reports.

## Comprehension receipt

A comprehension receipt records that a developer encountered a
Behavior Card prompt for each supported changed entity in a staged
snapshot and either filled the card or skipped. It is not proof that
any card was correct or the code passed review. One receipt per
session covers 1-3 entities within the pilot budget.

**Path:**
`.skia/receipts/{YYYYMMDDTHHMMSSZ}-{diffHashPrefix}-session.json`

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

The authoritative schema and privacy notes are in PRD.md Section 7.
Comprehension receipts are gitignored, never uploaded by Phase 0, and
may contain sensitive source-derived summaries and behavior cards.

## Evidence kinds

Evidence is a conservative description of syntax changed inside each
supported function or method. It is diff-first and source-grounded:
changed lines plus a conservative syntax delta are shown before the
Behavior Card prompt. It is not a semantic verdict.

| Kind | What Skia may show | What Skia must not claim |
|------|--------------------|--------------------------|
| `changed_signature` | Exact before/after declared signatures | Which callers are broken |
| `added_call` / `removed_call` | Callee text, direction, staged line | Runtime target or full call graph |
| `added_branch` / `removed_branch` | Changed condition and local branch | Reachability or business intent |
| `added_throw` / `added_catch` | Source-derived error construct | Complete error propagation |
| `changed_hunk` | Changed lines inside the entity | Meaning beyond the displayed source |

Unsupported or ambiguous comparisons use `changed_hunk` or stop with a
limitation message. They never invent stronger evidence.

## Behavior Card templates

| ID | Trigger (observed syntax delta) | Card focus |
|----|----------------------------------|------------|
| `BC-ERROR-1` | Added throw/catch evidence | Failure path: trigger, error thrown, caller-visible outcome |
| `BC-SIG-1` | Changed signature | Contract change and consumers that may need to adapt |
| `BC-BRANCH-1` | Added/removed branch | Input/state entering the path and result/effect leaving it |
| `BC-CALL-1` | Added/removed call | Data entering the call, result returning, caller impact |
| `BC-CHANGE-1` | Fallback changed hunk | Behavior change plus one input/state that exercises it |

Selection follows the table order. Evidence and template selection are
deterministic; the typed card is collected but not graded in Phase 0.

### Behavior Card structure

Every template collects the same five fields with strongly typed
schemas:

| Field | Type | Description |
|-------|------|-------------|
| `given` | `{ arguments: object\|array\|null, state_note: string\|null }` | One concrete input/state example. `arguments` holds JSON-compatible values where possible; `state_note` is free text only when state is not serializable. |
| `when` | `{ entity: string, invocation: string }` | Selected entity name and call context, filled by Skia. |
| `then` | `{ kind: return_value\|thrown_error\|side_effect, value: JSON value\|string\|null }` | One predicted observable outcome. |
| `because` | text | One or two causal sentences tracing the relevant branch or call. |
| `impact` | text | One caller/user-visible consequence or risk. |

## Source check

Phase 0 does not execute arbitrary TypeScript. A SOURCE CHECK is
eligible only when `given.arguments` can evaluate one atomic allowlisted
branch predicate (boolean parameter, `!parameter`, or comparison of a
parameter with a JSON literal using `===`, `!==`, `<`, `<=`, `>`, or
`>=`) and that branch ends in `return` of a JSON scalar literal or
`throw` of a string literal / `new Error` with a literal message.
Return values use canonical JSON-scalar equality; throws compare the
literal message. Method state, property access, helper calls, coercive
equality, mutation,
compound predicates, and non-literal endpoints are `not_checkable`.
Even a match concerns the displayed local branch only and does not prove
whole-function reachability or runtime behavior.

| Status (receipt enum) | UI label | Meaning |
|------------------------|----------|---------|
| `source_derived_match` | `source-derived match` | The card's JSON arguments satisfy an allowlisted local branch predicate and its THEN prediction matches that branch's JSON-scalar return or literal-message throw. |
| `source_derived_mismatch` | `source-derived mismatch` | The arguments satisfy an allowlisted local branch predicate but the THEN prediction differs from that branch's JSON-scalar return or literal-message throw. |
| `not_checkable` | `not checkable` | Arguments are insufficient, the predicate or endpoint is outside the safe subset, or behavior depends on wider control flow/state. The card stays ungraded. |

The receipt stores the enum values (`source_derived_match`,
`source_derived_mismatch`, `not_checkable`); the terminal UI shows the
human-readable labels. Skia must never call a card runtime verified,
correct, or incorrect. Complex behavior -- non-literal returns,
conditional logic without a directly observable endpoint, or
side-effect-only cards -- stays `not_checkable`.

## Probe spec

Probe eligibility is limited to an exported top-level function whose
JSON arguments map unambiguously to declared parameter order (no
receiver, destructuring, rest/default ambiguity, missing, or extra
values) and whose THEN predicts a return or throw. Skia may then produce
a PROBE SPEC from the card. The probe spec is a compact machine-readable experiment
suggestion stored as structured JSON, never source code. For eligible
cards it produces:

```json
{
  "status": "draft_unexecuted",
  "invoke": { "entity": "calculateDiscount", "arguments": [-1, false] },
  "expect": { "kind": "return_value", "value": 0 }
}
```

For ineligible cards it produces:

```json
{
  "status": "not_available",
  "reason": "Side-effect predictions are not eligible without a later adapter."
}
```

Phase 0 never writes the probe spec into the project, runs it, treats
it as a test, or includes a `framework_hint` or code text. It may be
printed or stored alongside the receipt. Side-effect predictions
(THEN kind = `side_effect`) are not eligible without a later adapter.

## Session scope

A session receipt records total, mapped, and unmapped changed
TypeScript lines; an entry for every supported entity; each card or
skip; and session `card_status` (`complete`, `partial`, or `skipped`).
`card_status` describes supported-entity card completion only. It never
means the whole diff was covered or passed review, and unmapped lines
remain visible even when every card is complete.

Phase 0 processes every supported changed entity in deterministic
path/line order, but only when the staged change is at or below
provisional pilot budgets of 3 supported entities and 150 added-plus-deleted
TypeScript lines. If either budget is exceeded, Skia refuses to
summarize or sample away review debt and asks the developer to re-stage
a smaller coherent change. The 3/150 budgets are product-experiment
defaults, not risk-science benchmarks.

## Explicitly absent from Phase 0

There are no intent declarations, type-flow traces, dependency graphs,
pattern indexes, error-coverage maps, SOLID reports, Mermaid diagrams,
SARIF files, full-codebase reports, AI review verdicts, arbitrary
TypeScript execution, source code generation, or probe specs treated
as run, passed, or executed tests. Those were part of a broader
unvalidated concept and remain excluded unless later evidence
justifies them.
