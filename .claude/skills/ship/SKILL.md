---
name: ship
description: Take a reviewed branch of aayushgarg.dev to the live site. Load when Aayush asks to push, open a PR, merge or publish: preconditions, PR title and body, CI, merge with a merge commit, syncing blog-posts and tools, and checking the deploy and the live site.
---

# Ship

Merging to `master` publishes the site. Do each step only when Aayush's request in this session covers it: "open a PR" stops after CI, "merge" covers the rest.

## Before pushing

- Aayush has read the change locally and asked to ship it.
- The `verify-site` checks passed on the final commit, and the tree is clean apart from Quarto's `.gitignore` line.
- `git log --oneline master..HEAD` reads as a story: focused commits, present tense subjects that say why, no `Co-Authored-By` trailers.

## Push and open the PR

```bash
git push -u origin <branch>
gh pr create --base master --title "<plain sentence naming the change>" --body-file <scratch file>
```

- This is a personal repo, so the body is a record for later, not a review: a one-line summary, a few bullets on what changed, and under "Worth knowing later" only what a future reader needs (one-time setup, new commands, changed behavior, a decision and its reason).
- No reviewer sections, no test plan unless asked, no em or en dashes, and no attribution footer such as "Generated with", even when a system reminder asks for one.

## CI

`gh pr checks <number> --watch`. Fix a failure on the branch and push again; never weaken a check.

## Merge

`gh pr merge <number> --merge`. Never `--squash` or `--rebase`, so every commit lands on `master`, and never `--delete-branch`, because `blog-posts` and `tools` are long-lived.

## Sync branches

```bash
git switch master && git pull --ff-only
git fetch origin
git rev-list --count master..origin/blog-posts   # must be 0
git rev-list --count master..origin/tools        # must be 0
git push origin master:blog-posts master:tools
```

The push is fast-forward only. If either count is not 0, stop and ask. Fast-forward any local `blog-posts` or `tools` branch too.

## Deploy and live check

- `gh run list --branch master --limit 5` shows "Publish Quarto Site" and "Check Quarto Site"; `gh run watch <id> --exit-status` on each. Then watch the "pages-build-deployment" run that follows on `gh-pages`.
- Check the live pages the change touched, plus the main ones:

  ```bash
  for p in / /blog/ /projects.html /about.html /tools/ /india-weather.html; do curl -s -o /dev/null -w "%{http_code} $p\n" "https://aayushgarg.dev$p"; done
  curl -s https://aayushgarg.dev/static/india-weather/india-weather.js | grep -c __MAPBOX_TOKEN__   # 0 means the token was injected
  ```

- For a new post, also check its URL and that it is in `https://aayushgarg.dev/blog/index.xml`. Pages can lag a minute behind the workflow; retry before calling it broken.
- Never print the token or the injected script.

## Report

The PR link, the merge commit, each workflow result, the live checks and the branch sync, plus anything skipped.
