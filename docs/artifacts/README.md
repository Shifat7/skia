# Skia artifacts — reference

This directory documents each artifact type Skia generates, with format examples and what to look for.

## Artifact types

| Artifact | File | What it shows | Review focus |
|----------|------|---------------|--------------|
| Intent declarations | `.skia/review/intents.md` | What every function claims it does vs what it actually does | "Does the code match the name? Any side effects the caller wouldn't expect?" |
| Type flow traces | `.skia/review/types/flows/*.md` | Types flowing through each function | "Any nullable values that reach non-nullable parameters? Any boundary mismatches?" |
| Type ERD | `.skia/review/types/schema.mmd` | All entity types and their relationships | "Is this missing a field? Does the relationship direction make sense?" |
| Type drift | `.skia/review/types/drift.md` | Type mismatches across boundaries (API ↔ DB ↔ Frontend) | "Did the API change without the client being updated? Nullable mismatch?" |
| Dependency graph | `.skia/review/structure/deps.mmd` | Module dependencies, cycles, layering | "Any cycles? Layer violations? High fan-in modules that need stability?" |
| Layer compliance | `.skia/review/structure/layers.md` | Architecture layer violation report | "Is the controller calling the repo directly?" |
| State machine | `.skia/review/structure/states.mmd` | Object lifecycle diagrams | "Missing transitions? Unreachable states?" |
| Pattern index | `.skia/review/patterns/index.md` | Repeated code structures across codebase | "How many places implement auth the same way? Which one is different?" |
| Copy-paste detection | `.skia/review/patterns/duplicates.md` | Exact and near-duplicate code blocks | "Same logic copy-pasted with minor variations?" |
| Error coverage | `.skia/review/errors/coverage.md` | Error paths, handlers, and gaps | "Any function making external calls without error handling? Silent catch blocks?" |
| SOLID analysis | `.skia/review/sdlc/solid.md` | SOLID principle violations | "Which class has too many responsibilities?" |
