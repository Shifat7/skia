# Phase 0 Output Reference

> **Proposed only.** No runnable tool or generated output exists yet.

Phase 0 produces one local artifact: a review receipt. Terminal
evidence and questions are interaction elements, not separate reports.

## Review receipt

A receipt records that a developer encountered a specific prompt about
a specific staged snapshot and either explained the change or skipped.
It is not proof that the explanation was correct or the code passed
review.

**Path:**
`.skia/receipts/{YYYYMMDDTHHMMSSZ}-{diffHashPrefix}-{entitySlug}.json`

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

The authoritative schema and privacy notes are in PRD.md Section 7.
Receipts are gitignored, never uploaded by Phase 0, and may contain
sensitive source-derived summaries.

## Evidence kinds

Evidence is a conservative description of syntax changed inside the
selected function or method. It is not a semantic verdict.

| Kind | What Skia may show | What Skia must not claim |
|------|--------------------|--------------------------|
| `changed_signature` | Exact before/after declared signatures | Which callers are broken |
| `added_call` / `removed_call` | Callee text, direction, staged line | Runtime target or full call graph |
| `added_branch` / `removed_branch` | Changed condition and local branch | Reachability or business intent |
| `added_throw` / `added_catch` | Source-derived error construct | Complete error propagation |
| `changed_hunk` | Changed lines inside the entity | Meaning beyond the displayed source |

Unsupported or ambiguous comparisons use `changed_hunk` or stop with a
limitation message. They never invent stronger evidence.

## Causal question catalogue

| ID | Trigger | Prompt focus |
|----|---------|--------------|
| `Q-ERROR-1` | Added throw/catch evidence | Trigger, handling location, caller-visible outcome |
| `Q-SIG-1` | Changed signature | Contract change and consumers that may need to adapt |
| `Q-BRANCH-1` | Added/removed branch | Input/state entering the path and result/effect leaving it |
| `Q-CALL-1` | Added/removed call | Data entering the call, result returning, caller impact |
| `Q-CHANGE-1` | Fallback changed hunk | Behavior change plus one input/state that exercises it |

Selection follows the table order. The question and evidence are
deterministic; the explanation is open-ended and ungraded in Phase 0.

## Explicitly absent from Phase 0

There are no intent declarations, type-flow traces, dependency graphs,
pattern indexes, error-coverage maps, SOLID reports, Mermaid diagrams,
SARIF files, full-codebase reports, or AI review verdicts. Those were
part of a broader unvalidated concept and remain excluded unless later
evidence justifies them.
