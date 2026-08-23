# Repository guidance

This repository contains Aayush Garg's personal technical website at aayushgarg.dev. The site is authored in Quarto and published to GitHub Pages from the `master` branch by `.github/workflows/quarto-publish.yml`.

## Project structure

The main Quarto configuration is `_quarto.yml`. Top level pages include `index.qmd`, `about.qmd`, `projects.qmd`, `publications.qmd`, `blog/index.qmd`, and `india-weather.qmd`.

Blog posts live in `posts/`. New posts use `posts/YYYY-MM-DD-title/index.qmd`, with images in `static/img/blog-YYYY-MM-DD/`. Project pages live in `pages/`. Browser based utilities live in `tools/`, with the catalog in `tools/index.qmd`. Shared styles are in `styles.css` and `theme-dark.scss`. Static assets live in `static/`.

## Development commands

Use the installed Quarto CLI from the repository root:

```bash
quarto preview
quarto render
quarto render posts/YYYY-MM-DD-title/index.qmd
quarto render tools/index.qmd
```

The generated `_site/` directory is not tracked. Quarto rendering uses frozen execution for post content, so do not assume code cells will run during every render.

The weather Worker has its own Node project:

```bash
cd worker
npm install
npm run dev
npm run deploy
npm run tail
npm run trigger
```

The root weather scripts are plain Node ESM programs used by GitHub Actions. They fetch live and daily weather data, then write files for the orphan `data` branch.

## Deployment and data flows

Pushes to `master` publish the Quarto site to `gh-pages`. The workflow injects the `MAPBOX_TOKEN` secret into the generated weather JavaScript after rendering. Never put tokens in source files.

The Cloudflare Worker in `worker/` owns the fifteen minute live weather refresh. It writes `weather.json` and `history-*.json` to the orphan `data` branch. `.github/workflows/india-weather-daily.yml` runs daily at 02:00 IST and owns `daily-*.json`. `.github/workflows/india-weather-data.yml` is a manual fallback for the live refresh. Each publisher carries forward the other publisher's files before force updating `data`.

The published weather page reads data from `https://raw.githubusercontent.com/garg-aayush/garg-aayush.github.io/data/` and falls back to the sample files under `static/india-weather/` when remote data is unavailable.

## Git workflow

Do not commit directly to `master` for normal site changes. Use a descriptive feature branch for general work, `blog-posts` for blog content, and `tools` for browser utilities. Read the relevant rules in `.claude/rules/` before changing posts or tools.

Keep commits focused and use short present tense messages that explain why the change was made. After review, push the branch and open a pull request to `master`. Do not add a test plan to a pull request unless requested.

This checkout uses direnv. `.envrc` selects the personal GitHub CLI profile and exports the commit identity `Aayush Garg <aayushgargiitr@gmail.com>`. The `origin` remote uses the `github-personal` SSH alias, so pushes use the personal SSH key. Do not commit `.envrc` or credentials.

## Content conventions

Use the existing post metadata fields: `title`, `tags`, `categories`, `date`, `permalink`, and `description`. Use an existing broad category when possible. Add a new category only when it fits at least two posts.

Keep `TODO.md` updated when shipping a change that intentionally leaves a useful improvement for later. Preserve the existing site design, dark theme, accessibility, and responsive behavior unless the task calls for a deliberate change.

## Secrets and safety

`MAPBOX_TOKEN` is a GitHub Actions secret. `WAQI_TOKEN`, `GITHUB_TOKEN`, and `TRIGGER_SECRET` are Cloudflare Worker secrets. Local Mapbox development uses `localStorage.iwMapboxToken`. Never place any of these values in source, commits, logs, or documentation.

Before changing weather data ownership, branch publishing, force updates, token handling, or deployment workflows, inspect both publishers and verify that the other publisher's files are still carried forward.
