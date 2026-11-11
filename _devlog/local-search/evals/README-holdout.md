# Held-out search queries

`questions-holdout.json` holds 20 queries that are used once, to check that a ranking choice made on the 40 queries in `questions.json` still holds on queries it was not chosen on. Once it has been scored, it is no longer held out: do not tune on it, and write a new set for the next check.

It was written on 2026-11-11 without sight of any results. I did not read the search journal, the eval results, the plan or the ranking code, and did not run any search. I read the site sources, the existing set, its README and its checker.

The format, types and grading rule are the same as in `README.md`. Ids carry an `h-` prefix. Validate it with `node _devlog/local-search/evals/check-questions.mjs _devlog/local-search/evals/questions-holdout.json`; with no argument the checker still reads `questions.json`.

## Counts per type

| Type | Count |
|---|---|
| lookup | 2 |
| topic | 2 |
| question | 3 |
| paraphrase | 4 |
| partial | 2 |
| tool | 2 |
| person | 2 |
| multi | 1 |
| none | 2 |
| **Total** | **20** (18 answerable, 2 with no answer) |

There are 19 grade 2 and 13 grade 1 judgments over 21 pages. No query repeats or rephrases one of the 40. The set leans on pages the first set uses least: six tools it never judges relevant (LaTeX Math Preview, Markdown Viewer, Diff Viewer, Image Resizer, Image Format Converter, Base64), and posts it uses once or only at grade 1 (SFT from scratch, Kalman, FlashAttention, GPT from scratch, the Gemma 4 chat post). Each paraphrase `why` names the query words that appear on the target page, counted with the same rule as `README.md` (the word, or a word it is a prefix of, in the page source).

With 1 to 4 queries per type, read this set as a pass or fail check on the overall direction, not as per-type scores.

## Judgments I am least sure about

1. `h-paraphrase-02` ("is delhi smoggy today"): the weather page is grade 2 because it shows Delhi's live AQI, but Delhi is only in its data files and the page body is not indexed. Same tension as `question-04` in the first set.
2. `h-paraphrase-03` ("research on imaging rocks underground with sound"): Publications is grade 2 and About grade 1. A reader could argue About answers it better, since it states the seismic research in plain words while Publications only has paper titles.
3. `h-paraphrase-04` ("spot what changed between two drafts") is a paraphrase aimed at a tool, so it overlaps with the `tool` type. I kept it because the tool pages have almost no text, which makes it the hardest case for keyword search.
4. `h-lookup-01` ("katex"): the Markdown Viewer is grade 1 though KaTeX appears only in its script tag, not in visible text.
5. `h-partial-02` ("base 64"): the browser tools post is grade 1 here but not for the other two tool queries, because it says why the Base64 tool is used and only lists the others.
6. `h-none-01` ("fine-tuning whisper"): judged unanswered, though the JSALT page covers ASR pipelines. A grade 1 there would be defensible.
