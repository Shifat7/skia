---
title: Contribute
description: How to run the Skia foundation tests. This is not a review-CLI install.
---

The product CLI is not released. This page does not install `skia`. It runs the foundation that is already in the repository.

Contributors should read [Getting Started](https://github.com/Shifat7/skia/blob/main/docs/GETTING_STARTED.md) and [CONTRIBUTING.md](https://github.com/Shifat7/skia/blob/main/CONTRIBUTING.md) before opening a pull request.

## Run the foundation

Requirements: Node.js 24.x (`>=24.0.0 <25` in `package.json`) and npm.

```sh
git clone https://github.com/Shifat7/skia.git
cd skia
npm ci
npm test
```

`npm test` builds first and checks Git snapshots, parsers, schemas, and storage. It does not run `skia review` or `skia repo review`.

Optional checks for a documentation or foundation change:

```sh
npm run typecheck
npm run test:golden
npm run test:security
python3 scripts/check_docs.py
git diff --check
```

## What to work on

1. A documentation correction, stale status line, or broken link.
2. A synthetic fixture for `supported`, `partial`, `unmapped`, `unsupported`, `failed`, or `unchecked`.
3. One bounded foundation item from the implementation plan, with tests.

Do not start by implementing the review command, semantic reduction, repository scanner, agent transport, or HLD/LLD generation unless a maintainer has scoped that work.

There is no Homebrew formula, curl installer, or editor plugin to add in a first contribution. Those stay planned until a real command exists.
