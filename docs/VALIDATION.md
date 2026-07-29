# Validation and Evidence

> None of these sources evaluate Skia. They establish a plausible
> problem and constrain the product hypothesis; they do not prove that
> a local, non-blocking CLI checkpoint will work.

Evidence status is stated explicitly. Quantitative findings are tied to
the source population and task rather than generalized to all software
development.

---

## 1. Explanation Gate / VibeCheck (2026)

**Source:** Sreecharan Sankaranarayanan, [Mitigating "Epistemic Debt"
in Generative AI-Scaffolded Novice Programming using Metacognitive
Scripts](https://arxiv.org/abs/2602.20206), 2026. Replication artifact:
[sreecharansankaranarayanan/vibecheck](https://github.com/sreecharansankaranarayanan/vibecheck).

**Design:** Between-subjects experiment, N=78 novice programmers,
comparing manual coding, unrestricted AI, and scaffolded AI. The
scaffolded condition used a blocking Explanation Gate: participants had
to teach back the causal logic of generated code, and a second LLM
judged the explanation against a SOLO-based rubric before code could be
applied.

**Reported result:** Both AI groups outperformed manual coding on
immediate functional utility and did not differ significantly from each
other on that outcome. In a later 30-minute task without AI,
unrestricted-AI participants failed 77% of the time versus 39% in the
scaffolded-AI condition (reported chi-square p = .001).

**What it supports:** Metacognitive friction and causal teach-back are a
stronger product basis than passive summaries or syntax trivia.

**Limits:** One novice sample, one application/task family, short
follow-up, a blocking IDE intervention, and an LLM judge. It does not
validate professional use, long-term retention, a non-blocking CLI,
typed Behavior Cards, or Skia's deterministic prompts. VibeCheck
supports causal teach-back, not typed cards specifically. The arXiv
copy includes L@S 2026 conference metadata but a placeholder DOI; use
the linked source rather than overstating publication status.

---

## 2. More Code, Less Understanding? (2026)

**Source:** Martin-Lopez et al., [More Code, Less Understanding? On the
Impact of AI Assistants on Developers' Productivity and Code
Ownership](https://personal.us.es/amarlop/wp-content/uploads/2026/03/More-Code-Less-Understanding-On-the-Impact-of-AI-Assistants-on-Developers-Productivity-and-Code-Ownership.pdf),
2026.

**Design:** Controlled experiment with N=69 participants: 34 BSc
students, 13 MSc students, 8 researchers, and 14 professional
developers. Participants performed coding tasks with and without AI
support. Productivity was measured with task completeness and time;
short-term code ownership was proxied by correct answers to technical
questions about the implementation they had just produced.

**Reported result:** AI assistance produced more than twice the median
task completeness. Median technical-question accuracy was 87.5% with
AI versus 100% without AI, a 12.5-percentage-point drop. Time-based
results were less conclusive.

**What it supports:** Higher immediate output can coexist with weaker
short-term understanding of one's own implementation.

**Limits:** Short tasks with a 75-minute cap, heterogeneous participant
categories and tasks, and a narrow question-based proxy for ownership.
It does not measure long-term maintainability or prove that Skia's
checkpoint reverses the effect.

---

## 3. Reading Between the Lines / CUPS (CHI 2024)

**Source:** Mozannar, Bansal, Fourney, and Horvitz, [Reading Between the
Lines: Modeling User Behavior and Costs in AI-Assisted
Programming](https://dl.acm.org/doi/10.1145/3613904.3641936), CHI 2024.
Official code and data:
[microsoft/coderec_programming_states](https://github.com/microsoft/coderec_programming_states).

**Design:** Mixed-methods study with N=21 programmers. Participants
retrospectively labelled 3,137 coding segments involving 1,096 Copilot
suggestions using the CUPS taxonomy.

**Reported result:** Participants spent 34.3% of session time
Double-checking or Editing Copilot suggestions and 51.5% in
Copilot-related states overall. When participants deferred thought and
accepted a suggestion, 53.2% later verified it; adjusted median
post-acceptance verification time was 6.48 seconds.

**What it supports:** Acceptance counts miss substantial verification
and deferred-thought behavior. A useful product should measure
inspection behavior and friction, not assume that showing an artifact
means it was read.

**Limits:** Small laboratory sample and task setting. The study measures
interaction states and time costs; it does not test an explanation gate
or claim that participants accepted semantically incorrect code.

---

## 4. AI Writes Faster Than Humans Can Review (2026)

**Source:** He et al., [AI Writes Faster Than Humans Can Review: A
Longitudinal Study of an Enterprise 2x
Mandate](https://arxiv.org/abs/2607.01904), 2026 preprint.

**Design:** Observational case study of 802 developers and 196,212 pull
requests from January 2024 to April 2026 at one AI-forward company.
Adoption timing and intensity were not randomized.

**Reported result:** Per-developer throughput reached 2.09 times the
pre-mandate baseline. The share of pull requests with at least one human
review fell from about 89% to 68%, automated-AI review rose from about
19% to 84%, and pull requests with a substantive human-written review
comment fell from about 39% to 21%.

**What it supports:** Faster generation can relocate work downstream and
thin human review even when coarse merge/revert measures remain stable.

**Limits:** One company, non-random adoption, an unusually favorable
rollout, and no measurement of long-term comprehension or maintenance
cost. The paper is a preprint and its authors bound causal attribution.

---

## 5. Tree-sitter capability boundary

**Sources:** [Tree-sitter Rust bindings](https://docs.rs/tree-sitter/latest/tree_sitter/)
and [tree-sitter-typescript](https://github.com/tree-sitter/tree-sitter-typescript).

Tree-sitter provides syntax trees, source ranges, incremental parsing,
and a query mechanism. TypeScript and TSX use separate grammars. Those
capabilities can support entity extraction and conservative syntax-delta
evidence.

They do not by themselves provide TypeScript type inference, symbol
resolution, a complete cross-file call graph, intent, or error-flow
proof. Skia must describe AST-derived observations as syntax evidence,
not semantic certainty.

---

## 6. Product implications

The evidence supports a problem statement, not a product verdict:

1. AI assistance can increase output while weakening short-term
   understanding.
2. Verification behavior is real, costly, and poorly represented by
   acceptance metrics.
3. A causal teach-back gate has promising controlled evidence in a
   novice setting. VibeCheck supports causal teach-back, not typed
   Behavior Cards specifically.
4. Passive summaries and review automation are not evidence that a
   human formed a usable mental model.
5. Syntax tooling can ground typed card prompts, but cannot certify
   understanding.
6. None of the cited studies validates generated pseudocode as a safe
   replacement for source review. A pseudocode arm is a comparison
   condition, not the default source of truth.

The smallest defensible test is therefore:

- keep the raw changed source as the source of truth and show supported
  evidence first;
- bound the session and ask for a smaller staged change instead of
  summarizing away excess review volume;
- collect a typed Behavior Card for each supported changed entity
  (within pilot budgets) predicting the change's behavior;
- perform a narrow local source check only when JSON arguments evaluate
  an allowlisted atomic branch predicate ending in a JSON-scalar return
  or throw with a literal message, labelled in the receipt enum as
  `source_derived_match`, `source_derived_mismatch`, or `not_checkable`;
- produce a probe spec (structured JSON, never source code) for
  eligible cards;
- record total, mapped, and unmapped changed TypeScript lines plus
  per-entity card/skip behavior, probe-spec status, and source-check
  status locally;
- avoid automated correctness claims;
- measure repeat use and whether people inspect code they would have
  skipped, comparing against a raw-diff-only control;
- track budget-refusal and restaging behavior to tune the pilot
  budgets;
- stop if the interaction becomes ritual friction.

## 7. Claims the project must not make

Until Skia has its own controlled evidence, it must not claim that it:

- improves code quality or reduces defects;
- proves a developer understands a change;
- halves maintenance failures;
- performs semantic analysis from Tree-sitter alone;
- replaces code review, static analysis, type checking, or tests;
- is battle-tested, production-ready, fast at scale, or widely used;
- has verified, validated, or confirmed a card's prediction at runtime;
- has run, passed, or executed a probe spec;
- has covered the whole diff when changed lines remain unmapped or
  cards were skipped.

These are explicit truthfulness constraints for README, release notes,
package metadata, and launch material.
