# Validation and Evidence

> The evidence below establishes a plausible problem and constrains the
> experiments. It does not validate Skia, collapsed equivalence evidence, the
> minimal Behavior Card, or agent-generated HLD/LLD.

---

## 1. Problem evidence

### 1.1 Explanation Gate / VibeCheck (2026)

**Primary source:** Sankaranarayanan,
[Mitigating "Epistemic Debt" in Generative AI-Scaffolded Novice Programming
using Metacognitive Scripts](https://arxiv.org/abs/2602.20206), 2026.
[Replication artifact](https://github.com/sreecharansankaranarayanan/vibecheck).

**Design:** Between-subjects experiment with 78 novice programmers across
manual, unrestricted-AI, and scaffolded-AI conditions. The scaffolded condition
used a blocking Explanation Gate and an LLM judge before generated code could
be applied.

**Reported result:** The unrestricted-AI group had a 77% failure rate on a
later 30-minute AI-blackout maintenance task versus 39% for the scaffolded
group. Immediate functional utility did not differ significantly between the
two AI groups.

**Supports:** A causal teach-back intervention can change later maintenance
performance in one novice setting.

**Does not support:** Professional transfer; a non-blocking terminal flow; a
minimal one-prediction card; deterministic source checking; collapsed
equivalence evidence; or repository architecture checks. The intervention,
population, grader, and timing differ materially from Skia.

### 1.2 More Code, Less Understanding? (2026)

**Primary source:** Martin-Lopez et al.,
[More Code, Less Understanding? On the Impact of AI Assistants on Developers'
Productivity and Code Ownership](https://personal.us.es/amarlop/wp-content/uploads/2026/03/More-Code-Less-Understanding-On-the-Impact-of-AI-Assistants-on-Developers-Productivity-and-Code-Ownership.pdf),
2026.

**Design:** Controlled within-subject experiment with 69 participants: 34 BSc
students, 13 MSc students, 8 researchers, and 14 professionals. Participants
completed tasks with and without AI support.

**Reported result:** Median task completeness was more than twice as high with
AI. Median technical-question accuracy was 87.5% with AI and 100% without, a
12.5-percentage-point descriptive difference. The primary mixed model reported
an odds ratio of 0.58 for correct ownership answers with AI assistance
(95% CI 0.38 to 0.91, p=0.016); the paper also reports sensitivity analyses.

**Supports:** Higher immediate output can coexist with weaker short-term
answers about recently produced code.

**Does not support:** Long-term maintainability, universal professional effects,
or any Skia representation. The study uses short tasks, heterogeneous
participants/tasks, and a narrow question-based proxy for ownership.

### 1.3 CUPS / Reading Between the Lines (CHI 2024)

**Primary source:** Mozannar et al.,
[Reading Between the Lines: Modeling User Behavior and Costs in AI-Assisted
Programming](https://dl.acm.org/doi/10.1145/3613904.3641936), CHI 2024.
[Official code and data](https://github.com/microsoft/coderec_programming_states).

**Design:** Mixed-methods study of 21 programmers who retrospectively labelled
3,137 coding segments involving 1,096 Copilot suggestions.

**Reported result:** Participants spent 34.3% of session time double-checking or
editing Copilot suggestions and 51.5% in Copilot-related states. Deferred-thought
acceptances were immediately verified 53.2% of the time; adjusted median
post-acceptance verification time was 6.48 seconds.

**Supports:** Verification has real cost and simple acceptance metrics miss
important behavior.

**Does not support:** A specific comprehension gate, a target amount of
friction, or the safety of generated explanations.

### 1.4 Enterprise review shift (2026)

**Primary source:** He et al.,
[AI Writes Faster Than Humans Can Review: A Longitudinal Study of an Enterprise
2x Mandate](https://arxiv.org/abs/2607.01904), 2026 preprint.

**Design:** Observational case study of 802 developers and 196,212 pull requests
from January 2024 through April 2026 at one AI-forward company.

**Reported result:** Per-developer throughput reached 2.09 times the pre-mandate
baseline. Per-reviewer load roughly doubled and automated review overtook human
review while coarse merge/revert measures remained steady.

**Supports:** Faster generation can shift work into review and automation.

**Does not support:** Causal attribution to a mandate, comprehension loss, or a
Skia intervention. Adoption and intensity were not randomized.

---

## 2. Technical capability boundaries

### 2.1 Tree-sitter

**Primary sources:**
[Tree-sitter Rust bindings](https://docs.rs/tree-sitter/latest/tree_sitter/) and
[tree-sitter-typescript Rust crate](https://docs.rs/tree-sitter-typescript/latest/tree_sitter_typescript/).

Tree-sitter can provide concrete syntax trees, byte/source ranges, and queries.
The TypeScript crate exposes separate `LANGUAGE_TYPESCRIPT` and `LANGUAGE_TSX`
language functions.

It does not provide TypeScript type inference, complete symbol resolution,
runtime call graphs, business intent, semantic equivalence, deployment
architecture, or error-flow proof. Those remain unsupported unless a separately
tested analyzer is introduced.

### 2.2 Git

**Primary source:** [Git command documentation](https://git-scm.com/docs/git).

Git documents `--no-optional-locks` / `GIT_OPTIONAL_LOCKS=0` and
`--no-lazy-fetch` / `GIT_NO_LAZY_FETCH=1`. They matter to the product's
read-only/no-network claims. Git also documents that `--diff-filter` selects
statuses; therefore the implementation must enumerate all staged statuses
before selecting supported `A`/`M` paths.

Separate `git diff` and `git show :path` calls do not automatically form an
atomic snapshot. Snapshot integrity requires a tested capture/revalidation
strategy.

### 2.3 Agent-generated HLD and LLD

An agent can synthesize architecture prose and diagrams from repository
context, but generation capability is not evidence of factual accuracy. The
product must evaluate:

- claim-to-source anchor validity;
- observed versus model-derived classification;
- unsupported-language and unresolved-edge disclosure;
- fabricated intent/runtime topology rates;
- sensitivity to prompt injection in repository content;
- output size and reading cost; and
- provider privacy/retention boundaries.

Model confidence labels are disclosure only and must not be treated as
calibrated probabilities without separate measurement.

---

## 3. Product landscape

The category is not empty. Primary repository/product documentation shows
direct and adjacent alternatives:

- [AhaDiff](https://github.com/AGI-is-going-to-arrive/ahadiff) turns diffs into
  evidence-linked lessons, quizzes, review history, and local artifacts.
- [VibeCheck](https://github.com/akshan-main/vibe-check) uses an agent hook to
  ask short behavior-focused questions about changed code.
- [cognit](https://github.com/jonasbrami/cognit) quizzes a pull-request author
  locally and can optionally publish results.
- [Comprehension-Driven Development](https://github.com/hdarioDev/comprehension-driven)
  describes pre-commit checks and a comprehension-debt ledger/CI audit.
- The academic [VibeCheck](https://github.com/sreecharansankaranarayanan/vibecheck)
  implements a blocking LLM-judged Explanation Gate.
- [bettercallsundim/vibecheck](https://github.com/bettercallsundim/vibecheck)
  provides a reading path, risk checks, and quiz mode for AI-written changes.
- [DiffGate](https://github.com/srbsa/diffgate) is adjacent deterministic
  staged-diff triage rather than a human comprehension test.
- Hosted products such as
  [GitHub Copilot code review](https://docs.github.com/en/copilot/concepts/agents/code-review),
  [Cursor Bugbot](https://cursor.com/docs/bugbot.md),
  [CodeRabbit Change Stack](https://docs.coderabbit.ai/pr-reviews/change-stack),
  and [Qodo Code Review](https://docs.qodo.ai/code-review) organize, review, or
  remediate changes but do not establish that a human formed a mental model.

Product pages and repository claims are vendor/project claims, not independent
effectiveness evidence. Public stars, demos, and feature lists do not prove
retention or comprehension.

**Implication:** "AI asks a question about a diff" is not a defensible wedge.
Skia must test a narrower claim: deterministic, source-anchored collapsed
evidence can reduce reading while a minimal predict-before-feedback card
preserves or improves objective comprehension.

---

## 4. Hypotheses to validate

### H1: Reduced reading

Collapsed evidence materially reduces time or lines required to identify the
supported changed paths versus raw source.

**Failure:** Developers usually open the original diff, evidence is not shorter,
or reduction omits tested behavior.

### H2: Minimal prediction value

Collapsed evidence plus one prediction produces a worthwhile objective
comprehension gain over an attention-matched collapsed-evidence-only control.

**Failure:** The card adds friction without objective benefit, becomes ritual,
or encourages answer guessing.

### H3: Safe fallback

Users understand when evidence is partial and correctly inspect unmapped or
unsupported source.

**Failure:** Users infer complete coverage from a compact display or ignore the
warning.

### H4: Repository architecture value

A timestamped HLD/LLD bundle plus one architecture and selected subsystem cards
reduces time-to-accurate architecture understanding versus ordinary repository
exploration.

**Failure:** Artifacts are too long, contain material factual errors, or cause
more reading than the repository paths developers would otherwise inspect.

### H5: Agent truth boundary

Developers can distinguish deterministic scan facts, model-derived claims, and
unsupported areas from the generated artifacts.

**Failure:** Confidence labels are interpreted as proof, model claims overwrite
scan facts, or repository prompt injection changes scope/tools/output.

### H6: Privacy acceptability

Explicit provider disclosure, consent, local gitignored output, and list/delete
lifecycle are sufficient for the target users.

**Failure:** Relevant teams cannot send code to the selected model, reject local
architecture artifacts, or require controls outside the feasible product.

---

## 5. Cheapest-first validation sequence

### 5.1 Moderated staged prototype

Before a full Git/parser implementation, prepare fixed realistic TypeScript
diffs and manually derived collapsed evidence. Recruit professional
AI-assisted TypeScript developers.

Compare within matched tasks:

1. raw diff;
2. collapsed evidence only; and
3. collapsed evidence plus minimal prediction.

Measure objective path/outcome questions, errors, time, original-source opens,
and qualitative failure reasons. Do not treat preference alone as success.

### 5.2 Reduction fidelity corpus

Have independent reviewers compare each collapsed relation with source and
fixtures. Precommit:

- allowed relation types;
- required anchors;
- behavior-omission definition;
- minimum reading reduction;
- partial/fallback rules; and
- stop threshold.

### 5.3 Moderated repository prototype

Use two or more TypeScript-first repositories with known architecture. Generate
HLD/LLD under the proposed schema, then independently verify claims before the
user study.

Compare architecture question accuracy and time for ordinary exploration versus
bundle plus cards. Track generated-output reading time, source opens, false
claims noticed/missed, subsystem selection, and unsupported-language confusion.

### 5.4 Agent red team

Inject instructions through source, comments, docs, paths, package metadata,
fixtures, and generated/vendor files. Verify the agent cannot change tools,
write targets, egress scope, or claim labels. Test malformed/missing/stale
anchors and unsupported cross-language claims.

### 5.5 Efficacy trial

Only after feasibility, preregister a professional-developer experiment with:

- one objective primary comprehension outcome;
- an attention-matched control;
- justified sample size and minimum worthwhile effect;
- baseline adjustment and intention-to-treat analysis;
- blinded explanation/maintenance scoring;
- delayed novel transfer;
- contamination, attrition, missing-data, and multiplicity rules; and
- green/amber/red proceed criteria.

Activity signals -- completion, skip, return, scroll, selection, friction,
self-report, and card depth -- remain secondary.

---

## 6. Claims the project must not make

Until its own evidence supports them, Skia must not claim that it:

- improves comprehension, code quality, security, or maintenance outcomes;
- proves a developer understands a change or repository;
- proves semantic or runtime equivalence;
- safely replaces reading source in every case;
- covers the whole diff or repository when coverage says otherwise;
- derives intent, type flow, runtime topology, or complete call graphs from
  Tree-sitter;
- has runtime-verified a prediction or executed a probe;
- produces authoritative, maintained, or verified HLD/LLD;
- is private merely because artifacts are local when an external agent receives
  repository context;
- is production-ready, battle-tested, widely adopted, or fast at scale; or
- has a differentiated product solely because it asks comprehension questions.

Release notes, README metadata, package descriptions, repository About text,
and launch material are all subject to these constraints.
