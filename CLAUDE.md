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
- `styles.css` — Layout and component styles (profile, blog listing, experience grid, tools list)

### Content
- **Blog posts** in `posts/` — Either `YYYY-MM-DD-title.qmd` (single file) or `YYYY-MM-DD-title/index.qmd` (directory with assets)
- **Static pages** in `pages/` — Project pages (doverlap, jsalt, overlap-aware-sc)
- **Tools** in `tools/` — `index.qmd` (listing page) + standalone `.html` tool files
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

## Tools Section

Browser-based utilities that run entirely client-side. Tools are organized by category (e.g., "Image Tools").

### Adding a New Tool
1. **Create the tool** as a standalone `.html` file in `tools/` (self-contained HTML/CSS/JS, no external dependencies)
2. **Add a list entry** in `tools/index.qmd` under the appropriate `## Category` header using the `.tool-item` div pattern (tool-link + tool-tagline + expandable tool-desc)
3. The `.html` files are copied as-is to `_site/` via the `resources: tools/*.html` entry in `_quarto.yml`
4. After changes, run `quarto render tools/index.qmd` to rebuild the listing (standalone HTML tools don't need rendering)

### Implementation Workflow
- When building multiple tools at once, use **parallel worktree agents** — one agent per tool in isolated worktrees, all running concurrently
- Each agent should receive the full CSS variable set and reference file patterns to match the site theme
- Worktree agents may not auto-commit — after they finish, **copy the generated files** from the worktree paths into the main repo and commit from there
- Always **unhide panels before initializing canvases** — `display: none` elements have zero `clientWidth`, which breaks canvas sizing
- After merging, clean up leftover worktrees with `git worktree remove`

### Tool Design Conventions
- **Theme**: Must match the site's dark theme — use colors from `theme-dark.scss` (background `#1d1e20`, card `#2e2e33`, inset `#37383e`, border `#333333`, accent `#75A8D9`)
- **Fonts**: Use the site's system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ...`), not external fonts
- **Back link**: Include a `← Back to Tools` link pointing to `./`
- **Validation**: Validate input files (type, size, dimensions) with user-visible error messages
- **Downloads**: Use blob-based downloads (`URL.createObjectURL`) instead of data URLs for large file support
- **Listing**: Each tool entry has a short tagline inline (no dash prefix) and a full description in an expandable `.tool-desc` div that toggles on click
