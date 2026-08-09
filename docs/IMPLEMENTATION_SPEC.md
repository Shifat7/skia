# Spec: Skia Implementation

**Status:** Draft for review. This document completes the specification phase
for the implementation described in [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md).
It does not authorize implementation until the contract-freeze gates are
approved.

**Product name:** Skia

**Product state:** Documentation-only. There is currently no CLI, TypeScript package,
schema implementation, fixture corpus, generated artifact, or product test
suite.

**Implementation boundary:** The next implementation target is Phase 1
Foundations only: the hardened Git boundary, the selected snapshot strategy,
local storage transaction, shared identifiers/hashes/paths/anchors/coverage,
and schema-validation foundations. The staged UI, repository scanner, agent
adapter, and behavioral study are deferred roadmap context in this document;
they are not Phase 1 acceptance criteria.

## Objective

Build a synchronous, local-first TypeScript command-line tool for developers
who are responsible for AI-assisted TypeScript or Python changes or inherited
repositories using those supported source languages.

The tool must reduce reading with compact, source-anchored evidence and require
one concrete prediction before feedback. Raw source remains authoritative. The
tool must make unsupported, unmapped, excluded, failed, model-derived, and
unchecked areas visible rather than converting them into a confident summary.

The implementation has two product surfaces:

1. **Staged change checkpoint:** inspect one immutable staged Git snapshot,
   reduce supported TypeScript/TSX/Python changes into deterministic evidence, ask one
   minimal Behavior Card prediction, and write a local receipt.
2. **Repository comprehension snapshot:** inspect one committed `HEAD`, build a
   TypeScript/Python structural model, optionally generate consent-gated HLD/LLD
   drafts, and ask one architecture card plus developer-selected subsystem
   cards.

The first implementation milestone is a trustworthy deterministic staged slice.
Repository scanning follows after the shared snapshot, source, coverage, and
artifact contracts are stable. External-agent generation is last and remains
behind an explicit provider boundary.

### In scope

- A manual `skia` CLI with staged review, repository review, and local run
  lifecycle commands.
- Regular `.ts`, `.tsx`, and `.py` files for detailed behavior evidence.
- Named function declarations and named methods in staged mode.
- Immutable logical Git snapshots with explicit status and coverage handling.
- Versioned JSON artifacts and local timestamped repository bundles.
- Pure fixtures, temporary Git repositories, golden output tests, and security
  tests.
- An agent adapter contract with explicit consent and no consequential tools.

### Out of scope

- Source rewriting, automatic adoption, hooks, watchers, daemons, or hosted
  services.
- Project code, package scripts, repository plugins, or repository-provided
  instructions executed by Skia.
- Team dashboards, employee scores, compliance tracking, shared receipts, or
  automatic telemetry.
- Full polyglot behavior analysis beyond TypeScript/TSX/Python, complete call graphs, runtime proof,
  semantic-equivalence proof, correctness verdicts, or authoritative HLD/LLD.
- Public package or binary publication until the name and distribution policy
  are deliberately documented. The current maintainer decision is to retain
  the `Skia`/`skia` name; publication and distribution risk remain a release
  decision and are not a Phase 1 implementation blocker.

## Product contracts

### Snapshot identity

Every run operates on one immutable logical snapshot.

- Staged mode binds to one captured base commit, or an explicit empty base on
  an unborn branch, plus one selected immutable index strategy.
- Repository mode binds to one captured `HEAD` commit and reads its tree by
  object ID; working-tree and index changes are excluded and disclosed.
- The snapshot identity includes the base/commit ID, index identity where
  applicable, ordered path/mode/blob records, and canonical diff bytes.
- OD-4 is still open. The implementation must not treat copied-index,
  checksum/manifest, or another strategy as normative until OD-4 records the
  choice, retry policy, identity definition, and race-test evidence. A copied
  index beneath `.skia/` with `GIT_INDEX_FILE` and bounded revalidation is the
  current candidate, not a settled contract.
- The implementation must not write Git trees, refs, objects, the live index,
  hooks, or project files to obtain immutability.
- Git subprocesses use structured arguments and an allowlisted environment:
  `GIT_OPTIONAL_LOCKS=0`, `GIT_NO_LAZY_FETCH=1`, `GIT_PAGER=cat`,
  `PAGER=cat`, `GIT_TERMINAL_PROMPT=0`, and `LC_ALL=C`. External diff and
  text-conversion are disabled, process time/output are bounded, and all
  inherited variables that redirect Git directories, object stores, worktrees,
  configuration, SSH, proxies, or network behavior are cleared. The selected
  snapshot strategy may set `GIT_INDEX_FILE` to its protected copy; no other
  inherited Git override is accepted.

Staged unborn behavior is explicit: `base_state: unborn`, `base_commit: null`,
and an empty base tree are recorded in the receipt. Added regular TS/TSX/Python
files may be reviewed against that empty base. Repository mode rejects missing
`HEAD` with a stable no-commit error; staged mode does not.

### Coverage and derivation

Coverage is data, not a success claim. The shared model uses separate fields:

- `derivation`: `deterministic`, `model_derived`, `developer_supplied`, or
  `not_available`;
- `coverage`: `supported`, `partial`, `unmapped`, `unsupported`, `excluded`,
  `failed`, or `unchecked`;
- `confidence`: `high`, `medium`, or `low` only for model-derived claims; and
- `claim_state`: `observed`, `uncertain`, or `not_available` for every generated
  claim or relation.

These fields must not be collapsed into one enum. A completed prediction does
not change coverage. A source-derived match does not mean correctness,
reachability, runtime verification, or review approval.

Every generated claim requires derivation, claim state, source anchors where
possible, confidence when model-derived, and an explicit `not_available` reason
when an anchor or confidence value cannot be supplied. The artifact schemas
must reject generated claims that omit this provenance.

### Staged evidence

Each collapsed relation contains:

- a stable relation ID scoped to the snapshot;
- `kind`: `guard`, `branch`, `transformation`, `call`, `side_effect`, `error`,
  `contract`, or `fallback`;
- compact code-like relation text;
- one or more base/staged source anchors containing path, line/column range,
  and blob identity;
- `derivation: deterministic`;
- explicit coverage; and
- `details_available` indicating whether expanded source/evidence is available.

The reducer may emit only directly observed guards, branches, transformations,
direct calls, direct side effects, literal errors, contract changes, or an
explicit fallback. If a relation cannot be traced to its anchors, it must be
partial or fallback rather than a stronger behavior claim.

### Behavior Cards and source checks

- `GIVEN` and `WHEN` are system-owned; `THEN` is developer-supplied.
- The staged pilot presents at most one prediction per supported entity.
- OD-3 remains open. The current literal-only, allowlisted scenario proposal is
  provisional; it must not be treated as the final generation rule until OD-3
  records the choice and fixture evidence. Any pre-OD-3 implementation must
  use fixture-defined scenarios or return `not_available` and offer skip.
- The prediction is persisted before any feedback. Later explanation or impact
  text is separate from the original prediction.
- `BECAUSE` is requested after a mismatch, an explicit explanation request, or
  a causal-risk prompt. `IMPACT` is requested only for a selected high-risk or
  caller-visible prompt. Both are optional and separate from the immutable
  pre-feedback prediction.
- Source checking is eligible only for an allowlisted atomic predicate ending
  in a directly observed JSON-scalar return or literal-message throw.
- Source-check status is exactly `source_derived_match`,
  `source_derived_mismatch`, or `not_checkable`.
- Probe specifications are eligible only for exported top-level functions with
  allowlisted literal/JSON arguments and a supported direct endpoint. Eligible
  probes use `draft_unexecuted`; ineligible or unsupported probes use
  `not_available` with a stable reason. Probes are never source code, tests, or
  project files.

### Repository artifacts

Repository bundles use one UTC basic-ISO run ID in the directory and every
filename:

```text
.skia/dist/<run-id>/
  repo-hld-<run-id>.md
  repo-lld-<run-id>.md
  repo-collapsed-evidence-<run-id>.md
  repo-behavior-cards-<run-id>.json
  repo-coverage-<run-id>.json
  repo-manifest-<run-id>.json
```

Current proposal: all six artifact paths are created for a repository run. If
agent consent is declined or generation is unavailable, HLD/LLD files contain a
schema-defined `not_available` banner and reason; they do not contain
generated claims. The manifest records the absence of generated content and
preserves deterministic scan output. This remains provisional until the
artifact-state approval gate is closed.

Artifacts are created atomically, never overwrite another run, reject symlinked
output roots, use owner-only permissions where supported, and remain local and
gitignored. `runs delete` is the explicit deletion path.

### Staged receipt and lifecycle

The staged receipt uses the current proposed path shape
`.skia/receipts/<run-id>-<session-id>-session.json`, where the run ID follows
the same UTC basic-ISO and collision-suffix proposal as repository bundles and
the session ID is a short collision-resistant local identifier. OD-10 and OD-11
must freeze the exact format, retention, redaction, and deletion guarantees.

The receipt binds schema/tool version, completion state, base/branch/detached/
unborn state, immutable index identity, ordered paths/modes/blob IDs, canonical
diff hash, total/mapped/unmapped TS lines, entities, evidence and anchors,
scenario, pre-feedback prediction, `because`, `impact`, source check, probe
status/reason, actions, duration, errors, and privacy/deletion caveats.
`card_status` describes prediction completion only; coverage is separate.

`runs list`, `runs inspect`, and `runs delete` cover both receipts and
repository bundles. Inspect is read-only and must apply the approved OD-11
redaction policy. Delete targets exactly one validated run beneath `.skia/`; a
partial deletion reports failure and never claims the run was removed.

The staged pilot refuses before interaction when it exceeds three supported
entities or 150 added-plus-deleted supported-language lines. It reports the stable
`staged_budget_exceeded` error and counts/limits, does not silently sample, and
does not emit a complete-coverage claim.

### Agent consent boundary

No repository material leaves the machine before an explicit consent screen
shows provider and model identity, proposed file paths and source slices,
byte/token budgets, sensitive-path exclusions, retention/training caveats,
allowed provider endpoints, and the local artifact path. Consent is specific to
that disclosed request; it is not a permanent bypass.

Secret and sensitive-path filtering fails closed: if the exclusion policy cannot
be applied or the disclosed budget cannot be calculated, the request is not
sent and HLD/LLD remain `not_available` with a reason. Declining consent
preserves deterministic repository output and never triggers a hidden fallback
provider. A local-model adapter must use the same request/response contract and
must disclose that no external egress occurs.

The generation agent receives only bounded source/model data and has no shell,
write, Git mutation, project execution, or consequential external tools. Every
returned claim/relation is validated for schema, anchor existence, derivation,
claim state, confidence, output size, and forbidden wording before artifact
write. Redirects, proxies, and fallback providers cannot expand the disclosed
endpoint allowlist.

## Commands

The following are the required command contracts. Product commands are proposed
until implementation exists; verification commands below are currently
available in the documentation-only repository.

### Product commands

```text
skia review [--repo <PATH>] [--non-interactive]
skia repo review [--repo <PATH>] [--no-agent] [--card-cap <N>] [--non-interactive]
skia runs list [--repo <PATH>]
skia runs inspect [--repo <PATH>] <RUN_ID>
skia runs delete [--repo <PATH>] <RUN_ID> [--yes]
skia --help
skia --version
```

Rules:

- `<PATH>` defaults to the discovered Git repository root and is read-only.
- Output always stays under that repository's `.skia/`; there is no arbitrary
  output-path flag in the pilot.
- `--non-interactive` fails clearly when a prediction, subsystem selection, or
  agent consent is required; it never assumes consent or fabricates input.
- `--no-agent` produces deterministic repository output with HLD/LLD marked
  `not_available`.
- `--card-cap` must be a positive bounded integer and includes the mandatory
  architecture card.
- `runs delete` requires `--yes` in non-interactive contexts.
- `skia review` accepts an unborn branch with the empty-base receipt state;
  `skia repo review` returns the stable `no_head` error when `HEAD` is absent.
- Staged budget refusal returns the stable `staged_budget_exceeded` error with
  exit status `1`; it does not begin card interaction.
- Exit status `0` means the requested interaction completed, including explicit
  partial, skipped, unchecked, or not-available states. Exit status `1` means a
  represented operational failure. Exit status `2` means invalid arguments or
  configuration. Exit status `3` means the requested snapshot cannot exist,
  including `no_head` for repository mode. User stop, skip, and consent decline
  are recorded states, not failures.

### Configuration boundary

Phase 1 has no repository-controlled configuration file. Built-in safe defaults
and explicit CLI flags are the only configuration sources. If repository mode
later accepts `.skia/config.json`, precedence must be CLI flags over the local
file over built-in defaults; the parser must fail closed on invalid or unsafe
values; repository configuration may not expand egress, execution, file, or
output limits; and the manifest must record configuration origin and effective
values. Adding that file is a separate contract change, not an implicit Phase 1
feature.

### Current verification commands

```sh
python3 scripts/check_docs.py
git diff --check
```

Future implementation checks must include:

```sh
npm run typecheck
npm run build
npm test
npm run test:golden
npm run test:security
```

The supported Node.js runtime, package manager, TypeScript compiler, parser
packages, schema validator, and lockfile policy must be pinned before the first
implementation commit. `python3 scripts/check_docs.py --external` remains an
optional network-dependent documentation check, not a default CI requirement.

## Tech stack

- TypeScript CLI running on a pinned Node.js runtime.
- Pinned TypeScript/TSX/Python parser packages selected during contract freeze.
- TypeScript DTOs plus a strict JSON Schema validator for JSON artifacts.
- Node.js `crypto` for snapshot and artifact hashes.
- Node.js time primitives plus a UTC formatter for run IDs.
- Typed boundary errors for internal propagation and stable user error codes.
- Node.js child-process and terminal APIs with injected interfaces for tests.
- A pinned JSON Schema validator selected before schema implementation.
- A narrow repository-only agent adapter. No provider SDK belongs in
  deterministic modules.

The exact Node.js version, package manager, module format, parser package
versions, schema-validator package, and external transport library are open
contract decisions. No implementation may use an unpinned `latest` dependency
or silently add a provider fallback.

## Project structure

The current documentation tree remains in place. The production `src/` tree
must match the existing architecture contract exactly; adding or renaming
production modules requires a coordinated update to `ARCHITECTURE.md`.
Implementation adds this canonical structure:

```text
package.json              package scripts and pinned dependency ranges
package-lock.json         resolved dependency versions
tsconfig.json             strict TypeScript compiler configuration
src/
  main.ts                  command parsing and orchestration
  git.ts                   hardened Git process boundary and snapshot capture
  limits.ts                file, byte, time, output, and input limits
  paths.ts                 path-byte handling and escaped display
  languages/
    registry.ts            supported source-language registry
    types.ts               parser and source-language contracts
    typescript.ts          TS/TSX parsing and declarations
    python.ts              Python parsing and declarations
  coverage.ts              included/excluded/unsupported/failed accounting
  staged/
    entities.rs            changed-entity ownership and mapping
    collapse.rs            collapsed equivalence evidence
    card.rs                minimal prediction card and validation
    source_check.rs        narrow path comparison
    probe.rs               structured unexecuted probe specification
    receipt.rs             staged receipt schema and writer
    prompt.rs              staged terminal interaction
  repository/
    inventory.rs           committed-tree file classification
    structure.rs           packages, entry points, exports, imports, direct calls
    subsystems.rs          evidence-backed subsystem candidates and selection
    agent.rs               consent, adapter, prompt contract, and output validation
    bundle.rs              HLD/LLD/evidence/cards/coverage/manifest assembly
    prompt.rs              repository terminal interaction
  schema.ts                JSON Schema versions and validation
  storage.ts               atomic local run creation, listing, inspection, deletion
schemas/                    normative JSON Schemas
fixtures/                   synthetic source, Git, artifact, and adversarial data
tests/
  integration/              temporary Git and end-to-end command tests
  golden/                   terminal and artifact snapshots
  security/                 injection, path, egress, and resource tests
docs/                       product, architecture, validation, and this spec
scripts/                    documentation-only repository checks
```

Dependency direction is one-way:

```text
commands -> git/scanner/staged/repository/storage -> shared model/schema
```

Prompts depend on injected terminal I/O. Storage owns filesystem safety.
Staged and repository consumers share facts and coverage but do not import one
another's mode-specific behavior.

## Code style

TypeScript uses strict compiler settings, explicit typed boundaries,
deterministic ordering, and small pure functions around filesystem/process
effects. Git commands use structured argument arrays; shell interpolation is
not permitted. Paths retain bytes internally and are escaped only for display.

Representative model style:

```ts
export interface EvidenceRelation {
  id: RelationId;
  kind: RelationKind;
  relation: string;
  anchors: SourceAnchor[];
  derivation: Derivation;
  coverage: Coverage;
  detailsAvailable: boolean;
}
```

Use enums for closed taxonomies, newtypes for IDs and hashes, `Result` for
fallible boundaries, and explicit constructors for bounded input. Keep
serialization DTOs separate from parser and Git process types. Do not use
prose to imply facts that are not represented by a source anchor or coverage
event.

Documentation follows [AGENTS.md](../AGENTS.md): concise professional Markdown,
canonical examples, explicit uncertainty, synthetic fixtures, and no claims
that proposed behavior is implemented or validated.

## Testing strategy

### Contract and pure fixtures

Before mode-specific code, add schemas and fixtures for:

- relation grammar, anchors, derivation, confidence, and coverage arithmetic;
- staged entity ownership, changed-range mapping, nested declarations, and
  source-check eligibility;
- Behavior Card complete, skip, mismatch, not-checkable, and interrupted
  states;
- repository inventory, structural IDs, unresolved edges, subsystem evidence,
  and unchecked selection;
- run IDs, collision suffixes, manifest hashes, artifact availability, and
  complete/partial/incomplete states; and
- valid, malformed, stale, duplicate, fabricated, and out-of-budget agent
  responses.

Fixture outcomes are classified explicitly: valid inputs are accepted, safe
unsupported/partial cases are accepted with the required coverage or
`not_available` state, and malformed or unsafe operations are rejected. Fixed
snapshot, scanner version, and configuration inputs must produce stable
deterministic facts.

### Temporary Git repositories

Integration tests create disposable repositories covering added/modified,
deleted, renamed, copied, conflicted, type-changed, binary, symlink,
submodule, unsupported-mode, detached-HEAD, unborn-HEAD, missing-object, dirty
working-tree, and concurrent-index cases. Tests assert complete status
discovery before filtering, snapshot consistency, no Git writes, no lazy fetch,
no optional locks, and no silent sampling.

### Golden terminal and artifact tests

Golden tests cover collapsed evidence before source, detail/source expansion,
prediction-before-feedback, skip, mismatch, not-checkable, unmapped warning,
repository card selection, unchecked subsystems, declined consent,
not-available HLD/LLD, collisions, incomplete runs, inspection, and deletion.

Use an injected clock, run ID, terminal I/O, and agent stub. Validate every JSON
artifact against its normative schema; resolve every source anchor and manifest
claim ID; verify every artifact hash and filename run ID.

### Security and privacy tests

Adversarial fixtures must place instruction-like content in source, comments,
Markdown, paths, manifests, generated/vendor files, fixtures, and agent
responses. Test terminal control characters, path traversal, symlinks, output
permissions, resource exhaustion, secret-path exclusions, provider redirects,
fallback destinations, and hidden egress.

Release-blocking failures include any unauthorized write, Git mutation,
project-command execution, staged-mode network call, hidden provider fallback,
prompt-injection scope/tool change, path escape, secret disclosure, or
unescaped terminal control.

### Behavioral validation

Mechanical safety is necessary but does not prove comprehension benefit. This is
deferred beyond Phase 1. The eventual validation sequence from
[docs/VALIDATION.md](VALIDATION.md) is staged feasibility, reduction-fidelity
corpus, repository feasibility, agent red team, and only then an efficacy study
if the preceding gates pass.

The full-product AC-12 gate must include one objective primary comprehension
outcome, an attention-matched control, preregistration, justified sample size
and minimum worthwhile effect, blinded scoring, baseline adjustment,
intention-to-treat analysis, delayed novel transfer, contamination/attrition/
missing-data/multiplicity rules, and fixed green/amber/red proceed criteria.
Before the full implementation is called complete, [OD-13](OPEN_DECISIONS.md)
must define numeric thresholds for reading reduction, omission, friction,
architecture accuracy, fabricated-claim rate, privacy acceptance, attrition,
and delayed transfer. Preference, completion, or self-report alone cannot
satisfy this gate.

## Implementation phases and dependencies

### Phase 0: Contract freeze

Resolve the open questions in this document and [docs/OPEN_DECISIONS.md](OPEN_DECISIONS.md):
snapshot capture, relation grammar, scenario generation, schema locations,
artifact states, default limits, card cap, agent policy, retention, and
validation thresholds. Reconcile stale naming and documentation-CI language.

### Phase 1: Foundations

This is the only normative implementation phase covered by the current review.
After OD-4 selects the snapshot strategy, implement the hardened Git process
boundary, the selected staged/committed snapshot capture, local storage
transaction, run lifecycle, shared IDs, hashes, paths, anchors, coverage
events, and schema-validation foundation. Do not implement staged cards,
repository inventory, external transport, or behavioral validation in this
phase.

Phase 1 exits only when:

- OD-4 records one snapshot strategy, identity definition, retry policy, and
  concurrent-mutation evidence;
- fixed Git environment and cleared-variable behavior is tested, including
  unborn staged and no-`HEAD` repository states;
- temporary Git tests prove no index/object/ref writes, no lazy fetch, no
  optional locks, complete status discovery, and stable path/mode handling;
- storage tests prove `.skia/` containment, atomic create-new behavior,
  collision handling, symlink rejection, permissions, incomplete-run state,
  inspect, and deletion behavior;
- shared IDs, anchors, coverage events, manifest hashes, and schema-validation
  DTOs have canonical fixtures; and
- `npm run typecheck`, `npm run build`, and the foundation test suite pass.

The staged budget, staged receipt, repository scan, agent, and behavioral gates
remain specified below but are not Phase 1 completion claims.

### Deferred roadmap after Phase 1

#### Phase 2: Shared TypeScript/Python and coverage

Implement pinned TypeScript/TSX/Python parsing, byte/line/column mapping,
deterministic ordering, supported-node classification, syntax/encoding
failures, resource limits, and shared coverage fixtures. This phase may proceed
in parallel with independent foundation tests once shared model types are
frozen.

#### Phase 3: Staged vertical slice

Implement one supported named function/method path end to end: changed-entity
ownership, collapsed evidence, one literal-derived scenario, prediction
persistence, narrow source check, optional unexecuted probe, receipt, and
golden terminal output. Expand syntax only through new failing fixtures.

#### Phase 4: Repository deterministic slice

Implement committed-tree inventory, TypeScript structural model, configuration
and document classification, candidate subsystems, coverage, deterministic
evidence, manifest, and subsystem selection. Generate `not_available` HLD/LLD
artifacts when no agent is enabled.

#### Phase 5: Agent-assisted architecture

Implement the repository-only adapter against a local stub first. Add explicit
consent, provider/model disclosure, bounded request construction, untrusted
content instructions, endpoint allowlisting, output validation, HLD/LLD claim
metadata, and adversarial transport tests before enabling any external adapter.

#### Phase 6: Hardening and documentation automation

Complete security, privacy, resource, schema, golden, and documentation gates.
Add CI wiring for formatting, linting, tests, schemas, documentation, and
dependency/security review. Keep external URL checks isolated from default CI.

#### Phase 7: Behavioral decision

Run the predeclared validation protocol and record a proceed, narrow, pivot, or
stop decision. Do not add hooks, distribution, more languages, team surfaces,
or tracked exports before this decision.

### Safe parallelization

After Phase 0, Git snapshot, storage/schema, and foundation fixtures can
proceed in parallel on disjoint files. Pure TypeScript facts may begin only
after shared model/anchor contracts are frozen, but that work is deferred from
the Phase 1 acceptance boundary. Staged and repository consumers must wait for
shared coverage contracts. Agent transport must wait for the deterministic
repository model and consent contract.

## Boundaries

### Always

- Preserve one immutable snapshot identity per run.
- Keep raw source, deterministic facts, model-derived claims,
  developer-supplied predictions, and unavailable states distinct.
- Show or record all unsupported, excluded, failed, unmapped, partial, and
  unchecked regions.
- Validate paths, modes, encodings, sizes, timeouts, anchors, schemas, hashes,
  permissions, and artifact state transitions.
- Use synthetic/minimized fixtures and record exact verification commands.
- Keep local artifacts beneath `.skia/` and provide list/inspect/delete
  lifecycle operations.

### Ask first

- Changing product commands, schemas, coverage enums, source-check semantics,
  artifact names, default limits, card cap, or agent consent behavior.
- Adding a language, provider, dependency, external transport, runtime
  execution path, hook, source rewrite, hosted surface, or tracked export.
- Changing the accepted `Skia` name/distribution policy.
- Weakening a security, privacy, no-write, no-egress, or coverage gate.

### Never

- Commit secrets, credentials, personal data, proprietary source, private paths,
  or sensitive architecture.
- Execute project code, package scripts, repository plugins, Git hooks, or
  instructions embedded in repository content.
- Mix Git states, silently truncate input, overwrite runs, follow symlinks, or
  allow hidden provider fallback.
- Label model output deterministic, verified, authoritative, complete, runtime,
  proven, correct, or equivalent.
- Remove a failing fixture or lower a threshold to make a gate pass.

## Success criteria

### Phase 1 exit criteria

The next implementation slice is complete only when all of the following are
true:

1. The human approves this spec and the blocking open decisions are recorded.
2. OD-4 is closed and the selected snapshot strategy has an executable
   identity, retry, and race-test contract.
3. The implementation has a pinned Node.js/TypeScript toolchain, dependencies,
   shared DTOs,
   schemas, and foundation fixtures.
4. Foundation portions of AC-1, AC-2, AC-6, AC-10, and AC-11 in
   [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) have passing
   command/output evidence.
5. There are zero unauthorized writes, Git mutations, staged-mode network
   calls, project-command executions, hidden egress events, or sensitive-data
   disclosures in the foundation security corpus.
6. Snapshot, storage, schema, path, mode, collision, incomplete-run, inspect,
   deletion, and no-write fixtures pass; safe unsupported cases are represented
   with explicit coverage rather than uniformly rejected.

### Full roadmap exit criteria

The later phases are complete only when all of the following are true:

1. AC-1 through AC-11 in [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)
   have passing command/output evidence.
2. All contract, schema, anchor, invariant, and golden fixtures pass;
   deterministic outputs are stable and no silent truncation occurs.
3. No deterministic claim exists without valid anchors and coverage status.
4. Repository output makes consent decline, unavailable HLD/LLD, unsupported
   languages, excluded files, failed scans, and unchecked subsystems explicit.
5. AC-12 is satisfied by the preregistered behavioral protocol, its numeric
   thresholds, and a documented proceed/narrow/pivot/stop decision. A green
   mechanical suite alone does not establish comprehension benefit.

## Open questions and approval gates

These items must be resolved before the corresponding implementation phase:

1. **Name/distribution (decided):** retain `Skia`/`skia`. The remaining action
   is to reconcile older rename-blocker wording and document accepted registry,
   search, and trademark risk before publication; renaming is not a Phase 1
   gate.
2. **Snapshot capture:** choose copied-index, checksum/manifest, or another
   tested strategy; then approve identity, retry count, canonical patch
   encoding, Git configuration isolation, and revalidation failure code.
3. **Evidence grammar:** define the exact relation syntax, ordering, supported
   operators, and fallback rules for OD-2.
4. **Scenario generation:** approve literal-only scenario generation and
   `not_available` fallback, or specify a safer alternative for OD-3.
5. **Repository card cap:** approve the proposed pilot default of `3`, including
   the architecture card, or choose another value.
6. **Artifact states:** approve schema-valid `not_available` HLD/LLD placeholder
   files when consent is declined, or choose conditional artifact presence.
7. **Schema and IDs:** select the JSON Schema validator, schema version policy,
   stable-ID scope, and canonical `schemas/`/`fixtures/` layout.
8. **Limits:** approve initial per-file, total-byte, file-count, parse-time,
   run-time, terminal-input, subprocess-output, artifact-output, and agent
   token budgets.
9. **Agent transport:** specify provider protocol, proxy/redirect behavior,
   endpoint allowlist, token accounting, secret filtering, configuration
   precedence, and local-model behavior before external egress.
10. **Validation:** record numeric reduction, omission, friction, accuracy,
   privacy, attrition, and delayed-transfer thresholds in OD-13.
11. **Subsystem discovery:** close OD-5 with candidate membership evidence,
    unresolved/cross-boundary edges, and model-label rules before Phase 4.
12. **HLD/LLD accuracy:** close OD-8 with a blinded grounding/audit rubric and
    a factual-error stop threshold before Phase 5 output is user-facing.
13. **Supported-language boundary:** close OD-9 with a versioned
    TypeScript/TSX/Python inclusion/status matrix and resolver limits before
    repository scanning.
14. **Run identity:** close OD-10 with the exact timestamp, collision, and
    concurrent-allocation contract before storage schema version 1.
15. **Retention/deletion:** close OD-11 with retention defaults, incomplete-run
    policy, inspect redaction, and platform deletion guarantees before lifecycle
    commands are treated as complete.

## Review gate

This document is ready for human review, not implementation. Approval should
confirm:

- the objective, scope, and name decision;
- the proposed command and artifact contracts;
- the canonical implementation structure and dependency order;
- the safety and testing boundaries; and
- which open questions are resolved, deferred, or explicitly blocking.

After approval, create an implementation plan and task list from this spec in
the repository's agreed task location. Do not begin Phase 1 implementation
while the review gate remains open.
