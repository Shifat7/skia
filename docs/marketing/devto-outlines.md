# Dev.to outlines

Three article outlines drawn from the growth-strategy themes: the
generation-to-commit gap, a concrete reading workflow, and an honest privacy
posture. They are drafts for after Gate A unless a piece can be written
entirely as a problem essay with no install instructions.

**DRAFT. Do not publish** a tutorial that tells readers to run `skia review`.

Each outline must keep `deterministic`, `model_derived`,
`developer_supplied`, and `not_available` distinct, and must keep coverage
states visible.

## 1. Why the gap between generation and commit matters

Theme: problem essay. This one can be drafted before Gate A if it never
implies the CLI runs.

### Thesis

AI coding tools move code into your tree faster than a mental model forms.
The individual developer needs a checkpoint before that gap becomes a
reviewer's problem. "AI code review" as a hosted PR bot is a different job.

### Sections

1. Four concrete failure modes, in the README's words: extra machinery,
   hidden branches, unfamiliar code that still passes tests, missing
   production detail (retries, idempotency, error handling, observability).
2. Where hosted PR reviewers sit (after the PR) and where a local checkpoint
   would sit (before commit). No catch-rate table.
3. What a useful checkpoint has to show: apparent behavior, unanalyzed
   regions, and the next source to open.
4. What would count as evidence later: a pre-registered reading study, not
   star velocity. Link [docs/VALIDATION.md](../VALIDATION.md) for the
   hypotheses and the claims the project must not make.
5. Close on the repository status: foundation present, review command absent.

### Must not claim

- Skia has measured a comprehension gain.
- Survey percentages from secondary write-ups are Skia's results. If a
  primary source is cited, name it and quote only what that source measured.
- A runnable quickstart.

## 2. One prediction before you trust a generated diff

Theme: workflow tutorial. **HOLD** until Gate A. Until then, publish only if
every figure is labeled intended UX from [examples/](../../examples/README.md).

### Thesis

A compact reading view plus one developer-supplied prediction makes a hidden
branch harder to skip. The view is not executable and is not semantic
equivalence.

### Sections

1. Pricing example: member discount, then promotion, then clamp and round.
   Scenario `total=100`, member, promotion `10`. Example answer `80`, labeled
   `developer_supplied`, not a test result.
2. Archive example: forbidden and already-archived branches do no writes;
   the success path updates status, writes an audit event, and enqueues a
   notification. Coverage note: failure after the status update is unchecked
   by the simplified view.
3. Python retry example, summarized: timeouts retry, HTTP 500 does not.
   Point at the README rather than inventing a new fixture.
4. How to read `supported`, `partial`, `unmapped`, `unsupported`, `failed`,
   and `unchecked` without turning a warning into a clean summary.
5. After Gate A only: the exact command, the fixture path, and the date it
   was run. Before Gate A: link the hand-written examples and say the CLI
   did not produce them.

### Must not claim

- The example answer was produced by executing the snippet inside Skia.
- The simplified view can be pasted back into the project.
- Editor adapters exist. Mention Cursor, Claude Code, and Codex only as
  planned hosts for the same future local command.

## 3. Local-first does not mean never networked

Theme: privacy. Corrects the generic "opt-out telemetry on by default"
recommendation. Skia's contract is no product telemetry.

### Thesis

Readers should see an egress matrix, not a slogan. "Your code never leaves"
is false for a future cloud-model mode. "No telemetry" is accurate for the
current phase and should stay narrow: no analytics beacon, crash upload, or
update check from Skia itself.

### Sections

1. What Phase 0 already rules out: team dashboards, employee scores,
   telemetry, update checks, tracked export, hosted storage. Source:
   [SECURITY.md](../../SECURITY.md).
2. Egress matrix: foundation library, planned staged review (no network),
   planned repository mode with a cloud endpoint (consent and allowlist),
   planned local model, product telemetry (none).
3. What a future adapter must not add: a mandatory Skia account, a hidden
   fallback provider, or a PR-comment bot. CI review comments are an
   exclusion in the implementation plan.
4. Secrets: diffs are sensitive. Secret scanning is a required release
   control later; it is not a promise of perfect detection now.
5. Name collision: this project is not Google's Skia graphics library, and
   [OD-1](../OPEN_DECISIONS.md) blocks publishing an npm package under the
   current name until that risk is accepted in writing.

### Must not claim

- The foundation has had an external security audit.
- Offline review is available today. The local-model path is planned.
- Opt-out telemetry will be added because other CLIs do that.
