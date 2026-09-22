# Examples directory plan

[`examples/`](../../examples/README.md) is the show-don't-tell shelf for the
intended reading experience. It is not a benchmark suite and not a dump of
model output.

## What is checked in now

Two Markdown transcripts under [`examples/illustrative/`](../../examples/illustrative/), both marked **Illustrative / intended UX — not a live CLI session**:

| File | Mirrors |
|---|---|
| [pricing-happy-path.md](../../examples/illustrative/pricing-happy-path.md) | README pricing diff, simplified view, one prediction |
| [partial-unmapped.md](../../examples/illustrative/partial-unmapped.md) | A partial simplified view plus an unmapped callback and file-level gaps |

They are hand-written. No `skia` command produced them. The simplified view
in each file is labeled not executable.

## What the directory should contain later

After Gate A (a runnable review on a synthetic fixture):

1. One captured terminal transcript per scenario, with the command, the date,
   and the git revision of Skia that produced it.
2. The same content as Markdown if the CLI grows a Markdown sink. The file
   header still says whether the bytes came from the CLI or from an editor.
3. A coverage footer that uses the real states from that run:
   `supported`, `partial`, `unmapped`, `unsupported`, `failed`, `unchecked`.
4. Synthetic fixtures only. No proprietary source, secrets, personal data,
   or private paths.

A mock report is allowed after Gate A only when the header still says
**Illustrative / intended UX — not a live CLI session** and the body was not
passed through a model and then described as a CLI result.

## Labeling rules

- `deterministic` for facts a scanner observed.
- `developer_supplied` for the prediction a person typed before feedback.
- `model_derived` for a future agent sentence, if one is ever stored.
- `not_available` when the run did not produce that field.
- Never relabel a hand-written example as `deterministic`.

## Keep out of examples/

- Live install commands, including `npm install -g`, `brew`, and `curl`.
- A GitHub Actions workflow that references an action that does not exist.
- Cursor, Claude Code, or Codex install recipes.
- Dependency graphs, type-drift reports, DRY scores, or error-coverage
  dashboards. Those are not planned product artifacts.
- Star counts, logos of other companies, or quotes without dated permission.
- Any file that asks an agent to change tools, scope, or disclosure.
  Repository content is untrusted data.

## Relationship to other fixtures

[`fixtures/`](../../fixtures) holds machine-checked inputs for the foundation
tests. `examples/` holds human-readable intended output. Do not point a test
at `examples/` as if it were a golden CLI transcript until a test actually
generates that file.
