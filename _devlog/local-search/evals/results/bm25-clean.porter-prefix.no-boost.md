# bm25-clean.porter-prefix.no-boost

BM25, porter-prefix.no-boost, over the clean index

Index: search-index.json, 47 pages, 459 passages, 346530 bytes. Questions: 40, file hash ea19782d861a.

| Type | Queries | Recall@5 | MRR@10 | nDCG@10 |
|---|---|---|---|---|
| lookup | 4 | 1.00 | 1.00 | 1.00 |
| topic | 4 | 1.00 | 0.88 | 0.91 |
| question | 5 | 1.00 | 0.90 | 0.98 |
| paraphrase | 6 | 0.33 | 0.14 | 0.21 |
| partial | 5 | 0.60 | 0.50 | 0.64 |
| tool | 4 | 0.75 | 0.56 | 0.68 |
| person | 4 | 0.50 | 0.40 | 0.48 |
| multi | 4 | 1.00 | 0.75 | 0.78 |
| **answerable** | 36 | 0.75 | 0.62 | 0.69 |

Typing replay (last word cut to its first half, 31 queries): recall@5 0.80, MRR@10 0.66.

No-answer queries:

| Query | Results | Top score |
|---|---|---|
| deploying models on kubernetes | 28 | 7.518 |
| mamba state space language model | 31 | 11.915 |
| rag with a vector database | 9 | 5.382 |
| react hooks tutorial | 2 | 6.143 |

Latency in Node v24.22.0: ranking 0.031 ms median, 0.406 ms worst over 40 queries; index build 12.522 ms.
