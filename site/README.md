# Skia marketing site

Static site for GitHub Pages at <https://shifat7.github.io/skia/>.

The site describes the Phase 1 foundation and the intended review experience.
It does not claim a runnable `skia review` command or a published npm package.

## Build

From `site/`, with Node.js 22 or newer:

```sh
npm ci
npm run build
```

Vite uses base path `/skia/` so project Pages can serve the built files.
Output is `site/dist/`, which is gitignored.

## Deploy

`.github/workflows/pages.yml` builds this directory and deploys it with
`actions/upload-pages-artifact` and `actions/deploy-pages` on pushes to
`main`.

GitHub still has to use Actions as the Pages source:

1. Open the repository **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main`, or run the **Deploy GitHub Pages** workflow manually.

Until that setting is on, <https://shifat7.github.io/skia/> will not show
this site.
