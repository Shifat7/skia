---
title: Status
description: What ships in the Skia repository today, what is planned, and what is not a roadmap item.
---

Alpha. The Phase 1 foundation is in the repository. The product CLI is not released.

Solid means the code and tests exist today. Outline means intended product behavior with no install command. Outline is not a green check.

## Ships today

| Capability | Status |
|---|---|
| Exact Git snapshots (staged and committed `HEAD`) | <span class="status-badge status-badge--ships">Ships today</span> |
| Schema and coverage validation | <span class="status-badge status-badge--ships">Ships today</span> |
| TypeScript, TSX, and Python analysis | <span class="status-badge status-badge--ships">Ships today</span> |
| Local path-safe storage | <span class="status-badge status-badge--ships">Ships today</span> |
| Coverage states, including `partial` and `unmapped` | <span class="status-badge status-badge--ships">Ships today</span> |
| Bootstrap `skia` shell (`implemented: false`) | <span class="status-badge status-badge--ships">Ships today</span> |

The shell shipping today returns an unimplemented result. It does not review a diff.

## Intended or planned

| Capability | Status |
|---|---|
| Simplified view and one prediction prompt | <span class="status-badge status-badge--planned">Planned</span> |
| `skia review` and `skia repo review` | <span class="status-badge status-badge--planned">Planned</span> |
| HLD / LLD drafts (`model_derived`, not authoritative) | <span class="status-badge status-badge--planned">Planned</span> |
| npm publish (first channel, still private) | <span class="status-badge status-badge--planned">Planned</span> |
| Homebrew tap | <span class="status-badge status-badge--planned">Planned</span> |
| curl or binary installer after a signed release | <span class="status-badge status-badge--planned">Planned</span> |
| Cursor, Claude Code, Codex, GitHub Actions adapters | <span class="status-badge status-badge--planned">Planned</span> |

npm is the channel that would ship first. This page has no `npm install -g`, `brew`, or `curl` command. Publication also waits on the name decision in [OD-1](https://github.com/Shifat7/skia/blob/main/docs/OPEN_DECISIONS.md). Node.js 24.x is the engine floor in `package.json` (`>=24.0.0 <25`).

## Not a roadmap item

These are exclusions in the implementation plan and repository metadata, so they do not get a planned badge:

- complete call graphs or a generated dependency-graph product;
- type inference or type-drift analysis;
- DRY analysis;
- an error-coverage or error-flow proof product;
- a hosted PR bot, team dashboard, or product telemetry;
- CI review comments.

`partial` and `unmapped` coverage from the parser foundation is a different thing: it records what a run could not safely reduce. That visibility ships in the foundation. A polished "error coverage" product does not.

## Proof gaps

There is no public benchmark, no captured CLI transcript, and no tester-quote wall. Samples under `examples/illustrative/` are hand-written. Stars are not used as a quality signal.
