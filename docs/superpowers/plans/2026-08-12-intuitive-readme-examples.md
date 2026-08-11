# Intuitive README Examples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `README.md` so developers understand Skia through concrete intended CLI workflows and contributors understand the implemented TypeScript foundation through verified examples.

**Architecture:** Keep the README as an answer-first guide. Put the developer journey before implementation detail, then connect each visible workflow to the current snapshot, schema, storage, Git, parser, and coverage modules. Mark intended CLI behavior separately from implemented foundation behavior so the README is intuitive without claiming unfinished product surfaces.

**Tech Stack:** Markdown, TypeScript/Node.js 24 foundation modules, JSON Schema/Ajv contracts, Git temporary-repository fixtures, and the repository documentation checker.

## Global Constraints

- The implementation language is TypeScript running on Node.js.
- The supported source-language set is exactly `typescript | tsx | python`.
- The README must retain the `Skia`/`skia` name.
- Intended CLI examples must not imply that `skia review` or `skia repo review` are already executable workflows.
- Deferred staged semantic reduction, repository scanning, agent transport, HLD/LLD generation, and behavioral validation remain explicitly deferred.
- All contributor examples must refer to current exports or documented contracts.
- Validation must include `python3 scripts/check_docs.py` and `git diff --check`.

---

### Task 1: Inventory current README claims and implementation anchors

**Files:**
- Read: `README.md`
- Read: `src/git.ts`, `src/schema.ts`, `src/paths.ts`, `src/storage.ts`
- Read: `src/languages/registry.ts`, `src/languages/types.ts`, `src/types.ts`
- Read: `docs/IMPLEMENTATION_SPEC.md`, `docs/OPEN_DECISIONS.md`

**Interfaces:**
- Consumes: existing README narrative, current exported functions, frozen product contracts, and final implementation status.
- Produces: a verified example map for the rewrite; no source changes.

- [ ] **Step 1: Record the intended CLI examples**

Use the existing product examples as the two user journeys:

```text
skia review       # staged-change comprehension flow; intended product surface
skia repo review  # committed-HEAD repository flow; intended product surface
```

Keep each transcript focused on the developer’s next action and label it as
an intended workflow.

- [ ] **Step 2: Record the implemented foundation examples**

Use only current exports in the contributor section:

```text
captureStagedSnapshot(repositoryRoot, options?)
captureRepositorySnapshot(repositoryRoot, options?)
validateCoverageEnvelope(value)
analyzeSourceFile(options)
validateRelativePath(value)
allocateRepositoryRun(repositoryRoot, snapshot, createdAt?)
```

Verify signatures and output names against the source before writing the
README code blocks.

- [ ] **Step 3: Map boundary examples to actual states**

Cover the implemented truth contract with small examples for:

```text
unsupported extension or Git mode -> unsupported coverage
malformed UTF-8 or NUL -> failed coverage
Tree-sitter syntax error -> partial coverage with byte ranges
incomplete storage allocation -> visible incomplete run
corrupt Git ref -> fail-closed operational error
partial/unsupported/failed/unchecked -> retained in coverage artifacts
```

Do not invent output fields that are absent from the current contracts.

---

### Task 2: Rewrite the README around the developer journey

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: the verified example map from Task 1 and the approved design note.
- Produces: an answer-first README with staged and repository workflows before contributor details.

- [ ] **Step 1: Refresh the opening status and promise**

Keep the one-line product promise, then state that the repository currently
contains the Phase 1 TypeScript foundation and intended CLI examples. Make the
implementation boundary visible before the first command transcript.

- [ ] **Step 2: Add the staged workflow example**

Show a compact intended transcript with:

```text
changed code -> exact staged snapshot -> short evidence -> developer prediction -> source check
```

Follow it with a small “what the developer does next” explanation and an
unmapped/unsupported example that demonstrates honest coverage.

- [ ] **Step 3: Add the repository workflow example**

Show the committed-`HEAD` snapshot, deterministic inventory, explicit consent,
selected subsystems, and `unchecked` remainder. Explain that HLD/LLD and
repository scanning are intended/deferred surfaces, not current CLI behavior.

- [ ] **Step 4: Add the implementation pipeline**

Use one compact flow to connect the two journeys to the implemented seams:

```text
Git snapshot -> shared identity/schema -> language analysis -> coverage -> local storage
```

Explain why each boundary exists in one sentence, especially snapshot
immutability, explicit unsupported states, and local-only storage.

---

### Task 3: Add contributor examples and boundary examples

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: actual module exports and fixture-backed behavior from Tasks 1–6.
- Produces: concise implementation examples that help a contributor navigate the code without becoming an API reference.

- [ ] **Step 1: Add a TypeScript foundation example**

Show representative calls or pseudocode with real module names for schema
validation, Git snapshot capture, storage lifecycle, and language analysis.
Mark the section “implemented foundation” and link to the relevant source
modules rather than implying a public package API.

- [ ] **Step 2: Add language and coverage examples**

Use a small `.ts`, `.tsx`, and `.py` example to explain the exact registry and
the important outcomes:

```text
.ts  -> typescript
.tsx -> tsx
.py  -> python
```

Then show how BOM, malformed UTF-8, NUL bytes, oversized blobs, syntax errors,
and unsupported modes remain explicit outcomes.

- [ ] **Step 3: Add storage and Git safety examples**

Explain with short path examples that runs stay beneath `.skia/`, run IDs are
claimed atomically, symlink/traversal paths fail closed, failed deletion is
retryable by exact ID, and copied-index Git reads do not mutate the live repo.

- [ ] **Step 4: Keep truth-contract and non-goals sections concise**

Retain the existing truth labels and “what Skia is not” section, but connect
them to the preceding examples. End with explicit deferred surfaces and
development commands.

---

### Task 4: Validate and commit the documentation rewrite

**Files:**
- Test: `README.md`
- Test: `docs/superpowers/specs/2026-08-12-readme-examples-design.md`
- Test: `docs/superpowers/plans/2026-08-12-intuitive-readme-examples.md`

**Interfaces:**
- Consumes: the completed README and the documented design/plan.
- Produces: validated Markdown and one focused documentation commit.

- [ ] **Step 1: Check example references**

Run:

```bash
rg -n "captureStagedSnapshot|captureRepositorySnapshot|validateCoverageEnvelope|analyzeSourceFile|validateRelativePath|allocateRepositoryRun" README.md src
```

Expected: every implementation example in the README resolves to a current
export or an explicitly labeled contract.

- [ ] **Step 2: Run documentation validation**

Run:

```bash
python3 scripts/check_docs.py
git diff --check
```

Expected: the documentation checker passes and the diff has no whitespace
errors.

- [ ] **Step 3: Inspect the final structure**

Read the rendered Markdown or inspect the source headings and code fences.
Confirm that intended CLI examples appear before contributor examples, every
example has a clear status label, and the final status does not claim deferred
features are implemented.

- [ ] **Step 4: Commit the README rewrite**

```bash
git add README.md
git commit -m "docs: make README examples more intuitive"
```
