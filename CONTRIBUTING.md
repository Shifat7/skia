# Contributing to Skia

## Quick start

```bash
git clone git@github.com:Shifat7/skia.git
cd skia
cargo build
cargo test
```

## Project structure

```
skia/
├── skia-core/     # Core library: parsing, analysis, generation
├── skia-cli/      # CLI binary
└── fixtures/       # Test codebases for integration tests
```

## Development

- All code is Rust. Use `cargo` for everything.
- Run `cargo clippy` before committing.
- Write tests for every analysis pass. Use `insta` for snapshot testing.
- Keep the API stable. Breaking changes require a major version bump.
- Follow the existing code style. Run `cargo fmt`.

## Adding a language parser

1. Create a new file in `skia-core/src/parser/`
2. Implement the `LanguageParser` trait
3. Register the parser in `skia-core/src/parser/mod.rs`
4. Add the tree-sitter grammar to `Cargo.toml`
5. Add test fixtures in `fixtures/{language}/`

## Adding an analysis pass

1. Create a new file in `skia-core/src/passes/`
2. Implement the `AnalysisPass` trait
3. Register the pass in `skia-core/src/passes/mod.rs`
4. Add the pass to the pipeline in `skia-core/src/lib.rs`
5. Write unit tests with fixture inputs

## PR workflow

1. Create a feature branch from `main`
2. Make your changes
3. Run `cargo test` and `cargo clippy`
4. Update docs if needed
5. Open a PR
6. CI must pass before merge

## License

MIT. By contributing, you agree to license your contributions under the same license.
