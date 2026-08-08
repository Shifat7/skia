## Summary

Describe the problem, the change, and why this is the smallest coherent update.

## Change type

- [ ] Documentation correction
- [ ] Product or architecture decision
- [ ] Staged collapsed-evidence fixture
- [ ] Repository-layout / HLD / LLD fixture
- [ ] Schema or canonical artifact change
- [ ] Validation or evidence update
- [ ] Contribution, governance, or security update
- [ ] Documentation automation

## Files and contracts affected

List every changed file and the canonical contract, acceptance criteria, schema,
or open decision it affects.

## User-visible effect

Explain what becomes shorter, clearer, safer, or newly testable. If the change
adds output, explain why it does not defeat the reduced-reading objective.

## Truth and privacy check

- [ ] I do not claim a working CLI, package, release, generated artifact, or adoption.
- [ ] Deterministic facts, model-derived claims, developer predictions, and unavailable values remain distinct.
- [ ] I do not claim semantic/runtime equivalence, complete coverage, correctness, review pass, or verified HLD/LLD.
- [ ] Unsupported, excluded, unmapped, failed, unselected, and unchecked regions remain explicit.
- [ ] Prediction is persisted before feedback.
- [ ] Agent/provider egress and consent are disclosed where relevant.
- [ ] I included no secret, personal data, proprietary source, private path, or sensitive architecture.
- [ ] Fixture content is synthetic/minimized and I have the right to publish it.
- [ ] Local artifact and deletion implications are documented.

## Consistency check

- [ ] I read every file I changed and the authoritative documents it references.
- [ ] README, PRD, architecture, implementation criteria, artifact examples, validation, and open decisions remain consistent.
- [ ] Commands and outputs are labelled proposed/unimplemented.
- [ ] Timestamp format, filenames, enums, schemas, coverage fields, and terminology are consistent.
- [ ] I removed stale duplicated examples or validated them from one canonical fixture.

## Verification evidence

List exact commands and outputs. At minimum include applicable results for:

- `git diff --check`
- Markdown checks
- relative/external links
- fenced JSON parsing
- issue-form YAML parsing
- schema/example validation
- terminology/drift checks

If a check does not exist yet, state the manual evidence and the automation gap.

## Security and failure cases

Describe untrusted inputs, misuse, privacy impact, resource limits, and cases
that must remain partial, unsupported, unchecked, or `not_checkable`.

## Alternatives and trade-offs

List alternatives considered and why this approach wins under the current
product contract.

## Open decisions

List affected entries from `docs/OPEN_DECISIONS.md` and whether this PR proposes
to close, add, or refine them.

## Agent assistance

State any material agent use in drafting or review, the context that left the
machine, and how factual claims were independently checked.
