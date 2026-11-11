# Local search journal

A running record of adding browser-local search to aayushgarg.dev: what was used, why, and what was measured. It is the source for a blog post. Quarto does not render underscore folders, so this file is not published.

## 2026-11-11, background and decisions

**Goal.** Search on the personal site that runs only in the visitor's browser. It is built in stages, from the simplest version upward, and each stage is measured before the next one starts.

**The stages.**

1. Settle the UI first, then keyword search on the CPU with BM25 over a clean index. No models.
2. Add a very small embedding model for vector search alongside BM25.
3. Better models, chosen by device capability and by the visitor's choice, possibly an encoder that also embeds images.

Locally generated answers were discussed earlier. They are not part of these three stages yet.

**Where search lives (Aayush, 2026-11-11).** A dedicated search page, reached from the navbar magnifier, which replaces Quarto's built-in search overlay once the page is good. Two other placements were rejected. A search box inside the homepage competes with the introduction and would load the index on the most visited page. An overlay on every page leaves no room for filters, model choices or answers later.

**Design decision.** Search is a utility here, not a destination. With about 40 pages it should feel like the Writing list filtering itself as you type, so the results reuse the site's post rows and update on every keystroke. No AI controls appear until they are real. An earlier prototype modeled on another personal site, with simulated model downloads and sample answers, was set aside: its look was not a base to build on, and a page should not show controls that do nothing.

**Planned evaluation.** A fixed set of 30 to 40 questions written from the site's own pages, including some with no answer on the site. The same set is scored the same way at every stage, so each stage can be compared with the one before it. The plan first said 40 to 60. Aayush changed it to 30 to 40 on 2026-11-11 because the site is small (47 searchable pages), and the set has 40.

## 2026-11-11, stage 1, step one: the page and a placeholder ranking

This step builds the UI on real site content. It is not the BM25 stage. Ranking is a stand-in so the page can be judged in a browser.

**Files.**

- `search/index.qmd`: the page, first built as `search.qmd` at `/search.html` and moved to `/search/` later the same day (see the last entry). Front matter holds two Quarto listings (posts and other pages), the body holds the static markup and one JSON block with every word and setting the script uses.
- `_templates/search-records.ejs`: prints a listing's items as a JSON block, no visible markup.
- `static/js/search.js`: loaded by this page only. Reads the JSON blocks, fetches `search.json`, ranks, renders, handles the keyboard.
- `static/css/search.css`: scoped by the body class `search-page` (used with `pg`, so the column and header match Work and About). Registered after `pages.css` in `_quarto.yml`, which also lists the page under `render`.
- Docs: a Search bullet in `README.md`, a row and a sentence in `.claude/rules/site-styling.md`, and a Search section in `TODO.md`.

The page is unlisted: not in the navbar, linked from nowhere, `search: false`, `noindex`, and the early `ga-disable` flag. `search: false` keeps the page out of Quarto's own `search.json` (0 rows for it) but Quarto still draws its navbar magnifier on this page, as on every page.

**Data sources and why.**

- Post metadata (title, date, categories, reading time, description, link) comes from a Quarto listing, so a new post appears with no edit. The template prints JSON rather than rows. The result rows depend on the query and carry a snippet, so the script has to build them anyway. It builds them with the same classes and structure as `_templates/post-rows.ejs`, so the existing row CSS applies unchanged.
- Pages that are not posts (Work, About, Publications, the three pages under `pages/`, the Tools catalog, 14 individual tools and the weather page) are a hand-editable list in the front matter: title, link, section, description. 22 entries. Together with 25 posts that is 47 pages. The individual tools are not rendered by Quarto, so `search.json` has nothing for them; their description is all there is to match.
- Body text for matching and snippets comes from the `search.json` that Quarto already generates, joined to the metadata by page path. It is the only network request the page makes. What is typed never goes into the URL, an analytics event or a request.

**The placeholder ranking.** One function, `rankPages` in `static/js/search.js`. A term has to start a word somewhere on the page (so a half-typed word already matches). The score is 10 for a hit in the title, 4 for a section heading, 3 for the description and 1 per hit in the text, capped at 5. Every term must match (stop words such as "how" and "does" are dropped unless nothing else is left). One row per page. The row links to the section whose passage has the most distinct terms, then the most hits, and the snippet comes from that passage. Known weaknesses:

- No stemming: "evaluating" does not find "evaluation", though "evalu" does.
- No typo tolerance and no synonyms.
- Requiring every term makes a long natural question return few or no pages, and "work" matches the Work page for almost any question that contains it.
- No length normalization, so a long page that mentions a word once ranks like a short one.
- Math is cut from the text. Inline math keeps its letters with the commands removed, so `N \times N` reads "N N" in a snippet, and a term that appears only in an equation is not found.
- Text before a post's first heading is found only through the first row, after the contents list is cut off (see below); some posts keep a stray heading word at the start of that passage.
- The weather page is matched on its title and description only (`match-body: false`), because its text is the interface of a map.

**What `search.json` looks like (measured on a full render).**

- 188 rows from 35 pages, 395 KB (394,989 bytes). Each row has `objectID`, `href`, `title`, `section` and `text`. Row text is up to 11,504 characters, 1,750 on average.
- A page has one row without a fragment (the page level) and one row per section with the section's anchor.
- 5 rows belong to pages that are not in the search list (the homepage, 4 rows, and the Writing index, 1 row). Their text repeats other pages: the Writing index carries the category chips ("All 25 LLM Evaluation 2 ...") and the whole list of posts. They are left out because those pages are not results.
- Of the 183 rows that join to a page, 25 are the first row of a post, which starts with "Contents" and the post's section titles, one per line, before the first paragraph. Among the other 158 rows, 24 end with the "All writing" back link, 7 carry the text "No matching items" (Quarto's hidden empty state of a listing) and 38 contain math markup.
- Exact duplicate texts: 2. `projects.html` and `projects.html#live` are the same row, and the Contact block (Email, LinkedIn, GitHub, X) is the same on the homepage and on About.
- 14 of the 47 pages have no row at all, which are the individual tools. The weather page has a row, but its text is skipped.
- After the cleaning in `search.js`, 156 passages from 31 pages are searched, counted by replaying the same steps outside the browser. I did not count them inside the browser.

**Tried and dropped.**

- Dropping the first row of every post because it starts with the contents list. That also drops the introduction, which sits in the same row after the list. The script now cuts the list (lines that are the page's own section titles) and keeps the rest.
- Real DOM focus instead of a combobox. Up and Down move focus through the result links, which already have the row-wide focus ring from the homepage rows; there is no `aria-activedescendant` bookkeeping.
- A page title at the full size of the other pages' titles. "Search" alone at 40px looked like a headline, so the page uses the h2 size.
- Hiding the section filters when the field is empty. Instead they count every page, and choosing one lists that section (for example all 15 tools), which is how the empty page can browse.
- A clear icon. It is a text button, so the word is editable in the page.

**Observed behavior in a browser (Chromium, Playwright, outside the repo), on the final build.**

- "kalman fil" finds the Kalman post and links to the section "The Kalman Filter: Predict, then Update".
- "attention" gives 6 results: 5 posts and the Work page. The first is the FlashAttention post, linked to its section "What FlashAttention Does".
- "resiz" gives 5 results, with Image Resizer first and the Tools catalog second.
- "geophysics" gives no results. The About page says "Geophysicist", and a prefix match on the full word "geophysics" cannot reach it. "geophysic" gives 2 results, About and Publications.
- "how does flash attention work" gives 4 results, with the FlashAttention post first and the Work page second. "how" and "does" are dropped as stop words, so "work" has to start a word on the page too.
- Keys, with focus on the page body and the field empty: `/` focuses the field and Quarto's own search overlay stays closed. `s` and `f` do not focus the field and open Quarto's overlay, because its keyboard shortcuts (`f`, `/`, `s`) are still active on this page. With focus in the field, all three type normally and the overlay stays closed.
- Escape clears the field, Down and Up move through the results, and typing on a result returns focus to the field.
- After the page load, typing made no request. The console was clean.

**Check results.** Under Node 24.22.0 from a temporary download outside the repo:

- `npm run check:secrets`: Secret scan: 273 tracked files clean. That scan skips untracked files, so the new and edited files (7: `search.qmd`, the template, the script, the stylesheet, this journal, `TODO.md`, `README.md`) were also scanned with the repo's own `scanText`: 0 hits.
- `npm run check:posts`: Post metadata: 25 posts passed.
- `npm test`: 38 tests, 38 pass, 0 fail.
- `quarto render --clean`: completed, 50 HTML pages in `_site`.
- `npm run check:site`: Rendered site: 50 HTML pages and 5676 references passed.
- `npm run test:browser`: 104 passed, including `search.html fits 390px` and `search.html fits 1280px`. One run, while a local server of mine was also running, reported 3 failures (the list showed the FlashAttention post and `search.html` overflow tests at 1280 and 390px, and the mobile navigation test); the next two runs passed all 104 with nothing changed. I did not find the cause of the first run and did not keep its output.
- A separate Chromium script (outside the repo) ran 15 behavior checks, all passing.

## 2026-11-11, the address and the way in

**Decisions (Aayush, 2026-11-11).**

- The page lives at `aayushgarg.dev/search/`, like `/blog/` and `/tools/`. The source moved from `search.qmd` to `search/index.qmd`.
- When the page goes live, the Writing page gets a small "Search" link.
- The navbar magnifier is the main way in, as decided earlier. A shortcut was proposed: `/` from any page goes to the search page with the field focused.

**The move.** One folder down, three things changed. The listing paths start with `../` (`../posts/20*.qmd`, and `../_templates/search-records.ejs`). The `render` entry in `_quarto.yml` is `search/index.qmd`. In the page's JSON block, `root` (`../`) is put in front of every result link and `indexUrl` is `../search.json`. The page list in the front matter keeps its links from the site root (`projects.html`, `tools/image-resizer.html`), so it reads the same as before, and the join between those pages and the rows of `search.json` still uses root-relative paths on both sides. The stylesheet and the script load as before; Quarto rewrote their paths for the page. The page renders to `_site/search/index.html`, and the sitemap lists it as `/search/index.html`.

**Why no entry point yet.** Wiring the magnifier or a link now would put two searches on the site at once: Quarto's overlay and this page. And Quarto's overlay shortcuts already clash with a site-wide `/`. Today, with focus on the page body and the field empty, `/` focuses the page's field and Quarto's overlay stays closed, but `s` and `f` open Quarto's overlay. So nothing is linked, the page keeps `noindex` and the analytics opt-out, and the go-live steps are a checklist in `TODO.md`.

**Findings about Quarto (Quarto 1.10.18, each tried with a temporary edit of `_quarto.yml` rendered to a scratch folder outside the repo, then reverted; `git diff` of `_quarto.yml` afterwards shows only the two intended lines, the new page under `render` and `search.css`).**

- With `website: search: false`, `search.json` is still written. It was 188 rows and 394,989 bytes, byte for byte the same as the normal build, with no row for the search page. The magnifier, the overlay and the `quarto-search` scripts are gone from the pages (no `site_libs/quarto-search` folder and no `#quarto-search` element). Only an inert options block and an empty results `div` remain in the page.
- A navbar item written as `- icon: search`, `href: search/`, `aria-label: Search` renders as an ordinary navbar link with the Bootstrap search icon (`bi-search`) pointing at `search/`, and it works with Quarto's own search on or off.
- The shortcuts are a separate setting: `website: search: keyboard-shortcut:`. With `[]`, pressing `/`, `s` or `f` on a page opens nothing. With `["/"]`, only `/` opens the overlay, and `s` and `f` do not. Both were tried in Chromium with focus on the page body.
- Quarto's handler can only open its overlay, so `/` taking a visitor to the search page from any page needs the site's own script, with Quarto's shortcuts turned off first.

**Checks (Node 24.22.0).** `quarto render --clean` completed. `npm run check:site`: 50 HTML pages and 5676 references passed. `npm run test:browser`: 104 passed (23.4s), with the page now tested at `search/index.html` at 390 and 1280px. In Chromium, on `/search/`, choosing a result opened the right page: "kalman fil" opened the Kalman post at its section anchor, "resiz" opened Image Resizer, "geophysic" opened About at its section, and "attention" opened Work at its section. Typing made no request, and the console was clean. On load the page fetched `/search.json` and nothing else of its own.

## 2026-11-11, stage 1: the clean index and BM25

Stage 1 replaces the placeholder ranking and Quarto's `search.json` with a passage index built after every render and BM25 ranking in the browser, and measures both on the fixed set of 40 queries. Nothing here is a stage 2 idea: no model, no download beyond the index.

### What was built

- `scripts/build-search-index.mjs`: a post-render script, registered after the two existing ones in `_quarto.yml`. It reads the rendered search page, takes the page list and metadata from its two listings (so a new post is indexed with no edit), reads each page's rendered HTML and writes `search-index.json` at the site root. It honors Quarto's output directory. In a partial render a missing search page or listed page is skipped; in a full render (`QUARTO_PROJECT_RENDER_ALL=1`) either is an error, like the feed script does for the feeds.
- `static/js/search-rank.js`: tokenizing, stemming, the index in memory, BM25 and one row per page. An ES module with no DOM access.
- `static/js/search.js`: loads `search-index.json`, builds the index and calls the module. The code that cleaned Quarto's `search.json` and the old `rankPages` are gone. The markup, copy, keyboard behavior and the "Keyword search" label are unchanged. `search/index.qmd` loads the script with `type="module"` and its `indexUrl` is now `../search-index.json`.
- `scripts/build-search-index.test.mjs` (9 tests) and `scripts/search-rank.test.mjs` (11 tests), and `tests/browser/search.spec.mjs` (a query, and no request while typing).
- `_devlog/local-search/evals/`: `run-eval.mjs`, `baseline-placeholder.mjs` (the old ranking, lifted out of the DOM, kept only as a baseline), `measure-cost.mjs`, and `results/` with one `.json` and one `.md` per run, a `summary.md` and a `costs.md`.

### Deploy: no workflow change

`quarto-publish.yml` sets up Node and Quarto and runs `quarto render`, with no `npm ci`. `parse5` is a devDependency, so the deploy job would not have it and the post-render step would have failed the deploy. The existing post-render scripts use only Node built-ins. So the index script does too: it carries a small forgiving HTML parser (void elements, raw text elements, comments, entities and a few implied end tags) written for what Quarto, Pandoc and the hand-written tools emit. The cost is code to maintain; the benefit is that no workflow file changed and the weather data publishers were not touched. `site-checks.yml` runs `npm ci` and is unaffected.

### The index

Schema version 1 and a content hash (the first 16 hex characters of the SHA-256 of the pages, so the same render gives the same hash; no timestamp). The file is `{ v, hash, pages: [{ h, t, d, p }] }` with `h` the page key (`posts/x/index.html`, `tools/index.html`), `t` the title, `d` the description and `p` the passages, each `[anchor, heading, text, code]` with `code` left out when empty.

**Which pages.** The two listings in `search/index.qmd`, read from the rendered search page's JSON blocks: 47 pages (25 posts and 22 others). Page titles and descriptions come from there too, with entities decoded.

**What is removed.** Everything outside the page's `main` (navbar, footer, table of contents) and inside it the title block (title, description, byline, so the meta is gone), every `nav` (the phone contents list and the "All writing" link), listing empty states ("No matching items", the tools filter slot and its empty message), code copy and callout buttons, scripts, styles, footnote reference numbers and footnote back arrows, and anything hidden or `aria-hidden`. Figure captions are kept. Image alt text is kept as its own line unless it equals the line before it.

**Passages.** A passage starts at each `h2` or `h3` that has an anchor (Quarto puts the id on the section). The text before the first heading is its own passage with no anchor. List items and table cells are separate lines inside a passage; the timeline and work rows have headings without anchors, so they stay inside their section. A section longer than 1,000 characters is split between blocks (paragraphs, list items, table cells), never inside one, and each part keeps the anchor and heading. The limit is about one MiniLM input (256 word pieces), which stage 2 will want. A heading with nothing under it still makes a passage so its title can be found. Result: 459 passages, median 635 characters, 90th percentile 959, longest 1,000.

**Math and code (chosen on purpose).** Several posts are derivations and some facts and flags live in code, so neither is thrown away, and neither is allowed to spoil a snippet.
- Inline math stays in the prose as readable text: Greek letter commands become the letters, a few operators become symbols (`\times` becomes ×), wrappers such as `\text{CO}` are unwrapped, `\frac{a}{b}` becomes (a)/(b), other commands are dropped. The old page turned `N \times N` into "N N".
- Display math is left out of the prose.
- The searchable words of all formulas (text inside `\text` and similar wrappers, function names such as `softmax`, Greek letter names such as `theta`) and all code blocks go into a fourth field of the passage, `code`. The ranker counts that field at half the weight of body text and snippets never show it. Bare letters in formulas are variables and are not indexed.
- The reason for a separate field instead of mixing code into the text: a flag like `--parallel` or a name like `llama-server` becomes findable, the passage the page links to can still be quoted as clean prose, and the ranker can switch the field off, which the evaluation does as an ablation. 121 of the 459 passages have a code field, 32,917 characters in all.
- The evaluation set has no query whose answer lives only in code or a formula, so it cannot show the field's benefit. It also cannot show harm: switching it off changes the result by about one query (see the ablations).

**Tools.** The 14 standalone tools are indexed from their own HTML: the visible text of the body, with the title block, the back link, scripts, hidden elements and text areas left out, plus input placeholders. Buttons and labels are kept because on a tool they are the interface words. Each tool is one passage of 59 to 362 characters. The title and description come from the catalog listing. This is thin: a tool's own text is labels such as "Grayscale" and "Download".

**The weather page** keeps `match-body: false`: title and description only, no passages. Open point: the evaluation set grades it as an answer to `question-04` ("where does the india weather page get its aqi numbers"), because its footnote names the data sources. It is found anyway, at rank 2 behind the post that describes it, through its description. Whether to index its body is for Aayush; its body is mostly map controls and status text.

**Size and time.** 346,530 bytes raw (338 KB), 117,508 bytes gzipped at level 9, 47 pages and 459 passages, built in 60 to 82 ms. Quarto's `search.json` was 394,989 bytes raw and 121,895 gzipped. The index is not much smaller than the old file because it now carries what the old file lacked (the tools, the text before the first heading, code) and drops what was noise. An anchor check of every passage against the rendered HTML found 404 anchors and 0 missing.

### The ranking

- **Okapi BM25 over passages**, k1 1.2 and b 0.75, the usual defaults, with the non-negative form of idf, `ln(1 + (N - n + 0.5) / (n + 0.5))`. I did not tune k1 or b: with 40 queries any change would be fitted to the set.
- **Fields.** A passage is made of the page title, its heading, its text and its code words, counted 3, 2, 1 and 0.5 times. The weights are conventional (title above heading above body), chosen before scoring and not tuned. The weighted sum is the term frequency and the weighted length is the length. The title is part of every passage of its page, so a title match lifts all of its passages. Each page also has a passage made of its description, linked to the page itself.
- **One row per page**: the best passage's score. The row links to that passage's section and its text is the snippet. A page matched only by its description or title shows the description. Other passages of the page add nothing; I did not try to sum them.
- **Last word as a prefix.** While the query ends in a letter or digit, its last word also matches every indexed word that starts with it, as one term (the term frequencies are added and the document frequency is the union), from two letters up. A trailing space ends the word and turns the prefix off. One letter is not expanded because it matches most of the vocabulary.
- **Stop words.** The list in `search/index.qmd` is dropped from a query unless nothing else is left, as before.
- **Module format.** An ES module, loaded by the page with `<script type="module">` and imported by Node. The alternative, a classic script that also exports for Node, does not load from a `type: module` package without a workaround, and a build step for one file was not worth it. Module scripts are deferred, so the page script runs after the document is parsed, which it assumed anyway.
- **Highlighting** uses the same stemming, so "fill gap" marks "fills" and "gaps"; the module returns the matching ranges and the page builds the `<mark>` elements.
- **Until the index arrives**, and if it cannot be read, the page ranks the titles and descriptions of the listings and the status text changes to "Titles and descriptions only", as before.

**Variants, measured and not assumed.** Stemming in three kinds (none; the S stemmer, which strips plurals only; the Porter stemmer) crossed with the last word as a prefix on or off, so six variants, run on the clean index and on Quarto's `search.json`. Three ablations on the chosen one: the code field off, all field weights equal, and stop words kept. Stemming is applied to the index and to the query, and words with digits or non-Latin letters (`gemma4`, `h200`) are left alone.

### The evaluation

`run-eval.mjs` imports `static/js/search-rank.js`, the file the page loads, and runs it in Node over the rendered `search-index.json`, scores `questions.json` (unchanged, file hash ea19782d861a) and writes `results/<run>.json` (per query: the rank of every judged page and the top 10 with scores) and `results/<run>.md`. The metrics are the README's: recall at 5 (the share of grade 2 pages in the top 5), MRR at 10 and nDCG at 10 with gains 2 and 1, per type and overall on the 36 answerable queries, and for the 4 queries with no answer, how many results come back and the top score. Two additions: a typing replay (every answerable query whose last word has four or more letters, with that word cut to its first half, 31 queries) and the effect of hiding results below a fraction of each query's top score. Runs:

- `placeholder-quarto`: the step one ranking over Quarto's `search.json`, run from `baseline-placeholder.mjs`, a copy of the old cleaning and `rankPages` with the DOM taken out. The replay reproduces the behaviors recorded in the step one entry exactly: "attention" gives 6 results with the FlashAttention post first, "resiz" 5, "geophysics" 0, "geophysic" 2, "kalman fil" 1 and "how does flash attention work" 4. It counts 180 passages from 32 pages where that entry said 156 from 31; the behaviors match, so I do not know the reason for the difference in the count and I did not look further.
- `bm25-quarto.<variant>`: the same BM25 over the same cleaned passages of Quarto's `search.json`. This was cheap and fair (the ranker is the only change). It shows the effect of the ranker alone.
- `bm25-clean.<variant>` and three ablations: the ranker and the new index together.

**Results on the 36 answerable queries** (recall at 5, MRR at 10, nDCG at 10; typing replay MRR at 10; counts are queries, and one query moves a type by 17 to 25 points, so differences of one query are noise):

| Run | Recall@5 | MRR@10 | nDCG@10 | Typing MRR@10 |
|---|---|---|---|---|
| placeholder over search.json | 0.33 | 0.39 | 0.34 | 0.42 |
| BM25 exact, search.json | 0.69 | 0.56 | 0.62 | 0.52 |
| BM25 prefix, search.json | 0.71 | 0.59 | 0.64 | 0.60 |
| BM25 s, search.json | 0.66 | 0.58 | 0.64 | 0.55 |
| BM25 s-prefix, search.json | 0.71 | 0.64 | 0.69 | 0.64 |
| BM25 porter, search.json | 0.71 | 0.61 | 0.68 | 0.57 |
| BM25 porter-prefix, search.json | 0.71 | 0.63 | 0.70 | 0.67 |
| BM25 exact, clean index | 0.67 | 0.56 | 0.61 | 0.51 |
| BM25 prefix, clean index | 0.69 | 0.59 | 0.64 | 0.59 |
| BM25 s, clean index | 0.69 | 0.58 | 0.62 | 0.51 |
| BM25 s-prefix, clean index | 0.75 | 0.61 | 0.67 | 0.62 |
| BM25 porter, clean index | 0.75 | 0.64 | 0.70 | 0.60 |
| **BM25 porter-prefix, clean index (the default)** | **0.75** | **0.64** | **0.71** | **0.68** |
| ablation: code field off | 0.78 | 0.62 | 0.70 | 0.68 |
| ablation: all field weights equal | 0.75 | 0.62 | 0.69 | 0.66 |
| ablation: stop words kept | 0.72 | 0.68 | 0.71 | 0.68 |

**Recall@5 / MRR@10 per type** (queries per type: lookup 4, topic 4, question 5, paraphrase 6, partial 5, tool 4, person 4, multi 4):

| Run | lookup | topic | question | paraphrase | partial | tool | person | multi |
|---|---|---|---|---|---|---|---|---|
| placeholder over search.json | 1.00 / 1.00 | 0.75 / 0.75 | 0.20 / 0.40 | 0.00 / 0.00 | 0.40 / 0.40 | 0.00 / 0.00 | 0.25 / 0.25 | 0.25 / 0.50 |
| BM25 exact, search.json | 1.00 / 1.00 | 1.00 / 0.83 | 1.00 / 0.87 | 0.33 / 0.12 | 0.20 / 0.07 | 0.75 / 0.46 | 0.50 / 0.38 | 0.92 / 1.00 |
| BM25 prefix, search.json | 1.00 / 1.00 | 1.00 / 0.83 | 1.00 / 0.90 | 0.33 / 0.12 | 0.40 / 0.27 | 0.75 / 0.46 | 0.50 / 0.38 | 0.92 / 1.00 |
| BM25 s, search.json | 1.00 / 1.00 | 1.00 / 0.83 | 1.00 / 0.90 | 0.00 / 0.09 | 0.40 / 0.27 | 0.75 / 0.46 | 0.50 / 0.38 | 0.92 / 1.00 |
| BM25 s-prefix, search.json | 1.00 / 1.00 | 1.00 / 0.83 | 1.00 / 0.90 | 0.00 / 0.09 | 0.80 / 0.67 | 0.75 / 0.46 | 0.50 / 0.38 | 0.92 / 1.00 |
| BM25 porter, search.json | 1.00 / 1.00 | 1.00 / 0.83 | 1.00 / 0.87 | 0.17 / 0.10 | 0.40 / 0.40 | 0.75 / 0.46 | 0.75 / 0.46 | 0.92 / 1.00 |
| BM25 porter-prefix, search.json | 1.00 / 1.00 | 1.00 / 0.83 | 1.00 / 0.87 | 0.17 / 0.09 | 0.60 / 0.60 | 0.75 / 0.46 | 0.50 / 0.41 | 0.92 / 1.00 |
| BM25 exact, clean index | 1.00 / 1.00 | 1.00 / 0.88 | 1.00 / 0.87 | 0.17 / 0.10 | 0.20 / 0.10 | 0.75 / 0.46 | 0.50 / 0.38 | 1.00 / 1.00 |
| BM25 prefix, clean index | 1.00 / 1.00 | 1.00 / 0.88 | 1.00 / 0.87 | 0.17 / 0.09 | 0.40 / 0.30 | 0.75 / 0.46 | 0.50 / 0.38 | 1.00 / 1.00 |
| BM25 s, clean index | 1.00 / 1.00 | 1.00 / 0.88 | 1.00 / 0.87 | 0.17 / 0.06 | 0.40 / 0.30 | 0.75 / 0.46 | 0.50 / 0.38 | 1.00 / 1.00 |
| BM25 s-prefix, clean index | 1.00 / 1.00 | 1.00 / 0.88 | 1.00 / 0.87 | 0.17 / 0.06 | 0.80 / 0.60 | 0.75 / 0.46 | 0.50 / 0.38 | 1.00 / 0.88 |
| BM25 porter, clean index | 1.00 / 1.00 | 1.00 / 0.88 | 1.00 / 0.87 | 0.33 / 0.16 | 0.40 / 0.40 | 0.75 / 0.63 | 0.75 / 0.44 | 1.00 / 1.00 |
| **BM25 porter-prefix, clean index** | 1.00 / 1.00 | 1.00 / 0.88 | 1.00 / 0.87 | 0.33 / 0.16 | 0.60 / 0.50 | 0.75 / 0.63 | 0.50 / 0.41 | 1.00 / 0.88 |
| ablation: code field off | 1.00 / 1.00 | 1.00 / 0.88 | 1.00 / 0.87 | 0.33 / 0.18 | 0.60 / 0.40 | 0.75 / 0.58 | 0.75 / 0.42 | 1.00 / 0.88 |
| ablation: all field weights equal | 1.00 / 1.00 | 1.00 / 0.88 | 1.00 / 0.90 | 0.33 / 0.14 | 0.60 / 0.50 | 0.75 / 0.56 | 0.50 / 0.40 | 1.00 / 0.75 |
| ablation: stop words kept | 1.00 / 1.00 | 1.00 / 0.88 | 1.00 / 1.00 | 0.17 / 0.12 | 0.60 / 0.50 | 0.75 / 0.63 | 0.50 / 0.54 | 1.00 / 1.00 |

**The four queries with no answer** (results returned, top score): placeholder 0, 0, 0 and 0 results. BM25 on the clean index (porter-prefix): "deploying models on kubernetes" 28 (7.2), "mamba state space language model" 31 (12.5), "rag with a vector database" 9 (5.3), "react hooks tutorial" 2 (6.7). Quarto's `search.json` gave 28, 28, 8 and 2.

**What each part is worth.**
- The ranker alone (same passages): recall at 5 from 0.33 to 0.71 and MRR at 10 from 0.39 to 0.63 (porter-prefix over `search.json`). A large part is that BM25 does not require every query word: 19 of the 36 answerable queries returned no result at all from the placeholder.
- The index on top (same ranker): recall 0.71 to 0.75, MRR 0.63 to 0.64, nDCG 0.70 to 0.71. Small, and inside the noise: one query each in `paraphrase` (recall 0.17 to 0.33), `tool` (MRR 0.46 to 0.63) and `multi` (recall 0.92 to 1.00). I did not trace which feature of the new index caused each. I expected more, and I would not claim more: the set was written from the pages, and most queries already hit text that `search.json` had.
- Stemming: it is the one choice with a clear effect, on `partial` (exact 0.20 recall, porter-prefix 0.60, s-prefix 0.80).
- Prefix: on the complete queries it changes recall by 0.00 to 0.06 (no stemming 0.67 to 0.69, S stemmer 0.69 to 0.75, Porter 0.75 to 0.75), mostly through the `partial` queries. In the typing replay, MRR at 10 goes from 0.60 to 0.68 with Porter and from 0.51 to 0.59 without stemming.
- Field weights: equal weights lose about 0.02 MRR (the multi row 0.88 to 0.75 is one query). Not distinguishable from noise either.
- Code field off: recall 0.78 against 0.75 and MRR 0.62 against 0.64; one query each way. Kept on, because that is where flags live and the set has no query that depends on them.
- Stop words kept: recall 0.72 against 0.75 and MRR 0.68 against 0.64, mixed. The page's own list stays.

**The default: porter stemming with the last word as a prefix, weights 3, 2, 1, 0.5, k1 1.2, b 0.75, on the clean index.** The rule I set before looking: take the best MRR at 10 and, when variants are within 0.02, the simpler one. Porter without prefix and porter-prefix tie on the headline numbers (recall 0.75 and 0.75, MRR 0.64 and 0.64, nDCG 0.70 and 0.71), so by that rule alone the simpler one, without the prefix, would win. I kept the prefix because the page updates on every keystroke and has to match the last word while it is typed, which the 40 complete queries cannot show and the typing replay does (MRR 0.68 against 0.60). The Porter stemmer over the S stemmer because it is ahead on `paraphrase` (recall 0.33 against 0.17) and `tool` (MRR 0.63 against 0.46), each a single query, and ahead overall on MRR and nDCG, while the S stemmer's win on `partial` (recall 0.80 against 0.60) is one query, "tokenizers". None of these differences is larger than one or two queries; I would not defend any of them as a finding, only as a reasonable default.

### Failure analysis (default variant, by type)

- **lookup, topic, question, multi**: recall at 5 is 1.00 for every variant on the clean index. Keyword search is enough for names and topics. `question-05` ("which model did best on the viggo extraction task") has the right post third behind two parts of the same series (grade 1), which is correct behavior for words that all appear in each part, not a miss.
- **paraphrase** (recall 0.33 over 6, MRR 0.16): ranks of the right page were 15, 5, 20, 7, 8 and 2. These queries share almost no content word with their page ("patching holes in a chart that repeats every year" for gap filling in a seasonal series, "the box under my desk" for a personal GPU server). No keyword variant can fix them; every run on both indexes sits at 0.00 to 0.33. This is the case for stage 2.
- **tool** (recall 0.75, MRR 0.63): "make a photo black and white" does not find Image Adjust & Transform at all (rank none; the Binary Mask Creator is first because its description says "black-and-white"). The tool says "Grayscale" and "Invert Colors" and the query says photo, black and white. "pretty print json" puts the YAML to JSON converter first and the JSON formatter second. Needs meaning, not words: stage 2.
- **person** (recall 0.50, MRR 0.41): "what does he do now" finds the About page nowhere in the results (the page is first person: "I started working", "Present"), "has he worked in oil and gas" ranks it 8th (the site never says oil or gas), and "where did he do his phd" ranks it 2nd behind a post about tools. Third person against first person, and a synonym, so stage 2.
- **partial** (recall 0.60, MRR 0.50): "diarisation" returns no result at all: British spelling, and no stem in common with "diarization" (spelling tolerance, such as character n-grams, could fix it; so could an embedding). "tokenizers" ranks the Work page 14th with Porter (which stems it to "token") and first with the S stemmer, which is the stemmer trade-off above. "geophysics" finds the About page second, after Publications (a grade 1 page), through the Porter stem `geophys` and the prefix. "quantiz" and "derive ppo loss" are found first.
- **none**: BM25 returns a result for every query that shares a word. 28, 31, 9 and 2 results, where the placeholder returned 0.

Which ones keyword search cannot fix, in one list: `paraphrase-01` to `paraphrase-05` (`paraphrase-06` is found at rank 2), `tool-02`, `person-02` and `person-03`, and `partial-03` unless spelling tolerance is added. That is 9 of the 36 answerable queries. This is the case for stage 2, and with 36 queries it is a small and uncertain case: the queries were written by a model that had just read every page, so a real visitor may need meaning more than these do.

### Queries the site cannot answer, and a score floor

The page shows every page that matches, with the section counts in the filters, as it always did. No absolute floor is justified. The highest top score among the four no-answer queries is 12.5 ("mamba state space language model", which shares "model" and "space" with real pages), and 28 of the 36 answerable queries have a best right page that scores at or below 12.5, so any floor that silences the no-answer queries removes most real answers. Raw BM25 scores also depend on how many words a query has and how rare they are. A relative cutoff (hide results under a fraction of the query's own top score) is a different idea: at 25 percent it would have lost 1 of the 62 relevant pages in the top 10, at 50 percent 2 of 62, and left 5, 10, 9 and 2 (at 25) or 4, 3, 9 and 1 (at 50) of the no-answer results in the top 10. That is a decision with only 4 no-answer queries behind it, so I did not add it. Left for Aayush, in `TODO.md`.

### Cost

Measured on 2026-11-11 on one laptop (Apple M5 Pro, macOS, arm64), in Chromium 156.0.8078.4 driven by Playwright, served from the same machine. A phone was not measured, and neither was a real network connection. Details are in `results/costs.md`.
- Fetch and prepare the index, fresh page, empty caches, median of 9: fetch 1.1 ms (a local read, not a download), parse 1.1 ms, build the BM25 index 15.5 ms, 17.9 ms in all (worst 18.9 ms).
- Ranking one query over the 40 queries: 0.028 ms median, 0.062 ms for the slowest query's mean, 0.2 ms for the slowest single run. Each query was timed over 500 runs because the browser clock steps in 0.1 ms.
- In Node 24.22.0: index build about 10 to 11 ms, ranking 0.03 ms median and under 0.4 ms worst.
- Download: 117,508 bytes gzipped (346,530 raw). GitHub Pages compresses text, but I did not measure the transfer.

### Tried and dropped, and left alone

- `parse5` for the index script: not installed in the deploy job. A one-line `npm ci --ignore-scripts` in `quarto-publish.yml` would have been the other fix; I chose not to touch the deploy workflow.
- A page-level BM25 (one document per page): it would let a long post's length dominate, and the brief asks for passages.
- Putting the page title only in the description passage: a query with a title word and a body word would match no single passage.
- A UMD file: see the module format above.
- Summing the passages of a page instead of taking the best: not tried.
- Not changed: `questions.json` and its README. Judgments I would look at again: `question-04` grades the weather page 2 although its body is deliberately not indexed (it is found through its description at rank 2, so the score does not penalize the choice); `person-02` grades About 2 for "oil and gas", which the site never says.

### Checks (Node 24.22.0, from a temporary download outside the repo)

- `npm ci --ignore-scripts`: 0 vulnerabilities.
- `npm run check:secrets`: Secret scan: 273 tracked files clean. That scan skips untracked files, so the new and edited files (56 of them, untracked and modified, including the evaluation results) were also scanned with the repo's own `scanText`: 0 hits.
- `npm run check:posts`: Post metadata: 25 posts passed.
- `npm test`: 58 tests, 58 pass, 0 fail (38 before this step, 9 new for the index builder and 11 for the ranking module).
- `node _devlog/local-search/evals/check-questions.mjs`: ok (40 queries, unchanged).
- `quarto render --clean`: completed, with the post-render line "Search index: 47 pages and 459 passages in 67 ms".
- `npm run check:site`: Rendered site: 50 HTML pages and 5676 references passed.
- `npm run test:browser`, 105 tests with the new search test, run four times. Run 1: 97 passed, 8 failed. Run 2: 97 passed, 8 failed (a different set). Run 3, with `--workers=2`: 100 passed, 5 failed. Run 4: 100 passed, 5 failed. The failures were all `Test timeout of 30000ms exceeded` in `page.goto` (waiting for the load event) or in `settled`, none was an overflow assertion. In runs 3 and 4 they were the same five: the posts `2025-09-08-building-gpt-from-scratch` (390 or 1280 px), `2025-12-28-sft-from-scratch` and `2026-02-26-grpo-from-scratch`, which load images from raw.githubusercontent.com. Run 1 and 2 also timed out on `about.html`, `index.html`, `publications.html`, `search/index.html` at 390 px and others. The search test passed every time and so did the search page's two overflow tests in the runs where they were not among the timeouts (in run 2 `search/index.html fits 390px` timed out at 30.1 s). Fetching one of the grpo images with curl took 60 s once, 1.9 s and 8.2 s for two others, and an sft image took 9.7 s, 0.07 s and 22.0 s on three tries, so external latency on this machine is a likely cause, which fits the unexplained earlier failures. I did not prove it. With `--timeout=150000` the sft and gpt posts passed and the two grpo tests still failed (their nine external images). I changed no test, no timeout in the repo and no config.
- Chromium, outside the repo (a Playwright script, then the same checks in `measure-cost.mjs`): the page's console had no errors or warnings at 1280 and 390 px, and after the load typing issued no request. The only fetch of the site's own was `/search-index.json`; the other fetches in the page's log were Quarto's MathJax loading its speech data from a CDN, which every Quarto page with math support does and which this change did not add.
- Screenshots at 1280 and 390 px of the empty state and of the queries "attention", "geophysics" and "make a photo black and white" were read. Rows keep the homepage row rhythm; snippets read as prose with the matched words marked.

## 2026-11-11, model discussion and what a similar site uses

Recorded so the blog post has the reasoning. Status words: decided means Aayush said so, proposed means my recommendation that he has not approved, open means not settled.

**Model facts, checked on 2026-11-11 against the model pages** (the details and links are in the Models section of `plan.html`).
- EmbeddingGemma 2 (`google/embeddinggemma-2`) exists with an ONNX export. The text model is 175 MB at q4 plus a 32.2 MB tokenizer, about 206 MB in all, not the 175 MB in the earlier notes. It is multimodal (a vision encoder adds 109 MB), outputs 768 dimensions, expects a query prefix and a document prefix, and needs a recent Transformers.js.
- all-MiniLM-L6-v2 is 23 MB quantized and runs on WebAssembly. LFM2.5-Embedding-350M has no browser export, so it is not a candidate now.
- GitHub Pages cannot enable cross-origin isolation, so WebAssembly inference is single threaded.

**Aayush's question (2026-11-11): use EmbeddingGemma and its truncated embeddings for search.** The reasoning given back:
- Truncation shrinks the stored vectors, not the model. For roughly 500 passages that is about 1.5 MB at 768 dimensions and about 0.5 MB at 256. The browser still runs the full model to embed the query, so the download stays about 206 MB and the model wants WebGPU.
- Query and passages must come from the same model, so truncation cannot replace a small model for phones and devices without WebGPU.
- It does simplify stage 3: embed once at full size at build time and ship a truncated copy.
- Not verified: the first EmbeddingGemma was trained for truncation to 512, 256 and 128 dimensions. Whether EmbeddingGemma 2 is has to be checked on its model card.
- Open: a simpler plan may be enough, BM25 for everyone plus EmbeddingGemma for visitors who opt in, with no MiniLM stage.

**Proposed, not yet approved by Aayush.** Before any browser work for stage 2, an offline comparison in Node on the 40 queries: BM25 alone, MiniLM, the potion static table (float32 and int8, at 256 and 128 dimensions), and EmbeddingGemma 2 at 768, 512, 256 and 128 dimensions, each alone and fused with BM25. Stage 1 now gives it a baseline: BM25 porter-prefix scores 0.75 recall at 5 and 0.64 MRR at 10 on the answerable queries, with `paraphrase`, `person`, `tool` and the spelling query as the failures a model has to fix.

**What a similar personal site uses.** Bart de Goede's site (bart.degoe.de), read on 2026-11-11 from its own articles "Semantic search in your browser" (July 2026) and "RAG with a small language model in the browser" (October 2026). Everything in this list is that author's reported design and numbers; none of it was reproduced here.
- Keyword search is Fuse.js (fuzzy matching), not BM25. It earlier used Lunr.js.
- Semantic search is the model2vec `potion-base-8M`, a static lookup table and not a neural network: tokenize, look up one row per token, average, normalize. The table is about 30 MB as float32 (29,528 tokens by 256 dimensions) and ships at about 4 MB after int8 quantization; his build command uses 128 dimensions. He reports cosine 0.99996 against float32 for the int8 table, a query in about 0.4 ms, and that the table scored as well as quantized all-MiniLM-L6-v2 (23.45 MB with its runtime, about 18 ms per query) on his 30 queries over 13 posts. The table loads lazily when the search box is focused, with no opt-in.
- Keyword and semantic rankings are combined with reciprocal rank fusion, k = 60, and chunks are grouped per post. Posts are split into overlapping chunks of about 600 characters with code blocks removed. Search is a brute force scan.
- Answers: the default model is Qwen3-0.6B (579 MB, q4f16) on Transformers.js in a Web Worker, WebGPU with a WebAssembly fallback, loaded by an explicit click, with the top four passages, at most two sentences, and no model call when the best passage scores below 0.45. On his 30 answerable and 15 unanswerable questions he reports faithful answers and invented answers as follows: SmolLM2-135M 0 and 14, SmolLM2-360M 3 and 15, Gemma 3 270M 3 and 13, LFM2.5-350M 11 and 13, Qwen3-0.6B 18 and 6, Gemma 4 E2B (3.1 GB, not shipped) 28 and 0.
- My reading, for what this means for our plan: a 4 MB static table is small enough to load without asking, which would make stage 2 much lighter than a 23 MB model if it holds on this site's queries. His numbers are also a reason to measure LFM2.5-350M carefully before offering answers. Both are open until measured here.

**Plan page.** While I was building stage 1 I changed one row in the Models table of `plan.html` (the 4 MB static table row now says potion-base-8M quantized to int8, from his article). The orchestrating session then asked me to stop editing that page because another agent is rewriting it; I left that one edit as it was and changed nothing else there.

## 2026-11-11, stage 2: the offline embedding comparison

### The plan changed

On 2026-11-11 Aayush set the plan as three stages, replacing the five-stage proposal. (1) The baseline, then BM25: done. (2) Keyword plus semantic search, comparing embedding models and comparing BM25 plus semantic against BM25 alone. (3) A language model that answers from the search results, with two or three small choices and one loaded on demand. He asked for all-MiniLM-L6-v2 to be included in the stage 2 comparison. A larger embedding model on WebGPU is no longer a stage of its own: EmbeddingGemma 2 is measured here only as a reference for what a large model would add. Stage 3 research was also done today and is in `research/2026-11-11-answer-models.md`. Every stage 3 model is loaded only when the visitor asks, and each has a file over GitHub's 100 MiB limit, so they would load from huggingface.co. The candidates proposed for comparison (proposed, not decided) are three small models: LiquidAI LFM2.5-350M, Qwen3.5-0.8B text only and stock Qwen3-0.6B, with Gemma 4 E2B as an offline reference only.

Two decisions by Aayush on 2026-11-11, recorded without a reason because he gave none. The site will not use the Qwen3-0.6B RAG fine-tune `bartdegoede/qwen3-0.6b-small-rag`, which the research had recommended testing first because it was the only small model with published evidence of declining unanswerable questions (0 of 15 invented and 16 of 30 faithful, reported by its author on his own site). The site will also not use a larger on-demand answer model, neither LiquidAI LFM2.5-1.2B-Instruct nor LFM2-1.2B-RAG.

This entry is the offline part of stage 2. It is measurements in Node and a recommendation, not a feature: no browser was used and no site code changed.

### What was run

Everything is in `_devlog/local-search/evals/embed/` (its own `package.json`, Transformers.js 4.3.2 as the research file names it, `node_modules` and the lockfile resolved by `npm install --ignore-scripts` under Node 24.22.0 from a temporary download outside the repo) with results in `evals/results/stage2/`. Model files and vectors live outside the repo in the session scratchpad. The root `.gitignore` only ignores `/node_modules/` at the repo root, so it does not cover this folder; I added `evals/embed/.gitignore` with `node_modules/` rather than editing the root file. `git check-ignore` confirms the folder is ignored.

- `data.mjs`: the fixed order of the 459 passages of `_site/search-index.json` (hash 759f6c5572dd74aa, 346,530 bytes, the same render as stage 1; I did not re-render) and the 40 queries, plus the passage text choices.
- `embed.mjs <model>`: loads one model and writes passage and query vectors, timings, file sizes and sanity checks. Transformer models run through `AutoModel` on `onnxruntime-node` on the CPU. The static potion tables are read from `model.safetensors` and tokenized with Transformers.js' tokenizer (no special tokens, unknown token dropped, rows averaged, normalized, which is how Model2Vec encodes). The int8 table is one symmetric scale over the whole table, the 128 dimension table is PCA the way scikit-learn does it (centered, top eigenvectors of the covariance by Jacobi sweeps). Both are my reimplementation, not Model2Vec's own quantize step, which I did not run (no Python was installed for this).
- `score.mjs`: the scoring of `run-eval.mjs` copied (importing `run-eval.mjs` runs and rewrites the whole stage 1 evaluation). `compare.mjs` reproduces `results/bm25-clean.porter-prefix.json` through `static/js/search-rank.js` and stops with an error unless every query's recall, reciprocal rank, nDCG and result count are identical and the index hash matches. It did not stop.
- `compare.mjs` then ranks every configuration alone and fused with BM25 and writes `results/stage2/summary.md` (all the tables), one `.json` per configuration (per-query ranks, top 10 with scores, per-type numbers, the no-answer gate numbers), `wins-and-losses.json` and `bm25.json`. `costs.mjs` writes `costs.md`.
- Network: the only requests were `npm install` and each model's own files from huggingface.co, anonymous. No token, no account, no telemetry setting. Nothing was gated.

### Choices, each with its reason

- **What a passage is.** The headline text is the page title, the section heading and the prose, one per line. A passage such as "My pick is Qwen3.5-27B ..." does not say what it is about without them, and a visitor's query often names the topic of the page, not the section. EmbeddingGemma's document format has a title slot, so for it the page title goes there and the heading in front of the prose (`title: {page title} | text: {heading} {prose}`); the others get the same text without a slot. One choice for all models. Ablations: the prose alone (`plain`), and the code and formula words appended (`code`).
- **The code and math field** is left out of the headline text. Models read prose, MiniLM would cut the appended words off anyway (its limit is 256 word pieces and 25 of the 459 titled passages are already longer, so their tails are cut), and the field was built for keyword matching. It is an ablation.
- **Prefixes and limits as documented.** leaf-ir and arctic: the query prefix `Represent this sentence for searching relevant passages: `, none on documents. EmbeddingGemma 2: `task: search result | query: ` on queries, the title format above on documents, text only (vision and audio configs removed), q4. MiniLM: no prefix, mean pooling, 256 word pieces. leaf-ir 512, arctic 512, Gemma 8192 (the longest passage is 511 pieces for Gemma, so nothing is cut). Potion: no limit, no prefix.
- **One row per page** from its best passage and cosine similarity, the same page list and the same scoring as stage 1. **Hybrid** is reciprocal rank fusion of the two whole rankings with k = 60. Nothing was tuned: other k values and a variant that fuses only the first 10 rows of each list are ablations, and 60 and whole lists stay the headline.
- **The page descriptions.** BM25 has one extra passage per page made of its description. The brief said 459 passages, so the headline embeds only those, and the weather page (`match-body: false`, no passages) can never be found by an embedding. That costs every hybrid one answerable query, `question-04`. The ablation `desc` embeds the 47 descriptions too. I report both and say where they differ.
- **Int8 passage vectors** use one scale for the whole matrix (largest absolute value) and queries stay float; **truncation** keeps the first dimensions and renormalizes, as the leaf-ir and EmbeddingGemma cards say.
- Models run: the five of the brief, plus `potion-retrieval-32M`, plus `arctic-embed-m-v1.5` on both sides and as passage vectors for leaf-ir queries ("asym"). Gemma was also cut to 512 and 128 dimensions because it was free.

### Checks before trusting a model (all run)

- Dimensions: potion 256 and 512, MiniLM 384, leaf-ir 768, arctic 768, Gemma 768, as the cards say. leaf-ir, arctic and Gemma return unit length vectors from `sentence_embedding` (norm 1.00); MiniLM is mean pooled then normalized by my code, as its card says. The potion config has `normalize: true`; the tables already carry the Zipf weighting (`apply_zipf: true`) and a first PCA to 256.
- Three (query, related, unrelated) pairs per model scored in the right order for every model and every potion variant (3 of 3).
- The cards' own examples: leaf-ir at 8 bit gave 0.678, 0.454, 0.422, 0.569 against the card's fp32 0.6857, 0.4598, 0.4238, 0.5723. EmbeddingGemma 2 at q4 gave 0.684, 0.854, 0.752, 0.783, which is the card's list to the third decimal.
- Not checked: the potion tables against Model2Vec's own Python output, because Model2Vec was not run.

### Results

Scored on the 36 answerable queries, recall at 5, MRR at 10, nDCG at 10. A query moves a per-type score by 17 to 25 points and the overall score by about 0.03, so a difference of one or two queries is noise.

| Configuration | Recall@5 | MRR@10 | nDCG@10 |
|---|---|---|---|
| BM25 alone (stage 1 default) | 0.75 | 0.64 | 0.71 |
| potion-base-8M, fp32 table, 256 dims, alone | 0.87 | 0.70 | 0.76 |
| potion-base-8M, fp32 table, 256 dims, plus BM25 | 0.85 | 0.75 | 0.80 |
| potion-base-8M, int8 table, 256 dims, alone | 0.87 | 0.70 | 0.76 |
| potion-base-8M, int8 table, 256 dims, plus BM25 | 0.85 | 0.75 | 0.79 |
| potion-base-8M, int8 table, PCA 128 dims, alone | 0.77 | 0.63 | 0.71 |
| potion-base-8M, int8 table, PCA 128 dims, plus BM25 | 0.82 | 0.73 | 0.76 |
| all-MiniLM-L6-v2, q8, 384 dims, alone | 0.94 | 0.77 | 0.80 |
| all-MiniLM-L6-v2, q8, 384 dims, plus BM25 | 0.85 | 0.74 | 0.80 |
| mdbr-leaf-ir, q8, 768 dims, alone | 0.96 | 0.81 | 0.85 |
| mdbr-leaf-ir, q8, 768 dims, plus BM25 | 0.85 | 0.80 | 0.84 |
| mdbr-leaf-ir, q8, 256 dims, alone | 0.96 | 0.83 | 0.85 |
| mdbr-leaf-ir, q8, 256 dims, plus BM25 | 0.85 | 0.83 | 0.85 |
| EmbeddingGemma 2 text, q4, 768 dims (reference), alone | 0.98 | 0.89 | 0.89 |
| EmbeddingGemma 2 text, q4, 768 dims (reference), plus BM25 | 0.85 | 0.80 | 0.83 |
| EmbeddingGemma 2 text, q4, 256 dims (reference), alone | 0.86 | 0.88 | 0.84 |
| EmbeddingGemma 2 text, q4, 256 dims (reference), plus BM25 | 0.89 | 0.78 | 0.80 |

Extra rows (recall@5, MRR@10, nDCG@10, alone then plus BM25): potion-retrieval-32M fp32 512 dims 0.90, 0.77, 0.82 then 0.85, 0.72, 0.78; the same model int8 at PCA 128 0.83, 0.61, 0.70 then 0.81, 0.67, 0.75; arctic-embed-m-v1.5 on both sides 0.96, 0.86, 0.89 then 0.85, 0.76, 0.81; leaf-ir queries against arctic passages 0.96, 0.85, 0.88 then 0.82, 0.77, 0.82 (256 dims: 0.95, 0.84, 0.86 then 0.82, 0.78, 0.82). Asymmetric search did not beat leaf-ir alone: against leaf-ir it fixes no query and breaks `paraphrase-01` in the hybrid.

Recall@5 / MRR@10 per type for the hybrids (queries per type: lookup 4, topic 4, question 5, paraphrase 6, partial 5, tool 4, person 4, multi 4):

| Configuration | lookup | topic | question | paraphrase | partial | tool | person | multi |
|---|---|---|---|---|---|---|---|---|
| BM25 alone | 1.00 / 1.00 | 1.00 / 0.88 | 1.00 / 0.87 | 0.33 / 0.16 | 0.60 / 0.50 | 0.75 / 0.63 | 0.50 / 0.41 | 1.00 / 0.88 |
| potion-base-8M 256, plus BM25 | 1.00 / 1.00 | 1.00 / 0.88 | 0.90 / 0.87 | 0.67 / 0.56 | 0.80 / 0.70 | 0.75 / 0.63 | 0.75 / 0.63 | 1.00 / 0.88 |
| MiniLM, plus BM25 | 1.00 / 1.00 | 1.00 / 0.88 | 0.90 / 0.87 | 0.67 / 0.55 | 0.80 / 0.59 | 0.75 / 0.63 | 0.75 / 0.63 | 1.00 / 0.88 |
| leaf-ir 768, plus BM25 | 1.00 / 1.00 | 1.00 / 1.00 | 0.90 / 0.90 | 0.67 / 0.50 | 0.80 / 0.72 | 0.75 / 0.75 | 0.75 / 0.75 | 1.00 / 0.88 |
| leaf-ir 256, plus BM25 | 1.00 / 1.00 | 1.00 / 1.00 | 0.90 / 0.90 | 0.67 / 0.60 | 0.80 / 0.72 | 0.75 / 0.75 | 0.75 / 0.75 | 1.00 / 1.00 |
| EmbeddingGemma 2 768, plus BM25 | 1.00 / 1.00 | 1.00 / 1.00 | 0.90 / 0.87 | 0.67 / 0.53 | 0.80 / 0.72 | 0.75 / 0.63 | 0.75 / 0.75 | 1.00 / 1.00 |

The same per type table for each model alone is in `summary.md`. Alone, the transformers are strong on `paraphrase` (MiniLM 1.00 recall, leaf-ir 0.83, Gemma 1.00, potion 0.67) and `person` (MiniLM, leaf-ir and Gemma 1.00, potion 0.75). Where the hybrid and the semantic ranking disagree, the next section explains why.

### Whether fusing helps, and one thing to know about it

Every model alone has higher recall at 5 than the same model fused with BM25 (for example leaf-ir 0.96 alone and 0.85 fused, Gemma 0.98 and 0.85, MiniLM 0.94 and 0.85, potion 0.87 and 0.85). MRR and nDCG are close or better in the hybrids for potion, and lower for the transformers. Fusing is still better than BM25 alone on every measure for every model, and it keeps the exact-word guarantee (`lookup`, `question`) that a semantic ranking lacks: MiniLM alone drops `lookup-02` ("jmi-res") out of the top 5.

The cause is how reciprocal rank fusion treats a long BM25 list. BM25 returns every page that shares a word with the query (28 pages for "make a photo black and white" and none of them is the right one), and each of them gets a share from BM25 on top of whatever the semantic ranking gives it. A page that only the semantic ranking finds gets one share, so it loses to any page BM25 ranks that the semantic ranking also lists. `tool-02` is first to fourth semantically for every transformer and 27th in every hybrid; `person-03` is second and 16th. This is behavior of the method at k = 60, not a bug: ranks and scores were checked against the saved vectors. Ablations, reported and not adopted: k of 10, 20 or 100 changes little (recall 0.82 to 0.88 for MiniLM, leaf-ir and Gemma); fusing only the first 10 rows of each list gives recall 0.85, 0.88, 0.90 and 0.90 for potion, MiniLM, leaf-ir and Gemma, MRR 0.76, 0.75, 0.81 and 0.81. I did not choose a cutoff from this; it is a design question for the browser stage, with 40 queries behind it.

### Fixed and broken, against BM25 alone (recall at 5; hybrid with the headline text)

| Configuration | Fixed | Broken |
|---|---|---|
| potion-base-8M 256 (fp32 or int8) | paraphrase-04, paraphrase-05, partial-03, person-02 | question-04 |
| potion-base-8M int8 PCA 128 | paraphrase-05, partial-03, person-02 | question-04 |
| all-MiniLM-L6-v2 | paraphrase-04, paraphrase-05, partial-03, person-02 | question-04 |
| mdbr-leaf-ir 768 and 256 | paraphrase-01, paraphrase-04, paraphrase-05, partial-03, person-02 | question-04, paraphrase-06 |
| EmbeddingGemma 2 768 | paraphrase-04, paraphrase-05, partial-03, person-02 | question-04 |
| EmbeddingGemma 2 256 | paraphrase-01, paraphrase-03, paraphrase-04, paraphrase-05, partial-03, person-02 | lookup-02, question-04 |

`question-04` is the weather page, which has no passages (see the choices). With the 47 descriptions embedded, it stops being lost for potion, MiniLM and Gemma, and leaf-ir loses only `paraphrase-06` (BM25 has it at rank 2, leaf-ir alone at rank 20, the hybrid at 7). The hybrid recall with descriptions is 0.86 for potion (int8 256 dims 0.86, 128 dims 0.83), 0.85 for MiniLM, 0.86 for leaf-ir and 0.89 for Gemma; MRR 0.75, 0.72, 0.78 and 0.79. The adoption comparisons below give the same answer with and without them.

Between models, hybrids (recall at 5, one query at a time):
- leaf-ir against potion 256: fixes `paraphrase-01`, breaks `paraphrase-06`.
- leaf-ir against MiniLM: fixes `paraphrase-01`, breaks `paraphrase-06`.
- MiniLM against potion: fixes none, breaks none (with descriptions: fixes none, breaks `partial-03`).
- leaf-ir with arctic passages against leaf-ir: fixes none, breaks `paraphrase-01`.
- Gemma 768 against leaf-ir: fixes `paraphrase-06`, breaks `paraphrase-01`.
- Gemma 768 against potion 256: fixes none, breaks none (with descriptions: fixes `paraphrase-03`, breaks none).
- potion int8 256 against int8 128: fixes `paraphrase-04`, breaks none.
- Truncation: leaf-ir 256 against 768 fixes none and breaks none in the hybrid. Gemma 256 against 768 fixes `paraphrase-01` and `paraphrase-03` and breaks `lookup-02`.

The same comparisons for the semantic rankings alone, and for the fusion over 10 rows, are in `summary.md`. Alone, leaf-ir fixes `paraphrase-03`, `paraphrase-04`, `partial-04` and `person-03` that potion misses, and Gemma adds none beyond leaf-ir except `paraphrase-06`.

### The nine queries keyword search could not fix

BM25 finds one of them in the top 5 (`paraphrase-02`, rank 5). Semantic rankings alone find all nine for MiniLM, leaf-ir and Gemma 768, and six for potion (`paraphrase-01`, `paraphrase-02`, `paraphrase-05`, `tool-02`, `person-02`, `partial-03`). In the headline hybrids the ones found in the top 5 are:
- potion 256: `paraphrase-02`, `paraphrase-04`, `paraphrase-05`, `person-02`, `partial-03`
- MiniLM and Gemma 768: the same five
- leaf-ir 768 and 256: those five and `paraphrase-01`
- Gemma 256: `paraphrase-01`, `paraphrase-02`, `paraphrase-03`, `paraphrase-04`, `paraphrase-05`, `person-02`, `partial-03`

`tool-02` and `person-03` are not found by any headline hybrid for the reason in the previous section (found at 1 to 4 and 1 to 2 alone, at 27 and 16 to 24 fused). Fused over 10 rows, potion, MiniLM, leaf-ir and Gemma find `tool-02` (leaf-ir and Gemma also `person-03`).

Queries BM25 gets completely right (27 of 36) that a configuration loses, hybrid and headline text: `question-04` for every one (the weather page), and in addition `paraphrase-06` for leaf-ir at both sizes and `lookup-02` for Gemma 256. Nothing else.

### The four queries with no answer

Top cosine of the semantic ranking, and how the right answers of the 36 compare (right page = the best grade 2 page):

| Model | Top cosine for the four no-answer queries | Highest | Right page min / median | Right pages above the highest | AUC |
|---|---|---|---|---|---|
| potion-base-8M 256 | 0.436, 0.402, 0.302, 0.449 | 0.449 | 0.248 / 0.413 | 13 of 36 | 0.66 |
| all-MiniLM-L6-v2 | 0.315, 0.409, 0.358, 0.247 | 0.409 | 0.172 / 0.424 | 23 of 36 | 0.76 |
| mdbr-leaf-ir 768 | 0.469, 0.370, 0.346, 0.394 | 0.469 | 0.250 / 0.439 | 15 of 36 | 0.69 |
| EmbeddingGemma 2 768 | 0.726, 0.695, 0.689, 0.636 | 0.726 | 0.639 / 0.741 | 19 of 36 | 0.83 |

AUC is the chance that an answerable query has a higher top cosine than a no-answer query. No model separates them. A cosine cutoff just above the highest no-answer score silences all four no-answer queries but keeps the right page of only 13 of 36 answerable queries for potion, 23 for MiniLM, 15 for leaf-ir and 19 for Gemma, and loses the rest (23, 13, 21 and 17 queries). Three of the four no-answer queries are near misses on purpose, and the cosine of a near miss is about as high as the cosine of a hard paraphrase. Stage 3 needs a gate that does not rest on this number alone; the language model's own refusal is the obvious second signal, and it has to be measured with the 15 no-answer queries a similar site used, not our four.

### What int8 and fewer dimensions do

Semantic ranking over all 40 queries against the full configuration of the same model (top 5 overlap, queries with the same top page, change in recall@5, MRR@10, nDCG@10, alone then hybrid):
- potion int8 table against fp32: overlap 1.00, 38 of 40 the same, no change alone, nothing above 0.01 in the hybrid. Free.
- potion PCA 128 (int8 or fp32) against 256: overlap 0.84, 33 of 40, alone minus 0.09, 0.07, 0.05, hybrid minus 0.03, 0.03, 0.03. Three alone queries, one hybrid query (`paraphrase-04`).
- MiniLM and leaf-ir passage vectors as int8: overlap 1.00 and 40 of 40 the same, no change. Gemma 768 as int8: 0.99, 40 of 40, no change in the ranking (hybrid plus 0.03 recall from one query, noise).
- leaf-ir 256 against 768: overlap 0.89, 36 of 40, recall unchanged, MRR plus 0.02 alone and plus 0.03 hybrid. leaf-ir survives truncation, as its card says.
- Gemma 768 against 512: overlap 0.91, recall minus 0.04 alone, nothing in the hybrid. Against 256: overlap 0.78, recall minus 0.12 alone and plus 0.04 hybrid. Against 128: overlap 0.65 and 24 of 40, minus 0.17, 0.21, 0.19 alone. The card calls 256 "close to lossless" on its English benchmark; on these 40 queries at q4, 256 dims dropped recall by 0.12 (four queries) alone, which I did not look into. The card also says 128 should be validated on one's own workload, and it degrades here.

### Costs

Measured on one laptop (Apple M5 Pro, 15 cores, 24 GB, macOS, Node 24.22.0, Transformers.js 4.3.2 on onnxruntime-node, CPU) with other work running on it at times. A browser, a phone and a real network were not measured. Full tables, including each file, are in `results/stage2/costs.md`.

| Model | Downloaded (bytes) | Embed 459 passages in Node, default threads / one thread | One query in Node, default threads / one thread (median) |
|---|---|---|---|
| potion-base-8M fp32 table | 30,922,059 (30.2 MB table plus tokenizer) | 74 ms (no threads) | 0.009 ms |
| potion-base-8M int8 table, 256 dims (shipped as one int8 array) | 7,559,168 table plus 683,666 tokenizer; 5,642,563 with brotli | same | 0.008 ms |
| potion-base-8M int8 table, PCA 128 dims | 3,779,584 plus 683,666; 3,093,427 with brotli | same | 0.006 ms |
| all-MiniLM-L6-v2 q8 | 23,685,047 | 3.9 s / 8.1 s | 0.80 / 0.69 ms |
| mdbr-leaf-ir q8 | 23,889,368 | 3.1 s / 7.5 s | 0.75 / 1.09 ms |
| arctic-embed-m-v1.5 q8 | 110,858,964 | 13.4 s / 34.0 s | 2.75 / 5.01 ms |
| EmbeddingGemma 2 text q4 | 206,696,682 (the tokenizer alone is 32,170,510) | 93.5 s / 305.9 s | 16.0 / 59.0 ms |
| potion-retrieval-32M fp32 table | 130,705,239 | 101 ms | 0.015 ms |

- Downloaded bytes are the files Transformers.js saved for each model in its cache (the model, the tokenizer and two small config files). The brotli sizes of the int8 tables were compressed here; the other sizes are raw. I did not check whether GitHub Pages compresses a `.bin` file, so the size a visitor pays could be the raw one.
- The browser also needs the runtime for the three transformers and Gemma: 0.46 MB of JavaScript (108 KB with brotli) and a 26.9 MB WebAssembly file (4.70 MB with brotli). These are figures from the research file, not measured here. A static table needs neither.
- Passage vectors (459, with the 47 descriptions it is 506): float32 at 768 dims 1,410,048 bytes, at 512 940,032, at 384 705,024, at 256 470,016, at 128 235,008; int8 is a quarter of each (at 256 dims 117,504, at 128 dims 58,752). The BM25 index is 346,530 bytes.
- The one-thread timings are the closest to the browser (single threaded) that this run gets. They are still Node and not WebAssembly, so a browser can be slower. A query on any of the CPU models is a few milliseconds or less on this laptop, so the cost is the download, not the per-query time.
- Gemma takes 20.8 s to load and 93.5 s to embed the passages here, which the deploy would pay once per build; it would need a model cache in the workflow.

### Recommendation

**Ship BM25 plus `minishlab/potion-base-8M` as an int8 table at 256 dimensions, fused with reciprocal rank fusion (k = 60), and nothing heavier.** Confidence: moderate that it beats BM25 alone, low to moderate that nothing heavier would earn its place, because the comparison rests on one or two queries in each case.

By the project's rule (a heavier configuration is adopted only if it fixes queries the lighter one misses without breaking ones it got right, ties go to the smaller download):
- BM25 plus potion beats BM25 alone: it fixes four queries (`paraphrase-04`, `paraphrase-05`, `partial-03`, `person-02`) and breaks none once the weather page is given its description passage (with the 459 passages alone it breaks `question-04`, which is the weather page having no passage and not a model failure). Recall 0.75 to 0.85, MRR 0.64 to 0.75, nDCG 0.71 to 0.79, with `paraphrase` recall 0.33 to 0.67, `partial` 0.60 to 0.80 and `person` 0.50 to 0.75.
- MiniLM (23.7 MB) does not earn its place over potion: no query fixed, none broken. leaf-ir (23.9 MB) fixes `paraphrase-01` and breaks `paraphrase-06`. Gemma (206.7 MB) fixes none (with descriptions: one, `paraphrase-03`) and breaks none. Asymmetric leaf-ir with arctic passages fixes nothing over leaf-ir. None of them passes the rule, and all would cost 24 to 207 MB, plus the 5 MB runtime for the first three.
- 256 against 128 dimensions: the 256 table fixes `paraphrase-04` over the 128 table and breaks none, so it passes the rule, but it is one query and the table is twice the size (7.6 MB raw, 5.6 MB with brotli and the tokenizer, against 3.8 MB raw and 3.1 MB). If a first load near 3 MB matters more than one query, take the 128 table, which still gives recall 0.82 and MRR 0.73 against BM25's 0.75 and 0.64.

**Loading.** BM25 results are available at once and the page works without the table. The table is fetched in the background on the first use of the search box on the search page only, never on other pages, with no prompt, because a few MB is the size another personal site loads automatically. At 5.6 to 8.2 MB it is at the top of what I would load without asking; if Aayush thinks that is too much, the 128 table (3.1 to 4.5 MB) is the fallback. A transformer model would load only when the visitor asks, with its size shown (about 29 MB with the runtime for leaf-ir, 212 MB for Gemma), and nothing here argues for building that.

**What this does not settle.**
- The whole case is 36 answerable queries written by a model that had read every page. The fixed queries are mostly paraphrases and person queries. A real visitor may type differently.
- Fusing whole lists leaves a lot of what the models find on the table (the semantic ranking alone has recall 0.94 to 0.98 for the transformers and 0.87 for potion). With fusion over the first 10 rows, leaf-ir would fix `paraphrase-01` and `person-03` over potion and break nothing (with descriptions), which would pass the rule at about four times the download. A choice between fusion variants should be made on queries that are not these 40; I did not tune it.
- Semantic ranking alone was not tried on a half-typed last word (the typing replay of stage 1), and a static table sees word pieces, not words, so a query such as "quantiz" depends on its tokenization. BM25's prefix matching stays in the hybrid for that.
- The potion tables were reimplemented in JavaScript (lookup, mean, int8 with one global scale, PCA). They are consistent with Model2Vec as I know it and pass the sanity checks, but they were not compared with Model2Vec's output.

**What a browser test still has to confirm.** (1) That the query vector computed in the browser, from the same tokenizer and the int8 table, matches the Node vector for all 40 queries (cosine above 0.999) and that the ranking is identical to the offline one. (2) The real download: bytes on the wire for the table and the tokenizer from GitHub Pages (compressed or not), time to first semantic result on a phone and on a slow network, and that BM25 stays responsive while it loads. (3) That a failed or cancelled load leaves BM25 working. (4) Per-query time on a phone (here it is under 0.02 ms in Node). (5) That the table stays cached across visits and what happens when the index hash changes and the passage vectors have to be fetched again (about 118 KB for the 256 dim int8 vectors). (6) How fusion behaves while typing, query by query.

### Tried and dropped, and not done

- Importing `run-eval.mjs` for its scoring (it runs everything on import). The functions were copied into `score.mjs` and checked against the stage 1 result file.
- Pooling the arctic model myself from `last_hidden_state`: its ONNX has no such output (it returns `token_embeddings` and a unit length `sentence_embedding`), so the second is used. The first arctic run failed on this and was rerun.
- The `potion-base-8m-onnx` route with onnxruntime: not needed, the table is read directly.
- fp32 for arctic (a sub-run in the research file), `mxbai-embed-xsmall`, the other models of the research table, and LiquidAI's: not run.
- The weather page's body: still not indexed; the description passages are the only way it is found by an embedding.
- Not measured: a browser, a phone, GitHub Pages compression, WebGPU, any language model.

### Commands and results

Under Node 24.22.0 from a temporary download outside the repo, in `evals/embed/` unless noted:
- `npm install --ignore-scripts`: 43 packages, 0 vulnerabilities.
- `node embed.mjs minilm`, `leaf`, `arctic`, `gemma2`, `potion8`, `potion32r`: all completed; sanity 3 of 3 for each. `node embed.mjs <model> --threads 1 --reps titled` for the four transformers.
- `node compare.mjs`: completed, BM25 reproduced stage 1 query for query. 43 files (including `summary.md` and `costs.md`) in `results/stage2/`.
- `node costs.mjs`: wrote `results/stage2/costs.md`.
- `node ../check-questions.mjs`: ok, `questions.json` unchanged (hash ea19782d861a).

## 2026-11-11, Granite 4.0 350M added to stage 3

Aayush asked which other models in the megabyte range could answer from the search results, and on 2026-11-11 added IBM Granite 4.0 350M (`onnx-community/granite-4.0-350m-ONNX-web`, 357 MB at q4f16, Apache 2.0) to the stage 3 candidates. The options shown to him, from `research/2026-11-11-answer-models.md`, with download and what is known:

- Pleias-RAG-350M, 301 MB: trained for RAG with quoted citations and a reasoning trace that can end in a refusal; its own prompt format and a 4,096 token context; no numbers on this kind of site. Not taken up.
- Granite 4.0 350M, 357 MB: the card lists RAG and question answering among its capabilities; no published numbers; loading in Transformers.js not verified.
- Gemma 3 1B, 784 MB: no published grounded-answering numbers.
- Pleias-RAG-1B, 871 MB: the same design as Pleias-RAG-350M, larger.
- LFM2.5-230M, 216 MB at q4 (no q4f16 export): LiquidAI recommends it for extraction; no numbers; not tagged for Transformers.js.
- Gemma 3 270M, 293 MB: 3 of 30 faithful and 13 of 15 invented on the similar site; WebGPU only there.
- SmolLM2 135M and 360M, 122 and 277 MB: 0 and 14, and 3 and 15, on the similar site.

The stage 3 candidates are now LFM2.5-350M, Granite 4.0 350M, Qwen3.5-0.8B text only and stock Qwen3-0.6B, all loaded only when the visitor asks, with Gemma 4 E2B as an offline reference only. Granite is Aayush's choice; the other three remain proposed.

## 2026-11-11, stage 2 in the browser: the potion table, automatic vectors, fusion

### Approval and its condition

Aayush approved on 2026-11-11: BM25 plus `minishlab/potion-base-8M` as an int8 table at 256 dimensions (about 5.6 MB compressed), loaded on the first use of the search box without asking, with the fusion method improved and checked on queries it was not chosen on. A second requirement came while this was being built: the finished search must keep working automatically as he adds or edits posts and pages, with no manual step. Both are met as described below; the one hand step that remains is listing a page that is not a post in `search/index.qmd`.

### What was built

- `static/search/`: the table as a site asset. `potion-base-8M.int8.bin` is 29,528 rows by 256 dimensions as int8 with one scale for the whole table (0.41306599294106794), 7,559,168 bytes. `potion-base-8M.vocab.txt` is the model's own vocab.txt, one token per line with the line number as the id, 219,690 bytes. `manifest.json` (1,728 bytes) names the model and revision, the dimensions, the quantization and scale, the tokenizer settings and the size and SHA-256 of each file. `NOTICE.txt` has the license (MIT per the model card's metadata; the repository has no license file and the card names no copyright holder, so none is invented), the authors, the citation, the base model and the one change made to it. The training dataset's license was not reviewed. These files are untracked in this worktree: they have to be committed, or a full render fails (see Deploy). They change only when the model changes.
- `scripts/make-search-table.mjs`: the one-off that makes them. It fetches the pinned revision (`bf8b056651a2c21b8d2565580b8569da283cab23`) anonymously from huggingface.co into a cache outside the repo, checks every source file against a SHA-256 pinned in the script (the safetensors hash also equals the LFS hash Hugging Face reports for that revision), refuses a revision whose tokenizer or config differs from what the embedding module implements, and writes the three files. Node built-ins only. 4 unit tests.
- `static/js/search-embed.js`: one pure module, the same file in Node and the browser. BERT WordPiece as the model's tokenizer.json defines it (clean control characters, whitespace to spaces, spaces around CJK, NFD and strip accents, lowercase, split on punctuation, greedy longest match with `##`, a word over 100 characters or with an uncoverable piece becomes the unknown token), the special token strings as tokens, then Model2Vec's encode (cut the text to 512 times the median token length, cut to 512 pieces, drop the unknown token, mean, normalize). Also the int8 passage vector helpers and base64. 9 unit tests, one of them checking the committed table against its manifest and 6 token id lists against Model2Vec's output.
- `scripts/build-search-vectors.mjs`, a second post-render step in `_quarto.yml` after the index step: embeds every passage of `search-index.json` in the order `createIndex` numbers them (each page's description first, then its passages), as the page title, the section heading and the prose, one per line. This is the passage representation the offline comparison chose, and the descriptions are embedded as passages too, which is what let the weather page (no passages of its own) be found and fixed `question-04`. It writes `search-vectors.json`: int8 vectors as base64, the hash of the index they belong to, the model and revision, dimensions, scale, count, and the size, SHA-256 and path of the table and vocabulary it was made with. Deterministic, 173,222 bytes, about 60 ms. It checks the table against the manifest first, and skips a missing index or table in a partial render and fails in a full one, like the index step. 6 unit tests.
- `static/js/search-rank.js` gained `passages` (the shared order), `rankVectors` (one row per page from its best passage by cosine), `fuse` (reciprocal rank fusion with a per-list cut and weights) and `rankHybrid` with `FUSION = { k: 60, tops: [10, 10] }`. `createIndex` was refactored onto `passages` and the stage 1 results still reproduce query for query.
- `static/js/search.js`, `search/index.qmd`, `static/css/search.css`: see Browser. 4 more unit tests for the ranking, and 7 browser tests in `tests/browser/search.spec.mjs` (hybrid ready after first use, a paraphrase that keywords miss, Show all with the counts, typing makes no request once the files are loaded, and the four failure cases).
- `scripts/check-site.mjs` gained `checkSearch` (see The guard) and `scripts/check-search.test.mjs` (8 tests).
- `_devlog/local-search/evals/stage2-browser/`: `harness.mjs`, `run-fusion.mjs`, `parity-browser.mjs`, `costs-browser.mjs`, `cache-check.mjs`, `e2e-new-post.mjs`, `screenshots.mjs`; `evals/embed/crosscheck-model2vec.mjs` and `model2vec-reference.py`. Results are in `evals/results/stage2-browser/`.

### Deploy: no workflow change

`quarto-publish.yml` runs on every push to `master`, sets up Node from `.node-version` and Quarto, and runs `quarto render`, a full render, which runs the post-render list from `_quarto.yml`. So a merged post is indexed (`build-search-index.mjs`) and embedded (`build-search-vectors.mjs`) during the deploy with no extra step. There is no `npm ci` in that job and neither script needs one: both import only Node built-ins and the repo's own `static/js` modules. No network is touched: the table is committed, not downloaded, which is the point of a static table (no model cache, no model download). No workflow file changed; `git status` shows none. One consequence to know: the deploy render is a full render (`QUARTO_PROJECT_RENDER_ALL=1`), so if `static/search/` is not committed the vectors step fails the deploy loudly instead of shipping keyword search quietly. `site-checks.yml` runs `check:site` on every PR, which now includes the search guard.

### Cross-check against Model2Vec

The offline comparison's reimplementation had never been compared with Model2Vec. In a temporary Python 3.12 environment outside the repo (`model2vec` 0.10.0, `numpy` 2.5.4, `tokenizers` 0.23.3) Model2Vec embedded 580 texts: the 40 development queries, all 506 passage texts of the index, and 34 edge cases (accents, German and Turkish letters, CJK and Korean and Cyrillic, emoji, apostrophes and symbols, a 100 and a 101 character word, a text over 3,000 characters and one over 700 words, the special token strings in and out of case, tabs, non-breaking and zero width spaces, control characters, combining marks, full-width forms, empty and punctuation only). Results (`results/stage2-browser/crosscheck-model2vec.txt`):

- Token ids: identical for 580 of 580 texts.
- The JavaScript pipeline with the float32 table against Model2Vec: cosine 1.000000000 (the lowest of all 580) in all three groups.
- The int8 table against the float32 table: queries lowest 0.998874, mean 0.999655; passages lowest 0.999059, mean 0.999712. Edge cases: mean 0.968, because a text whose pieces all have tiny rows loses them in int8 with one global scale: the single letter "a" gives a zero vector (cosine 0 against float32), "!!!" 0.945, "???" 0.987. None of these is a site query. A per-row scale would fix it at about 118 KB more; not done, because the ranking comparison below shows no loss on the sets.

### The fusion

The offline comparison found that fusing whole lists lets BM25's long tail of one-common-word matches outvote good meaning ranks. Five fusion methods were compared on the 40 development queries through the page's own modules, the committed table and passage vectors made the way the build makes them. The selection rule was written down before the numbers were looked at: highest nDCG at 10 overall (it uses the grade 1 judgments), methods within 0.01 tied. Four methods tied, so the rule needed a second step that I added after seeing the table and say so: among the tied, higher recall at 5, then higher MRR at 10. A rule fixed in advance would have had to be one query's worth of unstated preference.

Candidates: full-list RRF at k = 60 (the baseline), RRF over the top 10 of each list, RRF over the top 20, RRF with the meaning list weighted 2 to 1 (full lists), and RRF with a BM25 list that drops pages matching only one query term that is in more than 5 percent of the passages (a generic term), when the query has more than one term. Development set, 36 answerable queries (`results/stage2-browser/dev.md` has all of it):

| Method | Recall@5 | MRR@10 | nDCG@10 |
|---|---|---|---|
| BM25 alone | 0.75 | 0.64 | 0.71 |
| Meaning alone (reference) | 0.89 | 0.71 | 0.78 |
| RRF, full lists, k = 60 | 0.86 | 0.75 | 0.81 |
| **RRF over the top 10 of each list (chosen)** | **0.89** | **0.77** | **0.82** |
| RRF over the top 20 of each list | 0.86 | 0.76 | 0.82 |
| RRF, full lists, meaning weighted 2 to 1 | 0.86 | 0.76 | 0.82 |
| RRF, BM25 list without single generic term matches | 0.86 | 0.76 | 0.82 |

Per type (recall at 5 / MRR at 10) for BM25, full-list RRF and the chosen one: lookup 1.00 / 1.00 for all three; topic 1.00 / 0.88 for all three; question 1.00 / 0.87 for all three; paraphrase 0.33 / 0.16, 0.67 / 0.56, 0.67 / 0.58; partial 0.60 / 0.50, 0.80 / 0.70, 0.80 / 0.70; tool 0.75 / 0.63, 0.75 / 0.63, 1.00 / 0.69; person 0.50 / 0.41, 0.75 / 0.63, 0.75 / 0.63; multi 1.00 / 0.88 for all three. Against BM25 alone the chosen method fixes `paraphrase-04`, `paraphrase-05`, `partial-03`, `tool-02` and `person-02` and breaks none; against full-list RRF it fixes `tool-02` (rank 27 with full lists, 4 with the top 10) and breaks none, and moves `paraphrase-04` from 5 to 3. What it loses: `partial-04` ("tokenizers", the Work page) is at rank 14 for BM25 and 11 in the full-list fusion, and is gone from the top-10 fusion because it is outside the top 10 of both lists (neither metric sees it, since both look at ranks 10 and under). `person-03` ("what does he do now") is found by no method: 17th for meaning alone, 24th fused, absent with the cut.

The chosen method also has the property the page needs: its result count is truthful. A fused list of at most 20 pages, not all 47 as soon as the meaning list is whole. The weighted and generic-term methods list every page for every query.

Then, once, on the held-out set (`questions-holdout.json`, 20 queries written blind to all results, 18 answerable; file hash d83ff783d9ce), BM25 alone, full-list RRF and the chosen method, same index (759f6c5572dd74aa), nothing changed afterwards:

| Method | Dev recall@5 | Dev MRR@10 | Dev nDCG@10 | Held-out recall@5 | Held-out MRR@10 | Held-out nDCG@10 |
|---|---|---|---|---|---|---|
| BM25 alone | 0.75 | 0.64 | 0.71 | 0.67 | 0.56 | 0.60 |
| RRF, full lists | 0.86 | 0.75 | 0.81 | 0.78 | 0.56 | 0.67 |
| Chosen: top 10 of each list | 0.89 | 0.77 | 0.82 | 0.72 | 0.55 | 0.67 |

The held-out result agrees with the development set that fusing beats BM25 alone (recall 0.67 to 0.72, nDCG 0.60 to 0.67, nothing broken) and disagrees on the choice: the chosen method did not beat full-list RRF there. Same nDCG (0.67), MRR 0.55 against 0.56, and recall 0.72 against 0.78. Per query (held-out is 18 queries, so one query is 0.06 of recall): against BM25 the chosen method fixes `h-partial-02` ("base 64", rank none to 5) and breaks nothing; it loses the top spot of `h-partial-01` ("speculative decod", rank 1 to 5), which full-list RRF loses too. Against full-list RRF it fixes `h-partial-02` (29 with full lists) and loses `h-tool-01` ("shrink an image to half its size", 3 to 6) and `h-person-02` ("list of his papers", 3 to 7), both pages that BM25 ranks 12th and the cut therefore stops counting. Both mechanisms are the same cut seen from two sides, and with 18 queries I cannot say which side is closer to a real visitor. The development result was one query too (`tool-02`). Per type and the whole table are in `results/stage2-browser/holdout.md`. Taken together the evidence is that fusion helps and that the cut-off N does not matter measurably; I report the chosen one as chosen and flag the choice of N as the thing to look at again (TODO.md). Held-out typing replay: recall 0.69 BM25, 0.75 full lists, 0.75 chosen; MRR 0.55, 0.57, 0.56. The held-out set has now been scored once and is no longer held out.

The four queries the site cannot answer, results returned: BM25 28, 31, 9 and 2. Full-list RRF 47 for each (every page). The chosen method 15, 16, 15 and 12, with first pages `about`, `kalman-filters-time-series`, `pages/overlap-aware-sc` and `building-gpt-from-scratch`: meaning always supplies its ten nearest pages, so "No results" now appears only when the query has no keyword term. Held-out, the two no-answer queries: BM25 18 and 17, full lists 47 and 47, chosen 16 and 15. A query the site cannot answer therefore shows 12 to 16 loosely related rows, in the first 8 of which the page does not say they are weak. A cosine floor does not fix it (stage 2 offline: it would silence the no-answer queries and hide most real answers). This is for Aayush (TODO.md).

### Typing

Replay of the stage 1 runner (last word cut to its first half, 31 development queries; the stage 1 runner counts those with a last word of four or more letters) and a keystroke by keystroke trace (the last word typed from two letters to the whole word, 36 words, 149 keystrokes):

| Method | Replay recall@5 | Replay MRR@10 | Kept top 5 between keystrokes | First page changes per word |
|---|---|---|---|---|
| BM25 alone | 0.80 | 0.68 | 0.83 | 0.47 |
| Full-list RRF | 0.84 | 0.67 | 0.79 | 1.00 |
| Chosen | 0.87 | 0.68 | 0.77 | 1.00 |

Held-out (17 words, 59 keystrokes): kept top 5 0.80 BM25, 0.73 full lists, 0.72 chosen; first page changes per word 0.65, 1.06, 1.06. What I see in the traces: the final list is right and the hybrid reaches it, the half-typed word does not make results worse than BM25's replay (MRR 0.68 both), but the first page changes about twice as often while a word is typed, because two or three letters are noise to the table (`where did he do his ph` puts the PPO post first for one keystroke, `derive ppo lo` swaps the PPO and DPO posts). It is a flicker in the first rows, not a collapse: the top 5 keeps about three quarters of its pages from one keystroke to the next. I tried one mitigation, embedding the query without a last word that neither the index nor the table's vocabulary knows (unless it is the only word): typing recall 0.87 to 0.90 (one query), replay MRR unchanged, kept top 5 0.77 to 0.79, first page changes 1.00 to 0.97, complete queries identical. Dropped: it adds a rule and a dependency on the vocabulary for nothing measurable, and it would blind the table to a misspelt word typed without a space (`partial-03`). It stays in the harness as `rrf-top10-settled`.

### In the browser

- On the first use of the search box (focus or the first keystroke; on a desktop the box is focused at load, which counts) the page fetches `search-vectors.json?v=<index hash>`, checks that its index hash, vector count and sizes match the index it loaded, then fetches the table and vocabulary at `?v=<first 12 hex of their SHA-256>` in parallel, checks sizes and SHA-256 with `crypto.subtle` (skipped where it does not exist, which is only non-secure origins; the size check stays), and builds the embedder and the float vectors. It does not block typing: keyword search answers until then. When all of that matches, the status line changes from "Keyword search" to "Keyword and meaning search" (copy in the qmd). On any failure or mismatch nothing changes and nothing is said. A mismatch is found from the 170 KB vectors file before the 7.5 MB table is fetched. Nothing about a query enters a URL, analytics or a request.
- Caching: the browser's own HTTP cache with hash versioned URLs, no service worker, no Cache API, no IndexedDB. GitHub Pages sends `Cache-Control: max-age=600` and an ETag; a changed table or vocabulary has a new URL and a changed index a new `?v=`, so a stale copy cannot be used and a changed file is never fetched under a cached name. Chosen because it needs no code and cannot go stale. Checked: in a Chromium profile with a disk cache, a second visit within the ten minutes made no request for any of the three files (`results/stage2-browser/cache-check.md`); after that the small files revalidate with a 304 and the table, unchanged, is a hash-versioned URL that the cache keeps. Not checked: Safari, Firefox, a phone's cache limits, and whether a browser with a small cache evicts the 7.5 MB table, which would cost one more download. Playwright's default in-memory contexts did not keep the table at all (fetched again with a 200 on the second visit), which is why that check uses a persistent profile. If this turns out to matter, a Cache API copy keyed by the table's hash is a small addition.
- The page shows the best 8 rows and a "Show all N results" control under the list (a text button, keyboard reachable, `aria-expanded`, "Show the best 8" after it is used). The count line says "Best 8 of N results" and the section filters count all N. It applies to searches only (browsing a section with no query is unchanged), resets on every keystroke and filter change, and does not touch what the evaluation measures. "make a photo black and white" now lists 8 of 17. The passage shown for a row is the one from the list that ranks the page higher (keyword on a tie), so a page found by meaning links to its meaning-matched section; those rows have no highlighted words and show the start of the passage.
- What I saw in the screenshots (1280 and 390 px, `scratchpad/stage2-browser/`): "make a photo black and white" lists the Binary Mask Creator, the Tools catalog, the Building Browser Tools post, Image Adjust and Transform fourth, then Image Cropper, About, SVG Viewer and FlashAttention. "attention" lists FlashAttention first, then posts that say it, but also two posts (Claude Agent Skills, Tools for Better Claude Code) ahead of the Work page that has the word, because the meaning list puts them in its top 10; rows without a highlighted word look odd next to the keyword rows. "what does he do now" shows 16 rows and the About page is not among them. The layout holds at both widths and the new control matches the filters' type.

### Parity and failure behavior

`results/stage2-browser/parity.md`: Chromium 156.0.8078.4 against Node v24.22.0, 60 queries (40 development, 20 held-out). The browser's query vectors: same token ids for 60 of 60, lowest cosine 1.000000000, largest difference in any component 0. The same for the 580 cross-check texts. The rankings the page shows (every row, after Show all) are the same pages in the same order with the same passage links as Node's for 60 of 60 queries, in the hybrid and in keyword only (vectors blocked).

Failure behavior, browser tests that pass: with the table blocked, with the vectors blocked, with vectors that belong to another index, and with a table that has one byte flipped (hash mismatch), keyword search keeps working (a query and its first result checked) and the status stays "Keyword search". The tests allow the browser's own "failed to load" console lines in those four cases only.

### Costs

Measured on one laptop (Apple M5 Pro, macOS, arm64), Chromium 156.0.8078.4 driven by Playwright, against a local server (`results/stage2-browser/costs.md`). A phone was not measured, and neither was GitHub Pages: its actual compression of these files was not observed.

- Bytes (raw, gzip level 9, brotli quality 11): `search-vectors.json` 173,222, 118,728, 115,656; the table 7,559,168, 5,573,413, 5,490,560; the vocabulary 219,690, 106,730, 91,231; together 7,952,080 raw, 5,798,871 gzip, 5,697,447 brotli. `search-index.json` is unchanged at 346,530 raw and 117,616 gzip. The page scripts are `search.js` 16,481, `search-rank.js` 12,808 and the new `search-embed.js` 5,430 bytes raw. Whether GitHub Pages compresses an `application/octet-stream` file such as the table is the open question: uncompressed is 7.55 MB.
- Time from the first focus until hybrid is ready, cold cache, local server, no compression: median 32.5 ms (26.8 to 45.1 ms, 9 runs); this includes hashing the table and vocabulary and building the embedder (about 8 ms) but no real download. With Chromium's network emulation set after the page and index were in: 10 Mbit/s and 40 ms latency, 6.5 s uncompressed and 4.7 s with brotli (3 runs each); 1.6 Mbit/s and 150 ms, 40.1 s uncompressed and 29.1 s with brotli. So on a slow link the first meaning search is half a minute away, with keyword search answering throughout.
- Per query in Chromium: keyword ranking 0.020 ms median; embedding a query 0.003 ms; hybrid ranking 0.108 ms median (0.137 ms for the slowest query); a whole keystroke through the input handler (ranking, snippets, drawing the rows) 0.41 ms keyword and 0.36 ms hybrid, which is noise around each other. The browser clock steps in 0.1 ms, so each is a mean over many runs.
- Memory: JS heap after garbage collection 8.37 MB keyword only and 9.26 MB with meaning (a difference of 0.89 MB); the 7.56 MB table and the 0.52 MB float vectors are typed arrays outside that figure, so the page holds roughly 8.5 MB more.

### Automatic updates, shown and guarded

`results/stage2-browser/e2e-new-post.md`, produced by `e2e-new-post.mjs`: a scratch copy of the project outside the repo (rsync without `.git`, `node_modules`, `_site`, `_devlog`), a real `quarto render` each time, the page in Chromium. The script writes only into the scratch folder and its results file.

- A new post with the distinctive word "quokkaberry" and one idea told without any of the query's content words: it is in `search-index.json` (48 pages, 508 passages), the vectors are for the new index hash with 508 vectors and the same table, and the guard passes. The keyword query "quokkaberry" lists it first. The meaning-only query "how to stop my indoor greenery from dying when I am on vacation" lists it 5th of 16, and keyword search alone does not list it at all.
- The text is edited: the index hash changes (b0367171c8ce5622 to a5ed69ef4d4f3d45), the vectors change with it, and the guard passes. The old keyword finds nothing in keyword search alone. With meaning on, the old keyword still lists the post first, because its title still says Quokka and the table matches word pieces; the text shown is the description, not the old body. The old meaning query no longer lists it (16 other rows). The new keyword lists it first and a new meaning query ("keeping track of what the family spends each month") lists it 5th of 13.
- The post is removed and the site rendered again with an ordinary render, not `--clean`: it is not in the index, and the index hash and the vectors are byte for byte the baseline's.
- A page that is not a post: rendered but not listed in `search/index.qmd`, it is not in the index (the one hand step). Listed, it is indexed, embedded and found by keyword. A listed page that does not exist stops the render with "Search index: listed pages are missing from the render".

The guard: `npm run check:site` now also runs `checkSearch` (`scripts/check-site.mjs`, 8 tests in `scripts/check-search.test.mjs`, the existing `checkSite` untouched and its tests unchanged). It fails if the search page, `search-index.json`, `search-vectors.json` or the manifest is missing; if the index hash is not the hash of its pages; if any page the search page lists is not indexed, a page with a body has no passages, or more pages are indexed than listed; if the vectors are for another index hash, have the wrong count or dimensions, point at a table or vocabulary other than the one the manifest names, or the table files do not match their hash; and finally if the vectors are not exactly what the index text and the table give (it embeds again and compares), so an edited page cannot keep an old vector. `site-checks.yml` already runs it on every PR.

### Tried and dropped

- Embedding the query without an unfinished last word (above).
- A per-row scale for the int8 table (above): not needed for the rankings.
- A separate manifest request in the browser: the vectors file carries the table and vocabulary pointers, so the browser needs one small request before the large ones.
- Binary vectors instead of base64 in JSON: the JSON gzips to 118,728 bytes against about 129,536 for the raw bytes, and it does not depend on the server compressing a `.bin`.
- Forcing the cache (`force-cache`) for the hash-versioned URLs: a damaged cached copy would then never be replaced; the default cache plus the hash check cannot get stuck.
- A fusion weight, a cosine floor and a larger N were not tuned on either set.

### What is still unverified

- GitHub Pages' compression and caching of the table and vocabulary, a real network, a phone (time, memory, cache limits), Safari and Firefox. Everything above is Chromium on one laptop.
- The fusion cut-off: the held-out set did not confirm the development choice (see above) and 18 queries cannot settle it.
- Whether a real visitor's queries look like either set. Both were written by a model that had read the pages.
- The training dataset license of the model (`minishlab/tokenlearn-c4-en-bge-base-v1.5`) was not reviewed.
- The deploy itself: I read the workflow and ran the same render locally, I did not run the deploy.

### Checks (Node 24.22.0 from a temporary download outside the repo)

- `npm ci --ignore-scripts`: 0 vulnerabilities.
- `npm run check:secrets`: Secret scan: 273 tracked files clean. That skips untracked files, so every new and modified file (173 text files; the binary table skipped) was also scanned with the repo's `scanText`: 0 hits.
- `npm run check:posts`: Post metadata: 25 posts passed.
- `npm test`: 89 tests, 89 pass (58 before stage 2's browser work, now with the embedder, vector builder, table builder, ranking and guard tests).
- `quarto render --clean`: completed; post-render lines "Search index: 47 pages and 459 passages in 54 ms" and "Search vectors: 506 passages x 256 dimensions, 173222 bytes, in 59 ms". The index hash is 759f6c5572dd74aa, the one every evaluation above used.
- `npm run check:site`: Rendered site: 50 HTML pages and 5676 references passed; search: 47 pages and 506 passages indexed and embedded.
- `npm run test:browser`: 111 passed (11.2s), including the 7 search tests and the search page's two overflow tests. The three posts that load images from raw.githubusercontent.com did not time out this time.

## 2026-11-12, stage 3: the answer evaluation, rule fixed in advance

This entry is written before any answer exists. The orchestrating session set the shipping rule; I record it here so that no number can move it.

- Candidates: Qwen3-0.6B, Granite 4.0 350M, LFM2.5-350M and Qwen3.5-0.8B (text), all at q4f16 with the pinned revisions in `evals/answers/harness/models.mjs`. All four load and generate on WebGPU; only Granite and Qwen3-0.6B load on single threaded WebAssembly (the other two have no CPU kernel for `GatherBlockQuantized`), from `evals/answers/feasibility.md`. The evaluation runs on WebGPU.
- Questions: `evals/answers/questions.json`, 45 questions, 30 answerable and 15 unanswerable (8 near misses, 7 off-topic). Written before any model or retrieval result was seen.
- The prompt, the refusal sentence and the model settings are the ones in `harness/prompt.mjs` and `harness/models.mjs`, unchanged. Greedy decoding.
- Shipping rule: a model ships only if it declines at least 13 of the 15 unanswerable questions and at least half of its 30 answerable answers are labelled faithful, both at once. The stricter measure the question writer proposed (of the answerable questions where retrieval supplied a supporting passage, at least 80 percent faithful and at most 10 percent unsupported) is reported but does not decide. If no model passes, no answer feature ships.
- Labelling: an independent judge labels each answer faithful, unsupported or non-answer against the passages the model was given, blind to which model wrote it. The generation session does not judge.
- Retrieval and passage format, fixed before any model ran (`evals/answers/prepare.mjs`): each question is typed as a query into the page's own `rankHybrid` over the rendered index (hash 759f6c5572dd74aa, vectors checked equal to `_site/search-vectors.json`), and the top four pages are given, one passage per page, the page's best passage in the fused list. Passage title is the page title, plus ", section: <heading>" when the passage has a heading; the text is the indexed passage text unchanged (at most 1000 characters, no truncation or rewriting); the prompt numbers them [1] to [4] in rank order. The same input goes to all four models.
- Retrieval hit: an answerable question is a hit when at least one of its supporting quotes is a contiguous substring of a supplied passage after lowercasing, keeping the label of markdown links and turning every run of characters that are not letters or digits into one space.
- Generation done (this session does not judge). All four models ran 45 of 45 items on WebGPU in Playwright's Chromium 156 (Apple Metal adapter, `shader-f16`), greedy, with no failed item and no retry; raw outputs, the exact prompts and timings are in `evals/answers/results/raw/*.jsonl`, the retrieval in `results/retrieval.json`, the statistics (no quality labels) in `results/raw-stats.md`. Retrieval supplied a supporting quote for 20 of the 30 answerable questions (rank of the supporting passage among the four: 15 at 1, 3 at 2, 2 at 3). In the 10 others the quote is in the index text of a page, so the miss is the ranking: for 9 the supporting page is in the top four but its best passage by the ranking is another section of the page, and for 1 the page is at rank 7. The "skip the model when the four passages share no content word with the question" gate would have fired on 0 of the 15 unanswerable questions (and on 0 of the 30 answerable). `results/to-judge.json` is the blinded file (180 entries), `results/key-map.json` the mapping the judge does not open, `results/score.mjs` the scorer.

## 2026-11-12, stage 3: result and decision

No model passes the shipping rule under either judge, so stage 3 ends with no answer feature shipped. The site ships stages 1 and 2: keyword search plus the static embedding table. This entry records the scores, why they came out this way, and what would have to change for answers to be worth trying again. The tables are below; every number comes from `results/score.mjs` run on the two labels files, `labels-a.json` and `labels-b.json`, and from `retrieval.json`, `raw-stats.md` and `feasibility.md`.

### The rule, the judging and the decision

The rule was written above, before any answer existed: a model ships only if it declines at least 13 of the 15 unanswerable questions and at least 15 of its 30 answerable answers are labelled faithful, both at once. The stricter measure the question writer proposed (on the answerable questions where retrieval supplied a supporting quote, at least 80 percent faithful and at most 10 percent unsupported) was reported and did not decide.

Two independent judges (Opus 5.5 subagents) labelled all 180 answers (4 models by 45 questions) faithful, unsupported or non-answer, blind to which model wrote each, reading the entries in opposite orders. They agreed on 179 of 180 labels. The one difference is Granite 4.0 350M on `how-03` ("How does DPO get away without a reward model or reinforcement learning?"): judge A unsupported, judge B faithful. Both called it borderline for the same phrase, "directly optimizing the policy's preference for text generation", which is not in the passages; the rest of the answer restates the passage. `how-03` is one of the 10 questions where retrieval did not supply the supporting quote, so the difference moves only Granite's all-30 counts (faithful 10 against 11, unsupported 20 against 19). It changes no pass or fail and no other figure.

Decision (orchestrating session, 2026-11-12, under Aayush's delegation to decide by the scores): stage 3 ends with no answer feature shipped. The harness, the question set, the labels and the results stay in the repo as the record.

### Scores

Faithful, unsupported and non-answer are against the passages the model was given. "Hit" questions are the 20 of the 30 answerable where retrieval supplied a supporting quote. On the 15 unanswerable questions a non-answer is a decline and any answer is unsupported (no model got a faithful label there).

Judge A:

| Model | All 30 answerable (faithful / unsupported / non-answer) | 20 hits (faithful / unsupported / non-answer) | 15 unanswerable (declined / answered) | 8 near misses (declined / answered) | 7 off-topic (declined / answered) | Passes |
|---|---|---|---|---|---|---|
| Qwen3-0.6B | 13 / 11 / 6 | 10 / 8 / 2 | 3 / 12 | 3 / 5 | 0 / 7 | No |
| Granite 4.0 350M | 10 / 20 / 0 | 8 / 12 / 0 | 3 / 12 | 3 / 5 | 0 / 7 | No |
| LFM2.5-350M | 13 / 17 / 0 | 10 / 10 / 0 | 1 / 14 | 0 / 8 | 1 / 6 | No |
| Qwen3.5-0.8B (text) | 17 / 9 / 4 | 13 / 5 / 2 | 10 / 5 | 6 / 2 | 4 / 3 | No |

Judge B differs only in the Granite row, where the all-30 cell is 11 / 19 / 0; every other cell, for every model, is the same.

- Qwen3.5-0.8B is the closest. It meets the faithful bar (17 of 30, needs 15) and declines 10 of 15 (needs 13). Granite fails on both (3 declines, 10 or 11 faithful), Qwen3-0.6B on both (3 declines, 13 faithful), LFM2.5-350M on both (1 decline, 13 faithful).
- The stricter measure is met by no model: faithful and unsupported on the hit questions are 50% and 40% (Qwen3-0.6B), 40% and 60% (Granite), 50% and 50% (LFM2.5), 65% and 25% (Qwen3.5).
- Across the four models, 17 of the 60 answers to the 15 unanswerable questions were declines and 43 were answers, every one unsupported. Near misses were declined 12 times in 32 and off-topic questions 5 times in 28.

### Retrieval

Retrieval supplied a supporting quote for 20 of the 30 answerable questions: the supporting passage was at rank 1 for 15, rank 2 for 3 and rank 3 for 2. The 10 misses are `fact-01`, `fact-05`, `fact-07`, `fact-08`, `fact-09`, `how-03`, `how-04`, `how-08`, `person-01` and `person-04`. In all 10 the quote is in the indexed text of a page. For 9 the supporting page was among the four passed but the passage chosen for it (the page's best passage in the fused list, one passage per page) was another section; for 1 (`person-04`) the supporting page ranked 7th. So the misses come from passing one passage per page and from the ranking, not from missing text.

A miss is not always a wrong answer: on those 10 questions judge A labelled faithful 3 answers from Qwen3-0.6B, 2 from Granite, 3 from LFM2.5 and 4 from Qwen3.5, because the passage passed said enough of the point without containing the exact quote. The hit rule is a quote match, which is stricter than "enough to answer". The no-shared-content-word gate would have fired on 0 of the 15 unanswerable questions, so it would have removed nothing.

### Speed, download and memory

One machine (Apple M5 Pro, 24 GB), Chromium 156, Transformers.js 4.3.2, q4f16, WebGPU. Speed and first token are from `feasibility.md` (a 570 token prompt); the last two columns are from the 45 real questions (prompts of about 780 tokens, answers of 20 to 35 tokens at the median).

| Model | Download (q4f16 model files) | First token | Tokens per second | 45 questions: median item time / run time | Peak browser memory, feasibility run / answer run |
|---|---|---|---|---|---|
| Qwen3-0.6B | 569,789,750 bytes | 328 ms | 127.5 | 719 ms / 39.8 s | 4.98 GB / 7.51 GB |
| Granite 4.0 350M | 350,484,597 bytes in two files | 142 ms | 181.8 | 412 ms / 20.2 s | 3.79 GB / 8.34 GB |
| LFM2.5-350M | 255,148,587 bytes in two files | 72 ms | 267.0 | 185 ms / 10.1 s | 2.20 GB / 2.21 GB |
| Qwen3.5-0.8B (text) | 469,929,410 bytes in two files | 181 ms | 85.2 | 608 ms / 30.1 s | 2.89 GB / 3.88 GB |

The two memory columns disagree by up to 4.5 GB for one model (Granite), so the figure is a loose upper bound, not a number to promise anyone. Backend facts: all four run on WebGPU; on single threaded WebAssembly (what GitHub Pages allows) only Granite (4.1 tokens per second, 8.7 s to the first token) and Qwen3-0.6B (2.2 tokens per second, 15.0 s) load, because ONNX Runtime Web has no CPU kernel for `GatherBlockQuantized`, so LFM2.5-350M and Qwen3.5-0.8B are WebGPU only. Chromium refused to store a file above about 512 MiB in Cache Storage from a buffer, so Qwen3-0.6B's 570 MB file, the largest, is not cached by Transformers.js's default caching and downloads again on every visit; the other three are cached. The evaluation ran on WebGPU only.

### Examples

Six answers, with the judges' notes. Both judges gave the same label in each.

1. An invented answer to an off-topic question. Qwen3-0.6B, `off-04`: "How does the Raft consensus algorithm elect a leader?" Answer: "The Raft consensus algorithm elects a leader by using a voting mechanism where each node votes for the leader, and the leader with the most votes is chosen. This process ensures that consensus is maintained through periodic communication between nodes." Unsupported. Judge A: "answers from outside knowledge; passages say nothing on Raft". Judge B: "describes Raft voting; site does not cover it". The model answered from its own memory, which the prompt forbids.
2. An off-topic question answered with an unrelated passage fact. Qwen3.5-0.8B, `off-06`: "How do I build an iPhone app with SwiftUI?" Answer: "You can use the Skills-Creator skill in the Claude app to build your own skills just by describing what you want." Unsupported. Judge A: "Skills-Creator fact presented as the answer". Judge B: "presents Skills-Creator as the SwiftUI answer". This is the extraction habit in its plainest form: a sentence from a retrieved passage becomes the answer to a question it does not address.
3. A near miss answered from a nearby fact. Qwen3.5-0.8B, `near-06`: "How much does Context7 cost once you go past the free plan?" Answer: "The free plan gives you around 1000 API requests per month, which is more than enough for most use cases." Unsupported. Judge A: "free plan fact presented as the answer". Judge B: "borderline: gives the free-plan quota as if it answered the paid cost". The site says nothing about paid pricing; the model restated the free-plan quota instead.
4. A correct fact with one unsupported addition. Granite 4.0 350M, `how-07`: "What does the Kalman gain do when the sensor is unreliable?" Answer: "The Kalman gain, also known as the trust gain, is a trust dial that re-tunes itself at every timestep based on who currently deserves more trust. When the measurement noise R is large, the Kalman gain shrinks toward zero and the filter mostly trusts its own prediction." Unsupported. Judge A: "borderline: 'also known as the trust gain' is not in P1; rest supported". Judge B: "borderline: 'also known as the trust gain' is not in passages; rest correct". The label is strict by design: one claim outside the passages makes the answer unsupported, however small. Qwen3-0.6B, LFM2.5 and Qwen3.5 answered the same question faithfully.
5. A faithful answer. Qwen3.5-0.8B, `fact-03`: "How much did filtering out wrong reasoning traces help his SFT run on Qwen2.5-Math?" Answer: "According to the text, filtering out incorrect reasoning traces boosted the model's accuracy from 42% to 52%." Faithful. Judge A: "42% to 52%, per P1". Judge B: "42% to 52% per P1". LFM2.5 answered "0.4214", the unfiltered run's accuracy, to the same question, and Granite "0.0288% accuracy", the baseline.
6. A correct decline. Qwen3.5-0.8B, `near-01`: "What exact match score did Claude Sonnet 3.5 get on the ViGGO task?" Answer: "The text does not state the exact match score for Claude Sonnet 3.5 on the ViGGO task." Non-answer, which is correct here (the score is in an image, not in text). Judge A: "says the text does not state it". Judge B: "says the text does not state the score". On the same question Qwen3-0.6B attributed another model's remark to Sonnet, Granite said "about 80%" (the score of another model) and LFM2.5 said "0". The same model also declined wrongly: on `fact-02` (hyperparameters for fine-tuning Llama-3-8B on Predibase, which the passage gives) Qwen3.5 said the passages do not contain them.

### What it means

The small models here pull out a nearby fact; they do not decline. Faced with a question the passages do not answer, the four models answered 43 times in 60 and declined 17, and every one of the 43 answers was unsupported; many leaned on real sentences from the passages (a free-plan quota, a different model's score, a different post's loss description). Qwen3.5-0.8B declined most (10 of 15) and was also the most faithful (17 of 30), but even it answered 5 of 15 unanswerable questions and declined 4 answerable ones. Telling "the passages answer this" from "the passages are close to this" is the skill that is missing at this size, with this prompt.

Retrieval is the second weakness. It supplied the supporting passage for only 20 of 30 questions, mostly because one passage per page was passed and the best-ranked passage of the right page was often another section. That lowers what any answer model can do, though the model failures were not mainly retrieval failures: on the 20 hit questions the best model was faithful on 13 and the others on 8 to 10.

### What would have to change

These are possibilities, not plans; none is scheduled.

- Pass more than one passage per page, or more than four passages. Supported by this data as a fix for retrieval: 9 of the 10 misses had the supporting page in the top four. Not supported as a fix for the models: they failed on hit questions too (the best was faithful on 13 of 20 hits), and a longer prompt costs time (about 780 prompt tokens now). Nothing here tests it.
- A retrieval score or an agreement signal for the gate. The existing evidence is against scores: stage 2's cosine scores do not separate answerable from unanswerable queries (AUC 0.66 to 0.83), and the shared-content-word gate fired on 0 of 15. No agreement signal (for example, the same answer from two models or two prompts) was measured, so there is no evidence for or against it. The 15 unanswerable questions and their retrieval are stored, so a score-based gate could be tested offline without running a model; that was not done.
- A larger model, or a model trained to decline. Both were ruled out by Aayush on 2026-11-11 (any larger on-demand answer model; the `bartdegoede/qwen3-0.6b-small-rag` fine-tune). Evidence from another personal blog, not measured here: that fine-tune was reported faithful on 16 of 30 and inventing 0 of 15, and Gemma 4 E2B faithful on 28 of 30 and inventing 0 of 15. That fits the direction of this result (the skill is declining, and training or size supplies it), but those are another site's counts.
- A stricter prompt. The prompt already says to use only the passages and gives an exact refusal sentence. Qwen3-0.6B used that sentence 8 times and Qwen3.5 twice; Granite and LFM2.5 never did. Qwen3.5 mostly declined in its own words and declined most (14 of 45), which hints that wording matters; Granite declined 3 times in 45 and LFM2.5 once. Whether a different prompt changes the counts is untested: one prompt was tried.

### Limits

- 45 questions, written by a model that had read the whole site, so they are likely easier and closer to the site's wording than a visitor's. One question moves an answerable rate by about 3 points and an unanswerable one by about 7.
- One machine (Apple M5 Pro), Chromium and WebGPU only. No WebAssembly answers, no phone, no other browser, no real network. Memory is noisy.
- Greedy decoding and one prompt, with one passage format (four passages, one per page).
- LLM judges. The two judges are the same model family, so they can share blind spots; 179 of 180 agreement shows they apply the rubric alike, not that the rubric is right. Many labels are borderline (23 of judge A's notes and 30 of judge B's say so). No human label is recorded.
- No borderline label could change a result: only Qwen3.5 is near, it is 3 declines short (10 of 15 against 13), and the two judges agreed on every one of its labels.

### Files

`score.mjs` (prints the tables from the two labels files), `labels-a.json` and `labels-b.json` (labels and notes per key), `key-map.json` (key to model and question), `score.mjs`, `retrieval.json`, `raw-stats.md`, `raw/*.jsonl` (answers and prompts), `feasibility.md` (speed, download, memory and backends). The question set and README are in `evals/answers/`.

## 2026-11-12, review findings and fixes

An independent review of the browser-local search page found the defects below before it goes live. Each has the decision taken, the fix and, where the ranking changed, the numbers. The ranking changes (findings 1 and 2) were re-measured with the evaluation of the stage 2 entry, through the page's own modules: `evals/stage2-browser/run-fusion.mjs --methods bm25,page` on the development set (40 queries, 36 answerable) and, as a regression check only, on the held-out set (20 queries, 18 answerable). The held-out set was already used once, to check the fusion choice; nothing was tuned on it and nothing was tuned on either set this time. Results: `results/stage2-browser/review-before-dev.md`, `review-after-dev.md`, `review-before-holdout.md` and `review-after-holdout.md` (before and after are the same index, 759f6c5572dd74aa, and the same table).

### Scores, before and after

| Set and method | Recall@5 | MRR@10 | nDCG@10 | Typing recall@5 | Typing MRR@10 |
|---|---|---|---|---|---|
| Development, page before | 0.889 | 0.766 | 0.822 | 0.871 | 0.678 |
| Development, page after | 0.889 | 0.766 | 0.822 | 0.871 | 0.678 |
| Held-out, page before | 0.722 | 0.555 | 0.666 | 0.750 | 0.558 |
| Held-out, page after | 0.722 | 0.555 | 0.666 | 0.750 | 0.558 |

No query moved on any of the three scores or on the rank of its first right page, in either set. That is by construction: appending keyword matches puts them after the fused rows, and a fusion of two lists with a meaning list has at least 10 rows, so ranks 1 to 10 are untouched. The one place a score could have moved is a query with no keyword match, whose list is cut from 10 rows to 5: `partial-03` ("diarisation") is the only such query among the 60, its first five pages are the same as before, and its right pages (the two Research pages) are at ranks 1 and 2, so recall at 5 and MRR do not change, and nDCG at 10 did not change either. What did change is what the lists contain: 30 of the 40 development queries now list more pages and one (`partial-03`) fewer (median 14 before, 23.5 after, longest 42), and `partial-04` ("tokenizers"), which was absent, now has the Work page at rank 15. Neither metric sees rank 15. The four development queries the site cannot answer list 30, 31, 15 and 12 pages (15, 16, 15 and 12 before); held-out 20 and 19 (16 and 15). The stage 2 entry's remark that a no-answer query shows "12 to 16 loosely related rows" no longer holds for those that share a word with a page: they now show every page with that word.

Browser against Node, `results/stage2-browser/parity.md` rerun (the script now types a first key, because focus no longer starts the meaning files): Chromium 156.0.8078.4 against Node v24.22.0, 60 queries, hybrid 60 of 60 and keyword only 60 of 60 list the same pages in the same order with the same passage links; query vectors 60 of 60 and the 580 cross-check texts 580 of 580 with the same token ids, lowest cosine 1.000000000, largest difference 0.

### Findings

1. **A query that matches no keyword got ten rows.** In hybrid mode "zzzzqq" listed the ten nearest pages with no hint that they were weak. Decision: do not return nothing, because a meaning-only match is a real win ("diarisation" has no keyword match and finds the two diarization pages by meaning). Fix: when no keyword matches, `rankHybrid` returns the five closest pages (`FUSION.nearest`), and the page puts a plain line over them (`nearest` and `nearestOne` in `search/index.qmd`: "No exact matches for ... These 5 pages are the closest by meaning."). The filters and the count line count what is shown, so a section filter changes the number in the line. Keyword-only mode keeps "No results". Before: "zzzzqq" and "diarisation" 10 rows ("Best 8 of 10"); after: 5 rows, with the line. Tests: `search-rank.test.mjs` (five rows, none with a keyword rank, nothing for a zero vector) and the browser test for "zzzzqq" and "diarisation".
2. **Keyword matches disappeared once meaning loaded.** The fusion keeps the top 10 of each list, so a page that matches a word but is outside both tops was dropped: "image" had 18 results in keyword mode and 13 in hybrid mode, and the filter counts shrank with it. Decision: keep the fused order for the rows it produces and append the rest of the keyword matches in keyword order. Fix: `rankHybrid` appends them with only their keyword rank. Before: "image" 18 keyword, 13 hybrid; after: 18 keyword, 20 hybrid (the fused rows plus every keyword match). Test: `search-rank.test.mjs` (twelve pages, the fusion alone keeps 10, the hybrid keeps 12 in the right order) and a browser test that every keyword page is still listed and no filter count shrinks.
3. **The 7.5 MB table downloaded on every desktop visit**, because the box is focused at load and focus counted as first use. Decision: start on the first keystroke; skip it, silently, when `navigator.connection.saveData` is true or the effective type is `2g` or `slow-2g`. Fix: `search.js` listens to `input` only. The stage 2 entry's lines on focus as first use are superseded. Tests: the first browser test now asserts that only the index is fetched until a key is typed, and three new ones for save-data, 2g and slow-2g. The evaluation scripts that waited for the status after focus (`parity-browser.mjs`, `costs-browser.mjs`, `cache-check.mjs`, `e2e-new-post.mjs`, `screenshots.mjs`) now type a first key.
4. **One malformed page failed the whole render.** Decision: a page whose text cannot be extracted falls back to its title and description with a warning on stderr; a listed page that is missing from a full render still fails. Fix: `buildSearchIndex` catches per page and returns `failed`, and the build step prints "Search index: could not read the text of <page> (...); indexed with its title and description only". `npm run check:site` still fails for that page ("has no passages"), so CI catches it and the deploy render does not stop. Tests: a page nested 30,000 levels deep (stack overflow in the walker) in the library and through the command line. The comment above the page list in `search/index.qmd` now says `href` is a path from the site root, not an external URL.
5. **Focus was lost when results redrew.** Fix: rows are redrawn only when their markup changed, and when a result had focus it is restored to the same page's link (matched by a `data-page` number on the row, not by href, because the best passage can change when meaning loads); the count, heading and Show all text are only written when they change, so a screen reader does not announce the same line again. Test: focus a result in keyword mode, let the meaning files arrive, focus is still on it; and an unchanged redraw keeps the same elements.
6. **Filter and topic buttons were read as "Writing11".** Fix: each has an `aria-label` from the page's copy: "Writing, 11 results", "1 result", and for topics "Local LLMs, 4 posts". Test on every button.
7. **With JavaScript off the page showed a dead field.** Fix: the controls are in a `hidden` wrapper that the script shows first thing; only the note shows without it. Test with JavaScript disabled.
8. **`static/css/search.css`**: every rule is now scoped by `.search-page`, the header comment names `search/index.qmd`, and the two `max-width: 600px` blocks are one. Six keyword-only states at 1280 and 390 px (empty, "image", "image" with all rows, "kalman fil", a topic, no match) are byte for byte identical before and after.
9. **`pageKey`** was in two files. It is now exported by `static/js/search-rank.js` and imported by `search.js`, `build-search-index.mjs`, `check-site.mjs` and the baseline placeholder; its test moved to `search-rank.test.mjs`.
10. **A stale index after a deploy** (GitHub Pages caches for ten minutes): left as is, since it heals itself and a hash mismatch only turns meaning off for that visit. Written down in `TODO.md`.
11. **Tests that would have caught 1 and 2**, an escaping regression test (a title, description, category, reading time, passage text and anchor with markup and quotes render as text, create no element and run nothing; checked to fail when `esc` is made a no-op), and browser assertions that no longer depend on one page being first: the expected page is in the first three rows, except for the "Image Adjust & Transform" check, which looks in the full list.
12. **Dangling references**: the last entry above and `plan.html` pointed at `evals/answers/results/summary.md`, which does not exist and will not be created. They now point to the entry "2026-11-12, stage 3: result and decision" and to `score.mjs` with `labels-a.json` and `labels-b.json`. The stale `TODO.md` line about committing `static/search/` is gone.

### Checks (Node 24.22.0 from a temporary download outside the repo)

- `npm ci --ignore-scripts`: 0 vulnerabilities.
- `npm run check:secrets`: Secret scan: 467 tracked files clean. That skips untracked files, so the 27 new and modified files were also scanned with the repo's `scanText`: 0 hits.
- `npm run check:posts`: Post metadata: 25 posts passed.
- `npm test`: 94 tests, 94 pass (89 before; 5 new: the page key, the kept keyword matches, the nearest five, and two for a page that cannot be read).
- `quarto render --clean`: completed; "Search index: 47 pages and 459 passages in 55 ms" and "Search vectors: 506 passages x 256 dimensions, 173222 bytes, in 59 ms". The index hash is still 759f6c5572dd74aa.
- `npm run check:site`: Rendered site: 50 HTML pages and 5676 references passed; search: 47 pages and 506 passages indexed and embedded.
- `npm run test:browser`: 121 passed (12.7s), 17 of them in `search.spec.mjs` (7 before). The three posts that load images from raw.githubusercontent.com did not time out this time.
- Screenshots at 1280 and 390 px, read by eye: empty, "image" before and after the meaning files load, "zzzzqq", "diarisation", JavaScript off. No overflow, nothing clipped, the line over the nearest five reads in the count's place, the filters show the five.
