# Open Decisions

A decision closes only when the maintainer records the chosen option, evidence,
consequences, and affected contracts here or in a linked issue. Defaults below
are experiment starting points, not validated truths.

---

## OD-1: Project and command name (release risk)

**Question:** How can the retained "Skia" project and `skia` command be
distributed and documented without creating search or registry confusion?

Google’s [Skia graphics project](https://github.com/google/skia),
[skia.org](https://skia.org/), and the existing
[`skia` npm package](https://www.npmjs.com/package/skia) create search and
registry ambiguity for the current name.

**Current maintainer decision:** Retain the `Skia`/`skia` name for now. Do not
rename the command, `.skia/` directory, schemas, examples, or documentation as
part of Phase 1.

**Decision rule:** Before publication, document accepted search, trademark, and
registry risk, or obtain a deliberate maintainer decision to rename atomically.

**Blocks:** Package publication, release binaries, install docs, public launch,
and stable artifact paths; it does not block Phase 1 implementation.

---

## OD-2: Collapsed-equivalence grammar

**Question:** Which behavior relations can be reduced safely and still be
materially shorter than source?

**Current proposal:** Guards, branches, direct transformations, direct calls,
direct side effects, literal errors, declared contract changes, and an explicit
fallback. Every relation has source anchors and supported/partial/unmapped/
unsupported coverage.

**Unknowns:**

- canonical relation syntax and ordering;
- duplicate or interacting branches;
- stateful and cross-function behavior;
- minimum reading reduction;
- when details are required to avoid ambiguity; and
- false-confidence rate when users do not open source.

**Decision rule:** Accept a relation family only after independent fixture
review shows high precision and a predeclared reading reduction. Prefer fallback
over stronger prose.

---

## OD-3: Minimal Behavior Card scenarios

**Question:** How should the system choose a concrete `GIVEN`/`WHEN` without
turning scenario selection into an untrusted generated answer?

**Current proposal:** System supplies the scenario; developer predicts `THEN`;
`BECAUSE` is conditional after mismatch or explicit/risk request; `IMPACT` is
conditional for high-risk paths.

**Unknowns:**

- deterministic scenario generation versus developer selection;
- representative versus adversarial inputs;
- invalid or ambiguous invocation rendering;
- risk-focused prompts; and
- whether one prediction is enough to change behavior.

**Decision rule:** Scenario generation must be fixture-tested, disclose its
basis, and remain independent from the developer's answer. Stop or redesign if
the card becomes trivia or ritual.

---

## OD-4: Atomic staged snapshot strategy (decided)

**Question:** Which read-only design binds diff, paths, modes, blob bytes, and
receipt to one immutable logical index state?

**Decision:** Use a copied temporary index addressed through `GIT_INDEX_FILE`.
Open the live index once, copy those bytes into a create-new owner-only file
beneath `.skia/tmp/`, hash the copied bytes with SHA-256, and run all status,
diff, mode, and blob discovery against that copy. Do not write a tree or any
other Git object.

Before interaction, open and hash the live index again. If it differs, discard
the candidate and retry the complete capture at most twice more (three total
attempts). A third mismatch stops with `index_changed`; no mixed snapshot or
partial receipt is accepted. A successful snapshot identity binds the base OID,
copied-index SHA-256, ordered raw path/mode/base-blob/staged-blob manifest, and
SHA-256 of canonical staged patch bytes. Canonical patch generation uses the
captured index, structured Git arguments, binary/full-index output, disabled
external diff and text conversion, and the fixed environment from
[ARCHITECTURE.md](../ARCHITECTURE.md).

The complete NUL-delimited status set is captured before supported filtering.
Captured blob OIDs and bytes are the only source after acceptance. Lazy fetch
and optional locks remain disabled. Race fixtures must mutate the live index
before copy, during copy, between discovery commands, before final validation,
and after acceptance; every accepted result must contain one index generation
and every rejected result must leave Git state unchanged.

**Consequences:** Task 4 implements only this strategy. Temporary index files
are local process state, never artifact identity or user-visible paths, and are
removed after success or failure under the OD-11 incomplete-run policy.

---

## OD-5: Repository subsystem discovery

**Question:** What evidence defines a top-level subsystem and when may the agent
rename, merge, or split scanner groups?

**Current proposal:** Deterministic candidates use package/workspace boundaries,
directory roots, entry points, and import communities. Agent labels/rationales
remain model-derived.

**Decision rule:** Every candidate exposes membership evidence, unresolved and
cross-boundary edges, confidence, and coverage before the developer selects it.
A label must not be presented as a proven bounded context.

---

## OD-6: Repository card cap

**Question:** What default `repo_card_cap` preserves a short session?

**Current proposal:** The architecture card consumes one slot. When subsystem
count exceeds remaining slots, the developer selects subsystems; unselected
subsystems are recorded `unchecked`. No silent grouping, ranking, or sampling.

**Decision rule:** Use moderated professional testing to choose a default from
completion time, comprehension, skip, and abandonment. Keep the cap configurable
within a documented safe range.

---

## OD-7: Agent adapters and consent

**Questions:**

- Which agent/provider is supported first?
- What files, byte/token budget, and source slices may cross the boundary?
- Which secret/sensitive paths are excluded before prompting?
- How are provider retention and training terms disclosed?
- What local-model adapter satisfies the same contract?

**Current proposal:** Explicit consent names provider/model when available,
proposed egress, exclusions, retention caveat, and output path. Declining still
produces deterministic scan output; HLD/LLD become `not_available`.

**Decision rule:** No adapter ships until prompt-injection, no-write,
no-consequential-tool, schema, anchor, output-limit, and disclosure tests pass.

---

## OD-8: HLD/LLD factual-accuracy bar

**Question:** What minimum source grounding and factual accuracy justifies
showing agent-generated architecture?

**Current proposal:** HLD is system-level and concise; LLD uses tables and
expands selected/high-value areas only. Every claim has observed/model-derived
status, anchors where possible, confidence, and caveats.

**Decision rule:** Precommit a blinded audit rubric for factual accuracy,
fabricated intent/runtime topology, anchor validity, unresolved edges, and
reading cost. Stop or narrow if generated documents are too long or materially
wrong.

---

## OD-9: TypeScript/Python repository boundaries

**Question:** Which manifests, configuration, docs, generated/vendor paths,
fixtures, and import-resolution forms are included?

**Current proposal:** Detailed behavior is supported for TypeScript, TSX, and
Python. Manifests, configuration, lockfiles, and docs inform structure. Other
languages are inventory-level unsupported coverage. TypeScript-to-Python
resolution and cross-language behavior remain unresolved.

Task 0 freezes the source discriminants and parser matrix as `typescript`,
`tsx`, and `python` in
[docs/IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md#frozen-source-language-contract).
Python-specific semantic reduction and cross-language resolution remain
deferred; OD-9 stays open only for the broader repository inclusion matrix and
resource limits.

**Decision rule:** Freeze a versioned inclusion/status matrix and resource
limits. Add one new resolver or source category only with dedicated fixtures and
coverage semantics.

---

## OD-10: Timestamp and collision format (decided)

**Question:** Is second-resolution basic ISO 8601 plus a collision suffix the
right local run identity?

**Decision:** A run ID matches `^[0-9]{8}T[0-9]{6}Z(?:-[0-9]{2})?$`. Format the
UTC creation instant as `YYYYMMDDTHHMMSSZ`. Attempt the unsuffixed ID first,
then `-01` through `-99` in lexical order. Allocate each candidate with one
atomic create-new directory operation; `EEXIST` advances to the next candidate,
any other error fails, and exhausting `-99` fails with `run_id_exhausted`.
Never wait for the clock, overwrite, reuse, or randomly alter an ID.

The resolved run ID is immutable and appears in the run directory, every
artifact filename, and the manifest/receipt. Manifest timestamps use RFC 3339
UTC separately. Tests must cover UTC conversion, lexical ordering, clock
rollback, invalid IDs, concurrent allocation, `-99` exhaustion, and platforms
where atomic directory creation or owner-only permissions are unavailable.

---

## OD-11: Local artifact retention and deletion (decided)

**Questions:**

- What default retention, if any, applies to receipts and repository bundles?
- Should incomplete runs be retained for diagnosis or removed automatically?
- What does `runs inspect` redact?
- What deletion guarantees can be made across platforms?

**Decision:** There is no age-based automatic retention or background cleanup.
Complete runs persist locally until an explicit exact-ID `runs delete` succeeds.
An incomplete run is removed automatically at command exit when safe; if any
cleanup step fails, it remains marked `incomplete`, is visible to `runs list`,
and requires explicit deletion. Temporary copied indexes are always cleanup
targets and are never retained as diagnostic artifacts.

`runs list` returns only run ID, mode, completion state, creation/completion
time, snapshot identifier, and artifact byte count. `runs inspect <run-id>` is
metadata-only in Phase 1: it validates the ID and manifest, reports coverage,
errors, artifact names/hashes, and agent disclosure, and does not print source
excerpts, prompts/model output, or an absolute repository path. Content is read
directly from the local artifact files only by an explicit user action outside
the Phase 1 inspect command.

`runs delete <run-id>` accepts one exact grammar-valid ID, refuses symlinks or
paths escaping `.skia/`, never follows links, and reports partial deletion
non-zero with every remaining path. Success guarantees only that the named run
path does not exist when the command returns. It does not promise secure erase,
media sanitization, deletion from backups/snapshots, or prevention of forensic
recovery. There is no automatic upload, sharing, tracked export, or team
surface. Owner-only permissions are used where supported; weaker platform
semantics are disclosed before artifact creation.

---

## OD-12: Resource limits

**Question:** What file-count, per-file-byte, total-byte, parse-time, run-time,
artifact-size, and agent-context/output limits fit realistic TypeScript
repositories?

**Decision rule:** Measure representative repositories and publish the limit
profile. Limit failures must create partial coverage or stop; no silent
truncation may support a complete claim.

---

## OD-13: Professional validation design

**Questions:**

- What objective primary comprehension outcome and minimum worthwhile effect
  justify the interaction cost?
- Which professional population, tasks, repositories, and attention-matched
  control are feasible?
- How are delayed transfer, contamination, attrition, and missing data handled?
- How are HLD/LLD factual accuracy and reading cost measured separately?

**Current minimum:** Moderated feasibility first, followed only if justified by
a preregistered trial with blinded scoring, baseline adjustment,
intention-to-treat analysis, delayed novel transfer, and fixed proceed/narrow/
pivot/stop criteria.

---

## Resolved for the current proposal

- **Primary UX:** Reduce reading. Collapsed equivalence evidence is the default;
  original source and details remain on demand.
- **Card interaction:** System supplies `GIVEN`/`WHEN`; developer predicts
  `THEN`; `BECAUSE` and `IMPACT` are conditional.
- **Feedback order:** Persist prediction before source-check feedback.
- **Staged budget:** Provisional maximum 3 supported entities and 150
  added-plus-deleted supported-language lines; refuse rather than silently
  sample.
- **Repository scope:** Agent-assisted, TypeScript/Python detailed analysis;
  manifests/config/docs inform structure; other languages remain explicit
  unsupported coverage.
- **Repository checks:** One architecture card plus developer-selected subsystem
  cards. Excess subsystems remain `unchecked`.
- **Artifact lifecycle:** Timestamped HLD, LLD, collapsed evidence, cards,
  coverage, and manifest are local/gitignored under `.skia/dist/`.
- **Agent claims:** Always model-derived with anchors/uncertainty, never
  deterministic or authoritative.
- **No adoption:** Comprehension runs do not rewrite or adopt source.
