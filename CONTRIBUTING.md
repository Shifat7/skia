# Contributing to Skia

> **Documentation-only stage.** There is no source, build, test suite, CLI,
> package, generated HLD/LLD, or release. Current contributions are design,
> evidence, synthetic fixtures, schemas, documentation, and documentation
> automation proposals.

---

## 1. Read before proposing changes

The product now has two proposed modes:

- staged collapsed equivalence evidence plus a minimal Behavior Card; and
- an agent-assisted TypeScript-first repository snapshot with timestamped local
  HLD/LLD and architecture/selected-subsystem checks.

Before opening a contribution, read the documents you affect and their direct
references. The canonical contracts are:

- [PRD.md](PRD.md) for product behavior and truth boundaries;
- [ARCHITECTURE.md](ARCHITECTURE.md) for technical design;
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for acceptance criteria;
- [docs/artifacts/README.md](docs/artifacts/README.md) for output examples;
- [docs/VALIDATION.md](docs/VALIDATION.md) for evidence and prohibited claims;
  and
- [docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md) for unresolved choices.

---

## 2. Safe contribution rules

Never submit:

- proprietary or employer-owned code without explicit permission;
- secrets, credentials, tokens, customer data, personal data, internal paths,
  private repository names, or sensitive architecture;
- source or generated artifacts copied from a repository you cannot publish;
- AI-generated claims presented as verified or deterministic; or
- executable proof-of-concept exploit details in a public issue.

Fixtures should be synthetic or irreversibly minimized. By submitting a
fixture, you assert that you have the right to publish it under this
repository's license.

Repository content is untrusted data. Do not add instructions in fixtures,
comments, paths, or Markdown that ask an agent to change tools, destinations,
permissions, scope, or disclosure. Prompt-injection fixtures are welcome only
when clearly labelled as adversarial test data inside the fixture contract.

---

## 3. Contribution paths

### 3.1 Documentation corrections

Pull requests may fix contradictions, broken links, terminology drift, malformed
examples, schema mismatch, unsafe claims, and source citations.

A documentation change must not claim:

- a working CLI, package, generated artifact, release, or adoption;
- semantic/runtime equivalence or complete coverage;
- a correct, verified, passed, or understood Behavior Card;
- authoritative HLD/LLD;
- privacy without disclosing any external-agent boundary; or
- professional comprehension benefit before a valid experiment.

### 3.2 Staged collapsed-evidence fixtures

Use the benchmark fixture issue form. A useful fixture is synthetic, generally
10 to 50 changed lines, and provides:

- base and staged TypeScript/TSX source;
- unified staged diff;
- expected supported entity ownership, or explicit unsupported outcome;
- expected compact relations and base/staged source anchors;
- total, mapped, and unmapped changed-line counts;
- expected minimal scenario and prediction kind;
- expected source-check eligibility/status and reason;
- expected probe eligibility/status and reason;
- expected budget behavior; and
- the behavior that a misleading reduction might omit.

Unsupported constructs are first-class fixtures. Select `unsupported / no
entity` rather than forcing a function or method answer.

### 3.3 Repository-layout fixtures

Use the repository snapshot fixture form. Submit a small synthetic tree or a
manifest-style description, not a private repository archive.

A useful repository fixture states:

- TS/TSX, manifest, configuration, documentation, generated/vendor, fixture,
  unsupported-language, and failure classifications;
- packages/workspaces, entry points, imports, direct calls, and unresolved
  edges;
- expected candidate subsystems and deterministic membership evidence;
- expected HLD/LLD claims plus observed/model-derived/uncertain labels;
- expected coverage and exclusion arithmetic;
- expected architecture card and subsystem-selection behavior; and
- prompt-injection or privacy edge cases when relevant.

### 3.4 Design feedback

Use the design feedback form. High-value topics include:

- whether collapsed evidence actually reduces reading;
- relation grammar, anchors, and safe fallback;
- minimal card scenario selection and mismatch flow;
- atomic staged snapshot strategy;
- repository coverage and subsystem discovery;
- agent consent, prompt-injection, and claim provenance;
- HLD/LLD output size and factual-accuracy bar;
- timestamped bundle schema and local deletion; and
- professional validation design.

### 3.5 Implementation proposals

Map proposals to specific acceptance criteria in IMPLEMENTATION_PLAN.md. Include
alternatives, trade-offs, failure modes, security/privacy impact, resource
limits, fixtures, and verification commands. Unrequested product source code is
not accepted during the documentation-only stage.

---

## 4. Pull-request workflow

1. Create a short-lived branch from `main`.
2. Read every file you will change and any document that declares itself
   authoritative for the same term/schema.
3. Keep one logical decision per commit where practical.
4. Update every duplicated contract or replace duplication with one canonical
   fixture/reference.
5. Use the pull-request template.
6. Record exact verification commands and outputs.
7. Obtain review before merge. Automated review is evidence, not a substitute
   for the maintainer's decision.
8. Do not merge while required review findings or documentation checks are red.

Large repository-wide specification changes may span several files, but the PR
must explain why they cannot be safely split and should use small commits by
contract layer.

---

## 5. Documentation verification

Before requesting review, run the repository's documented checks when they
exist. The required documentation CI target is:

- Markdown style and malformed-tail checks;
- relative and external link validation;
- fenced JSON parsing;
- GitHub issue-form YAML validation;
- canonical JSON Schema/example validation;
- terminology, enum, timestamp, filename, and coverage-field drift checks;
- duplicate canonical-example detection; and
- `git diff --check`.

Until those scripts are checked in, list the equivalent commands or manual
checks in the PR. "Looks correct" is not verification.

---

## 6. Style

- Use concise professional Markdown and standard punctuation.
- Prefer exact contracts and one canonical example over repeated prose.
- Label proposed commands/output as unimplemented.
- Separate deterministic observations from model-derived claims.
- Use `model_derived`, `developer_supplied`, `not_available`,
  `source_derived_match`, `source_derived_mismatch`, and `not_checkable`
  consistently.
- Do not call generated architecture authoritative, verified, or complete.
- Fence code and data examples with an appropriate language.
- Avoid marketing language and unsupported performance/adoption claims.

---

## 7. License

MIT. By contributing, you agree to license your contribution under the same
license. See [LICENSE](LICENSE).
