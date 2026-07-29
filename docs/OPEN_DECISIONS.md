# Open Decisions

These decisions remain unresolved. A decision is closed only when the
maintainer records the choice, evidence, and consequences in this file
or a linked issue.

---

## OD-1: Project name (release blocker)

**Question:** What unique project and command name should replace
"Skia" before publication?

Google's long-established [Skia graphics
project](https://github.com/google/skia) dominates search and registry
identity. Its build infrastructure also contains an AI code-review
command named
[`autoreview`](https://skia.googlesource.com/buildbot/+/000a3a9c8c31aa9751e8c64f6ec6e45b30fe2cc9/cmd/autoreview/README.md),
which makes the collision especially damaging for this category.

**Decision rule:** Choose a name that is available on the intended
package registries, does not collide with a prominent developer tool or
trademark, is easy to spell and search, and can own an unambiguous CLI
command.

**Blocks:** Package publication, installation docs, badges, launch
campaign, and public benchmarks under the current name.

---

## OD-2: Is deterministic syntax evidence sufficient for typed Behavior Cards?

**Question:** Can Tree-sitter-derived signature/call/branch/error
changes produce typed Behavior Card prompts that require meaningful
prediction, and can narrow source checks provide useful feedback
without a compiler, LSP, or LLM?

**Current Phase 0 choice:** Start with conservative syntax evidence,
typed Behavior Cards, and narrow source checks (`source_derived_match`,
`source_derived_mismatch`, or `not_checkable`). Do not grade cards. Do not
execute arbitrary TypeScript.

**Decision rule:** Dogfood first. If card prompts are routinely
trivial, ambiguous, or misleading, do not expand the templates by
pretending syntax is semantics. Either add a more capable analysis
dependency with explicit accuracy tests or stop the product hypothesis.

---

## OD-3: Comprehension receipt privacy and lifecycle

**Questions:**

- Should comprehension receipts contain the full behavior card or
  only local metrics?
- How long should receipts remain on disk?
- Should there be a local delete/inspect command before any sharing
  feature exists?
- Can a team request receipts without turning a learning aid into
  surveillance or a gameable compliance artifact?

**Current Phase 0 choice:** One local, gitignored JSON file per session;
no upload, aggregation, or team dashboard. Receipts include a staged
diff hash, source-derived evidence summaries, and a behavior card but
not the full diff.

**Blocks:** Team-facing claims and any telemetry or sharing mechanism.

---

## OD-4: Hook timing and blocking behavior

**Question:** After the manual workflow is validated, should an opt-in
hook run before commit or push, and should it ever block?

**Current Phase 0 choice:** No hook until the four-week manual-command
pilot meets the decision thresholds in PRD.md. Any first hook is
non-blocking and explicitly installed.

**Risks:** Pre-commit may be too frequent; pre-push may be too late;
blocking can encourage ritual answers and bypasses; silent automatic
installation violates user control.

---

## OD-5: Behavioral pilot design

**Questions:**

- How many developers and what experience mix are practical?
- What constitutes evidence that a Behavior Card caused code
  inspection?
- How will card depth be sampled without uploading private source or
  creating an LLM-judge dependency?
- What comparison condition is feasible after dogfood: raw-diff-only,
  Behavior Card, or plain pseudocode?

**Current minimum:** Four weeks of opt-in manual-command use comparing
raw-diff-only versus Behavior Card (optionally a third plain-pseudocode
arm if sample size allows), explicit consent for exported aggregate
data, code-open/scroll and card-completion/skip and retention metrics,
maintenance/change-explanation performance, friction, qualitative
interviews, and a decision memo applying the precommitted thresholds.

---

## OD-6: Supported TypeScript surface

**Question:** Should Phase 0 remain limited to named function
declarations and named methods, or include arrow functions assigned to
variables?

**Current choice:** Named function declarations and named methods only.
Arrow functions, anonymous callbacks, interfaces, aliases, enums, and
whole classes are unsupported fixtures, not silently approximated.

**Decision rule:** Add one entity shape only when extraction identity
and base/staged matching are reliable across a dedicated fixture set,
and when the shape supports a meaningful Behavior Card template.

---

## OD-7: Pilot budgets for the bounded review unit

**Question:** Are the provisional 3-entity and 150-added-plus-deleted-line
budgets the right defaults for the pilot?

**Current Phase 0 choice:** Phase 0 processes every supported changed
function/method in deterministic path/line order, but only when the
staged change is at or below 3 supported entities and 150 added-plus-deleted
TypeScript lines. If either budget is exceeded, the tool refuses to
summarize or sample away review debt and asks the developer to re-stage
a smaller coherent change. The 3/150 budgets are product-experiment
defaults, not risk-science benchmarks.

**Decision rule:** Track budget-refusal and restaging behavior in the
pilot. If developers frequently re-stage the same large diff unchanged,
tune the budget or reconsider the refusal model.

---

## OD-8: Unmapped changed-line tolerance

**Question:** How much changed TypeScript outside supported functions or
methods can remain unmapped before the Phase 0 interaction becomes too
partial to be useful?

**Current Phase 0 choice:** Count and display total, mapped, and unmapped
changed TypeScript lines. `card_status` describes supported-entity card
completion only and never suppresses the unmapped count.

**Decision rule:** Track unmapped-line ratio in fixtures and the pilot.
If most real changes remain unmapped, expand one entity shape with
reliable fixtures or stop claiming the current checkpoint covers a
meaningful review unit.

---

## Resolved in this revision

- **Entity selection:** All supported changed entities are processed in
  deterministic path/line order (not a randomly or heuristically selected
  single entity). Phase 0 checks against pilot budgets of 3 supported
  entities and 150 added-plus-deleted TypeScript lines; over-budget changes are
  refused and the developer is asked to re-stage.
- **Card evaluation:** No automated correct/incorrect judgment in
  Phase 0. Source checks use receipt enum values `source_derived_match`,
  `source_derived_mismatch`, or `not_checkable`; the terminal UI shows
  human-readable labels (`source-derived match`, `source-derived
  mismatch`, `not checkable`). Never correct, incorrect, or runtime
  verified.
- **File filter:** `.ts` and `.tsx` only.
- **Snapshot source:** Review the git index, never the working-tree
  copy.
- **Initial evidence order:** error, signature, branch, call, fallback.
- **Interaction model:** Strongly typed Behavior Card
  (GIVEN `{arguments, state_note}` / WHEN `{entity, invocation}` /
  THEN `{kind, value}` / BECAUSE / IMPACT) replaces free-text causal
  question. One card per entity; 1-3 cards per session within the
  pilot budget.
- **Source check:** Narrow local branch check only when JSON arguments
  evaluate one allowlisted atomic predicate ending in a JSON-scalar
  return or a throw with a literal message. Method state, helper/property access, coercive
  equality, mutation, compound predicates, non-literal endpoints, and
  side effects stay `not_checkable`; a match never proves whole-function
  reachability.
- **Probe spec:** Replaces the earlier executable-looking scaffold concept. Probe specs are
  structured JSON (`{status: draft_unexecuted, invoke, expect}` or
  `{status: not_available, reason}`), never source code, never run,
  never written into the project, and contain no `framework_hint` or
  code text. Side-effect predictions are not eligible without a
  later-phase adapter.
- **Receipt:** Renamed to comprehension receipt; schema version
  bumped to 3. One receipt per session includes total, mapped, and
  unmapped changed TypeScript lines, per-entity entries, and session
  `card_status` (`complete`, `partial`, or `skipped`). `card_status`
  describes card completion only and never implies coverage or a
  review pass.
- **No execution:** Phase 0 performs no arbitrary TypeScript execution,
  project file writes, source code generation, or package commands
  beyond read-only git.
