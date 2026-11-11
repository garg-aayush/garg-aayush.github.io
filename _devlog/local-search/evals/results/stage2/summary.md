# Stage 2: offline embedding comparison

Written by compare.mjs on 2026-11-11. Index: search-index.json, hash 759f6c5572dd74aa, 47 pages, 459 passages, 346530 bytes. Questions: 40 (36 answerable), questions.json unchanged. BM25 is the stage 1 default (Porter stemming, last word as a prefix) run through static/js/search-rank.js; it reproduces results/bm25-clean.porter-prefix.json query for query (checked in this run: 0 queries differ, same index hash).

Semantic ranking: cosine similarity, one row per page from its best passage. Hybrid: reciprocal rank fusion of the BM25 ranking and the semantic ranking, k = 60, nothing tuned to these queries. Counts are queries; with 36 answerable queries and 4 to 6 per type, a difference of one or two queries is noise.

## Headline

| Configuration | Recall@5 | MRR@10 | nDCG@10 |
|---|---|---|---|
| BM25 alone (stage 1 default) | 0.75 | 0.64 | 0.71 |
| potion-base-8M, fp32 table, 256 dims, alone | 0.87 | 0.70 | 0.76 |
| potion-base-8M, fp32 table, 256 dims, plus BM25 | 0.85 | 0.75 | 0.80 |
| all-MiniLM-L6-v2, q8, 384 dims, alone | 0.94 | 0.77 | 0.80 |
| all-MiniLM-L6-v2, q8, 384 dims, plus BM25 | 0.85 | 0.74 | 0.80 |
| mdbr-leaf-ir, q8, 768 dims, alone | 0.96 | 0.81 | 0.85 |
| mdbr-leaf-ir, q8, 768 dims, plus BM25 | 0.85 | 0.80 | 0.84 |
| mdbr-leaf-ir, q8, 256 dims, alone | 0.96 | 0.83 | 0.85 |
| mdbr-leaf-ir, q8, 256 dims, plus BM25 | 0.85 | 0.83 | 0.85 |
| EmbeddingGemma 2 text, q4, 768 dims (reference), alone | 0.98 | 0.89 | 0.89 |
| EmbeddingGemma 2 text, q4, 768 dims (reference), plus BM25 | 0.85 | 0.80 | 0.83 |
| EmbeddingGemma 2 text, q4, 256 dims (reference), alone | 0.86 | 0.88 | 0.84 |
| EmbeddingGemma 2 text, q4, 256 dims (reference), plus BM25 | 0.89 | 0.78 | 0.80 |

## Headline with the page descriptions embedded too (ablation)

The same rows with 47 more passages, one per page, made of its description. BM25 has these passages, and without them the weather page (no passages of its own) cannot be found by an embedding, which is why question-04 is lost in every row above.

| Configuration | Recall@5 | MRR@10 | nDCG@10 |
|---|---|---|---|
| BM25 alone (stage 1 default) | 0.75 | 0.64 | 0.71 |
| potion-base-8M, fp32 table, 256 dims, alone | 0.89 | 0.70 | 0.77 |
| potion-base-8M, fp32 table, 256 dims, plus BM25 | 0.86 | 0.75 | 0.81 |
| potion-base-8M, int8 table, 256 dims, alone | 0.89 | 0.72 | 0.79 |
| potion-base-8M, int8 table, 256 dims, plus BM25 | 0.86 | 0.74 | 0.80 |
| potion-base-8M, int8 table, PCA 128 dims, alone | 0.79 | 0.65 | 0.73 |
| potion-base-8M, int8 table, PCA 128 dims, plus BM25 | 0.83 | 0.70 | 0.77 |
| all-MiniLM-L6-v2, q8, 384 dims, alone | 0.94 | 0.78 | 0.82 |
| all-MiniLM-L6-v2, q8, 384 dims, plus BM25 | 0.85 | 0.72 | 0.80 |
| mdbr-leaf-ir, q8, 768 dims, alone | 0.97 | 0.83 | 0.87 |
| mdbr-leaf-ir, q8, 768 dims, plus BM25 | 0.86 | 0.78 | 0.84 |
| mdbr-leaf-ir, q8, 256 dims, alone | 0.97 | 0.83 | 0.87 |
| mdbr-leaf-ir, q8, 256 dims, plus BM25 | 0.86 | 0.80 | 0.85 |
| EmbeddingGemma 2 text, q4, 768 dims (reference), alone | 0.97 | 0.89 | 0.90 |
| EmbeddingGemma 2 text, q4, 768 dims (reference), plus BM25 | 0.89 | 0.79 | 0.84 |

## Per type, hybrid (recall@5 / MRR@10)

| Configuration | lookup (4) | topic (4) | question (5) | paraphrase (6) | partial (5) | tool (4) | person (4) | multi (4) |
|---|---|---|---|---|---|---|---|---|
| BM25 alone | 1.00 / 1.00 | 1.00 / 0.88 | 1.00 / 0.87 | 0.33 / 0.16 | 0.60 / 0.50 | 0.75 / 0.63 | 0.50 / 0.41 | 1.00 / 0.88 |
| potion-base-8M, fp32 table, 256 dims, plus BM25 | 1.00 / 1.00 | 1.00 / 0.88 | 0.90 / 0.87 | 0.67 / 0.56 | 0.80 / 0.70 | 0.75 / 0.63 | 0.75 / 0.63 | 1.00 / 0.88 |
| all-MiniLM-L6-v2, q8, 384 dims, plus BM25 | 1.00 / 1.00 | 1.00 / 0.88 | 0.90 / 0.87 | 0.67 / 0.55 | 0.80 / 0.59 | 0.75 / 0.63 | 0.75 / 0.63 | 1.00 / 0.88 |
| mdbr-leaf-ir, q8, 768 dims, plus BM25 | 1.00 / 1.00 | 1.00 / 1.00 | 0.90 / 0.90 | 0.67 / 0.50 | 0.80 / 0.72 | 0.75 / 0.75 | 0.75 / 0.75 | 1.00 / 0.88 |
| mdbr-leaf-ir, q8, 256 dims, plus BM25 | 1.00 / 1.00 | 1.00 / 1.00 | 0.90 / 0.90 | 0.67 / 0.60 | 0.80 / 0.72 | 0.75 / 0.75 | 0.75 / 0.75 | 1.00 / 1.00 |
| EmbeddingGemma 2 text, q4, 768 dims (reference), plus BM25 | 1.00 / 1.00 | 1.00 / 1.00 | 0.90 / 0.87 | 0.67 / 0.53 | 0.80 / 0.72 | 0.75 / 0.63 | 0.75 / 0.75 | 1.00 / 1.00 |
| EmbeddingGemma 2 text, q4, 256 dims (reference), plus BM25 | 0.88 / 1.00 | 1.00 / 1.00 | 0.90 / 0.90 | 1.00 / 0.46 | 0.80 / 0.70 | 0.75 / 0.63 | 0.75 / 0.75 | 1.00 / 1.00 |

## Per type, semantic alone (recall@5 / MRR@10)

| Configuration | lookup (4) | topic (4) | question (5) | paraphrase (6) | partial (5) | tool (4) | person (4) | multi (4) |
|---|---|---|---|---|---|---|---|---|
| potion-base-8M, fp32 table, 256 dims, alone | 1.00 / 1.00 | 1.00 / 0.88 | 0.90 / 0.85 | 0.67 / 0.48 | 0.80 / 0.72 | 1.00 / 0.63 | 0.75 / 0.38 | 0.92 / 0.75 |
| all-MiniLM-L6-v2, q8, 384 dims, alone | 0.88 / 0.83 | 1.00 / 1.00 | 0.90 / 0.90 | 1.00 / 0.58 | 0.80 / 0.59 | 1.00 / 1.00 | 1.00 / 0.50 | 1.00 / 0.88 |
| mdbr-leaf-ir, q8, 768 dims, alone | 1.00 / 1.00 | 1.00 / 1.00 | 0.90 / 1.00 | 0.83 / 0.61 | 1.00 / 0.61 | 1.00 / 0.65 | 1.00 / 0.71 | 1.00 / 1.00 |
| mdbr-leaf-ir, q8, 256 dims, alone | 1.00 / 1.00 | 1.00 / 1.00 | 0.90 / 1.00 | 0.83 / 0.64 | 1.00 / 0.57 | 1.00 / 0.81 | 1.00 / 0.75 | 1.00 / 1.00 |
| EmbeddingGemma 2 text, q4, 768 dims (reference), alone | 1.00 / 1.00 | 1.00 / 0.88 | 0.90 / 0.90 | 1.00 / 0.75 | 1.00 / 0.74 | 1.00 / 1.00 | 1.00 / 1.00 | 0.92 / 1.00 |
| EmbeddingGemma 2 text, q4, 256 dims (reference), alone | 0.88 / 1.00 | 1.00 / 1.00 | 0.90 / 1.00 | 0.67 / 0.72 | 0.80 / 0.57 | 1.00 / 1.00 | 1.00 / 0.88 | 0.75 / 1.00 |

## Sub-runs: int8 tables, fewer dimensions, int8 passage vectors

| Configuration | Alone R@5 | MRR@10 | nDCG@10 | Plus BM25 R@5 | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|
| potion-base-8M, int8 table, 256 dims | 0.87 | 0.70 | 0.76 | 0.85 | 0.75 | 0.79 |
| potion-base-8M, fp32 table, PCA 128 dims | 0.77 | 0.63 | 0.71 | 0.82 | 0.73 | 0.76 |
| potion-base-8M, int8 table, PCA 128 dims | 0.77 | 0.63 | 0.71 | 0.82 | 0.73 | 0.76 |
| EmbeddingGemma 2 text, q4, 512 dims | 0.94 | 0.92 | 0.89 | 0.85 | 0.80 | 0.83 |
| EmbeddingGemma 2 text, q4, 128 dims | 0.81 | 0.69 | 0.70 | 0.81 | 0.73 | 0.75 |
| all-MiniLM-L6-v2, q8, passage vectors as int8 | 0.94 | 0.77 | 0.80 | 0.85 | 0.72 | 0.79 |
| mdbr-leaf-ir, q8, 768 dims, passage vectors as int8 | 0.96 | 0.81 | 0.85 | 0.85 | 0.81 | 0.84 |
| mdbr-leaf-ir, q8, 256 dims, passage vectors as int8 | 0.93 | 0.83 | 0.85 | 0.85 | 0.83 | 0.85 |
| EmbeddingGemma 2 text, q4, 768 dims, passage vectors as int8 | 0.98 | 0.89 | 0.89 | 0.88 | 0.81 | 0.83 |
| EmbeddingGemma 2 text, q4, 256 dims, passage vectors as int8 | 0.86 | 0.87 | 0.84 | 0.89 | 0.78 | 0.80 |

## Extra rows

| Configuration | Alone R@5 | MRR@10 | nDCG@10 | Plus BM25 R@5 | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|
| potion-retrieval-32M, fp32 table, 512 dims | 0.90 | 0.77 | 0.82 | 0.85 | 0.72 | 0.78 |
| potion-retrieval-32M, int8 table, PCA 128 dims | 0.83 | 0.61 | 0.70 | 0.81 | 0.67 | 0.75 |
| arctic-embed-m-v1.5, q8, 768 dims, on both sides | 0.96 | 0.86 | 0.89 | 0.85 | 0.76 | 0.81 |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 768 dims | 0.96 | 0.85 | 0.88 | 0.82 | 0.77 | 0.82 |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 256 dims | 0.95 | 0.84 | 0.86 | 0.82 | 0.78 | 0.82 |

## Per query against BM25 alone

Fixed means recall@5 is higher than BM25 alone on that query, broken means lower. Top 1 gained or lost means the first right page moved to or from rank 1. Over the 36 answerable queries.

| Configuration | Fixed | Broken | Top 1 gained | Top 1 lost |
|---|---|---|---|---|
| potion-base-8M, fp32 table, 256 dims, alone | paraphrase-01, paraphrase-05, partial-03, tool-02, person-02 | question-04, multi-03 | paraphrase-01, paraphrase-02, partial-01, partial-03, person-02 | partial-05, tool-04, person-04, multi-01 |
| potion-base-8M, fp32 table, 256 dims, plus BM25 | paraphrase-04, paraphrase-05, partial-03, person-02 | question-04 | paraphrase-02, paraphrase-05, paraphrase-06, partial-03, person-02 | none |
| all-MiniLM-L6-v2, q8, 384 dims, alone | paraphrase-01, paraphrase-03, paraphrase-04, paraphrase-05, partial-03, tool-02, person-02, person-03 | lookup-02, question-04 | topic-03, paraphrase-02, paraphrase-05, tool-02, tool-03, person-02, multi-04 | lookup-04, person-04, multi-01 |
| all-MiniLM-L6-v2, q8, 384 dims, plus BM25 | paraphrase-04, paraphrase-05, partial-03, person-02 | question-04 | paraphrase-04, paraphrase-05, person-02 | none |
| mdbr-leaf-ir, q8, 768 dims, alone | paraphrase-01, paraphrase-03, paraphrase-04, paraphrase-05, partial-03, partial-04, tool-02, person-02, person-03 | question-04, paraphrase-06 | topic-03, question-05, paraphrase-01, paraphrase-02, paraphrase-05, partial-03, tool-03, person-01, person-02, multi-04 | partial-02, tool-04, person-04 |
| mdbr-leaf-ir, q8, 768 dims, plus BM25 | paraphrase-01, paraphrase-04, paraphrase-05, partial-03, person-02 | question-04, paraphrase-06 | topic-03, paraphrase-02, paraphrase-05, partial-03, tool-03, person-01, person-02 | none |
| mdbr-leaf-ir, q8, 256 dims, alone | paraphrase-01, paraphrase-03, paraphrase-04, paraphrase-05, partial-03, partial-04, tool-02, person-02, person-03 | question-04, paraphrase-06 | topic-03, question-05, paraphrase-01, paraphrase-02, paraphrase-05, partial-03, tool-03, person-02, multi-04 | partial-02 |
| mdbr-leaf-ir, q8, 256 dims, plus BM25 | paraphrase-01, paraphrase-04, paraphrase-05, partial-03, person-02 | question-04, paraphrase-06 | topic-03, paraphrase-02, paraphrase-04, paraphrase-05, partial-03, tool-03, person-01, person-02, multi-04 | none |
| EmbeddingGemma 2 text, q4, 768 dims (reference), alone | paraphrase-01, paraphrase-03, paraphrase-04, paraphrase-05, partial-03, partial-04, tool-02, person-02, person-03 | question-04, multi-03 | paraphrase-01, paraphrase-02, paraphrase-03, paraphrase-05, partial-03, tool-02, tool-03, person-01, person-02, person-03, multi-04 | none |
| EmbeddingGemma 2 text, q4, 768 dims (reference), plus BM25 | paraphrase-04, paraphrase-05, partial-03, person-02 | question-04 | topic-03, paraphrase-05, paraphrase-06, partial-03, person-01, person-02, multi-04 | none |
| EmbeddingGemma 2 text, q4, 256 dims (reference), alone | paraphrase-01, paraphrase-03, paraphrase-05, partial-03, tool-02, person-02, person-03 | lookup-02, question-04, paraphrase-06, multi-01, multi-03 | topic-03, question-05, paraphrase-01, paraphrase-02, paraphrase-03, paraphrase-05, partial-03, tool-02, tool-03, person-01, person-02, person-03, multi-04 | partial-02, person-04 |
| EmbeddingGemma 2 text, q4, 256 dims (reference), plus BM25 | paraphrase-01, paraphrase-03, paraphrase-04, paraphrase-05, partial-03, person-02 | lookup-02, question-04 | topic-03, paraphrase-02, partial-03, person-01, person-02, multi-04 | none |
| potion-base-8M, int8 table, 256 dims, alone | paraphrase-01, paraphrase-05, partial-03, tool-02, person-02 | question-04, multi-03 | paraphrase-01, paraphrase-02, partial-01, partial-03, person-02 | partial-05, tool-04, person-04, multi-01 |
| potion-base-8M, int8 table, 256 dims, plus BM25 | paraphrase-04, paraphrase-05, partial-03, person-02 | question-04 | paraphrase-02, paraphrase-05, partial-03, person-01, person-02 | none |
| potion-base-8M, fp32 table, PCA 128 dims, alone | paraphrase-01, paraphrase-05, partial-03, tool-02, person-02 | lookup-02, question-02, question-04, question-05, paraphrase-06, multi-02, multi-03 | partial-01, partial-03, person-02 | partial-02, partial-05, tool-04, person-04, multi-01, multi-02 |
| potion-base-8M, fp32 table, PCA 128 dims, plus BM25 | paraphrase-05, partial-03, person-02 | question-04 | paraphrase-02, paraphrase-05, partial-03, person-01, person-02 | partial-05 |
| potion-base-8M, int8 table, PCA 128 dims, alone | paraphrase-01, paraphrase-05, partial-03, tool-02, person-02 | lookup-02, question-02, question-04, question-05, paraphrase-06, multi-02, multi-03 | partial-01, partial-03, person-02 | partial-02, partial-05, tool-04, person-04, multi-01, multi-02 |
| potion-base-8M, int8 table, PCA 128 dims, plus BM25 | paraphrase-05, partial-03, person-02 | question-04 | paraphrase-02, paraphrase-05, partial-03, person-01, person-02 | partial-05 |
| potion-retrieval-32M, fp32 table, 512 dims, alone | paraphrase-01, paraphrase-03, paraphrase-04, paraphrase-05, partial-03, tool-02, person-02, person-03 | question-04, paraphrase-06, person-04 | paraphrase-01, paraphrase-02, partial-01, partial-03, person-03, multi-04 | tool-04, person-04 |
| potion-retrieval-32M, fp32 table, 512 dims, plus BM25 | paraphrase-04, paraphrase-05, partial-03, person-02 | question-04 | paraphrase-02, partial-03, person-01 | person-04 |
| potion-retrieval-32M, int8 table, PCA 128 dims, alone | paraphrase-01, paraphrase-03, paraphrase-04, partial-03, tool-02, person-02, person-03 | lookup-02, question-04, paraphrase-06, person-04, multi-02, multi-03 | partial-01, partial-03 | lookup-02, question-01, tool-04, person-04, multi-02, multi-03 |
| potion-retrieval-32M, int8 table, PCA 128 dims, plus BM25 | paraphrase-04, paraphrase-05, partial-03, person-02 | question-04, paraphrase-06, multi-03 | paraphrase-02, partial-03 | person-04, multi-02 |
| arctic-embed-m-v1.5, q8, 768 dims, on both sides, alone | paraphrase-01, paraphrase-03, paraphrase-04, paraphrase-05, partial-03, partial-04, tool-02, person-02, person-03 | question-04, paraphrase-06 | topic-03, question-05, paraphrase-01, paraphrase-02, paraphrase-05, partial-03, tool-03, person-02, person-03, multi-04 | partial-02 |
| arctic-embed-m-v1.5, q8, 768 dims, on both sides, plus BM25 | paraphrase-01, paraphrase-04, paraphrase-05, partial-03, person-02 | question-04, paraphrase-06 | topic-03, paraphrase-02, partial-03, person-01, person-02 | none |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 768 dims, alone | paraphrase-01, paraphrase-03, paraphrase-04, paraphrase-05, partial-03, partial-04, tool-02, person-02, person-03 | question-04, paraphrase-06 | topic-03, question-05, paraphrase-01, paraphrase-02, paraphrase-04, paraphrase-05, partial-03, tool-03, person-02, multi-04 | partial-02 |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 768 dims, plus BM25 | paraphrase-04, paraphrase-05, partial-03, person-02 | question-04, paraphrase-06 | topic-03, paraphrase-02, partial-03, tool-03, person-01, person-02 | none |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 256 dims, alone | paraphrase-01, paraphrase-03, paraphrase-04, paraphrase-05, partial-03, partial-04, tool-02, person-02, person-03 | question-04, paraphrase-06, multi-02 | topic-03, question-05, paraphrase-01, paraphrase-02, paraphrase-05, partial-03, tool-03, person-02, multi-04 | partial-02 |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 256 dims, plus BM25 | paraphrase-04, paraphrase-05, partial-03, person-02 | question-04, paraphrase-06 | topic-03, paraphrase-02, paraphrase-05, partial-03, person-01, person-02 | none |
| potion-base-8M, fp32 table, 256 dims, passage text desc, alone | paraphrase-01, paraphrase-05, partial-03, tool-02, person-02 | none | paraphrase-01, paraphrase-02, partial-01, partial-03, person-02, multi-04 | lookup-02, partial-05, tool-04, person-04, multi-01 |
| potion-base-8M, fp32 table, 256 dims, passage text desc, plus BM25 | paraphrase-04, paraphrase-05, partial-03, person-02 | none | paraphrase-02, paraphrase-05, paraphrase-06, partial-03, person-02 | none |
| potion-base-8M, int8 table, 256 dims, passage text desc, alone | paraphrase-01, paraphrase-05, partial-03, tool-02, person-02 | none | paraphrase-01, paraphrase-02, partial-01, partial-03, tool-03, person-02, multi-04 | lookup-02, partial-05, tool-04, person-04, multi-01 |
| potion-base-8M, int8 table, 256 dims, passage text desc, plus BM25 | paraphrase-04, paraphrase-05, partial-03, person-02 | none | paraphrase-02, paraphrase-05, partial-03, person-02 | none |
| potion-base-8M, int8 table, PCA 128 dims, passage text desc, alone | paraphrase-01, paraphrase-05, partial-03, tool-02, person-02 | lookup-02, question-02, question-05, paraphrase-06, multi-02, multi-03 | partial-01, partial-03, tool-03, person-02, multi-04 | lookup-02, partial-02, partial-05, tool-04, person-04, multi-02 |
| potion-base-8M, int8 table, PCA 128 dims, passage text desc, plus BM25 | paraphrase-05, partial-03, person-02 | none | paraphrase-02, paraphrase-05, partial-03, person-02 | partial-05, tool-04 |
| all-MiniLM-L6-v2, q8, 384 dims, passage text desc, alone | paraphrase-01, paraphrase-03, paraphrase-04, paraphrase-05, partial-03, tool-02, person-02, person-03 | lookup-02 | topic-03, paraphrase-02, paraphrase-03, paraphrase-05, tool-02, tool-03, person-02, multi-04 | lookup-04, person-04, multi-01 |
| all-MiniLM-L6-v2, q8, 384 dims, passage text desc, plus BM25 | paraphrase-04, paraphrase-05, partial-03, person-02 | none | paraphrase-04, person-02 | none |
| mdbr-leaf-ir, q8, 768 dims, passage text desc, alone | paraphrase-01, paraphrase-03, paraphrase-04, paraphrase-05, partial-03, partial-04, tool-02, person-02, person-03 | paraphrase-06 | topic-03, question-05, paraphrase-01, paraphrase-02, paraphrase-05, partial-03, tool-03, person-01, person-02, multi-04 | partial-02, person-04 |
| mdbr-leaf-ir, q8, 768 dims, passage text desc, plus BM25 | paraphrase-01, paraphrase-04, paraphrase-05, partial-03, person-02 | paraphrase-06 | topic-03, paraphrase-02, partial-03, tool-03, person-01, person-02 | none |
| mdbr-leaf-ir, q8, 256 dims, passage text desc, alone | paraphrase-01, paraphrase-03, paraphrase-04, paraphrase-05, partial-03, partial-04, tool-02, person-02, person-03 | paraphrase-06 | topic-03, question-05, paraphrase-01, paraphrase-02, paraphrase-05, partial-03, tool-03, person-02, multi-04 | partial-02 |
| mdbr-leaf-ir, q8, 256 dims, passage text desc, plus BM25 | paraphrase-01, paraphrase-04, paraphrase-05, partial-03, person-02 | paraphrase-06 | topic-03, paraphrase-02, paraphrase-04, partial-03, tool-03, person-02, multi-04 | none |
| EmbeddingGemma 2 text, q4, 768 dims (reference), passage text desc, alone | paraphrase-01, paraphrase-03, paraphrase-04, paraphrase-05, partial-03, tool-02, person-02, person-03 | none | paraphrase-01, paraphrase-02, paraphrase-03, paraphrase-05, partial-03, tool-02, tool-03, person-01, person-02, person-03, multi-04 | none |
| EmbeddingGemma 2 text, q4, 768 dims (reference), passage text desc, plus BM25 | paraphrase-03, paraphrase-04, paraphrase-05, partial-03, person-02 | none | topic-03, paraphrase-05, paraphrase-06, partial-03, person-01, person-02 | none |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 768 dims, passage text desc, alone | paraphrase-01, paraphrase-03, paraphrase-04, paraphrase-05, partial-03, tool-02, person-02, person-03 | paraphrase-06 | topic-03, question-05, paraphrase-01, paraphrase-02, paraphrase-04, paraphrase-05, partial-03, tool-03, person-02, multi-04 | partial-02 |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 768 dims, passage text desc, plus BM25 | paraphrase-04, paraphrase-05, partial-03, person-02 | paraphrase-06 | topic-03, paraphrase-02, partial-03, tool-03, person-02 | none |

## Per query between models (hybrids and alone)

A against B, by recall@5. A fixes a query when A has the higher recall@5 on it.

| A against B | Mode | A fixes | A breaks | Top 1 gained by A | Top 1 lost by A |
|---|---|---|---|---|---|
| mdbr-leaf-ir, q8, 768 dims against potion-base-8M, fp32 table, 256 dims | plus BM25 | paraphrase-01 | paraphrase-06 | topic-03, tool-03, person-01 | paraphrase-06 |
| mdbr-leaf-ir, q8, 768 dims against potion-base-8M, fp32 table, 256 dims | alone | paraphrase-03, paraphrase-04, partial-04, person-03, multi-03 | paraphrase-06 | topic-03, question-05, paraphrase-05, partial-05, tool-03, person-01, multi-01, multi-04 | partial-01, partial-02 |
| mdbr-leaf-ir, q8, 768 dims against all-MiniLM-L6-v2, q8, 384 dims | plus BM25 | paraphrase-01 | paraphrase-06 | topic-03, paraphrase-02, partial-03, tool-03, person-01 | paraphrase-04 |
| mdbr-leaf-ir, q8, 768 dims against all-MiniLM-L6-v2, q8, 384 dims | alone | lookup-02, partial-04 | paraphrase-06 | lookup-04, question-05, paraphrase-01, partial-03, person-01, multi-01 | partial-02, tool-02, tool-04 |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 768 dims against mdbr-leaf-ir, q8, 768 dims | plus BM25 | none | paraphrase-01 | none | paraphrase-05 |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 768 dims against mdbr-leaf-ir, q8, 768 dims | alone | none | none | paraphrase-04, tool-04, person-04 | person-01 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) against mdbr-leaf-ir, q8, 768 dims | plus BM25 | paraphrase-06 | paraphrase-01 | paraphrase-06, multi-04 | paraphrase-02, tool-03 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) against mdbr-leaf-ir, q8, 768 dims | alone | paraphrase-06 | multi-03 | paraphrase-03, partial-02, tool-02, tool-04, person-03, person-04 | topic-03, question-05 |
| all-MiniLM-L6-v2, q8, 384 dims against potion-base-8M, fp32 table, 256 dims | plus BM25 | none | none | paraphrase-04 | paraphrase-02, paraphrase-06, partial-03 |
| all-MiniLM-L6-v2, q8, 384 dims against potion-base-8M, fp32 table, 256 dims | alone | paraphrase-03, paraphrase-04, person-03, multi-03 | lookup-02 | topic-03, paraphrase-05, partial-05, tool-02, tool-03, tool-04, multi-04 | lookup-04, paraphrase-01, partial-01, partial-03 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) against potion-base-8M, fp32 table, 256 dims | plus BM25 | none | none | topic-03, person-01, multi-04 | paraphrase-02 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) against potion-base-8M, fp32 table, 256 dims | alone | paraphrase-03, paraphrase-04, partial-04, person-03 | none | paraphrase-03, paraphrase-05, partial-05, tool-02, tool-03, tool-04, person-01, person-03, person-04, multi-01, multi-04 | partial-01 |
| mdbr-leaf-ir, q8, 768 dims against potion-base-8M, int8 table, 256 dims | plus BM25 | paraphrase-01 | paraphrase-06 | topic-03, tool-03 | none |
| mdbr-leaf-ir, q8, 768 dims against potion-base-8M, int8 table, 256 dims | alone | paraphrase-03, paraphrase-04, partial-04, person-03, multi-03 | paraphrase-06 | topic-03, question-05, paraphrase-05, partial-05, tool-03, person-01, multi-01, multi-04 | partial-01, partial-02 |
| potion-base-8M, int8 table, 256 dims against potion-base-8M, int8 table, PCA 128 dims | plus BM25 | paraphrase-04 | none | partial-05 | none |
| potion-base-8M, int8 table, 256 dims against potion-base-8M, int8 table, PCA 128 dims | alone | lookup-02, question-02, question-05, paraphrase-06, multi-02 | none | paraphrase-01, paraphrase-02, partial-02, multi-02 | none |
| potion-base-8M, int8 table, 256 dims against potion-base-8M, fp32 table, 256 dims | plus BM25 | none | none | person-01 | paraphrase-06 |
| potion-base-8M, int8 table, 256 dims against potion-base-8M, fp32 table, 256 dims | alone | none | none | none | none |
| mdbr-leaf-ir, q8, 256 dims against mdbr-leaf-ir, q8, 768 dims | plus BM25 | none | none | paraphrase-04, multi-04 | none |
| mdbr-leaf-ir, q8, 256 dims against mdbr-leaf-ir, q8, 768 dims | alone | none | none | tool-04, person-04 | person-01 |
| EmbeddingGemma 2 text, q4, 256 dims (reference) against EmbeddingGemma 2 text, q4, 768 dims (reference) | plus BM25 | paraphrase-01, paraphrase-03 | lookup-02 | paraphrase-02 | paraphrase-05, paraphrase-06 |
| EmbeddingGemma 2 text, q4, 256 dims (reference) against EmbeddingGemma 2 text, q4, 768 dims (reference) | alone | none | lookup-02, paraphrase-04, paraphrase-06, partial-04, multi-01, multi-03 | topic-03, question-05 | partial-02, person-04 |
| mdbr-leaf-ir, q8, 768 dims, passage text desc against potion-base-8M, fp32 table, 256 dims, passage text desc | plus BM25 | paraphrase-01 | paraphrase-06 | topic-03, tool-03, person-01 | paraphrase-05, paraphrase-06 |
| mdbr-leaf-ir, q8, 768 dims, passage text desc against potion-base-8M, fp32 table, 256 dims, passage text desc | alone | paraphrase-03, paraphrase-04, partial-04, person-03 | paraphrase-06 | lookup-02, topic-03, question-05, paraphrase-05, partial-05, tool-03, tool-04, person-01, multi-01 | partial-01, partial-02 |
| mdbr-leaf-ir, q8, 768 dims, passage text desc against all-MiniLM-L6-v2, q8, 384 dims, passage text desc | plus BM25 | paraphrase-01, partial-03 | paraphrase-06 | topic-03, paraphrase-02, partial-03, tool-03, person-01 | paraphrase-04 |
| mdbr-leaf-ir, q8, 768 dims, passage text desc against all-MiniLM-L6-v2, q8, 384 dims, passage text desc | alone | lookup-02, partial-03, partial-04 | paraphrase-06 | lookup-04, question-05, paraphrase-01, partial-03, person-01, multi-01 | paraphrase-03, partial-02, tool-02 |
| all-MiniLM-L6-v2, q8, 384 dims, passage text desc against potion-base-8M, fp32 table, 256 dims, passage text desc | plus BM25 | none | partial-03 | paraphrase-04 | paraphrase-02, paraphrase-05, paraphrase-06, partial-03 |
| all-MiniLM-L6-v2, q8, 384 dims, passage text desc against potion-base-8M, fp32 table, 256 dims, passage text desc | alone | paraphrase-03, paraphrase-04, person-03 | lookup-02, partial-03 | lookup-02, topic-03, paraphrase-03, paraphrase-05, partial-05, tool-02, tool-03, tool-04 | lookup-04, paraphrase-01, partial-01, partial-03 |
| EmbeddingGemma 2 text, q4, 768 dims (reference), passage text desc against mdbr-leaf-ir, q8, 768 dims, passage text desc | plus BM25 | paraphrase-03, paraphrase-06 | paraphrase-01 | paraphrase-05, paraphrase-06 | paraphrase-02, tool-03 |
| EmbeddingGemma 2 text, q4, 768 dims (reference), passage text desc against mdbr-leaf-ir, q8, 768 dims, passage text desc | alone | paraphrase-06 | partial-04 | paraphrase-03, partial-02, tool-02, person-03, person-04 | topic-03, question-05 |
| EmbeddingGemma 2 text, q4, 768 dims (reference), passage text desc against potion-base-8M, fp32 table, 256 dims, passage text desc | plus BM25 | paraphrase-03 | none | topic-03, person-01 | paraphrase-02 |
| EmbeddingGemma 2 text, q4, 768 dims (reference), passage text desc against potion-base-8M, fp32 table, 256 dims, passage text desc | alone | paraphrase-03, paraphrase-04, person-03 | none | lookup-02, paraphrase-03, paraphrase-05, partial-05, tool-02, tool-03, tool-04, person-01, person-03, person-04, multi-01 | partial-01 |
| potion-base-8M, int8 table, 256 dims, passage text desc against potion-base-8M, int8 table, PCA 128 dims, passage text desc | plus BM25 | paraphrase-04 | none | partial-05, tool-04 | none |
| potion-base-8M, int8 table, 256 dims, passage text desc against potion-base-8M, int8 table, PCA 128 dims, passage text desc | alone | lookup-02, question-02, question-05, paraphrase-06, multi-02, multi-03 | none | paraphrase-01, paraphrase-02, partial-02, multi-02 | multi-01 |
| mdbr-leaf-ir, q8, 768 dims, passage text desc against potion-base-8M, int8 table, 256 dims, passage text desc | plus BM25 | paraphrase-01 | paraphrase-06 | topic-03, tool-03, person-01 | paraphrase-05 |
| mdbr-leaf-ir, q8, 768 dims, passage text desc against potion-base-8M, int8 table, 256 dims, passage text desc | alone | paraphrase-03, paraphrase-04, partial-04, person-03 | paraphrase-06 | lookup-02, topic-03, question-05, paraphrase-05, partial-05, tool-04, person-01, multi-01 | partial-01, partial-02 |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 768 dims, passage text desc against mdbr-leaf-ir, q8, 768 dims, passage text desc | plus BM25 | none | paraphrase-01 | none | person-01 |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 768 dims, passage text desc against mdbr-leaf-ir, q8, 768 dims, passage text desc | alone | none | partial-04 | paraphrase-04, person-04 | person-01 |

## Per query with fusion over the first 10 rows of each list (ablation)

Same definitions as above. The headline fuses whole lists; this variant exists because BM25 returns every page that shares a word with the query, and those matches can outvote a good semantic rank (tool-02 and person-03 are first or second semantically and 27th and 16th when fused).

| Configuration | Passage text | Fixed against BM25 | Broken against BM25 | Recall@5 / MRR@10 / nDCG@10 |
|---|---|---|---|---|
| potion-base-8M, fp32 table, 256 dims | titled | paraphrase-05, partial-03, tool-02, person-02 | question-04 | 0.85 / 0.76 / 0.80 |
| potion-base-8M, fp32 table, 256 dims | desc | paraphrase-05, partial-03, tool-02, person-02 | none | 0.86 / 0.75 / 0.81 |
| potion-base-8M, int8 table, 256 dims | titled | paraphrase-04, paraphrase-05, partial-03, tool-02, person-02 | question-04 | 0.88 / 0.77 / 0.81 |
| potion-base-8M, int8 table, 256 dims | desc | paraphrase-04, paraphrase-05, partial-03, tool-02, person-02 | none | 0.89 / 0.75 / 0.81 |
| potion-base-8M, int8 table, PCA 128 dims | titled | paraphrase-05, partial-03, tool-02, person-02 | question-04 | 0.85 / 0.73 / 0.77 |
| potion-base-8M, int8 table, PCA 128 dims | desc | paraphrase-05, partial-03, tool-02, person-02 | none | 0.86 / 0.70 / 0.77 |
| all-MiniLM-L6-v2, q8, 384 dims | titled | paraphrase-04, paraphrase-05, partial-03, tool-02, person-02 | question-04 | 0.88 / 0.75 / 0.82 |
| all-MiniLM-L6-v2, q8, 384 dims | desc | paraphrase-03, paraphrase-04, paraphrase-05, partial-03, tool-02, person-02 | none | 0.90 / 0.73 / 0.81 |
| mdbr-leaf-ir, q8, 768 dims | titled | paraphrase-01, paraphrase-04, paraphrase-05, partial-03, person-02, person-03 | question-04 | 0.90 / 0.81 / 0.86 |
| mdbr-leaf-ir, q8, 768 dims | desc | paraphrase-01, paraphrase-04, paraphrase-05, partial-03, tool-02, person-02, person-03 | none | 0.94 / 0.80 / 0.86 |
| mdbr-leaf-ir, q8, 256 dims | titled | paraphrase-01, paraphrase-04, paraphrase-05, partial-03, person-02, person-03 | question-04 | 0.90 / 0.84 / 0.87 |
| mdbr-leaf-ir, q8, 256 dims | desc | paraphrase-01, paraphrase-04, paraphrase-05, partial-03, person-02, person-03 | none | 0.92 / 0.81 / 0.87 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) | titled | paraphrase-03, paraphrase-04, paraphrase-05, partial-03, person-02, person-03 | question-04 | 0.90 / 0.81 / 0.85 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) | desc | paraphrase-03, paraphrase-04, paraphrase-05, partial-03, person-02, person-03 | none | 0.92 / 0.80 / 0.86 |

| A against B (fused over 10 rows) | Passage text | A fixes | A breaks |
|---|---|---|---|
| mdbr-leaf-ir, q8, 768 dims against potion-base-8M, int8 table, 256 dims | titled | paraphrase-01, person-03 | tool-02 |
| mdbr-leaf-ir, q8, 768 dims against potion-base-8M, int8 table, 256 dims | desc | paraphrase-01, person-03 | none |
| all-MiniLM-L6-v2, q8, 384 dims against potion-base-8M, int8 table, 256 dims | titled | none | none |
| all-MiniLM-L6-v2, q8, 384 dims against potion-base-8M, int8 table, 256 dims | desc | paraphrase-03 | partial-03 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) against mdbr-leaf-ir, q8, 768 dims | titled | paraphrase-03 | paraphrase-01 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) against mdbr-leaf-ir, q8, 768 dims | desc | paraphrase-03 | paraphrase-01, tool-02 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) against potion-base-8M, int8 table, 256 dims | titled | paraphrase-03, person-03 | tool-02 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) against potion-base-8M, int8 table, 256 dims | desc | paraphrase-03, person-03 | tool-02 |
| potion-base-8M, int8 table, 256 dims against potion-base-8M, int8 table, PCA 128 dims | titled | paraphrase-04 | none |
| potion-base-8M, int8 table, 256 dims against potion-base-8M, int8 table, PCA 128 dims | desc | paraphrase-04 | none |

## The nine queries keyword search could not fix

Rank of the best right page (grade 2) in each ranking, a dash if it is not in the list. In bold: in the top 5. A query written "A / B" shows the semantic ranking alone, then the hybrid.

| Query | BM25 | potion-base-8M, 256 dims | all-MiniLM-L6-v2, 384 dims | mdbr-leaf-ir, 768 dims | mdbr-leaf-ir, 256 dims | EmbeddingGemma 2 text, 768 dims (reference) | EmbeddingGemma 2 text, 256 dims (reference) |
|---|---|---|---|---|---|---|---|
| paraphrase-01: patching holes in a chart that repeats every year | 15 | **1** / 7 | **2** / 6 | **1** / **4** | **1** / **3** | **1** / 6 | **1** / **5** |
| paraphrase-02: connect to the box under my desk when traveling | **5** | **1** / **1** | **1** / **2** | **1** / **1** | **1** / **1** | **1** / **2** | **1** / **1** |
| paraphrase-03: keep an old and a new gpu toolchain on one box without clashes | 20 | 9 / 17 | **2** / 9 | **3** / 9 | **3** / 9 | **1** / 6 | **1** / **5** |
| paraphrase-04: let the model grade its own homework and study only what it got right | 7 | 11 / **5** | **4** / **1** | **3** / **2** | **2** / **1** | **4** / **3** | 7 / **3** |
| paraphrase-05: pull topic-specific documents out of a giant internet dump | 8 | **2** / **1** | **1** / **1** | **1** / **1** | **1** / **1** | **1** / **1** | **1** / **2** |
| tool-02: make a photo black and white | - | **2** / 27 | **1** / 27 | **4** / 27 | **4** / 27 | **1** / 27 | **1** / 27 |
| person-02: has he worked in oil and gas | 8 | **1** / **1** | **1** / **1** | **1** / **1** | **1** / **1** | **1** / **1** | **1** / **1** |
| person-03: what does he do now | - | 17 / 24 | **2** / 16 | **2** / 16 | **2** / 16 | **1** / 16 | **1** / 16 |
| partial-03: diarisation | - | **1** / **1** | **3** / **3** | **1** / **1** | **1** / **1** | **1** / **1** | **1** / **1** |

Found in the top 5, by configuration (of the nine):

| Configuration | Alone | Plus BM25 |
|---|---|---|
| potion-base-8M, fp32 table, 256 dims | paraphrase-01, paraphrase-02, paraphrase-05, tool-02, person-02, partial-03 | paraphrase-02, paraphrase-04, paraphrase-05, person-02, partial-03 |
| all-MiniLM-L6-v2, q8, 384 dims | paraphrase-01, paraphrase-02, paraphrase-03, paraphrase-04, paraphrase-05, tool-02, person-02, person-03, partial-03 | paraphrase-02, paraphrase-04, paraphrase-05, person-02, partial-03 |
| mdbr-leaf-ir, q8, 768 dims | paraphrase-01, paraphrase-02, paraphrase-03, paraphrase-04, paraphrase-05, tool-02, person-02, person-03, partial-03 | paraphrase-01, paraphrase-02, paraphrase-04, paraphrase-05, person-02, partial-03 |
| mdbr-leaf-ir, q8, 256 dims | paraphrase-01, paraphrase-02, paraphrase-03, paraphrase-04, paraphrase-05, tool-02, person-02, person-03, partial-03 | paraphrase-01, paraphrase-02, paraphrase-04, paraphrase-05, person-02, partial-03 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) | paraphrase-01, paraphrase-02, paraphrase-03, paraphrase-04, paraphrase-05, tool-02, person-02, person-03, partial-03 | paraphrase-02, paraphrase-04, paraphrase-05, person-02, partial-03 |
| EmbeddingGemma 2 text, q4, 256 dims (reference) | paraphrase-01, paraphrase-02, paraphrase-03, paraphrase-05, tool-02, person-02, person-03, partial-03 | paraphrase-01, paraphrase-02, paraphrase-03, paraphrase-04, paraphrase-05, person-02, partial-03 |

Queries BM25 gets completely right in the top 5 (recall@5 of 1.00): 27 of 36. Which of them each configuration loses (lower recall@5):

| Configuration | Alone loses | Plus BM25 loses |
|---|---|---|
| potion-base-8M, fp32 table, 256 dims | question-04, multi-03 | question-04 |
| all-MiniLM-L6-v2, q8, 384 dims | lookup-02, question-04 | question-04 |
| mdbr-leaf-ir, q8, 768 dims | question-04, paraphrase-06 | question-04, paraphrase-06 |
| mdbr-leaf-ir, q8, 256 dims | question-04, paraphrase-06 | question-04, paraphrase-06 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) | question-04, multi-03 | question-04 |
| EmbeddingGemma 2 text, q4, 256 dims (reference) | lookup-02, question-04, paraphrase-06, multi-01, multi-03 | lookup-02, question-04 |

## The four queries with no answer: cosine scores

Top cosine of the semantic ranking for each no-answer query, against the answerable queries (36): the top cosine of any page, and the cosine of the best right page. A gate needs a number that sits above the no-answer scores and below the right answers. AUC is the chance that an answerable query has a higher top cosine than a no-answer query (1.00 separates them perfectly, 0.50 not at all).

| Configuration | none-01 | none-02 | none-03 | none-04 | none max | answerable top-1 min / p10 / median | right page min / p10 / median | answerable above none max (top-1, right page) | AUC |
|---|---|---|---|---|---|---|---|---|---|
| potion-base-8M, fp32 table, 256 dims | 0.436 | 0.402 | 0.302 | 0.449 | 0.449 | 0.265 / 0.332 / 0.442 | 0.248 / 0.315 / 0.413 | 18 of 36, 13 of 36 | 0.66 |
| all-MiniLM-L6-v2, q8, 384 dims | 0.315 | 0.409 | 0.358 | 0.247 | 0.409 | 0.215 / 0.270 / 0.452 | 0.172 / 0.225 / 0.424 | 24 of 36, 23 of 36 | 0.76 |
| mdbr-leaf-ir, q8, 768 dims | 0.469 | 0.370 | 0.346 | 0.394 | 0.469 | 0.260 / 0.342 / 0.439 | 0.250 / 0.293 / 0.439 | 15 of 36, 15 of 36 | 0.69 |
| mdbr-leaf-ir, q8, 256 dims | 0.489 | 0.415 | 0.377 | 0.422 | 0.489 | 0.328 / 0.382 / 0.474 | 0.293 / 0.338 / 0.468 | 15 of 36, 15 of 36 | 0.69 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) | 0.726 | 0.695 | 0.689 | 0.636 | 0.726 | 0.639 / 0.692 / 0.741 | 0.639 / 0.682 / 0.741 | 20 of 36, 19 of 36 | 0.83 |
| EmbeddingGemma 2 text, q4, 256 dims (reference) | 0.740 | 0.710 | 0.727 | 0.671 | 0.740 | 0.645 / 0.719 / 0.747 | 0.645 / 0.707 / 0.743 | 23 of 36, 20 of 36 | 0.82 |
| potion-retrieval-32M, fp32 table, 512 dims | 0.364 | 0.401 | 0.293 | 0.288 | 0.401 | 0.222 / 0.248 / 0.453 | 0.156 / 0.226 / 0.396 | 20 of 36, 18 of 36 | 0.68 |
| potion-retrieval-32M, int8 table, PCA 128 dims | 0.422 | 0.387 | 0.352 | 0.353 | 0.422 | 0.204 / 0.355 / 0.518 | 0.175 / 0.284 / 0.462 | 28 of 36, 23 of 36 | 0.85 |
| arctic-embed-m-v1.5, q8, 768 dims, on both sides | 0.456 | 0.356 | 0.289 | 0.348 | 0.456 | 0.256 / 0.326 / 0.445 | 0.229 / 0.317 / 0.445 | 16 of 36, 16 of 36 | 0.75 |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 768 dims | 0.451 | 0.341 | 0.295 | 0.369 | 0.451 | 0.253 / 0.320 / 0.424 | 0.230 / 0.302 / 0.422 | 14 of 36, 14 of 36 | 0.72 |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 256 dims | 0.485 | 0.398 | 0.342 | 0.424 | 0.485 | 0.308 / 0.386 / 0.464 | 0.283 / 0.354 / 0.460 | 15 of 36, 15 of 36 | 0.74 |
| potion-base-8M, int8 table, 256 dims | 0.434 | 0.403 | 0.305 | 0.450 | 0.450 | 0.266 / 0.333 / 0.440 | 0.252 / 0.316 / 0.414 | 17 of 36, 12 of 36 | 0.65 |
| potion-base-8M, fp32 table, PCA 128 dims | 0.493 | 0.458 | 0.357 | 0.457 | 0.493 | 0.290 / 0.355 / 0.483 | 0.280 / 0.346 / 0.445 | 17 of 36, 12 of 36 | 0.65 |
| potion-base-8M, int8 table, PCA 128 dims | 0.491 | 0.457 | 0.356 | 0.456 | 0.491 | 0.294 / 0.354 / 0.480 | 0.280 / 0.346 / 0.444 | 17 of 36, 12 of 36 | 0.65 |

Lowest right-page cosines (the answerable queries a gate would cut first):

| Configuration | Four lowest (id, right page cosine, top-1 cosine) |
|---|---|
| potion-base-8M, fp32 table, 256 dims | person-01 0.248 (0.265); paraphrase-03 0.297 (0.434); partial-02 0.298 (0.298); partial-04 0.308 (0.474) |
| all-MiniLM-L6-v2, q8, 384 dims | partial-03 0.172 (0.215); person-01 0.176 (0.311); person-03 0.219 (0.285); partial-01 0.219 (0.287) |
| mdbr-leaf-ir, q8, 768 dims | partial-02 0.250 (0.309); person-03 0.254 (0.260); paraphrase-06 0.255 (0.396); person-04 0.284 (0.290) |
| mdbr-leaf-ir, q8, 256 dims | paraphrase-06 0.293 (0.436); partial-02 0.296 (0.353); person-03 0.310 (0.328); partial-04 0.337 (0.393) |
| EmbeddingGemma 2 text, q4, 768 dims (reference) | paraphrase-02 0.639 (0.639); paraphrase-01 0.670 (0.670); person-01 0.678 (0.678); paraphrase-06 0.679 (0.698) |
| EmbeddingGemma 2 text, q4, 256 dims (reference) | paraphrase-02 0.645 (0.645); partial-04 0.687 (0.726); partial-02 0.694 (0.703); paraphrase-01 0.703 (0.703) |

## What int8 and fewer dimensions do to the ranking

Each variant against the full configuration of the same model, semantic ranking over all 40 queries: mean overlap of the top 5 pages, queries whose top page is the same (of 40), the mean and the largest change in a query-to-passage cosine, and the change in recall@5, MRR@10 and nDCG@10 (alone, then plus BM25). The potion rows are int8 or PCA tables; the others are the passage vectors stored as int8 (one scale for the matrix, queries stay float) or cut to the first dimensions and renormalized.

| Model, full against variant | Top 5 overlap | Same top page | Mean / max cosine change | Alone: change in R@5, MRR, nDCG | Plus BM25: change in R@5, MRR, nDCG |
|---|---|---|---|---|---|
| potion-base-8M, fp32 table, 256 dims against potion-base-8M, int8 table, 256 dims | 1.00 | 38 | 0.0017 / 0.011 | +0.00, +0.00, +0.00 | +0.00, +0.00, -0.01 |
| potion-base-8M, fp32 table, 256 dims against potion-base-8M, fp32 table, PCA 128 dims | 0.84 | 33 | 0.0326 / 0.131 | -0.09, -0.07, -0.05 | -0.03, -0.03, -0.03 |
| potion-base-8M, fp32 table, 256 dims against potion-base-8M, int8 table, PCA 128 dims | 0.84 | 33 | 0.0323 / 0.129 | -0.09, -0.07, -0.05 | -0.03, -0.03, -0.03 |
| all-MiniLM-L6-v2, q8, 384 dims against all-MiniLM-L6-v2, q8, passage vectors as int8 | 1.00 | 40 | 0.0004 / 0.002 | +0.00, +0.00, +0.00 | +0.00, -0.01, -0.01 |
| mdbr-leaf-ir, q8, 768 dims against mdbr-leaf-ir, q8, 256 dims | 0.89 | 36 | 0.0356 / 0.099 | +0.00, +0.02, +0.01 | +0.00, +0.03, +0.02 |
| mdbr-leaf-ir, q8, 768 dims against mdbr-leaf-ir, q8, 768 dims, passage vectors as int8 | 1.00 | 40 | 0.0005 / 0.003 | +0.00, +0.00, -0.00 | +0.00, +0.01, +0.01 |
| mdbr-leaf-ir, q8, 768 dims against mdbr-leaf-ir, q8, 256 dims, passage vectors as int8 | 0.88 | 36 | 0.0356 / 0.099 | -0.03, +0.02, +0.01 | +0.00, +0.03, +0.02 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) against EmbeddingGemma 2 text, q4, 512 dims | 0.91 | 37 | 0.0076 / 0.036 | -0.04, +0.03, +0.01 | +0.00, +0.01, +0.00 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) against EmbeddingGemma 2 text, q4, 256 dims (reference) | 0.78 | 33 | 0.0266 / 0.081 | -0.12, -0.02, -0.04 | +0.04, -0.01, -0.02 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) against EmbeddingGemma 2 text, q4, 128 dims | 0.65 | 24 | 0.1329 / 0.242 | -0.17, -0.21, -0.19 | -0.04, -0.07, -0.07 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) against EmbeddingGemma 2 text, q4, 768 dims, passage vectors as int8 | 0.99 | 40 | 0.0005 / 0.003 | +0.00, +0.00, +0.00 | +0.03, +0.01, +0.01 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) against EmbeddingGemma 2 text, q4, 256 dims, passage vectors as int8 | 0.79 | 32 | 0.0265 / 0.080 | -0.12, -0.03, -0.05 | +0.04, -0.01, -0.03 |

## Ablations

Passage text: titled is the headline (page title, section heading, prose). plain is the prose alone. code appends a passage's code and formula words after the prose (the model cuts at its input limit). desc adds one passage per page made of its description (47 more rows), which is also what BM25 has and the only way the weather page, which has no passages, can be found.

| Configuration | Passage text | Alone R@5 | MRR@10 | nDCG@10 | Plus BM25 R@5 | MRR@10 | nDCG@10 |
|---|---|---|---|---|---|---|---|
| potion-base-8M, fp32 table, 256 dims | titled | 0.87 | 0.70 | 0.76 | 0.85 | 0.75 | 0.80 |
| potion-base-8M, fp32 table, 256 dims | plain | 0.82 | 0.67 | 0.73 | 0.81 | 0.72 | 0.77 |
| potion-base-8M, fp32 table, 256 dims | code | 0.84 | 0.70 | 0.75 | 0.82 | 0.74 | 0.79 |
| potion-base-8M, fp32 table, 256 dims | desc | 0.89 | 0.70 | 0.77 | 0.86 | 0.75 | 0.81 |
| potion-base-8M, int8 table, 256 dims | titled | 0.87 | 0.70 | 0.76 | 0.85 | 0.75 | 0.79 |
| potion-base-8M, int8 table, 256 dims | desc | 0.89 | 0.72 | 0.79 | 0.86 | 0.74 | 0.80 |
| potion-base-8M, int8 table, PCA 128 dims | titled | 0.77 | 0.63 | 0.71 | 0.82 | 0.73 | 0.76 |
| potion-base-8M, int8 table, PCA 128 dims | desc | 0.79 | 0.65 | 0.73 | 0.83 | 0.70 | 0.77 |
| all-MiniLM-L6-v2, q8, 384 dims | titled | 0.94 | 0.77 | 0.80 | 0.85 | 0.74 | 0.80 |
| all-MiniLM-L6-v2, q8, 384 dims | plain | 0.82 | 0.68 | 0.73 | 0.85 | 0.65 | 0.74 |
| all-MiniLM-L6-v2, q8, 384 dims | code | 0.92 | 0.77 | 0.80 | 0.85 | 0.74 | 0.80 |
| all-MiniLM-L6-v2, q8, 384 dims | desc | 0.94 | 0.78 | 0.82 | 0.85 | 0.72 | 0.80 |
| mdbr-leaf-ir, q8, 768 dims | titled | 0.96 | 0.81 | 0.85 | 0.85 | 0.80 | 0.84 |
| mdbr-leaf-ir, q8, 768 dims | plain | 0.84 | 0.72 | 0.77 | 0.85 | 0.73 | 0.79 |
| mdbr-leaf-ir, q8, 768 dims | code | 0.96 | 0.81 | 0.84 | 0.85 | 0.79 | 0.83 |
| mdbr-leaf-ir, q8, 768 dims | desc | 0.97 | 0.83 | 0.87 | 0.86 | 0.78 | 0.84 |
| mdbr-leaf-ir, q8, 256 dims | titled | 0.96 | 0.83 | 0.85 | 0.85 | 0.83 | 0.85 |
| mdbr-leaf-ir, q8, 256 dims | desc | 0.97 | 0.83 | 0.87 | 0.86 | 0.80 | 0.85 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) | titled | 0.98 | 0.89 | 0.89 | 0.85 | 0.80 | 0.83 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) | plain | 0.75 | 0.74 | 0.74 | 0.84 | 0.67 | 0.74 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) | code | 0.96 | 0.91 | 0.89 | 0.85 | 0.81 | 0.83 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) | desc | 0.97 | 0.89 | 0.90 | 0.89 | 0.79 | 0.84 |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 768 dims | titled | 0.96 | 0.85 | 0.88 | 0.82 | 0.77 | 0.82 |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 768 dims | plain | 0.95 | 0.83 | 0.85 | 0.88 | 0.76 | 0.80 |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 768 dims | code | 0.96 | 0.84 | 0.87 | 0.82 | 0.79 | 0.83 |
| leaf-ir queries against arctic-embed-m-v1.5 passages, 768 dims | desc | 0.94 | 0.84 | 0.88 | 0.83 | 0.76 | 0.83 |

Fusion constant k (headline is 60, nothing tuned), and fusing only the first 10 rows of each list at k = 60. Hybrid recall@5 / MRR@10 / nDCG@10:

| Configuration | k = 10 | k = 20 | k = 60 | k = 100 | top 10 of each list |
|---|---|---|---|---|---|
| potion-base-8M, fp32 table, 256 dims | 0.85 / 0.76 / 0.80 | 0.85 / 0.76 / 0.80 | 0.85 / 0.75 / 0.80 | 0.85 / 0.75 / 0.80 | 0.85 / 0.76 / 0.80 |
| all-MiniLM-L6-v2, q8, 384 dims | 0.88 / 0.73 / 0.80 | 0.85 / 0.74 / 0.80 | 0.85 / 0.74 / 0.80 | 0.85 / 0.74 / 0.80 | 0.88 / 0.75 / 0.82 |
| mdbr-leaf-ir, q8, 768 dims | 0.85 / 0.79 / 0.83 | 0.85 / 0.79 / 0.83 | 0.85 / 0.80 / 0.84 | 0.82 / 0.79 / 0.83 | 0.90 / 0.81 / 0.86 |
| mdbr-leaf-ir, q8, 256 dims | 0.85 / 0.83 / 0.86 | 0.85 / 0.83 / 0.86 | 0.85 / 0.83 / 0.85 | 0.85 / 0.82 / 0.85 | 0.90 / 0.84 / 0.87 |
| EmbeddingGemma 2 text, q4, 768 dims (reference) | 0.90 / 0.80 / 0.84 | 0.90 / 0.80 / 0.83 | 0.85 / 0.80 / 0.83 | 0.85 / 0.79 / 0.82 | 0.90 / 0.81 / 0.85 |
| EmbeddingGemma 2 text, q4, 256 dims (reference) | 0.89 / 0.79 / 0.81 | 0.89 / 0.78 / 0.80 | 0.89 / 0.78 / 0.80 | 0.86 / 0.78 / 0.80 | 0.92 / 0.80 / 0.82 |

## Sanity checks

Each model embeds three (query, related text, unrelated text) triples, with the model's own prefixes; the related text has to score higher. Dimension and norm are read from the output. The card check repeats the example on the model card (fp32 scores there; quantized here).

| Vectors | Model file | Dimension (card) | Norm before normalizing | Triples in the right order | Card example |
|---|---|---|---|---|---|
| potion8 | minishlab/potion-base-8M, fp32 table | 256 (256) | 6.53 to 36.48 | 3 of 3 (0.63 v 0.06; 0.43 v 0.05; 0.79 v 0.06) | none on the card |
| potion8.int8 | minishlab/potion-base-8M, fp32 table | 256 (256) | 6.53 to 36.54 | 3 of 3 (0.64 v 0.06; 0.43 v 0.05; 0.79 v 0.06) | none on the card |
| potion8.d128 | minishlab/potion-base-8M, fp32 table | 128 (256) | 5.41 to 32.54 | 3 of 3 (0.66 v 0.06; 0.45 v 0.08; 0.79 v 0.09) | none on the card |
| potion8.d128.int8 | minishlab/potion-base-8M, fp32 table | 128 (256) | 5.41 to 32.61 | 3 of 3 (0.66 v 0.06; 0.45 v 0.08; 0.79 v 0.09) | none on the card |
| potion32r | minishlab/potion-retrieval-32M, fp32 table | 512 (512) | 6.51 to 49.05 | 3 of 3 (0.52 v 0.10; 0.48 v -0.01; 0.74 v -0.02) | none on the card |
| minilm | Xenova/all-MiniLM-L6-v2, q8 | 384 (384) | 1.48 to 7.20 | 3 of 3 (0.59 v -0.01; 0.52 v 0.03; 0.83 v -0.04) | none on the card |
| leaf | MongoDB/mdbr-leaf-ir, q8 | 768 (768) | 1.00 to 1.00 | 3 of 3 (0.55 v 0.19; 0.61 v 0.20; 0.62 v 0.12) | expected [[0.6857,0.4598],[0.4238,0.5723]], measured [[0.678,0.454],[0.422,0.569]] |
| arctic | Snowflake/snowflake-arctic-embed-m-v1.5, q8 | 768 (768) | 1.00 to 1.00 | 3 of 3 (0.54 v 0.17; 0.62 v 0.21; 0.60 v 0.11) | none on the card |
| gemma2 | onnx-community/embeddinggemma-2-ONNX, q4 | 768 (768) | 1.00 to 1.00 | 3 of 3 (0.75 v 0.53; 0.83 v 0.53; 0.85 v 0.52) | expected [[0.684,0.854,0.752,0.783]], measured [[0.684,0.854,0.752,0.783]] |

