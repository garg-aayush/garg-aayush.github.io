# bm25-quarto.s

BM25, s, over Quarto's search.json passages

Index: search.json, 47 pages, 180 passages, 394989 bytes. Questions: 40, file hash ea19782d861a.

| Type | Queries | Recall@5 | MRR@10 | nDCG@10 |
|---|---|---|---|---|
| lookup | 4 | 1.00 | 1.00 | 1.00 |
| topic | 4 | 1.00 | 0.83 | 0.91 |
| question | 5 | 1.00 | 0.90 | 0.98 |
| paraphrase | 6 | 0.00 | 0.09 | 0.20 |
| partial | 5 | 0.40 | 0.27 | 0.28 |
| tool | 4 | 0.75 | 0.46 | 0.65 |
| person | 4 | 0.50 | 0.38 | 0.41 |
| multi | 4 | 0.92 | 1.00 | 0.92 |
| **answerable** | 36 | 0.66 | 0.58 | 0.64 |

Typing replay (last word cut to its first half, 31 queries): recall@5 0.57, MRR@10 0.55.

No-answer queries:

| Query | Results | Top score |
|---|---|---|
| deploying models on kubernetes | 28 | 4.235 |
| mamba state space language model | 28 | 11.551 |
| rag with a vector database | 8 | 4.677 |
| react hooks tutorial | 2 | 5.735 |

Latency in Node v24.22.0: ranking 0.006 ms median, 0.19 ms worst over 40 queries; index build 14.022 ms.
