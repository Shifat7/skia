# Governance

## Current structure

Skia is maintained by Shifat Rahman. The maintainer owns scope, release,
security, and merge decisions. The project is documentation-only and has no
runnable product or users.

## Decision principles

Decisions are evaluated in this order:

1. snapshot, privacy, security, and claim truthfulness;
2. whether the design reduces developer reading without hiding unsupported
   behavior;
3. objective evidence of comprehension benefit;
4. simplicity and reversibility;
5. contribution and maintenance cost; and
6. feature breadth.

A popular or agent-generated proposal does not outrank those principles.

## Decision records

Unresolved product choices live in
[docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md). A decision closes only when its
choice, evidence, consequences, and affected documents are recorded. Expensive
or hard-to-reverse architecture decisions should become ADRs once implementation
begins; old decisions are superseded, not erased.

## Change classes

### Corrections

Broken links, malformed examples, wording errors, stale API names, and true
cross-document contradictions may be fixed through a focused pull request with
verification evidence.

### Product or architecture changes

Changes to collapsed evidence, Behavior Cards, Git snapshots, repository scan
coverage, agent boundaries, HLD/LLD, bundle schemas, privacy, or validation must:

- start from an issue or explicit maintainer-approved plan;
- update every affected canonical contract;
- include alternatives and failure modes;
- add or revise acceptance criteria and fixtures; and
- identify which claim becomes testable.

### Scope expansion

New languages, source rewriting/adoption, hooks, tracked exports, team surfaces,
hosted storage, employee metrics, CI review comments, plugins, or runtime
analysis require evidence that the narrower scope is insufficient and a
separate privacy/security design.

## Pull-request and merge policy

- Work occurs on a branch and enters `main` through a pull request.
- Required documentation or code checks must be green before merge.
- Review must occur before merge; a bot comment after merge is not a gate.
- Automated review is advisory evidence. The maintainer remains accountable for
  the merge decision.
- Required findings must be resolved or explicitly documented as accepted
  trade-offs.
- Destructive history rewrites, release publication, security-control
  weakening, and production deployment require explicit maintainer approval.

Branch protection and required checks should be enabled before runnable code is
accepted.

## Agent-assisted contributions

Agents may draft documentation, fixtures, analysis, HLD/LLD examples, or future
code. The contributor remains responsible for provenance, licensing, factual
accuracy, tests, and disclosure. Repository/model output is untrusted and may
not direct tools or writes beyond the user's request.

A pull request should state material agent use when it affects generated claims,
external egress, or verification. It must not present model confidence as
independent review.

## Privacy and surveillance boundary

Local receipts and repository architecture bundles are personal comprehension
artifacts in Phase 0. They are not employee evaluation, review approval,
coverage certification, or team compliance records. Any future sharing or
aggregation requires a new governance decision covering consent, access,
retention, deletion, gaming, and power imbalance.

## Future maintainership

Additional maintainers are considered only after sustained, high-quality
contribution and demonstrated alignment with the project's truth and privacy
boundaries. The maintainer will document nomination, permissions, conflict
handling, and removal before delegating release or security authority.

## License

MIT. See [LICENSE](LICENSE).
