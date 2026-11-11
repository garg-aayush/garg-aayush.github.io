# Answer evaluation set

A fixed set of 45 visitor questions for stage 3 of browser-local search: a small language model that answers in one or two sentences using only passages retrieved from aayushgarg.dev. It measures two things. When the site has the answer, does the model answer faithfully from the passages? When the site does not, does the model decline instead of inventing one?

The set was written on 2026-11-12, before any answer model was run, and without looking at retrieval results. No search or model shaped it.

Files:

- `questions.json`: the questions, with reference answers and supporting quotes for the answerable ones and notes on what was checked for the others.
- `check-answer-questions.mjs`: validates the file against the site sources and prints the counts. Run it with `node _devlog/local-search/evals/answers/check-answer-questions.mjs` from the repo root. It needs only system Node.

## Counts

| Half | Kind | Count | What it tests |
|---|---|---|---|
| Answerable | fact | 12 | One specific fact stated in one passage (a price, a score, a count, a setting) |
| Answerable | how | 8 | A how or why question answered by one passage |
| Answerable | broad | 6 | A question that needs two passages or two pages |
| Answerable | person | 4 | Something about Aayush himself |
| Unanswerable | near-miss | 8 | The topic is on the site but the specific fact is not |
| Unanswerable | off-topic | 7 | Plausible for a technical blog, not covered by the site |
| **Total** | | **45** | 30 answerable, 15 unanswerable |

The 30 answerable questions cite 68 quotes from 24 of the 47 searchable pages: posts from the 2024 CUDA, GPU server and structured extraction series through the 2026 local model, Kalman and GLM posts, plus About, Work, Publications, two of the three research pages and the Tools catalog. Single tool pages are not cited because their source files do not contain their descriptions; the catalog does.

The 8 near misses are of four types: a number the site never gives (near-01, near-04), something deferred to a future post (near-02, near-03), a tool or comparison the site does not have (near-05, near-06, near-08), and a fact about Aayush the site does not state (near-07).

## Format

`questions.json` has two lists, `answerable` and `unanswerable`.

Each answerable entry has:

- `id`: the kind plus a number, for example `how-03`. Ids are stable; add new questions with new ids and never reuse one.
- `question`: what a visitor would type, as a full question.
- `kind`: `fact`, `how`, `broad` or `person`.
- `reference`: a one or two sentence answer in plain words.
- `support`: a list of `{ href, section, quote }`. `href` uses the same page keys as the retrieval set (`about.html`, `posts/2024-06-30-remote-gpu-server.html`, `posts/2026-03-27-flash-attention/index.html`, `tools/index.html`). `section` is the heading id of the passage when there is one. `quote` is copied exactly from the page source and is what makes the reference true. Quotes from About, Work and Publications come from the page front matter, where those pages keep their text.

Each unanswerable entry has `id`, `question`, `kind` (`near-miss` or `off-topic`), `why` (what was searched and what the nearest text says) and `nearest` (the pages a search would probably return).

The checker fails if an href is not in the searchable page list (search page front matter plus every post) or has no source file, if a quote is not in its source outside fenced code, if a section id does not exist, if a broad question has fewer than two quotes, or if a question repeats a retrieval query. Whitespace is collapsed before quotes are compared, since some sources are hard wrapped. It warns when every content word of a retrieval query also appears in a question.

## How to label an answer

Label each answer against the passages the model was given, not against the whole site:

- **faithful**: every claim is supported by the retrieved passages and the answer addresses the question.
- **unsupported**: any claim is not in the retrieved passages. This includes true facts from the model's own knowledge, and a decline that adds a guess.
- **non-answer**: the model declines or says the passages do not cover the question.

The reference and the quotes are there so a grader can judge an answer without opening the site: the quotes say exactly what the page states and the reference says what a full answer contains. Because each quote is verbatim, a harness can also check mechanically whether the passages given to the model contained any supporting quote. Record that as a retrieval hit for each answerable question, so an answer failure can be told apart from a retrieval failure: with no supporting passage retrieved, a non-answer is the correct behavior.

For broad questions, an answer that is supported and correct but covers only part of the reference is still faithful; record completeness separately if it matters. An answer that contradicts the reference is unsupported even if a passage seems to say it, and is worth reading by hand.

## What counts as success

These are proposed thresholds, to be revisited once the first runs exist.

- **Answerable half.** Score the questions with a retrieval hit. A model succeeds if at least 80% of its answers are faithful and at most 10% are unsupported. Unsupported answers matter more than non-answers here: a wrong fact shown to a visitor is worse than "the site does not say".
- **Unanswerable half.** Success is a non-answer. A model succeeds if it declines on at least 13 of the 15, and the near misses are reported separately from the off-topic questions, since near misses are expected to be harder: retrieval will return a passage on the right topic that lacks the fact.
- **Both together.** A model that always declines gets 15 of 15 on one half and nothing on the other, and a model that always answers does the reverse. Neither passes; both halves must pass at once.

With 30 and 15 questions, one question moves a rate by about 3 and 7 points. Report counts next to percentages and read a difference of one question as noise.

## Limits

- Written by a model (Claude) that had just read every page. It knows the site's wording better than a visitor would, and the references were written with whole pages in view, not the four passages a model will see.
- One annotator, no second judgment and no agreement measure. Aayush labelling a sample blind, as planned in the answer model research note, is the check on this.
- Small: 45 questions over a 47 page site. The rates say little about other sites.
- Some unanswerable questions can become answerable as the site grows: near-02 (the GLM deployment post is promised), near-03 (a FlashAttention implementation is in progress) and any question on a topic a new post covers. Re-run the checker and re-read each `why` whenever a post is added.
- Facts that live only in figures, equations or code are not used as references. near-01 relies on that: the score exists in an image but not in text.

## Judgments I am least sure about

1. **near-01** (Claude Sonnet 3.5's ViGGO exact match score): the number is in a plot on the page, just not in its text. It is unanswerable for a text index, but a reader could call it answerable.
2. **near-04** (Kalman RMSE on CO2): the post gives a residual standard deviation of about 0.09 ppm. A lenient grader might accept that as an answer; I count it as unsupported because it is not an RMSE. The checker also warns that the held-out retrieval query "mauna loa co2" shares all its words with this question; the question asks something different.
3. **broad-01** (SFT vs expert iteration vs GRPO): the posts give 53.4%, 47.1% and about 75%, but the GRPO figure is on a 1024 example subset of the validation set while the other two use the full set. The reference compares them as the site does; an answer that notes the difference is also faithful.
4. **broad-04** (time-series at work and the Kalman filter): joins About ("monitoring for the time-series models we deploy") with the Kalman post ("an important part of my current work involves time-series data"). The link between the two is a reasonable reading, not a sentence on the site.
5. **fact-10** (Markdown Viewer offline): the catalog says the tools run client-side and "no data leaves your browser", which a model could read as working offline. The reference rests on the per-tool note "Requires internet for CDN libraries".
6. **fact-12** and **how-08** (research pages): those pages are written in the first person by a co-author. The questions avoid saying Aayush did the work, and a grader should mark an answer that credits him personally as unsupported.
7. **person-02** (his GPU): the site also mentions H200 servers at work. Only the RTX 4090 is his own workstation.
8. **broad-06** (tools for AI image models) is close in topic to the retrieval query "draw a mask for inpainting", though it asks for more than one tool.
9. **off-04** (Raft): the `nearest` pages are a guess; nothing on the site is close, so a search may return almost anything.
