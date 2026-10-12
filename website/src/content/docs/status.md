---
title: Status
description: What ships in the Skia repository today, what is planned, and who the reading check is for.
---

Alpha. Phase 1 foundation is in the repository. The package is not released.

Skia is for engineers who review their own changes, including AI-written diffs. It does not review or approve the commit for you.

| Fact | Value |
|---|---|
| License | MIT |
| Engine floor | Node.js `>=24.0.0 <25` (`package.json`) |
| Package | `0.0.0`, `private: true` — unpublished |
| Product telemetry | None planned |
| Review backend | None — no Skia-operated review service |

**Ships today** means the code and tests exist now. **Planned** means intended product behavior with no install command. Planned is not a green check.

## Ships today

| Capability | Status |
|---|---|
| Exact Git snapshots (staged and committed `HEAD`) | <span class="status-badge status-badge--ships">Ships today</span> |
| Schema and coverage validation | <span class="status-badge status-badge--ships">Ships today</span> |
| TypeScript, TSX, and Python analysis | <span class="status-badge status-badge--ships">Ships today</span> |
| Local path-safe storage | <span class="status-badge status-badge--ships">Ships today</span> |
| Coverage states, including `partial` and `unmapped` | <span class="status-badge status-badge--ships">Ships today</span> |
| Narrow `skia review` pilot (`implemented: "partial"`) | <span class="status-badge status-badge--ships">Ships today</span> |

The shell that ships today runs `review` for exactly one staged `.ts` file containing one named function with a strict literal guard and literal return. Other command surfaces return an unimplemented result. `skia repo review` does not run.

## Planned

| Capability | Status |
|---|---|
| Simplified view and one prediction prompt beyond the literal-guard pilot | <span class="status-badge status-badge--planned">Planned</span> |
| `skia repo review` | <span class="status-badge status-badge--planned">Planned</span> |
| HLD / LLD drafts (`model_derived`, not authoritative) | <span class="status-badge status-badge--planned">Planned</span> |
| npm publish (first channel, still private) | <span class="status-badge status-badge--planned">Planned</span> |
| Homebrew tap | <span class="status-badge status-badge--planned">Planned</span> |
| curl or binary installer after a signed release | <span class="status-badge status-badge--planned">Planned</span> |
| Cursor, Claude Code, Codex, GitHub Actions adapters | <span class="status-badge status-badge--planned">Planned</span> |

npm is the channel that would ship first. This page has no `npm install -g`, `brew`, or `curl` command. Publication also waits on the name decision in [OD-1](https://github.com/Shifat7/skia/blob/main/docs/OPEN_DECISIONS.md). Node.js 24.x is the engine floor in `package.json` (`>=24.0.0 <25`).

## Not on the roadmap

These are exclusions in the implementation plan and repository metadata. They do not get a planned badge:

- complete call graphs or a generated dependency-graph product;
- type inference or type-drift analysis;
- DRY analysis;
- an error-coverage or error-flow proof product;
- a hosted PR bot, team dashboard, or product telemetry;
- CI review comments.

`partial` and `unmapped` from the parser foundation are different: they record what a run could not safely reduce. That visibility ships today. A polished "error coverage" product does not.

## Proof gaps

There is no public benchmark, no captured CLI transcript, and no tester-quote wall. Samples under `examples/illustrative/` are hand-written. Stars are not a quality signal.
