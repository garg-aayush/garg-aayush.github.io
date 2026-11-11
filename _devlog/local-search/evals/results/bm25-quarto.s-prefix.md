# bm25-quarto.s-prefix

BM25, s-prefix, over Quarto's search.json passages

Index: search.json, 47 pages, 180 passages, 394989 bytes. Questions: 40, file hash ea19782d861a.

| Type | Queries | Recall@5 | MRR@10 | nDCG@10 |
|---|---|---|---|---|
| lookup | 4 | 1.00 | 1.00 | 1.00 |
| topic | 4 | 1.00 | 0.83 | 0.91 |
| question | 5 | 1.00 | 0.90 | 0.98 |
| paraphrase | 6 | 0.00 | 0.09 | 0.21 |
| partial | 5 | 0.80 | 0.67 | 0.68 |
| tool | 4 | 0.75 | 0.46 | 0.65 |
| person | 4 | 0.50 | 0.38 | 0.41 |
| multi | 4 | 0.92 | 1.00 | 0.91 |
| **answerable** | 36 | 0.71 | 0.64 | 0.69 |

Typing replay (last word cut to its first half, 31 queries): recall@5 0.73, MRR@10 0.64.

No-answer queries:

| Query | Results | Top score |
|---|---|---|
| deploying models on kubernetes | 28 | 4.235 |
| mamba state space language model | 28 | 11.52 |
| rag with a vector database | 8 | 4.677 |
| react hooks tutorial | 2 | 5.735 |

Latency in Node v24.22.0: ranking 0.034 ms median, 0.316 ms worst over 40 queries; index build 11.568 ms.
