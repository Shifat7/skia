# Skia

A proposed local comprehension checkpoint for AI-assisted developers.

Skia is designed to reduce how much changed code a developer must read
without pretending that a summary is the code. It turns a supported
TypeScript change into **collapsed equivalence evidence**: a compact,
source-anchored representation of the observable paths that changed. It
then asks one small **Behavior Card** question so the developer predicts
one concrete outcome before seeing source-derived feedback.

Skia also proposes a TypeScript-first repository mode. That mode scans a
committed repository snapshot, uses an explicitly configured agent to draft
high-level and low-level design views, and writes timestamped local artifacts
under `.skia/dist/`. The developer always receives one architecture-level
comprehension check and chooses which subsystems to check when the repository
contains more subsystems than one short session should cover.

> **This project is documentation-only.** There is no runnable CLI,
> compiled binary, installable package, or generated repository artifact.
> Every command and output below is a proposed contract, not a working tool.
> Do not attempt to install or run Skia.

> **Name collision.** "Skia" is also Google's established 2D graphics
> library. This is a release-blocking search, registry, and command-identity
> problem. The project must be renamed before publication. See
> [docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md).

---

## Product thesis

AI coding agents can produce changes faster than developers can read them.
A raw diff remains the authority, but forcing every developer to read every
line is not a credible answer to increasing output. Passive prose summaries
are also insufficient: they can omit the branch, side effect, or failure path
that matters.

Skia tests a narrower alternative:

1. derive only source-grounded facts from an immutable review snapshot;
2. collapse supported behavior into a shorter, code-like evidence surface;
3. ask the developer to predict one observable path;
4. reveal a narrow source-derived comparison only after the prediction; and
5. keep the original source, anchors, coverage limits, and uncertainty one
   action away.

The generated evidence is useful only when it is shorter than the source and
truthful about what it omitted. If a safe reduction is not possible, Skia must
show the limitation or require the original diff. It must never compress
review debt into false confidence.

---

## Mode 1: staged change checkpoint

The proposed `skia review` command reviews the Git index, not the working-tree
copy. Phase 0 remains TypeScript and TSX only.

### Proposed interaction

```text
$ skia review

Snapshot: staged index  8f5d...1a2c
Scope:    1 supported entity, 12 changed TypeScript lines
Mapping:  12 mapped, 0 unmapped

calculateFinalPrice                 12 changed lines -> 4 evidence lines

  total <= 0       -> return 0
  active member    -> total * 0.90
  valid promotion  -> subtract promotion amount
  final result     -> clamp at 0, then round

BEHAVIOR CHECK 1/1
Given: total=100, member=active, promotion=10
When:  calculateFinalPrice(total, member, promotion)
Expected return: ___
> 80

Source check: source-derived match for the displayed path

[e] evidence details  [d] original staged diff  [n] next
```

The collapsed evidence is the default reading surface. `GIVEN` and `WHEN` are
system-supplied; the developer normally supplies only the predicted `THEN`.
`BECAUSE` is requested only when the prediction mismatches or the developer
chooses to explain it. `IMPACT` is reserved for a risk-focused prompt, not a
mandatory field on every change.

The submitted prediction is recorded before feedback. A source-derived match
concerns only the displayed, supported path. It is not runtime verification,
proof of equivalence, full-diff coverage, or evidence that the code is correct.

### Honest fallback

If changed behavior cannot be represented safely, the session does not hide
it:

```text
WARNING: 7 changed TypeScript lines are unmapped.
Collapsed evidence does not cover imports, a deleted callback, or a compound
stateful branch.

[d] inspect unmapped diff  [s] skip entity  [q] stop
```

A completed Behavior Card describes one supported path. It never converts
unmapped lines or unsupported behavior into reviewed coverage.

### Provisional staged budget

The pilot default remains at most 3 supported changed entities and 150
added-plus-deleted TypeScript lines. These are product-experiment defaults,
not risk benchmarks. An over-budget session asks the developer to re-stage a
smaller coherent change rather than sampling or summarizing away the rest.

---

## Mode 2: repository comprehension snapshot

The proposed `skia repo review` command analyzes one committed `HEAD` snapshot.
Phase 0 is TypeScript-first:

- detailed structural and behavioral evidence covers `.ts` and `.tsx` files;
- manifests, configuration, and documentation inform architecture boundaries;
- other source languages are enumerated as unsupported coverage, not silently
  interpreted; and
- ignored files, unreadable files, parse failures, generated/vendor paths, and
  size-limit exclusions remain explicit in coverage output.

Repository mode uses two evidence layers:

1. **Deterministic scan facts** -- paths, file identities, imports, exports,
   declarations, directly observed calls, and source ranges.
2. **Agent-derived design drafts** -- HLD, LLD, subsystem descriptions, and
   collapsed architecture evidence produced from those facts and bounded source
   slices.

Agent-derived claims must be labelled `model_derived`, carry source anchors
where possible, expose uncertainty, and never be presented as deterministic
facts. Repository contents are untrusted input; instructions found in source,
documentation, comments, or generated files must not control the agent.

### Short comprehension flow

Repository mode always asks one system-level architecture question. It then
asks one question for each selected top-level subsystem. If discovered
subsystems exceed the configured card cap, the developer must select which
subsystems to check. Unselected subsystems are recorded as `unchecked`; Skia
does not group or sample them silently.

```text
$ skia repo review

Snapshot: HEAD c8d1a18
Coverage: 84 TypeScript files scanned; 3 configuration files; 5 docs
Unsupported: 2 Python files
Subsystems: api, billing, persistence, notifications, web

Architecture check: included
Subsystem card cap: 3
Select up to 2 additional subsystems:
  [x] billing
  [x] persistence
  [ ] api
  [ ] notifications
  [ ] web
```

### Local timestamped artifacts

Each run creates one path-safe UTC identifier in basic ISO 8601 form, for
example `20260805T001500Z`. All outputs are local and gitignored:

```text
.skia/dist/20260805T001500Z/
  repo-hld-20260805T001500Z.md
  repo-lld-20260805T001500Z.md
  repo-collapsed-evidence-20260805T001500Z.md
  repo-behavior-cards-20260805T001500Z.json
  repo-coverage-20260805T001500Z.json
  repo-manifest-20260805T001500Z.json
```

The manifest binds every artifact to the same repository snapshot, run ID,
scanner version, generation configuration, model/provider disclosure, file
hashes, and coverage summary. HLD and LLD are review aids, not maintained
architecture records or proof of runtime behavior.

Skia itself does not upload these artifacts. Agent-assisted generation may
send bounded repository context to the configured agent or model under that
provider's policy, so the command must disclose the boundary and obtain
explicit consent before any egress. A local-model adapter may be used when no
code may leave the machine.

---

## Shared truth boundaries

Both modes must preserve these rules:

- Raw source is authoritative and always available on demand.
- Deterministic facts and model-derived claims are separate data types.
- A prediction is recorded before feedback.
- `source_derived_match`, `source_derived_mismatch`, and `not_checkable` are
  narrow path statuses, never correctness verdicts.
- Unsupported, excluded, unmapped, unselected, and failed regions remain
  explicit.
- No generated view may claim whole-change or whole-repository coverage when
  the coverage manifest says otherwise.
- No source file, Git index, commit, hook, package command, or project
  configuration is modified by a comprehension run.
- Local receipts and repository artifacts may contain sensitive code-derived
  information and require an inspect/delete lifecycle.

---

## Evidence status

The problem is plausible; this product is unvalidated. Research suggests that
AI assistance can increase output while weakening short-term understanding,
and that causal teach-back can improve later maintenance performance in a
novice setting. None of the cited studies validates Skia, collapsed
equivalence evidence, a minimal Behavior Card, agent-generated HLD/LLD, or a
professional developer workflow.

See [docs/VALIDATION.md](docs/VALIDATION.md) for sources, limitations, proposed
experiments, and claims the project must not make.

---

## Explicit non-goals for the first implementation

- Proving semantic or runtime equivalence
- Replacing tests, type checking, static analysis, or human review
- Treating Tree-sitter syntax as intent, type flow, or a complete call graph
- Automatically modifying project source or adopting generated code
- Hiding unsupported languages or unmapped changes
- Persisting team-visible comprehension scores or employee surveillance data
- Installing a blocking Git hook before the manual workflows are validated
- Treating generated HLD or LLD as authoritative maintained documentation
- Full polyglot behavioral analysis
- CI review comments, SARIF, plugins, or a hosted dashboard

---

## Open decisions

Release blockers and experiment decisions are tracked in
[docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md), including:

1. the replacement project and command name;
2. the exact collapsed-evidence grammar and safe-reduction threshold;
3. agent/provider adapters and consent UX;
4. the default subsystem card cap;
5. local artifact retention and deletion;
6. staged and repository size limits; and
7. the professional-developer validation design.

---

## Ways to contribute now

This remains a documentation-only project. Useful contributions include:

- small synthetic TypeScript fixtures for collapsed evidence and source checks;
- repository-layout fixtures for TypeScript-first HLD/LLD coverage;
- adversarial cases that should remain unmapped or `not_checkable`;
- privacy, agent-boundary, and prompt-injection design feedback;
- corrections to requirements, schemas, examples, and citations; and
- proposals mapped to acceptance criteria in IMPLEMENTATION_PLAN.md.

Do not submit proprietary source, secrets, personal data, or code you do not
have the right to publish. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Documents

| Document | Purpose |
|----------|---------|
| [PRD.md](PRD.md) | Product requirements, modes, schemas, success metrics, and kill criteria |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Proposed deterministic scanner, agent boundary, Git snapshot model, and artifact pipeline |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Acceptance criteria and incremental implementation order |
| [docs/artifacts/README.md](docs/artifacts/README.md) | Canonical staged and repository output examples |
| [docs/VALIDATION.md](docs/VALIDATION.md) | Evidence, limitations, experiments, and prohibited claims |
| [docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md) | Unresolved design and release decisions |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Safe contribution paths for this documentation-only stage |
| [GOVERNANCE.md](GOVERNANCE.md) | Decision, review, merge, agent, and privacy governance |
| [SECURITY.md](SECURITY.md) | Reporting, threat model, privacy, and future release controls |
| [.github/REPOSITORY_METADATA.md](.github/REPOSITORY_METADATA.md) | Public About text, topics, rename gate, and release metadata guidance |

---

## License

MIT. See [LICENSE](LICENSE).
