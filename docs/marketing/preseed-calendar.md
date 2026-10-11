# Pre-seed calendar

Relative weeks for a maintainer who is preparing distribution and is not
launching. No calendar date here is a launch date.

**Live launch posts are HOLD** until Gate A in [README.md](README.md).
Public install instructions are HOLD until Gate B. Do not create a Discord
server, a Product Hunt listing, or a social post from this file.

Karma and draft content can happen without pitching Skia. A comment that
includes the repository link is a product post and stays on HOLD.

## Week 1 — read, do not pitch

| Activity | Flag |
|---|---|
| Read recent threads in r/programming and r/webdev. Comment only where you have a genuine technical point. No Skia link, no "I built" line. | Karma allowed |
| Re-read [docs/VALIDATION.md](../VALIDATION.md) claims that must not be made | Required |
| Confirm `src/main.ts` still has `implemented: false` before anyone drafts a demo sentence | Required |
| Show HN, Reddit launch, Product Hunt | HOLD |

## Week 2 — drafts stay in git

| Activity | Flag |
|---|---|
| Edit [devto-outlines.md](devto-outlines.md). Article 1 may be drafted as a problem essay with no install block | Draft in repo |
| Publish any Dev.to article that shows a review command | HOLD |
| Leave [launch-posts.md](launch-posts.md) marked DRAFT / DO NOT POST | Required |
| Coordinated 48-hour burst | HOLD |

## Week 3 — channel prep without a listing

| Activity | Flag |
|---|---|
| Skim Show HN title guidance. Keep the title in the draft file: job, then audience | Draft only |
| Product Hunt: optional account warming by voting and commenting on other products | No Skia listing. HOLD |
| Write a Homebrew or curl snippet "for later" | HOLD. Do not invent commands |
| Discord, star goal, or a social-preview claim of traction | Out of scope |

## Week 4 — proof, not polish

| Activity | Flag |
|---|---|
| Compare [examples/](../../examples/README.md) with the README. Both must say intended UX, not live CLI output | Required |
| List proof gaps in one place: no benchmark, no captured transcript, no tester quotes | Required |
| Record a GIF of `skia review` | HOLD until Gate A. A GIF of the foundation tests is easy to misread; skip it |
| Tag a release or `npm publish` | HOLD until Gate B and OD-1 |

## Week 5 — contributor surface

| Activity | Flag |
|---|---|
| Point newcomers at [docs/GETTING_STARTED.md](../GETTING_STARTED.md) | Allowed |
| Label a good first issue only if it is a real documentation, fixture, or foundation task | Allowed |
| Promise a Cursor rule, Claude plugin, Codex skill, or GitHub Action in that issue | HOLD |
| CI review-comment bot | Out of scope for the current plan |

## Week 6 — re-check gates

| Activity | Flag |
|---|---|
| Write down whether Gate A is met. If the shell is still unimplemented, reset the launch week | Required |
| If Gate A is met, run the demo on a clean checkout and paste the command plus the date into the launch draft | Only then |
| If Gate B is unmet, the post still has no npm, brew, or curl command | Required |
| Show HN, Reddit, Product Hunt, Dev.to launch article | HOLD while either gate fails |

## Launch week — not scheduled

| Activity | Flag |
|---|---|
| Show HN and one relevant Reddit post on the same day, then respond to comments | HOLD until Gate A |
| Product Hunt the next day | HOLD. A cold listing is optional even after Gate A; the draft stays unpublished until the maintainer decides |
| Dev.to walkthrough | HOLD until the figures match a real run or are still visibly labeled intended UX |
| X/Twitter thread as a growth engine | Not a plan. The strategy notes treat it as a short-lived amplifier |
| Star-count target | Do not use stars as the success metric |

## While the gates are closed

Work that still moves the repository:

- keep the Pages site and README aligned with `implemented: false`
- extend synthetic fixtures for coverage states
- tighten a foundation test that already has a contract

Work that waits:

- public launch posts
- npm publish
- editor and Actions adapters
- any badge for downloads, stars, Homebrew, or a missing GitHub Action
