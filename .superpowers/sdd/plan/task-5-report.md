# Task 5 report

Date: August 11, 2026

## Scope completed

Implemented the Task 5 TypeScript/TSX/Python language registry and parser-coverage foundation only. No staged-behavior reduction, repository scanning, CLI wiring, agent behavior, or Task 4 semantic changes were added.

## Changed files

- `fixtures/languages/bom.ts.json`
- `fixtures/languages/invalid-utf8.json`
- `fixtures/languages/nul-source.json`
- `fixtures/languages/oversized.ts`
- `fixtures/languages/sample.py`
- `fixtures/languages/sample.ts`
- `fixtures/languages/sample.tsx`
- `fixtures/languages/syntax-error.ts`
- `fixtures/languages/unsupported-cases.json`
- `fixtures/languages/unsupported-extension.md`
- `src/git.ts`
- `src/languages/python.ts`
- `src/languages/registry.ts`
- `src/languages/types.ts`
- `src/languages/typescript.ts`
- `src/types.ts`
- `tests/language-registry.test.ts`
- `types/node-module.d.ts`

## Implementation summary

- Centralized exact, case-sensitive `.ts`, `.tsx`, and `.py` registration in `src/languages/registry.ts`.
- Disclosed explicit dialect IDs plus pinned parser/grammar package versions:
  - `.ts` → `typescript` → `tree-sitter-typescript.typescript`
  - `.tsx` → `tsx` → `tree-sitter-typescript.tsx`
  - `.py` → `python` → `tree-sitter-python`
- Added strict UTF-8 decoding with optional BOM removal, `binary_source` handling for NUL bytes, and `invalid_source_encoding` handling for malformed UTF-8.
- Added parser-neutral syntax-tree summaries and ordered/coalesced syntax-error byte ranges for Tree-sitter `ERROR`/missing nodes.
- Added explicit unsupported coverage for unsupported extensions, unsupported Git modes/statuses, and oversized blobs without decoding/parsing those inputs.
- Added stable failed parse reasons for parser initialization and parser execution failures.
- Reused the shared registry from `src/git.ts` so extension recognition is centralized without changing Task 4 capture behavior.

## Verification commands and exact summaries

1. `npm run typecheck`
   - Exit: `0`
   - Output summary:
     - `> skia@0.0.0 typecheck`
     - `> tsc --noEmit -p tsconfig.json`

2. `npm run build`
   - Exit: `0`
   - Output summary:
     - `> skia@0.0.0 build`
     - `> tsc -p tsconfig.json`

3. `npm test -- --test-name-pattern='language|parser|coverage'`
   - Exit: `0`
   - Output summary:
     - `> skia@0.0.0 test`
     - `> node --test dist/tests/*.test.js dist/tests/golden/*.test.js dist/tests/security/*.test.js --test-name-pattern=language|parser|coverage`
     - `tests 55`
     - `pass 55`
     - `fail 0`
   - Note: this command still exercised the compiled suite selected by the package script file globs; the new language/parser/coverage tests were included and passed.

4. `git diff --check`
   - Exit: `0`
   - Output summary: no output

## Runtime and dependency notes

- Active shell runtime during implementation:
  - `node --version` → `v23.7.0`
  - `npm --version` → `10.9.2`
- Repository contract/pin remains:
  - Node `>=24.0.0 <25`
  - npm `11.18.0`
- Tree-sitter packages already present and used from the pinned lockfile set:
  - `tree-sitter@0.21.1`
  - `tree-sitter-typescript@0.23.2`
  - `tree-sitter-python@0.21.0`

## Concerns

- The active shell runtime does not match the frozen Task 5 toolchain contract. The requested checks passed under Node `v23.7.0` / npm `10.9.2`, but the repository still expects Node 24 / npm 11.18.0 and should be re-verified there when available.
- The current TypeScript config does not expose ambient typings for `node:module`, `ImportMeta.url`, or `TextDecoder`, so `types/node-module.d.ts` was added as a local compatibility shim rather than broadening package dependencies or compiler settings in this task.

## Commit hashes

- Implementation commit: `64d1acf5c0e79a4a1c247606741482cbdcfaa9aa` (`feat: add language registry parser foundation`)

## Fix round 1: multibyte UTF-8 parser offset mapping

### Issue addressed

- Corrected the important multibyte mapping bug in `src/languages/registry.ts`.
- Tree-sitter JS `startIndex`/`endIndex` values are UTF-16 code-unit offsets in this binding, not UTF-8 byte offsets.
- The previous implementation wrote those parser indices directly into exported `*_byte` fields and then derived line/column data from them, which undercounted valid multibyte UTF-8 input.

### Fix summary

- Added an explicit code-unit-boundary → UTF-8-byte-offset map for decoded source text.
- Converted parser node indices and syntax-error ranges through that map before populating exported byte fields.
- Kept line/column derivation deterministic by continuing to compute it from the mapped UTF-8 byte offsets.
- Added multibyte regression fixtures and tests covering:
  - valid non-ASCII UTF-8 root byte/column mapping; and
  - syntax-error byte-exact range mapping after multibyte text.

### Fix-round changed files

- `fixtures/languages/multibyte.ts`
- `fixtures/languages/multibyte-syntax-error.ts`
- `src/languages/registry.ts`
- `tests/language-registry.test.ts`

### Fix-round verification commands and exact summaries

1. `which -a node node24 || true`
   - Exit: `0`
   - Output summary:
     - `/opt/homebrew/bin/node`
   - Result: no separate local `node24` executable was available in this workspace.

2. `node --test --test-name-pattern='multibyte' dist/tests/language-registry.test.js`
   - Exit: `0`
   - Output summary:
     - `tests 2`
     - `pass 2`
     - `fail 0`

3. `npm run typecheck`
   - Exit: `0`
   - Output summary:
     - `> skia@0.0.0 typecheck`
     - `> tsc --noEmit -p tsconfig.json`

4. `npm run build`
   - Exit: `0`
   - Output summary:
     - `> skia@0.0.0 build`
     - `> tsc -p tsconfig.json`

5. `npm test -- --test-name-pattern='language|parser|coverage'`
   - Exit: `0`
   - Output summary:
     - `tests 57`
     - `pass 57`
     - `fail 0`

6. `git diff --check`
   - Exit: `0`
   - Output summary: no output

### Fix-round concern update

- The frozen Node 24 / npm 11.18.0 toolchain could not be selected from a separate local binary in this workspace. Verification therefore ran under the currently available `node` executable, which remains outside the frozen contract.

### Fix-round commit hash

- Fix round 1 implementation commit: `8ea72ab1ac9883fcd3f697f36ecef28c8d9edcbc` (`fix: map parser offsets to utf8 bytes`)
