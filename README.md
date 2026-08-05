# Skia

> **Read less code. Predict the behavior that matters.**

Skia is a proposed local comprehension checkpoint for developers working with
AI-generated code. It compresses supported TypeScript behavior into a short,
source-anchored view, asks one concrete prediction, and reveals feedback only
after the developer answers.

```text
AI writes a change
        |
        v
Skia captures the exact Git snapshot
        |
        v
12 changed lines become 4 evidence lines
        |
        v
Developer predicts one outcome
        |
        v
Source-derived feedback + original code on demand
```

> **Current status: documentation-only.** There is no CLI, package, binary, or
> generated HLD/LLD yet. The commands below define the intended product.
>
> **Release blocker:** "Skia" conflicts with Google's established
> [Skia graphics project](https://github.com/google/skia). The project and
> command must be renamed before publication. See
> [open decisions](docs/OPEN_DECISIONS.md).

---

## The idea in one screen

| | Staged change | Whole repository |
|---|---|---|
| Command | `skia review` | `skia repo review` |
| Snapshot | Exact staged Git index | One committed `HEAD` |
| Default view | Collapsed changed behavior | Compact HLD, LLD, and architecture evidence |
| Human check | Predict one observable result | One architecture question plus selected subsystems |
| Source detail | TypeScript and TSX | TypeScript/TSX detail; manifests, config, and docs inform structure |
| Output | Local comprehension receipt | Timestamped local bundle under `.skia/dist/` |
| What stays visible | Unmapped changed lines | Unsupported languages and unchecked subsystems |

The product is built around one constraint:

> **A reduced view is useful only when it is shorter than the source and honest
> about what it could not represent.**

---

## Mode 1 -- understand a staged change

```text
$ skia review

calculateFinalPrice                  12 changed lines -> 4 evidence lines

  total <= 0       -> return 0
  active member    -> total * 0.90
  valid promotion  -> subtract promotion amount
  final result     -> clamp at 0, then round

BEHAVIOR CHECK
Given: total=100, member=active, promotion=10
When:  calculateFinalPrice(total, member, promotion)
Expected return: ___
> 80

Source check: source-derived match for this displayed path

[e] evidence details  [d] original staged diff  [n] next
```

### What happened?

```text
Raw staged source
      |
      +-- deterministic syntax facts
      |
      +-- collapsed equivalence evidence       <- default reading surface
      |
      +-- system supplies GIVEN + WHEN
      |
      +-- developer supplies THEN
      |
      +-- prediction is saved
      |
      +-- narrow source check appears
```

The developer normally enters one value, not a five-field essay. `BECAUSE` is
requested only after a mismatch or an explicit causal/risk prompt. `IMPACT` is
reserved for a relevant high-risk path.

The original source and expanded evidence are behind one labelled menu action
and one terminal keystroke.

### What if compression is unsafe?

Skia does not fill the gap with confident prose:

```text
WARNING: 7 changed TypeScript lines are unmapped.

Not represented:
  - import change
  - deleted callback
  - compound stateful branch

[d] inspect unmapped diff  [s] skip  [q] stop
```

A completed prediction covers one supported path. It never turns unmapped or
unsupported code into reviewed coverage.

### Initial boundary

- TypeScript and TSX only
- Named functions and methods only
- At most 3 supported changed entities
- At most 150 added-plus-deleted TypeScript lines
- Manual command; no automatic Git hook

These are pilot limits, not risk or safety benchmarks.

---

## Mode 2 -- understand a TypeScript-first repository

```text
$ skia repo review

Snapshot:     HEAD c8d1a18
Scanned:      84 TypeScript files, 3 config files, 5 docs
Unsupported:  2 Python files
Subsystems:   api, billing, persistence, notifications, web

Architecture check: included
Card cap: 3

Select up to 2 subsystems:
  [x] billing
  [x] persistence
  [ ] api
  [ ] notifications
  [ ] web
```

Repository mode has two layers:

```text
Committed repository snapshot
        |
        +-- deterministic scan facts
        |     paths, packages, entry points, imports, exports, direct calls
        |
        +-- explicit agent consent
        |
        +-- model_derived drafts
        |     HLD, LLD, subsystem labels, architecture relations
        |
        +-- architecture Behavior Card
        |
        +-- developer-selected subsystem cards
```

The architecture check is always included. When the repository has more
subsystems than one short session should cover, the developer chooses which
ones to check. Everything else is recorded as `unchecked`; Skia does not group,
rank, or sample those areas silently.

### Timestamped local output

One run ID is shared by the directory and every filename:

```text
.skia/dist/20260805T001500Z/
  repo-hld-20260805T001500Z.md
  repo-lld-20260805T001500Z.md
  repo-collapsed-evidence-20260805T001500Z.md
  repo-behavior-cards-20260805T001500Z.json
  repo-coverage-20260805T001500Z.json
  repo-manifest-20260805T001500Z.json
```

All artifacts are local and gitignored. The manifest binds them to the same
commit, run ID, scanner version, model/provider disclosure, claim provenance,
artifact hashes, selected/unchecked subsystems, and coverage.

HLD and LLD are review aids, not authoritative architecture documentation.

### Agent privacy boundary

Before any repository context leaves the machine, Skia must show:

- provider and model;
- proposed files and byte/token budget;
- sensitive-path exclusions;
- provider retention caveat;
- allowed provider endpoints; and
- local output location.

The developer must consent explicitly. Declining preserves deterministic scan
output and marks agent-generated HLD/LLD unavailable. A local-model adapter may
be used when source cannot leave the machine.

---

## The truth contract

| Label | What it means | What it does not mean |
|---|---|---|
| `deterministic` | Directly computed from the captured snapshot | Correct intent or runtime behavior |
| `model_derived` | Generated by the configured agent from bounded evidence | Verified, authoritative, or complete |
| `developer_supplied` | Entered by the developer before feedback | Proven understanding |
| `source_derived_match` | One prediction matches one supported source endpoint | Runtime verification or correctness |
| `not_checkable` | The safe checker cannot judge this path | Failure or success |
| `unchecked` | The subsystem was not selected | Reviewed coverage |

Across both modes:

- Raw source remains authoritative and available on demand.
- Predictions are recorded before feedback.
- Unsupported, excluded, failed, unmapped, and unchecked areas remain explicit.
- Comprehension runs do not modify source, Git state, hooks, or project config.
- Local artifacts may still be sensitive and require inspect/delete controls.

---

## What Skia is not

```text
not a linter              not a test runner
not semantic proof        not a code-quality verdict
not an AI PR reviewer     not a source-rewrite engine
not employee scoring      not authoritative architecture docs
```

The project must not claim that it improves comprehension, proves equivalence,
covers an entire change/repository, or produces verified HLD/LLD until its own
evidence supports those claims.

---

## Why test this?

Research suggests that AI assistance can increase output while weakening
short-term understanding, and that causal teach-back can improve later
maintenance performance in one novice setting. None of that evidence validates
this product or its professional workflow.

The first real question is simpler:

> **Can collapsed evidence reduce reading while preserving enough truth for a
> developer to predict behavior more accurately than with a raw diff or passive
> summary?**

See [Validation and Evidence](docs/VALIDATION.md) for sources, competing tools,
experiment design, and kill criteria.

---

## Project status

```text
[x] Product and architecture specification
[x] Output contracts and validation plan
[x] Contribution, governance, and security boundaries
[ ] Canonical JSON Schemas and executable fixtures
[ ] Staged reduced-reading prototype
[ ] Repository structural scanner
[ ] Agent-assisted HLD/LLD prototype
[ ] Professional developer validation
[ ] Rename and release readiness
```

No implementation begins by treating the specification as proof that the idea
works. The project should narrow, pivot, or stop if the reduced view is not
meaningfully shorter, hides behavior, becomes ritual friction, or produces
unreliable architecture drafts.

---

## Contribute at the current stage

Useful contributions are evidence and design pressure, not unsolicited product
code:

- synthetic staged TypeScript fixtures;
- synthetic TypeScript-first repository layouts;
- cases that must remain unmapped or `not_checkable`;
- prompt-injection, privacy, and provider-boundary cases;
- schema, requirement, or citation corrections; and
- implementation proposals mapped to acceptance criteria.

Never submit proprietary source, secrets, personal data, private paths, or
sensitive architecture. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Document map

```text
README (you are here)
  |
  +-- PRD ----------------------- product behavior and success/kill criteria
  +-- ARCHITECTURE -------------- Git, scanner, agent, and storage design
  +-- IMPLEMENTATION_PLAN ------- acceptance criteria and build order
  +-- docs/artifacts/README ----- exact staged and repository output examples
  +-- docs/VALIDATION ----------- evidence, competitors, and experiments
  +-- docs/OPEN_DECISIONS ------- unresolved release and design choices
  +-- CONTRIBUTING -------------- safe ways to challenge or extend the design
  +-- SECURITY ------------------ reporting, threat model, and privacy boundary
```

| Document | Link |
|---|---|
| Product requirements | [PRD.md](PRD.md) |
| Technical design | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Acceptance criteria | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) |
| Output reference | [docs/artifacts/README.md](docs/artifacts/README.md) |
| Evidence and experiments | [docs/VALIDATION.md](docs/VALIDATION.md) |
| Open decisions | [docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md) |
| Governance | [GOVERNANCE.md](GOVERNANCE.md) |
| Security | [SECURITY.md](SECURITY.md) |
| Repository metadata guidance | [.github/REPOSITORY_METADATA.md](.github/REPOSITORY_METADATA.md) |

---

## License

MIT. See [LICENSE](LICENSE).
