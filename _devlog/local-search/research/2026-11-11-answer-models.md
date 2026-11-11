# Answer models for browser-local RAG

Research record, 2026-11-11. Question: which small language models should the site offer to answer a question from its own search results, entirely in the visitor's browser, and how to measure the answers. Stage 3 of the plan in `plan.html`.

Every fact below was read on 2026-11-11 from a primary source: model cards and file listings through the Hugging Face API, the npm registry, the Transformers.js 4.3.2 bundle, the WebLLM and wllama READMEs and model config, MDN, and the similar site's own articles and page script. Sizes are listed file sizes in MB (10^6 bytes). Nothing was downloaded to run, and no model was run. What I could not confirm is in "Not verified" at the end. Status words follow the plan: proposed means my recommendation, not approved.

## Summary

- **No small model off the shelf answers reliably from passages.** The only published evaluation of these models on this exact job (a personal blog, four retrieved passages, two sentences, judged by Claude Opus 5.5) is the similar site's: of 30 answerable and 15 unanswerable questions, LFM2.5-350M was faithful on 11 and invented an answer for 13, Qwen3-0.6B 18 and 6, Gemma 3 270M 3 and 13, SmolLM2-360M 3 and 15, Gemma 4 E2B (3.1 GB) 28 and 0. One site, 45 questions, one judge: a strong hint, not a measurement of this site.
- **A fine-tune changed the trade, not the accuracy.** The same author's Qwen3-0.6B fine-tune (`bartdegoede/qwen3-0.6b-small-rag`, Apache 2.0, 358 MB) is faithful on 16 of 30 against 17 for the base model exported the same way, wrong on 3 against 9, and declined all 15 unanswerable questions against 2 invented by the base. The price is 11 non-answers on answerable questions against 4. It is now that site's default.
- **LiquidAI's small model is the weakest fit on the evidence, and LiquidAI says so itself.** The LFM2.5-350M card recommends it "for data extraction, structured outputs, and tool use" and says it "is not recommended for knowledge-intensive tasks". The LFM2.5-1.2B-Instruct card recommends it "for agentic tasks, data extraction, and RAG". The similar site marks LFM2.5-350M as WebGPU only, and LiquidAI's own ONNX card says "WebGPU is required for browser inference". LiquidAI also publishes a RAG-specialised model, LFM2-1.2B-RAG (browser export 871 MB), and released LFM3-1.7B on 2026-11-03 (browser export 1.4 GB, WebGPU only per its card).
- **Every answer model is over 100 MiB in one file**, so none can be published through this site's `gh-pages` branch. They load from huggingface.co, a third party, at a pinned revision. The question and the passages never leave the browser; the download request does.
- **Recommendation (proposed), after Aayush's rulings of 2026-11-11** (no `bartdegoede/qwen3-0.6b-small-rag` fine-tune; no larger on-demand answer model): compare four small models, all loaded only when the visitor asks, in this order: stock Qwen3-0.6B (583 MB q4f16), IBM Granite 4.0 350M (357 MB, added by Aayush on 2026-11-11), LFM2.5-350M (258 MB, WebGPU only), Qwen3.5-0.8B text (489 MB), with Gemma 4 E2B (3.1 GB) measured offline as the reference ceiling and never offered. None of the four has published evidence of declining reliably, so no answers may be the honest outcome.

## A. The similar site, from its own articles

Bart de Goede's site (bart.degoe.de). All numbers are that author's; none were reproduced here.

### "Running RAG with a (small) language model in the browser" (2026-10-12)

- **Pipeline.** Retrieve the four best passages with the site's static-table semantic search (potion-base-8M, 128 dimensions). Gate: "If the best passage scores below a threshold, the model isn't called at all". Prompt: numbered passages and a system prompt to "answer in at most two sentences, use only these passages, say so if they don't answer the question". Generate in a Web Worker with Transformers.js "on WebGPU, or on the CPU via WebAssembly if your browser doesn't have WebGPU", streamed, stopped "as soon as it has two complete sentences". Passages are shown as cards first; loading a model "is an explicit click".
- **Candidates** with browser (ONNX) builds: SmolLM2 135M and 360M, Gemma 3 270M, LFM2.5-350M, Qwen2.5-0.5B, Qwen3-0.6B; references Gemma 4 E2B (3.1 GB) and Claude Haiku 5.5 by API. All at q4f16, because the q4 exports keep the embedding table in 32-bit and are larger (SmolLM2-360M: 390 MB q4, 275 MB q4f16).
- **Evaluation.** 30 answerable questions (from the earlier search evaluation, rephrased as questions) and 15 unanswerable, most of them near misses. Opus 5.5 graded each answer against the passages as faithful, unsupported (at least one claim not in the passages) or a non-answer. The author labelled 20 blind and agreed with the judge on 16 of 20 about faithful or not. Claude also wrote the questions; the author reviewed them.

| Model | Download | Faithful (of 30) | Invented (of 15) |
|---|---|---|---|
| SmolLM2-135M | 120 MB | 0 | 14 |
| LFM2.5-350M | 258 MB | 11 | 13 |
| SmolLM2-360M | 275 MB | 3 | 15 |
| Gemma 3 270M | 293 MB | 3 | 13 |
| Qwen3-0.6B | 579 MB | 18 | 6 |
| Gemma 4 E2B | 3.1 GB | 28 | 0 |
| Claude Haiku 5.5 (API) | none | 27 | 1 |

- **Repetition penalty.** Small models looped under greedy decoding; a penalty of 1.15 stops that, but Transformers.js applies it to the prompt too, pushing the model away from the passages' words. Without the penalty Qwen3 went from 15 to 18 faithful and LFM2.5 from 2 to 11, so the page sets it per model (off for those two).
- **The gate.** A threshold of 0.45 on the best passage's score stops far-off questions (a bread question scored 0.25), but near misses scored 0.54 to 0.63, "higher than several questions the blog actually answers"; blocking them would reject 13 of the 30 real questions. "So the gate only catches the obviously off-topic questions, and the rest is on the model."
- **Length.** Allowed 2, 4 or 6 sentences, Qwen3-0.6B was faithful on 18, 8 and 6; Gemma 4 E2B on 28, 26 and 24. Shorter is safer.
- A footnote says two of the offered models run "only on WebGPU; see the CPU caveats further down", but the article has no such section. The page script answers it: Gemma 3 270M and LFM2.5-350M carry `webgpuOnly: true`.

### "Fine-tuning a small language model for RAG in a browser on a Mac" (2026-10-20)

- **Setup.** Base Qwen3-0.6B, LoRA rank 8 on every layer, mlx-lm on an M4 Mac mini (24 GB), one epoch over about 4,500 examples, about 1h20m per run. Training data from openly licensed technical writing (Go blog, Rust blog, Rust RFCs, Python PEPs: 2,193 documents), never the blog itself. Each question gets the top four passages from the same retrieval the blog uses (600 character chunks, 120 overlap, potion-base-8M at 128 dimensions). Claude Sonnet 5.5 wrote questions of three kinds (answerable, the source document removed, near miss); Claude Opus 5.5 answered them under the blog's system prompt. Exported to q4f16 ONNX with the onnxruntime-genai model builder. The baseline is the base model exported the same way: 17 of 30 faithful, 2 invented (the earlier article's 18 and 6 used the onnx-community files).
- **What changed and what it found**, on the same 45 questions and judge:

| Version | Change | Faithful (of 30) | Wrong answers | Invented (of 15) |
|---|---|---|---|---|
| Base | none | 17 | 9 | 2 |
| v1 | dense two sentence answers from Opus | 8 | 18 | 0 |
| v2 | v1 with the "the blog doesn't say..." hedges stripped | 9 | 17 | 0 |
| **v3** | **one short extractive sentence, in the passage's words, no combining passages** | **16** | **3** | **0** |
| v4 | v3 plus 1,200 broad questions | 13 | 7 | 0 |

- **Findings, in the author's words and numbers.** The small model copied the style of its targets (dense, specific, combining facts) without the reading behind it, so v1 got worse. Validation loss fell at every v2 checkpoint while faithful answers went 18, 11, 9: "the loss doesn't measure what I care about". v3 ("say less") kept accuracy, cut wrong answers to a third and declined every unanswerable question; the cost is 11 non-answers on answerable questions against 4, mostly broad ones ("What has the blog written about X?"). v4 tried to fix the broad ones and brought back invention. "Small models can extract; they don't really summarize." The author calls 16 against 17 a tie and 3 against 9 "barely significant", and notes Claude both wrote the training answers and graded them.
- **The result.** `bartdegoede/qwen3-0.6b-small-rag` (v3) is the default on the ask page; the original Qwen3-0.6B, SmolLM2-360M, Gemma 3 270M and LFM2.5-350M are under "Other models". The fine-tune is 358 MB against 579 MB because its export uses one 4-bit matrix for the tied input embedding and output layer. The model card says the refusal is the fixed sentence "The blog does not seem to cover this.", the prompt format must be followed exactly, thinking must be off, decoding greedy and no repetition penalty. On the author's posts today it is faithful on 18 of 30 and declines 13 of 15 (the repository README).

### The ask page (read 2026-11-11, page and script)

- Text: "Questions never leave your browser. Models download once from Hugging Face and the runtime from jsDelivr; your browser keeps them, storage permitting." A "Delete downloaded models" button, and a link to the measurement ("Small models get things wrong, and I measured how often").
- Script: each model is pinned to a repository revision with its file list and byte counts (so the page can show the size and check the cache). Device check: WebGPU only if `requestAdapter()` returns an adapter **and** it has `shader-f16`, otherwise WebAssembly; WebGPU-only models are not offered on WebAssembly. Cache check: every file present in the Cache Storage bucket `transformers-cache`. Delete: `caches.delete("transformers-cache")`, reporting the space freed from `navigator.storage.estimate()`. A Stop button and a "Reload model" button after a stop. Citations `[n]` in the answer link to the numbered passage cards.

## B. Candidate answer models

"Download" is what a browser fetches for text generation: the q4f16 ONNX weights (graph plus external data) plus tokenizer and config, rounded. q4f16 means 4-bit weights and 16-bit activations; on WebGPU it needs the adapter feature `shader-f16`. q4 keeps 32-bit activations and needs no feature, but is usually larger. Context is the model's configured maximum, not what a browser can afford. "TJS" is Transformers.js 4.3.2 (ONNX Runtime Web); its bundle includes the model types `lfm2`, `lfm3`, `qwen3`, `qwen3_5`, `gemma3_text`, `gemma4`, `granitemoehybrid`, `smollm3`, `llama`, `phi3`.

| Publisher | Model | Browser export (repository id) | Params | Download (q4f16 unless noted) | Context | License | Runtime | WebGPU or also WebAssembly | Grounded answering evidence |
|---|---|---|---|---|---|---|---|---|---|
| LiquidAI | LFM2.5-230M | `LiquidAI/LFM2.5-230M-ONNX` | 230M | No q4f16; q4 216 MB | 32,768 (card) | LFM Open License v1.0 | ONNX Runtime Web; not tagged for TJS | Not stated | None published. Card: for "data extraction and lightweight on-device agentic pipelines" |
| LiquidAI | LFM2.5-350M | `onnx-community/LFM2.5-350M-ONNX` (TJS tagged), `LiquidAI/LFM2.5-350M-ONNX` | 350M | 258 MB (q4 297 MB) | 32,768 (card; config says 128,000) | LFM Open License v1.0 | TJS; ORT Web; wllama (GGUF Q4_0 219 MB) | WebGPU: LiquidAI's ONNX card says "WebGPU is required"; the similar site marks it WebGPU only | Similar site: 11 of 30 faithful, 13 of 15 invented. Card: "not recommended for knowledge-intensive tasks" |
| LiquidAI | LFM2.5-1.2B-Instruct | `LiquidAI/LFM2.5-1.2B-Instruct-ONNX` | 1.17B | 764 MB (q4 854 MB) | 32,768 (card) | LFM Open License v1.0 | TJS (`lfm2`), ORT Web; wllama (Q4_0 696 MB) | WebGPU expected (as for 350M); WebAssembly not stated | Card: recommended "for agentic tasks, data extraction, and RAG". No published faithfulness numbers |
| LiquidAI | LFM2-1.2B-RAG | `onnx-community/LFM2-1.2B-RAG-ONNX` (TJS tagged, 21 downloads) | 1.2B | 871 MB | 128,000 (config) | LFM Open License v1.0 | TJS; wllama via `LiquidAI/LFM2-1.2B-RAG-GGUF` | Not stated | Fine-tuned for "answering questions based on provided contextual documents" on "1M+ samples"; recommends greedy decoding. No published faithfulness or abstention numbers in the card text |
| LiquidAI | LFM3-1.7B (released 2026-11-03) | `LiquidAI/LFM3-1.7B-ONNX` | 1.7B | 1,401 MB | 256K (card) | LFM Open License v1.0 | ORT Web WebGPU build (`onnxruntime-web/webgpu`); `lfm3` is in the TJS bundle, untested | WebGPU only: card says the default `onnxruntime-web` import "cannot run these graphs"; prefill in chunks of at most 256 tokens | Card: "Use retrieval or search for knowledge-heavy tasks"; AA-Omniscience non-hallucination 92.93 (a closed-book benchmark, not grounded answering) |
| Alibaba Qwen | Qwen3-0.6B | `onnx-community/Qwen3-0.6B-ONNX` | 0.6B | 583 MB (q4 933 MB) | 40,960 (config) | Apache 2.0 | TJS; WebLLM (`Qwen3-0.6B-q4f16_1-MLC`, 1,403 MB VRAM in its config) | Both (similar site runs it on WebAssembly too) | Similar site: 18 of 30, 6 of 15 (onnx-community files); 17 and 2 with the author's own export |
| Bart de Goede (fine-tune of Qwen3-0.6B) | qwen3-0.6b-small-rag | `bartdegoede/qwen3-0.6b-small-rag` | 0.6B | 358 MB (346.1 MB weights, 11.4 MB tokenizer) | 40,960 (config) | Apache 2.0 | TJS | Both, per its card ("runs on WebGPU or WASM") | 16 of 30 faithful, 3 wrong, 0 of 15 invented, 11 non-answers (author's 45 questions). Trained to the fixed refusal sentence |
| Alibaba Qwen | Qwen3.5-0.8B (text only) | `onnx-community/Qwen3.5-0.8B-Text-ONNX` (the multimodal `Qwen3.5-0.8B-ONNX` needs 604 MB for text) | 0.8B | 489 MB | 262,144 | Apache 2.0 | TJS (`qwen3_5_text` in the bundle; card says compatible with Transformers.js); WebLLM (`Qwen3.5-0.8B-q4f16_1-MLC`, 1,629 MB VRAM) | Not stated | None found. Card: intended for "prototyping, task-specific fine-tuning, and other research" |
| Alibaba Qwen | Qwen3-1.7B | `onnx-community/Qwen3-1.7B-ONNX` | 1.7B | 1,440 MB | 40,960 | Apache 2.0 | TJS; WebLLM (2,037 MB VRAM) | Not stated | None found |
| Google | Gemma 3 270M | `onnx-community/gemma-3-270m-it-ONNX` | 270M | 293 MB (q4 343 MB) | 32,768 | Gemma terms | TJS | WebGPU only on the similar site | Similar site: 3 of 30, 13 of 15 |
| Google | Gemma 3 1B | `onnx-community/gemma-3-1b-it-ONNX` | 1B | 784 MB | 32,768 | Gemma terms | TJS; WebLLM (`gemma3-1b-it-q4f16_1-MLC`, 711 MB VRAM) | Not stated | None found |
| Google | Gemma 4 E2B (smallest Gemma 4) | `onnx-community/gemma-4-E2B-it-ONNX` | E2B (2B effective) | 3,130 MB for text (decoder 1,520 plus embeddings 1,591 plus tokenizer); a `qat-mobile` q2f16 export is about 2.3 GB | 131,072 | Apache 2.0 (repo metadata) | TJS (card example uses WebGPU); WebLLM (3,387 MB VRAM, needs `shader-f16`) | WebGPU | Similar site: 28 of 30, 0 of 15; 28, 26, 24 at 2, 4, 6 sentences |
| Hugging Face | SmolLM2-135M / 360M / 1.7B Instruct | `onnx-community/SmolLM2-135M-Instruct-ONNX`, `onnx-community/SmolLM2-360M-Instruct-ONNX`, `HuggingFaceTB/SmolLM2-1.7B-Instruct` (`onnx/`) | 135M / 360M / 1.7B | 122 / 277 / 1,112 MB | 8,192 | Apache 2.0 | TJS; WebLLM | Both | Similar site: 135M 0 of 30 and 14 of 15; 360M 3 and 15 |
| Hugging Face | SmolLM3-3B | `HuggingFaceTB/SmolLM3-3B-ONNX` | 3B | 2,136 MB | 65,536 | Apache 2.0 | TJS | Not stated | None found. No SmolLM3 under 3B exists |
| IBM | Granite 4.0 350M / 1B | `onnx-community/granite-4.0-350m-ONNX-web`, `onnx-community/granite-4.0-1b-ONNX-web` | 350M / 1B | 357 / 1,254 MB | 32,768 / 131,072 | Apache 2.0 | TJS | Not stated | Card lists RAG among capabilities; its RAG example says "Coming soon". No numbers. Newer Granite 4.2 starts at 3B with no browser export found |
| Microsoft | Phi-4-mini-instruct, Phi-3.5-mini | `onnx-community/Phi-4-mini-instruct-web-q4f16`, `onnx-community/Phi-3.5-mini-instruct-onnx-web` | 3.8B | 3,435 / 2,320 MB | 131,072 | Not in the ONNX repo metadata | TJS; WebLLM | WebGPU | None found. No Phi model under 3.8B exists |
| Meta | Llama 3.2 1B Instruct | `onnx-community/Llama-3.2-1B-Instruct-ONNX` | 1.2B | 1,101 MB | 131,072 | Llama 3.2 Community License | TJS; WebLLM (879 MB VRAM) | Not stated | None found |
| PleIAs | Pleias-RAG-350M / 1B | `onnx-community/Pleias-RAG-350M-ONNX`, `onnx-community/Pleias-RAG-1B-ONNX` (18 and 11 downloads) | 350M / 1.2B | 301 / 871 MB | 4,096 | Apache 2.0 | TJS tagged | Not stated | Trained for RAG with literal-quote citations (`<ref>` syntax) and a reasoning trace that can end in refusal; card reports HotPotQA, 2wiki and MuSiQue results (in images) and a paper (arXiv 2504.18225). Needs its own special-token prompt format; the reasoning trace adds tokens before the answer |

Other runtimes:

- **WebLLM** (`@mlc-ai/web-llm` 0.2.88, 2026-11-10): WebGPU only, no WebAssembly fallback. Its prebuilt list has Qwen3-0.6B and 1.7B, Qwen3.5-0.8B and 2B, SmolLM2, Gemma 3 1B, Gemma 4 E2B, Llama 3.2 1B and Phi-3.5-mini, but no LiquidAI model. Cache backends: Cache API (default), IndexedDB, OPFS, and an experimental cross-origin one. Streaming through an OpenAI-style API.
- **wllama** (`@wllama/wllama` 3.13.0, 2026-11-08): llama.cpp in WebAssembly, with WebGPU since v3.1. Runs GGUF files, so it is the one runtime that loads LiquidAI's official GGUF releases (LFM2.5-350M Q4_0 219 MB, LFM2.5-1.2B-Instruct Q4_0 696 MB, LFM3-1.7B Q4_K_M 1,100 MB). Multithreading needs COOP and COEP headers; it switches to single thread otherwise. Files over 2 GB must be split; the README recommends 512 MB chunks.
- **Transformers.js** 4.3.2 (2026-10-27) with ONNX Runtime Web 1.31.0-dev; 4.4.0-next.0 is a prerelease. WebGPU or WebAssembly, chosen by the caller; no automatic fallback (see the embedding research).

**Specialised for RAG or citations, with a browser export:** the Qwen3-0.6B fine-tune above, LFM2-1.2B-RAG and Pleias-RAG 350M and 1B. PleIAs' newer `Pleias-SLM-RAG` (2026-07-30, a ~300M Baguettotron fine-tune) ships only a 328 MB Q8_0 GGUF inside a server project. No LFM2.5 or LFM3 RAG variant exists today.

**Do not exist with a browser export:** a LiquidAI "LFM2.5-RAG"; SmolLM3 below 3B; any Phi below 3.8B; Granite 4.2 below 3B; a Transformers.js tagged export of LFM2.5-230M or LFM3-1.7B (both have ONNX from LiquidAI, aimed at ONNX Runtime directly).

## C. Practicalities

- **Cross-origin isolation.** Not needed by any of the three runtimes. Without it WebAssembly runs on one thread (Transformers.js and wllama both fall back), which makes CPU generation slow; WebGPU is unaffected. GitHub Pages cannot set the headers.
- **What a page can detect before offering a model.** `navigator.gpu` and `await navigator.gpu.requestAdapter()` (null means no WebGPU); `adapter.info.isFallbackAdapter`; `adapter.features.has("shader-f16")` for q4f16; `navigator.storage.estimate()` for room; `navigator.deviceMemory` in Chromium only, as a warning; whether the files are already in the cache (`caches.open(...)` and `match` per file, as the similar site does). It cannot see free GPU memory, or whether iOS will reload the tab. Details and sources are in the embedding research file.
- **How large a model a tab can load.** Evidence is thin. Primary: WebLLM's config marks Qwen3-0.6B (1.4 GB VRAM), Qwen3.5-0.8B (1.6 GB), Llama 3.2 1B (0.9 GB) and Gemma 3 1B (0.7 GB) as `low_resource_required: true`, and Gemma 4 E2B (3.4 GB) as not. The similar site runs Qwen3-0.6B on a laptop GPU, and LFM2.5-350M at 73 tokens per second on a laptop GPU. LiquidAI's card gives native (not browser) phone figures: LFM2.5-1.2B in 719 MB under llama.cpp on a Galaxy S25 Ultra CPU. Leads only: a write-up reports Safari on an iPhone 11 Pro Max reloading the page during generation with WebLLM, Transformers.js and wllama; the LlamaWeb paper (arXiv 2605.20706, 16 devices) reports memory as the constraint and 29 to 33 percent less memory than existing browser frameworks. I found no published measurement of a sub-1B model answering in a phone browser. Judgment: treat 250 to 600 MB as possible on recent phones with WebGPU and unproven elsewhere; treat anything near 1 GB as laptop only until measured.
- **Hosting.** GitHub blocks files over 100 MiB and the deploy pushes `_site/` to `gh-pages`; every answer model has a weight file over 100 MiB. ONNX external data can be split into several files and Transformers.js loads numbered chunks, so self-hosting is technically possible, but GitHub Pages has a 1 GB site limit and a soft 100 GB per month bandwidth limit: 280 downloads of a 358 MB model would reach it. So model files load from huggingface.co (redirected to its storage CDN), at a pinned revision. Privacy: Hugging Face sees the visitor's IP address, user agent, the file requested and, unless the page sets a referrer policy, the page it came from; it does not see the question, the passages or the answer. The honest claim is "answers are generated in your browser; the model downloads once from huggingface.co". The runtime can be self-hosted (the Transformers.js bundle is 0.46 MB, the ONNX Runtime WebAssembly file 26.9 MB) so jsDelivr is not needed.
- **Caching and deletion.** Transformers.js stores downloads in Cache Storage under `transformers-cache` by default (`env.cacheKey`). Cache Storage counts against the origin's quota: up to 60 percent of disk in Chromium and in Safari browser apps, the smaller of 10 percent of disk or 10 GiB in Firefox (best effort). Under storage pressure browsers evict whole origins, least recently used first, and Safari deletes script-written data for origins without interaction in seven days when tracking prevention is on. `navigator.storage.persist()` asks for exemption; Chromium and Safari decide silently, Firefox prompts. Deleting is `caches.delete("transformers-cache")`; the similar site reports the space freed. Chrome's guidance recommends the Cache API for model files.
- **Streaming and cancelling.** Transformers.js has `TextStreamer` for tokens as they are generated and `InterruptableStoppingCriteria` to stop generation; both are in the 4.3.2 bundle. Run the model in a Web Worker so the page stays responsive; a download in progress is cancelled by terminating the worker (the files already cached stay). The similar site stops after two complete sentences and has a Stop button.

## D. Evaluating answers on this site

- **What to score** (proposed). For each answerable question: faithful (every claim is in the passages given), unsupported (at least one claim is not, even if true), non-answer (declines or says nothing useful). For each unanswerable question: declined or invented. Also: whether each citation points to a passage that supports the sentence, and the download, time to first token and time to the full answer, on a laptop and a phone.
- **Same passages for every model.** Fix the retrieval (stage 2's winner, or BM25 if nothing wins), the top four passages and the prompt, and store the passages with each question, so models are compared on identical input. Greedy decoding, so a run is repeatable. Run in Node with the same ONNX files, and check a handful in the browser.
- **Who judges.** A strong model (Claude Opus) against the passages, with a fixed rubric, plus Aayush labelling 20 answers blind to check agreement, as the similar site did (16 of 20). The judge must not know which model wrote the answer.
- **How many unanswerable questions.** The current set has 4, all written as search queries. One wrongly invented answer moves the rate by 25 points, so 4 cannot separate models. Use 15, mostly near misses written from the site's own topics (the similar site used 15 of 45), and 30 answerable questions written as questions. Ideally Aayush writes some of each.
- **A retrieval score gate.** The journal's numbers say an absolute BM25 floor does not work here: the highest top score among the four no-answer queries is 12.5 ("mamba state space language model") and 28 of the 36 answerable queries have their best right page at or below 12.5. The similar site's cosine gate caught only far-off questions; near misses scored above real ones. So (proposed): gate only the case where retrieval found nothing that shares a content word with the question, and leave near misses to the model, which is why abstention is the first thing to measure. Revisit with stage 2's scores on the 15 unanswerable questions: adopt a gate only if it stops several of them while losing at most one answerable question.

## Recommendation (proposed)

**Rulings by Aayush, 2026-11-11, recorded without a reason:** the site will not use the fine-tune `bartdegoede/qwen3-0.6b-small-rag`, and will not offer a larger on-demand answer model (neither LFM2.5-1.2B-Instruct nor LFM2-1.2B-RAG). The facts about both stay above as research; neither is a candidate. **Also on 2026-11-11, Aayush added IBM Granite 4.0 350M to the candidates** (decided); Pleias-RAG-350M was offered at the same time and not taken up.

Parts resting on published numbers: sizes, licenses, contexts, runtimes, and the similar site's faithfulness and invention counts (one site, 45 questions). Parts resting on my judgment: the order, the exit thresholds, and the reading of what those counts mean for this site.

### Small answer models to compare, in order

1. **Qwen3-0.6B** (`onnx-community/Qwen3-0.6B-ONNX`; base `Qwen/Qwen3-0.6B`, Apache 2.0). 583 MB at q4f16 (needs `shader-f16` on WebGPU), 631 MB at q8, 933 MB at q4; `Qwen/Qwen3-0.6B-GGUF` Q8_0 is 639 MB for wllama. Runs on WebGPU or WebAssembly (the similar site offers it on both). Tested first because it has the best published numbers of the four: 18 of 30 faithful and 6 of 15 invented with the onnx-community files, 17 and 2 with that author's own export, 9 wrong answers. Thinking off, greedy decoding, no repetition penalty.
2. **IBM Granite 4.0 350M** (`onnx-community/granite-4.0-350m-ONNX-web`; base `ibm-granite/granite-4.0-350m`, Apache 2.0), decided as a candidate by Aayush. 357 MB at q4f16, 576 MB at q4; context 32,768. The card lists summarization, question answering and RAG among its capabilities, but its RAG example says "Coming soon" and no grounded-answering, citation or abstention numbers are published. The ONNX repository is tagged for Transformers.js (`granitemoehybrid` and `granite` are in the 4.3.2 bundle), but loading and running it there, and whether it runs on WebAssembly as well as WebGPU, are not yet verified. Second because it is the one unmeasured model whose publisher claims RAG, and it is smaller than Qwen3-0.6B.
3. **LiquidAI LFM2.5-350M** (`onnx-community/LFM2.5-350M-ONNX`), 258 MB, WebGPU only. On the list because Aayush prefers LiquidAI and it is the smallest download. The evidence is against it: 13 of 15 invented and 11 of 30 faithful on the similar site, and LiquidAI's own card does not recommend it for knowledge tasks. Measure it with the strict prompt and no repetition penalty.
4. **Qwen3.5-0.8B text** (`onnx-community/Qwen3.5-0.8B-Text-ONNX`), 489 MB. A newer generation at a smaller download than Qwen3-0.6B. No grounded-answering evidence anywhere; the "is the newer base already good enough" check.

Gemma 4 E2B (about 3.1 GB) is measured offline as the reference ceiling (28 of 30, 0 of 15 on the similar site) and never offered.

**There is no separate tier for capable devices.** The page offers whichever of the four the device can run (LFM2.5-350M only with WebGPU; the Qwen models also on WebAssembly) and results alone otherwise.

**What the evidence says about unanswerable questions.** None of the four has published evidence of declining reliably: the best, Qwen3-0.6B, invented answers for 6 of 15 (40 percent) with one export and 2 of 15 with another. The exit test I would use (my judgment): ship a model only if, on this site's questions, it invents an answer for at most about one in ten unanswerable questions and is faithful on at least half of the answerable ones. On published numbers no candidate meets the first bar (Granite and Qwen3.5 have none), so the likely outcome is no answers, said plainly in the post. That is a prediction from another site's 45 questions, not a measurement here: this site's passages, prompt and the "nothing matched" gate may change the counts, so measure before deciding.

### Every model in the plan

| Stage | Model | Download | Loads |
|---|---|---|---|
| 1 | None: BM25 over the passage index | 346,530 bytes (117,508 gzipped) | Automatically with the search page |
| 2 | `minishlab/potion-base-8M` static table | About 4 MB (int8, 128 dims) to 7.6 MB (int8, 256 dims), derived, plus a 0.7 MB tokenizer | Automatically on first use of the box, if it wins (proposed) |
| 2 | `Xenova/all-MiniLM-L6-v2` | 23.0 MB q8, 0.7 MB tokenizer, about 4.8 MB runtime over the wire | When the visitor asks, if it wins |
| 2 | `MongoDB/mdbr-leaf-ir` | 23.2 MB q8, 0.7 MB tokenizer, the same runtime | When the visitor asks, if it wins |
| 2 | EmbeddingGemma 2 text | About 207 MB | Never: offline reference only |
| 3 | Qwen3-0.6B | 583 MB (q4f16) | When the visitor asks; WebGPU or WebAssembly |
| 3 | Granite 4.0 350M | 357 MB (q4f16) | When the visitor asks |
| 3 | LFM2.5-350M | 258 MB | When the visitor asks; WebGPU only |
| 3 | Qwen3.5-0.8B text | 489 MB | When the visitor asks |
| 3 | Gemma 4 E2B | About 3.1 GB | Never: offline reference only |

### Fallbacks

- **The device can run none of the four** (no WebGPU and WebAssembly too slow, or not enough storage): the Ask control says answers are not available on this device; search results are complete on their own.
- **A load fails or is cancelled**: keep the results, say what happened, offer a retry; remember an unfinished load and do not start it again automatically.
- **The passages do not support an answer**: the model is told to say so in one fixed sentence; nothing found at all skips the model; the passages are always shown under any answer, numbered and linked, so a reader can check.

### Ship first

Nothing in stage 3 before the answer evaluation on this site's 45 questions. If a candidate passes the exit test, ship that one alone behind a button that shows its size and "from huggingface.co", with citations linked to the passages, a Stop button and a Delete button. If none passes, ship search without answers.

### What would change my mind

- Qwen3-0.6B, with this site's prompt and gate, declines almost all unanswerable questions here: ship it.
- LFM2.5-350M declines as well as Qwen3-0.6B and is not less faithful: ship it instead (smaller, and Aayush's preference).
- Qwen3.5-0.8B or Granite 4.0 350M beats Qwen3-0.6B on invented answers: prefer it.
- WebAssembly generation on a laptop takes longer than a reader will wait (to be measured): offer answers on WebGPU only.

## Not verified

- Any model's speed or memory in a phone browser; whether a 258 to 583 MB model completes on a mid-range phone.
- WebAssembly prefill and generation speed for a 0.6B model with a 1,000 token prompt on one thread.
- That LFM2.5-1.2B-Instruct, LFM2-1.2B-RAG, Qwen3.5-0.8B-Text, Granite 4.0, Pleias-RAG or LFM2.5-230M run in Transformers.js 4.3.2 on WebGPU or WebAssembly (tags and model types only); that LFM3-1.7B runs through Transformers.js.
- Why LFM2.5-350M is WebGPU only on the similar site (no reason given; LiquidAI's card only says WebGPU is required).
- Any grounded-answering, citation or abstention numbers for LFM2.5-1.2B-Instruct, LFM2-1.2B-RAG, Qwen3.5-0.8B, Granite 4.0 or Llama 3.2 1B. Pleias' benchmark tables are images and were not read.
- The ask page's gate value in its script (the article says 0.45); its retrieval scores are cosine on a static table and do not transfer to BM25 or to this site.
- Hugging Face's own logging and retention for file downloads (its privacy policy was not read).
- The Phi models' license (not in the ONNX repositories' metadata); Gemma 4's license beyond the ONNX repository's metadata.
- The iPhone reload report and the LlamaWeb paper's details beyond its abstract.
- That a Transformers.js page can load ONNX external data split under 100 MiB from GitHub Pages (only that the loader handles numbered chunks).
- LiquidAI context lengths: cards say 32,768 for LFM2.5, configs say 128,000; I report the card.

## Sources (all checked 2026-11-11)

Model files were read through `https://huggingface.co/api/models/<id>/tree/main?recursive=true`, metadata through `https://huggingface.co/api/models/<id>`, configs and cards from `https://huggingface.co/<id>/raw/main/`.

- Similar site: [Running RAG with a (small) language model in the browser](https://bart.degoe.de/rag-with-a-small-language-model-in-the-browser/), [Fine-tuning a small language model for RAG](https://bart.degoe.de/fine-tuning-a-small-language-model-for-rag/), [Ask my blog](https://bart.degoe.de/ask/) and its page script, [bartdegoede/qwen3-0.6b-small-rag](https://huggingface.co/bartdegoede/qwen3-0.6b-small-rag), [small-rag-finetune](https://github.com/bartdegoede/small-rag-finetune)
- LiquidAI: [LFM2.5-230M](https://huggingface.co/LiquidAI/LFM2.5-230M), [LFM2.5-230M-ONNX](https://huggingface.co/LiquidAI/LFM2.5-230M-ONNX), [LFM2.5-350M](https://huggingface.co/LiquidAI/LFM2.5-350M), [LFM2.5-350M-ONNX](https://huggingface.co/LiquidAI/LFM2.5-350M-ONNX), [onnx-community/LFM2.5-350M-ONNX](https://huggingface.co/onnx-community/LFM2.5-350M-ONNX), [LFM2.5-1.2B-Instruct](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct), [LFM2.5-1.2B-Instruct-ONNX](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-ONNX), [LFM2-1.2B-RAG](https://huggingface.co/LiquidAI/LFM2-1.2B-RAG), [onnx-community/LFM2-1.2B-RAG-ONNX](https://huggingface.co/onnx-community/LFM2-1.2B-RAG-ONNX), [LFM3-1.7B](https://huggingface.co/LiquidAI/LFM3-1.7B), [LFM3-1.7B-ONNX](https://huggingface.co/LiquidAI/LFM3-1.7B-ONNX), GGUF: [LFM2.5-230M-GGUF](https://huggingface.co/LiquidAI/LFM2.5-230M-GGUF), [LFM2.5-350M-GGUF](https://huggingface.co/LiquidAI/LFM2.5-350M-GGUF), [LFM2.5-1.2B-Instruct-GGUF](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF), [LFM3-1.7B-GGUF](https://huggingface.co/LiquidAI/LFM3-1.7B-GGUF)
- Qwen: [Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B), [onnx-community/Qwen3-0.6B-ONNX](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX), [onnx-community/Qwen3-1.7B-ONNX](https://huggingface.co/onnx-community/Qwen3-1.7B-ONNX), [Qwen3.5-0.8B](https://huggingface.co/Qwen/Qwen3.5-0.8B), [onnx-community/Qwen3.5-0.8B-ONNX](https://huggingface.co/onnx-community/Qwen3.5-0.8B-ONNX), [onnx-community/Qwen3.5-0.8B-Text-ONNX](https://huggingface.co/onnx-community/Qwen3.5-0.8B-Text-ONNX)
- Google: [onnx-community/gemma-3-270m-it-ONNX](https://huggingface.co/onnx-community/gemma-3-270m-it-ONNX), [onnx-community/gemma-3-1b-it-ONNX](https://huggingface.co/onnx-community/gemma-3-1b-it-ONNX), [onnx-community/gemma-4-E2B-it-ONNX](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX), [onnx-community/gemma-4-E2B-it-qat-mobile-ONNX](https://huggingface.co/onnx-community/gemma-4-E2B-it-qat-mobile-ONNX)
- Hugging Face: [onnx-community/SmolLM2-135M-Instruct-ONNX](https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX), [onnx-community/SmolLM2-360M-Instruct-ONNX](https://huggingface.co/onnx-community/SmolLM2-360M-Instruct-ONNX), [SmolLM2-1.7B-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct), [SmolLM3-3B-ONNX](https://huggingface.co/HuggingFaceTB/SmolLM3-3B-ONNX)
- IBM: [granite-4.0-350m](https://huggingface.co/ibm-granite/granite-4.0-350m), [onnx-community/granite-4.0-350m-ONNX-web](https://huggingface.co/onnx-community/granite-4.0-350m-ONNX-web), [onnx-community/granite-4.0-1b-ONNX-web](https://huggingface.co/onnx-community/granite-4.0-1b-ONNX-web)
- Microsoft and Meta: [onnx-community/Phi-4-mini-instruct-web-q4f16](https://huggingface.co/onnx-community/Phi-4-mini-instruct-web-q4f16), [onnx-community/Phi-3.5-mini-instruct-onnx-web](https://huggingface.co/onnx-community/Phi-3.5-mini-instruct-onnx-web), [onnx-community/Llama-3.2-1B-Instruct-ONNX](https://huggingface.co/onnx-community/Llama-3.2-1B-Instruct-ONNX)
- PleIAs: [Pleias-RAG-350M](https://huggingface.co/PleIAs/Pleias-RAG-350M), [onnx-community/Pleias-RAG-350M-ONNX](https://huggingface.co/onnx-community/Pleias-RAG-350M-ONNX), [onnx-community/Pleias-RAG-1B-ONNX](https://huggingface.co/onnx-community/Pleias-RAG-1B-ONNX), [Pleias-SLM-RAG](https://huggingface.co/PleIAs/Pleias-SLM-RAG), [report, arXiv 2504.18225](https://huggingface.co/papers/2504.18225)
- Runtimes: [npm @huggingface/transformers](https://www.npmjs.com/package/@huggingface/transformers), [transformers.web.js 4.3.2](https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.web.js) (read for model types, cache and streaming), [npm @mlc-ai/web-llm](https://www.npmjs.com/package/@mlc-ai/web-llm), [WebLLM README](https://github.com/mlc-ai/web-llm), [WebLLM model config](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts), [npm @wllama/wllama](https://www.npmjs.com/package/@wllama/wllama), [wllama README](https://github.com/ngxson/wllama)
- Browsers and hosting: [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [Chrome: cache AI models in the browser](https://developer.chrome.com/docs/ai/cache-models), [GitHub large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github), [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits); device detection sources are in `2026-11-11-embedding-models.md`
- Leads only, not primary: [LlamaWeb, arXiv 2605.20706](https://arxiv.org/abs/2605.20706) (abstract read), [report that WebGPU feature detection did not predict small LLM runs on phones](https://hackernews-dynamic.seasondane.workers.dev/news/48624985) (search snippet only)
