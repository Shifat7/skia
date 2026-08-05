# Open Decisions

A decision closes only when the maintainer records the chosen option, evidence,
consequences, and affected contracts here or in a linked issue. Defaults below
are experiment starting points, not validated truths.

---

## OD-1: Project and command name (release blocker)

**Question:** What unique project and command name replaces "Skia"?

Google's [Skia graphics project](https://github.com/google/skia),
[skia.org](https://skia.org/), the existing
[`skia` Rust crate registry record](https://crates.io/api/v1/crates/skia), and the existing
[`skia` npm package](https://www.npmjs.com/package/skia) make the current name
unusable for clear search and registry identity.

**Decision rule:** Verify trademark/search risk plus command and intended
registry availability. Rename the command, `.skia/` directory, schemas, examples,
and documentation atomically before release.

**Blocks:** Package publication, release binaries, install docs, public launch,
and stable artifact paths.

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

## OD-4: Atomic staged snapshot strategy

**Question:** Which read-only design binds diff, paths, modes, blob bytes, and
receipt to one immutable logical index state?

**Candidate approaches:**

- copied temporary index addressed through `GIT_INDEX_FILE`;
- index checksum plus ordered blob-OID manifest and final revalidation; or
- another design proven by concurrent mutation tests.

**Constraint:** Do not write Git objects merely to create an immutable tree.
All statuses must be discovered before supported filtering. Lazy fetch and
optional locks remain disabled.

**Decision rule:** Choose the smallest approach that passes index-race,
partial-clone, path-byte, status, mode, and zero-Git-write tests.

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

## OD-9: TypeScript-first repository boundaries

**Question:** Which manifests, configuration, docs, generated/vendor paths,
fixtures, and import-resolution forms are included?

**Current proposal:** Detailed behavior is TS/TSX only. Manifests,
configuration, lockfiles, and docs inform structure. Other languages are
inventory-level unsupported coverage.

**Decision rule:** Freeze a versioned inclusion/status matrix and resource
limits. Add one new resolver or source category only with dedicated fixtures and
coverage semantics.

---

## OD-10: Timestamp and collision format

**Question:** Is second-resolution basic ISO 8601 plus a collision suffix the
right local run identity?

**Current proposal:** `YYYYMMDDTHHMMSSZ`; atomically allocate `-01`, `-02`, and
so on when needed. Directory and every filename use the resolved run ID.

**Decision rule:** Verify path safety, lexical ordering, cross-platform behavior,
concurrent creation, and usability before schema version 1 freezes.

---

## OD-11: Local artifact retention and deletion

**Questions:**

- What default retention, if any, applies to receipts and repository bundles?
- Should incomplete runs be retained for diagnosis or removed automatically?
- What does `runs inspect` redact?
- What deletion guarantees can be made across platforms?

**Current proposal:** No automatic upload, sharing, tracked export, or team
surface. Provide list, inspect, and delete. Files use atomic create-new and
owner-only permissions where supported.

**Decision rule:** Test with developers and security reviewers. Do not keep full
architecture history by default without a clear user benefit.

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
  added-plus-deleted TypeScript lines; refuse rather than silently sample.
- **Repository scope:** Agent-assisted, TypeScript-first detailed analysis;
  manifests/config/docs inform structure; other languages remain explicit
  unsupported coverage.
- **Repository checks:** One architecture card plus developer-selected subsystem
  cards. Excess subsystems remain `unchecked`.
- **Artifact lifecycle:** Timestamped HLD, LLD, collapsed evidence, cards,
  coverage, and manifest are local/gitignored under `.skia/dist/`.
- **Agent claims:** Always model-derived with anchors/uncertainty, never
  deterministic or authoritative.
- **No adoption:** Comprehension runs do not rewrite or adopt source.
