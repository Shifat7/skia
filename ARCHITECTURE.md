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
3. Identifies all supported changed functions or methods, checks the
   staged change against pilot budgets (at most 3 supported entities
   and 150 added-plus-deleted TypeScript lines), and processes every supported
   entity in deterministic path/line order within the budget.
4. Derives a small set of supported syntax-delta evidence for each
   entity.
5. Shows changed lines and conservative syntax delta, collects a
   strongly typed Behavior Card for each entity, performs a narrow
   source check when possible, and may produce an optional probe spec
   (structured JSON, never source code).
6. Records the session -- total, mapped, and unmapped changed
   TypeScript lines; an entry for every supported entity (each card or
   skip); source-check and probe-spec status; and session `card_status`
   (`complete`, `partial`, or `skipped`) -- in a local JSON
   comprehension receipt bound to a hash of the staged diff.
   `card_status` describes form completion only, never review coverage.

No async runtime. No plugin system. No file watcher. No cache. No
whole-repository semantic model. No card grading. No network calls.
No arbitrary TypeScript execution. No project file writes beyond the
comprehension receipt. No package command execution. No source code
generation: probe specs are structured JSON, never source code.

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
    card.rs       # Behavior Card templates, validation, and source checks
    probe.rs      # optional probe spec generation (structured JSON, never source code)
    receipt.rs    # comprehension receipt schema and JSON writing
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
  Find all changed functions/methods
  Count total, mapped, and unmapped changed TS lines
  Check pilot budgets (<= 3 entities, <= 150 added+deleted TS lines)
  If over budget: refuse, ask developer to re-stage,
  write no receipt
  Otherwise: disclose unmapped lines and process all
  supported entities in deterministic path/line order
       |
       v
  For each supported entity:
    Compare supported syntax within that entity
    - signature
    - call expressions
    - branches
    - throw/catch constructs
       |
       v
    Show changed lines + conservative syntax delta
    + Behavior Card prompt
    [f] fill card  [s] show more code  [k] skip
       |
       v
    Perform narrow local source check only when
    JSON arguments evaluate an allowlisted atomic
    branch predicate ending in literal return/throw
    Label: source_derived_match | source_derived_
    mismatch | not_checkable
       |
       v
    Optionally produce probe spec for eligible cards
    with JSON-compatible arguments and return/throw
    prediction
    {status: draft_unexecuted, invoke, expect} or
    {status: not_available, reason}
    Never source code, never run, never written to project
       |
       v
  Write local comprehension receipt containing
  total/mapped/unmapped changed TS lines, per-entity
  entries (evidence, behavior card, source check,
  probe spec, show-code action), session card_status,
  diff hash, and duration
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
6. Parses base-side and staged-side hunk ranges, counting additions and
   deletions separately.

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

An entity qualifies when its staged span overlaps an added/modified
new-side range or its paired base span overlaps a deleted/modified
old-side range. New entities have no base node. A wholly deleted entity
is outside Phase 0 and its deleted lines remain unmapped. If syntax
errors overlap the candidate entity on either snapshot, Skia
must show the parse limitation and fall back or stop; it must not derive
confident evidence from the invalid region.

Processing is deterministic: all supported entities are processed in
path and starting-line order. Phase 0 checks the staged change against
provisional pilot budgets -- at most 3 supported entities and 150
added-plus-deleted TypeScript lines. If either budget is exceeded, the tool refuses
to summarize or sample away review debt: it prints a clear message
asking the developer to re-stage a smaller coherent change and exits
without a comprehension receipt. The 3-entity and 150-line budgets are
product-experiment defaults, not risk-science benchmarks. One Behavior
Card per entity; therefore 1-3 cards per session.

The extractor accounts for every added and deleted TypeScript diff line
as mapped (overlapping a supported staged or base entity) or unmapped
(imports, top-level statements, wholly deleted/unsupported constructs,
or other regions). It displays and
stores both counts. Card completion never suppresses or claims coverage
of unmapped lines.

If no supported entity qualifies, the tool prints "No supported changed
function or method found" and exits without a comprehension receipt.

### 5.3 Syntax-delta evidence (`evidence.rs`)

The evidence layer compares supported node families within the base and
staged entity. Phase 0 can emit:

- before/after function signature text;
- added or removed call-expression callee text;
- added or removed conditional/loop branch text;
- added `throw` or `catch` constructs.

Evidence is diff-first and source-grounded: changed lines plus a
conservative syntax delta are shown before the Behavior Card prompt.
No summary-first UI, whole-codebase graph, or hidden AI judgment is
used. Matching is deliberately conservative. It may use normalized
node text and stable local ordering, but it must prefer an explicit
fallback over claiming a semantic relationship it cannot prove.
Evidence items contain a kind, add/remove/change direction, staged
line when applicable, and a short source-derived summary.

### 5.4 Behavior Card templates and source checks (`card.rs`)

The card module is a static ordered list of trigger/template pairs.
A template contains an ID, required evidence kind, and a prompt
renderer that collects the typed Behavior Card fields (GIVEN, WHEN,
THEN, BECAUSE, IMPACT). Template selection follows the order in
PRD.md Section 6. It is deterministic for a given evidence set.

The module also performs the narrow source check. Eligibility requires
`given.arguments` to supply values for one atomic branch predicate in a
small allowlist: boolean parameter, `!parameter`, or comparison of a
parameter with a JSON literal using `===`, `!==`, `<`, `<=`, `>`, or
`>=`. The chosen branch must end in `return` of a JSON scalar literal
or `throw` of a string literal / `new Error` with a literal message.
Return values use canonical JSON-scalar equality; throws compare the
literal message. Method state, property access, helper calls,
coercive equality, mutation, compound predicates, and non-literal
endpoints are `not_checkable`.

For an eligible local branch, the module compares the card's THEN
prediction with the observed endpoint and emits `source_derived_match`,
`source_derived_mismatch`, or `not_checkable`. UI labels use spaces and
hyphens. A match concerns only that displayed branch; it never proves
whole-function reachability or runtime behavior and is never labelled
correct or verified.

The submitted card is persisted before the source-check result and is
not rewritten after feedback in Phase 0.

There is no expected-answer function and no free-text classifier in
Phase 0. The product is testing whether a developer predicts the
change, not whether a string matcher can certify comprehension.

### 5.4b Probe spec generation (`probe.rs`)

Probe eligibility is limited to exported top-level functions whose
JSON arguments map unambiguously to declared parameter order (no
receiver, destructuring, rest/default ambiguity, missing, or extra
values) and whose THEN predicts a return or throw. The module may then
produce a PROBE SPEC from the card. The probe spec is a compact machine-readable experiment
suggestion stored as structured JSON, never source code. For eligible
cards it produces `{status: draft_unexecuted, invoke: {entity, arguments}, expect: {kind, value}}`;
otherwise `{status: not_available, reason}`. Phase 0 must never write
the probe spec into the project, run it, treat it as a test, or include
a `framework_hint` or code text. It may be printed or stored alongside
the receipt. Side-effect predictions (THEN kind = `side_effect`) are
not eligible without a later adapter.

### 5.5 Comprehension receipt writer (`receipt.rs`)

The writer serializes the versioned schema from PRD.md Section 7,
including the staged-diff SHA-256, session scope counts
(`supported_entity_count`, `changed_ts_lines`,
`mapped_changed_ts_lines`, and `unmapped_changed_ts_lines`),
an entry for every supported entity (evidence, behavior card,
source-check status, probe spec status, show-code action, per-entity
action), session `card_status`, duration, and privacy caveat.
`card_status` describes card completion only, not review coverage. The
path format is:

```
.skia/receipts/{YYYYMMDDTHHMMSSZ}-{diffHashPrefix}-session.json
```

The writer creates `.skia/receipts/` when needed, sanitizes filenames,
and fails clearly on write errors. Comprehension receipts are
gitignored and may contain sensitive source-derived summaries and a
behavior card; no upload path exists.

### 5.6 Terminal prompt (`prompt.rs`)

Simple line-based I/O using `std::io::stdin` and `std::io::stdout`:

1. Print the pilot budget result and total, mapped, and unmapped
   changed TypeScript line counts. State that cards cover supported
   entities only.
2. For each supported entity in deterministic path/line order:
   a. Print entity, file, staged line range, changed lines, and
      conservative syntax delta.
   b. Print the Behavior Card template prompt (GIVEN/WHEN/THEN/BECAUSE/
      IMPACT fields).
   c. Print `[f] fill card  [s] show more code  [k] skip`.
   d. If `f`, collect the structured card fields.
   e. If `s`, print the full staged entity plus bounded local context,
      record `show_code = true`, and prompt again.
   f. If `k`, record the skip for this entity without pretending the
      review passed.
   g. Persist the submitted card, then show the source-check result.
      Do not rewrite the recorded prediction after feedback in Phase 0.
   h. Optionally show or store the probe spec
      (`{status: draft_unexecuted, invoke, expect}` or
      `{status: not_available, reason}`), labeled as a
      machine-readable experiment suggestion, never as a test or
      executable code.
3. After all entities are processed, write the comprehension receipt
   with session `card_status` and exit without review-pass language.

No TUI framework, card grading, or network call is involved. ANSI
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
- Staged change exceeds pilot budget (more than 3 supported entities
  or more than 150 added-plus-deleted TypeScript lines). The tool asks the
  developer to re-stage a smaller coherent change and exits without a
  receipt.
- `.skia/receipts/` cannot be created or written.
- Receipt filename sanitization produces a collision.

---

## 8. Testing strategy

### Pure base/staged fixtures

Each fixture contains a base snapshot, staged snapshot, changed-line
metadata, expected entity/evidence, expected source-check eligibility,
expected probe spec eligibility, and expected budget status:

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
callbacks, syntax errors, and unsupported entity kinds. Fixtures cover
every allowlisted predicate operator with JSON arguments plus literal
return/throw endpoints. Compound predicates, property access, helper
calls, coercive equality, method state, mutation, and non-literal
endpoints must expect `not_checkable`.

### Temporary-repository snapshot tests

Tests create real temporary git repositories and verify that Skia:

- reviews the index rather than adjacent unstaged edits;
- handles added files and detached HEAD;
- rejects unsupported statuses explicitly;
- preserves paths with spaces and non-ASCII characters;
- computes a stable hash for the exact raw staged diff;
- performs no project file writes, network calls, or process
  execution beyond read-only git.

### Golden interaction and comprehension receipt tests

End-to-end tests inject stdin and capture stdout, covering fill card,
show-more-code, skip, invalid menu input, source-check feedback after
card persistence, multi-entity sessions, budget refusal (over 3 entities or 150
added-plus-deleted lines), and write failure. Golden comprehension receipts normalize
timestamp and duration while preserving the staged diff hash, total,
mapped, and unmapped line counts, per-entity entries (evidence, card,
source check, probe spec, action), and session `card_status`. Tests
assert that `card_status` never changes or hides the unmapped count.
Probe spec statuses
(`draft_unexecuted` or `not_available`) must be present in every golden
receipt. No probe spec may contain source code, a `framework_hint`, or
any code text.

### Behavioral validation

Mechanical tests cannot show that the checkpoint improves
comprehension. The four-week dogfood pilot in PRD.md Section 8,
comparing raw-diff-only versus Behavior Card, is a separate product
test and must complete before the project adds an automatic git hook
or expands language support.

---

## 9. Configuration

Phase 0 has no configuration file. No `.skia/config.toml`. No
runtime flags beyond the command itself (`skia review`).

Configuration introduces complexity and state. Phase 0 is a single
command with deterministic behavior. If configuration becomes
necessary (e.g., Behavior Card template tuning, receipt directory
customization), it will be added in a later phase with evidence
justifying the complexity.
