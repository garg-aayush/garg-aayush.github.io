---
name: verify-site
description: Verify a change to aayushgarg.dev before it ships. Load after editing styles, templates, filters, scripts, _quarto.yml, pages, posts or tools, and before the ship skill: which checks fit which change, screenshots at phone and desktop width, and how to report.
---

# Verify site

Run from the repo root with Node 24.22.0 (`.node-version`). Run each check once, after the last edit.

| change | run |
|---|---|
| post or page text | `quarto render <file>`, `npm run check:posts` for posts, screenshots of that page |
| CSS, templates, Lua filters, `_quarto.yml`, scripts, a new page | the full sequence and screenshots |
| a standalone tool in `tools/` | the full sequence, then open the tool from `_site/tools/` at both widths and run its main path once |
| weather page JS or CSS | the full sequence; locally the map needs `localStorage.iwMapboxToken`, never a token in source |
| `.agent_hooks/` or `scripts/*.mjs` | `npm test` |

Full sequence:

```bash
npm ci --ignore-scripts && npx playwright install chromium   # once per checkout
npm run check:secrets && npm run check:posts && npm test
quarto render --clean
npm run check:site && npm run test:browser
```

`test:browser` includes a horizontal overflow test of every page at 390 and 1280 px. `site-checks.yml` runs the same sequence on every PR.

## Screenshots

`node scripts/screenshots.mjs [page ...]` writes full-page PNGs at 390 and 1280 px to `test-results/screenshots/`; with no pages it shoots the main pages and the newest post. Read the images of every page the change touches. Check them against the look in `AGENTS.md`: serif headings, readable contrast, blue only on links, nothing clipped or overlapping, no template tells. For a design change, shoot `master` first from a worktree render (`SITE_OUTPUT_DIR=<its _site> node scripts/screenshots.mjs`) and compare.

## Feeds and routes

When a change touches listings, routes, permalinks or `_quarto.yml` website settings, compare the items, links and GUIDs of `_site/index.xml` and `_site/blog/index.xml` with a render of `master`. They must match apart from intended new posts.

## Report

Each command with its result line and counts, the screenshots you looked at, and anything skipped with the reason. Never weaken a check to make it pass. `quarto render` appends `**/*.quarto_ipynb` to `.gitignore`; leave that line out of commits unless Aayush asks for it.
