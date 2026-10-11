# Repository Metadata

GitHub repository metadata is outside normal file review, but it is part of the
project's public truth boundary. Keep it synchronized with the documentation.

## Current foundation-and-pilot stage

**Proposed About description:**

> Local code-comprehension research project with a narrow staged TypeScript
> guard-return pilot; broader staged and repository workflows remain proposed.

**Proposed topics:**

- `ai-assisted-development`
- `code-comprehension`
- `developer-tools`
- `typescript`
- `local-first`
- `human-in-the-loop`

Do not advertise generated dependency graphs, type drift, DRY analysis, broad
language or syntax support, repository review, HLD/LLD generation, or a
released package. Only the strict one-file TypeScript guard-return CLI path has
direct product-flow evidence.

## Rename gate

The repository name, About text, command examples, `.skia/` paths, topics, and
future registries must be updated together when OD-1 selects a replacement
name. Do not publish a package or binary under "Skia."

## Release gate

Before changing the About description from "documentation-only," verify:

- runnable source and tests exist;
- install and supported-platform evidence exists;
- private security reporting and release checks are enabled;
- the project has been renamed;
- every advertised mode has direct verification evidence; and
- launch claims comply with docs/VALIDATION.md.
