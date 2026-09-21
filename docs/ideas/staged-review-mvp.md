# Staged Review MVP

## Problem Statement

How might we help an AI-assisted TypeScript developer prove they understand one
staged function before committing, while preserving exact Git identity and
never implying runtime correctness?

## Recommended Direction

Build one complete `skia review` vertical slice for a named TypeScript function
containing a literal comparison guard that returns a literal. The command will
capture the staged Git snapshot, derive a compact source-anchored relation,
present one deterministic scenario, persist the developer's prediction before
feedback, perform a narrow source-derived check, and write a validated local
receipt.

This is intentionally narrower than general TypeScript analysis. It tests the
product's riskiest assumption: whether truthful reduced evidence plus one
prediction helps a developer understand generated code without creating false
confidence. Unsupported syntax must remain visible rather than being guessed.

## Key Assumptions to Validate

- [ ] A literal guard-return relation is materially shorter than its source;
      compare evidence lines with represented source lines in fixtures.
- [ ] A scenario derived from the literal boundary is unambiguous; require
      deterministic fixture output and explicit fallback for every other shape.
- [ ] One prediction adds useful friction without becoming a ritual; measure
      completion, skip, and misunderstanding during moderated feasibility.
- [ ] A source-derived check can provide useful feedback without executing
      repository code; test both branch outcomes and every `not_checkable` path.

## MVP Scope

- Manual `skia review` command.
- One staged added or modified regular `.ts` file.
- One named function declaration with one supported literal comparison guard
  and literal return.
- Deterministic source anchors and explicit coverage.
- One system-supplied `GIVEN`/`WHEN`, developer-supplied `THEN` or skip.
- Prediction persistence before source-derived feedback.
- Versioned local receipt beneath `.skia/`.
- Unit, integration, golden terminal, security, and end-to-end tests.

## Not Doing (and Why)

- TSX and Python behavior reduction — prove the interaction before multiplying
  grammar-specific cases.
- Methods, arrows, callbacks, nested entities, or multiple cards — they expand
  ownership rules without testing a different product assumption.
- Arbitrary expression evaluation — it approaches execution and weakens the
  deterministic truth boundary.
- Repository mode, HLD/LLD, or agent transport — they are later roadmap slices.
- Constraint-driven verification from PR #4 — it is post-validation research,
  not part of the comprehension wedge.
- Hooks, source rewriting, or automatic adoption — comprehension runs remain
  manually invoked and source/Git read-only.

## Open Questions

- Which comparison operators provide the smallest useful first relation set?
- Should skipped predictions produce a partial or complete receipt?
- What minimum reading reduction advances the reducer beyond this pilot?
- Which moderated-test outcome is sufficient to proceed to more entity shapes?
