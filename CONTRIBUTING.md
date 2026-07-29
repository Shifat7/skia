# Contributing to Skia

> **This is a documentation-only project.** There is no source code,
> no build system, no test suite, and no CI pipeline. Contributions
> are limited to documentation, design feedback, and test fixture
> proposals.

---

## How to contribute

### Documentation improvements

Pull requests that fix errors, clarify wording, correct
contradictions, or add evidence citations are welcome.

Before submitting a documentation PR:

1. Read the documents you are changing and any documents that
   reference them. Ensure consistency across all files.
2. Do not introduce claims that the project has a working CLI,
   compiled binary, or installable package.
3. Do not introduce performance targets presented as measured facts.
4. Do not add badges, release counts, or claims of adoption.
5. Use clear professional Markdown and working links.
6. If you cite evidence, include the source, sample, design, and
   limitations. See docs/VALIDATION.md for the expected standard.

### Design feedback

Open an issue using the design feedback issue form
(`.github/ISSUE_TEMPLATE/design-feedback.yml`). Describe what you
think is wrong or missing in the proposed design and what you would
change.

Focus areas where feedback is most valuable:

- The proposed workflow (PRD.md Section 3).
- The question catalogue (PRD.md Section 6).
- The receipt schema (PRD.md Section 7).
- The entity extraction and selection strategy
  (ARCHITECTURE.md Section 5).
- The kill criteria (PRD.md Section 9).

### Benchmark fixtures

Submit a small TypeScript diff (10-50 changed lines) that you think
would be a good test case. Open an issue using the benchmark fixture
issue form (`.github/ISSUE_TEMPLATE/benchmark-fixture.yml`).

A good fixture:

- Contains one or two named TypeScript functions or methods, or an
  unsupported construct that should exercise a clear fallback.
- Has a clear expected entity extraction result.
- Is small enough to read in under a minute.
- Does not depend on external packages or network access.

### Implementation proposals

If you want to propose how a specific Phase 0 component should be
built, open an issue using the implementation proposal issue form
(`.github/ISSUE_TEMPLATE/implementation-proposal.yml`). Describe the
component, your proposed approach, and how it would satisfy the
relevant acceptance criteria in IMPLEMENTATION_PLAN.md.

---

## What not to contribute

- **Source code.** No source code is being accepted. The project has
  no Cargo workspace, no build system, and no way to compile or test
  code.
- **Badges, shields, or release artifacts.** The project has no
  releases, no CI, and no published packages.
- **Claims of adoption or usage.** The project has no users.
- **Unapproved feature implementations outside Phase 0.** Open a
  design or implementation-proposal issue first. Evidence-backed
  challenges to the current scope are welcome; unsolicited code for a
  deferred feature will not be merged.

---

## PR workflow

1. Create a feature branch from `main`.
2. Make your changes. Read every file you touch before editing it.
3. Ensure your changes do not contradict other documents in the
   repository.
4. Use the pull request template (`.github/PULL_REQUEST_TEMPLATE.md`)
   when opening a PR.
5. Clearly state what changed and why. If you are correcting an
   error, name the error and the file it was in.

---

## Style guide

- Use concise, professional Markdown.
- Prefer standard punctuation; use `---` only for a Markdown thematic
  break.
- Fence code blocks with triple backticks and label the language when
  applicable.
- Tables use GitHub-flavored Markdown pipe syntax.
- Do not use HTML tags in Markdown.
- Sentences are plain text. No marketing language.

---

## License

MIT. By contributing, you agree to license your contributions under
the same license. See LICENSE.
