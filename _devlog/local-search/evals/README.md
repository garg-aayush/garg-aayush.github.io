# Search evaluation set

A fixed set of 40 search queries for aayushgarg.dev, each with the pages that should answer it. Every search stage (BM25, then BM25 plus a small embedding model, then larger models per device) is scored on this same set, so a stage can be compared with the one before it. The set was written on 2026-11-11, before any BM25 code existed, so no ranker shaped it.

Files:

- `questions.json`: the queries and their relevance judgments.
- `check-questions.mjs`: validates the file and prints the counts. Run it with `node _devlog/local-search/evals/check-questions.mjs` from the repo root. It has no dependencies.

## Size

The brief first asked for 50 to 60 queries. On 2026-11-11 Aayush set the target at 30 to 40 instead, because the site is small: 47 searchable pages (25 posts and 22 other pages, 14 of them single browser tools). The set has 40 queries. It was cut from a longer draft by dropping near-duplicates (a second query on the same page, or a second query testing the same difficulty), not by thinning the types keyword search should miss.

## Counts per type

| Type | Count | What it tests |
|---|---|---|
| lookup | 4 | An exact name or term from the page (DOVER-Lap, JMI-res, Bradley-Terry, Svg2Raster) |
| topic | 4 | Two or three words for a subject |
| question | 5 | A full natural-language question |
| paraphrase | 6 | The page answers it but shares few or no content words with the query |
| partial | 5 | A half-typed, inflected or differently spelled form of a word on the page |
| tool | 4 | A browser tool described by what it does, not its name |
| person | 4 | Career and background, answered by About, Work or Publications |
| multi | 4 | A good answer needs two or more pages |
| none | 4 | Plausible queries the site does not answer, three of them near misses |
| **Total** | **40** | 36 answerable, 4 with no answer |

There are 48 grade 2 and 27 grade 1 judgments. 37 of the 47 searchable pages are judged relevant at least once. All 25 posts, every non-tool page and the Tools catalog are covered; 10 of the 14 single tools are not (only four tool queries fit in the smaller set).

## How the set was made

1. I read every searchable page in the worktree: the pages listed in the search page's front matter (`search/index.qmd`) and every post under `posts/`. I did not run or read the current search code beyond how it forms page keys, and did not look at `_site/`.
2. For each type I wrote queries the way a visitor would type them: short, lowercase, sometimes vague, not copied from the page.
3. For `paraphrase` and `partial` queries I counted, with a script over the source files, which query words also appear on the target page. Each `why` names the words that overlap, so a reader can see how hard the query is for keyword search. "Appear" here means the word, or a word it is a prefix of, is in the page source.
4. For `none` queries I searched all page sources for the key terms and wrote in `why` what is nearby on the site and why it does not answer.
5. Spread: every post appears at least once, from the 2024 CUDA and structured extraction posts to the 2026 posts, along with About, Work, Publications, the three research pages, the weather page, the Tools catalog and four single tools.

## Format

Each entry in `questions.json` has:

- `id`: the type plus a number, for example `paraphrase-03`. Ids are stable; add new queries with new ids and never reuse one.
- `query`: exactly what a visitor types.
- `type`: one of the nine types above.
- `relevant`: a list of `{ "href", "grade", "section" }`. `href` is site-root relative with no leading slash, in the form the search page uses for page keys: `about.html`, `posts/2024-05-19-manage-multiple-cuda.html` for a single-file post, `posts/2026-03-27-flash-attention/index.html` for a folder post, `tools/index.html` for the catalog. `section` is optional: the heading id of the passage that answers the query.
- `why`: one line naming the passage or fact that makes each page relevant. For a `none` query it says what was checked.

## Grading rule

- Grade 2: the page answers the query. A visitor who opens it finds what they asked for.
- Grade 1: the page is useful but not the answer: it mentions the subject, gives context, or lists something the grade 2 page explains (Work listing a repo whose post is the answer, the Tools catalog for a single tool).
- Not listed: anything else, including pages that only share words with the query.
- Relevance is judged on what the page says, not on what the index can see. The weather page body is excluded from matching (`match-body: false`) and single tools have only their description, yet they are still graded on their content. A miss there is an index limit, and it should show in the scores.
- A `section` is given only where one passage clearly holds the answer. Ranking is scored per page; the section is there for a later check of where the result links.
- `multi` queries have two or more grade 2 pages. `none` queries have none at all.

## Proposed metrics

Score each stage on the 36 answerable queries, overall and per type:

- **Recall@5**: the share of grade 2 pages that appear in the top 5. Five rows is about what a visitor reads before giving up, and the page shows one row per page, so this matches what a visitor sees.
- **MRR@10**: the mean of 1 / rank of the first grade 2 page within the top 10 (0 if none). It rewards putting the answer first, which matters most for `lookup`, `tool` and `person` queries.
- **nDCG@10** with gains 2 and 1: the only one of the three that uses grade 1 judgments. Optional; useful when two stages tie on the first two.

Report per type, not only overall. The point of the set is to show where keyword search is enough (`lookup`, most `topic`) and where it fails (`paraphrase`, `partial`, and the tool and person queries that use words the pages do not). An overall average hides that.

For the 4 `none` queries, report how many results each stage returns and the score of the top result. A keyword ranker can only say "nothing found" when no word matches, and three of these are near misses that will match something. An embedding ranker always returns neighbors, so the useful number there is whether a score threshold can separate these from answerable queries without losing answers.

With 4 to 6 queries per type, a single query moves a per-type score by 17 to 25 points. Report the counts next to the percentages and read differences of one query as noise.

## What a fair comparison between stages needs

- The same `questions.json`, unchanged. If a query or a judgment changes, rescore every stage on the new version and say so.
- The same list of searchable pages and the same text per page. The page list comes from the search page front matter plus the posts; the text from the `search.json` of one render, with the same cleaning. Save that `search.json` (or a hash of it) with each result.
- Ranking run outside the browser, from one script over the same index, so results do not depend on timing, device or typing. Only the ranker changes between stages.
- Report the model, its size and the query time with the scores, since stage 3 picks models by device.

## Limits

- The queries and judgments were written by a model (Claude) that had just read every page. It knows the site's vocabulary better than any visitor, which probably makes the queries easier for keyword search than real ones, even the paraphrases.
- One annotator, no second judgment and no agreement measure.
- The corpus is small (47 pages), so the absolute scores say little about other sites, and per-type scores rest on 4 to 6 queries.
- There are no real visitor queries. The site's analytics do not record searches, and the search page sends nothing about what is typed.
- Some facts live only in images, equations or code, which no text index sees: the model scores in the 2024 structured extraction posts, the GRPO ablation curves, the Kalman and FlashAttention derivations, the skills vs MCP token comparison. Those queries are noted in `why`.

## Judgments to review first

These are the calls I was least sure about. Aayush should check them and add queries in his own words, since his phrasing is the closest thing to a real visitor this set has.

1. `topic-02` and `lookup-01`: DOVER-Lap is a diarization method, but its page is one sentence and never says so. I left it out of "speaker diarization". Including it would reward a model that knows the name from training rather than from the page.
2. `question-04`: the weather page is grade 2 even though its body is deliberately not indexed. If the intent is to score only what the index can see, it should drop to grade 1 or the `match-body: false` choice should be revisited.
3. `person-02` ("has he worked in oil and gas"): graded on Shell, reservoir imaging and refineries. Nothing on the site says "oil" or "gas", so this assumes a visitor's reading of the About page.
4. `none-01` (Kubernetes) and `none-02` (Mamba): near misses I judged unanswered. A reader could argue the GRPO post's one mention of Kubernetes, or the Kalman post on state-space models, is worth a grade 1.
5. `paraphrase-04` and `paraphrase-06`: the overlap is only generic words ("model", "own", "outputs"), but those words are common across the site, so these may be harder than intended for every stage, not only keyword search.
6. `multi-04` ("projects built with claude code"): the Claude Code tools post is graded 1 because it is about workflow, not something built. That line is fuzzy.
