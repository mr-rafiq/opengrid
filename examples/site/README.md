# OpenGrid GitHub Pages site

The site uses React/Vite, safe Markdown rendering and static prerendering from the repository documentation. Hosting is GitHub Pages at `/opengrid/`; it does not use another hosting service or publish npm packages.

```sh
npm ci
npm run build:pages
npm run test:site
```

`dist/pages` is the complete deployable artifact: SSR landing, 30 documentation directories, `/demo/`, assets/media, `404.html`, sitemap and notices. Each documentation URL has its own HTML file; direct links need no SPA rewrite. Markdown links target generated docs routes, GitHub source files or copied images. Invalid/missing/unsafe source links fail the build. Markdown HTML is disabled.

`npm run dev:site` runs the source preview. For the real production prefix and full demo, build then run `node scripts/serve-pages.mjs --port 4174` and visit `http://127.0.0.1:4174/opengrid/`.

The separate site Playwright configuration tests the built artifact. Set `SITE_URL=https://mr-rafiq.github.io/opengrid/` to test a deployed site without starting the local server. The local-only exhaustive artifact audit is skipped in that mode. Browser tests cover keyboard/mobile navigation, code copy, actual grid editing, hosted demo, direct routes, link resolution, runtime/hydration errors and serious/critical axe findings. They do not establish screen-reader conformance.

The build script uses Vite's JS API, not shell-generated commands. It prerenders the site, then builds the existing portfolio example with base `/opengrid/demo/`. Parent CI owns Pages settings/deployment. Do not deploy an unverified artifact or advertise unpublished package names as registry installs.
