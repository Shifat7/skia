# Skia — Implementation Plan

**Status:** Plan document — ready for review
**Version:** v1
**Branch:** main
**Target:** Phase 0 delivery: TypeScript-only CLI tool with core artifacts

---

## Premise

### The case for Skia

AI coding tools are producing code faster than engineers can review it. Existing tools (linters, formatters, type checkers) catch syntax-level issues but miss semantic, architectural, and pattern-level problems. Skia fills this gap by generating review artifacts that elevate the reviewer's understanding from "what does this code do?" to "does this code do the right thing?"

### What we're NOT building

- **Not a linter.** Skia doesn't enforce style, formatting, or conventions.
- **Not a type checker.** Skia uses types for analysis but defers to the language's type system.
- **Not a pseudo-code mirror.** Skia generates curated artifacts, not a literal translation.
- **Not a CI/CD platform.** Skia generates files that CI/CD can consume.

### Key assumptions

1. AI-assisted code generation is growing and will continue to grow. The bottleneck is shifting from writing to understanding.
2. Structure-aware analysis is more valuable than line-level linting for catching logical bugs.
3. Engineers will read structured artifacts more readily than they'll trace unfamiliar code paths.
4. Tree-sitter is the right parsing foundation — it handles partial/invalid syntax and supports incremental parsing.

---

## Scope: Phase 0

**Goal:** A working CLI that generates the 3 highest-value artifact types for TypeScript codebases — proving the model works before investing in more languages and analyzers.

### What's in scope

1. **Rust project scaffold** — Cargo workspace with `skia-cli` and `skia-core` crates
2. **TypeScript parser** — Tree-sitter grammar → AST → declarations + types + relations
3. **Three analysis passes:** Intent inference, Dependency graph, Error coverage
4. **Three generators:** Markdown (readable), Mermaid (diagrams), JSON (machine)
5. **CLI commands:** `skia init`, `skia review`, `skia watch`, `skia report`
6. **Git integration:** Base branch detection, diff-aware analysis
7. **`.skia/` output directory** with full artifact layout
8. **Incremental analysis** — cache, file watching, change detection
9. **CI setup** — GitHub Actions for build + test + dogfood

### What's NOT in scope (Phase 0)

| Deferred item | Rationale | Target phase |
|---------------|-----------|-------------|
| Python parser | Single-language validation first | Phase 6 |
| Pattern detection / DRY analysis | Requires more passes | Phase 2 |
| Type drift detection | Requires multi-boundary analysis | Phase 3 |
| SDLC compliance | Requires project conventions | Phase 4 |
| Security analysis | Separate domain | Phase 4 |
| IDE plugin | CLI first, API second | Phase 1 or 2 |
| WASM plugins | Let the plugin API stabilize first | Phase 2 |

---

## Implementation approach

### Technology stack

| Component | Choice | Alternative considered | Why chosen |
|-----------|--------|----------------------|------------|
| Core language | Rust | Python, TypeScript | Tree-sitter is Rust-native. Performance-critical analysis. WASM target path for browser/IDE. |
| Parser | Tree-sitter | swc, babel, custom | Incremental parsing, multi-language, robust to syntax errors, OSS ecosystem |
| CLI framework | clap (derive) | — | Standard Rust CLI lib |
| Serialization | MessagePack (rmp-serde) | JSON, protobuf | Compact binary for cache, serde-native |
| File watching | notify | inotify directly | Cross-platform, well-maintained |
| Git | git2 | CLI calls | Full git capabilities without shelling out |
| Diagrams | seedursive (Mermaid lib) | Hand-rolled strings | Rust-native Mermaid generation |
| Async | tokio | async-std | De facto Rust async runtime |
| Error handling | anyhow + thiserror | — | Standard Rust error pattern |
| Testing | criterion (bench), insta (snapshot) | — | Snapshot testing for artifact output |

### Data model

Core types defined in `skia-core/src/model/`:

- `SourceFile` — parsed file with AST, comments, metadata
- `Declaration` — function, class, interface, type alias, variable
- `TypeDecl` — struct, enum, union, intersection types
- `Relation` — calls, implements, extends, imports, contains
- `SemanticGraph` — the full graph of all declarations + relations
- `AnalysisResult` — typed output from each analysis pass

### Pipeline flow

```
             ┌──────────────┐
             │ File changes  │
             │ (CLI args,    │
             │  fs watch,    │
             │  git diff)    │
             └──────┬───────┘
                    ▼
    ┌───────────────────────────────┐
    │     Change Detector           │
    │  Computes ChangeKind set       │
    └───────────────┬───────────────┘
                    ▼
    ┌───────────────────────────────┐
    │     Incremental Parser        │
    │  Re-parses changed files       │
    │  Reuses unchanged AST cache    │
    └───────────────┬───────────────┘
                    ▼
    ┌───────────────────────────────┐
    │     Graph Updater             │
    │  Applies changes to graph      │
    │  Marks dependent files dirty   │
    └───────────────┬───────────────┘
                    ▼
    ┌───────────────────────────────┐
    │     Pass Scheduler            │
    │  Runs passes in dependency     │
    │  order on dirty subgraph       │
    └───────────────┬───────────────┘
                    ▼
    ┌───────────────────────────────┐
    │     Generator                 │
    │  Formats results → output      │
    │  files in .skia/              │
    └───────────────┬───────────────┘
                    ▼
           Output ready
```

---

## File structure

```
skia/
├── Cargo.toml                     # Workspace root
├── skia-core/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── model/                 # Core data types
│       │   ├── mod.rs
│       │   ├── source_file.rs
│       │   ├── declaration.rs
│       │   ├── type_decl.rs
│       │   ├── relation.rs
│       │   └── graph.rs
│       ├── parser/                # Language parser trait + impls
│       │   ├── mod.rs
│       │   ├── typescript.rs
│       │   └── interfaces.rs
│       ├── passes/                # Analysis passes
│       │   ├── mod.rs
│       │   ├── intent.rs
│       │   ├── dependencies.rs
│       │   └── error_coverage.rs
│       ├── generator/             # Output generators
│       │   ├── mod.rs
│       │   ├── markdown.rs
│       │   ├── mermaid.rs
│       │   └── json.rs
│       ├── incremental/           # Change detection, caching
│       │   ├── mod.rs
│       │   ├── change.rs
│       │   └── cache.rs
│       ├── git/                   # Git integration
│       │   └── mod.rs
│       └── config/                # Configuration
│           └── mod.rs
├── skia-cli/
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── init.rs
│       │   ├── review.rs
│       │   ├── watch.rs
│       │   └── report.rs
│       └── output.rs              # Output formatting, progress
├── fixtures/                      # Test fixtures (sample codebases)
│   ├── typescript/
│   │   ├── simple/
│   │   ├── express-api/
│   │   └── react-app/
│   └── ...
├── tests/                         # Integration tests
│   ├── cli_tests.rs
│   └── fixture_tests.rs
├── .github/
│   └── workflows/
│       └── ci.yml
├── PRD.md
├── ARCHITECTURE.md
├── ROADMAP.md
└── README.md
```

---

## Implementation tasks

### T1: Project scaffold and workspace

**Priority:** P1
**Effort:** human: ~4h / CC: ~15min
**Files:**
- `Cargo.toml` (workspace)
- `skia-core/Cargo.toml`
- `skia-cli/Cargo.toml`
- `.github/workflows/ci.yml`
- `fixtures/typescript/simple/`

**Tasks:**
- Create Cargo workspace with two crates
- Set up dependencies: tree-sitter, clap, tokio, notify, git2, rmp-serde, anyhow, thiserror, seedursive
- Set up CI: build + test + clippy + format check
- Create test fixture directory with a small TypeScript project
- Add `.gitignore`, `CONTRIBUTING.md`, `LICENSE`

### T2: Core data model

**Priority:** P1
**Effort:** human: ~6h / CC: ~20min
**Files:**
- `skia-core/src/model/*.rs`

**Tasks:**
- Implement all core types: `SourceFile`, `Declaration`, `TypeDecl`, `Relation`, `SemanticGraph`
- Implement serialization (MessagePack) for graph caching
- Implement `DeclarationRef`, `TypeRef` for inter-graph references
- Implement `SourceSpan` for error reporting
- Implement `ChangeKind` for incremental tracking
- Implement helper functions: declaration lookup, type resolution, relation walking

### T3: TypeScript parser

**Priority:** P1
**Effort:** human: ~8h / CC: ~30min
**Files:**
- `skia-core/src/parser/typescript.rs`
- `skia-core/src/parser/interfaces.rs`

**Tasks:**
- Bind tree-sitter-typescript grammar (compile into binary)
- Implement `LanguageParser` trait for TypeScript
- Extract declarations: functions, classes, interfaces, type aliases, enums, variables
- Extract types: resolve type references, union/intersection types, generics
- Extract relations: imports, function calls, class extensions, interface implementations
- Extract comments: doc comments (JSDoc), inline comments
- Handle partial/invalid syntax gracefully (tree-sitter strength)
- Test against fixtures

### T4: Intent inference pass

**Priority:** P1
**Effort:** human: ~6h / CC: ~15min
**Files:**
- `skia-core/src/passes/intent.rs`

**Tasks:**
- Implement name decomposition (verb/noun extraction for functions)
- Parse doc comments for explicit intent
- Analyze function body for side effects (which external state is read/written)
- Detect preconditions (early returns on null/undefined, type guards)
- Detect postconditions (return type analysis)
- Implement confidence scoring
- Flag mismatches between name-derived intent and body-derived intent
- Handle pure vs impure detection

### T5: Dependency analysis pass

**Priority:** P1
**Effort:** human: ~5h / CC: ~12min
**Files:**
- `skia-core/src/passes/dependencies.rs`

**Tasks:**
- Build module-level dependency graph from imports
- Build function-level call graph
- Implement cycle detection (Tarjan's SCC)
- Implement layer violation detection
- Compute fan-in/fan-out per module
- Detect bidirectional/cyclic dependencies between modules

### T6: Error coverage pass

**Priority:** P1
**Effort:** human: ~5h / CC: ~12min
**Files:**
- `skia-core/src/passes/error_coverage.rs`

**Tasks:**
- Detect try/catch blocks
- Resolve promise rejection handlers (.catch(), .then(null, handler))
- Check for nullable/undefined patterns without handling
- Trace error propagation across function boundaries
- Detect catch blocks that swallow errors (empty catch, catch with no log)
- Flag missing error boundaries at module boundaries
- Detect network calls without timeout or error handling

### T7: Markdown generator

**Priority:** P1
**Effort:** human: ~3h / CC: ~10min
**Files:**
- `skia-core/src/generator/markdown.rs`

**Tasks:**
- Implement intent declaration markdown output
- Implement dependency graph as ASCII art
- Implement error coverage map as markdown tables
- Add severity annotations (⚠️, 🚫, ✓)
- Add file and line number references

### T8: Mermaid generator

**Priority:** P2 (Phase 0 still)
**Effort:** human: ~3h / CC: ~8min
**Files:**
- `skia-core/src/generator/mermaid.rs`

**Tasks:**
- Implement Mermaid flowchart for dependency graph
- Implement Mermaid class diagram for type schemas
- Implement Mermaid state diagram for state machines
- Generate `.mmd` files that render in GitHub and VS Code

### T9: JSON generator

**Priority:** P1
**Effort:** human: ~2h / CC: ~5min
**Files:**
- `skia-core/src/generator/json.rs`

**Tasks:**
- Implement serde-serializable output for all analysis results
- Generate `.skia/review.json` for machine consumption
- Include file path, line numbers, severity in every entry
- Ensure JSON output can feed into IDE plugins and CI tools

### T10: Incremental analysis engine

**Priority:** P1
**Effort:** human: ~8h / CC: ~20min
**Files:**
- `skia-core/src/incremental/*.rs`

**Tasks:**
- Implement change detection (file added, modified, deleted, renamed)
- Maintain graph cache on disk (MessagePack serialized)
- Implement incremental re-parsing (tree-sitter incremental parse)
- Implement dirty marking for dependent files
- Implement cache invalidation for changed analysis results
- Handle edge cases: new file → full analysis of new file, deleted file → cascade removal

### T11: Git integration

**Priority:** P1
**Effort:** human: ~3h / CC: ~8min
**Files:**
- `skia-core/src/git/mod.rs`

**Tasks:**
- Detect base branch (main/master/remote HEAD)
- Get changed files in current diff vs base
- Get diff content for line-level annotations
- Implement `GitContext` struct
- Handle non-git directory gracefully (fall back to full scan)

### T12: CLI implementation

**Priority:** P1
**Effort:** human: ~6h / CC: ~15min
**Files:**
- `skia-cli/src/main.rs`
- `skia-cli/src/commands/*.rs`

**Tasks:**
- Implement `skia init` → create `.skia/config.toml` with defaults
- Implement `skia review` → analyze current diff and generate artifacts
- Implement `skia watch` → file watcher + auto-regenerate
- Implement `skia report` → full codebase analysis
- Add progress output (terminal-friendly, no stderr noise)
- Add `--depth` flag: `intents | deps | errors | all`
- Add `--output` flag: `markdown | json | mermaid`
- Handle errors gracefully (parse failures should not crash)

### T13: Watch mode

**Priority:** P2
**Effort:** human: ~3h / CC: ~8min
**Files:**
- `skia-cli/src/commands/watch.rs`
- `skia-core/src/incremental/change.rs`

**Tasks:**
- Bind notify filesystem watcher
- Debounce file change events (300ms default)
- Trigger incremental re-analysis on change
- Print "regenerated" with timing on each cycle
- Support `.skiaignore` file or integrate with `.gitignore`
- Handle file creation, deletion, rename

### T14: Dogfood CI

**Priority:** P2
**Effort:** human: ~2h / CC: ~5min
**Files:**
- `.github/workflows/ci.yml`

**Tasks:**
- Build + test + clippy on every push
- Run `skia report` on skia's own codebase (dogfood)
- Check that `.skia/` artifacts are generated
- Publish artifact diffs (show that skia catches its own issues)
- Upload `.skia/` as CI artifact

### T15: Documentation and README

**Priority:** P1
**Effort:** human: ~3h / CC: ~10min
**Files:**
- `README.md`
- `docs/quickstart.md`
- `docs/configuration.md`

**Tasks:**
- Write getting started guide with installation + first review
- Write configuration reference
- Write "Why Skia" section on README
- Add screenshots/asciicasts of review output
- Add badges to README (build, crate, license)

---

## Test plan

### Unit tests (per pass)

Each analysis pass gets unit tests with deterministic AST inputs:
- Small TypeScript snippets as test cases
- Expected artifact output as strings
- Use `insta` crate for snapshot testing of generated output

### Integration tests

- Run full pipeline on `fixtures/typescript/simple/` (small, fast)
- Run full pipeline on `fixtures/typescript/express-api/` (realistic)
- Run full pipeline on `fixtures/typescript/react-app/` (JSX, components)
- Verify output file structure matches expected layout
- Verify incremental re-analysis produces the same output as full re-analysis

### Performance benchmarks

- `criterion` benchmarks for each pass on fixtures
- Full pipeline benchmark on a ~10KLOC TypeScript codebase
- Incremental benchmark (change one file → measure re-analysis time)
- Memory usage monitoring

### Regression tests

- Snapshot test on major TypeScript patterns (class, interface, generic, union, intersection, decorator, JSX)
- Ensure parser doesn't crash on malformed TypeScript
- Ensure CLI handles edge cases: empty directory, no git repo, single file

---

## Implementation order

The work is structured so that each task produces a testable milestone:

```
Week 1: T1 (scaffold) + T2 (model) + T3 (parser)
  → Can parse TypeScript and extract declarations

Week 2: T4 (intent) + T5 (deps) + T6 (error coverage)
  → All three analysis passes working on fixtures

Week 3: T7 (markdown) + T8 (mermaid) + T9 (json)
  → Can generate all three output formats

Week 4: T10 (incremental) + T11 (git) + T12 (CLI)
  → CLI can run full review, incremental review, git-aware

Week 5: T13 (watch) + T14 (dogfood CI) + T15 (docs)
  → Complete Phase 0, ready for early users
```

---

## Risk analysis

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Tree-sitter TS grammar incomplete for edge cases | Medium | Medium | Test against real-world TS codebases early. Fall back to partial results. |
| Incremental analysis correctness | Medium | High | Extensive cache invalidation tests. Serialize logs for debugging. |
| Performance not meeting targets | Low | Medium | Profile early. Optimize only passes that show as bottlenecks. |
| Intent inference too noisy | Medium | High | Conservative defaults. Show confidence scores. Allow depth tuning. |
| Nobody uses it | Medium | High | Dogfood on own projects. Release early. Good README + docs. |
| Rust learning curve for contributors | Low | Medium | Good documentation. Plugin API reduces barrier for non-Rust contributors. |

---

## Review decision log

| # | Decision | Rationale | Source |
|---|----------|-----------|--------|
| D1 | Rust over TypeScript/Python | Tree-sitter native. WASM target path. Performance. | Architecture |
| D2 | Start with TypeScript only | Most AI-generated code is TS/JS. Largest user base. | PRD Phase 0 |
| D3 | Three passes for Phase 0 | High value, reasonable scope. More passes in later phases. | PRD |
| D4 | MessagePack for cache | Compact binary, serde-native, faster than JSON | Architecture |
| D5 | git2 over shell commands | More reliable, cross-platform, no shell injection risk | Architecture |
| D6 | Watch mode default debounce 300ms | Avoids re-analysis storms during saves with autosave | Architecture |
| D7 | Conservative intent inference | False positives erode trust. Better to miss than mislead. | PRD |
| D8 | Plugin API deferred to Phase 2 | Let the core API stabilize first | Plan |
