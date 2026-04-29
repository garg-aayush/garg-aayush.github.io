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
- Two crons feed the orphan `data` branch (force-push, single-commit):
  - **Cloudflare Worker** in `worker/` runs every 15 minutes (Open-Meteo + WAQI live snapshot + 24h trailing window). Cron Triggers fire on schedule, unlike Actions which drifted 30-80 min. Owns `weather.json` and `history-*.json`.
  - `.github/workflows/india-weather-daily.yml` runs once per day at 02:00 IST and rewrites 30-day per-city daily aggregates from Open-Meteo (forecast API + air-quality API). Owns `daily-*.json`.
  - Each writer carries the other's files forward when force-pushing the orphan commit, so they cannot race-clobber. See "Live Data Pages" below.
  - `.github/workflows/india-weather-data.yml` is kept as a `workflow_dispatch`-only fallback — usable from the Actions UI if the Worker is ever benched.

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

## Branching
- **Never commit directly to `master`** -- every change to the codebase (new feature, update, fix, refactor, content) goes on a separate branch with a descriptive name, then is merged via PR
- Blog posts use the `blog-posts` branch (see `.claude/rules/blog-workflow.md`)
- Tools use the `tools` branch (see `.claude/rules/tools-workflow.md`)
- Other site updates (about page, homepage, config, styles) use descriptive feature branches (e.g., `update-about-intro`)
- **Commit each logical change separately.** When a task involves multiple distinct changes (e.g., a navbar rename + new cities + a tooltip plugin + a layout refactor), make a focused commit for each one as it completes -- not one giant commit at the end. Granular commits make progress visible during review and let individual changes be reverted independently if something goes wrong. This applies *within* a single branch/PR too: a single PR can and should contain multiple commits when the change has multiple logical pieces (in that case, use a regular merge, not squash, so the history is preserved -- see "Merge strategy" below)
- After merging a PR, switch back to `master` and pull
- **Comparing approaches**: When evaluating multiple design options (e.g., table vs card layout), implement each in a parallel worktree branch, preview all simultaneously on different ports, then ship the chosen one and discard the rest

## Pull Requests
- After all changes are committed and pushed, raise a PR and merge it to `master`
- Do **not** include a "Test plan" section in PR descriptions unless explicitly asked
- PR body should have a `## Summary` with bullet points and the Claude Code footer
- **Merge strategy**:
  - **Squash merge** (`gh pr merge --squash`) when the change is small / single-purpose -- a typo fix, a one-file tweak, or a few commits that all describe the same logical change
  - **Regular merge** (preserve commit history) when the PR contains multiple distinct logical changes or a long, meaningful commit history that future readers should be able to navigate. Squashing in that case destroys useful structure.

## Conventions
- Blog post dates use `YYYY-MM-DD` prefix format
- **Always create new blog posts** using the directory format: `posts/YYYY-MM-DD-title/index.qmd` (not single `.qmd` files)
- **Blog post images** are stored in `static/img/blog-YYYY-MM-DD/` matching the post date (e.g., post `2026-01-23-expert-iteration` images in `static/img/blog-2026-01-23/`)
- Code execution is frozen (`freeze: true`), rendered outputs are cached, not re-executed on each build
- External links open in new tabs (configured globally in `_quarto.yml`)
- **`TODO.md` at repo root** captures deferred work that isn't blocking but is worth picking up if the relevant area is touched again. Add to it (with context for *why* something was deferred) when shipping a change that consciously leaves an improvement on the table.

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
- `static/india-weather/india-weather.js` — client renderer (Mapbox markers, popups, leaderboard, fitBounds, reset-view control, fixture-fallback fetch, uPlot history charts; 24h = line charts, 7d/30d = min/max bands + mean line for temp & humidity, US-AQI category bars for AQI)
- `static/india-weather/india-weather.css` — page-specific styles, reuses the global CSS variables from `styles.css`
- `static/india-weather/cities.json` — city config (id, name, lat, lon, bbox); read by both fetchers and the client
- `static/india-weather/weather.sample.json` — hand-authored fixture used as a fallback when the remote data branch is unreachable
- `static/india-weather/history-<id>.sample.json` — per-city 24h fallbacks for ?local dev / data-branch outages
- `static/india-weather/daily-<id>.sample.json` — per-city 30-day daily-aggregate fallbacks
- `worker/` — Cloudflare Worker that owns the 15-min live cron. `src/fetch-weather.mjs` is the pure-functions Open-Meteo + WAQI pipeline; `src/github.mjs` is the Git Data API client (reads tree by branch, embeds blob content inline in `POST /git/trees`, parentless commit + force ref-update); `src/index.mjs` wires it together in `scheduled()` and exposes a `/__trigger` endpoint guarded by `TRIGGER_SECRET` for manual runs. Bundles `static/india-weather/cities.json` cross-directory so there's a single source of truth.
- `scripts/fetch-india-weather.mjs` — pure-Node ESM fetcher; was the live cron's body when Actions owned it. Now only used by the fallback workflow if it's manually dispatched.
- `scripts/fetch-india-weather-daily.mjs` — pure-Node ESM daily-aggregate fetcher; rewrites the 30-day window from Open-Meteo each run (no incremental append, missed runs self-heal)
- `.github/workflows/india-weather-data.yml` — `workflow_dispatch`-only fallback (the `schedule:` trigger was removed when the Worker took over). Still writes `weather.json` and `history-*.json` if manually dispatched.
- `.github/workflows/india-weather-daily.yml` — `30 20 * * *` cron (= 02:00 IST) + `workflow_dispatch`; owns `daily-*.json`. Stays on Actions: runs once a day where cron drift is harmless.

### Architecture
- The Worker fires every 15 minutes via Cloudflare Cron Trigger (within seconds of schedule, no drift). On each tick: read the data branch tree by name (one call), pull each `history-*.json` blob, fetch Open-Meteo + WAQI in parallel, append a new point, and write a single parentless commit via `POST /git/trees` with file content inlined — keeping the data branch at exactly one commit and matching the orphan-style push the retired Actions cron used. Daily files are carried forward by SHA so the daily cron is never stomped on. Total subrequest count is ~46/run, deliberately under Cloudflare's free-tier 50 cap.
- The daily cron checks out `master`, runs the daily-aggregate fetcher (Open-Meteo Forecast API + Air Quality API with `past_days=30`, `timezone=Asia/Kolkata`), aggregates hourly data into per-IST-day min/max/mean for temp, humidity, and US AQI, and force-pushes the resulting `daily-*.json` files alongside the preserved `weather.json` + `history-*.json`.
- The Worker and the daily Actions cron each carry the other's files forward by SHA when they push, so neither clobbers the other. They are not in a shared concurrency group (Worker is on Cloudflare, Actions on GitHub) — collision risk is ~0.3 %/day and `force: true` ref updates resolve harmlessly when it does happen.
- The published page reads `weather.json`, `history-<id>.json`, and `daily-<id>.json` from `https://raw.githubusercontent.com/garg-aayush/garg-aayush.github.io/data/`. If a fetch fails, the JS falls back to the bundled `*.sample.json` files. Per-city history files are loaded lazily on city/range selection.
- Visitor count never affects API call volume because all fetching happens server-side on the cron schedule.

### History data model
- `history-<id>.json` holds the 24h trailing window only: `points_24h` at 15-min cadence. Point shape: `{ t: ISO-UTC, temp: °C, humidity: %, aqi: US-AQI, aqi_waqi: CPCB-AQI }`. Both AQI fields are written every run: `aqi` is Open-Meteo CAMS (model-based, US AQI scale) and is backfillable; `aqi_waqi` is the same WAQI/CPCB-station value shown on the live tile, accumulated forward only.
- `daily-<id>.json` holds the last 30 complete IST days as `days: [...]`. Each entry: `{ date: "YYYY-MM-DD", temp_min, temp_max, temp_mean, humidity_min, humidity_max, humidity_mean, aqi_min, aqi_max, aqi_mean }`. The 7d view slices the last 7 days; 30d uses all 30. The in-progress IST day is excluded.
- **24h AQI chart:** prefers `aqi_waqi` (CPCB stations via WAQI) when **both** guards pass: ≥75 % of the rolling 24h window has `aqi_waqi`, AND the most recent point has `aqi_waqi`. The coverage guard kills premature flips during the warm-up; the recency guard kills the case where WAQI was healthy then died mid-day. Either guard failing falls the chart back to `aqi` (CAMS). The chart's caption-source label flips between "(CPCB stations · WAQI)" and "(US AQI · Open-Meteo)" based on which series is being plotted.
- **7d / 30d AQI charts:** still use Open-Meteo CAMS only, because WAQI's historical endpoint is paywalled even with a token. The numbers there are on the US AQI scale and will not always agree with the live CPCB number; this is documented inline on the page.
- 7d / 30d x-axis ticks are *not* uPlot's auto-generated splits. The bars sit at noon IST (06:30 UTC) per day; uPlot's defaults place ticks at midnight UTC, which slips ~6.5h to the left of every bar. `dayAxisConfig(t, days)` overrides `splits` to return our actual per-day timestamps (stride 1 for 7d, stride 5 for 30d). If you change the chart, keep this override or the labels will visibly drift again.
- Map camera is locked to India: `minZoom: 3.8` matches the initial zoom and `maxBounds: [[67, 5.5], [98, 37.5]]` clips panning to roughly the country's bbox. There is also a custom reset-view control (top-right, just below the +/- group) that flies back to `[80, 22.5]` zoom 3.8 and closes any open marker popup.
- 7d / 30d AQI bars are colored by the day's mean US AQI on the standard EPA category scale (Good / Moderate / USG / Unhealthy / Very Unhealthy / Hazardous). Temp and humidity for those views render as a min/max band with a daily-mean line on top.
- No bootstrap workflow is required: each daily cron run rebuilds the entire 30-day window from Open-Meteo, so missed runs self-heal automatically.

### Token handling
- **No tokens in source, ever.** `MAPBOX_TOKEN` lives as a GitHub repo Secret; `WAQI_TOKEN` and `GITHUB_TOKEN` (a fine-grained PAT scoped to this repo, Contents:Write) live as Cloudflare Worker secrets set via `wrangler secret put`. `TRIGGER_SECRET` is also a Worker secret guarding the manual `/__trigger` endpoint.
- `WAQI_TOKEN` is consumed inside the Worker only; never reaches the client. The fallback Actions workflow still reads it from GitHub Secrets if manually dispatched.
- `MAPBOX_TOKEN` must reach the client to render the map. The repo source has only a `__MAPBOX_TOKEN__` placeholder in `india-weather.js`. The publish workflow's `sed` step replaces it after `quarto render` and before pushing to `gh-pages`. Local dev falls back to `localStorage.iwMapboxToken` so the token never touches a shell history or dotfile either.
- Mapbox URL allowlist on the token: `aayushgarg.dev`, `garg-aayush.github.io`, `localhost`. Bare hostnames only; Mapbox does not accept wildcards or path suffixes.

### Known caveats
- **`raw.githubusercontent.com` Fastly cache.** Responses are cached for ~5 minutes, and Fastly does NOT vary the cache by query string. The current Refresh button cache-busts with `?t=Date.now()` but Fastly ignores it; the button effectively only re-renders the existing cached payload. Worst-case staleness is therefore cron interval (15 min) plus Fastly TTL (5 min) ≈ 20 min. Acceptable for portfolio purposes; switch to jsDelivr if a tighter SLA is ever needed.
- **Cloudflare Workers free-tier subrequest cap.** 50 subrequests per Worker invocation. We sit at ~46 (2 Open-Meteo + 20 WAQI + 1 tree read + 20 history blob reads + 3 GitHub writes). Adding cities costs 2 each; we hit the cap at 22 cities. Mitigation paths if it ever bites: Workers Paid ($5/mo, 1000-subrequest cap), or move history reads into Cloudflare KV (one batched read replaces 20 GitHub blob reads).
- **WAQI dominant pollutant is dropped under the Worker.** The popup's "Dominant: PM2.5" line stays blank. Reinstating it costs +20 subrequests (one WAQI feed call per city) and would push us over the free-tier cap; revisit when/if we go to Workers Paid.
- **GitHub secret scanning.** Push protection flags any `pk.*` Mapbox token landing in any branch (including `gh-pages`). The first push after rotating the Mapbox token will be blocked once and require a click-through unblock URL. Pasting a `pk.*` directly into source instead of the placeholder will be permanently blocked.
- **Mapbox token type.** Use `pk.*` (public, scoped read-only). Never put an `sk.*` token anywhere near the client.
