# Fusion comparison, dev

Written by run-fusion.mjs. Index 759f6c5572dd74aa (47 pages, 506 passages). Table minishlab/potion-base-8M at bf8b056, int8, 256 dimensions. Questions: _devlog/local-search/evals/questions.json, 40 queries (36 answerable), file hash ea19782d861a. Generic term: in more than 5 percent of the passages. A query moves a per-type score by 17 to 25 points and the overall score by about 0.03.

## Headline, answerable queries

| Method | Recall@5 | MRR@10 | nDCG@10 | Typing recall@5 | Typing MRR@10 |
|---|---|---|---|---|---|
| BM25 alone | 0.75 | 0.64 | 0.71 | 0.80 | 0.68 |
| Meaning alone (reference) | 0.89 | 0.71 | 0.78 | 0.79 | 0.71 |
| RRF, full lists, k = 60 | 0.86 | 0.75 | 0.81 | 0.84 | 0.67 |
| RRF over the top 10 of each list | 0.89 | 0.77 | 0.82 | 0.87 | 0.68 |
| The page (rankHybrid) | 0.89 | 0.77 | 0.82 | 0.87 | 0.68 |
| RRF over the top 20 of each list | 0.86 | 0.76 | 0.82 | 0.84 | 0.67 |
| RRF, full lists, meaning weighted 2 to 1 | 0.86 | 0.76 | 0.82 | 0.84 | 0.71 |
| RRF top 10, meaning without an unfinished last word | 0.89 | 0.77 | 0.82 | 0.90 | 0.68 |
| RRF, BM25 list without single generic term matches | 0.86 | 0.76 | 0.82 | 0.81 | 0.66 |

## Per type, recall@5 / MRR@10 / nDCG@10 (queries per type: lookup 4, topic 4, question 5, paraphrase 6, partial 5, tool 4, person 4, multi 4)

| Method | lookup | topic | question | paraphrase | partial | tool | person | multi |
|---|---|---|---|---|---|---|---|---|
| BM25 alone | 1.00 / 1.00 / 1.00 | 1.00 / 0.88 / 0.91 | 1.00 / 0.87 / 0.97 | 0.33 / 0.16 / 0.26 | 0.60 / 0.50 / 0.64 | 0.75 / 0.63 / 0.72 | 0.50 / 0.41 / 0.49 | 1.00 / 0.88 / 0.83 |
| Meaning alone (reference) | 1.00 / 0.88 / 0.88 | 1.00 / 0.88 / 0.92 | 1.00 / 0.85 / 0.92 | 0.67 / 0.49 / 0.60 | 0.80 / 0.70 / 0.78 | 1.00 / 0.75 / 0.86 | 0.75 / 0.36 / 0.45 | 1.00 / 0.88 / 0.89 |
| RRF, full lists, k = 60 | 1.00 / 1.00 / 1.00 | 1.00 / 0.88 / 0.92 | 1.00 / 0.87 / 0.95 | 0.67 / 0.56 / 0.60 | 0.80 / 0.70 / 0.84 | 0.75 / 0.63 / 0.73 | 0.75 / 0.63 / 0.64 | 1.00 / 0.88 / 0.87 |
| RRF over the top 10 of each list | 1.00 / 1.00 / 1.00 | 1.00 / 0.88 / 0.92 | 1.00 / 0.87 / 0.95 | 0.67 / 0.58 / 0.62 | 0.80 / 0.70 / 0.84 | 1.00 / 0.69 / 0.81 | 0.75 / 0.63 / 0.63 | 1.00 / 0.88 / 0.87 |
| The page (rankHybrid) | 1.00 / 1.00 / 1.00 | 1.00 / 0.88 / 0.92 | 1.00 / 0.87 / 0.95 | 0.67 / 0.58 / 0.62 | 0.80 / 0.70 / 0.84 | 1.00 / 0.69 / 0.81 | 0.75 / 0.63 / 0.63 | 1.00 / 0.88 / 0.87 |
| RRF over the top 20 of each list | 1.00 / 1.00 / 1.00 | 1.00 / 0.88 / 0.92 | 1.00 / 0.87 / 0.95 | 0.67 / 0.56 / 0.60 | 0.80 / 0.70 / 0.84 | 0.75 / 0.65 / 0.78 | 0.75 / 0.63 / 0.64 | 1.00 / 0.88 / 0.87 |
| RRF, full lists, meaning weighted 2 to 1 | 1.00 / 1.00 / 0.97 | 1.00 / 0.88 / 0.92 | 1.00 / 0.87 / 0.94 | 0.67 / 0.60 / 0.66 | 0.80 / 0.72 / 0.83 | 0.75 / 0.63 / 0.76 | 0.75 / 0.46 / 0.55 | 1.00 / 1.00 / 0.93 |
| RRF top 10, meaning without an unfinished last word | 1.00 / 1.00 / 1.00 | 1.00 / 0.88 / 0.92 | 1.00 / 0.87 / 0.95 | 0.67 / 0.58 / 0.62 | 0.80 / 0.70 / 0.84 | 1.00 / 0.69 / 0.81 | 0.75 / 0.63 / 0.63 | 1.00 / 0.88 / 0.87 |
| RRF, BM25 list without single generic term matches | 1.00 / 1.00 / 1.00 | 1.00 / 0.88 / 0.93 | 1.00 / 0.87 / 0.95 | 0.67 / 0.56 / 0.60 | 0.80 / 0.70 / 0.84 | 0.75 / 0.67 / 0.80 | 0.75 / 0.63 / 0.64 | 1.00 / 0.88 / 0.87 |

## Rank of the first right page per query

| Query | bm25 | semantic | rrf-full | rrf-top10 | page | rrf-top20 | rrf-meaning-x2 | rrf-top10-settled | rrf-no-generic |
|---|---|---|---|---|---|---|---|---|---|
| lookup-01 dover-lap | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| lookup-02 jmi-res | 1 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| lookup-03 bradley-terry model | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| lookup-04 svg2raster | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| topic-01 online softmax | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| topic-02 speaker diarization | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| topic-03 kv cache memory | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| topic-04 residual connections | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| question-01 how many gpus does glm-5.3-flash need | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| question-02 should i use skills or mcp servers | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| question-03 does doing sft first make grpo better | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| question-04 where does the india weather page get its aqi numbers | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| question-05 which model did best on the viggo extraction task | 3 | 4 | 3 | 3 | 3 | 3 | 3 | 3 | 3 |
| paraphrase-01 patching holes in a chart that repeats every year | 15 | 1 | 7 | 7 | 7 | 7 | 2 | 7 | 7 |
| paraphrase-02 connect to the box under my desk when traveling | 5 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| paraphrase-03 keep an old and a new gpu toolchain on one box without clashes | 20 | 9 | 17 | 16 | 16 | 12 | 14 | 16 | 17 |
| paraphrase-04 let the model grade its own homework and study only what it got right | 7 | 10 | 5 | 3 | 3 | 5 | 9 | 3 | 5 |
| paraphrase-05 pull topic-specific documents out of a giant internet dump | 8 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| paraphrase-06 why vibe-checking chatbot outputs is not enough | 2 | 4 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| partial-01 geophysics | 2 | 1 | 2 | 2 | 2 | 2 | 1 | 2 | 2 |
| partial-02 quantiz | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| partial-03 diarisation | none | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| partial-04 tokenizers | 14 | 11 | 11 | none | none | 11 | 10 | none | 11 |
| partial-05 derive ppo loss | 1 | 2 | 1 | 1 | 1 | 1 | 2 | 1 | 1 |
| tool-01 draw a mask for inpainting | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| tool-02 make a photo black and white | none | 2 | 27 | 4 | 4 | 10 | 26 | 4 | 6 |
| tool-03 pretty print json | 2 | 1 | 2 | 2 | 2 | 2 | 1 | 2 | 2 |
| tool-04 decode a percent-encoded link | 1 | 2 | 1 | 1 | 1 | 1 | 2 | 1 | 1 |
| person-01 where did he do his phd | 2 | 5 | 2 | 2 | 2 | 2 | 3 | 2 | 2 |
| person-02 has he worked in oil and gas | 8 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| person-03 what does he do now | none | 17 | 24 | none | none | 24 | 24 | none | 18 |
| person-04 stable diffusion experience | 1 | 4 | 1 | 1 | 1 | 1 | 2 | 1 | 1 |
| multi-01 ppo vs dpo vs grpo | 1 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| multi-02 self-hosting llms on a 4090 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| multi-03 structured data extraction series | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| multi-04 projects built with claude code | 2 | 1 | 2 | 2 | 2 | 2 | 1 | 2 | 2 |

## Against BM25 alone (recall@5 fixed and broken, first right page moved to or from rank 1, MRR@10 up and down)

| Method | Fixed | Broken | Top 1 gained | Top 1 lost | MRR up | MRR down |
|---|---|---|---|---|---|---|
| Meaning alone (reference) | paraphrase-01, paraphrase-05, partial-03, tool-02, person-02 | none | paraphrase-01, paraphrase-02, partial-01, partial-03, tool-03, person-02, multi-04 | lookup-02, partial-05, tool-04, person-04, multi-01 | paraphrase-01, paraphrase-02, paraphrase-03, paraphrase-05, partial-01, partial-03, tool-02, tool-03, person-02, multi-04 | lookup-02, question-05, paraphrase-04, paraphrase-06, partial-05, tool-04, person-01, person-04, multi-01 |
| RRF, full lists, k = 60 | paraphrase-04, paraphrase-05, partial-03, person-02 | none | paraphrase-02, paraphrase-05, paraphrase-06, partial-03, person-02 | none | paraphrase-01, paraphrase-02, paraphrase-04, paraphrase-05, paraphrase-06, partial-03, person-02 | none |
| RRF over the top 10 of each list | paraphrase-04, paraphrase-05, partial-03, tool-02, person-02 | none | paraphrase-02, paraphrase-05, paraphrase-06, partial-03, person-02 | none | paraphrase-01, paraphrase-02, paraphrase-04, paraphrase-05, paraphrase-06, partial-03, tool-02, person-02 | none |
| The page (rankHybrid) | paraphrase-04, paraphrase-05, partial-03, tool-02, person-02 | none | paraphrase-02, paraphrase-05, paraphrase-06, partial-03, person-02 | none | paraphrase-01, paraphrase-02, paraphrase-04, paraphrase-05, paraphrase-06, partial-03, tool-02, person-02 | none |
| RRF over the top 20 of each list | paraphrase-04, paraphrase-05, partial-03, person-02 | none | paraphrase-02, paraphrase-05, paraphrase-06, partial-03, person-02 | none | paraphrase-01, paraphrase-02, paraphrase-04, paraphrase-05, paraphrase-06, partial-03, tool-02, person-02 | none |
| RRF, full lists, meaning weighted 2 to 1 | paraphrase-01, paraphrase-05, partial-03, person-02 | none | paraphrase-02, paraphrase-05, paraphrase-06, partial-01, partial-03, tool-03, person-02, multi-04 | partial-05, tool-04, person-04 | paraphrase-01, paraphrase-02, paraphrase-05, paraphrase-06, partial-01, partial-03, partial-04, tool-03, person-02, multi-04 | paraphrase-04, partial-05, tool-04, person-01, person-04 |
| RRF top 10, meaning without an unfinished last word | paraphrase-04, paraphrase-05, partial-03, tool-02, person-02 | none | paraphrase-02, paraphrase-05, paraphrase-06, partial-03, person-02 | none | paraphrase-01, paraphrase-02, paraphrase-04, paraphrase-05, paraphrase-06, partial-03, tool-02, person-02 | none |
| RRF, BM25 list without single generic term matches | paraphrase-04, paraphrase-05, partial-03, person-02 | none | paraphrase-02, paraphrase-05, paraphrase-06, partial-03, person-02 | none | paraphrase-01, paraphrase-02, paraphrase-04, paraphrase-05, paraphrase-06, partial-03, tool-02, person-02 | none |

## Against RRF, full lists, k = 60 (recall@5 fixed and broken, first right page moved to or from rank 1, MRR@10 up and down)

| Method | Fixed | Broken | Top 1 gained | Top 1 lost | MRR up | MRR down |
|---|---|---|---|---|---|---|
| BM25 alone | none | paraphrase-04, paraphrase-05, partial-03, person-02 | none | paraphrase-02, paraphrase-05, paraphrase-06, partial-03, person-02 | none | paraphrase-01, paraphrase-02, paraphrase-04, paraphrase-05, paraphrase-06, partial-03, person-02 |
| Meaning alone (reference) | paraphrase-01, tool-02 | paraphrase-04 | paraphrase-01, partial-01, tool-03, multi-04 | lookup-02, paraphrase-05, paraphrase-06, partial-05, tool-04, person-04, multi-01 | paraphrase-01, paraphrase-03, partial-01, tool-02, tool-03, multi-04 | lookup-02, question-05, paraphrase-04, paraphrase-05, paraphrase-06, partial-05, tool-04, person-01, person-04, multi-01 |
| RRF over the top 10 of each list | tool-02 | none | none | none | paraphrase-04, tool-02 | none |
| The page (rankHybrid) | tool-02 | none | none | none | paraphrase-04, tool-02 | none |
| RRF over the top 20 of each list | none | none | none | none | tool-02 | none |
| RRF, full lists, meaning weighted 2 to 1 | paraphrase-01 | paraphrase-04 | partial-01, tool-03, multi-04 | partial-05, tool-04, person-04 | paraphrase-01, partial-01, partial-04, tool-03, multi-04 | paraphrase-04, partial-05, tool-04, person-01, person-04 |
| RRF top 10, meaning without an unfinished last word | tool-02 | none | none | none | paraphrase-04, tool-02 | none |
| RRF, BM25 list without single generic term matches | none | none | none | none | tool-02 | none |

## Queries the site cannot answer: results returned (and the first three pages)

| Method | deploying models on kubernetes | mamba state space language model | rag with a vector database | react hooks tutorial |
|---|---|---|---|---|
| BM25 alone | 28: grpo-from-scratch, about, gpt-local-model-opencode | 31: kalman-filters-time-series, deriving-ppo-loss, deriving-dpo-loss | 9: claude-skills, pages/overlap-aware-sc, compare-models-structured-data | 2: building-gpt-from-scratch, projects |
| Meaning alone (reference) | 47: qwen35-vs-gemma4, about, build-custom-comfyui-node | 47: kalman-filters-time-series, compare-models-structured-data, qwen35-vs-gemma4 | 47: pages/overlap-aware-sc, cc-tools, tools/svg-viewer | 47: claude-skills, qwen35-vs-gemma4, build-custom-comfyui-node |
| RRF, full lists, k = 60 | 47: about, grpo-from-scratch, qwen35-vs-gemma4 | 47: kalman-filters-time-series, compare-models-structured-data, deriving-ppo-loss | 47: pages/overlap-aware-sc, compare-models-structured-data, build-custom-comfyui-node | 47: building-gpt-from-scratch, projects, claude-skills |
| RRF over the top 10 of each list | 15: about, grpo-from-scratch, qwen35-vs-gemma4 | 16: kalman-filters-time-series, compare-models-structured-data, deriving-ppo-loss | 15: pages/overlap-aware-sc, compare-models-structured-data, build-custom-comfyui-node | 12: building-gpt-from-scratch, claude-skills, projects |
| The page (rankHybrid) | 15: about, grpo-from-scratch, qwen35-vs-gemma4 | 16: kalman-filters-time-series, compare-models-structured-data, deriving-ppo-loss | 15: pages/overlap-aware-sc, compare-models-structured-data, build-custom-comfyui-node | 12: building-gpt-from-scratch, claude-skills, projects |
| RRF over the top 20 of each list | 25: about, grpo-from-scratch, qwen35-vs-gemma4 | 26: kalman-filters-time-series, compare-models-structured-data, deriving-ppo-loss | 24: pages/overlap-aware-sc, compare-models-structured-data, build-custom-comfyui-node | 20: building-gpt-from-scratch, projects, claude-skills |
| RRF, full lists, meaning weighted 2 to 1 | 47: about, qwen35-vs-gemma4, grpo-from-scratch | 47: kalman-filters-time-series, compare-models-structured-data, deriving-ppo-loss | 47: pages/overlap-aware-sc, build-custom-comfyui-node, compare-models-structured-data | 47: projects, building-gpt-from-scratch, claude-skills |
| RRF top 10, meaning without an unfinished last word | 15: about, grpo-from-scratch, qwen35-vs-gemma4 | 16: kalman-filters-time-series, compare-models-structured-data, deriving-ppo-loss | 15: pages/overlap-aware-sc, compare-models-structured-data, build-custom-comfyui-node | 12: building-gpt-from-scratch, claude-skills, projects |
| RRF, BM25 list without single generic term matches | 47: about, grpo-from-scratch, sft-from-scratch | 47: kalman-filters-time-series, compare-models-structured-data, deriving-ppo-loss | 47: pages/overlap-aware-sc, compare-models-structured-data, build-custom-comfyui-node | 47: building-gpt-from-scratch, projects, claude-skills |

## Typing: the last word typed one letter at a time, from two letters to the whole word

Kept top 5 is the mean share of the first five pages that stay among the first five from one keystroke to the next. First page changes is the mean number of times the first page changes while one last word is typed.

| Method | Words | Keystrokes | Kept top 5 | First page changes per word |
|---|---|---|---|---|
| BM25 alone | 36 | 149 | 0.83 | 0.47 |
| Meaning alone (reference) | 36 | 149 | 0.77 | 1.06 |
| RRF, full lists, k = 60 | 36 | 149 | 0.79 | 1 |
| RRF over the top 10 of each list | 36 | 149 | 0.77 | 1 |
| The page (rankHybrid) | 36 | 149 | 0.77 | 1 |
| RRF over the top 20 of each list | 36 | 149 | 0.79 | 1 |
| RRF, full lists, meaning weighted 2 to 1 | 36 | 149 | 0.77 | 0.92 |
| RRF top 10, meaning without an unfinished last word | 36 | 149 | 0.79 | 0.97 |
| RRF, BM25 list without single generic term matches | 36 | 149 | 0.79 | 1.03 |
