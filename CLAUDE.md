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
- Workflow runs `quarto render` then publishes to `gh-pages` branch
- Uses `quarto-dev/quarto-actions/publish@v2`

## Architecture

### Site Configuration
- `_quarto.yml` — Main site config (navbar, theme, format, analytics)
- `theme-dark.scss` — Dark theme SCSS variables (Cosmo base + custom dark palette)
- `styles.css` — Layout and component styles (profile, blog listing, experience grid)

### Content
- **Blog posts** in `posts/` — Either `YYYY-MM-DD-title.qmd` (single file) or `YYYY-MM-DD-title/index.qmd` (directory with assets)
- **Static pages** in `pages/` — Project pages (doverlap, jsalt, overlap-aware-sc)
- **Top-level pages**: `index.qmd` (homepage), `about.qmd`, `publications.qmd`, `resume.qmd`, `blog/index.qmd` (blog listing)
- **Assets** in `static/` — Images, PDFs, videos, etc.

### Post Metadata
Posts use YAML frontmatter with: `title`, `tags`, `date`, `permalink`, `description`, and optionally `mathjax: true` for LaTeX. Post-level defaults are in `posts/_metadata.yml` (freeze execution enabled, code-copy buttons).

### Theme
Custom dark theme inspired by Lil'Log. Key colors: background `#1d1e20`, accent `#75A8D9` (cyan). Theme is layered as `[cosmo, theme-dark.scss]` with `styles.css` on top.

## Conventions
- Blog post dates use `YYYY-MM-DD` prefix format
- **Always create new blog posts** using the directory format: `posts/YYYY-MM-DD-title/index.qmd` (not single `.qmd` files)
- **Blog post images** are stored in `static/img/blog-YYYY-MM-DD/` matching the post date (e.g., post `2026-01-23-expert-iteration` → images in `static/img/blog-2026-01-23/`)
- Code execution is frozen (`freeze: true`) — rendered outputs are cached, not re-executed on each build
- External links open in new tabs (configured globally in `_quarto.yml`)
