# Skia Architecture

**Skia** is a multi-language structured code analysis tool. It parses source code into a semantic intermediate representation, runs analysis passes over it, and generates review artifacts as markdown/mermaid/JSON files.

---

## 1. System architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLI Layer (skia-cli)                        │
│  review | watch | report | init | config                        │
│  Uses clap for argument parsing, drives the pipeline             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Pipeline Orchestrator                         │
│  Manages: parse → analysis → generate cycles                    │
│  Incremental mode: only re-process changed files                 │
│  Full mode: process entire codebase                              │
│  Watch mode: filesystem watcher → incremental re-run             │
└──────────┬──────────────────┬──────────────────┬─────────────────┘
           │                  │                  │
           ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────────┐
│    Parser Layer  │ │ Analysis Engine  │ │   Generator Layer    │
│ (tree-sitter)    │ │ (pass-based)     │ │ (multi-format)       │
│                  │ │                  │ │                      │
│  ┌────────────┐  │ │  ┌────────────┐  │ │  ┌───────────────┐   │
│  │ TypeScript │  │ │  │ Flow       │  │ │  │ Markdown      │   │
│  │ Python     │  │ │  │ Pattern    │  │ │  │ Mermaid       │   │
│  │ Go         │  │ │  │ Structural │  │ │  │ JSON          │   │
│  │ Rust       │  │ │  │ SDLC       │  │ │  │ SARIF         │   │
│  └────────────┘  │ │  │ Security   │  │ │  └───────────────┘   │
│   (plugins)      │ │  └────────────┘  │ │                      │
│                  │ │   (plugins)      │ │                      │
└──────────────────┘ └──────────────────┘ └──────────────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │       .skia/ Output          │
              │  review/*.md                 │
              │  review/**/*.mmd             │
              │  review/**/*.json            │
              │  report.md                   │
              │  diff.md                     │
              └─────────────────────────────┘
```

---

## 2. Data model

### 2.1 Core types

```rust
/// A source file after parsing
struct SourceFile {
    path: PathBuf,
    language: Language,
    ast: TreeSitterTree,
    comments: Vec<Comment>,
}

/// A semantic unit extracted from AST
struct Declaration {
    name: String,
    kind: DeclKind,                    // Function, Class, Interface, Type, Variable
    span: SourceSpan,                  // File, start_line, end_line, start_col, end_col
    visibility: Visibility,            // Public, Private, Protected, Module
    signature: Signature,              // Type parameters, parameters, return type
    doc_comment: Option<String>,
    annotations: Vec<Annotation>,
    // Populated during analysis passes
    intent: Option<String>,            // Inferred from name + body + comments
    side_effects: Vec<Effect>,         // What external state this mutates
    preconditions: Vec<Condition>,
    postconditions: Vec<Condition>,
    error_paths: Vec<ErrorPath>,       // Error cases and whether handled
}

/// A type definition
struct TypeDecl {
    name: String,
    kind: TypeKind,                    // Struct, Enum, Union, Alias, Interface, Class
    fields: Vec<Field>,
    type_params: Vec<TypeParam>,
    implements: Vec<TypeRef>,          // Traits, interfaces, parent classes
    span: SourceSpan,
}

/// A call or usage relationship
struct Relation {
    kind: RelationKind,                // Calls, Implements, Extends, Contains, Imports
    source: DeclarationRef,
    target: DeclarationRef,
    span: SourceSpan,
}
```

### 2.2 Semantic graph

All declarations and relations form a semantic graph. Analysis passes walk this graph to produce artifacts:

```rust
struct SemanticGraph {
    files: Vec<SourceFile>,
    declarations: Vec<Declaration>,
    types: Vec<TypeDecl>,
    relations: Vec<Relation>,
    // Cached lookups
    decl_by_name: HashMap<String, Vec<DeclarationRef>>,
    file_by_path: HashMap<PathBuf, FileIndex>,
    // Incremental tracking
    changed_files: HashSet<PathBuf>,
    dependent_files: HashSet<PathBuf>,   // Files that import changed files
}
```

---

## 3. Parser layer

### 3.1 Tree-sitter integration

All parsing goes through tree-sitter. Each language is a separate tree-sitter grammar compiled into a shared library.

```rust
trait LanguageParser {
    fn language(&self) -> Language;
    fn parse(&self, source: &str, path: &Path) -> Result<SourceFile>;
    fn extract_declarations(&self, ast: &TreeSitterTree) -> Vec<Declaration>;
    fn extract_types(&self, ast: &TreeSitterTree) -> Vec<TypeDecl>;
    fn extract_relations(&self, ast: &TreeSitterTree) -> Vec<Relation>;
    fn extract_comments(&self, ast: &TreeSitterTree) -> Vec<Comment>;
}
```

### 3.2 Incremental parsing

Re-parsing a changed file is O(file size). Tree-sitter supports incremental parsing natively — we reuse the existing AST and only re-parse the changed range.

### 3.3 Plugin interface

Language parsers are loaded dynamically at runtime:

```toml
# config.toml
[parsers]
typescript = { path = "~/.skia/parsers/libtreesitter_typescript.so" }
python = { path = "~/.skia/parsers/libtreesitter_python.so" }
```

Users can author custom parsers for in-house DSLs.

---

## 4. Analysis engine

The analysis engine runs passes over the semantic graph. Each pass produces typed analysis results that feed into generators.

### 4.1 Pass architecture

```rust
trait AnalysisPass {
    fn name(&self) -> &'static str;
    fn run(&self, graph: &SemanticGraph, config: &Config) -> PassResult;
    fn dependencies(&self) -> Vec<&'static str>;  // Passes that must run first
}

enum PassResult {
    IntentMap(HashMap<DeclarationRef, InferredIntent>),
    TypeFlow(Vec<TypeFlowEdge>),
    DependencyGraph(DependencyGraph),
    PatternIndex(Vec<CodePattern>),
    ErrorCoverage(Vec<ErrorCoverageEntry>),
    ContractViolations(Vec<Violation>),
    SDLCAnalysis(SDLCAnalysis),
    // ...
}
```

### 4.2 Pass ordering

```
Parse ──► Type Resolution ──► Flow Analysis ──► Pattern Detection
            │                      │                   │
            ▼                      ▼                   ▼
      Type Drift Dect.      Error Coverage       Pattern Index
                                              Missing Abstractions
            │                      │                   │
            ▼                      ▼                   ▼
      Combined Analysis ─────► Generator
```

### 4.3 Pass: Intent inference

For each function:
1. Extract doc comment (if any) → primary intent signal
2. Parse function name → verb + noun decomposition (`normalizeEmail` = "normalize" + "email")
3. Analyze function body patterns → what operations does it perform?
4. Compare name-derived intent vs body-derived intent → flag mismatch
5. Check preconditions (early returns on null/none, type guards)
6. Check postconditions (return type analysis, assertion patterns)

**Confidence scoring:**
- Doc comment explicit → 9/10
- Name clear + body matches → 7/10
- Name clear + body ambiguous → 5/10 (flag as "speculative")
- Name unclear → skip

### 4.4 Pass: Dependency analysis

1. Walk imports/requires at module level → module dependency graph
2. Walk function calls → function-level dependency graph
3. Detect cycles via Tarjan's algorithm
4. Detect layers:
   - Define layers from project conventions OR explicit config
   - Flag violations: `ui → data` (bypasses service layer)
5. Compute fan-in/fan-out per module

### 4.5 Pass: Type drift detection

1. Collect all types at each boundary (API, DB, Frontend)
2. Cross-reference by field name + shape similarity
3. Flag mismatches:
   - `string` vs `string?` → nullable mismatch
   - `User` vs `API.User` (same fields) → possible mapping error
   - Field exists in one but not the other
   - Type changed between versions (git-aware)

### 4.6 Pass: Pattern detection

1. Normalize AST subtrees (replace identifiers with placeholders)
2. Hash normalized subtrees → detect structural duplicates
3. Cluster similar subtrees → candidate patterns
4. For each pattern:
   - Count occurrences
   - Check for minor variations (differences in branches)
   - Suggest unification

### 4.7 Pass: Error coverage

1. Find try/catch, Result types, Option/Optional types
2. Trace error propagation paths
3. For each error path:
   - Is there a handler? (catch block, match arm, if/else, fallback)
   - Does the error cross a module boundary without translation?
   - Is the handler a no-op? (`catch(e) {}` or `except: pass`)
4. Flag holes:
   - Function returns nullable but caller doesn't check
   - API call without timeout/retry
   - Catch block that swallows without log

---

## 5. Generator layer

### 5.1 Format plugins

```rust
trait OutputGenerator {
    fn format(&self) -> OutputFormat;
    fn generate_intents(&self, intents: &IntentMap) -> String;
    fn generate_type_flow(&self, flows: &[TypeFlowEdge]) -> String;
    fn generate_dependency_graph(&self, deps: &DependencyGraph) -> String;
    fn generate_pattern_index(&self, patterns: &[CodePattern]) -> String;
    fn generate_error_coverage(&self, errors: &[ErrorCoverageEntry]) -> String;
    fn generate_report(&self, all_results: &AnalysisResults) -> String;
}
```

### 5.2 File layout

```rust
enum OutputPath {
    ReviewIntents,           // .skia/review/intents.md
    ReviewTypeSchema,        // .skia/review/types/schema.mmd
    ReviewTypeDrift,         // .skia/review/types/drift.md
    ReviewTypeFlow(DeclName),// .skia/review/types/flows/{name}.md
    ReviewDeps,              // .skia/review/structure/deps.mmd
    ReviewLayers,            // .skia/review/structure/layers.md
    ReviewStates,            // .skia/review/structure/states.mmd
    ReviewPatternIndex,      // .skia/review/patterns/index.md
    ReviewDuplicates,        // .skia/review/patterns/duplicates.md
    ReviewMissingAbstractions,// .skia/review/patterns/missing.md
    ReviewErrorCoverage,     // .skia/review/errors/coverage.md
    Report,                  // .skia/report.md
    Diff,                    // .skia/diff.md
}
```

---

## 6. Incremental analysis

The key performance requirement is speed. On a 100KLOC codebase, a full scan should take < 30 seconds. An incremental scan (one file changed) should take < 1 second.

### 6.1 Change detection

```rust
enum ChangeKind {
    FileAdded(PathBuf),
    FileModified(PathBuf, String),    // old content hash
    FileDeleted(PathBuf),
    Renamed { from: PathBuf, to: PathBuf },
}

struct IncrementalContext {
    pending_changes: Vec<ChangeKind>,
    previous_graph: SemanticGraph,   // serialized from .skia/cache/
    previous_artifacts: HashMap<OutputPath, String>,
}
```

### 6.2 Re-analysis strategy

| Change type | What re-parses | What re-analyzes |
|-------------|---------------|------------------|
| File added | New file | All passes on new file + affected files (importers) |
| File modified | Changed file | All passes on changed file + direct importers |
| File deleted | None | Remove from graph, update dependents |
| Renamed | Both paths | Update path references |

### 6.3 Cache structure

```
.skia/cache/
├── graph.msgpack           # Serialized SemanticGraph (incremental baseline)
├── ast/
│   └── {file_hash}.msgpack # Per-file AST cache
├── passes/
│   └── {pass_name}.msgpack # Per-pass intermediate results
└── artifacts/
    └── {artifact_path}.txt  # Generated artifact content
```

---

## 7. Git-aware features

Skia integrates with git to understand what changed in the current branch.

```rust
struct GitContext {
    current_branch: String,
    base_branch: String,           // main/master
    changed_files: Vec<PathBuf>,   // Files in current diff
    base_commit: String,
    head_commit: String,
}
```

- `skia review` without args → analyzes files changed in current diff vs base branch
- `skia review --all` → analyzes entire codebase
- `skia report` → full analysis (baseline for later comparison)
- Auto-detects base branch (main, master, or git symbolic ref)

---

## 8. Configuration

```toml
# .skia/config.toml (generated by skia init)

[project]
name = "my-project"
languages = ["typescript", "python"]

[analysis]
depth = "balanced"           # "quick" | "balanced" | "deep"
error_analysis = true
pattern_detection = true
sdlc_analysis = true

[output]
format = "markdown"          # "markdown" | "json" | "sarif"
diagram_format = "mermaid"   # "mermaid" | "excalidraw" | "plantuml"
open_after_generate = false

[display]
show_speculative = false     # Show low-confidence findings
severe_only = false          # Only critical/high severity

[git]
auto_base = true             # Auto-detect base branch
hooks = ["pre-push"]         # Which hooks to install

[layers]
# Custom layer definitions for compliance checking
ui = ["components/", "pages/", "views/"]
service = ["services/", "usecases/"]
data = ["repositories/", "db/", "models/"]

[watch]
debounce_ms = 300
exclude = ["node_modules/", "target/", ".skia/", "dist/"]
```

---

## 9. Plugin system

Skia uses a plugin architecture at three levels:

| Plugin type | Interface | Loading |
|-------------|-----------|---------|
| Language parser | `LanguageParser` trait | Dynamic lib (.so/.dylib) or WASM |
| Analysis pass | `AnalysisPass` trait | Dynamic lib or WASM |
| Output generator | `OutputGenerator` trait | Dynamic lib or WASM |

WASM plugins are preferred for ease of distribution and sandboxing. Native dynamic libs are available for performance-critical parsers.

---

## 10. Performance targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Full scan, 10KLOC TS | < 5s | Cold cache |
| Full scan, 100KLOC TS | < 30s | Cold cache |
| Incremental (1 file) | < 1s | Hot cache |
| Watch mode latency | < 500ms | From file save to artifact update |
| Peak memory, 100KLOC | < 500MB | Under 10% of typical dev machine |

---

## 11. Technology choices

| Component | Choice | Why |
|-----------|--------|-----|
| Core language | Rust | Tree-sitter is Rust-native. Performance-critical analysis. |
| Parser | Tree-sitter | Incremental parsing, multi-language, robust against syntax errors |
| CLI framework | clap | Standard Rust CLI library |
| Serialization | MessagePack (rmp-serde) | Compact, fast, good for cache |
| Output formats | Hand-rolled markdown/mermaid | Simple, no heavy dependencies |
| Plugin system | WASM (wasmtime) | Sandboxed, cross-platform, easy distribution |
| File watching | notify (Rust) | Cross-platform filesystem events |
| Git integration | git2 (libgit2) | Full git capabilities |

---

## 12. Testing strategy

| Level | What | How |
|-------|------|-----|
| Unit | Each analysis pass | Deterministic AST inputs → expected artifact output |
| Integration | Full pipeline on sample repos | Known inputs → match against golden files |
| Regression | Real-world OSS repos | Run on 5 popular TS repos, verify no crashes |
| Performance | Benchmarks | criterion.rs benchmarks for each pass |
| Dogfood | Skia analyzes itself | Meta — catches our own issues |
