# TODO

Deferred work that is not blocking but worth picking up if the relevant area is touched again.

## Home page

### Add Pixelart to the contract work
The About page lists part-time contracts under Contract work (Renderwolf, SixSense), and the home and About intros mention them. Pixelart is still missing: add an entry and update both intro sentences once Aayush shares the dates and what the work was. Contracts stay off the home Path; a side track there was tried and rejected.

## Browser tools

### Snapshot the SVG export format before asynchronous rendering

The SVG viewer captures the encoding MIME type before rendering but reads the selected format again when naming the file inside the asynchronous `canvas.toBlob` callback. Changing the format while an export is pending can give encoded bytes a different extension. Capture the format and filename together before rendering, and cover delayed image loading and blob callbacks in a focused test. The shared download helper preserves the caller's filename and does not manage export state.

## India Weather

### Bring back WAQI dominant-pollutant in the popup
Each city's marker popup used to show "Dominant: PM2.5 · 5 stations". The Cloudflare Worker dropped the per-city WAQI feed call (one extra subrequest per city, 20 total) to fit the free-tier 50-subrequest cap. The popup currently has no Dominant line.

Two ways to reinstate:
- Upgrade to Workers Paid ($5/mo, 1000-subrequest cap). Simplest; also unlocks headroom for adding more cities.
- Cache dominant pollutant in Cloudflare KV with a ~24h TTL — pollutants change slowly (PM2.5 dominates Indian cities most of the year, ozone in summer), so polling once a day is plenty. KV reads/writes cost subrequests too, but only one batched read per run instead of 20.

### Interpolate 1-2 missed-run gaps in the 24h WAQI series
The Cloudflare Worker fires reliably every 15 min, but a single failed run leaves a `null` slot in the rolling 24h history. The chart already handles nulls (line breaks), but linearly interpolating a single missed slot would look smoother and is honest at 15-min cadence (AQI doesn't move that fast).

Implementation sketch: a `fillShortGapsByTime(points, key, maxGapMs)` pass before `pointsToLine()` in `static/india-weather/india-weather.js`, with a 30-minute threshold. Anything longer stays a break.

## Search

The page is live at `/search/` (2026-11-12): the navbar icon, `/` from any page and a link on the Writing page lead to it. Stage 1 (the clean passage index, BM25 and the first scores) and stage 2 (the static embedding table) are built; stage 3 (answers from the results) was measured on 2026-11-12 and not shipped. The plan, decisions and every measurement are in `_devlog/local-search/journal.md`, the search scores are in `_devlog/local-search/evals/results/` and the answer scores in `_devlog/local-search/evals/answers/results/`.

### Review the evaluation set
`_devlog/local-search/evals/questions.json` has 40 queries (36 answerable, 4 with no answer), chosen on 2026-11-11 at 30 to 40 because the site is small. It awaits Aayush's review: the six judgments listed at the end of its README, and queries in his own words, since his phrasing is the closest thing to a real visitor the set has. If a query or judgment changes, rescore every run with `node _devlog/local-search/evals/run-eval.mjs`.

### Decide what the page shows for weak matches
BM25 returns every page that shares a word, so a query the site cannot answer still returns rows (28, 31, 9 and 2 for the four no-answer queries) and a natural-language question returns 20 to 40. The measurements do not support an absolute score floor (the highest top score of a no-answer query, 12.5, is at or above the score of the best right page for 28 of the 36 answerable queries, so any floor that silences the no-answer queries hides most real answers). A cutoff relative to the top score of each query lost 1 or 2 of 62 relevant top-10 pages in the set at 25 and 50 percent; that is a decision for Aayush, not a tuned default. Stage 2 capped the rows shown: a search lists its best 8 with a Show all control, and the counts stay truthful. With meaning added, a query with no keyword match shows its five closest pages by meaning under a line that says so (review fix, 2026-11-12). Still open: a no-answer query that shares a common word with some page (the four evaluation ones do) still lists those keyword matches, so a cutoff would have to rest on something other than a score; options are leave as is or the relative cutoff.

### Index the weather page body, or not
`india-weather.html` keeps `match-body: false` (title and description only, because its body is map interface text), yet the evaluation set grades it as an answer to `question-04`. It is found through its description in the current runs.

### Tools: index more than the interface text
The 14 tools are indexed from their own visible text, which is only labels and buttons. Queries such as "make a photo black and white" (Image Adjust & Transform says Grayscale) need meaning, not words: stage 2.

### Stage 2 follow-ups
Stage 2 is built (BM25 plus the potion static table, fused over the top 10 of each list; see the journal). Open: look again at the fusion cut-off, because the held-out set did not confirm the development result (full lists 0.78 recall at 5, top 10 0.72, see the journal); write a new held-out set, because `questions-holdout.json` has now been scored once; the phone and real-network costs are unmeasured.

### A stale search index after a deploy
A visitor who opened `/search/` just before a deploy can keep the old `search-index.json` in the browser cache, because GitHub Pages caches for ten minutes (`max-age=600`). The meaning files are checked against the index's hash, so a mismatch only turns meaning search off for that visit (keyword search keeps working on the old text, and result links to a renamed section land at the top of the page). It heals itself after the cache expires, so it is left as is. A fix, if it ever matters: fetch the index with `?v=<build id>` from a small inline value, or `cache: 'no-cache'`.

### Revisit answers later?
No answer feature ships: none of four small models passed the rule (decline at least 13 of 15 unanswerable questions and be faithful on at least 15 of 30 answerable ones). They extract a nearby fact instead of declining. The journal entry "2026-11-12, stage 3: result and decision" has the scores, examples and limits. Possibilities, none planned: pass more than one passage per page (9 of the 10 retrieval misses had the right page in the top four), test a retrieval score gate offline on the stored retrieval in `evals/answers/results/retrieval.json`, a larger or decline-trained model (ruled out on 2026-11-11), or a stricter prompt. Re-run the questions with `evals/answers/harness/run-answers.mjs` and score with `evals/answers/results/score.mjs`.

### Measure on a phone
The stage 1 and stage 2 costs were measured in Chromium on a laptop only.
