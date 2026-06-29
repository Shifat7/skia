# Skia — Product Requirements Document

**Product:** Skia — Structured Code Review Lens
**Status:** Pre-alpha / PRD v1
**Target audience:** AI-assisted junior/mid engineers, team leads, OSS maintainers

---

## 1. Product vision

A codebase is a living system. AI tools write parts of it fast, but nobody reads it fast enough to catch the subtle breaks. Skia is the missing layer: a generated overlay of review artifacts that sits between the code and the human (or AI) reviewer. It makes the implicit visible — intent, structure, errors, patterns — so the reviewer can focus on judgment, not discovery.

> "Check the shadow before you ship."

---

## 2. Problem statement

### The core asymmetry

| Before AI | Today |
|-----------|-------|
| Engineer writes every line by hand. Knows exactly what exists and where. Speed bottleneck is writing. | AI writes 80% of the code. Engineer reviews and assembles. Speed bottleneck is **understanding**. |

### The failure modes

1. **Intent mismatch.** AI writes a function called `normalizeEmail` that silently strips everything after `+` in Gmail aliases. The intent (normalize) doesn't match the implementation (truncate).
2. **Type boundary breaks.** API returns `email: string | undefined` but the model maps it to `string`. Crashes on the first user without an email.
3. **Silent architecture drift.** AI adds a new data access pattern that bypasses the repository layer. Nobody notices until the 3rd bypass creates an inconsistent caching strategy.
4. **Copy-paste blindness.** AI generates the same auth guard boilerplate in 6 files. One has a different edge case that returns 200 instead of 401. The senior would catch it. The junior doesn't know to look.
5. **Error path neglect.** A `requests.get()` call with no try/except. Works fine with a network. Fails silently when it's 2am and the API is down.
6. **DRY violations across files.** The AI doesn't know what it wrote in file A when it writes file B. Same validation logic lives in 3 places. A fix to one doesn't propagate.

### Why existing tools don't solve this

| Tool | Catches | Does NOT catch |
|------|---------|----------------|
| Linters (ESLint, Ruff) | Syntax, formatting, style | Intent mismatch, architecture drift |
| Type checkers (TypeScript, mypy) | Type violations | Missing error paths, DRY violations |
| Code quality (SonarQube) | Complexity, code smells | Cross-file patterns, contract drift |
| Code review (human) | Everything | Cost: doesn't scale. Speed: doesn't match AI output rate |

Skia fills the gap between **"no errors"** (linters) and **"correct design"** (human review). It's a structured intermediate representation that elevates what the reviewer sees from raw syntax to semantic intent.

---

## 3. Target users

### Primary: AI-assisted junior / mid engineer (the vibecoder)

- Writes 60-80% of code via AI prompting
- Reviews their own AI-generated code before submitting
- Wants to understand what the code actually does without tracing every execution path
- Doesn't know what to look for in a review — needs guardrails, not gatekeeping
- Frustrated when "it works on my machine" breaks in review

### Secondary: Senior engineer reviewing PRs

- Reviews 5-15 PRs per day, many AI-generated
- Spends 40% of review time just *understanding* what the code does before evaluating it
- Wants to skip "type boundary X is mismatched" and focus on "this architecture doesn't fit our scale"
- Looks for patterns, not pixels

### Tertiary: OSS maintainer

- Reviews contributions from people with varying skill levels
- Needs a shared context layer for codebase understanding
- Can point contributors to Skia output: "look at the dependency graph — see why this doesn't fit?"

---

## 4. Artifact catalog

### 4.1 Intent declarations (Layer: Contract)

Every exported function/class rendered as:

```
normalizeEmail: str → str
  Intent: Lowercases email, removes dots before @ for Gmail, normalizes domain.
  Pre: input is a valid email string (non-null, contains @)
  Post: output is lowercase, with Gmail-specific normalization applied
  Side effects: none (pure function)
  Error paths: raises ValueError on malformed input
  ⚠️ IMPLEMENTATION NOTE: Strips everything after '+' — this is NOT
     standard normalization. If the system expects plus-addressed emails
     to be distinct, this will deduplicate them.
```

### 4.2 Type flow traces (Layer: Contract)

For every function, the types flowing in and out, annotated with nullable risk:

```
checkout(cart: Cart, user: User) → OrderResult
  cart.items → validateInventory(items) → ValidationResult
  user.credits → applyCredits(total, credits) → { finalTotal, creditsUsed }
  paymentMethod = user.paymentMethod  ⚠️ nullable — no fallback
  chargePayment(finalTotal, paymentMethod) → PaymentResult
```

### 4.3 Dependency graph (Layer: Structure)

ASCII / Mermaid graph showing module relationships:

```
src/users/        → src/auth/, src/db/, src/email/
src/checkout/     → src/users/ ⚠️ CYCLIC: checkout → users → checkout via EventBus
src/payments/     → src/db/, src/billing/
```

Cycles highlighted. Fan-in/fan-out annotated. Layer violations flagged.

### 4.4 Pattern index (Layer: Patterns)

Code patterns detected across the codebase:

```
Pattern: Auth guard (if not authenticated → redirect)
  Found in: 6 locations
    auth/middleware.ts — standard
    admin/dashboard.tsx:12 — inline ⚠️ different: returns 403 instead of redirect
    api/routes/checkout.ts:8 — inline ⚠️ different: silently returns 200

Pattern: Retry wrapper (exponential backoff on API call)
  Found in: 2 locations
    Should this be unified?
```

### 4.5 Error coverage map (Layer: Errors)

Per-function error analysis:

```
findUser(id: UUID) → User | None
  ├── db.query() — can raise ConnectionError    ✓ handled with retry
  ├── db.query() — can raise Timeout             ✓ handled with fallback cache
  └── result parsing — can raise ValueError      ✗ UNHANDLED — crashes if DB
                                                     returns malformed row
```

### 4.6 Type drift detection (Layer: Contracts)

Cross-boundary type comparison:

```
API.User.email: string
DB.User.email: string?           ⚠️ Nullable mismatch — null DB value crashes API serialization

Frontend.Cart.items: CartItem[]
API.Cart.items: API.CartItem[]   ⚠️ Different types (same shape) — mapping layer might be wrong
```

### 4.7 SDLC compliance (Layer: Governance)

```
SOLID violations:
  UserController: 4 responsibilities (validation, auth, business logic, formatting) — SRP violation

Layer violations:
  admin/Dashboard.tsx → direct SQL query (skips repository layer)

API contract drift:
  Actual response has field "user_name" but OpenAPI spec says "username"
```

### 4.8 State machine diagrams (Layer: Structure)

For objects with state transitions:

```
OrderStatus: PENDING → CONFIRMED → SHIPPED → DELIVERED
                              ↘ CANCELLED → REFUNDED
  ⚠️ Missing: PENDING → CANCELLED (can a user cancel before confirmation?)
```

---

## 5. Output delivery

### 5.1 File structure

All artifacts write to `.skia/` at the project root (gitignored):

```
.skia/
├── review/
│   ├── intents.md              # Intent declarations for current diff
│   ├── types/
│   │   ├── schema.mmd          # ERD of all types
│   │   ├── drift.md            # Cross-boundary type mismatches
│   │   └── flows/              # Per-function type traces
│   ├── structure/
│   │   ├── deps.mmd            # Dependency graph
│   │   ├── layers.md           # Layer compliance
│   │   └── states.mmd          # State machine diagrams
│   ├── patterns/
│   │   ├── index.md            # Pattern index
│   │   ├── duplicates.md       # Copy-paste detection
│   │   └── missing.md          # Missing abstractions
│   └── errors/
│       └── coverage.md         # Error coverage map
├── report.md                   # Full codebase report (aggregate)
└── diff.md                     # Latest diff artifacts (auto-regenerated)
```

### 5.2 Output formats

| Format | Usage |
|--------|-------|
| Markdown (.md) | Human-readable — CI output, PR comments |
| Mermaid (.mmd) | Diagrams — embedded in docs, PRs, rendered in editors |
| JSON (.json) | Machine-readable — IDE plugins, CI tools, AI agents |
| SARIF (.sarif) | Standardized — integration with GitHub Code Scanning |

### 5.3 CLI interface

```bash
# Generate artifacts for the current diff vs base branch
skia review                    # Full review artifacts
skia review --depth types      # Just type artifacts
skia review --depth patterns   # Just pattern artifacts
skia review --output json      # Machine-readable output

# Continuous mode
skia watch                     # Watch filesystem + auto-regenerate
skia watch --on-hook pre-push  # Only on git hooks

# Reports
skia report                    # Full codebase analysis (baseline)
skia report --output sarif     # SARIF for GitHub integration

# Configuration
skia init                      # Create .skia/config.toml
```

---

## 6. Integration points

| Integration | How | Value |
|------------|-----|-------|
| **git hooks** | Pre-push hook auto-generates diff artifacts | Reviewer sees artifacts alongside diff |
| **CI/CD** | CI step runs `skia review --output json` | PR comments with artifact links |
| **GitHub PRs** | Comment with collapsible artifact sections | Shared context for reviewers |
| **IDE (VS Code)** | LSP extension shows artifact annotations inline | Real-time feedback while coding |
| **AI agents** | Agent reads `.skia/review/` before making changes | Agent understands what it's about to modify |
| **Editor (Neovim/Helix)** | Telescope picker for artifacts | Quick navigation |

---

## 7. Success metrics

| Metric | Target | Why |
|--------|--------|-----|
| **Time to first review artifact** | < 5 seconds on a 100KLOC codebase | Must feel instant |
| **Artifact accuracy** | No false positives that mislead review | Wrong signal is worse than no signal |
| **Review time reduction** | 30% less time spent understanding code | Measured in time-to-approve or first-review-comment |
| **Bug catch rate** | 15% of review blockers caught by Skia first | Self-reported in PR comments |
| **Adoption** | 200+ GitHub stars, 5+ active contributors | Validates the problem is real |
| **Depth tuning** | Users actually use different depth levels | Proves the tunability isn't overengineering |

---

## 8. Phased delivery

### Phase 0: Foundation (we are here)
- Project scaffold, Rust + tree-sitter core
- Single language support (TypeScript — most AI-generated code)
- Basic artifact generation: intents, dependency graph
- CLI skeleton: `skia review`, `skia init`
- `.skia/` output directory structure
- Watch mode via git hooks

### Phase 1: Core artifacts
- Intent declarations with pre/post condition inference
- Dependency graph with cycle detection + layer violations
- Type flow traces (nullable tracking, boundary mismatches)
- Error coverage maps (try/catch analysis, unchecked exceptions)

### Phase 2: Pattern intelligence
- Pattern index (detect repeated code structures)
- Copy-paste detection (exact + near-duplicate)
- Missing abstraction suggestions
- Design pattern identification (Strategy, Factory detected from structure)

### Phase 3: Type intelligence
- Cross-boundary type drift detection
- Generic instantiation maps
- Type similarity detection (same shape, different names)
- Structural type diff on PR

### Phase 4: SDLC & Security
- SOLID violation detection
- Layer compliance enforcement
- Input validation coverage maps
- Auth boundary analysis
- Secret/credential scanning (baseline)

### Phase 5: AI integration
- AI agent reads `.skia/` context before edits
- Skia-aware code generation prompts
- Auto-create PR descriptions from artifact diffs
- LLD diagram generation from architecture artifacts

### Phase 6: Polyglot
- Python support
- Go support
- Rust support
- Language-neutral analysis engine

---

## 9. Non-goals

- **Not a linter.** Skia doesn't enforce style, formatting, or naming conventions. Use ESLint, Ruff, or rustfmt.
- **Not a type checker.** Skia uses types for analysis but defers to the language's type system for validation.
- **Not a test runner.** Skia analyzes test coverage but doesn't run tests.
- **Not a CI/CD platform.** Skia generates files that CI/CD can consume.
- **Not a code search engine.** Skia understands code structure, not arbitrary text queries.
- **Not a mirror dir.** Skia does NOT generate a pseudo-code mirror of the codebase. It generates curated review artifacts.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| **False positives erode trust** | Conservative analysis by default. Flag severity levels. Explicit "speculative" markers. |
| **Performance on large codebases** | Incremental analysis (only changed files). Tree-sitter is fast by design. .skia/ cache. |
| **Language coverage is too wide** | Start with TypeScript only. Prove the model works before expanding. |
| **No one uses it** | Release early (Phase 0 usable). Dogfood on own projects. Publish comparison: "issues Skia caught in this PR." |
| **Competing with existing tools** | Skia is complementary, not competitive. It feeds into SonarQube/SARIF rather than replacing them. |
| **Maintenance burden** | Plugin architecture keeps core stable while language parsers evolve independently. |
