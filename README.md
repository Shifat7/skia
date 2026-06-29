# skia — the code shadow that shows you what your code actually does

**Skia** (σκιά) — Greek for "shadow." A structured code review lens that generates review artifacts from any codebase. It's the shadow of your code — always there, always reflecting the real structure.

```bash
# Coming soon
skia review            # Generate artifacts for the current branch diff
skia watch             # Watch for changes and regenerate
skia report            # Generate full report for the codebase
```

## The problem

AI coding tools generate code fast — faster than juniors and mids can review it. The bottleneck isn't *writing* code anymore, it's *understanding* what was written. Existing linters check formatting and basic rules. They don't check:

- Does this function's intent match its implementation?
- Is this type safe at every boundary?
- Is this DRY or is there a hidden duplicate?
- Did the architecture just silently drift?
- What errors are being swallowed?

## The solution

Skia generates **review artifacts** — structured overlays that sit between the code and the reviewer:

| Artifact | What it catches |
|----------|----------------|
| **Intent declarations** | Code that doesn't do what it says |
| **Type flow traces** | Nullable propagation, boundary mismatches |
| **Dependency graphs** | Architectural drift, circular deps |
| **Pattern index** | Copy-paste, missing abstractions |
| **Error coverage maps** | Swallowed errors, missing handlers |
| **Contract violations** | Pre/post condition breaks |

## Design principles

1. **Zero false positives is right, but zero true negatives is better.** Better to flag 3 things someone already knows than miss 1 thing they don't.
2. **The shadow is always in sync.** Regenerated on every file change, every git hook, every PR diff.
3. **No mirror dir.** Artifacts live in `.skia/` — gitignored, generated on demand or via hooks.
4. **Tunable depth.** A senior wants different artifacts than a junior switching to a new codebase for the first time.
5. **Plugin architecture.** Language parsers, analyzers, and generators are all plugins.

## Status

Pre-alpha. Core concept being validated.

MIT License.
