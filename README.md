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
- `static/fonts/`: the self-hosted Source Serif 4 variable WOFF2 (Latin subset, weight axis, from `@fontsource-variable/source-serif-4` 5.3.1), `fonts.css` with its `@font-face` rule, and the SIL Open Font License in `OFL.txt`. It is the heading font in browsers without `ui-serif` (Safari uses Apple's New York); body text uses the system sans stack and code the system mono stack, with no web font for either.
- `tools/common.css`: shared presentation for image tools that use the same layout and controls.
- `styles.css`: global base for every Quarto page (type, links, navbar, footer, focus, search, code, and the shared `.ui-label`, `.sec-head`, `.btn-solid`, `.link-arrow`, `.title-link`, `.live-dot`, `.work-rows`, `.timeline` and `.contact` classes).
- `static/css/home.css`, `static/css/article.css`, `static/css/pages.css`: homepage and blog listing, article, and about, publications, projects and tools catalog rules. The `.timeline` markup is shared: the type is in `styles.css`, the homepage Path lays the stages out as dotted columns in `home.css`, and the About experience as a compact list in `pages.css`.
- Page body classes: each page sets `body-classes` in its front matter and its CSS is scoped to that class. `home` is the homepage and `writing` the Writing index (both in `home.css`), `pg` is Work, About, Publications, the Tools catalog and the weather page (`pages.css`), and `article-page` is every post (`article.css`, set once in `posts/_metadata.yml`).
- `_contact.qmd`: the Contact section, included by `index.qmd` and `about.qmd`. Quarto does not render underscore files.
- `_templates/`: EJS listing templates that turn the lists in a page's front matter, and the post listings, into markup. They hold markup and no page copy. Quarto does not render underscore paths.
- `_filters/build-month.lua`: the small Pandoc filter that `index.qmd` loads in its front matter. It fills the empty `[]{.build-month}` span with the month and year of the build, for example "October 2026", at render time, in UTC.
- `_partials/title-block.html` and `_filters/article.lua`: the article header and the Pandoc filter for posts, both wired in through `posts/_metadata.yml`. The filter computes the reading time with Quarto's own listing formula so the header matches the post rows, counts the sections, adds the contents list for phones and appends the "All writing" link. Quarto adds the references and footnotes after every filter has run, so the post-render step `scripts/place-article-end.mjs` moves that link behind them on posts that have them (check it with `node --test scripts/place-article-end.test.mjs`). The step does not run under `quarto preview`, where the link stays before the footnotes.
- `static/js/tools-catalog.js`: adds the filter box and the Details buttons to the tools catalog. Without it every tool description stays visible.
- `theme-dark.scss`: Bootstrap compile-time theme settings.
- `static/js/site.js`: the only site-wide script, loaded from `include-after-body` in `_quarto.yml`.
- `static/`: images and other static assets, including weather page assets and fallback data.
- `worker/`: separate Node project for the Cloudflare weather Worker.

Quarto copies the standalone tool HTML files, `tools/analytics.js`, `tools/file-utils.js`, `tools/common.css`, `static/`, and `CNAME` through the `resources` list in `_quarto.yml`. Tool HTML does not pass through Quarto rendering or automatically inherit the Quarto theme. When adding shared tool assets, include them in the copied resources and preserve direct URLs such as `/tools/image-converter.html`.

Quarto pages load, in order, `static/fonts/fonts.css`, `static/design-tokens.css`, `styles.css`, `static/css/home.css`, `static/css/article.css`, and `static/css/pages.css`. Every stylesheet loads on every page, so page rules stay scoped by class. `_quarto.yml` also preloads only the Source Serif 4 file from every Quarto page and loads `static/js/site.js`, which adds the skip link and honors reduced motion for Quarto's scripted smooth scrolling. The serif is self-hosted, so `theme-dark.scss` turns off the Google Fonts import that the cosmo theme would otherwise add.

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

## Updating content

Every visible word is text in a `.qmd` file or in `_quarto.yml`, so no HTML is needed. Repeated items live in lists at the top of the page's file, and the templates in `_templates/` turn them into markup. Run `quarto preview` while editing to see the result.

- **Homepage (`index.qmd`)**: the hero text, the section labels and the Now box header are Markdown in the body. The date label next to "Now" fills in automatically: `[]{.build-month}` becomes the month and year of the latest build, and the site is rebuilt on every push to `master`, so leave the span empty. The hero is the portrait, the name, the role line, the statement, the lede and the two actions, with the Now box beside them. To change the photo, replace `static/img/aayush-avatar.jpg`, keeping it square and around 192 px (about 25 KB). The browser tab icon is `static/img/favicon.png`, a 64 px square, set by `favicon` in `_quarto.yml`. The Now rows (`label`, `text`, `sub`, `href`, and `live: true` for the green status dot) are a list at the top of the file, and the Latest post row is added automatically after the first row. The career path stages (`dates`, `title`, `description`, and `badge`, whose text shows as a pill, to mark the current stage) and the Built rows (`title`, `href`, `description`) are lists too. `max-items` on `blog-listings` sets how many recent posts show.
- **Writing index (`blog/index.qmd`)**: the rows and the category chips are generated from the posts, so a new post or a new category shows up on its own.
- **Posts**: written as before. The interface words (`toc-title`, `back-link-text`, `byline`) are in `posts/_metadata.yml`. The filter computes the reading time and the section count.
- **Work (`projects.qmd`)**: the live items, the open source projects and the gists are lists with `title`, `href`, `description` and optional `list` and `note`. The order written is the order shown.
- **Publications (`publications.qmd`)**: one item per paper with `year` as a string, `title`, `subtitle` for the authors (wrap the author's own name in `**`) and `description` for the venue (add a Markdown link). Keep the newest year first.
- **About (`about.qmd`)**: the intro is Markdown. The roles are a list with `dates`, `title`, `role`, `description` and an optional `href` that links the title.
- **Tools catalog (`tools/index.qmd`)**: each tool is a `.tool-item` entry under its category heading; copy a neighbouring entry. The conventions are in [.claude/rules/tools-design.md](.claude/rules/tools-design.md).
- **Contact**: the email and the LinkedIn and GitHub links are in `_contact.qmd`, which the homepage and About both include with `{{< include _contact.qmd >}}`, so edit them once there. The underscore keeps Quarto from rendering it as a page.
- **Navigation and footer**: `_quarto.yml`.

Section headers are written the same way on every page, as `## [Label [link text](url)]{.sec-head} {.no-anchor}`, a serif heading in sentence case with the link, if any, at the right edge. Leave out the link part when a header has no link.

A link inside a sentence needs no class. Add `{.title-link}` to a Markdown link whose text is the name of an item in a list or row, such as a tool in the catalog (`[Image Resizer](image-resizer.html){.tool-link .title-link}`), and it gets a small arrow that points ↗ when the link leaves the site and → when it stays on it. The link in a section header and `{.link-arrow}` links such as "About me" get their arrow without any extra class.

Quarto listing quirks to know when editing these lists:

- Write any `date` field in a list as a quoted string. Dates show as `15 Jul 2026`, set by `date-format` in `posts/_metadata.yml` and on each post listing.
- Lists use `sort: false` to keep the written order.
- Markdown works in `title`, `subtitle` and `description`, but not in custom fields such as `sub`, `text`, `role` or `badge`.

## Local checks

Use Node 24.22.0 and its npm 11.19.1, then run these commands from the repository root. Playwright installs its own pinned Chromium build; system Chrome is not required.

```bash
npm ci --ignore-scripts
npx playwright install chromium
npm run check:secrets
npm run check:posts
npm test
quarto render --clean
npm run check:site
npm run test:browser
```

`check:secrets` scans every tracked file for credential shaped values (Mapbox, GitHub and common API tokens, private keys) and prints only the path, line and kind. `check:posts` validates the six required metadata fields and unique historical permalinks without changing existing routes. `npm test` covers malformed metadata, deliberate missing links and assets, fragment and RSS handling, download helper contracts, and feed identity compatibility. `check:site` parses rendered HTML, CSS, RSS descriptions, and sitemap URLs. It resolves relative, canonical-host, and legacy-host references against actual output files, checks HTML fragments, and treats RSS GUIDs as opaque identities. Static validation makes no network requests.

The browser suite starts a local server for `_site/` and checks mobile navigation, visible article math, decoded converter/resizer downloads (including dimensions, filenames, and transparency), and that no page scrolls sideways at 390 or 1280 px. The functional checks reject missing local requests and uncaught browser errors. The math check requires the public MathJax CDN used by the rendered article; it fails if math does not typeset. Browser checks suppress analytics requests and do not run weather fetchers or publishers. Chromium installation on Linux may need `npx playwright install --with-deps chromium`, as used in CI.

For another output directory, use `npm run check:site -- path/to/output` and `SITE_OUTPUT_DIR=path/to/output npm run test:browser`. Paths resolve from the project root. Set `SITE_TEST_PORT` if the default local port 4173 is occupied. Test artifacts are written under the ignored `test-results/` directory.

For a visual review, `node scripts/screenshots.mjs [page ...]` saves full-page screenshots at 390 and 1280 px to `test-results/screenshots/`. With no pages it shoots the main pages and the newest post. It also honors `SITE_OUTPUT_DIR`.

`.github/workflows/site-checks.yml` runs these checks for pull requests to `master`, pushes to `master`, and manual runs. Its token has read-only contents permission; it does not publish, inject secrets, or run weather jobs. The publishing workflow remains separate.

The git hooks in `.agent_hooks/git/` refuse commits on `master`, scan staged files for secrets and reject em and en dashes and attribution lines (`Co-Authored-By`, "Generated with") in commit messages. Enable them once per clone with `git config core.hooksPath .agent_hooks/git`. The rest of `.agent_hooks/` holds the coding agent hooks described in [AGENTS.md](AGENTS.md).

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
