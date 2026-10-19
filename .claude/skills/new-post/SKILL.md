---
name: new-post
description: Start, draft and finish a blog post on aayushgarg.dev. Load when asked to write, scaffold or edit a post under posts/: branch, folder and image layout, front matter, figures, and the render and checks before Aayush reads it.
argument-hint: "[title or topic]"
---

# New post

`.claude/rules/blog-writing-style.md` loads with any file under `posts/`; follow it.

## Start

- Work on `blog-posts`, level with `master`: `git fetch origin`, `git switch blog-posts` (or `git switch -c blog-posts --track origin/blog-posts`), `git merge --ff-only origin/master`. If it holds commits that are not on `master`, stop and ask.
- Create `posts/YYYY-MM-DD-slug/index.qmd` (publish date, short lowercase slug) and `static/img/blog-YYYY-MM-DD/` for its images.

## Front matter

Copy the shape of the newest post:

```yaml
---
title: "Kalman Filters and Smoothing for Time-Series Data"
tags: ["Kalman Filter", "State-Space Models", "Time Series"]
categories: [Time Series]
mathjax: true
description: "One or two sentences for the post rows, RSS and link previews"
date: 2026-07-15
permalink: /2026-07-15-kalman-filters-time-series/
---
```

- `title`, `tags`, `categories`, `date`, `permalink` and `description` are required, and permalinks are unique (`npm run check:posts`). The permalink is `/<folder name>/`. Add `mathjax: true` only when the post has math.
- Reuse a category: `grep -h '^categories:' posts/*/index.qmd posts/*.qmd | sort | uniq -c`. A new one needs at least two posts that fit it.
- The kicker, byline, reading time, section count, phone contents and "All writing" link come from `_partials/title-block.html` and `_filters/article.lua`. Do not write them in the post.

## Body

- `##` headings build the contents rail, so keep them short.
- Code is plain fenced blocks (` ```python `). Executable `{python}` cells would run in CI without their dependencies; do not add them.
- Images use absolute paths, `![Caption](/static/img/blog-YYYY-MM-DD/name.jpg)`, with `{width=75%}` when a screenshot is small. Photos and screenshots are JPEG (the `basic-image-editing` skill, or `sips -s format jpeg -s formatOptions 85 in.png --out out.jpg`); diagrams are SVG. Draw figures for the dark page: background `#161618` and text `#DADADF`, the `--bg-body` and `--text-content` values in `static/design-tokens.css`.

## Before Aayush reads it

- `quarto render posts/YYYY-MM-DD-slug/index.qmd` and `npm run check:posts`, then open the rendered page at phone and desktop width (`node scripts/screenshots.mjs posts/YYYY-MM-DD-slug/`).
- Start `quarto preview` for him. Post-render steps do not run there, so the "All writing" link shows above the footnotes; `quarto render` places it after them.
- Commit on `blog-posts` at checkpoints. Publishing goes through the `ship` skill, only after he has read the post and asked.
