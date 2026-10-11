# Pricing happy path

**Illustrative / intended UX — not a live CLI session.**

This transcript was written to match the README example. It is not output
from `skia review`, and `skia review` is not runnable. The simplified view is
**not executable**. The prediction below is an illustration of a
`developer_supplied` answer, not a test result and not semantic equivalence.

## Change

Synthetic diff:

```diff
 function calculateFinalPrice(total, member, promotion) {
-  return total;
+  if (member) total *= 0.9;
+  if (promotion > 0) total -= promotion;
+  return Math.max(0, Math.round(total));
 }
```

## Simplified view

```text
SIMPLIFIED VIEW — not executable
src/pricing.ts:12-18

function calculateFinalPrice(total, member, promotion) {
  if (member)    total = total * 0.90
  if (promotion > 0) total = total - promotion
  return round(max(total, 0))
}
```

Derivation of this sample: hand-written reading aid (`not_available` as a
CLI artifact). Raw source in the project that owns this function would stay
authoritative. This repository does not contain that function.

## Prediction prompt

```text
total=100, member=true, promotion=10
What should calculateFinalPrice(...) return?
```

Example answer, `developer_supplied`, recorded here only to show the shape
of the prompt:

```text
80
```

That number is not `deterministic`. Nothing in Skia executed
`calculateFinalPrice`. A future source check would compare a supported path
with the original snapshot. It would not be runtime verification.

## Card shape

The artifact contract sketches one prediction like this. The JSON is the
documented shape, not a file Skia wrote.

```json
{
  "scenario": {
    "given": {
      "arguments": {
        "total": 100,
        "member": true,
        "promotion": 10
      },
      "state_note": null
    },
    "when": {
      "entity": "calculateFinalPrice",
      "invocation": "calculateFinalPrice(total, member, promotion)"
    }
  },
  "prediction": {
    "kind": "return_value",
    "value": 80
  },
  "because": null,
  "impact": null,
  "action": "complete"
}
```

## Coverage for this sample

| Region | State in this illustration | Next action |
|---|---|---|
| The three shown branches | `supported` as a reading label only | Compare with the original source before trusting the map |
| Runtime result `80` | `not_available` | Do not treat the example answer as a passing test |
