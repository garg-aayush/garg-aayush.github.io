---
paths:
  - "_quarto.yml"
  - "*.qmd"
  - "blog/index.qmd"
  - "posts/_metadata.yml"
  - "styles.css"
  - "theme-dark.scss"
  - "static/design-tokens.css"
  - "static/css/**"
  - "static/fonts/**"
  - "static/js/**"
  - "_templates/**"
  - "_filters/**"
  - "_partials/**"
  - "scripts/place-article-end.mjs"
  - "scripts/preserve-feed-guids.mjs"
  - "scripts/build-search-index.mjs"
  - "scripts/build-search-vectors.mjs"
  - "scripts/make-search-table.mjs"
  - "static/search/**"
  - "scripts/legacy-feed-guids.json"
---

# Site styles, templates, filters and feeds

How the Quarto pages are put together. Standalone tools follow `tools-design.md` instead.

## Styles

- Quarto pages load, in this order from `_quarto.yml`: `static/fonts/fonts.css`, `static/design-tokens.css`, `styles.css`, `static/css/home.css`, `static/css/article.css`, `static/css/pages.css`, `static/css/search.css`. Every stylesheet loads on every page, so page rules are scoped by the page's `body-classes`:

  | body class | pages | stylesheet |
  |---|---|---|
  | `home`, `writing` | homepage, Writing index | `home.css` |
  | `article-page` | every post, set once in `posts/_metadata.yml` | `article.css` |
  | `pg` | Work, About, Publications, Tools catalog, weather page | `pages.css` |
  | `search-page` | the search page, together with `pg` | `search.css` |

- `styles.css` is the global base: type, links, navbar (the links and the search icon), footer, focus, code, and the shared `.ui-label`, `.sec-head`, `.btn-solid`, `.link-arrow`, `.title-link`, `.live-dot`, `.work-rows`, `.timeline` and `.contact` classes. The `.timeline` markup is shared: its type is in `styles.css`, the homepage Path lays it out as dotted columns in `home.css`, and the About experience as a compact list in `pages.css`.
- `static/design-tokens.css` is the single source for colors (code syntax colors included), font stacks, the type, spacing and radius scales, and component sizes. Add or change a value there and use it through `var()`; the site stylesheets hold no literal colors.
- `theme-dark.scss` is the Bootstrap compile-time theme. Sass color functions need literal values, so mirror a changed palette value or font stack in its `$tok-` block and derive any other Sass from that block; nothing syncs them automatically. It also turns off the Google Fonts import that the cosmo theme would add.
- Headings use `ui-serif` (Apple's New York in Safari) with the self-hosted Source Serif 4 as the fallback: a Latin subset variable WOFF2 with a weight axis from `@fontsource-variable/source-serif-4` 5.3.1, its `@font-face` rule in `static/fonts/fonts.css` and the license in `OFL.txt`. `_quarto.yml` preloads only that file. Body text uses the system sans stack and code the system mono stack, with no web font for either.
- Keep selectors at class level and avoid IDs. Use `!important` only where Quarto or Bootstrap leave no other way, with a comment naming what it overrides.

## Markup, templates and filters

- Navigation, the footer and the social links are defined once in `_quarto.yml`. Quarto's own search is off there (`website: search: false`: no overlay, no magnifier, no `f`, `/` or `s` shortcuts), and the last navbar item is an `icon: search` link to `search/` with `aria-label: Search`. Quarto still writes `search.json`, which nothing of ours reads. The Writing page links to the search page from `blog/index.qmd`.
- `_templates/*.ejs` turn front matter lists and the post listings into markup and hold no copy. Quarto's EJS is lodash templating, where `<%=` prints raw text. Quarto does not render underscore files or folders.
- `_contact.qmd` is the Contact section that `index.qmd` and `about.qmd` include.
- `_filters/build-month.lua`, loaded from `index.qmd`, fills the empty `[]{.build-month}` span with the build month and year in UTC.
- Posts get their header from `_partials/title-block.html` and run `_filters/article.lua`, both wired in `posts/_metadata.yml`. The filter computes the reading time with Quarto's listing formula so the header matches the post rows, counts the sections, adds the phone contents list and appends the "All writing" link.
- Quarto adds references and footnotes after every filter has run, so the post-render step `scripts/place-article-end.mjs` moves the "All writing" link after them (`node --test scripts/place-article-end.test.mjs`). It does not run under `quarto preview`.
- `static/js/site.js` is the only site-wide script, loaded through `include-after-body`: it adds the skip link, honors reduced motion for Quarto's smooth scrolling, marks the navbar link of the current page (Quarto does that only for links to .html files, not the folders Writing, Tools and Search) and sends `/`, pressed outside a field and without a modifier, to `/search/`, leaving a one-time flag in `sessionStorage` that `search.js` reads to focus the field on any screen (the address stays clean, so analytics records no query). The standalone tools do not load it. `static/js/tools-catalog.js` adds the catalog's filter box and Details buttons; without it every description stays visible. `static/js/search.js` runs the search page only, loaded as a module from `search/index.qmd`; it reads its words from the page's JSON block and its page data (title, section, date, categories) from the two listings, which `_templates/search-records.ejs` prints as JSON, and it loads `search-index.json` for the text. The keyword ranking is `static/js/search-rank.js`, a pure ES module (no DOM) that the page and the evaluation in `_devlog/local-search/evals/` both import; it also holds the meaning ranking by cosine and the fusion of the two (`FUSION`, reciprocal rank fusion over the first 10 pages of each list, with every other keyword match appended after the fused rows in keyword order, and the five closest pages by meaning when no keyword matches); the page's path key, `pageKey`, is also there and `scripts/build-search-index.mjs` imports it. Meaning comes from `static/js/search-embed.js`, also pure: WordPiece tokenizing, one row of a static int8 table per piece, mean, normalize. The table is `static/search/potion-base-8M.int8.bin` (Model2Vec `minishlab/potion-base-8M` at a pinned revision, 256 dimensions) with `potion-base-8M.vocab.txt`, `manifest.json` (model, revision, scale, tokenizer settings, size and SHA-256 of each file) and `NOTICE.txt` (license). They are committed and change only when the model does: `scripts/make-search-table.mjs` rebuilds them from the pinned revision (Node built-ins only, source files checked against pinned SHA-256) and refuses a revision whose tokenizer settings differ from what `search-embed.js` implements. The post-render step `scripts/build-search-index.mjs` writes `search-index.json`: it reads the page list from the rendered search page, splits each page's main content into passages by section (anchor, heading, text, and a separate field for code and formula words) and indexes the tools from their own HTML. The next post-render step `scripts/build-search-vectors.mjs` embeds every passage of that index (and every page description, in the order `createIndex` numbers them) with the committed table and writes `search-vectors.json` (int8 vectors as base64, the index hash they belong to, the table's SHA-256, dimensions and scale). Both use only Node built-ins, because the deploy job does not run `npm ci` and fetches nothing; both honor Quarto's output directory and skip absent inputs in a partial render, and fail in a full render (`QUARTO_PROJECT_RENDER_ALL=1`); a listed page whose text cannot be extracted does not fail the index step, it is indexed by title and description with a warning on stderr (`check:site` then fails on it). On the first keystroke in the search box (not on focus, which a desktop does at load, and not with Save-Data or a 2g connection) the page fetches the vectors file (`?v=<index hash>`), then the table and vocabulary (`?v=<their hash>`), checks every hash and size, and only then ranks by both; any failure or mismatch leaves keyword search with no message. `npm run check:site` also runs `checkSearch` in `scripts/check-site.mjs`: the index must cover every listed page and the vectors must be the ones the index text and the table give (`node --test scripts/search-rank.test.mjs scripts/search-embed.test.mjs scripts/build-search-index.test.mjs scripts/build-search-vectors.test.mjs scripts/make-search-table.test.mjs scripts/check-search.test.mjs`). The page is one folder down, so its listing paths start with `../` and the JSON block's `root`, `indexUrl` and `vectorsUrl` settings point back up; result links are `root` plus a root-relative path.

## Feeds

- `index.qmd` and `blog/index.qmd` both generate RSS, and `aayushgarg.dev` is the canonical host for metadata, feed links and feed images.
- The post-render step `scripts/preserve-feed-guids.mjs` keeps the exact published GUIDs of existing articles, marked `isPermaLink="false"`, so subscribers did not see old posts as new after the hostname change. `scripts/legacy-feed-guids.json` holds the IDs verified in both live feeds before that change, plus older entries verified in the feeds published at commit `6122c37`. The list stays fixed; new posts get Quarto's canonical GUIDs. The script leaves links and content alone, honors Quarto's output directory and allows absent feeds in partial renders (`node --test scripts/preserve-feed-guids.test.mjs`).
- Post `permalink` values are historical and do not set rendered paths. Compare rendered links and feed items with `master` before changing the domain, routes or `site-url`.
