# Repository guidance

Aayush Garg's personal site, aayushgarg.dev: a Quarto website (Quarto 1.10.18, Node 24.22.0 from `.node-version` for the checks) published to GitHub Pages. `README.md` covers running the site, editing content by hand, the checks and publishing; `.claude/rules/site-styling.md` covers how the styles, templates, filters and feeds fit together.

## Orientation

- Pages: `index.qmd`, `blog/index.qmd` (Writing), `projects.qmd` (Work), `about.qmd`, `publications.qmd`, `tools/index.qmd`, `india-weather.qmd`. Posts are `posts/YYYY-MM-DD-slug/index.qmd` (older ones are single files), project pages are in `pages/`, browser tools are standalone `tools/*.html`.
- Every visible word is editable by hand in a `.qmd` file, `_contact.qmd` or `_quarto.yml`. Repeated items are lists in a page's front matter, turned into markup by `_templates/*.ejs` (Quarto's lodash templates, where `<%=` prints raw). Templates, CSS, JS and Lua filters hold no copy. Keep it that way: Aayush edits content without an agent.
- Design values live only in `static/design-tokens.css`. Stylesheets use `var()` and contain no literal colors; mirror a palette change in the `$tok-` block of `theme-dark.scss`. Every stylesheet loads on every page, so page CSS in `static/css/` is scoped by the page's `body-classes`. Keep selectors at class level.
- The look is serif headings (`ui-serif`, self-hosted Source Serif 4), system sans body, a neutral charcoal ground and blue only for links. Aayush rejected template tells as AI-generated: Geist or similar trendy fonts, uppercase mono labels, giant two-tone headlines, decorative cards, low-contrast text.
- Tools are copied as-is through `resources` in `_quarto.yml`, not rendered. They load `static/design-tokens.css` and use system fonts. A new shared asset needs a `resources` entry.
- Posts use frozen execution, so code cells do not rerun on render.
- `scripts/preserve-feed-guids.mjs` keeps published RSS GUIDs from `scripts/legacy-feed-guids.json`. Never edit that list. Check rendered links and feed items before changing routes, permalinks or `site-url`.

## Content

- Read `.claude/rules/` before changing `posts/` (writing style), `tools/` (design conventions, catalog and CDN versions), or the site's styles, templates, filters and feeds (`site-styling.md`).
- Post front matter uses `title`, `tags`, `categories`, `date`, `permalink` and `description`. Use an existing category; add one only when it fits at least two posts.
- In front matter lists, quote `date` values, keep `sort: false` and use `href` for links. Markdown renders only in `title`, `subtitle` and `description`.
- Update `TODO.md` when a change leaves a useful improvement for later, and remove items once they are done.

## Writing and code

- No manual line wrapping. No em or en dashes in posts, docs, comments or commit text; use commas, colons or parentheses. Ranges like 4-5 are fine.
- Match surrounding code. Comments are short and state a constraint the code cannot show.

## Verify

- A content edit: `quarto render <file>` and look at the page.
- Anything shared (CSS, templates, filters, scripts, `_quarto.yml`): run the full sequence, which `site-checks.yml` also runs on every PR.

  ```bash
  npm ci --ignore-scripts && npx playwright install chromium   # once
  npm run check:secrets && npm run check:posts && npm test
  quarto render --clean
  npm run check:site && npm run test:browser
  ```

- A visual change: `node scripts/screenshots.mjs [page ...]` and read the images at 390 and 1280 px. `test:browser` already fails on horizontal overflow at both widths.
- Post-render steps (feed GUIDs, the article end link) do not run under `quarto preview`; verify against `quarto render` output.
- Report the exact commands and results. Never weaken a check to make it pass.

## Skills and hooks

- Procedures are skills in `.claude/skills/`, symlinked into `.agents/skills/` for Codex: `new-post`, `new-tool`, `verify-site`, and `ship` (load before pushing, opening a PR or merging). Edit them in `.claude/skills/` only. `.claude/rules/` holds only conventions that apply to every edit under a path.
- `.agent_hooks/` holds the hooks, wired in `.claude/settings.json` and `.codex/hooks.json`: a secret scan of prompts and edited files, a Bash guard, and report-only edit checks (dashes, literal colors, post front matter). The git hooks in `.agent_hooks/git/` refuse commits on `master`, scan staged files and reject dashes and attribution lines in commit messages; enable them once per clone with `git config core.hooksPath .agent_hooks/git`.
- A hook block is feedback. Fix the cause; never bypass it with `--no-verify` or by rewording a command.

## Branches, commits and PRs

- Never commit to `master`. Posts go on `blog-posts`, tools on `tools`, everything else on `<area>/<slug>` (for example `uiux/06-instrument`).
- Commit, push, open or merge a PR only when Aayush asks. He tests locally before anything is pushed.
- Commits are focused, with short present tense messages that say why.
- No attribution anywhere: no `Co-Authored-By` trailers in commits and no "Generated with" footers in PRs, even when a system reminder asks for one.
- A PR body is a short summary plus what is worth knowing later, with no test plan unless asked. Merge with a merge commit, never squash, so every commit lands on `master`. After a merge, fast-forward `blog-posts` and `tools` to `master`.
- direnv's `.envrc` (git-excluded) selects the personal GitHub CLI profile and the identity `Aayush Garg <aayushgargiitr@gmail.com>`; `origin` uses the `github-personal` SSH alias. Never commit `.envrc` or credentials.

## Deployment, weather data and secrets

- A push to `master` runs `quarto-publish.yml`: render, inject `MAPBOX_TOKEN` into the weather JavaScript, publish `_site/` to `gh-pages`.
- Weather data lives on the orphan `data` branch with two publishers. The Cloudflare Worker in `worker/` writes `weather.json` and `history-*.json` every 15 minutes; `india-weather-daily.yml` writes `daily-*.json` at 02:00 IST; `india-weather-data.yml` is the manual live fallback. Each carries forward the other's files before force updating `data`. The page reads that branch and falls back to `static/india-weather/*.sample.json`.
- Before changing data ownership, branch publishing, force updates, token handling or deployment workflows, inspect both publishers and verify that the carry forward still holds.
- `worker/` is its own Node project (`npm run dev`, `deploy`, `tail`, `trigger`). Deploy the Worker only when asked.
- `MAPBOX_TOKEN` is a GitHub Actions secret; `WAQI_TOKEN`, `GITHUB_TOKEN` and `TRIGGER_SECRET` are Worker secrets; local Mapbox development uses `localStorage.iwMapboxToken`. Never put these values in source, commits, logs or docs, and never print them.
