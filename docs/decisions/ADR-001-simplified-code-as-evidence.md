# ADR-001: Show Simplified Code as a Labeled Reading Aid

## Status

Accepted

## Date

2026-08-12

## Context

Skia is meant to help a developer understand AI-generated changes before
trusting them. A prose summary alone is too abstract for a junior developer:
it can say that a discount or guard exists without showing the order in which
the decisions happen. Showing a transformed source file would be easier to
read, but could be mistaken for code that is safe to copy, execute, or commit.

The product also has to remain honest when the source cannot be represented.
Unsupported files, syntax errors, malformed encoding, and unchecked areas must
stay visible rather than being silently rewritten into plausible-looking code.

## Decision

Skia’s default comprehension view will include a small, source-anchored
**simplified code** block before the prediction question. It will:

- keep the important order, conditions, inputs, and outputs from the selected
  source evidence;
- remove incidental syntax and unrelated detail to make the behavior easier to
  scan;
- identify the original path and source range that support the block; and
- be labeled clearly as `SIMPLIFIED VIEW — not executable`.

The simplified block is a reading aid, not a replacement file. Raw source and
the original Git snapshot remain authoritative and available on demand. Every
unrepresented area keeps an explicit state such as `partial`, `unsupported`,
`failed`, or `unchecked`; Skia must not invent code for missing evidence.

## Alternatives Considered

### Prose-only summary

- Pros: compact and easy to generate.
- Cons: hides control flow and makes it harder for a junior developer to
  predict a concrete result.
- Rejected: it does not provide enough structure for the comprehension check.

### Full transformed source file

- Pros: looks familiar and can preserve more syntax.
- Cons: encourages copy/paste, is longer to read, and can look authoritative
  even when coverage is incomplete.
- Rejected: it blurs the boundary between evidence and executable source.

### Unlabeled AI rewrite

- Pros: can produce very short, readable code.
- Cons: may add behavior, omit behavior, or imply semantic equivalence without
  proof.
- Rejected: Skia must show evidence and uncertainty, not present an AI rewrite
  as truth.

## Consequences

- Junior developers get a concrete control-flow map before answering the
  prediction question.
- Every simplified block needs source anchors and an explicit non-executable
  label.
- Product output must preserve raw source access and visible coverage states.
- Semantic equivalence validation remains a deferred product capability; the
  simplified view cannot claim runtime correctness by itself.
