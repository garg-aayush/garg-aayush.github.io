# Fusion comparison, review-before-holdout

Written by run-fusion.mjs. Index 759f6c5572dd74aa (47 pages, 506 passages). Table minishlab/potion-base-8M at bf8b056, int8, 256 dimensions. Questions: _devlog/local-search/evals/questions-holdout.json, 20 queries (18 answerable), file hash d83ff783d9ce. Generic term: in more than 5 percent of the passages. A query moves a per-type score by 17 to 25 points and the overall score by about 0.03.

## Headline, answerable queries

| Method | Recall@5 | MRR@10 | nDCG@10 | Typing recall@5 | Typing MRR@10 |
|---|---|---|---|---|---|
| BM25 alone | 0.67 | 0.56 | 0.60 | 0.69 | 0.55 |
| The page (rankHybrid) | 0.72 | 0.55 | 0.67 | 0.75 | 0.56 |

## Per type, recall@5 / MRR@10 / nDCG@10 (queries per type: lookup 2, topic 2, question 3, paraphrase 4, partial 2, tool 2, person 2, multi 1)

| Method | lookup | topic | question | paraphrase | partial | tool | person | multi |
|---|---|---|---|---|---|---|---|---|
| BM25 alone | 1.00 / 0.75 / 0.86 | 1.00 / 1.00 / 0.95 | 1.00 / 0.83 / 0.88 | 0.25 / 0.13 / 0.22 | 0.50 / 0.50 / 0.55 | 0.50 / 0.50 / 0.45 | 0.50 / 0.25 / 0.32 | 1.00 / 1.00 / 1.00 |
| The page (rankHybrid) | 1.00 / 0.75 / 0.86 | 1.00 / 1.00 / 0.94 | 1.00 / 0.83 / 0.88 | 0.25 / 0.19 / 0.43 | 1.00 / 0.20 / 0.32 | 0.50 / 0.58 / 0.67 | 0.50 / 0.32 / 0.52 | 1.00 / 1.00 / 1.00 |

## Rank of the first right page per query

| Query | bm25 | page |
|---|---|---|
| h-lookup-01 katex | 2 | 2 |
| h-lookup-02 mauna loa co2 | 1 | 1 |
| h-topic-01 gpu memory hierarchy | 1 | 1 |
| h-topic-02 prompt masking | 1 | 1 |
| h-question-01 what learning rate works for expert iteration | 1 | 1 |
| h-question-02 how do i add web search to a local model | 2 | 2 |
| h-question-03 why did he move the weather job off github actions | 1 | 1 |
| h-paraphrase-01 tiny chatgpt clone step by step | none | 11 |
| h-paraphrase-02 is delhi smoggy today | none | 9 |
| h-paraphrase-03 research on imaging rocks underground with sound | 2 | 2 |
| h-paraphrase-04 spot what changed between two drafts | 22 | 6 |
| h-partial-01 speculative decod | 1 | 5 |
| h-partial-02 base 64 | none | 5 |
| h-tool-01 shrink an image to half its size | 12 | 6 |
| h-tool-02 turn a png into webp | 1 | 1 |
| h-person-01 did he do freelance work | 2 | 2 |
| h-person-02 list of his papers | 12 | 7 |
| h-multi-01 tailscale setup | 1 | 1 |

## Against BM25 alone (recall@5 fixed and broken, first right page moved to or from rank 1, MRR@10 up and down)

| Method | Fixed | Broken | Top 1 gained | Top 1 lost | MRR up | MRR down |
|---|---|---|---|---|---|---|
| The page (rankHybrid) | h-partial-02 | none | none | h-partial-01 | h-paraphrase-02, h-paraphrase-04, h-partial-02, h-tool-01, h-person-02 | h-partial-01 |

## Queries the site cannot answer: results returned (and the first three pages)

| Method | fine-tuning whisper | vision transformer from scratch |
|---|---|---|
| BM25 alone | 18: finetune-llama3-8B-predibase, compare-models-structured-data, deriving-ppo-loss | 17: building-gpt-from-scratch, self-hosted-gemma4-chat, tools/image-operations |
| The page (rankHybrid) | 16: finetune-llama3-8B-predibase, compare-models-structured-data, deriving-ppo-loss | 15: tools/image-operations, building-gpt-from-scratch, about |

## Typing: the last word typed one letter at a time, from two letters to the whole word

Kept top 5 is the mean share of the first five pages that stay among the first five from one keystroke to the next. First page changes is the mean number of times the first page changes while one last word is typed.

| Method | Words | Keystrokes | Kept top 5 | First page changes per word |
|---|---|---|---|---|
| BM25 alone | 17 | 59 | 0.80 | 0.65 |
| The page (rankHybrid) | 17 | 59 | 0.72 | 1.06 |
