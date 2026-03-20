---
paths:
  - "tools/**"
---

# Tools: Workflow & Design Conventions

## Adding a New Tool
1. Create the tool as a standalone `.html` file in `tools/` (self-contained HTML/CSS/JS; CDN libraries are OK when needed, e.g. KaTeX, jsdiff)
2. Add a list entry in `tools/index.qmd` under the appropriate `## Category` header using the `.tool-item` div pattern (tool-link + tool-tagline + expandable tool-desc)
3. The `.html` files are copied as-is to `_site/` via the `resources: tools/*.html` entry in `_quarto.yml`
4. After changes, run `quarto render tools/index.qmd` to rebuild the listing (standalone HTML tools don't need rendering)

## Implementation Workflow
- **Always work on the `tools` branch** when adding a new tool — never commit directly to `master`
- **Commit locally at important checkpoints** on the `tools` branch while developing
- Only after the user has tested locally and confirms: **push to remote -> create PR to `master` -> merge -> `git checkout master && git pull`**
- After merging, update `tools` and `blog-posts` branches to match `master`
- When building multiple tools at once, use **parallel worktree agents**, one agent per tool in isolated worktrees, all running concurrently
- Each agent should receive the full CSS variable set and reference file patterns to match the site theme
- Worktree agents may not auto-commit — after they finish, **copy the generated files** from the worktree paths into the main repo and commit from there
- Always **unhide panels before initializing canvases** — `display: none` elements have zero `clientWidth`, which breaks canvas sizing
- After merging, clean up leftover worktrees with `git worktree remove`

## Design Conventions
- **Theme**: Must match the site's dark theme — use colors from `theme-dark.scss` (background `#1d1e20`, card `#2e2e33`, inset `#37383e`, border `#333333`, accent `#75A8D9`)
- **Fonts**: Use the site's system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ...`), not external fonts
- **Analytics**: Include `<script src="analytics.js"></script>` in `<head>` (after viewport meta) — this loads shared Google Analytics tracking
- **Back link**: Include a `<- Back to Tools` link pointing to `./`
- **Validation**: Validate input files (type, size, dimensions) with user-visible error messages
- **Downloads**: Use blob-based downloads (`URL.createObjectURL`) instead of data URLs for large file support
- **Listing**: Each tool entry has a short tagline inline (no dash prefix) and a full description in an expandable `.tool-desc` div that toggles on click
