# Repository Metadata

GitHub repository metadata is outside normal file review, but it is part of the
project's public truth boundary. Keep it synchronized with the documentation.

## Current documentation-only stage

**Proposed About description:**

> Documentation-only proposal for a local reduced-reading comprehension checkpoint: collapsed TypeScript evidence, minimal behavior predictions, and opt-in repository HLD/LLD drafts.

**Proposed topics:**

- `ai-assisted-development`
- `code-comprehension`
- `developer-tools`
- `typescript`
- `local-first`
- `human-in-the-loop`

Do not advertise generated dependency graphs, type drift, DRY analysis, error
coverage, support for any codebase, a working CLI, or a released package. Those
claims are not present capabilities and several are explicit non-goals.

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
