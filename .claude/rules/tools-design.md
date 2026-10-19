---
paths:
  - "tools/**"
---

# Tools: design and implementation conventions

The steps for building a tool are in the `new-tool` skill. These conventions apply to every edit under `tools/`.

- **Standalone**: each tool is one `.html` file in `tools/`, never rendered by Quarto, so it does not inherit the Quarto theme. `resources` in `_quarto.yml` copies the tool HTML, `analytics.js`, `file-utils.js`, `common.css`, `static/` and `CNAME`; keep direct URLs such as `/tools/image-converter.html` working. Inputs are processed locally in the browser.
- **CDN libraries**: fine when needed, pinned to an exact version and listed in `tools-catalog.md`. When updating one, check its browser bundle URL and exercise the affected tool, including Markdown highlighting and math rendering.
- **Theme**: load `../static/design-tokens.css` for colors and type and use its variables; browser token values live only there, and `theme-dark.scss` keeps the aligned Bootstrap defaults. Load tool styles after the tokens. Syntax, search and diff colors stay local to the tools that need them.
- **Fonts**: the system stack through `--font-system`, never web fonts or the site's self-hosted serif.
- **Shared styles**: `common.css` is used by the image converter, resizer and cropper. Opt in only when its full selector set matches the tool's presentation; do not apply the image layout to wider editors or canvas tools. Keep tool-only CSS out of the Quarto page styles, and add any new shared asset to the `_quarto.yml` resources.
- **Shared file helpers**: load `file-utils.js` before the tool's inline script to reuse `ToolFiles` byte labels, image type labels or blob downloads. Pass the exact filename to `downloadBlob`; it revokes its URL after one second. Input validation, processing state, preview URLs and differing MIME label contracts stay local. Its contract tests: `node --test scripts/file-utils.test.mjs`.
- **Head and links**: `<script src="analytics.js"></script>` right after the viewport meta, and a `← Back to Tools` link to `./`.
- **Validation and downloads**: validate input files (type, size, dimensions) with visible error messages, and download through blob URLs (`URL.createObjectURL`), not data URLs.
- **Canvas**: unhide a panel before sizing a canvas in it, because a `display: none` element has zero `clientWidth`.
- **Catalog entry**: a short inline tagline (no dash prefix) and the full description in a `.tool-desc` div. `static/js/tools-catalog.js` hides the description behind a Details button (with `aria-expanded`); without the script every description stays visible. All catalog text, including the filter placeholder and the empty state, lives in `tools/index.qmd`.
- **Layout**: no horizontal scroll at 390 px. Split panes use `minmax(0, 1fr)` columns so wide content scrolls inside its pane.
