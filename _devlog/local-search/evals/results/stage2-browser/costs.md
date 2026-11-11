# Costs of the meaning search in Chromium

Measured on 2026-11-11 on one laptop (darwin arm64), Chromium 156.0.8078.4 driven by Playwright, Node v24.22.0, against a local server. A phone was not measured. GitHub Pages' own compression of these files was not observed.

## Bytes of each file

| File | Raw | gzip (level 9) | brotli (quality 11) |
|---|---|---|---|
| search-index.json | 346530 | 117616 | 98648 |
| search-vectors.json | 173222 | 118728 | 115656 |
| static/search/potion-base-8M.int8.bin | 7559168 | 5573413 | 5490560 |
| static/search/potion-base-8M.vocab.txt | 219690 | 106730 | 91231 |
| static/search/manifest.json | 1728 | 853 | 744 |
| static/js/search.js | 16481 | 5365 | 4569 |
| static/js/search-rank.js | 12808 | 4413 | 3929 |
| static/js/search-embed.js | 5430 | 2325 | 1987 |

The three files the page fetches on first use: 7952080 bytes raw (7.95 MB), 5798871 gzip (5.80 MB), 5697447 brotli (5.70 MB). The keyword index (346530 raw, 117616 gzip) is fetched on every visit as before. The int8 passage vectors alone are 129536 bytes; the JSON carries them as base64.

## First focus until meaning search is ready

Cold cache, a fresh browser context each time, local server without compression, 9 runs: median 32.5 ms, fastest 26.8 ms, slowest 45.1 ms. This includes the three fetches (a local read, not a download), hashing the table and vocabulary, building the embedder and reading the vectors.

Fetches in the last cold run (start and end in ms from navigation, bytes transferred):

- search-vectors.json: 1267 to 1268 ms, 173522 bytes
- potion-base-8M.int8.bin: 1269 to 1279 ms, 7559468 bytes
- potion-base-8M.vocab.txt: 1269 to 1270 ms, 219990 bytes

Warm cache (second visit in the same browser within max-age = 600 s, as GitHub Pages sends), 5 runs: median 26.8 ms. Requests the server saw for the three files on the second visit: ["200 /static/search/potion-base-8M.int8.bin"]. Playwright's in-memory browser contexts do not keep the 7.5 MB table, which is why it is fetched again here; cache-check.mjs repeats the visit in a persistent profile with a disk cache, where all three files came from the cache (results/stage2-browser/cache-check.md).
Revalidation (max-age = 0, as if the 10 minutes had passed): ready in 25.8 ms; the server answered 304 search-vectors.json, 200 potion-base-8M.int8.bin, 304 potion-base-8M.vocab.txt.

## Emulated slow links (cold cache, 3 runs each, median)

| Link | Server compression | Bytes on the wire for the three files | Ready after first focus |
|---|---|---|---|
| 10 Mbit/s, 40 ms | none | 7952980 | 6484 ms |
| 10 Mbit/s, 40 ms | brotli on every file | 5750358 | 4727.7 ms |
| 1.6 Mbit/s, 150 ms (Lighthouse slow 4G) | none | 7952980 | 40112 ms |
| 1.6 Mbit/s, 150 ms (Lighthouse slow 4G) | brotli on every file | 5750358 | 29099.3 ms |

## Per query time and memory

Over the 40 questions, each repeated many times in one page (Chromium, this machine).

- Ranking alone, keyword (BM25): 0.0198 ms median, 0.052 ms slowest query (mean over runs).
- Embedding the query: 0.0025 ms median, 0.0155 ms slowest query (mean over runs).
- Ranking alone, hybrid (embed, cosine over 506 passages, fuse): 0.1075 ms median, 0.137 ms slowest query (mean over runs).
- A whole keystroke through the page's input handler (rank, snippets, drawing the rows), keyword only: 0.405 ms median, 0.7425 ms slowest query (mean over runs); hybrid: 0.3625 ms median, 0.54 ms slowest query (mean over runs).
- One-off work after the files arrive: building the BM25 index 13.3 ms; the embedder (vocabulary map and median token length) and the vectors, excluding hashing: 8.1 ms.
- JS heap after garbage collection: 8.37 MB keyword only, 9.26 MB with meaning (difference 0.89 MB). The 7.56 MB table and the 0.52 MB float vectors are typed arrays, which V8 counts outside this heap, so the page holds about 8 MB more than the difference above.
