# Skia

A local comprehension checkpoint for AI-assisted developers.
On a staged diff, Skia shows evidence from one changed TypeScript
entity, asks one causal question about the change, and records what
the developer inspected and explained. It is designed to interrupt
prompt-to-commit autopilot, not to automate review judgment.

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

---

## Proposed interaction (mockup, not a real session)

The following is a labeled mockup of the intended terminal interaction.
No part of this has been implemented.

```
$ skia review

Staged diff: 1 file changed, 1 changed entity selected.

Entity: normalizeEmail
File:   src/utils/email.ts:12-24

Changed evidence:
  + added call: canonicalizeDomain(domain)
  + added branch: if (!email) return ""

Question:
  Explain the new failure or fallback path in normalizeEmail.
  What input reaches it, what value leaves it, and what caller could
  observe that result?

  [a] Answer     - write 1-3 sentences
  [s] Show code  - inspect the changed entity and local context
  [k] Skip       - continue and record the skip

> s
  ... staged version of normalizeEmail, with changed lines highlighted ...

> a
Your explanation:
  Undefined input takes the early-return branch and becomes an empty
  string. Any caller that distinguishes missing email from a present
  empty value could now lose that distinction.

Receipt written locally to .skia/receipts/...
```

Phase 0 does not claim that an answer is correct. It records the
question, whether code was shown, the developer's explanation, and a
hash that binds the receipt to the staged diff. The first validation
question is whether this interaction creates real inspection rather
than ritual clicking.

---

## Proposed Phase 0 scope

Phase 0 is intentionally narrow. It covers:

- **TypeScript only.** Parse staged `.ts` and `.tsx` content via
  Tree-sitter.
- **Staged diffs only.** Compare the index with `HEAD`. No
  full-codebase scan, branch review, or watch mode.
- **Changed-entity extraction.** Identify functions or methods whose
  syntax overlaps a staged hunk; select one deterministically.
- **Evidence, not verdicts.** Surface one or two AST-derived facts
  about the change, such as a new call, branch, or changed signature.
- **Causal question catalogue.** Ask the developer to explain what
  changed, how control or data moves through it, and where it could
  fail. Questions are deterministic templates; answers are not graded
  in Phase 0.
- **Diff-first terminal interaction.** Show code before or alongside
  the prompt. Offer answer, show more context, or skip.
- **Local review receipts.** Record the diff hash, entity, evidence,
  prompt, response, show-code action, duration, and skip state in
  `.skia/receipts/`. Nothing is uploaded.
- **Fixture, golden, and dogfood tests.** Validate extraction and
  question selection mechanically, then test whether people actually
  inspect and explain the code.

An optional non-blocking git hook is considered only after the manual
workflow survives dogfood validation.

---

## Evidence

The motivation is credible; the proposed product is not yet validated.
None of these studies evaluate Skia.

| Source | What it found | What it does not prove |
|--------|---------------|------------------------|
| [VibeCheck / Explanation Gate, 2026](https://arxiv.org/abs/2602.20206), N=78 | In a between-subjects experiment with novices, unrestricted-AI participants failed a later 30-minute AI-blackout maintenance task 77% of the time versus 39% in the scaffolded-AI condition. The intervention required a causal teach-back before generated code could be applied. | One novice sample, one task, short follow-up, and an LLM judge. It does not validate a non-blocking CLI or deterministic prompts for professionals. |
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
- LLM-based question generation or answer judging
- CI-integrated PR comments or automated review gates
- Full-codebase semantic graphs
- IDE extensions or editor integrations
- Pre-built binaries or package publication

---

## Open decisions

Key unresolved decisions are tracked in
[docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md). The most pressing:

1. **Project name.** "Skia" collides with Google's graphics project
   and blocks package publication or launch.
2. **Evidence depth.** Whether deterministic syntax changes can drive
   useful causal explanations without a compiler, LSP, or LLM.
3. **Receipt privacy.** What can be stored or shared without turning a
   learning aid into surveillance or a gameable compliance artifact.
4. **Hook timing.** Whether any opt-in hook should exist after the
   manual workflow is validated.

---

## Ways to contribute now

This is a documentation-only project. You can contribute by:

- **Design feedback.** Open an issue using the design feedback form
  to critique the proposed workflow, question catalogue, or receipt
  schema.
- **Benchmark fixtures.** Submit a small TypeScript diff (10-50
  lines) that you think would be a good test case for entity
  extraction or question generation. Use the benchmark fixture issue
  form.
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
| [PRD.md](PRD.md) | Product requirements: thesis, target user, workflow, functional requirements, question catalogue, receipt schema, metrics, kill criteria |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Target Phase 0 architecture (unimplemented): crate choices, data flow, Tree-sitter integration, git invocation |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Acceptance-criteria-driven implementation plan for Phase 0 components |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute to this documentation-only project |
| [docs/VALIDATION.md](docs/VALIDATION.md) | Evidence summary, citation details, and limitations |
| [docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md) | Unresolved pre-release decisions |
| [docs/artifacts/README.md](docs/artifacts/README.md) | Reference for the proposed receipt format and question catalogue |

---

## License

MIT. See [LICENSE](LICENSE).
