# bm25-clean.porter-prefix.stop-words-kept

BM25, porter-prefix.stop-words-kept, over the clean index

Index: search-index.json, 47 pages, 459 passages, 346530 bytes. Questions: 40, file hash ea19782d861a.

| Type | Queries | Recall@5 | MRR@10 | nDCG@10 |
|---|---|---|---|---|
| lookup | 4 | 1.00 | 1.00 | 1.00 |
| topic | 4 | 1.00 | 0.88 | 0.91 |
| question | 5 | 1.00 | 1.00 | 1.00 |
| paraphrase | 6 | 0.17 | 0.12 | 0.21 |
| partial | 5 | 0.60 | 0.50 | 0.64 |
| tool | 4 | 0.75 | 0.63 | 0.72 |
| person | 4 | 0.50 | 0.54 | 0.54 |
| multi | 4 | 1.00 | 1.00 | 0.89 |
| **answerable** | 36 | 0.72 | 0.68 | 0.71 |

Typing replay (last word cut to its first half, 31 queries): recall@5 0.76, MRR@10 0.68.

No-answer queries:

| Query | Results | Top score |
|---|---|---|
| deploying models on kubernetes | 33 | 7.498 |
| mamba state space language model | 31 | 12.475 |
| rag with a vector database | 44 | 6.422 |
| react hooks tutorial | 2 | 6.683 |

Latency in Node v24.22.0: ranking 0.04 ms median, 0.376 ms worst over 40 queries; index build 12.91 ms.
