# bm25-clean.porter-prefix.no-code

BM25, porter-prefix.no-code, over the clean index

Index: search-index.json, 47 pages, 459 passages, 346530 bytes. Questions: 40, file hash ea19782d861a.

| Type | Queries | Recall@5 | MRR@10 | nDCG@10 |
|---|---|---|---|---|
| lookup | 4 | 1.00 | 1.00 | 1.00 |
| topic | 4 | 1.00 | 0.88 | 0.89 |
| question | 5 | 1.00 | 0.87 | 0.97 |
| paraphrase | 6 | 0.33 | 0.18 | 0.31 |
| partial | 5 | 0.60 | 0.40 | 0.58 |
| tool | 4 | 0.75 | 0.58 | 0.69 |
| person | 4 | 0.75 | 0.42 | 0.50 |
| multi | 4 | 1.00 | 0.88 | 0.83 |
| **answerable** | 36 | 0.78 | 0.62 | 0.70 |

Typing replay (last word cut to its first half, 31 queries): recall@5 0.80, MRR@10 0.68.

No-answer queries:

| Query | Results | Top score |
|---|---|---|
| deploying models on kubernetes | 28 | 7.123 |
| mamba state space language model | 31 | 12.604 |
| rag with a vector database | 9 | 5.189 |
| react hooks tutorial | 2 | 6.665 |

Latency in Node v24.22.0: ranking 0.035 ms median, 5.841 ms worst over 40 queries; index build 10.778 ms.
