# Personal website

Source for [aayushgarg.dev](https://aayushgarg.dev/), built with [Quarto](https://quarto.org/) and published to GitHub Pages. The site was originally based on Beautiful Jekyll; Ruby, Bundler, Jekyll, and Docker are no longer part of the build.

## Local development

Install [Quarto 1.10.18](https://github.com/quarto-dev/quarto-cli/releases/tag/v1.10.18), matching the version pinned in the publishing workflow. For site maintenance, use [Node 24.22.0 LTS](https://nodejs.org/en/blog/release/v24.22.0), pinned in `.node-version`; select that version with your Node version manager. These pins apply to site maintenance and do not change the separate Worker toolchain. Run these commands from the repository root:

```bash
quarto preview
quarto render
```

`quarto preview` starts the development server. `quarto render` builds the site into the untracked `_site/` directory. The current site does not require a root Node package installation. A full render with Quarto 1.10.18 succeeds without additional execution dependencies. Posts inherit `execute.freeze: true` from `posts/_metadata.yml`; if you add executable cells, verify their dependencies in a clean checkout rather than relying on local cached results.

To render one page or the tool catalog:

```bash
quarto render posts/2026-07-15-kalman-filters-time-series/index.qmd
quarto render tools/index.qmd
```

## Source and styling boundaries

- `_quarto.yml`: render inputs, navigation, website metadata, theme, and copied resources.
- Top-level `.qmd` files and `blog/index.qmd`: main pages and blog listings.
- `posts/`: technical articles, including older single-file posts and newer dated directories.
- `pages/`: project pages.
- `tools/index.qmd`: browser tool catalog.
- `tools/*.html`: standalone browser tools with their own markup, styles, and behavior.
- `tools/analytics.js`: shared analytics loader for standalone tools.
- `styles.css` and `theme-dark.scss`: Quarto page styles and Bootstrap theme settings.
- `static/`: images and other static assets, including weather page assets and fallback data.
- `worker/`: separate Node project for the Cloudflare weather Worker.

Quarto copies the standalone tool HTML files, `tools/analytics.js`, `static/`, and `CNAME` through the `resources` list in `_quarto.yml`. Tool HTML does not pass through Quarto rendering or automatically inherit the Quarto theme. When adding shared tool assets, include them in the copied resources and preserve direct URLs such as `/tools/image-converter.html`.

Keep site layout and Bootstrap settings in the Quarto styles, common tool presentation in explicitly shared browser assets, and each tool's processing and state close to that tool. Shared code should cover repeated behavior with matching semantics, such as file formatting or downloads, while preserving each tool's input limits, output formats, transparency handling, and interactions. The browser tools process their inputs locally.

Browser CDN dependencies use exact versions in the HTML and are listed in [.claude/rules/tools-catalog.md](.claude/rules/tools-catalog.md). When updating a dependency, check its browser bundle URL and exercise the affected tool, including Markdown highlighting and math rendering. Quarto supplies its own generated page libraries separately.

Both `index.qmd` and `blog/index.qmd` generate RSS feeds. Existing post `permalink` metadata is historical and does not determine Quarto's rendered paths; inspect rendered links and feed item identities before changing domain or route settings.

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
