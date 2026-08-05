# Security Policy

## Reporting a vulnerability

Use GitHub's private vulnerability-reporting flow when the repository Security
tab offers it. Do not place exploit details, secrets, private source, personal
data, repository architecture, or a proof of concept in a public issue.

If private reporting is unavailable, open a public issue containing only a
request for private follow-up and no sensitive detail. Before runnable code or
an external-agent adapter is released, the maintainer must enable GitHub private
vulnerability reporting and publish a monitored private security contact.

This volunteer documentation-only project does not yet promise a response SLA.
A release policy must define acknowledgement, triage, remediation, disclosure,
and supported-version timelines before users are asked to install code.

## Current scope

There is no runnable software. Reports are still welcome for:

- misleading security, privacy, equivalence, coverage, or agent claims;
- credentials, personal data, proprietary code, or sensitive architecture
  accidentally committed to the repository;
- unsafe Git snapshot or subprocess design;
- link-following, permissions, collision, retention, or deletion flaws in the
  proposed `.skia/` storage model;
- prompt-injection and untrusted-repository flaws in agent-assisted HLD/LLD;
- source-anchor or coverage designs that can turn model output into false
  deterministic evidence; and
- contribution forms that encourage unsafe source disclosure.

## Proposed threat model

The future CLI must treat these as untrusted:

- Git repository metadata, configuration, status, paths, modes, objects, and
  diagnostics;
- TypeScript source, comments, strings, documentation, manifests, lockfiles,
  fixtures, generated/vendor files, and unsupported-language files;
- terminal input and control characters;
- agent/provider responses; and
- existing `.skia/` paths and files.

Assets include source confidentiality, Git/index/object integrity, local files,
terminal integrity, credentials/environment, architecture artifacts, developer
predictions, and provider consent.

Required controls include:

- structured Git arguments, controlled environment, no lazy fetch, no optional
  locks, timeouts, byte limits, and complete status/mode checks;
- immutable logical snapshot identity and concurrent-mutation tests;
- no project code, package script, plugin, hook, or repository instruction
  execution;
- byte-preserving internal paths plus escaped terminal rendering;
- resource bounds for parsing, agent context, output, and terminal input;
- atomic create-new output, owner-only permissions where supported, symlink and
  link-following rejection, incomplete-run handling, and local deletion;
- zero network capability in staged mode;
- explicit provider/model/file/byte/token/retention disclosure and consent
  before repository-mode egress;
- no consequential tools for the HLD/LLD generation agent;
- schema/anchor validation and deterministic/model-derived separation; and
- secret/sensitive-path exclusion that fails closed and never promises perfect
  secret detection.

## Privacy model

Staged receipts and repository bundles may contain sensitive code-derived
behavior, architecture, source anchors, predictions, and model metadata. They
remain local and gitignored in Phase 0, but local is not synonymous with safe.
The product must provide inspect/delete commands, avoid unnecessary absolute
paths and identity, and document retention.

Agent-assisted repository generation may transmit bounded source and
architecture context to an external provider. The command must obtain explicit
consent for the disclosed boundary. Declining must not cause hidden fallback to
another external service.

Phase 0 has no team sharing, employee score, telemetry, update check, tracked
artifact export, or hosted storage.

## Dependency and release security

Once source exists, pull-request and release checks must include:

- pinned dependency and lockfile review;
- formatting, lint, tests, schemas, and golden artifacts;
- Rust dependency advisory and license checks;
- secret scanning and targeted generated-artifact checks;
- reproducible release process, checksums, provenance/SBOM where feasible, and
  signed release guidance; and
- a supported-version and vulnerability-disclosure policy.

Do not publish a binary or package until these controls, the project rename,
and private reporting channel are in place.
