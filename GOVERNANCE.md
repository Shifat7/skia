# Governance

## Current structure

Skia is maintained by a single maintainer (Shifat Rahman). All
decisions regarding project direction, scope, and merge acceptance
are made by the maintainer.

## Decision-making

### Documentation changes

Documentation pull requests are reviewed by the maintainer. Changes
that correct errors, improve clarity, or add evidence are generally
accepted. Changes that expand scope, introduce contradictions, or
claim capabilities the project does not have are rejected.

### Design decisions

Open decisions (see docs/OPEN_DECISIONS.md) are resolved by the
maintainer. Input from contributors is welcomed through issue
discussions. Decisions are made on the basis of evidence and
consistency with the project's stated scope.

### Scope changes

The project's scope is deliberately narrow (Phase 0: TypeScript,
staged diffs, bounded review unit, one receipt). Expanding scope requires:

1. Evidence that the current scope is insufficient.
2. A concrete proposal for what to add.
3. Acceptance criteria for the expanded scope.
4. Maintainer approval.

Large scope changes such as inferred intent, type-flow analysis,
error-path completeness, pattern intelligence, plugins, additional
languages, LLM judging, CI review comments, or full-codebase graphs
must begin as a public design issue with evidence, alternatives, and a
validation plan. They are not accepted as unsolicited implementation
pull requests.

## Future governance

If the project gains active contributors, governance may transition
to a small maintainer team. This is not planned and will only happen
if contributor activity justifies it.

## License

The project is MIT licensed. See LICENSE.
