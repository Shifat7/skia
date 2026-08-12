# Skia

> **AI wrote the code. Skia helps you understand it before you trust it.**

Skia is designed as the missing step between AI generation and commit. It is a
local, pre-PR comprehension checkpoint for the individual developer: it turns
an AI-generated change into a small, source-backed behavior check, asks you to
predict one result, and keeps anything it could not analyze visible.

## Start here

If you are new to the repository, follow [Getting Started](docs/GETTING_STARTED.md).
This README gives you the shortest useful explanation.

## The problem Skia solves

AI coding tools can produce a working-looking diff faster than you can build a
reliable mental model of it. The hard part is often not finding another syntax
error. It is noticing:

- an abstraction, helper, or dependency that was not actually necessary;
- a branch or error path hidden inside a large generated diff;
- code that compiles and passes tests but is still unfamiliar; or
- missing production details such as retries, idempotency, error handling, or
  observability.

Skia is intended to help you read and own the change before it becomes someone
else's review problem. It should make three things easy to see:

1. what the changed code appears to do;
2. what Skia could not safely analyze; and
3. what you should inspect or verify before committing.

## Where Skia fits

```text
AI coding tool -> generated diff -> Skia: understand + predict -> tests -> commit/PR
```

| Skia is intended to be... | Skia is not intended to be... |
|---|---|
| A pre-PR checkpoint for one developer. | A team PR review bot. |
| Local-first and source-backed. | A service that silently uploads your code. |
| A reading aid for behavior and uncertainty. | A code generator or source rewriter. |
| A prompt to form your own prediction. | Proof of runtime correctness or semantic equivalence. |

The future workflow is designed to fit alongside Cursor, Claude Code, Codex,
or another AI coding tool. Those integrations are product plans, not runnable
features in the current repository.

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
before you approve, merge, or build on top of it. The intended workflow is:

```text
1. Read the simplified view.
2. Predict one result yourself.
3. Compare your answer with the source-backed evidence.
4. Open the original code anywhere the coverage is incomplete.
```

### Use case: a TypeScript authorization change with side effects

An AI agent adds an archive endpoint. The diff looks reasonable, but it mixes
authorization, state mutation, auditing, and notifications:

```diff
 export async function archiveProject(
   input: ArchiveProjectInput,
   deps: Dependencies,
 ): Promise<ArchiveResult> {
   const project = await deps.projects.findById(input.projectId);
   if (!project) return { ok: false, reason: "not_found" };
+  const isOwner = project.ownerId === input.userId;
+  const isAdmin = input.roles.includes("admin");
+  if (!isOwner && !isAdmin) {
+    return { ok: false, reason: "forbidden" };
+  }
+  if (project.status === "archived") {
+    return { ok: true, reason: "already_archived" };
+  }
+  await deps.projects.updateStatus(project.id, "archived");
+  await deps.audit.write({
+    actorId: input.userId,
+    action: "project.archived",
+    projectId: project.id,
+  });
+  await deps.notifications.enqueue("project-archived", {
+    projectId: project.id,
+    ownerId: project.ownerId,
+  });
   return { ok: true, reason: "archived" };
 }
```

The intended simplified view is shorter, but it keeps the behavior-changing
branches and the side effects visible:

```text
SIMPLIFIED VIEW — not executable
src/projects/archiveProject.ts:8-31

project missing                    -> not_found; no writes
caller is not owner AND not admin  -> forbidden; no writes
project already archived            -> already_archived; no writes
otherwise:
  update project status             -> archived
  write audit event                 -> project.archived
  enqueue owner notification        -> project-archived
  return                            -> archived

coverage note: status, audit, and notification calls are ordered side effects;
failure behavior after the status update must be checked in the source.
```

Prediction question:

```text
Given: project exists, caller is an admin, project.status="active"
What happens before the function returns?  > status update, audit write, and notification enqueue
```

This is the kind of question that catches a junior developer's hidden
assumption: “authorized” does not mean “the whole operation is atomic.” If the
audit write fails after the database update, the project may already be
archived. Skia should surface that path for source inspection; it should not
claim that the simplified view proves rollback or transaction behavior.

### Use case: a Python sync job with retries and partial failure

An AI agent changes a customer sync job to retry timeouts. The important detail
is that not every failure is retryable, and the third timeout has a different
outcome from the first two:

```python
def sync_customer(customer_id, api, db, clock):
    customer = db.get_customer(customer_id)
    if customer is None:
        return "missing"

    for attempt in range(1, 4):
        try:
            response = api.fetch_customer(customer.external_id)
            if response.status_code == 404:
                db.mark_deleted(customer_id)
                return "deleted"

            response.raise_for_status()
            db.upsert_customer(customer_id, response.json())
            return "updated"
        except TimeoutError:
            if attempt == 3:
                db.mark_retry_later(customer_id, attempts=attempt)
                return "retry_later"
            clock.sleep(2 ** attempt)
```

Intended simplified view:

```text
SIMPLIFIED VIEW — not executable
scripts/sync_customer.py:1-22

local customer missing             -> missing; no API call
API returns 404                    -> mark deleted; return deleted
API returns 2xx                    -> upsert response; return updated
API times out on attempts 1 or 2  -> sleep 2s or 4s; retry
API times out on attempt 3         -> mark retry_later; return retry_later
other HTTP error                  -> raise; no retry path shown

coverage note: API, database, and clock behavior is represented only through
their calls; inspect those boundaries before treating this as operationally safe.
```

Prediction question:

```text
Given: the API returns HTTP 500 on the first attempt
What does this function do?  > raises from raise_for_status; it does not retry the 500
```

That answer is easy to miss when reading a generated diff that advertises
“retries.” The code retries `TimeoutError`, not every failed request. A follow-up
source check should ask whether that distinction matches the production API's
failure contract and whether `mark_retry_later` is idempotent.

### Use case: a TypeScript batch change with an incomplete path

Not every useful result is a clean behavior summary. Suppose an AI agent adds a
batch processor that calls a third-party SDK and includes a callback Skia cannot
safely reduce:

```ts
export async function processInvoices(invoices, billing, audit) {
  const results = [];
  for (const invoice of invoices) {
    if (invoice.total <= 0) {
      results.push({ id: invoice.id, status: "skipped" });
      continue;
    }

    const result = await billing.charge(invoice.customerId, invoice.total);
    await audit.record("invoice.charged", invoice.id, result, (event) => {
      return event.metadata?.region ?? "unknown";
    });
    results.push({ id: invoice.id, status: result.status });
  }
  return results;
}
```

Possible output:

```text
SIMPLIFIED VIEW — partial, not executable
src/billing/processInvoices.ts:1-18

invoice.total <= 0                 -> skipped; no charge
invoice.total > 0                  -> charge customer; record audit; append result
audit callback                     -> unmapped: callback metadata path
billing.charge failure             -> not_checkable: SDK exception behavior
```

Prediction question:

```text
Given: invoices=[{id:"a", total:0}, {id:"b", total:25}]
What can be predicted safely?  > "a" is skipped; "b" attempts a charge, but its final status depends on the SDK
```

The honest answer is not “the batch succeeds.” It is a supported prediction for
the first invoice plus an explicit boundary around the second. This is where
Skia is most useful for a junior developer: it points to the exact source and
dependency behavior that still needs human verification instead of hiding it
behind a polished summary.

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
