# Embedding models for browser-local search, by device

Research record, 2026-11-11. Question: which embedding models should a small static site (47 pages, 459 passages in the clean index) use for semantic search that runs only in the visitor's browser, across device capabilities, and what is the fallback ladder. Passage vectors are built in Node at deploy time; the browser embeds only the query, with the same model.

Every fact below was read from a primary source on 2026-11-11 (model card, Hugging Face file listing through its API, npm registry, MDN browser compatibility data, official docs). Sizes are listed file sizes in MB (10^6 bytes). Benchmark scores are copied from the publisher's card and are general benchmarks, not this site; cards use different benchmark versions, so compare within a column only with care. Anything I could not confirm is in "Not verified" at the end.

## Summary

- **The query is short, so the browser needs much less model than the build does.** Embedding a ten word query through a 6 layer, 384 wide encoder is a small job even on single threaded WebAssembly. WebGPU is not needed for the small tier, and a weak WebGPU device should simply use the CPU path. (Judgment; no published single thread latency for query length inputs was found, so this must be measured.)
- **The small CPU tier has moved on from all-MiniLM-L6-v2.** MongoDB's `mdbr-leaf-ir` is the same size (23 MB at 8 bit, 23M parameters, a MiniLM-sized network) and its card reports BEIR nDCG@10 53.55 against 41.95 for MiniLM-L6-v2 in the same table. It ships an official ONNX export tagged for Transformers.js.
- **`mdbr-leaf-ir` is aligned with a larger model.** Its card says it was distilled from `snowflake-arctic-embed-m-v1.5` and is compatible with it: documents can be embedded with the larger model and queries with the small one ("asym", 54.03 on BEIR). That is exactly this site's shape: the build can afford the larger model, the browser runs the small one. One passage vector file could then serve both a 23 MB query model for everyone and a 110 MB query model for visitors who opt in.
- **Static tables (Model2Vec potion) are the only option small enough to load without asking**, at a few MB if quantized and reduced, with no runtime at all. They are well behind on general retrieval benchmarks (MTEB retrieval 31.11 for potion-base-8M, 35.06 for potion-retrieval-32M, against 42.92 for MiniLM-L6-v2 on the same Model2Vec table).
- **EmbeddingGemma 2 supports truncated embeddings at 512, 256 and 128 dimensions** (768 native), per its card, with English MTEB v2 mean 68.46 at 768, 67.78 at 256 and 65.68 at 128. Its text download is about 207 MB at q4. It is the best fit if the image experiment happens, because text and images share one space.
- **LiquidAI publishes retrieval models (LFM2.5-Embedding-350M, dense, 1024 dimensions; LFM2.5-ColBERT-350M, late interaction) but none runs in a browser today**: no official ONNX export, only a community int8 ONNX of 356 MB with 16 downloads, and an "other" license (LFM Open License v1.0). Late interaction also needs one vector per token, which this design does not have.
- **A file over 100 MiB cannot be self-hosted on this site's GitHub Pages**, because the deploy pushes to the `gh-pages` branch and GitHub blocks files larger than 100 MiB. EmbeddingGemma 2's q4 text weights (174 MB in one file) would have to load from huggingface.co, a third-party request. The 23 MB and smaller models can be self-hosted.

## A. Candidates

### A1. No neural network at query time: static embedding tables

A query is tokenized, each token's row is looked up and the rows are averaged. No ONNX runtime is needed; a tokenizer and a typed array suffice.

| Publisher | Id | Params | Dims | Matryoshka | Max input | Prefixes | License | Files | ONNX (by) | Transformers.js | Retrieval score |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Minish Lab | `minishlab/potion-base-2M` | about 1.9M (29,528 tokens x 64) | 64 | No (PCA) | No limit (static) | None | MIT | 7.6 MB fp32 safetensors or ONNX, tokenizer 0.7 MB | Yes (Minish Lab) | Not tagged | Not listed in the Model2Vec results table |
| Minish Lab | `minishlab/potion-base-4M` | about 3.8M | 128 | No (PCA) | No limit | None | MIT | 15.1 MB fp32 | Yes (Minish Lab) | Not tagged | Not listed |
| Minish Lab | `minishlab/potion-base-8M` | about 7.6M | 256 | No (PCA) | No limit | None | MIT | 30.2 MB fp32 | Yes (Minish Lab); also `minishlab/potion-base-8m-onnx` (2026-08-27), 30.3 MB | Not tagged; the ONNX repo's card says it runs "with onnxruntime or transformers.js" | MTEB retrieval 31.11 (Model2Vec results) |
| Minish Lab | `minishlab/potion-base-32M` | about 32M | 512 | No (PCA) | No limit | None | MIT | 129.2 MB fp32 | Yes | Not tagged | MTEB retrieval 32.67 |
| Minish Lab | `minishlab/potion-retrieval-32M` | about 32M | 512 | Trained with MatryoshkaLoss per its training script | No limit | None | MIT | 129.2 MB fp32; also `potion-retrieval-32m-onnx` (2026-08-27) | Yes (Minish Lab) | Not tagged | MTEB retrieval 35.06 |
| Sentence Transformers | `sentence-transformers/static-retrieval-mrl-en-v1` | about 31M | 1024 | Yes (MatryoshkaLoss) | No limit | None | Apache 2.0 | 125.0 MB fp32, 62.5 MB fp16, 31.3 MB int8 ONNX | Yes (Sentence Transformers) | Not tagged | MTEB retrieval 34.95 (Model2Vec results) |

Derived sizes (arithmetic, not files that exist): the potion tokenizer has 29,528 tokens. At int8 that is 29,528 x 256 = 7.6 MB for potion-base-8M at 256 dimensions and 3.8 MB at 128 dimensions. That matches the "about 4 MB" another personal blog reports for potion-base-8M quantized to int8 at 128 dimensions. Producing it needs Model2Vec's own distill and quantize step; it is not a published file.

Nothing newer than the potion retrieval model was found from Minish Lab for English retrieval; `potion-code-16M-v2` (2026-07-04) targets code.

What a static table cannot do (from how it works, not a benchmark): word order and negation are lost ("models that do not need a GPU" averages like "models that need a GPU"), and a word is the same vector in every context.

### A2. Small models on the CPU through WebAssembly (about 50 MB or less quantized)

All are BERT-style encoders unless noted. "q8" is Transformers.js's name for the `model_quantized.onnx` file (8 bit dynamic quantization), its default on WebAssembly.

| Publisher | Id (ONNX source) | Params | Dims | Matryoshka | Max input | Query prefix | License | q8 | q4 | fp16 | fp32 | Tokenizer | Transformers.js | Retrieval score (card) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sentence Transformers | `sentence-transformers/all-MiniLM-L6-v2` (`Xenova/all-MiniLM-L6-v2`) | 22M | 384 | No | 256 word pieces | None | Apache 2.0 | 23.0 MB | 54.6 MB | 45.3 MB | 90.4 MB | 0.7 MB | Yes (Xenova) | MTEB retrieval 42.92 (Model2Vec table); BEIR 41.95 (leaf card table) |
| MongoDB | `MongoDB/mdbr-leaf-ir` (own `onnx/`, external data files) | 23M | 768 (384 encoder plus a dense layer) | Yes, card shows 256 | 512 | `Represent this sentence for searching relevant passages: ` | Apache 2.0 | 23.2 MB | 54.7 MB | 45.8 MB | 91.5 MB | 0.7 MB | Yes, tagged, card has a Transformers.js example using `AutoModel` and `sentence_embedding` | BEIR nDCG@10 53.55; 54.03 in asymmetric mode with arctic-embed-m-v1.5 documents |
| Snowflake | `Snowflake/snowflake-arctic-embed-xs` (own `onnx/`) | 22M | 384 | No | 512 | Same as above | Apache 2.0 | 23.0 MB | 54.6 MB | 45.3 MB | 90.4 MB | 0.7 MB | Yes, tagged | MTEB retrieval nDCG@10 50.15 |
| Mixedbread | `mixedbread-ai/mxbai-embed-xsmall-v1` (own `onnx/`) | about 24M | 384 | Yes (card) | 4096 (card and config) | None in config | Apache 2.0 | 24.4 MB | 60.2 MB | 48.1 MB | 96.0 MB | 0.7 MB | Not tagged; standard `onnx/` file names | Not stated in the card text (the performance section is an image) |
| BAAI | `BAAI/bge-small-en-v1.5` (`Xenova/bge-small-en-v1.5`) | 33M | 384 | No | 512 | Same as arctic | MIT | 34.0 MB | 61.5 MB | 66.7 MB | 133.1 MB | 0.7 MB | Yes (Xenova) | BEIR 51.65 (leaf table); MTEB v2 retrieval 53.9 (Granite table) |
| Snowflake | `Snowflake/snowflake-arctic-embed-s` | 33M | 384 | No | 512 | Same as arctic | Apache 2.0 | 34.0 MB | 61.4 MB | 66.7 MB | 133.1 MB | 0.7 MB | Yes, tagged | MTEB retrieval 51.98 |
| IBM | `ibm-granite/granite-embedding-30m-english` (`onnx-community/...-ONNX`) | 30M | 384 | No | 512 | None | Apache 2.0 | 30.4 MB | 84.9 MB | 60.4 MB | 120.7 MB | 2.0 MB | Yes (onnx-community) | BEIR (15) 49.1 |
| IBM | `ibm-granite/granite-embedding-small-english-r2` (`onnx-community/...-ONNX`) | 47M | 384 | Not stated | 8192 | None | Apache 2.0 | 52.5 MB | 99.5 MB | 97.6 MB | 195.0 MB | 2.1 MB | Yes (onnx-community) | BEIR (15) 50.9 |
| Alibaba | `thenlper/gte-small` (`Xenova/gte-small`) | 33M | 384 | No | 512 | None | MIT | 34.0 MB | 61.5 MB | 66.7 MB | 133.1 MB | 0.7 MB | Yes (Xenova) | Not checked |
| Microsoft | `intfloat/e5-small-v2` (`Xenova/e5-small-v2`) | 33M | 384 | No | 512 | `query: ` and `passage: ` | MIT | 34.0 MB | 61.5 MB | 66.7 MB | 133.1 MB | 0.7 MB | Yes (Xenova) | BEIR 49.04 (leaf table) |
| Jina | `jinaai/jina-embeddings-v2-small-en` | 33M | 512 | No | 8192 | None | Apache 2.0 | No quantized ONNX (129.8 MB fp32 only) | | | | 0.7 MB | Not tagged | Not checked |

Nomic: `nomic-ai/nomic-embed-text-v1.5` is 137M parameters, 137.3 MB at q8, so it belongs with A3. The smallest current Alibaba GTE retrieval model, `gte-modernbert-base`, is 150 MB at q8 (A3).

### A3. Models for WebGPU (or a patient CPU), under about 300 MB

| Publisher | Id (ONNX source) | Params | Dims | Matryoshka | Max input | Prefixes | License | Download for text retrieval | Transformers.js | Score (card) |
|---|---|---|---|---|---|---|---|---|---|---|
| Google DeepMind | `google/embeddinggemma-2` (`onnx-community/embeddinggemma-2-ONNX`, official per the card) | 270M text model (740M with vision 170M and audio 300M) | 768 | Yes: 512, 256, 128 | 8,192 tokens | Query `task: search result \| query: `; document `title: {title} \| text: {content}` (`title: none` without a title) | Apache 2.0 | q4 174.5 MB plus 32.2 MB tokenizer = about 207 MB; q4f16 157.4 MB (about 190 MB); q8 314.2 MB (about 346 MB); fp16 542.5 MB | Yes, from 4.3.1. Text only needs `config.vision_config = config.audio_config = null` before `AutoModel.from_pretrained`; the `feature-extraction` pipeline loads every encoder | English MTEB v2 mean(task) 68.46 at 768, 68.41 at 512, 67.78 at 256, 65.68 at 128. Card: q4 text worst-case cosine to fp32 0.988; q8 0.9997. Card recommends q4 on WebGPU |
| Google DeepMind | `google/embeddinggemma-300m` (gated; `onnx-community/embeddinggemma-300m-ONNX` not gated) | 300M | 768 | Yes: 512, 256, 128 | 2,048 tokens | Same family of prefixes | Gemma license | q4 197.2 MB plus 20.3 MB tokenizer = about 218 MB; q8 309.5 MB | Yes | ONNX card: activations "do not support fp16 or its derivatives", so fp32, q8 or q4 only |
| Snowflake | `Snowflake/snowflake-arctic-embed-m-v1.5` (own `onnx/`) | 109M | 768 | Yes, 256 (card: 54.2 at 256) | 512 | arctic query prefix | Apache 2.0 | q8 110.1 MB, q4 149.3 MB, fp16 218.2 MB, plus 0.7 MB tokenizer | Yes, tagged | MTEB retrieval nDCG@10 55.14. The teacher `mdbr-leaf-ir` is aligned with |
| IBM | `ibm-granite/granite-embedding-english-r2` (`onnx-community/...-ONNX`) | 149M | 768 | Not stated | 8192 | None | Apache 2.0 | q8 158.7 MB, q4f16 144.1 MB, plus 2.1 MB | ONNX repo not tagged for Transformers.js (ModernBERT) | BEIR (15) 53.1 |
| Alibaba | `Alibaba-NLP/gte-modernbert-base` (own `onnx/`) | 149M | 768 | Not checked | 8192 | Not checked | Apache 2.0 | q8 150.2 MB, q4f16 139.8 MB, plus 3.6 MB | Yes, tagged | Not checked |
| Nomic | `nomic-ai/nomic-embed-text-v1.5` (own `onnx/`) | 137M | 768 | Yes | 8192 | `search_query: ` and `search_document: ` (not rechecked today) | Apache 2.0 | q8 137.3 MB, q4f16 111.1 MB, plus 0.7 MB | Yes, tagged | MTEB retrieval 50.8 at 256 dimensions (from Snowflake's comparison table) |
| Alibaba Qwen | `Qwen/Qwen3-Embedding-0.6B` (`onnx-community/...-ONNX`) | 0.6B | 1024 | Yes (not rechecked) | 32K (not rechecked) | Instruction prefix | Apache 2.0 | q4f16 567.5 MB, q8 613.5 MB | Yes | Over the 300 MB budget |
| LiquidAI | `LiquidAI/LFM2.5-Embedding-350M` | about 354M | 1024 (CLS) | Not stated | 512 tokens | `query: ` and `document: ` | LFM Open License v1.0 | 709 MB safetensors; no official ONNX. Community: `dsaad68/LFM2.5-Embedding-350M-ONNX-int8` 356.2 MB (16 downloads), GGUF, MLX, LiteRT, ExecuTorch | No | NanoBEIR multilingual extended nDCG@10: 0.644 English, 0.577 average (Qwen3-Embedding-0.6B 0.649 and 0.556 in the same table) |
| LiquidAI | `LiquidAI/LFM2.5-ColBERT-350M` (also `LFM2-ColBERT-350M`) | about 353M | 128 per token, MaxSim | n/a | 512 document, 32 query | Handled by PyLate | LFM Open License v1.0 | 706.7 MB safetensors; no ONNX for 2.5 (a community fp16 ONNX exists for LFM2-ColBERT) | No | 0.687 English, 0.605 average on the same NanoBEIR table |

LiquidAI's browser-ready releases today are its generation models (`LFM2.5-350M-ONNX`, `LFM2.5-1.2B-Instruct-ONNX`, `LFM2.5-230M-ONNX`), relevant only to generated answers.

### A4. Image and text in one space (stage 5 experiment)

| Model (ONNX source) | Text encoder download | Image encoder download | Dims | License | Note |
|---|---|---|---|---|---|
| EmbeddingGemma 2 (`onnx-community/embeddinggemma-2-ONNX`) | about 207 MB q4 (the same text model as A3) | 109.2 MB q4, 97.8 MB q4f16, 195.4 MB q8 | 768 (MRL down to 128; card: 128 "degrades multimodal quality substantially") | Apache 2.0 | One model for text search and figures; MIEB lite 65.67. The image encoder runs only at build time, so visitors never download it unless images are embedded in the browser |
| MobileCLIP S0 (`Xenova/mobileclip_s0`) | 42.8 MB q8 | 11.8 MB q8 | 512 | Apple AMLR (`apple-amlr` on Apple's repo; "other" on the Xenova copy) | Apple card: zero-shot ImageNet 67.8% |
| CLIP ViT-B/32 (`Xenova/clip-vit-base-patch32`) | 64.5 MB q8 | 89.1 MB q8 | 512 | MIT | The plan's earlier alternative |
| SigLIP base 224 (`Xenova/siglip-base-patch16-224`) | 111.5 MB q8 | 99.5 MB q8 | 768 | Not tagged on the Xenova repo | |
| Jina CLIP v2 (`jinaai/jina-clip-v2`) | 874 MB q8 combined | | 1024 | CC BY-NC 4.0 | Too large, non-commercial |

For figure search the browser only embeds the text query, as for passages. CLIP-style text towers are trained on captions, not passages, so they are a poor general text retriever; a separate figure index with its own small text tower (MobileCLIP S0, 43 MB) is the cheap path, and EmbeddingGemma 2 is the one-model path. Neither has been tried.

## B. Device capability in browsers

### Where WebGPU is available (MDN browser compatibility data and Chrome's WebGPU overview)

| Browser | WebGPU | Notes |
|---|---|---|
| Chrome desktop | 113 on ChromeOS, macOS, Windows; 144 adds Linux | Linux on Intel Gen12+ GPUs only (MDN note) |
| Edge | Mirrors Chrome | |
| Chrome Android | 121 | Android 12 and later on Qualcomm and ARM GPUs (Chrome docs) |
| Safari macOS and iOS | 26 | |
| Firefox desktop | 141 on Windows; 145 on macOS Tahoe on Apple silicon; 147 on older macOS on Apple silicon | Not on Intel Macs, not on Linux, not in service workers (MDN notes) |
| Firefox Android | No | |

The Transformers.js WebGPU guide (checked earlier today for the plan) puts global support at about 85% as of March 2026 and calls it experimental outside Chromium.

### What a page can detect

- `navigator.gpu` exists. This is all Transformers.js 4.3.2 checks for its `IS_WEBGPU_AVAILABLE` flag (read in the bundle), so it is not a capability check.
- `await navigator.gpu.requestAdapter()` returns an adapter or `null`. A page should treat `null` as no WebGPU.
- `adapter.info.isFallbackAdapter`: a software adapter (Chrome 136, Firefox 141, Safari 26). Treat as no WebGPU.
- `adapter.features.has("shader-f16")`: needed for `fp16` and `q4f16` weights. Transformers.js checks it only when `dtype` is exactly `fp16` (bundle code), so a page choosing `q4f16` must check it itself, or use `q4` (fp32 activations), which does not need it.
- `adapter.limits.maxBufferSize` and `maxStorageBufferBindingSize`: every adapter guarantees at least 256 MiB and 128 MiB (MDN defaults). They say little about whether a 200 MB model will run; one report found an iPhone exposing large limits that still could not finish a small model.
- `navigator.deviceMemory`: Chromium only (Chrome 63; not Firefox or Safari), HTTPS only, rounded to a power of two and clamped. Absent means unknown, not small.
- `navigator.storage.estimate()`: quota and usage (Chrome 61, Firefox 57, Safari 17). Useful to refuse a download that will not fit the cache.
- A test run: embed a fixed probe string and compare it with the probe vector the build stored in the manifest, and time it. This is the only direct measure of both correctness and speed.

### What a page cannot know

- Free GPU memory, or how much memory the tab may use before the OS kills it.
- Whether iOS Safari will reload the page under memory pressure. WebKit bug reports describe pages being terminated and reloaded with no error reaching JavaScript. A page can only notice afterwards (for example a flag set before loading and cleared after success).

### Published measurements (thin)

- **Phone model size limits:** I found no published limit. Reports of iOS tabs dying near 2 GB are old forum posts about WebGL. Evidence is thin; treat anything above about 200 MB on a phone as unproven.
- **Single threaded WebAssembly speed for small embedding models:** no trustworthy published number for query-length input with one thread. The Transformers.js WebGPU embedding benchmark discussions report about 500 ms for batch size 1 on WebAssembly with sequence length 512 and no quantization, a very different setup from a ten word query at 8 bit. Measure it.

## C. Runtime

- **Transformers.js** (`@huggingface/transformers`) latest stable is 4.3.2 (npm, 2026-10-27); a 4.4.0-next.0 prerelease appeared 2026-10-30. EmbeddingGemma 2 needs 4.3.1 or later.
- **Dependencies of 4.3.2:** `onnxruntime-web` 1.31.0-dev.20260914 in the browser and `onnxruntime-node` 1.30.0 in Node (npm registry). The same weights run on different builds of ONNX Runtime on each side.
- **Runtime size:** `transformers.web.min.js` is 0.46 MB (108 KB brotli from jsDelivr). The WebAssembly binary it loads by default is `ort-wasm-simd-threaded.asyncify.wasm`, 26.9 MB (4.70 MB brotli), with `ort-wasm-simd-threaded.jsep.wasm` at 28.4 MB (4.65 MB brotli). By default Transformers.js fetches these from `cdn.jsdelivr.net/npm/onnxruntime-web@<version>/dist/` unless `env.backends.onnx.wasm.wasmPaths` is set (bundle code). Self-hosting keeps every request on the site.
- **Backend choice:** the device is what the caller passes (`"wasm"`, `"webgpu"`); default dtype is `q8` on `wasm` and `fp32` elsewhere (bundle code). I found no automatic fall back from WebGPU to WebAssembly in the bundle, so the page must catch a failed WebGPU load and retry on `wasm` itself.
- **Threads:** WebAssembly threads need cross-origin isolation, which GitHub Pages cannot set, so the browser runs single threaded (checked earlier today).
- **Static tables** need none of this: a tokenizer (Transformers.js `AutoTokenizer` alone, or a small WordPiece implementation) and an `Int8Array` or `Float32Array`.
- **Node parity:** the same library and the same ONNX files run in Node (`device: "cpu"`). Differences come from quantization and from kernel differences between `onnxruntime-node` and the WebAssembly build. Use the same dtype on both sides, and store a probe vector in the manifest so the browser can check its own output against the build's.
- **Hosting:** the deploy (`quarto-publish.yml`) pushes `_site/` to the `gh-pages` branch. GitHub blocks files larger than 100 MiB and warns above 50 MiB; a published Pages site may be up to 1 GB, with a soft bandwidth limit of 100 GB per month. So `mdbr-leaf-ir` q8 (23.2 MB), the static tables and the runtime (26.9 MB WebAssembly file) can be served from the site itself, while `arctic-embed-m-v1.5` q8 (110.1 MB, about 105 MiB) and EmbeddingGemma 2 q4 (174.5 MB in one file) cannot, and would load from huggingface.co.

## Recommendation

Labelled as proposed. The parts that rest on published numbers are the sizes, licenses, dimensions, benchmark scores and browser support; the ladder itself, the expectation that the CPU model is fast enough and that the bigger tier adds little on this site, are my judgment until stage 2 measures them.

### The ladder

| Rung | Condition (how the page detects it) | Model | Download | Loads | Why |
|---|---|---|---|---|---|
| 0. Keyword | Always; also when anything below is declined, unsupported or fails | None: BM25 | The index only (346,530 bytes today) | Automatically | Works everywhere, instantly; the permanent fallback |
| 1. Meaning, any device | Any browser with WebAssembly; WebGPU not needed and not used | Whichever stage 2 picks of: a static table (potion-base-8M, int8, 128 or 256 dims) or `mdbr-leaf-ir` q8 | Static: about 4 to 8 MB, no runtime. leaf-ir: 23.2 MB plus 0.7 MB tokenizer plus about 4.8 MB of runtime over the wire | Static: on first focus of the search box, without asking. leaf-ir: opt-in, size shown, then cached and remembered | One query on the CPU is cheap; this rung serves phones, weak GPUs and no-GPU devices alike |
| 2. Weak WebGPU | `navigator.gpu` present but `requestAdapter()` returns `null`, the adapter is a fallback adapter, the test run fails or is slower than the CPU path, or a previous load did not finish | Same as rung 1, on WebAssembly | Same as rung 1 | Same as rung 1 | A weak GPU is not better than the CPU for a 23 MB model; no separate weak-GPU model is needed |
| 3. Capable WebGPU, visitor asks | Adapter present, not a fallback, `storage.estimate()` leaves room for three times the download, and a probe embedding matches the build's probe vector within a set tolerance in under a set time | Either `snowflake-arctic-embed-m-v1.5` as a stronger query encoder over the same passage vectors as rung 1 (if leaf-ir asym wins), or EmbeddingGemma 2 text q4 at 256 dims with its own vector file | arctic-m: 110 MB q8 (149 MB q4 for WebGPU). EmbeddingGemma 2: about 207 MB, from huggingface.co | Only when the visitor asks, with the size shown | Built only if stage 2 shows it fixes queries rung 1 misses |
| Declined | The visitor says no, or has said no before | None | Nothing | Never | Keyword search stays complete on its own |

Detection is by measurement, never by browser name. `navigator.deviceMemory` is used only to warn ("this device reports 2 GB"), never to decide, since only Chromium reports it.

### Direct answers

1. **Weaker WebGPU (phone, integrated GPU, missing features, low memory):** fall back to the same small CPU model as everyone else (rung 1). For a query-only encoder of about 23 MB, WebGPU buys little and adds failure modes. A capable WebGPU tier only exists for an opt-in larger model.
2. **No WebGPU at all:** BM25 plus a very small model, not BM25 only. The small model runs on single threaded WebAssembly (or needs no runtime at all if it is a static table). Whether it earns its place is the stage 2 measurement; BM25 alone is the result if it does not.
3. **Labs publishing small, browser-usable embedding models:** MongoDB (`mdbr-leaf-ir`, best fit), Snowflake (`arctic-embed-xs`, `-s`, `-m-v1.5`), Mixedbread (`mxbai-embed-xsmall-v1`), BAAI (`bge-small-en-v1.5`), IBM (`granite-embedding-30m-english`, `-small-english-r2`), Alibaba (`gte-small`, `gte-modernbert-base`), Nomic (`nomic-embed-text-v1.5`), Google DeepMind (EmbeddingGemma and EmbeddingGemma 2), Minish Lab and Sentence Transformers (static tables), Apple (MobileCLIP for images). LiquidAI's embedding and ColBERT models are good on its own published multilingual table but have no official browser export and are 350M parameters; they are not a browser candidate today. Best fits here: `mdbr-leaf-ir` (CPU tier), potion-base-8M (no-runtime tier), and EmbeddingGemma 2 or `arctic-embed-m-v1.5` (opt-in tier).
4. **Best overall:** ship BM25 for everyone, then one CPU embedding model chosen by the 40 queries, fused with BM25 by reciprocal rank fusion, with no WebGPU code at all. Add the WebGPU tier only if the offline comparison shows a heavier model fixes queries the small one misses.

### The minimal version to ship first

Two rungs: BM25 always, plus the one CPU model stage 2 picks, on WebAssembly or as a static table, for every browser. No capability check beyond "did the model load and does the probe vector match". If the winner is a static table of a few MB, it loads on first use of the search box; if it is leaf-ir, it is a button that shows "about 29 MB".

### What would change my mind (on the 40 queries)

- **A static table matches leaf-ir per query** (no answerable query that leaf-ir gets in the top 5 and the table misses, or one at most, which is noise): ship the static table, loaded automatically, and drop the runtime.
- **Neither beats BM25 by the adoption rule** (fixes queries BM25 misses without breaking ones it gets): ship BM25 only and say so in the post.
- **leaf-ir asym (arctic-m documents) beats leaf-ir alone:** build passages with arctic-m-v1.5; then rung 3 can be arctic-m as a query encoder with no second vector file.
- **EmbeddingGemma 2 or arctic-m as query encoder fixes several queries leaf-ir misses (paraphrase, person, tool types) and breaks none:** build rung 3. If it fixes one or two, it is not worth 110 to 207 MB.
- **Phone measurements:** if the chosen CPU model takes more than a few hundred ms per query on a mid-range phone, prefer the static table there.

## Shortlist for the offline comparison in Node

Each configuration is scored alone and fused with BM25 (reciprocal rank fusion), against BM25 alone as the baseline. Use the dtype the browser would use, on both sides.

| # | Configuration | Query side | Passage side | Dims | Notes for Node |
|---|---|---|---|---|---|
| 1 | Static, small | `minishlab/potion-base-8M` fp32 | same | 256; also PCA to 128 and int8 as a sub-run | Not a Transformers.js model type. Load `model.safetensors` and the tokenizer directly (lookup and mean, then normalize), or run `minishlab/potion-base-8m-onnx` with `onnxruntime-node`. The int8 at 128 sub-run needs Model2Vec's quantize step in Python or a reimplementation |
| 2 | Static, retrieval-tuned | `minishlab/potion-retrieval-32M` fp32 | same | 512 (and 256 by truncation) | Same as 1; 129 MB fp32 is only a quality ceiling for static tables, it would need int8 and fewer dims to ship |
| 3 | Baseline transformer | `Xenova/all-MiniLM-L6-v2` q8 | same | 384 | Straightforward; truncates at 256 word pieces, so long passages lose their tail |
| 4 | Small CPU candidate | `MongoDB/mdbr-leaf-ir` q8 with the query prefix | same | 768, and 256 truncated plus renormalized | Use `AutoModel` and read `sentence_embedding` (the dense layer is in the graph); the plain `feature-extraction` pipeline pooling would skip it. External data files (`model_quantized.onnx_data`) |
| 5 | Asymmetric | `MongoDB/mdbr-leaf-ir` q8 | `Snowflake/snowflake-arctic-embed-m-v1.5` q8 (and fp32 as a sub-run) | 768 | Sub-run: arctic-m-v1.5 q8 on both sides, which is the rung 3 candidate with no new vector file. No prefix on documents for either |
| 6 | Opt-in tier | `onnx-community/embeddinggemma-2-ONNX` text model q4 with `task: search result \| query: ` | same, `title: {page title} \| text: {passage}` | 768, and 256 truncated plus renormalized | Needs Transformers.js 4.3.1 or later and `config.vision_config = config.audio_config = null`; slowest to build (270M parameters, 459 passages on a CPU), still minutes, not hours (expectation) |

Report per type and per query wins and losses between configurations 4 and 1, 4 and 3, 5 and 4, 6 and 4.

## Not verified

- Single threaded WebAssembly query latency for any of these models, on a laptop or a phone. No usable published figure.
- Any phone memory or model size limit for WebGPU or WebAssembly in a tab.
- That `mxbai-embed-xsmall-v1` loads in Transformers.js (not tagged), and its retrieval score (not in the card's text).
- That `onnx-community/granite-embedding-english-r2-ONNX` loads in Transformers.js (not tagged).
- That `minishlab/potion-base-8m-onnx` loads in Transformers.js as its card claims.
- That `mdbr-leaf-ir` in asymmetric mode beats leaf-ir alone on anything but the card's BEIR average.
- That Transformers.js 4.3.2 has no WebGPU to WebAssembly fall back: read from the bundle, not tested.
- Whether 8 bit (`q8`) graphs run well on the WebGPU backend; the ladder assumes `q4` or `fp16` there and `q8` on WebAssembly, which matches the Transformers.js defaults but was not tested.
- Whether jsDelivr or GitHub Pages compress `.onnx` files in transit; sizes above are file sizes.
- nomic-embed-text-v1.5 prefixes, gte-modernbert-base Matryoshka support and score, Qwen3-Embedding-0.6B dimensions and context: from memory, not rechecked.
- The "about 4 MB" potion int8 figure from another blog was not reproduced; it agrees with the arithmetic above.
- None of the models were downloaded or run.

## Sources (all checked 2026-11-11)

Model files were read through the Hugging Face API (`https://huggingface.co/api/models/<id>/tree/main?recursive=true`) and cards from `https://huggingface.co/<id>/raw/main/README.md`.

- Static: [minishlab/potion-base-8M](https://huggingface.co/minishlab/potion-base-8M), [potion-base-2M](https://huggingface.co/minishlab/potion-base-2M), [potion-base-4M](https://huggingface.co/minishlab/potion-base-4M), [potion-base-32M](https://huggingface.co/minishlab/potion-base-32M), [potion-retrieval-32M](https://huggingface.co/minishlab/potion-retrieval-32M), [potion-base-8m-onnx](https://huggingface.co/minishlab/potion-base-8m-onnx), [potion-retrieval-32m-onnx](https://huggingface.co/minishlab/potion-retrieval-32m-onnx), [Model2Vec results](https://github.com/MinishLab/model2vec/blob/main/results/README.md), [static-retrieval-mrl-en-v1](https://huggingface.co/sentence-transformers/static-retrieval-mrl-en-v1)
- CPU tier: [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2), [MongoDB/mdbr-leaf-ir](https://huggingface.co/MongoDB/mdbr-leaf-ir), [MongoDB/mdbr-leaf-ir-asym](https://huggingface.co/MongoDB/mdbr-leaf-ir-asym), [Snowflake/snowflake-arctic-embed-xs](https://huggingface.co/Snowflake/snowflake-arctic-embed-xs), [snowflake-arctic-embed-s](https://huggingface.co/Snowflake/snowflake-arctic-embed-s), [mixedbread-ai/mxbai-embed-xsmall-v1](https://huggingface.co/mixedbread-ai/mxbai-embed-xsmall-v1), [Xenova/bge-small-en-v1.5](https://huggingface.co/Xenova/bge-small-en-v1.5), [ibm-granite/granite-embedding-30m-english](https://huggingface.co/ibm-granite/granite-embedding-30m-english), [onnx-community/granite-embedding-30m-english-ONNX](https://huggingface.co/onnx-community/granite-embedding-30m-english-ONNX), [ibm-granite/granite-embedding-small-english-r2](https://huggingface.co/ibm-granite/granite-embedding-small-english-r2), [onnx-community/granite-embedding-small-english-r2-ONNX](https://huggingface.co/onnx-community/granite-embedding-small-english-r2-ONNX), [Xenova/gte-small](https://huggingface.co/Xenova/gte-small), [Xenova/e5-small-v2](https://huggingface.co/Xenova/e5-small-v2), [jinaai/jina-embeddings-v2-small-en](https://huggingface.co/jinaai/jina-embeddings-v2-small-en)
- WebGPU tier: [google/embeddinggemma-2](https://huggingface.co/google/embeddinggemma-2), [onnx-community/embeddinggemma-2-ONNX](https://huggingface.co/onnx-community/embeddinggemma-2-ONNX), [onnx-community/embeddinggemma-300m-ONNX](https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX), [Snowflake/snowflake-arctic-embed-m-v1.5](https://huggingface.co/Snowflake/snowflake-arctic-embed-m-v1.5), [onnx-community/granite-embedding-english-r2-ONNX](https://huggingface.co/onnx-community/granite-embedding-english-r2-ONNX), [Alibaba-NLP/gte-modernbert-base](https://huggingface.co/Alibaba-NLP/gte-modernbert-base), [nomic-ai/nomic-embed-text-v1.5](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5), [onnx-community/Qwen3-Embedding-0.6B-ONNX](https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX)
- LiquidAI: [LFM2.5-Embedding-350M](https://huggingface.co/LiquidAI/LFM2.5-Embedding-350M), [LFM2.5-ColBERT-350M](https://huggingface.co/LiquidAI/LFM2.5-ColBERT-350M), [LFM2-ColBERT-350M](https://huggingface.co/LiquidAI/LFM2-ColBERT-350M), [dsaad68/LFM2.5-Embedding-350M-ONNX-int8](https://huggingface.co/dsaad68/LFM2.5-Embedding-350M-ONNX-int8), [litert-community/LFM2.5-Embedding-350M](https://huggingface.co/litert-community/LFM2.5-Embedding-350M), [LFM2.5-350M-ONNX](https://huggingface.co/LiquidAI/LFM2.5-350M-ONNX)
- Images: [Xenova/mobileclip_s0](https://huggingface.co/Xenova/mobileclip_s0), [apple/MobileCLIP-S0](https://huggingface.co/apple/MobileCLIP-S0), [Xenova/clip-vit-base-patch32](https://huggingface.co/Xenova/clip-vit-base-patch32), [Xenova/siglip-base-patch16-224](https://huggingface.co/Xenova/siglip-base-patch16-224), [jinaai/jina-clip-v2](https://huggingface.co/jinaai/jina-clip-v2)
- Browsers: [MDN compat data for GPU](https://github.com/mdn/browser-compat-data/blob/main/api/GPU.json), [Navigator.deviceMemory data](https://github.com/mdn/browser-compat-data/blob/main/api/Navigator.json), [GPUAdapterInfo data](https://github.com/mdn/browser-compat-data/blob/main/api/GPUAdapterInfo.json), [StorageManager data](https://github.com/mdn/browser-compat-data/blob/main/api/StorageManager.json), [Chrome WebGPU overview](https://developer.chrome.com/docs/web-platform/webgpu/overview), [MDN GPUSupportedLimits](https://developer.mozilla.org/en-US/docs/Web/API/GPUSupportedLimits), [MDN deviceMemory](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory)
- Runtime: [npm @huggingface/transformers](https://www.npmjs.com/package/@huggingface/transformers), [npm onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web), [transformers.web.js 4.3.2 on jsDelivr](https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.web.js) (read for backend logic), [Transformers.js WebGPU guide](https://huggingface.co/docs/transformers.js/guides/webgpu), [ONNX Runtime Web flags](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)
- Hosting: [GitHub large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github), [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- Leads only, not primary: [Transformers.js WebGPU embedding benchmark discussion](https://huggingface.co/spaces/Xenova/webgpu-embedding-benchmark/discussions/1), [WebKit bug on pages reloaded under memory pressure](https://bugs.webkit.org/show_bug.cgi?id=300782), [report that WebGPU feature detection did not predict small LLM runs on phones](https://hackernews-dynamic.seasondane.workers.dev/news/48624985)
