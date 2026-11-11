# bm25-quarto.exact

BM25, exact, over Quarto's search.json passages

Index: search.json, 47 pages, 180 passages, 394989 bytes. Questions: 40, file hash ea19782d861a.

| Type | Queries | Recall@5 | MRR@10 | nDCG@10 |
|---|---|---|---|---|
| lookup | 4 | 1.00 | 1.00 | 1.00 |
| topic | 4 | 1.00 | 0.83 | 0.91 |
| question | 5 | 1.00 | 0.87 | 0.97 |
| paraphrase | 6 | 0.33 | 0.12 | 0.24 |
| partial | 5 | 0.20 | 0.07 | 0.12 |
| tool | 4 | 0.75 | 0.46 | 0.65 |
| person | 4 | 0.50 | 0.38 | 0.41 |
| multi | 4 | 0.92 | 1.00 | 0.85 |
| **answerable** | 36 | 0.69 | 0.56 | 0.62 |

Typing replay (last word cut to its first half, 31 queries): recall@5 0.68, MRR@10 0.52.

No-answer queries:

| Query | Results | Top score |
|---|---|---|
| deploying models on kubernetes | 24 | 4.235 |
| mamba state space language model | 27 | 12.072 |
| rag with a vector database | 7 | 4.855 |
| react hooks tutorial | 1 | 5.9 |

Latency in Node v24.22.0: ranking 0.004 ms median, 0.239 ms worst over 40 queries; index build 11.262 ms.
