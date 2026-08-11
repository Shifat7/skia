# README Examples Design

## Goal

Make the README intuitive for two audiences without overstating the current
implementation:

1. A developer who wants to understand the intended Skia workflow through
   concrete examples.
2. A contributor who wants to understand how the current TypeScript foundation
   supports that workflow.

## Information architecture

The README will use a hybrid, scenario-first structure:

1. A short product statement and an explicit status note.
2. A staged-change walkthrough showing the intended `skia review` experience.
3. A repository walkthrough showing the intended `skia repo review` experience.
4. A compact “what happens” pipeline connecting Git snapshot, deterministic
   analysis, coverage, prediction, and local artifacts.
5. Contributor examples for the implemented TypeScript foundation:
   - schema/domain validation;
   - path-safe local storage;
   - hardened Git snapshots; and
   - TypeScript/TSX/Python parsing and coverage.
6. Boundary-case examples showing unsupported inputs, syntax errors, corrupt
   refs, incomplete runs, and visible coverage states.
7. Development commands, current status, and deferred product surfaces.

## Example rules

- Every transcript or code block is labeled either “intended workflow” or
  “implemented foundation.”
- Examples use small, realistic inputs and show the important output, not a
  full artifact dump.
- CLI examples must not imply that the currently unimplemented CLI commands
  can already be run successfully.
- Contributor examples should use real module names and current contracts,
  verified against the repository before the README is edited.
- Examples must reinforce the truth contract: unsupported, failed, partial,
  and unchecked states remain visible.
- The README should explain the developer’s next action in each workflow,
  rather than only describing internal architecture.

## Scope and non-goals

This is a documentation-only rewrite of `README.md`, plus this design note.
It will not add CLI behavior, change schemas or APIs, alter product naming, or
claim that deferred repository scanning, semantic reduction, agent transport,
or HLD/LLD generation is implemented.

## Validation

After implementation:

- inspect the rendered Markdown structure and code fences;
- run `python3 scripts/check_docs.py`;
- run `git diff --check`; and
- confirm every implementation example refers to an existing file, export, or
  documented contract.
