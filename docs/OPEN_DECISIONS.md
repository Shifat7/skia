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

## OD-2: Is deterministic syntax evidence sufficient?

**Question:** Can Tree-sitter-derived signature/call/branch/error
changes produce prompts that require meaningful explanation, or does
the product need compiler, LSP, or LLM support?

**Current Phase 0 choice:** Start with conservative syntax evidence and
open-ended explanations. Do not grade answers.

**Decision rule:** Dogfood first. If prompts are routinely trivial,
ambiguous, or misleading, do not expand the catalogue by pretending
syntax is semantics. Either add a more capable analysis dependency with
explicit accuracy tests or stop the product hypothesis.

---

## OD-3: Receipt privacy and lifecycle

**Questions:**

- Should receipts contain the full explanation or only local metrics?
- How long should receipts remain on disk?
- Should there be a local delete/inspect command before any sharing
  feature exists?
- Can a team request receipts without turning a learning aid into
  surveillance or a gameable compliance artifact?

**Current Phase 0 choice:** One local, gitignored JSON file per session;
no upload, aggregation, or team dashboard. Receipts include a staged
diff hash and source-derived evidence summaries but not the full diff.

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
- What constitutes evidence that a prompt caused code inspection?
- How will explanation depth be sampled without uploading private
  source or creating an LLM-judge dependency?
- What comparison condition is feasible after dogfood: summary-first,
  diff-only, or no checkpoint?

**Current minimum:** Four weeks of opt-in manual-command use, explicit
consent for exported aggregate data, answer/show/skip and retention
metrics, qualitative interviews, and a decision memo applying the
precommitted thresholds.

---

## OD-6: Supported TypeScript surface

**Question:** Should Phase 0 remain limited to named function
declarations and named methods, or include arrow functions assigned to
variables?

**Current choice:** Named function declarations and named methods only.
Arrow functions, anonymous callbacks, interfaces, aliases, enums, and
whole classes are unsupported fixtures, not silently approximated.

**Decision rule:** Add one entity shape only when extraction identity
and base/staged matching are reliable across a dedicated fixture set.

---

## Resolved in this revision

- **Entity selection:** Most changed staged lines; path and starting
  line break ties.
- **Answer evaluation:** No automated correct/incorrect judgment in
  Phase 0.
- **File filter:** `.ts` and `.tsx` only.
- **Snapshot source:** Review the git index, never the working-tree
  copy.
- **Initial evidence order:** error, signature, branch, call, fallback.