# Personal website

Source for [aayushgarg.dev](https://aayushgarg.dev/), built with [Quarto](https://quarto.org/) and published to GitHub Pages. The site was originally based on Beautiful Jekyll; Ruby, Bundler, Jekyll, and Docker are no longer part of the build.

## Local development

Install [Quarto 1.10.18](https://github.com/quarto-dev/quarto-cli/releases/tag/v1.10.18), matching the version pinned in the publishing workflow. For site maintenance, use [Node 24.22.0 LTS](https://nodejs.org/en/blog/release/v24.22.0), pinned in `.node-version`; select that version with your Node version manager. These pins apply to site maintenance and do not change the separate Worker toolchain. Run these commands from the repository root:

```bash
quarto preview
quarto render
```

`quarto preview` starts the development server. `quarto render` builds the site into the untracked `_site/` directory and runs the RSS compatibility script using Node from `PATH`. Rendering does not use the root npm dependencies; the validation commands below use their locked installs. A full render with Quarto 1.10.18 succeeds without additional execution dependencies. Posts inherit `execute.freeze: true` from `posts/_metadata.yml`; if you add executable cells, verify their dependencies in a clean checkout rather than relying on local cached results.

To render one page or the tool catalog:

```bash
quarto render posts/2026-07-15-kalman-filters-time-series/index.qmd
quarto render tools/index.qmd
```

## Source and styling boundaries

- `_quarto.yml`: render inputs, navigation, footer, website metadata, theme, the ordered CSS list, the font preload, and copied resources.
- Top-level `.qmd` files and `blog/index.qmd`: main pages and blog listings.
- `posts/`: technical articles, including older single-file posts and newer dated directories.
- `pages/`: project pages.
- `tools/index.qmd`: browser tool catalog.
- `tools/*.html`: standalone browser tools with their own markup, styles, and behavior.
- `tools/analytics.js`: shared analytics loader for standalone tools.
- `tools/file-utils.js`: matching file labels and blob download behavior shared by the image tools and SVG viewer.
- `static/design-tokens.css`: the single source for colors (including code syntax colors), font stacks, type, spacing and radius scales, component sizes, and site color aliases.
- `static/fonts/`: self-hosted Geist and Geist Mono variable WOFF2 files (Latin subset, from `@fontsource-variable` 5.3.0), `fonts.css` with their `@font-face` rules, and the SIL Open Font License in `OFL.txt`.
- `tools/common.css`: shared presentation for image tools that use the same layout and controls.
- `styles.css`: global base for every Quarto page (type, links, navbar, footer, focus, search, code, and the shared `.ui-label`, `.sec-head`, `.btn-solid`, `.link-arrow` and `.live-dot` classes).
- `static/css/home.css`, `static/css/article.css`, `static/css/pages.css`: homepage and blog listing, article, and about, publications, projects and tools catalog rules.
- `theme-dark.scss`: Bootstrap compile-time theme settings.
- `static/js/site.js`: the only site-wide script, loaded from `include-after-body` in `_quarto.yml`.
- `static/`: images and other static assets, including weather page assets and fallback data.
- `worker/`: separate Node project for the Cloudflare weather Worker.

Quarto copies the standalone tool HTML files, `tools/analytics.js`, `tools/file-utils.js`, `tools/common.css`, `static/`, and `CNAME` through the `resources` list in `_quarto.yml`. Tool HTML does not pass through Quarto rendering or automatically inherit the Quarto theme. When adding shared tool assets, include them in the copied resources and preserve direct URLs such as `/tools/image-converter.html`.

Quarto pages load, in order, `static/fonts/fonts.css`, `static/design-tokens.css`, `styles.css`, `static/css/home.css`, `static/css/article.css`, and `static/css/pages.css`. Every stylesheet loads on every page, so page rules stay scoped by class. `_quarto.yml` also preloads only the Geist sans file from every Quarto page and loads `static/js/site.js`, which adds the skip link and honors reduced motion for Quarto's scripted smooth scrolling. Fonts are self-hosted, so `theme-dark.scss` turns off the Google Fonts import that the cosmo theme would otherwise add.

All standalone tools use the same browser palette; syntax, search, and diff tokens remain local to the tools that need them. Tools keep the system font stack through `--font-system` and do not load `fonts.css`. The image converter, resizer, and cropper also load `tools/common.css`, with specialized control styles kept in each HTML file. Other tools retain their own layouts, control styles, and font fallback lists. The common tool stylesheet is loaded only by standalone tools. `theme-dark.scss` remains the Bootstrap compile-time theme: Sass color functions require literal Sass values, so keep its palette and font stacks aligned with the browser tokens when changing the theme. There is no generated token synchronization step.

Styling conventions: add or change a color, font, size, spacing step or radius in `static/design-tokens.css` and reference it with `var()`; the site stylesheets contain no literal colors. Mirror a changed palette value in the `$tok-` block at the top of `theme-dark.scss`, and keep other Sass limited to values derived from that block. Keep selectors at class level, avoid IDs, and use `!important` only where Quarto or Bootstrap leave no other way, with a comment saying what it overrides. Navigation items and social links are defined once in `_quarto.yml`.

Keep site layout and Bootstrap settings in the Quarto styles, common tool presentation in explicitly shared browser assets, and each tool's processing and state close to that tool. Shared code should cover repeated behavior with matching semantics, such as file formatting or downloads, while preserving each tool's input limits, output formats, transparency handling, and interactions. The browser tools process their inputs locally.

`tools/file-utils.js` exposes the `ToolFiles` namespace to its standalone consumers. It formats byte counts, supplies matching image type labels, and starts blob downloads with the caller's exact filename, revoking each download URL after one second. File validation, canvas processing, preview URLs, and application state stay local to each tool. Tools with different MIME label contracts keep those labels local. Run its contract checks with `node --test scripts/file-utils.test.mjs`.

Browser CDN dependencies use exact versions in the HTML and are listed in [.claude/rules/tools-catalog.md](.claude/rules/tools-catalog.md). When updating a dependency, check its browser bundle URL and exercise the affected tool, including Markdown highlighting and math rendering. Quarto supplies its own generated page libraries separately.

Both `index.qmd` and `blog/index.qmd` generate RSS feeds. Existing post `permalink` metadata is historical and does not determine Quarto's rendered paths; inspect rendered links and feed item identities before changing domain or route settings.

`aayushgarg.dev` is the canonical hostname for generated metadata, RSS links, and RSS images. The post-render script `scripts/preserve-feed-guids.mjs` preserves the exact published GUIDs of existing articles in both feeds, marked as opaque identities with `isPermaLink="false"`, so subscribers do not receive them as new articles after the hostname change. `scripts/legacy-feed-guids.json` records the IDs verified in both live feeds before the change, plus older entries verified in the published feeds at commit `6122c37`. Keep this compatibility list fixed for previously published articles; new articles retain Quarto's canonical GUIDs. The script leaves feed links and content unchanged, honors Quarto's output directory, and permits absent feeds during partial renders.

Run the compatibility checks with the pinned Node version:

```bash
node --test scripts/preserve-feed-guids.test.mjs
```

## Local checks

Use Node 24.22.0 and its npm 11.19.1, then run these commands from the repository root. Playwright installs its own pinned Chromium build; system Chrome is not required.

```bash
npm ci --ignore-scripts
npx playwright install chromium
npm run check:posts
npm test
quarto render --clean
npm run check:site
npm run test:browser
```

`check:posts` validates the six required metadata fields and unique historical permalinks without changing existing routes. `npm test` covers malformed metadata, deliberate missing links and assets, fragment and RSS handling, download helper contracts, and feed identity compatibility. `check:site` parses rendered HTML, CSS, RSS descriptions, and sitemap URLs. It resolves relative, canonical-host, and legacy-host references against actual output files, checks HTML fragments, and treats RSS GUIDs as opaque identities. Static validation makes no network requests.

The browser suite starts a local server for `_site/` and checks mobile navigation, visible article math, and decoded converter/resizer downloads, including dimensions, filenames, and transparency. It rejects missing local requests and uncaught browser errors. The math check requires the public MathJax CDN used by the rendered article; it fails if math does not typeset. Browser checks suppress analytics requests and do not run weather fetchers or publishers. Chromium installation on Linux may need `npx playwright install --with-deps chromium`, as used in CI.

For another output directory, use `npm run check:site -- path/to/output` and `SITE_OUTPUT_DIR=path/to/output npm run test:browser`. Paths resolve from the project root. Set `SITE_TEST_PORT` if the default local port 4173 is occupied. Test artifacts are written under the ignored `test-results/` directory.

`.github/workflows/site-checks.yml` runs these checks for pull requests to `master`, pushes to `master`, and manual runs. Its token has read-only contents permission; it does not publish, inject secrets, or run weather jobs. The publishing workflow remains separate.

## Publication and weather data

`.github/workflows/quarto-publish.yml` renders pushes to `master`, injects the Mapbox secret into the generated weather JavaScript, and publishes `_site/` to `gh-pages`. `CNAME` selects `aayushgarg.dev`. Work on a feature branch and review the rendered site before publishing; `_site/` is build output, not source.

Weather data publication is separate from site rendering. The Cloudflare Worker refreshes `weather.json` and `history-*.json` every fifteen minutes. `.github/workflows/india-weather-daily.yml` owns `daily-*.json`, and `.github/workflows/india-weather-data.yml` is the manual live-refresh fallback. Each publisher carries forward the other publisher's files on the orphan `data` branch.

The weather page reads the published data branch and falls back to the sample files under `static/india-weather/` when remote data is unavailable. Site rendering does not run the weather fetchers. Keep weather storage, publisher coordination, and secret handling separate from page and tool maintenance.

For local Worker development, install its dependencies separately:

```bash
cd worker
npm ci
npm run dev
```

Worker commands and dependencies belong to `worker/package.json`. Keep credentials out of source files, commits, and build logs. See [AGENTS.md](AGENTS.md) for repository workflow and data ownership rules, and [TODO.md](TODO.md) for deferred improvements.
