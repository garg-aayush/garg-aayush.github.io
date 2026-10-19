---
paths:
  - "tools/**"
---

# Tools: Workflow & Design Conventions

## Adding a New Tool
1. Create the tool as a standalone `.html` file in `tools/` with local processing (CDN libraries are OK when needed, e.g. KaTeX, jsdiff). Load `../static/design-tokens.css` for browser colors and typography; reuse `common.css` when its image tool layout and control styles match, keeping specialized styles local.
2. Add a list entry in `tools/index.qmd` inside the `.tools-list` div under the appropriate category heading (`## [Category []{.rule}]{.sec-head} {.no-anchor}`), using the `.tool-item` div pattern (a link marked `{.tool-link .title-link}` + tool-tagline + a `.tool-desc` div). `static/js/tools-catalog.js` adds the Details button and the filter, so the entry needs no extra markup
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
- **Theme**: Match the site's dark theme using `static/design-tokens.css` (background `#0A0D11`, card `#10161D`, inset `#151C24`, border `#1E2730`, accent `#7AAAFF`).
- **Shared styles**: Browser token values live in `static/design-tokens.css`; `theme-dark.scss` keeps aligned compile-time Bootstrap defaults. Load tool styles after the tokens. Keep tool-only CSS out of Quarto page styles, and include new shared assets in `_quarto.yml` resources.
- **Common CSS adoption**: `common.css` is used by the image converter, resizer, and cropper. Opt in only when its full selector set matches the tool's existing presentation; do not apply the image layout to wider editors or canvas tools. Keep specialized tokens and layout overrides local, and check desktop and mobile states when extracting existing rules.
- **Shared file helpers**: Load `file-utils.js` before the tool's inline script when reusing `ToolFiles` byte labels, matching image type labels, or blob downloads. Pass the exact desired filename to `downloadBlob`; it owns only its download URL and revokes it after one second. Keep input validation, processing state, preview URLs, and differing MIME label contracts local.
- **Fonts**: Use the system font stack through `--font-system` (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ...`), not external fonts and not the site's self-hosted Geist fonts
- **Analytics**: Include `<script src="analytics.js"></script>` in `<head>` (after viewport meta) — this loads shared Google Analytics tracking
- **Back link**: Include a `<- Back to Tools` link pointing to `./`
- **Validation**: Validate input files (type, size, dimensions) with user-visible error messages
- **Downloads**: Use blob-based downloads (`URL.createObjectURL`) instead of data URLs for large file support
- **Listing**: Each tool entry has a short tagline inline (no dash prefix) and a full description in a `.tool-desc` div. `static/js/tools-catalog.js` hides the description and adds a Details button that toggles it (with `aria-expanded`); without the script every description stays visible. All catalog text, including the filter placeholder and the empty-state message, lives in `tools/index.qmd`
