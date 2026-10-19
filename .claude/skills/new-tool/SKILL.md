---
name: new-tool
description: Build a new standalone browser tool for aayushgarg.dev/tools, or several in parallel. Load when asked to add, scaffold or substantially rebuild a tool: branch, the HTML scaffold, the catalog entry, inventory upkeep and the checks.
argument-hint: "[tool idea]"
---

# New tool

`.claude/rules/tools-design.md` and `tools-catalog.md` load with any file under `tools/`; follow them. Check the catalog first so the new tool reuses a CDN library and does not duplicate an existing tool.

## Start

- Work on `tools`, level with `master`: `git fetch origin`, `git switch tools` (or `git switch -c tools --track origin/tools`), `git merge --ff-only origin/master`. If it holds commits that are not on `master`, stop and ask.

## Build

- Create `tools/<kebab-name>.html`. Copy the head of an existing tool such as `tools/base64.html`: charset and viewport metas, `analytics.js`, the title, `../static/design-tokens.css`, then `common.css` and `file-utils.js` only if the tool qualifies for them.
- Pin any CDN library to an exact version on `cdn.jsdelivr.net` and add it to the CDN table in `.claude/rules/tools-catalog.md`.
- Add the entry to `tools/index.qmd` inside the `.tools-list` div, under the matching `## [Category]{.sec-head} {.no-anchor}` heading, in the `.tool-item` pattern of its neighbours: a `{.tool-link .title-link}` link, the tagline, and a `.tool-desc` div.
- Add the tool's row to the inventory in `.claude/rules/tools-catalog.md`.

## Several tools at once

Give each tool its own agent with `isolation: "worktree"` and this skill. Agents do not commit. When they finish, review each worktree's diff, copy the files into the main checkout, commit there, and remove the worktrees with `git worktree remove`.

## Check

- `quarto render tools/index.qmd`, then `node scripts/screenshots.mjs tools/ tools/<name>.html` and read both widths.
- Run the tool's main path once in a browser with a real input, including a download if it has one. `npm run test:browser` also fails if any tool page scrolls sideways.
- Commit on `tools` at checkpoints. Publishing goes through the `ship` skill, only after Aayush has tried the tool and asked.
