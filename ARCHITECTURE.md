# Skia Architecture -- Phase 0 Target

> **Nothing described in this document has been implemented.** This
> is a target architecture for Phase 0, written to guide future
> implementation. There is no source code, no Cargo workspace, and
> no compiled binary. Every crate, struct, and code snippet below is
> a design proposal, not working code.

---

## 1. Overview

Skia Phase 0 is a single, synchronous, single-threaded Rust binary
that:

1. Reads the exact staged diff and staged file snapshots from git.
2. Parses base and staged TypeScript snapshots with Tree-sitter.
3. Selects one changed function or method.
4. Derives a small set of supported syntax-delta evidence.
5. Shows changed code and asks one deterministic causal question.
6. Records the user's explanation or skip in a local JSON receipt
   bound to a hash of the staged diff.

No async runtime. No plugin system. No file watcher. No cache. No
whole-repository semantic model. No answer grading. No network calls.

---

## 2. Crate structure

A single Cargo package with one binary target:

```
skia/
  Cargo.toml
  src/
    main.rs       # entry point, CLI parsing, orchestration
    git.rs        # staged/base snapshots, diff metadata, hashing
    parser.rs     # Tree-sitter parsing and entity extraction
    evidence.rs   # supported syntax-delta comparisons
    question.rs   # causal prompt catalogue and selection
    receipt.rs    # receipt schema and JSON writing
    prompt.rs     # diff-first terminal interaction
```

A workspace split between core and CLI crates adds complexity without
value at this scale. It can be revisited only when a second consumer of
the library exists.

---

## 3. Technology choices

| Component | Proposed crate | Notes |
|-----------|---------------|-------|
| CLI parsing | `clap` (derive) | Standard Rust CLI library. |
| Tree-sitter bindings | `tree-sitter` | Rust FFI bindings to the Tree-sitter C library. |
| TypeScript grammar | `tree-sitter-typescript` | Provides `Typescript` and `Tsx` language variants. This crate compiles and links the C grammar library. |
| Git invocation | `std::process::Command` | Invoke `git` as a subprocess with structured argument arrays. No shell string, no `libgit2` dependency. |
| JSON serialization | `serde` + `serde_json` | For versioned local receipts only. |
| Diff hashing | `sha2` | SHA-256 binding a receipt to the exact staged diff bytes. |
| Time formatting | `time` | UTC RFC 3339 receipt fields and path-safe filenames. |
| Error handling | `anyhow` | Application-level context and error propagation. |
| Terminal I/O | `std::io` (stdin/stdout) | No TUI framework. Simple line-based prompting. |

### What is not used

- **No `tokio` or async runtime.** The tool is synchronous: read
  diff, parse, prompt, write, exit.
- **No `libgit2` / `git2` crate.** Git is invoked as a subprocess
  with structured argument arrays via `std::process::Command`. This
  avoids a C dependency and keeps the build simple. The trade-off is
  a dependency on `git` being installed on the user's PATH.
- **No `notify` or file watcher.** No watch mode in Phase 0.
- **No plugin framework.** No dynamic loading, no WASM, no trait
  objects for pluggable parsers or passes.
- **No `rmp-serde` or MessagePack.** No cache in Phase 0. Receipts
  are JSON.
- **No Mermaid or report generator.** Phase 0 produces terminal
  output and one local JSON receipt format only.

### Tree-sitter supplies syntax, not semantic proof

The `tree-sitter` crate provides Rust bindings to the Tree-sitter
parsing library. TypeScript and TSX use separate generated grammars.
Tree-sitter provides concrete syntax trees, source ranges, and query
matching; it does not provide TypeScript type inference, symbol
resolution, complete call graphs, intent inference, or control-flow
proof.

Phase 0 therefore limits evidence to directly observed syntax deltas
inside one changed entity. Any future compiler-, LSP-, or LLM-backed
analysis must be introduced as a separate capability with explicit
accuracy tests and claims.

References: [Tree-sitter Rust bindings](https://docs.rs/tree-sitter/latest/tree_sitter/)
and [TypeScript/TSX grammars](https://github.com/tree-sitter/tree-sitter-typescript).

---

## 4. Data flow

```
raw staged diff + index paths + HEAD
       |
       v
  Build immutable review snapshot
  - raw diff bytes and SHA-256
  - base file content from HEAD (when present)
  - staged file content from the index
  - changed staged line ranges
       |
       v
  Parse base and staged .ts/.tsx snapshots
  with the matching Tree-sitter grammar
       |
       v
  Find changed functions/methods and select one
  by changed-line count, then file/line order
       |
       v
  Compare supported syntax within that entity
  - signature
  - call expressions
  - branches
  - throw/catch constructs
       |
       v
  Show changed code + evidence + causal question
  [a] answer  [s] show more code  [k] skip
       |
       v
  Write local receipt containing diff hash,
  evidence, response, show-code action, and duration
       |
       v
  Exit
```

---

## 5. Component design

### 5.1 Git snapshot builder (`git.rs`)

The review target is the index, not the working tree. The component:

1. Reads a NUL-delimited added/modified path list with `git diff
   --cached --name-status -z --diff-filter=AM`.
2. Reads raw zero-context diff bytes with color, text conversion, and
   external diff helpers disabled.
3. Computes SHA-256 over those exact bytes.
4. Reads each staged file from the index (`git show :path`).
5. Reads the base file from `HEAD` when it exists (`git show
   HEAD:path`). Added files use an empty base snapshot.
6. Parses changed staged-line ranges from hunk headers.

The component never reads the working-tree copy of a reviewed file;
that copy may contain unstaged edits. Paths, commands, and raw output
must be tested with spaces and non-ASCII characters. Phase 0 rejects
renames, deletions, binary files, submodules, and unsupported status
codes with an explicit message rather than silently reviewing the
wrong content.

All subprocesses use `std::process::Command` with structured arguments
and run at the discovered repository root. No shell is involved.

### 5.2 Parser and entity extractor (`parser.rs`)

The parser chooses the TypeScript grammar for `.ts` and the TSX grammar
for `.tsx`, then parses both base and staged snapshots. Phase 0 extracts
only named function declarations and named class/object methods. Each
entity records kind, name, file, staged source span, and a handle to its
base and staged syntax nodes when both exist.

An entity qualifies when its staged span overlaps at least one changed
staged-line range. New entities have no base node. Deleted entities are
outside Phase 0. If syntax errors overlap the candidate entity, Skia
must show the parse limitation and fall back or stop; it must not derive
confident evidence from the invalid region.

Selection is deterministic: choose the entity containing the largest
number of changed staged lines, then break ties by path and starting
line. This strategy is simple enough to test and more relevant than
always selecting the first file.

If no supported entity qualifies, the tool prints "No supported changed
function or method found" and exits without a receipt.

### 5.3 Syntax-delta evidence (`evidence.rs`)

The evidence layer compares supported node families within the base and
staged entity. Phase 0 can emit:

- before/after function signature text;
- added or removed call-expression callee text;
- added or removed conditional/loop branch text;
- added `throw` or `catch` constructs.

Matching is deliberately conservative. It may use normalized node text
and stable local ordering, but it must prefer an explicit fallback over
claiming a semantic relationship it cannot prove. Evidence items contain
a kind, add/remove/change direction, staged line when applicable, and a
short source-derived summary.

### 5.4 Question catalogue (`question.rs`)

The catalogue is a static ordered list of trigger/prompt templates. A
question contains an ID, required evidence kind, and a prompt renderer.
Selection follows the order in PRD.md Section 6. It is deterministic
for a given evidence set.

There is no expected-answer function and no free-text classifier in
Phase 0. The product is testing whether a developer explains the
change, not whether a string matcher can certify comprehension.

### 5.5 Receipt writer (`receipt.rs`)

The writer serializes the versioned schema from PRD.md Section 7,
including the staged-diff SHA-256, evidence, response, show-code action,
and duration. The path format is:

```
.skia/receipts/{YYYYMMDDTHHMMSSZ}-{diffHashPrefix}-{entitySlug}.json
```

The writer creates `.skia/receipts/` when needed, sanitizes filenames,
and fails clearly on write errors. Receipts are gitignored and may
contain sensitive source-derived summaries; no upload path exists.

### 5.6 Terminal prompt (`prompt.rs`)

Simple line-based I/O using `std::io::stdin` and `std::io::stdout`:

1. Print entity, file, staged line range, changed lines, and evidence.
2. Print the causal question.
3. Print `[a] answer  [s] show more code  [k] skip`.
4. If `a`, read a one-to-three-sentence explanation.
5. If `s`, print the full staged entity plus bounded local context,
   record `showed_code = true`, and prompt again.
6. If `k`, record the skip without pretending the review passed.
7. Write the receipt and exit.

No TUI framework, answer grading, or network call is involved. ANSI
color may be added only when it degrades cleanly in non-interactive
terminals.

---

## 6. Git invocation strategy

Skia invokes `git` as a subprocess using `std::process::Command`
with structured argument arrays. It does not use a shell string and
does not depend on `libgit2`.

Commands used in Phase 0:

| Command | Arguments | Purpose |
|---------|-----------|---------|
| `git rev-parse` | `--show-toplevel` | Discover repository root. |
| `git rev-parse` | `HEAD` | Identify the base commit. |
| `git symbolic-ref` | `--short -q HEAD` | Read branch name without mislabeling detached HEAD. |
| `git diff` | `--cached --name-status -z --diff-filter=AM` | Read supported staged paths robustly. |
| `git diff` | `--cached --unified=0 --no-color --no-ext-diff --no-textconv` | Produce raw parseable diff bytes and changed ranges. |
| `git show` | `:path` | Read the staged snapshot from the index. |
| `git show` | `HEAD:path` | Read the base snapshot when it exists. |

All invocations run at the discovered root, check exit status, retain
stderr for diagnostics, and place revision/path expressions in a
single argument. The snapshot tests must cover spaces, non-ASCII paths,
new files, detached HEAD, and unstaged edits adjacent to staged edits.

### Why subprocess git for Phase 0

The required operations are native git concepts and are available in
the developer environments Skia targets. Structured subprocess
invocation keeps the initial dependency surface small and avoids shell
injection. The trade-off is a runtime dependency on a compatible `git`
binary. If process portability becomes a measured problem, the project
can evaluate `gix` or `git2` later rather than predicting the need now.

---

## 7. Error handling

All fallible operations return `Result<T, anyhow::Error>`. The main
function prints user-friendly error messages and exits with a
non-zero code. Errors are not silenced.

Error cases that must be handled:

- Not a git repository.
- No staged changes.
- `git` not found on PATH.
- Unsupported staged status (rename, deletion, binary, submodule).
- Base or staged snapshot cannot be read from git.
- Diff/path parsing is ambiguous.
- Tree-sitter reports an error overlapping the selected entity.
- No supported changed function or method exists.
- `.skia/receipts/` cannot be created or written.
- Receipt filename sanitization produces a collision.

---

## 8. Testing strategy

### Pure base/staged fixtures

Each fixture contains a base snapshot, staged snapshot, changed-line
metadata, and expected entity/evidence/question output:

```
fixtures/
  added-branch/
    base.ts
    staged.ts
    expected.json
  changed-signature-tsx/
    base.tsx
    staged.tsx
    expected.json
  ...
```

The corpus must cover every evidence kind plus fallbacks and known
limits: overloads, generics, decorators, nested functions, anonymous
callbacks, syntax errors, and unsupported entity kinds.

### Temporary-repository snapshot tests

Tests create real temporary git repositories and verify that Skia:

- reviews the index rather than adjacent unstaged edits;
- handles added files and detached HEAD;
- rejects unsupported statuses explicitly;
- preserves paths with spaces and non-ASCII characters;
- computes a stable hash for the exact raw staged diff.

### Golden interaction and receipt tests

End-to-end tests inject stdin and capture stdout, covering answer,
show-more-code, skip, invalid menu input, and write failure. Golden
receipts normalize timestamp and duration while preserving the staged
diff hash, evidence, prompt, and response structure.

### Behavioral validation

Mechanical tests cannot show that the checkpoint improves
comprehension. The four-week dogfood pilot in PRD.md Section 8 is a
separate product test and must complete before the project adds an
automatic git hook or expands language support.

---

## 9. Configuration

Phase 0 has no configuration file. No `.skia/config.toml`. No
runtime flags beyond the command itself (`skia review`).

Configuration introduces complexity and state. Phase 0 is a single
command with deterministic behavior. If configuration becomes
necessary (e.g., question catalogue tuning, receipt directory
customization), it will be added in a later phase with evidence
justifying the complexity.
