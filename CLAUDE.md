@AGENTS.md

## Claude Code

- `AGENTS.md` holds the rules for every agent, Codex included. A rule change lands there or in `.claude/rules/`, never only here.
- `.claude/rules/` loads automatically for `posts/**`, `tools/**`, and the site's styles, templates, filters and pages.
- The main session plans, briefs, reviews diffs and verifies. Delegate implementation to one `general-purpose` agent per task on Sonnet 5.5 at high effort, unless Aayush names another model. Do not fork delegated work; forks inherit the parent model. Use `Explore` for searches across many files and do single lookups directly.
- Every brief carries the maintainability and look rules from `AGENTS.md`. Agents never commit; the main session reviews the diff and commits.
- Parallel tool builds use worktree agents (`isolation: "worktree"`), as the `new-tool` skill describes.
