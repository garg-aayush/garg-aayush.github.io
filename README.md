# Personal website

Source for [aayushgarg.dev](https://aayushgarg.dev/), built with [Quarto](https://quarto.org/) and published to GitHub Pages from `master`.

## Run locally

Use [Quarto 1.10.18](https://github.com/quarto-dev/quarto-cli/releases/tag/v1.10.18) and Node 24.22.0 (pinned in `.node-version`), from the repository root:

```bash
quarto preview                                        # live preview while editing
quarto render                                         # full build into _site/
quarto render posts/2026-07-15-kalman-filters-time-series/index.qmd   # one page
```

`quarto preview` skips the post-render steps, so on posts with footnotes the "All writing" link shows above them there; `quarto render` places it after. Posts use frozen execution, so code cells do not run on render.

## Updating content

Every visible word is text in a `.qmd` file or in `_quarto.yml`, so no HTML is needed. Repeated items live in lists at the top of the page's file, and the templates in `_templates/` turn them into markup. Run `quarto preview` while editing to see the result.

- **Homepage (`index.qmd`)**: the hero text, the section labels and the Now box header are Markdown in the body. The date next to "Now" fills in automatically from the latest build (`[]{.build-month}`), so leave that span empty. To change the photo, replace `static/img/aayush-avatar.jpg`, keeping it square and around 192 px (about 25 KB). The browser tab icon is `static/img/favicon.png`, a 64 px square. The Now rows (`label`, `text`, `sub`, `href`, and `live: true` for the green status dot) are a list at the top of the file, and the Latest post row is added automatically after the first row. The career path stages (`dates`, `title`, `description`, and `badge`, whose text shows as a pill on the current stage) and the Built rows (`title`, `href`, `description`) are lists too. `max-items` on `blog-listings` sets how many recent posts show.
- **Writing index (`blog/index.qmd`)**: the rows and the category chips come from the posts, so a new post or category shows up on its own.
- **Posts**: `posts/YYYY-MM-DD-slug/index.qmd` with `title`, `tags`, `categories`, `date`, `permalink` and `description`, and images in `static/img/blog-YYYY-MM-DD/`. The interface words (`toc-title`, `back-link-text`, `byline`) are in `posts/_metadata.yml`. Reading time and the section count are computed for you.
- **Work (`projects.qmd`)**: the live items, the open source projects and the gists are lists with `title`, `href`, `description` and optional `list` and `note`, shown in the order written.
- **Publications (`publications.qmd`)**: one item per paper with `year` as a string, `title`, `subtitle` for the authors (wrap your own name in `**`) and `description` for the venue (with a Markdown link). Newest year first.
- **About (`about.qmd`)**: the intro is Markdown. The roles are a list with `dates`, `title`, `role`, `description` and an optional `href` that links the title.
- **Tools catalog (`tools/index.qmd`)**: each tool is a `.tool-item` entry under its category heading; copy a neighbouring entry.
- **Search (`search/index.qmd`)**: the site's search, at `/search/`. It is reached from the search icon at the right end of the navbar (the link is defined in `_quarto.yml`, where Quarto's own search is turned off), from the Search link under the description on the Writing page (`blog/index.qmd`), and by pressing `/` anywhere outside a field (`static/js/site.js` sends the visitor there and sets a one-time flag in `sessionStorage`, not the address, so the field is focused on arrival on any screen). The tools under `tools/` are standalone files and do not load `site.js`, so `/` does nothing there. The posts come from the listing at the top of the file, so a new post is found on its own. The other pages are a list there with `title`, `href` (from the site root, such as `projects.html`), `section` and `description`; add `match-body: false` to match only the title and description. The words on the page, the section names and the stop words are in the JSON block in the body. After every render, `scripts/build-search-index.mjs` reads the pages that list names, splits their rendered text into passages and writes `search-index.json` at the site root, and `scripts/build-search-vectors.mjs` embeds every passage with the static table in `static/search/` and writes `search-vectors.json` next to it. The page ranks by keywords (BM25, `static/js/search-rank.js`) at once and adds meaning (`static/js/search-embed.js`, the table and the vectors, fetched on the first keystroke in the search box, not on focus, and not with Save-Data or a 2g connection) when they are ready and match the index; if they do not, it stays on keyword search. Nothing typed is sent anywhere. **Adding a post needs no search step:** render and deploy, and the post is indexed, embedded and found by keyword and by meaning. A page that is not a post (a new tool, a project page) needs one hand edit: add an entry to the list in `search/index.qmd`. `npm run check:site` fails if the index or the vectors miss a listed page or do not match each other. The table (`static/search/`) changes only when the model does; `node scripts/make-search-table.mjs` rebuilds it (`static/search/NOTICE.txt` has the license).
- **Contact (`_contact.qmd`)**: the email, LinkedIn and GitHub links, shared by the homepage and About, so edit them once here.
- **Navigation and footer**: `_quarto.yml`.

Section headers are written the same way on every page, as `## [Label [link text](url)]{.sec-head} {.no-anchor}`; leave out the link part when there is none.

A link inside a sentence needs no class. Add `{.title-link}` to a link whose text names an item in a list, such as `[Image Resizer](image-resizer.html){.tool-link .title-link}`, and it gets an arrow: ↗ when it leaves the site, → when it stays.

Quarto listing quirks:

- Write any `date` field in a list as a quoted string. Dates show as `15 Jul 2026`.
- Lists use `sort: false` to keep the written order.
- Markdown works in `title`, `subtitle` and `description`, but not in custom fields such as `sub`, `text`, `role` or `badge`.

## Where things live

| Path | What |
|---|---|
| `_quarto.yml` | navigation, footer, site metadata, stylesheets, copied resources |
| `index.qmd`, `about.qmd`, `projects.qmd`, `publications.qmd`, `blog/index.qmd`, `india-weather.qmd`, `search/index.qmd` | main pages |
| `posts/`, `pages/` | articles and project pages |
| `tools/` | standalone browser tools and the catalog |
| `static/design-tokens.css` | every color, font, size and spacing value |
| `styles.css`, `static/css/`, `theme-dark.scss` | site styles |
| `_templates/`, `_filters/`, `_partials/` | listing templates, Pandoc filters, the article header |
| `static/` | images, fonts, scripts, weather assets and fallback data |
| `scripts/`, `tests/` | checks, tests and post-render steps |
| `worker/` | the Cloudflare weather Worker, a separate Node project |

How the styles, templates, filters and feeds fit together is in [.claude/rules/site-styling.md](.claude/rules/site-styling.md), and the tools conventions in [.claude/rules/tools-design.md](.claude/rules/tools-design.md).

## Checks

```bash
npm ci --ignore-scripts && npx playwright install chromium   # once
npm run check:secrets      # credential shaped values in tracked files
npm run check:posts        # post metadata and unique permalinks
npm test                   # unit tests for the scripts and hooks
quarto render --clean
npm run check:site         # links, assets, fragments and feeds in _site/
npm run test:browser       # navigation, math, tool downloads, no sideways scroll at 390 and 1280 px
```

`site-checks.yml` runs the same on every pull request. `node scripts/screenshots.mjs [page ...]` saves full-page screenshots at both widths to `test-results/screenshots/`. For another output directory, pass it to `check:site` or set `SITE_OUTPUT_DIR`.

Enable the git hooks once per clone with `git config core.hooksPath .agent_hooks/git`. They refuse commits on `master`, scan staged files for secrets, and reject em and en dashes and attribution lines in commit messages.

## Publishing and weather data

A push to `master` runs `quarto-publish.yml`, which renders the site, injects the Mapbox token into the weather page's JavaScript and publishes `_site/` to `gh-pages`. Existing RSS items keep their original GUIDs, so subscribers never see old posts as new.

The weather data lives on the orphan `data` branch. The Cloudflare Worker refreshes `weather.json` and `history-*.json` every 15 minutes, `india-weather-daily.yml` writes `daily-*.json` once a day, and `india-weather-data.yml` is a manual fallback. The page falls back to the sample files in `static/india-weather/` when the data is unavailable. For the Worker, `cd worker && npm ci && npm run dev`.

Tokens live only in GitHub Actions and Worker secrets. Agent rules are in [AGENTS.md](AGENTS.md), and deferred work in [TODO.md](TODO.md).
