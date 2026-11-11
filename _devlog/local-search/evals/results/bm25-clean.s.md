# bm25-clean.s

BM25, s, over the clean index

Index: search-index.json, 47 pages, 459 passages, 346530 bytes. Questions: 40, file hash ea19782d861a.

| Type | Queries | Recall@5 | MRR@10 | nDCG@10 |
|---|---|---|---|---|
| lookup | 4 | 1.00 | 1.00 | 1.00 |
| topic | 4 | 1.00 | 0.88 | 0.91 |
| question | 5 | 1.00 | 0.87 | 0.97 |
| paraphrase | 6 | 0.17 | 0.06 | 0.12 |
| partial | 5 | 0.40 | 0.30 | 0.29 |
| tool | 4 | 0.75 | 0.46 | 0.63 |
| person | 4 | 0.50 | 0.38 | 0.41 |
| multi | 4 | 1.00 | 1.00 | 0.92 |
| **answerable** | 36 | 0.69 | 0.58 | 0.62 |

Typing replay (last word cut to its first half, 31 queries): recall@5 0.60, MRR@10 0.51.

No-answer queries:

| Query | Results | Top score |
|---|---|---|
| deploying models on kubernetes | 28 | 7.206 |
| mamba state space language model | 31 | 12.661 |
| rag with a vector database | 9 | 5.282 |
| react hooks tutorial | 2 | 6.683 |

Latency in Node v24.22.0: ranking 0.005 ms median, 0.273 ms worst over 40 queries; index build 11.366 ms.
