# Skia website

Astro and Starlight site for GitHub Pages at <https://shifat7.github.io/skia/>.

The site describes the Phase 1 foundation and the intended review experience.
It does not claim a runnable `skia review` command or a published npm package.
Product design documents stay in the repository `docs/` directory. This site
does not live there.

## Build

From `website/`, with Node.js 22 or newer:

```sh
npm ci
npm run build
```

`astro.config.mjs` sets `site` to `https://shifat7.github.io` and `base` to
`/skia`. Output is `website/dist/`, which is gitignored.

## Deploy

`.github/workflows/pages.yml` builds this directory with `withastro/action`
and deploys it with `actions/deploy-pages` on pushes to `main`.

GitHub still has to use Actions as the Pages source:

1. Open the repository **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main`, or run the **Deploy GitHub Pages** workflow manually.

Until that setting is on, <https://shifat7.github.io/skia/> will not show
this site. Do not point Pages at a `/docs` folder or a `gh-pages` branch.
