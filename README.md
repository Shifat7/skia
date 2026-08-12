# Skia

> **AI wrote the code. Skia helps you understand it before you trust it.**

Skia is designed to turn an AI-generated change into a small, source-backed
behavior check. It shows a simplified code view, asks you to predict one
result, and keeps anything it could not analyze visible.

## Start here

If you are new to the repository, follow [Getting Started](docs/GETTING_STARTED.md).
This README gives you the shortest useful explanation.

## The idea in one example

Imagine an AI changes this function:

```diff
 function calculateFinalPrice(total, member, promotion) {
-  return total;
+  if (member) total *= 0.9;
+  if (promotion > 0) total -= promotion;
+  return Math.max(0, Math.round(total));
 }
```

Skia is intended to show a junior-friendly reading view:

```text
SIMPLIFIED VIEW — not executable
src/pricing.ts:12-18

function calculateFinalPrice(total, member, promotion) {
  if (member)    total = total * 0.90
  if (promotion > 0) total = total - promotion
  return round(max(total, 0))
}
```

Then it asks:

```text
total=100, member=true, promotion=10
What should calculateFinalPrice(...) return?  > 80
```

You answer first. Then you can inspect the original source and the evidence
behind the simplified view. The simplified view is a map for reading, not code
to copy into your project. The original source and exact Git snapshot remain
authoritative. See [ADR-001](docs/decisions/ADR-001-simplified-code-as-evidence.md)
for this decision.

## When would I use Skia?

Use Skia when an AI has changed code and you want to understand the behavior
before you approve, merge, or build on top of it. The future workflow is always
the same:

```text
1. Read the simplified view.
2. Predict one result yourself.
3. Compare your answer with the source-backed evidence.
4. Open the original code anywhere the coverage is incomplete.
```

### Use case: an authorization change

AI-generated change in `src/deleteAccount.ts`:

```ts
if (!session) throw new Error("Not signed in");
if (!session.isAdmin) throw new Error("Forbidden");
await deleteAccount(accountId);
```

Intended simplified view:

```text
SIMPLIFIED VIEW — not executable
src/deleteAccount.ts:8-12

no session       -> reject
signed-in user
  not an admin   -> reject
  admin          -> delete the account
```

Prediction question:

```text
Given: signed-in user, isAdmin=false
What happens?  > the account is not deleted
```

This helps a junior developer notice that “signed in” is not the same as
“allowed to delete.”

### Use case: a TSX loading-state change

AI-generated change in `src/Dashboard.tsx`:

```tsx
if (loading) return <Spinner />;
if (error) return <ErrorMessage message={error.message} />;
return <DashboardContent data={data} />;
```

Intended simplified view:

```text
SIMPLIFIED VIEW — not executable
src/Dashboard.tsx:20-23

loading -> show spinner
error   -> show error message
ready   -> show dashboard data
```

Prediction question:

```text
Given: loading=false, error=null, data={tasks: []}
What does the user see?  > an empty dashboard, not a spinner
```

This is useful when the change is small but the UI behavior has several
branches that are easy to miss in a diff.

### Use case: a Python data-cleanup change

AI-generated change in `scripts/send_reminders.py`:

```python
def send_reminder(user):
    if not user["email"] or user["unsubscribed"]:
        return
    send_email(user["email"], "You have a reminder")
```

Intended simplified view:

```text
SIMPLIFIED VIEW — not executable
scripts/send_reminders.py:4-7

no email OR unsubscribed -> send nothing
otherwise                -> send one reminder email
```

Prediction question:

```text
Given: email="", unsubscribed=false
What happens?  > no email is sent
```

This makes an important negative behavior visible: the function deliberately
does nothing for users without an email address.

### Use case: Skia cannot safely summarize the change

Sometimes the right output is a warning, not simplified code:

```text
src/parser.ts       partial      syntax error near lines 31-34
docs/example.md     unsupported  unsupported_language
scripts/job.py      failed       invalid_source_encoding
src/generated.ts    unchecked    not analyzed in this run
```

The next action is to inspect those files. Skia must not invent a clean-looking
summary for a branch it could not analyze.

## What works today

The Phase 1 TypeScript foundation is implemented:

- exact staged and committed-`HEAD` Git snapshots;
- schema and coverage validation;
- TypeScript, TSX, and Python source analysis;
- explicit `supported`, `partial`, `unmapped`, `unsupported`, `failed`, and
  `unchecked` outcomes; and
- local, path-safe run storage.

The future `skia review` and `skia repo review` commands are product examples,
not runnable workflows yet. The current CLI is a side-effect-free bootstrap
shell. Staged semantic reduction, repository scanning, agent transport,
HLD/LLD generation, and behavioral validation remain deferred.

## Run the repository today

Requirements: Node.js and npm.

```sh
npm ci
npm run typecheck
npm run build
npm test
python3 scripts/check_docs.py
git diff --check
```

Optional focused harnesses:

```sh
npm run test:golden
npm run test:security
```

These commands verify the implemented foundation. They do not run the future
`skia review` or `skia repo review` product workflows.

## How to read coverage results

| State | Plain-English meaning | Your next action |
|---|---|---|
| `supported` | Skia analyzed the input within the current contract. | Read the evidence and answer the question. |
| `partial` | Skia analyzed part of the input, but a syntax or boundary issue remains. | Inspect the source range and do not assume completeness. |
| `unmapped` | Changed material could not be connected to a supported behavior unit. | Open the original source. |
| `unsupported` | The extension, file mode, status, or size is outside the current contract. | Treat it as not analyzed. |
| `failed` | Decoding, parsing, or an operational step failed. | Read the reason and investigate the input or error. |
| `unchecked` | The area was intentionally not analyzed in this run. | Do not treat it as reviewed. |

Skia must not turn an unknown result into a confident-looking simplified code
block.

## Vocabulary you will see in the deeper design

| Term | Meaning today |
|---|---|
| `collapsed equivalence evidence` | The intended staged reduction view; not implemented yet. |
| `model_derived` | A claim generated by a configured agent; not deterministic proof. |
| `repo-hld-20260805T001500Z.md` | An example future artifact name; the current repository does not generate it. |

## Where to look in the code

| Question | File |
|---|---|
| What are the shared names and truth states? | [`src/types.ts`](src/types.ts) |
| How are exact Git snapshots captured? | [`src/git.ts`](src/git.ts) |
| Where are contracts validated? | [`src/schema.ts`](src/schema.ts) and [`schemas/`](schemas) |
| How are TS, TSX, and Python files analyzed? | [`src/languages/registry.ts`](src/languages/registry.ts) |
| How are local runs and artifacts protected? | [`src/storage.ts`](src/storage.ts) and [`src/paths.ts`](src/paths.ts) |
| Where are the behavior tests? | [`tests/`](tests) and [`fixtures/`](fixtures) |
| What does the bootstrap CLI currently do? | [`src/main.ts`](src/main.ts) |

## Your first contribution

Choose one small path:

1. **Documentation:** fix a confusing example, stale status statement, broken
   link, or unsupported claim.
2. **Fixture or contract:** add a synthetic case for a supported, partial,
   unmapped, unsupported, failed, or unchecked result.
3. **Foundation code:** take one bounded item from
   [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md), read its contract first,
   and add focused tests.

Do not start by implementing the future CLI, semantic reduction, repository
scanner, agent transport, HLD/LLD generation, or behavioral study unless that
work is explicitly scoped by a maintainer. Read
[`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request.

## Rules that keep Skia honest

- Supported source languages are exactly `typescript | tsx | python`.
- Raw source and the exact Git snapshot are authoritative.
- Simplified code is always labeled `not executable`.
- `partial`, `unmapped`, `unsupported`, `failed`, and `unchecked` are useful
  results, not states to hide.
- Do not claim semantic equivalence, runtime correctness, complete coverage,
  or authoritative HLD/LLD.
- Repository content, fixtures, paths, and model responses are untrusted data.

## Read next

| Need | Document |
|---|---|
| Junior developer path | [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) |
| Product requirements | [PRD.md](PRD.md) |
| Technical architecture | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Implementation order and acceptance criteria | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) |
| Output and artifact examples | [docs/artifacts/README.md](docs/artifacts/README.md) |
| Evidence and experiments | [docs/VALIDATION.md](docs/VALIDATION.md) |
| Unresolved choices | [docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md) |
| Architectural rationale | [docs/decisions/](docs/decisions/) |
| Contribution rules | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Security boundary | [SECURITY.md](SECURITY.md) |

## Name

The project and command retain the `Skia`/`skia` name for now. Publication and
distribution risks from the existing Google Skia project remain an open release
decision; see [docs/OPEN_DECISIONS.md](docs/OPEN_DECISIONS.md).

## License

MIT. See [LICENSE](LICENSE).
