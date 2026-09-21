# Partial and unmapped coverage

**Illustrative / intended UX — not a live CLI session.**

This transcript shows a simplified view that stops where the reading is no
longer safe. It was not produced by the Skia CLI. The CLI shell is
unimplemented. The simplified view is **not executable**.

`partial` and `unmapped` are the result. They are not a gap to smooth over.

## Change

Synthetic batch processor. The skipped invoice is readable. The charge path
calls an SDK, and the audit callback reads metadata the reducer cannot map.

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

## Simplified view

```text
SIMPLIFIED VIEW — partial, not executable
src/billing/processInvoices.ts:1-18

invoice.total <= 0                 -> skipped; no charge
invoice.total > 0                  -> charge customer; record audit; append result
audit callback                     -> unmapped: callback metadata path
billing.charge failure             -> not_checkable: SDK exception behavior
```

## Prediction prompt

```text
Given: invoices=[{id:"a", total:0}, {id:"b", total:25}]
What can be predicted safely?
```

Example answer, `developer_supplied`:

```text
"a" is skipped; "b" attempts a charge, but its final status depends on the SDK
```

The honest reading is not "the batch succeeds." The first invoice has a
supported prediction. The second invoice has an explicit boundary.

## File-level gaps in the same shape

Sometimes the right output is a warning list, not simplified code:

```text
src/parser.ts       partial      syntax error near lines 31-34
docs/example.md     unsupported  unsupported_language
scripts/job.py      failed       invalid_source_encoding
src/generated.ts    unchecked    not analyzed in this run
```

The next action is to inspect those files. A clean-looking summary for a
branch that was not analyzed is the wrong output.

## Coverage for this sample

| Region | State in this illustration | Next action |
|---|---|---|
| `invoice.total <= 0` | Shown as a skip with no charge | Compare with the original source |
| Audit callback metadata | `unmapped` | Open the callback in the source |
| `billing.charge` failure | `not_checkable` in this reading | Inspect the SDK contract |
| Unrelated files in the warning list | `partial`, `unsupported`, `failed`, or `unchecked` | Do not invent a behavior summary |
