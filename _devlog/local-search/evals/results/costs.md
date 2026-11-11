# Stage 1 costs

Measured on 2026-11-11 on one laptop: Apple M5 Pro, macOS (Darwin 27.0.1, arm64). The browser is Chromium 156.0.8078.4, headless, driven by Playwright. Node is 24.22.0. A phone was not measured, and neither was a real network: the page was served from the same machine, so the fetch time is a local read, not a download.

## The index

Rendered site of 2026-11-11 (47 pages, 459 passages). Hash 759f6c5572dd74aa, schema version 1.

| File | Raw bytes | Gzip level 9 bytes | Passages |
|---|---|---|---|
| search-index.json | 346,530 | 117,508 | 459 |
| search.json (Quarto, the old source) | 394,989 | 121,895 | 188 rows |

- 46 pages have passages. The weather page has none (`match-body: false`).
- 404 passages have a section anchor and 55 do not (text before a first heading, tools). 9 passages are a heading with no text. 121 have a code and formula field.
- Passage text is 271,797 characters in total (median 635, 90th percentile 959, longest 1,000). The code and formula field is 32,917 characters.
- Build time of `scripts/build-search-index.mjs` in the Quarto post-render step: 60 to 82 ms over the runs of this day (the last three: 60, 67 and 65 ms).
- Passages per page type: 25 posts hold 406 of them, the other 7 pages with text hold 39, each of the 14 tools has 1.

## In Chromium (`measure-cost.mjs`)

Fresh page each time, empty stem cache, median of 9 pages.

| Step | Median ms |
|---|---|
| Fetch search-index.json (local server, no cache) | 1.1 |
| Parse the JSON | 1.1 |
| Build the BM25 index in memory | 15.5 |
| Total, fetch to ready | 17.9 (worst 18.9) |

Ranking one query (analysis, BM25 over every passage, one row per page), over the 40 queries, each timed over 500 runs because the browser clock is coarse:

| Measure | ms |
|---|---|
| Median query | 0.028 |
| Slowest query, mean of its runs | 0.062 |
| Slowest single run | 0.2 |

## In Node 24.22.0 (run-eval.mjs, default variant)

Index build 10 to 11 ms (11.2 and 10.3 in two runs). Ranking per query: 0.03 ms median, under 0.4 ms worst single run (20 runs of each of the 40 queries). Every run's own latency is in its `.json` and in `summary.md`.
