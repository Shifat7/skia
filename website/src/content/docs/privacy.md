---
title: Privacy
description: Skia has no review backend and no product telemetry. Future model egress is opt-in.
---

Skia does not operate a review backend and does not send product telemetry. The Phase 1 foundation keeps snapshot and parse artifacts local. A future repository mode may send bounded context to an LLM endpoint you configure, and only after explicit consent. Pair that mode with a local model when the run must stay on the machine. Diffs stay on disk unless you copy them elsewhere.

"Local" describes where artifacts sit. It does not mean a cloud model never receives a prompt.

## Egress matrix

| Path | Status | What can leave the machine |
|---|---|---|
| Foundation library | <span class="status-badge status-badge--ships">Ships today</span> | Designed as local snapshot, parse, and storage work. This page is not a formal network audit. |
| Staged review | <span class="status-badge status-badge--planned">Planned</span> | Specified with no network capability. |
| Cloud model in repository mode | <span class="status-badge status-badge--planned">Planned</span> | Only the provider endpoint you disclose, after consent and an allowlist. |
| Local model | <span class="status-badge status-badge--planned">Planned</span> | A local endpoint, once provider wiring exists. |
| Product telemetry | None | No analytics beacon, crash upload, or auto-update phone-home in the current phase. |

Phase 0 also rules out team dashboards, employee scores, tracked export, and hosted storage. The source for that boundary is [SECURITY.md](https://github.com/Shifat7/skia/blob/main/SECURITY.md).

## What adapters must not add

A future Cursor, Claude Code, Codex, or Actions adapter must not require a Skia account, a hidden fallback provider, or a pull-request comment bot. CI review comments are an exclusion in the implementation plan.

Secrets in diffs stay sensitive. Perfect secret detection is not a promise of the current tree.
