# Skia

A local comprehension checkpoint for AI-assisted developers.
On a staged diff, Skia shows evidence from changed TypeScript
entities, collects a typed Behavior Card for each supported entity
that predicts the change's behavior, performs a narrow source check
when possible, and records what the developer inspected and predicted.
It is designed to interrupt prompt-to-commit autopilot, not to
automate review judgment.

> **This project is documentation-only.** There is no runnable CLI,
> no compiled binary, and no installable package. Every code example
> and interaction mockup on this page describes a proposed design,
> not a working tool. Do not attempt to install or run Skia.

> **Name collision.** "Skia" is also the name of Google's widely used
> 2D graphics library (skia.org). This project is unrelated to that
> library. The name collision is a severe search and discovery
> problem that must be resolved before any public release. See
> [docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md) for details. The
> project is not renamed in this draft; renaming is an unresolved
> pre-release decision.

---

## The problem

AI-assisted coding tools generate code faster than developers can
read it. The bottleneck is no longer writing code; it is understanding
what was written before it ships.

## Why not raw review or generated pseudocode?

Raw diffs remain the source of truth, but unbounded line-by-line review
does not scale with AI output. Generated pseudocode is not a safe
replacement: it is another lossy representation produced by the same
class of system being reviewed, and it can omit exactly the branch,
side effect, or failure path that matters.

Skia therefore does not translate the whole change. It shows the real
changed lines first, then asks the developer to predict one concrete
input-to-outcome path in a structured Behavior Card. When volume exceeds
a small pilot budget, Skia asks for a smaller staged change rather than
compressing review debt into a summary. The bet is that **prediction
plus evidence** will scale better than either raw-code endurance or
passive pseudocode consumption. The pilot must prove that bet.

---

## Proposed interaction (mockup, not a real session)

The following is a labeled mockup of the intended terminal interaction.
No part of this has been implemented.

```
$ skia review

Staged diff: 1 file changed, 1 supported changed entity.
Budget: 1 supported entity, 3 changed TypeScript lines (within pilot limits).
Mapping: 3 changed TypeScript lines inside supported entities; 0 unmapped.

Entity: calculateDiscount
File:   src/pricing/discount.ts:8-16

Changed lines + conservative syntax delta:
  + 10   if (total <= 0) return 0;     [added_branch]

  --- Behavior Card ---
  GIVEN:  { total: -1, member: false }
  WHEN:   calculateDiscount(total, member)   [auto-filled]
  THEN:   return_value 0                      [predicted: return value]
  BECAUSE: A non-positive total hits the new early-return branch on
           line 10 and returns the literal 0.
  IMPACT: Negative totals are normalized to zero rather than surfaced;
          callers that distinguish invalid from zero-priced lose that
          signal.

Source check: source-derived match (literal return 0 on line 10)

Probe spec: draft_unexecuted
  { "invoke": { "entity": "calculateDiscount", "arguments": [-1, false] },
    "expect": { "kind": "return_value", "value": 0 } }

  [f] Fill card  [s] Show more code  [k] Skip

> s
  ... staged version of calculateDiscount, with changed lines highlighted ...

> f
Card recorded before the source-check result. Phase 0 does not rewrite
that prediction after feedback.

Comprehension receipt written locally to .skia/receipts/...
```

Phase 0 does not claim that a card is correct. It collects a typed
prediction, performs a narrow source check only when a supported
branch predicate is evaluable from the JSON arguments and ends in a
directly observed JSON-scalar return or literal-message throw, and records the
card, source-check status, optional
probe spec, show-code action, and a hash that binds the receipt to the
staged diff. The source check is labeled exactly as `source_derived_match`,
`source_derived_mismatch`, or `not_checkable` in the receipt enum;
it is never called runtime verified or correct. Complex behavior stays
ungraded. The first validation question is whether this interaction
creates real inspection rather than ritual card-filling.

---

## Proposed Phase 0 scope

Phase 0 is intentionally narrow. It covers:

- **TypeScript only.** Parse staged `.ts` and `.tsx` content via
  Tree-sitter.
- **Staged diffs only.** Compare the index with `HEAD`. No
  full-codebase scan, branch review, or watch mode.
- **Bounded review unit.** Phase 0 processes every supported changed
  function/method in deterministic path/line order, but only when the
  staged TypeScript change is at or below provisional pilot budgets of
  **3 supported entities** and **150 added-plus-deleted TypeScript lines**. If
  either budget is exceeded, Skia refuses to summarize or sample away
  review debt: it asks the developer to re-stage a smaller coherent
  change. The 3-entity and 150-line budgets are product-experiment
  defaults, not risk-science benchmarks. One Behavior Card per entity;
  therefore 1-3 cards per session. A session receipt records total and
  unmapped changed TypeScript lines, an entry for every supported entity,
  each card or skip, and card status (`complete`, `partial`, or
  `skipped`). Card status describes form completion only; it is never a
  coverage or review-pass claim.
- **Changed-entity extraction.** Identify functions or methods whose
  syntax overlaps a staged hunk. All supported entities are processed
  in deterministic path/line order within the pilot budget.
- **Diff-first evidence.** Show changed lines plus a conservative
  syntax delta (changed signature, added/removed call, added/removed
  branch, added throw/catch) before the Behavior Card prompt. No
  summary-first UI, whole-codebase graph, or hidden AI judgment.
- **Typed Behavior Card.** For each supported changed entity, the
  terminal collects a structured card with strongly typed fields:
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
  The card is rendered in a typed, compact form in the terminal but
  stored as structured JSON. One card per entity, 1-3 cards per session.
  No prose pseudocode language is introduced.
- **Narrow source check.** Phase 0 does not execute arbitrary
  TypeScript. A check is eligible only when the changed branch uses a
  deliberately small predicate subset that can be evaluated from the
  card's JSON arguments and ends in a directly observed literal return
  or explicit throw. It labels the result `source_derived_match`,
  `source_derived_mismatch`, or `not_checkable` in the receipt enum.
  In the terminal UI, the same statuses appear as human-readable labels
  (`source-derived match`, `source-derived mismatch`, `not checkable`).
  Skia never calls the result runtime verified or correct. Complex
  behavior stays ungraded.
- **Optional probe spec.** Eligibility is limited to exported top-level
  functions whose JSON arguments map unambiguously to declared parameter
  order (no receiver, destructuring, rest/default ambiguity, missing, or
  extra values) and whose card predicts a return or throw. Phase 0 may produce a
  PROBE SPEC: a compact machine-readable experiment suggestion stored as
  structured JSON, never source code. For eligible cards it produces
  `{status: draft_unexecuted, invoke: {entity, arguments}, expect: {kind, value}}`;
  otherwise `{status: not_available, reason}`. It is never written into
  the project, never run, and has no `framework_hint` or code text.
  Side-effect predictions are not eligible without a later adapter.
- **Diff-first terminal interaction.** Show changed code and
  conservative syntax delta before the card prompt. Offer fill card,
  show more code, and skip. The submitted card is recorded before the
  source-check result and is not rewritten after feedback in Phase 0.
- **Local comprehension receipts.** Record the diff hash, total/mapped/
  unmapped line fields (`changed_ts_lines`, `mapped_changed_ts_lines`,
  `unmapped_changed_ts_lines`), an entry for every supported entity,
  evidence, behavior card, source-check/probe status, show-code action,
  session `card_status`, and duration in `.skia/receipts/`. Nothing is
  uploaded; `card_status` never means coverage or a passed review.
- **Fixture, golden, and dogfood tests.** Validate extraction, card
  validation, source checks, probe spec generation, receipt integrity,
  budget-refusal and restaging behavior mechanically, then test whether
  people actually inspect and predict the code.

An optional non-blocking git hook is considered only after the manual
workflow survives dogfood validation.

---

## Evidence

The motivation is credible; the proposed product is not yet validated.
None of these studies evaluate Skia.

| Source | What it found | What it does not prove |
|--------|---------------|------------------------|
| [VibeCheck / Explanation Gate, 2026](https://arxiv.org/abs/2602.20206), N=78 | In a between-subjects experiment with novices, unrestricted-AI participants failed a later 30-minute AI-blackout maintenance task 77% of the time versus 39% in the scaffolded-AI condition. The intervention required a causal teach-back before generated code could be applied. | One novice sample, one task, short follow-up, and an LLM judge. It does not validate a non-blocking CLI, typed Behavior Cards, or deterministic prompts for professionals. VibeCheck supports causal teach-back, not typed cards specifically. |
| [More Code, Less Understanding?, 2026](https://personal.us.es/amarlop/wp-content/uploads/2026/03/More-Code-Less-Understanding-On-the-Impact-of-AI-Assistants-on-Developers-Productivity-and-Code-Ownership.pdf), N=69 | In a controlled within-subjects study, AI assistance more than doubled median task completeness but reduced correct answers about the participant's own implementation by 12.5 percentage points. | Short tasks and a question-based proxy for short-term ownership, not long-term maintainability. |
| [Reading Between the Lines, CHI 2024](https://dl.acm.org/doi/10.1145/3613904.3641936), N=21 | Participants spent 34.3% of session time double-checking or editing Copilot suggestions; the CUPS taxonomy exposed verification and deferred-thought costs that acceptance metrics miss. | It measures interaction costs; it does not test comprehension checkpoints or claim that users accepted semantically wrong code. |
| [Tree-sitter Rust bindings](https://docs.rs/tree-sitter/latest/tree_sitter/) | Tree-sitter exposes syntax trees and queries through Rust bindings; TypeScript and TSX use separate grammars. | Syntax is not intent, type inference, control-flow proof, or a complete semantic model. |

Full evidence details and limitations are in
[docs/VALIDATION.md](docs/VALIDATION.md).

---

## Non-goals (explicitly cut or deferred)

The following are out of scope for Phase 0 and will not be added
without evidence that they solve a demonstrated problem:

- Inferred intent or semantic mismatch detection
- Type-flow tracing or nullable propagation analysis
- Error-path completeness checking
- Broad pattern intelligence (DRY detection, copy-paste, missing
  abstractions)
- Watch mode or file-system monitoring
- SARIF output
- Plugin architecture (language parsers, analysis passes, or
  output generators)
- Polyglot support (Python, Go, Rust, or other languages)
- LLM-based card generation or source-check judging
- CI-integrated PR comments or automated review gates
- Full-codebase semantic graphs
- IDE extensions or editor integrations
- Pre-built binaries or package publication
- Executable test generation: probe specs are structured JSON
  experiment suggestions, never source code, never run, and never
  written into the project

---

## Open decisions

Key unresolved decisions are tracked in
[docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md). The most pressing:

1. **Project name.** "Skia" collides with Google's graphics project
   and blocks package publication or launch.
2. **Evidence depth.** Whether deterministic syntax changes can drive
   useful Behavior Cards and source checks without a compiler, LSP,
   or LLM.
3. **Receipt privacy.** What can be stored or shared without turning a
   learning aid into surveillance or a gameable compliance artifact.
4. **Hook timing.** Whether any opt-in hook should exist after the
   manual workflow is validated.
5. **Pilot budgets.** Whether the provisional 3-entity and 150-line
   budgets are the right defaults for the pilot or should be tuned
   based on observed budget-refusal and restaging behavior.

---

## Ways to contribute now

This is a documentation-only project. You can contribute by:

- **Design feedback.** Open an issue using the design feedback form
  to critique the proposed workflow, Behavior Card templates, source
  checks, or comprehension receipt schema.
- **Benchmark fixtures.** Submit a small TypeScript diff (10-50
  lines) that you think would be a good test case for entity
  extraction, card validation, source-check eligibility, probe spec
  eligibility, or budget-refusal behavior. Use the benchmark fixture
  issue form.
- **Implementation proposals.** If you want to propose how a specific
  Phase 0 component should be built, open an issue using the
  implementation proposal form.
- **Documentation improvements.** Pull requests that fix errors,
  clarify wording, or add evidence citations are welcome. See
  [CONTRIBUTING.md](CONTRIBUTING.md).

No source code contributions are being accepted yet. The project has
no build system, no test suite, and no CI pipeline.

---

## Documents

| Document | Purpose |
|----------|---------|
| [PRD.md](PRD.md) | Product requirements: thesis, target user, workflow, functional requirements, Behavior Card templates and source checks, comprehension receipt schema, metrics, kill criteria |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Target Phase 0 architecture (unimplemented): crate choices, data flow, Tree-sitter integration, git invocation |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Acceptance-criteria-driven implementation plan for Phase 0 components |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute to this documentation-only project |
| [docs/VALIDATION.md](docs/VALIDATION.md) | Evidence summary, citation details, and limitations |
| [docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md) | Unresolved pre-release decisions |
| [docs/artifacts/README.md](docs/artifacts/README.md) | Reference for the proposed comprehension receipt format, Behavior Card templates, source checks, and probe spec |

---

## License

MIT. See [LICENSE](LICENSE).
