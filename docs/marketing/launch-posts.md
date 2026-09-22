# Launch posts

**DRAFT. DO NOT POST** until Gate A in [README.md](README.md) is met: a
stranger can run a real review on a synthetic fixture. Fill any install line
only after Gate B, with a command that was run on a clean machine that week.
Delete this banner in the posted copy only after both checks pass.

These drafts describe the current product boundary. They are not permission
to publish.

## Show HN

### Title

Show HN: Skia, a local pre-PR reading checkpoint for AI-written code

### Body

Skia is the step I wanted between an AI coding tool and commit: a short
source-backed reading of a change, one prediction I have to make myself, and
an explicit list of what the tool could not analyze.

Who it is for: one developer, before the pull request. It is a local CLI
plan, not a GitHub App and not a seat-licensed reviewer. Hosted tools such
as CodeRabbit, Greptile, and Copilot Review still own the PR timeline. I am
not claiming a catch rate against them.

What is in the repository today:

- exact Git snapshots
- schema and coverage validation
- TypeScript, TSX, and Python analysis
- local path-safe storage

What is not ready:

- `skia review` and `skia repo review` (the CLI shell is unimplemented)
- a public npm package (`private`, `0.0.0`; Node.js 24.x when it ships)
- Homebrew, curl, Cursor, Claude Code, Codex, and GitHub Actions adapters

Intended output, hand-written and labeled, is in `examples/`. The simplified
view is not executable. I am not claiming semantic equivalence or that a
prediction proves the change is correct.

There is no product telemetry and no Skia review backend. A future
repository mode would send context only to a model endpoint the user
configures, after consent.

Ask: if you review AI-written diffs before you commit, where does a
one-prediction checkpoint help, and where is it just friction? Issues on
the repo are the right channel. Please do not treat stars as a review of
the method.

Repository: https://github.com/Shifat7/skia

Install line for the posted version, after Gate B only:

```text
[verified npm command, Node.js 24.x, run on a clean machine this week]
```

## Reddit

Both drafts are **DRAFT / DO NOT POST** until Gate A. r/selfhosted is a poor
fit: Skia is not a self-hosted server. Prefer communities about programming
practice. Read each community's self-promotion rules first.

### r/programming

Title: The missing step between AI generation and commit is reading the change

Body:

I have been working on Skia, a local checkpoint for one developer who just
received an AI-written diff. The intended flow is small: a simplified view
marked not executable, one prediction you answer before any feedback, and
coverage states when the tool cannot analyze a path (`partial`, `unmapped`,
`unsupported`, `failed`, `unchecked`).

The repository has the Phase 1 foundation (Git snapshots, TS/TSX/Python
parsers, schemas, local storage). The review command is not runnable, and
the package is not on npm. I am posting the problem and the boundary, not
an install.

Samples of the intended reading view, labeled as such:
https://github.com/Shifat7/skia/tree/main/examples

If you have tried to keep a mental model of generated code, I would like to
hear which single question would have changed whether you committed.

### r/webdev

Title: Before I trust generated frontend code, I want one prediction on paper

Body:

A lot of generated TypeScript looks done because it typechecks. The failure
I keep hitting is behavioral: a discount applied in the wrong order, a
status update that is not atomic with the audit write, a retry that only
catches timeouts.

Skia is an early local CLI aimed at that moment, before the PR. It is not
shipped. `package.json` is private at 0.0.0, and `skia review` is still an
unimplemented shell. Node.js 24.x is the planned runtime. npm would be the
first install channel; there is no Homebrew or curl command.

The README walks a pricing function and an archive endpoint as intended UX,
not as captured CLI output:
https://github.com/Shifat7/skia

I am collecting the cases where a single concrete prediction would have
caught a wrong assumption. I am not collecting stars, and I cannot demo a
live review yet.

## Product Hunt

**DRAFT / DO NOT POST** until Gate A, and do not schedule a listing during
the pre-seed weeks.

### Name

Skia

### Tagline

Read AI-written code, predict one result, then commit.

### Description

Skia is a local, pre-PR comprehension checkpoint for one developer. It is
designed to turn a generated change into a short source-backed reading, ask
for one prediction before feedback, and keep unanalyzed paths visible.

Early preview. The open-source repository contains Git snapshots, TypeScript
/ TSX / Python analysis, and local storage. The review CLI is not runnable
yet, and there is no published npm package. Homebrew, curl, and editor
adapters are planned without install commands.

Skia does not host a review backend and does not send product telemetry.
It is not a pull-request bot and not a replacement for tests.

### First comment, after Gate A

Link the repository, the limitations section, and one intended example.
State the date the demo command was last run. Omit star goals and omit
competitor catch rates.
