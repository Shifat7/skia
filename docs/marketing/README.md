# Marketing pack

Maintainer drafts for a later public launch. Nothing in this folder is a
live post, a release note, or evidence that `skia review` runs.

## Status

| Item | State |
|---|---|
| Phase 1 foundation | In the repository (snapshots, parsers, schemas, storage) |
| `skia` CLI shell | `implemented: false` in `src/main.ts` |
| npm package | Private, `0.0.0`. Not published |
| This pack | Draft. Launch posts stay on HOLD |

The marketing site source is [`website/`](../../website/README.md). The public
URL, after GitHub Pages uses the Actions workflow, is
<https://shifat7.github.io/skia/>.

## Contents

| File | Use |
|---|---|
| [launch-posts.md](launch-posts.md) | Show HN, two Reddit drafts, Product Hunt blurb |
| [devto-outlines.md](devto-outlines.md) | Three article outlines |
| [preseed-calendar.md](preseed-calendar.md) | Week-by-week pre-seed, with HOLD flags |
| [examples-plan.md](examples-plan.md) | What [`examples/`](../../examples/README.md) is for |

## Rules that override a generic growth playbook

- npm is the first install channel. Homebrew and a curl installer stay
  unlabeled commands until each one works.
- Node.js 24.x (`>=24.0.0 <25`) sits next to any future npm instruction.
- Do not post a star count, a download badge, or a catch-rate comparison.
- Cursor, Claude Code, Codex, and GitHub Actions are planned jobs. Drafts
  do not include plugin, skill, or Action install snippets.
- Product telemetry is none in the current phase. A future cloud model is
  consent-gated egress, not a Skia backend.
- Dependency graphs, type-drift analysis, DRY analysis, and an
  error-coverage product are not roadmap items. The implementation plan
  excludes complete call graphs and runtime proof, and repository metadata
  says not to advertise those claims.
- Discord is out of scope. Do not add an invite or a Discord badge.
- [OD-1](../OPEN_DECISIONS.md) blocks package publication under the current
  name until the maintainer records the distribution decision.

## Gates

**Gate A — runnable demo.** A stranger can run a real review command on a
synthetic fixture in this repository and read labeled output. Until
`src/main.ts` grows past `implemented: false`, Gate A is unmet.

**Gate B — public install.** Gate A is met, OD-1 is explicitly accepted or
the project is renamed, `private` is no longer set, and someone ran the
published npm command on a clean machine that week. Homebrew and curl stay
closed until their own commands work.

Launch posts in this folder wait for Gate A. Install lines wait for Gate B.
