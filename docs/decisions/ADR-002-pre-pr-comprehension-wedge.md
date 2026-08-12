# ADR-002: Position Skia as a Pre-PR Comprehension Checkpoint

## Status

Accepted

## Date

2026-08-12

## Context

AI coding tools can generate a large amount of code before the developer has a
reliable mental model of the change. A conventional team PR review happens
after that gap has already become someone else's problem. Skia needs a plain-
language explanation that makes its user, timing, and boundary obvious on the
first read.

The product is also easy to confuse with adjacent tools: code generators, team
PR review bots, static analyzers, or runtime verification systems. That
confusion would create expectations the current foundation and proposed
workflows do not satisfy.

## Decision

Describe Skia as the missing step between AI generation and commit:

```text
AI generated code -> understand it -> predict one result -> verify the evidence -> commit/PR
```

The primary user is an individual developer using an AI coding tool. The
intended product is a local, pre-PR comprehension checkpoint that helps the
developer:

- see what the changed code appears to do;
- see what the tool could not safely analyze; and
- choose what to inspect or verify next.

The README and canonical product documents may mention Cursor, Claude Code,
Codex, and GitHub Actions as future workflow adapters. They must label those
integrations, the `skia review` workflow, and the `skia repo review` workflow as
proposed until runnable implementations and acceptance tests exist.

## Alternatives considered

### "AI code review"

- Pros: familiar category and easy to search for.
- Cons: implies a team-facing post-PR reviewer and collapses Skia's
  comprehension and ownership goal into bug finding.
- Rejected: it does not explain the pre-PR individual-developer wedge.

### "AI code explainer"

- Pros: approachable and descriptive.
- Cons: suggests prose summarization and hides the prediction, evidence, and
  uncertainty boundaries.
- Rejected: explanation alone is not the intended comprehension checkpoint.

### "Code correctness checker"

- Pros: sounds concrete and valuable.
- Cons: overclaims runtime correctness, semantic equivalence, and test
  replacement.
- Rejected: raw source, tests, and existing review practices remain
  authoritative.

## Consequences

- The first README screen should explain the generation-to-commit gap before
  implementation detail.
- Examples should show a developer reading a compact behavior view and making
  one prediction before inspecting source-backed evidence.
- Comparisons should distinguish Skia from team PR review tools without making
  unsupported competitive or effectiveness claims.
- Future integrations must be thin adapters around the same local, source-
  backed truth boundary rather than new product identities.
