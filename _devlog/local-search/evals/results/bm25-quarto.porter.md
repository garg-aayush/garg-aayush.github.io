# bm25-quarto.porter

BM25, porter, over Quarto's search.json passages

Index: search.json, 47 pages, 180 passages, 394989 bytes. Questions: 40, file hash ea19782d861a.

| Type | Queries | Recall@5 | MRR@10 | nDCG@10 |
|---|---|---|---|---|
| lookup | 4 | 1.00 | 1.00 | 1.00 |
| topic | 4 | 1.00 | 0.83 | 0.91 |
| question | 5 | 1.00 | 0.87 | 0.97 |
| paraphrase | 6 | 0.17 | 0.10 | 0.24 |
| partial | 5 | 0.40 | 0.40 | 0.51 |
| tool | 4 | 0.75 | 0.46 | 0.65 |
| person | 4 | 0.75 | 0.46 | 0.51 |
| multi | 4 | 0.92 | 1.00 | 0.88 |
| **answerable** | 36 | 0.71 | 0.61 | 0.68 |

Typing replay (last word cut to its first half, 31 queries): recall@5 0.60, MRR@10 0.57.

No-answer queries:

| Query | Results | Top score |
|---|---|---|
| deploying models on kubernetes | 28 | 6.258 |
| mamba state space language model | 28 | 11.52 |
| rag with a vector database | 8 | 4.677 |
| react hooks tutorial | 2 | 5.735 |

Latency in Node v24.22.0: ranking 0.005 ms median, 5.083 ms worst over 40 queries; index build 14.011 ms.
