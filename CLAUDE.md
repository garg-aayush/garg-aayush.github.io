# CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
Personal technical blog and website for Aayush Garg (aayushgarg.dev), built with **Quarto** and deployed to **GitHub Pages** via GitHub Actions.

## Build & Development Commands
```bash
quarto preview          # Live preview with hot-reload
quarto render           # Full site build (output to _site/)
quarto render posts/    # Render only blog posts
```

## CI/CD
- Pushes to `master` trigger `.github/workflows/quarto-publish.yml`
- Workflow runs `quarto render`, then a `sed` step substitutes any `__MAPBOX_TOKEN__` placeholder in `_site/` from the `MAPBOX_TOKEN` repo secret, then publishes `_site/` to `gh-pages` via `quarto-dev/quarto-actions/publish@v2` with `render: false`
- A separate cron workflow `.github/workflows/india-weather-data.yml` runs every 15 minutes, fetches Open-Meteo + WAQI, and force-pushes a one-commit `weather.json` to an orphan `data` branch. See "Live Data Pages" below.

## Architecture

### Site Configuration
- `_quarto.yml` — Main site config (navbar, theme, format, analytics)
- `theme-dark.scss` — Dark theme SCSS variables (Cosmo base + custom dark palette)
- `styles.css` — Layout and component styles (profile, blog listing, experience grid, projects list, tools list)

### Content
- **Blog posts** in `posts/` — Either `YYYY-MM-DD-title.qmd` (single file) or `YYYY-MM-DD-title/index.qmd` (directory with assets)
- **Static pages** in `pages/` — Project pages (doverlap, jsalt, overlap-aware-sc)
- **Tools** in `tools/` — `index.qmd` (listing page) + standalone `.html` tool files
- **Top-level pages**: `index.qmd` (homepage), `about.qmd`, `projects.qmd`, `publications.qmd`, `blog/index.qmd` (blog listing), `india-weather.qmd` (live map dashboard, see "Live Data Pages")
- **Navbar order**: Home, Blogs, Projects, Tools, India Weather, Publications, About
- **Assets** in `static/` — Images, PDFs, videos, etc.

### Post Metadata
Posts use YAML frontmatter with: `title`, `tags`, `categories`, `date`, `permalink`, `description`, and optionally `mathjax: true` for LaTeX. Post-level defaults are in `posts/_metadata.yml` (freeze execution enabled, code-copy buttons).

- **`tags`** — Granular, descriptive keywords (e.g., `llama.cpp`, `GRPO`, `LoRA`). Used for text search.
- **`categories`** — Broad topic buckets for the blog listing filter pills. Pick 1-2 from the existing set: `RL & Alignment`, `LLM Training`, `Transformers`, `Paper Notes`, `Tools & Infra`, `Local LLMs`, `LLM Evaluation`. Add a new category only if no existing one fits and at least 2 posts would use it.

### Theme
Custom dark theme inspired by Lil'Log. Key colors: background `#1d1e20`, accent `#75A8D9` (cyan). Theme is layered as `[cosmo, theme-dark.scss]` with `styles.css` on top.

## Pull Requests
- Do **not** include a "Test plan" section in PR descriptions unless explicitly asked
- PR body should have a `## Summary` with bullet points and the Claude Code footer

## Branching
- **Never commit directly to `master`** -- always use a feature branch, create a PR, and merge
- Blog posts use the `blog-posts` branch (see `.claude/rules/blog-workflow.md`)
- Tools use the `tools` branch (see `.claude/rules/tools-workflow.md`)
- Other site updates (about page, homepage, config, styles) use descriptive feature branches (e.g., `update-about-intro`)
- After merging a PR, switch back to `master` and pull
- **Comparing approaches**: When evaluating multiple design options (e.g., table vs card layout), implement each in a parallel worktree branch, preview all simultaneously on different ports, then ship the chosen one and discard the rest

## Conventions
- Blog post dates use `YYYY-MM-DD` prefix format
- **Always create new blog posts** using the directory format: `posts/YYYY-MM-DD-title/index.qmd` (not single `.qmd` files)
- **Blog post images** are stored in `static/img/blog-YYYY-MM-DD/` matching the post date (e.g., post `2026-01-23-expert-iteration` images in `static/img/blog-2026-01-23/`)
- Code execution is frozen (`freeze: true`), rendered outputs are cached, not re-executed on each build
- External links open in new tabs (configured globally in `_quarto.yml`)

## Blog Posts

Detailed rules are in `.claude/rules/` and auto-load when working in `posts/`:
- **`.claude/rules/blog-workflow.md`** - branching, image conventions, and commit/PR flow
- **`.claude/rules/blog-writing-style.md`** - tone, formatting, and style preferences

## Tools Section

Browser-based utilities in `tools/` that run entirely client-side. Organized by category in `tools/index.qmd`.

Detailed rules are in `.claude/rules/` and auto-load when working in `tools/`:
- **`.claude/rules/tools-workflow.md`** — how to add, build, and style tools
- **`.claude/rules/tools-catalog.md`** — inventory of all tools with descriptions and CDN dependencies

## Live Data Pages

Pages that fetch data refreshed by a cron workflow rather than at build time. Currently just `india-weather.qmd`, but the pattern is reusable.

### Files (India Weather)
- `india-weather.qmd` — top-level Quarto page; embeds the Mapbox + uPlot CDNs and the page skeleton via raw HTML
- `static/india-weather/india-weather.js` — client renderer (Mapbox markers, popups, leaderboard, fitBounds, fixture-fallback fetch, uPlot history charts)
- `static/india-weather/india-weather.css` — page-specific styles, reuses the global CSS variables from `styles.css`
- `static/india-weather/cities.json` — city config (id, name, lat, lon, bbox); read by both the fetcher and the client
- `static/india-weather/weather.sample.json` — hand-authored fixture used as a fallback when the remote data branch is unreachable
- `static/india-weather/history-<id>.sample.json` — per-city history fallbacks for ?local dev / data-branch outages
- `scripts/fetch-india-weather.mjs` — pure-Node ESM fetcher (no deps, uses built-in `fetch` and `AbortController`); also maintains rolling history files when given `--history-in` / `--history-out`
- `scripts/bootstrap-india-weather-history.mjs` — one-shot 30-day backfill from Open-Meteo + Open-Meteo Air Quality
- `.github/workflows/india-weather-data.yml` — `*/15` cron + `workflow_dispatch`
- `.github/workflows/india-weather-bootstrap.yml` — `workflow_dispatch`-only one-shot history bootstrap (gated behind a "yes" confirm input; re-running overwrites cron-built 15-min ticks with hourly archive points)

### Architecture
- The cron checks out `master`, runs the fetcher (which calls Open-Meteo for weather and WAQI for AQI), then publishes the resulting `weather.json` as a single-commit force-push to an orphan `data` branch.
- The cron also reads the existing `history-<id>.json` files from the `data` branch, appends the latest 15-min tick to `points_24h`, extends `points_7d` (hourly) and `points_30d` (6-hourly) when enough wall-clock time has elapsed, and force-pushes the updated set in the same commit.
- The published page reads `weather.json` from `https://raw.githubusercontent.com/garg-aayush/garg-aayush.github.io/data/weather.json`. If that fetch fails (404, offline), the JS falls back to the bundled `weather.sample.json` so the page never shows a broken state. Per-city `history-<id>.json` files are loaded the same way (lazy, on city selection).
- Visitor count never affects API call volume because all fetching happens server-side on the cron schedule.

### History data model
- Each `history-<id>.json` holds three pre-downsampled views: `points_24h` (15-min, last 24h), `points_7d` (hourly, last 7d), `points_30d` (6-hourly, last 30d). Point shape: `{ t: ISO-UTC, temp: °C, humidity: %, aqi: US-AQI }`.
- The chart's AQI series uses Open-Meteo Air Quality (US AQI scale) because WAQI's historical endpoint is paywalled even with a token. The live tile / leaderboard still shows WAQI's CPCB-station reading. The two AQI numbers are on different scales and will not match exactly; this is documented inline on the page.
- Bootstrap is a one-time-after-merge step: trigger `India Weather History Bootstrap` from the Actions tab with input `confirm: yes`. It backfills 30 days of hourly weather + US AQI from Open-Meteo into the `data` branch alongside `weather.json`. Re-running it discards any 15-min cadence ticks that the cron has accumulated since.

### Token handling
- **No tokens in source, ever.** Both `MAPBOX_TOKEN` and `WAQI_TOKEN` live as GitHub repo Secrets.
- `WAQI_TOKEN` is consumed inside the cron workflow only; never reaches the client.
- `MAPBOX_TOKEN` must reach the client to render the map. The repo source has only a `__MAPBOX_TOKEN__` placeholder in `india-weather.js`. The publish workflow's `sed` step replaces it after `quarto render` and before pushing to `gh-pages`. Local dev falls back to `localStorage.iwMapboxToken` so the token never touches a shell history or dotfile either.
- Mapbox URL allowlist on the token: `aayushgarg.dev`, `garg-aayush.github.io`, `localhost`. Bare hostnames only; Mapbox does not accept wildcards or path suffixes.

### Known caveats
- **GitHub Actions cron drift.** Scheduled runs are best-effort. The very first scheduled tick after a workflow is registered often does not fire for 30 to 60 minutes, and `*/15` runs can be delayed or dropped under load. The page handles this gracefully (the client shows a relative `Updated Nm ago` timestamp from `generated_at`), and `workflow_dispatch` is available for manual force-refresh.
- **`raw.githubusercontent.com` Fastly cache.** Responses are cached for ~5 minutes, and Fastly does NOT vary the cache by query string. The current Refresh button cache-busts with `?t=Date.now()` but Fastly ignores it; the button effectively only re-renders the existing cached payload. Worst-case staleness is therefore cron interval (15 min) plus Fastly TTL (5 min) ≈ 20 min. Acceptable for portfolio purposes; switch to jsDelivr if a tighter SLA is ever needed.
- **GitHub secret scanning.** Push protection flags any `pk.*` Mapbox token landing in any branch (including `gh-pages`). The first push after rotating the Mapbox token will be blocked once and require a click-through unblock URL. Pasting a `pk.*` directly into source instead of the placeholder will be permanently blocked.
- **Mapbox token type.** Use `pk.*` (public, scoped read-only). Never put an `sk.*` token anywhere near the client.
