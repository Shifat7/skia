---
title: Contribute
description: How to run the foundation for a local reading check. This page does not install a review CLI.
---

The package is not released. This page does not install `skia`. It runs the foundation already in the repository.

The work is a local reading check for engineers who review their own diffs, including ones an AI wrote. It is not a bot that reviews those diffs for them.

Read [Getting Started](https://github.com/Shifat7/skia/blob/main/docs/GETTING_STARTED.md) and [CONTRIBUTING.md](https://github.com/Shifat7/skia/blob/main/CONTRIBUTING.md) before opening a pull request.

## Run the foundation

Requirements: Node.js 24.x (`>=24.0.0 <25` in `package.json`) and npm.

```sh
git clone https://github.com/Shifat7/skia.git
cd skia
npm ci
npm test
```

`npm test` builds first and checks Git snapshots, parsers, schemas, storage, and the narrow staged-review pilot. It does not run `skia repo review`.

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

Do not broaden the pilot grammar or start the repository scanner, agent transport, or HLD/LLD generation unless a maintainer has scoped that work.

There is no Homebrew formula, curl installer, or editor plugin to add in a first contribution. Those stay planned until a real command exists.
