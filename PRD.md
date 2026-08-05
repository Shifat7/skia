# Skia -- Product Requirements Document

**Status:** Documentation-only. No runnable CLI, package, generated HLD, or
LLD exists.

**Version:** PRD v4 -- reduced-reading collapsed evidence plus an
agent-assisted TypeScript-first repository comprehension mode.

---

## 1. Product thesis

AI coding agents can generate changes faster than developers can read them.
The product problem is not only defective code; it is the widening gap between
how much code a developer is responsible for and how much behavior they can
predict.

Skia proposes two local comprehension checkpoints:

1. **Staged mode** reduces a small staged TypeScript change to collapsed
   equivalence evidence and asks one minimal behavior prediction per supported
   changed entity.
2. **Repository mode** creates a TypeScript-first architecture snapshot,
   generates timestamped HLD and LLD drafts with an explicitly configured
   agent, and checks system plus developer-selected subsystem understanding.

The common primitive is **predict after evidence, before feedback**. Raw source
remains authoritative. Generated views are allowed to reduce reading only when
they expose their source anchors, derivation, coverage, and uncertainty.

### 1.1 Reduced reading, not summary replacement

The default surface should be materially shorter than the source it represents.
It uses compact code-like relations instead of a prose report:

```text
total <= 0       -> return 0
active member    -> total * 0.90
valid promotion  -> subtract promotion amount
final result     -> clamp at 0, then round
```

This is **collapsed equivalence evidence**, not proof of semantic equivalence.
Phase 0 may call an item equivalent only within its declared supported syntax
and path boundary. If safe reduction is not possible, the item is partial,
unmapped, unsupported, or `not_checkable`; the original source remains behind
one labelled menu action (one terminal keystroke in Phase 0).

### 1.2 Representation layers

Skia must keep these layers distinct:

| Layer | Produced by | Meaning |
|-------|-------------|---------|
| Raw source | Git snapshot | Authoritative bytes under review |
| Deterministic facts | Git and syntax scanner | Directly observed paths, declarations, imports, calls, branches, and ranges |
| Collapsed evidence | Deterministic reducer, or model with explicit label | Short behavior or architecture relations with source anchors and coverage state |
| Behavior Card | System scenario plus developer prediction | One concrete claim made before feedback |
| Source check | Deterministic narrow checker | Comparison against one supported source path; never runtime proof |
| HLD and LLD | Configured agent grounded by scan facts and bounded source | Model-derived design drafts; never authoritative architecture records |

---

## 2. Target user and jobs to be done

### 2.1 Primary user

An individual developer who uses AI coding tools and is responsible for
TypeScript changes they did not write line by line.

### 2.2 Staged-mode job

> When I stage an AI-assisted TypeScript change, show me the shortest truthful
> view of its supported changed behavior, then make me predict one concrete
> result before I move on, without hiding anything the reduction could not
> represent.

### 2.3 Repository-mode job

> When I inherit or revisit a TypeScript-first repository, give me a local,
> timestamped architecture snapshot and a short comprehension check at the
> system and selected-subsystem levels, while showing which files, languages,
> and claims the snapshot did not cover.

### 2.4 Deferred team use

Phase 0 does not provide team dashboards, employee scores, shared receipts, or
manager-visible compliance. Local artifacts may later be exported only through
a separately designed consent, privacy, and trust boundary.

### 2.5 What Skia is not

Skia is not a replacement for source review, tests, type checking, static
analysis, security review, or maintained architecture documentation. It does
not prove intent, correctness, semantic equivalence, or developer
understanding.

---

## 3. Shared product contracts

### 3.1 Snapshot identity

Every run operates on one immutable logical snapshot.

- Staged mode binds to the Git index plus one captured base commit.
- Repository mode binds to one captured `HEAD` commit.
- All displayed source, scan facts, generated evidence, cards, and artifacts
  must refer to that same snapshot.
- If the index or selected repository state changes during capture, the command
  aborts or restarts; it never mixes hashes and blobs from different states.
- The implementation must disable Git lazy fetch and optional locks for
  read-only operations, discover all statuses before selecting supported ones,
  preserve path bytes internally, and reject unsupported file modes.

### 3.2 Coverage accounting

Coverage is data, not a marketing statement. Every mode records:

- included files and source regions;
- excluded, ignored, generated, vendor, oversized, unreadable, and failed files;
- unsupported languages and file modes;
- mapped and unmapped changed lines in staged mode;
- scanned and unscanned subsystems in repository mode;
- deterministic and model-derived claim counts; and
- parse or generation failures.

No complete card status, HLD, LLD, or generated evidence may suppress those
counts.

### 3.3 Derivation and confidence

Every generated claim has one derivation:

- `deterministic` -- directly computed from the captured snapshot;
- `model_derived` -- generated by an agent from scan facts and bounded source;
- `developer_supplied` -- entered by the developer; or
- `not_available` -- intentionally absent with a reason.

Model-derived claims require source anchors where possible plus a confidence of
`high`, `medium`, or `low`. Confidence is a disclosure, not correctness.

### 3.4 No automatic adoption

A comprehension command does not modify source, the Git index, commits, hooks,
package configuration, or project documentation. Phase 0 creates local state
only under `.skia/`. Any future source-rewrite or adoption workflow requires a
separate spec, test gate, and explicit approval.

---

## 4. Mode 1 -- staged change checkpoint

### 4.1 Command

```text
skia review
```

No hook is installed in Phase 0. The developer invokes the command manually.

### 4.2 Staged workflow

1. Discover the repository root and capture base-commit and branch/detached
   state. An unborn branch is represented explicitly and uses an empty base.
2. Capture an immutable logical copy of the index and its identity.
3. Read the complete NUL-delimited staged status set before partitioning
   supported and unsupported entries.
4. Reject or disclose renames, deletions, conflicts, type changes, submodules,
   symlinks, binaries, non-regular modes, invalid source encoding, and other
   unsupported inputs.
5. Read base and staged blobs from the captured snapshot, never from the
   working-tree copy.
6. Parse `.ts` and `.tsx` with matching Tree-sitter grammars.
7. Count total, mapped, and unmapped added-plus-deleted TypeScript lines.
8. Refuse the session when the provisional pilot budget exceeds 3 supported
   entities or 150 changed TypeScript lines.
9. Process every supported entity in deterministic path and source order.
10. Show collapsed evidence first. Original changed source and detailed anchors
    are available on demand.
11. Supply a concrete `GIVEN` and auto-filled `WHEN`; collect the developer's
    predicted `THEN` or skip.
12. Persist the prediction before any source-check feedback.
13. Show a narrow source check when eligible, plus an optional unexecuted probe
    specification.
14. Write one local receipt bound to the snapshot.

### 4.3 Supported entities

Phase 0 supports named function declarations and named methods. Nested entities
must have one deterministic ownership rule so one changed line cannot produce
duplicate enclosing and nested cards. Arrow functions, anonymous callbacks,
interfaces, aliases, enums, whole classes, wholly deleted entities, and other
constructs remain unsupported until fixtures justify support.

### 4.4 Collapsed evidence contract

A staged evidence item contains:

| Field | Meaning |
|-------|---------|
| `kind` | `guard`, `branch`, `transformation`, `call`, `side_effect`, `error`, `contract`, or `fallback` |
| `relation` | Compact code-like relation shown to the developer |
| `source_anchors` | Base and/or staged path, line range, and snapshot blob identity |
| `derivation` | `deterministic` in Phase 0 staged mode |
| `coverage` | `supported`, `partial`, `unmapped`, or `unsupported` |
| `details_available` | Whether expanded source/evidence can be shown |

The relation must not contain an effect that cannot be traced to the displayed
source anchors. Removed constructs use base-side anchors; added constructs use
staged-side anchors. A fallback hunk is not promoted to a behavior claim.

### 4.5 Minimal Behavior Card

The normal interaction collects one prediction, not five mandatory essays:

```json
{
  "scenario": {
    "given": {
      "arguments": { "total": 100, "member": "active", "promotion": 10 },
      "state_note": null
    },
    "when": {
      "entity": "calculateFinalPrice",
      "invocation": "calculateFinalPrice(total, member, promotion)"
    }
  },
  "prediction": {
    "kind": "return_value",
    "value": 80
  },
  "because": null,
  "impact": null,
  "action": "complete"
}
```

Rules:

- `GIVEN` and `WHEN` are system-supplied and shown before the answer.
- The developer supplies `THEN`, represented by `prediction`.
- `BECAUSE` is requested after a mismatch, when the user chooses to explain,
  or when a risk-focused template requires causal reasoning.
- `IMPACT` is requested only for a selected high-risk or caller-visible prompt.
- Skip is always available and never implies a passed review.
- The receipt distinguishes prompts presented, predictions completed, and
  entities skipped.

### 4.6 Narrow source check

A source check is eligible only when the scenario binds one allowlisted atomic
predicate and the selected branch ends in a directly observed JSON-scalar
return or literal-message throw. The implementation must define and fixture:

- true and false branch selection;
- early returns and block endpoints;
- multiple eligible branches and precedence;
- object and positional argument binding;
- parameter shadowing;
- changed-predicate and changed-endpoint overlap; and
- every unsupported stateful, compound, coercive, or non-literal case.

Receipt status is exactly `source_derived_match`,
`source_derived_mismatch`, or `not_checkable`. Even a match concerns only one
source path. It never proves reachability, runtime behavior, equivalence, or
correctness.

### 4.7 Probe specification

An eligible exported top-level function may produce a structured, unexecuted
experiment suggestion:

```json
{
  "status": "draft_unexecuted",
  "invoke": { "entity": "calculateFinalPrice", "arguments": [100, true, 10] },
  "expect": { "kind": "return_value", "value": 80 }
}
```

Ineligible predictions produce `{ "status": "not_available", "reason": "..." }`.
A probe is never source code, never written into the project, never run, and
never described as a test result.

### 4.8 Staged receipt

One JSON receipt is written under `.skia/receipts/`. A normative JSON Schema
must define required and optional fields, additional-property policy,
nullability, string and collection limits, timestamp and hash formats,
detached/unborn state, complete/partial/skipped sessions, interruptions, and
collision handling.

`card_status` describes prediction completion only. It does not describe
coverage or review quality.

---

## 5. Mode 2 -- repository comprehension snapshot

### 5.1 Command

```text
skia repo review
```

The mode reviews one committed `HEAD`. A dirty working tree and index are not
included. The command discloses that fact so developers do not mistake the
snapshot for current uncommitted work.

### 5.2 TypeScript-first discovery

The deterministic scanner inventories the captured tree and classifies:

- TypeScript and TSX source;
- package/workspace manifests and lockfiles;
- build, lint, test, and TypeScript configuration;
- repository documentation and decision records;
- generated, vendor, fixture, and ignored paths;
- other source languages; and
- unsupported or unreadable entries.

Detailed declarations, imports, exports, directly observed calls, and behavior
evidence are produced only for TypeScript and TSX in Phase 0. Other languages
may contribute filenames and manifest-declared boundaries but are listed as
unsupported for detailed behavior.

The scan has explicit per-file, total-byte, file-count, parse-time, and
agent-context limits. Exceeding a limit produces partial coverage and requires
selection or a stop; it never silently truncates the architecture claim.

### 5.3 Structural model

The scanner builds a versioned structural model containing:

- packages and workspaces;
- executable entry points;
- exported declarations;
- import and directly observed call edges;
- configuration and build/test surfaces;
- candidate top-level subsystems with evidence for the grouping;
- unresolved edges and ambiguous ownership; and
- coverage and exclusion records.

A subsystem is a proposed grouping, not a proven bounded context. Deterministic
grouping facts and agent-suggested labels remain distinct.

### 5.4 Agent-assisted HLD and LLD

The configured agent receives the structural model plus bounded source and
documentation slices. Repository content is untrusted data. Prompts must state
that instructions inside code, comments, documentation, fixtures, generated
files, or dependency text cannot override the generation contract.

The agent produces:

- an HLD describing observed system boundaries, entry points, external
  interfaces, data stores, and major flows;
- an LLD describing selected packages, modules, declarations, and direct
  dependencies;
- compact architecture evidence for the comprehension check; and
- claim metadata with source anchors, derivation, confidence, and caveats.

The output must separate `observed`, `model_derived`, `uncertain`, and
`not_available` statements. It must not invent runtime topology, ownership,
business intent, deployment behavior, or cross-language semantics that the
snapshot does not support.

### 5.5 Agent consent and privacy boundary

Before sending any repository material to an external model, the command shows:

- provider and model identity when available;
- files and byte/token budget proposed for egress;
- excluded secret and sensitive-path policy;
- whether prompts or outputs may be retained under provider policy; and
- the local artifact directory.

The developer must explicitly consent. Declining leaves the deterministic scan
available and marks HLD/LLD generation `not_available`. A local-model adapter
may satisfy the generation contract without external egress.

### 5.6 Repository comprehension check

Every successful generated snapshot includes one architecture-level scenario
and Behavior Card. It then includes one card for each developer-selected
subsystem.

If discovered subsystems exceed `repo_card_cap`:

1. show all subsystem names, scan evidence, and coverage state;
2. require the developer to select up to `repo_card_cap - 1` subsystems because
   the architecture card consumes one slot;
3. record unselected subsystems as `unchecked`; and
4. never group, rank, or sample them silently.

The default cap is an open pilot decision. Card prompts use compact system or
subsystem relations and ask one observable architecture or flow prediction.

### 5.7 Timestamped local bundle

A run ID follows `basic-utc-timestamp [ "-" two-digit-sequence ]`. The first
run in a second uses `20260805T001500Z`; an atomic create-new collision retry
uses `20260805T001500Z-01`, then `-02`, and so on. No existing output is
overwritten.

```text
.skia/dist/20260805T001500Z/
  repo-hld-20260805T001500Z.md
  repo-lld-20260805T001500Z.md
  repo-collapsed-evidence-20260805T001500Z.md
  repo-behavior-cards-20260805T001500Z.json
  repo-coverage-20260805T001500Z.json
  repo-manifest-20260805T001500Z.json
```

All files share the same run ID. `.skia/` remains gitignored.

### 5.8 Repository manifest

The manifest is the bundle authority and records:

- schema and tool version;
- run ID and completion timestamp;
- repository root identity without uploading a local absolute path;
- commit OID and branch/detached state;
- scanner configuration and resource limits;
- agent/provider/model disclosure and generation parameters;
- cryptographic hash of each non-manifest artifact;
- included, excluded, unsupported, failed, and unchecked coverage;
- deterministic and model-derived claim counts;
- selected and unselected subsystems;
- Behavior Card completion status; and
- privacy and deletion caveats.

The HLD and LLD link back to manifest claim IDs rather than duplicating
unverifiable assertions.

### 5.9 Artifact lifecycle

Repository artifacts are potentially sensitive. Phase 0 must provide a local
way to list, inspect, and delete runs. Files are created atomically with
owner-only permissions where supported. The writer must reject symlinked output
roots and link-following, avoid predictable temporary files, and never
overwrite an existing run.

No automatic retention, upload, sharing, or tracked-document export exists in
Phase 0.

---

## 6. Non-functional requirements

### NFR-1: Honest determinism

Given the same snapshot and scanner version, deterministic scan facts,
coverage, and staged evidence are reproducible. Agent-generated HLD/LLD may vary;
the manifest records enough provider and configuration data to disclose that
limit. The product must not call model output deterministic.

### NFR-2: Resource bounds

Both modes enforce file-count, per-file-byte, total-byte, parse-time, output,
and terminal-input limits. Repository mode also enforces agent-context and
output-token budgets. Limits fail explicitly with partial coverage or no
artifact, never silent truncation.

### NFR-3: Read-only source behavior

No command writes outside `.skia/`, invokes package scripts, executes project
code, loads repository plugins, or follows repository-provided instructions.
Read-only Git invocations use structured argument arrays, fixed environment
hardening, exit-status checks, and escaped diagnostics.

### NFR-4: Terminal safety and accessibility

Untrusted paths, source excerpts, errors, and model output are escaped before
terminal rendering. Control characters cannot alter the terminal. The flow
works without ANSI color and has deterministic non-interactive failure.

### NFR-5: Privacy by default

Staged mode has no network path. Repository mode performs no external egress
until explicit agent consent; after consent, transport is restricted to the
disclosed provider endpoint allowlist and cannot silently follow redirects or
fallback to another provider. Local artifacts avoid unnecessary absolute paths,
user identity, environment variables, secrets, and raw source duplication.

### NFR-6: Schema-first outputs

Every JSON artifact has a versioned normative JSON Schema. Examples are
generated or validated from canonical fixtures rather than manually duplicated
across documents.

---

## 7. Validation plan

### 7.1 Mechanical validation

Before behavioral claims, tests must prove:

- immutable staged and repository snapshot identity under concurrent mutation;
- all-status discovery before supported filtering;
- detached and unborn HEAD handling;
- spaces, non-UTF-8 paths, control characters, symlinks, submodules, binaries,
  conflicts, type changes, partial clones, and missing objects;
- `GIT_NO_LAZY_FETCH=1` and `GIT_OPTIONAL_LOCKS=0` behavior;
- TS versus TSX grammar selection and current pinned crate APIs;
- deterministic entity and subsystem ordering;
- complete coverage arithmetic and explicit unsupported regions;
- collapsed-evidence source anchoring and safe fallback;
- prediction persistence before feedback;
- source-check operator, branch, binding, and endpoint truth tables;
- normative receipt and repository-bundle schema validation;
- timestamp collision, interruption, atomic write, permission, symlink, and
  deletion behavior;
- agent prompt-injection resistance and model-derived claim labelling; and
- zero writes outside `.skia/` plus zero unintended package or project code
  execution.

### 7.2 Behavioral feasibility

First run moderated prototypes with professional AI-assisted TypeScript
developers. Compare:

- raw staged diff;
- collapsed evidence only; and
- collapsed evidence plus minimal Behavior Card.

Repository-mode feasibility separately compares raw repository exploration with
the timestamped HLD/LLD plus architecture/subsystem checks.

Activity measures -- opens, scrolls, skips, completion, time, return, subsystem
selection, and artifact inspection -- are secondary feasibility signals. They
are not comprehension outcomes.

### 7.3 Comprehension efficacy

A later preregistered trial requires one objective primary outcome, blinded
scoring, an attention-matched control, baseline adjustment, intention-to-treat
analysis, delayed novel transfer, missing-data and contamination rules, and a
minimum worthwhile effect that justifies the interaction cost.

The project must not claim improved comprehension from card completion,
retention, self-report, or source-check matches alone.

---

## 8. Success, kill, and pivot criteria

Proceed only when:

- snapshot and coverage invariants pass adversarial fixtures;
- collapsed evidence is materially shorter than the supported source in a
  predeclared share of realistic fixtures without omitting tested behavior;
- professional developers complete the short flow with acceptable friction;
- objective comprehension shows a worthwhile effect over an attention-matched
  baseline; and
- repository HLD/LLD claims meet a predeclared source-anchor and factual-accuracy
  bar under blinded review.

Stop, narrow, or pivot when:

1. safe collapsed evidence is not meaningfully shorter than source;
2. reductions omit behavior often enough to create false confidence;
3. developers still need the original diff for most supported cases;
4. the minimal card becomes ritual compliance or adds no objective benefit;
5. repository artifacts are too large to reduce reading;
6. model-derived HLD/LLD cannot maintain source-grounded factual accuracy;
7. agent egress or local artifacts create unacceptable privacy risk;
8. TypeScript-first coverage leaves critical repository behavior unsupported;
9. existing comprehension tools provide equal behavior change with less setup;
   or
10. the project name remains unresolved at release time.

---

## 9. Risks

| Risk | Likelihood | Impact | Required response |
|------|------------|--------|-------------------|
| Collapsed evidence hides behavior | High | High | Coverage manifest, source anchors, fixtures, and mandatory fallback |
| Behavior Card becomes ritual | High | High | One prediction by default, objective validation, and kill criteria |
| Mixed Git snapshot | Medium | High | Immutable logical capture and race tests |
| Model-generated HLD/LLD fabricates intent | High | High | Derivation labels, source anchors, uncertainty, and blinded audits |
| Repository prompt injection controls agent | High | High | Treat repository text as data and constrain agent tools/prompts |
| Local artifacts leak architecture | Medium | High | Gitignore, consent, owner-only atomic writes, list/delete lifecycle |
| Whole-repo output increases reading | High | High | Short HLD, bounded LLD, subsystem selection, and output-size metrics |
| Unsupported languages create false completeness | Medium | High | Explicit TypeScript-first coverage and unsupported-language inventory |
| Agent/provider friction blocks adoption | Medium | Medium | Deterministic scan fallback and adapter boundary |
| Name collision prevents discovery | High | High | Rename before package or command publication |

---

## 10. Phased roadmap

### Phase 0A -- staged reduced-reading prototype

Implement immutable staged capture, TypeScript entity extraction, collapsed
evidence, minimal Behavior Card, narrow source checks, local receipts, and
fixtures. Validate reduced reading before any Git hook.

### Phase 0B -- repository structural prototype

Implement committed-tree scanning, TypeScript-first structural model, coverage,
subsystem discovery, and timestamped local bundle schemas without agent
generation.

### Phase 0C -- agent-assisted architecture draft

Add explicit-consent agent generation for HLD, LLD, collapsed architecture
evidence, system card, and selected subsystem cards. Audit prompt injection,
privacy, factual grounding, and output size.

### Phase 0D -- professional validation

Run feasibility and preregistered comprehension experiments. Publish a decision
memo that proceeds, narrows, pivots, or stops.

### Deferred

Automatic hooks, tracked-document export, team dashboards, employee metrics,
source rewriting, code adoption, full polyglot behavior, CI comments, plugins,
and hosted services require separate evidence and specifications.
