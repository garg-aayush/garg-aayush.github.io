# placeholder-quarto

The step one placeholder ranking over Quarto's search.json

Index: search.json, 47 pages, 180 passages, 394989 bytes. Questions: 40, file hash ea19782d861a.

| Type | Queries | Recall@5 | MRR@10 | nDCG@10 |
|---|---|---|---|---|
| lookup | 4 | 1.00 | 1.00 | 1.00 |
| topic | 4 | 0.75 | 0.75 | 0.80 |
| question | 5 | 0.20 | 0.40 | 0.25 |
| paraphrase | 6 | 0.00 | 0.00 | 0.00 |
| partial | 5 | 0.40 | 0.40 | 0.39 |
| tool | 4 | 0.00 | 0.00 | 0.00 |
| person | 4 | 0.25 | 0.25 | 0.19 |
| multi | 4 | 0.25 | 0.50 | 0.29 |
| **answerable** | 36 | 0.33 | 0.39 | 0.34 |

Typing replay (last word cut to its first half, 31 queries): recall@5 0.37, MRR@10 0.42.

No-answer queries:

| Query | Results | Top score |
|---|---|---|
| deploying models on kubernetes | 0 | 0 |
| mamba state space language model | 0 | 0 |
| rag with a vector database | 0 | 0 |
| react hooks tutorial | 0 | 0 |

Latency in Node v24.22.0: ranking 0.073 ms median, 0.565 ms worst over 40 queries.
