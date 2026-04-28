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
- Two cron workflows feed the orphan `data` branch (force-push, single-commit):
  - `.github/workflows/india-weather-data.yml` runs every 15 minutes (Open-Meteo + WAQI live snapshot + 24h trailing window).
  - `.github/workflows/india-weather-daily.yml` runs once per day at 02:00 IST and rewrites 30-day per-city daily aggregates from Open-Meteo (forecast API + air-quality API).
  - Both workflows share the concurrency group `india-weather-data-publish` and each carries forward the other's files when force-pushing, so they cannot race-clobber each other. See "Live Data Pages" below.

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
- `static/india-weather/india-weather.js` — client renderer (Mapbox markers, popups, leaderboard, fitBounds, fixture-fallback fetch, uPlot history charts; 24h = line charts, 7d/30d = min/max bands + mean line for temp & humidity, US-AQI category bars for AQI)
- `static/india-weather/india-weather.css` — page-specific styles, reuses the global CSS variables from `styles.css`
- `static/india-weather/cities.json` — city config (id, name, lat, lon, bbox); read by both fetchers and the client
- `static/india-weather/weather.sample.json` — hand-authored fixture used as a fallback when the remote data branch is unreachable
- `static/india-weather/history-<id>.sample.json` — per-city 24h fallbacks for ?local dev / data-branch outages
- `static/india-weather/daily-<id>.sample.json` — per-city 30-day daily-aggregate fallbacks
- `scripts/fetch-india-weather.mjs` — pure-Node ESM fetcher (no deps, uses built-in `fetch` and `AbortController`); writes the live `weather.json` and a 24h-only rolling `history-<id>.json` per city when given `--history-in` / `--history-out`
- `scripts/fetch-india-weather-daily.mjs` — pure-Node ESM daily-aggregate fetcher; rewrites the 30-day window from Open-Meteo each run (no incremental append, missed runs self-heal)
- `.github/workflows/india-weather-data.yml` — `*/15` cron + `workflow_dispatch`; owns `weather.json` and `history-*.json`
- `.github/workflows/india-weather-daily.yml` — `30 20 * * *` cron (= 02:00 IST) + `workflow_dispatch`; owns `daily-*.json`

### Architecture
- The 15-min cron checks out `master`, runs the fetcher (which calls Open-Meteo for weather and WAQI for AQI), updates the rolling 24h history, then publishes the resulting `weather.json` + `history-*.json` as a single-commit force-push to the orphan `data` branch — preserving the daily cron's `daily-*.json` files when it does so.
- The daily cron checks out `master`, runs the daily-aggregate fetcher (Open-Meteo Forecast API + Air Quality API with `past_days=30`, `timezone=Asia/Kolkata`), aggregates hourly data into per-IST-day min/max/mean for temp, humidity, and US AQI, and force-pushes the resulting `daily-*.json` files alongside the preserved `weather.json` + `history-*.json`.
- Both workflows share concurrency group `india-weather-data-publish` so they serialize and never race-clobber the orphan force-push.
- The published page reads `weather.json`, `history-<id>.json`, and `daily-<id>.json` from `https://raw.githubusercontent.com/garg-aayush/garg-aayush.github.io/data/`. If a fetch fails, the JS falls back to the bundled `*.sample.json` files. Per-city history files are loaded lazily on city/range selection.
- Visitor count never affects API call volume because all fetching happens server-side on the cron schedule.

### History data model
- `history-<id>.json` holds the 24h trailing window only: `points_24h` at 15-min cadence. Point shape: `{ t: ISO-UTC, temp: °C, humidity: %, aqi: US-AQI }`.
- `daily-<id>.json` holds the last 30 complete IST days as `days: [...]`. Each entry: `{ date: "YYYY-MM-DD", temp_min, temp_max, temp_mean, humidity_min, humidity_max, humidity_mean, aqi_min, aqi_max, aqi_mean }`. The 7d view slices the last 7 days; 30d uses all 30. The in-progress IST day is excluded.
- The chart's AQI series uses Open-Meteo Air Quality (US AQI scale) because WAQI's historical endpoint is paywalled even with a token. The live tile / leaderboard still shows WAQI's CPCB-station reading. The two AQI numbers are on different scales and will not match exactly; this is documented inline on the page.
- 7d / 30d AQI bars are colored by the day's mean US AQI on the standard EPA category scale (Good / Moderate / USG / Unhealthy / Very Unhealthy / Hazardous). Temp and humidity for those views render as a min/max band with a daily-mean line on top.
- No bootstrap workflow is required: each daily cron run rebuilds the entire 30-day window from Open-Meteo, so missed runs self-heal automatically.

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
