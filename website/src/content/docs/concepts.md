---
title: Concepts
description: Simplified views, one prediction, and why partial and unmapped coverage belong in the product.
---

These are the reading ideas for the product. They are not output from a released CLI.

## Simplified view

A simplified view is a short, source-anchored reading of what a change appears to do. It is labeled **not executable**. The original source and the exact Git snapshot stay authoritative. A simplified view is not semantic equivalence, and it is not code to paste back into a project.

The decision is recorded in [ADR-001](https://github.com/Shifat7/skia/blob/main/docs/decisions/ADR-001-simplified-code-as-evidence.md).

## One prediction

The planned card asks for one concrete result before feedback. That answer is `developer_supplied`. The system may supply the scenario. Skia does not treat the answer as a passing test or as runtime verification.

## Gaps stay visible

If a run cannot safely reduce something, it must say so. Hiding the gap behind a clean summary is the failure mode.

| State | What you should do |
|---|---|
| `supported` | Read the evidence and answer the question. |
| `partial` | Inspect the source range. Do not assume the view is complete. |
| `unmapped` | Open the original source. The changed material was not tied to a supported behavior unit. |
| `unsupported` | Treat the file as not analyzed. |
| `failed` | Read the reason. Decoding, parsing, or an operational step failed. |
| `unchecked` | Do not treat the area as reviewed. |

`partial` and `unmapped` are the cases a vibecoder most needs to see: a callback the reducer cannot map, an SDK failure mode, a syntax error, a file outside TypeScript, TSX, and Python.

## Illustrative transcripts

Both files are labeled **Illustrative / intended UX — not a live CLI session**:

- [Pricing happy path](https://github.com/Shifat7/skia/blob/main/examples/illustrative/pricing-happy-path.md)
- [Partial and unmapped](https://github.com/Shifat7/skia/blob/main/examples/illustrative/partial-unmapped.md)

Supported source languages are exactly `typescript`, `tsx`, and `python`.
