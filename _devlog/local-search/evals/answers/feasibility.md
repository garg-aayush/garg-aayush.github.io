# Answer models: do they run in a browser here?

Groundwork for stage 3 of browser-local search (answers from the site's own search results). Question: do the four candidate small language models load and generate in real Chromium on this machine, on WebGPU and on WebAssembly, and what does a reusable runner for the evaluation look like. No site code was changed. The runner and every raw result are in `harness/` (`harness/README.md` explains how to call it, `harness/results/*.json` hold the numbers below).

## Short answer

- All four models load and generate on **WebGPU** (real Apple Metal adapter, `shader-f16` present) at q4f16, the quantization a browser would use. Nothing had to be substituted there.
- On **WebAssembly, single thread**, only **Granite 4.0 350M** and **Qwen3-0.6B** load. **LFM2.5-350M** and **Qwen3.5-0.8B text** fail to load with q4f16, q4 and q8: ONNX Runtime Web's CPU provider has no kernel for `GatherBlockQuantized`, which these exports use for the embedding table. Both are WebGPU only here. This also explains why the similar site marks LFM2.5-350M as WebGPU only.
- WebAssembly generation on one thread is slow: 2.2 to 4.1 tokens per second and 9 to 15 seconds before the first token on a 570 token prompt.
- All four are usable for the evaluation on WebGPU. For a WebAssembly arm of the evaluation only Granite and Qwen3 are.
- Two findings that matter for stage 3 beyond "does it run": Chromium refuses to store a file above about 512 MiB in Cache Storage from a buffer, so Qwen3-0.6B's 570 MB file is downloaded again on every visit with Transformers.js's default caching (see "Things found on the way"); and none of the four models used the fixed refusal sentence in the sanity test.
- Not measured: a phone, any other browser or machine, a real network, cross-origin isolated WebAssembly (threads), and answer quality beyond three questions.

## The machine and the software

- Apple M5 Pro, 15 cores, 24 GB of memory, macOS 27.0.1. The browser and the runner ran on the same machine, with nothing else heavy running (I did not stop background applications).
- Chromium 156.0.8078.4 (Playwright 1.64.1's own build, revision 1248, from the repo's Playwright install). Node 24.22.0 (fetched to a temporary directory outside the repo) runs the runner only; the models run in the browser.
- Transformers.js 4.3.2 with ONNX Runtime Web 1.31.0-dev.20260914-8d85527a0, in a Web Worker, from `dist/transformers.min.js` (587,917 bytes) and `ort-wasm-simd-threaded.asyncify.{mjs,wasm}` (53,057 and 26,861,777 bytes), all served from `localhost` by `harness/server.mjs`. The page has no COOP or COEP headers, so `crossOriginIsolated` is false and WebAssembly runs on one thread, like GitHub Pages.
- Model files: fetched anonymously from huggingface.co (no account, no token, none of the four is gated) into a disk cache outside the repo, then served to the browser by the local server. Pinned revisions below.

## WebGPU adapter and launch flags

What the worker's `navigator.gpu.requestAdapter()` returns in Playwright's Chromium, tried four ways (`harness/probe-gpu.mjs`):

| Mode | Flags | Adapter |
|---|---|---|
| `headless` (full Chromium, new headless, `channel: 'chromium'`) | none | Apple, `metal-3`, `isFallbackAdapter` false, `shader-f16` present |
| `headless` | `--enable-unsafe-webgpu --ignore-gpu-blocklist --enable-features=WebGPU` | the same Metal adapter (plus a few experimental features) |
| `headed` (a window opens) | none | the same Metal adapter, `shader-f16` present |
| `shell` (the old headless build, Playwright's default for `headless: true`) | none | no adapter (`null`) |
| `shell` | the three flags above | SwiftShader, `isFallbackAdapter` true, **no** `shader-f16` |

So: **no flags are needed**; the only requirement is to use the full Chromium (`channel: 'chromium'`) rather than the headless shell. The runner defaults to that (`--mode headless`) and prints a warning if the adapter is a fallback or lacks `shader-f16`. A fallback adapter cannot run q4f16.

Adapter in the working modes: vendor `apple`, architecture `metal-3`, `maxBufferSize` and `maxStorageBufferBindingSize` 4,294,967,292, features include `shader-f16`, `subgroups`, `subgroup-size-control`, `timestamp-query`. `device` and `description` are empty strings. `navigator.hardwareConcurrency` is 15. I did not run the headed mode for the model measurements, only the adapter probe.

## The models and what loaded

Every model was loaded at **q4f16** (the file is `onnx/model_q4f16.onnx`, with `onnx/model_q4f16.onnx_data` for Granite, LFM and Qwen3.5). Revisions are the commit hashes read on 2026-11-12 and are what `harness/models.mjs` pins.

| Model | Repository and pinned revision | q4f16 file(s) | WebGPU | WebAssembly (1 thread) |
|---|---|---|---|---|
| Qwen3-0.6B | `onnx-community/Qwen3-0.6B-ONNX` `58ca03a5e7b354b480b1a82b34bde8dc7b854cc0` | 569,789,750 | loads, generates | loads, generates |
| Granite 4.0 350M | `onnx-community/granite-4.0-350m-ONNX-web` `62fc8f345c8aed0e1a28f856dc7e79b4cdb55cae` | 274,549 + 350,210,048 | loads, generates | loads, generates |
| LFM2.5-350M | `onnx-community/LFM2.5-350M-ONNX` `7dd4999565b0342c381ba90a3d8fc467d6df19c4` | 182,827 + 254,965,760 | loads, generates | **fails to load** |
| Qwen3.5-0.8B text | `onnx-community/Qwen3.5-0.8B-Text-ONNX` `25cdf33f386b487a25f3d743e86442517bdb77ff` | 597,442 + 469,331,968 | loads, generates | **fails to load** |

The WebAssembly failures, exact errors (from `harness/results/lfm-*-wasm.json` and `qwen35-*-wasm.json`):

- q4f16, both models: `Can't create a session. ERROR_CODE: 9, ERROR_MESSAGE: Failed to find kernel for com.microsoft.GatherBlockQuantized(1) (node:'/model/embed_tokens/Gather_Quant' ep:'CPUExecutionProvider'). Kernel not found`
- q4 (LFM 297 MB, Qwen3.5 570 MB) and q8 (LFM 513 MB, Qwen3.5 958 MB), both models: `Can't create a session. ERROR_CODE: 9, ERROR_MESSAGE: Could not find an implementation for GatherBlockQuantized(1) node with name '/model/embed_tokens/Gather_Quant'`
- Not tried: fp16 (LFM 725 MB, Qwen3.5 1.5 GB), which would not be a download worth offering anyway. I did not check whether a newer ONNX Runtime Web adds the kernel.

## Measurements

Prompt for the speed numbers: the system instruction, the same four passages (485 to 553 characters each, so a little under the 600 asked for) and the question "Describe everything these passages say about the weather station." Prompt length is 569 to 581 tokens depending on the tokenizer. Generation was forced to exactly 60 new tokens (greedy) so the rate is steady; the prompt and settings are in `harness/results/*.json`. Time to first token is the time from the end of tokenization to the first generated token, so it includes the prompt prefill. Tokens per second is over the 59 tokens after the first. Medians of three runs on WebGPU; **one run** on WebAssembly (it takes about 40 seconds each; the first generation after load and the run from cache agree within 5 percent).

"Cold" means an empty browser cache and files read from the local server's disk cache: it is a localhost transfer, not network time. "From cache" is a new browser launch on the same profile (same origin, Cache Storage kept). Load time is from the call to the model being ready (tokenizer, files, session creation, including the WebAssembly runtime on a cold run).

### WebGPU

| Model | Loads | Bytes fetched, model files (cold) | Load, cold | Load, from cache (bytes fetched) | First token | Tokens per second | Peak browser memory |
|---|---|---|---|---|---|---|---|
| Qwen3-0.6B | yes | 578,918,293 | 2.4 s | 1.8 s (569,789,751: refetched) | 328 ms (269 to 383) | 127.5 (122.9 to 132.2) | 4.98 GB |
| Granite 4.0 350M | yes | 354,642,712 | 1.5 s | 0.7 s (0) | 142 ms (138 to 150) | 181.8 (175.1 to 193.1) | 3.79 GB |
| LFM2.5-350M | yes | 258,451,788 | 0.8 s | 0.4 s (0) | 72 ms (72 to 73) | 267.0 (256.4 to 298.4) | 2.20 GB |
| Qwen3.5-0.8B text | yes | 489,167,661 | 1.6 s | 0.9 s (0) | 181 ms (180 to 181) | 85.2 (82.3 to 97.3) | 2.89 GB |

### WebAssembly, one thread

| Model | Loads | Bytes fetched, model files (cold) | Load, cold | Load, from cache (bytes fetched) | First token | Tokens per second | Peak browser memory |
|---|---|---|---|---|---|---|---|
| Qwen3-0.6B | yes | 578,918,293 | 2.6 s | 2.1 s (569,789,751: refetched) | 15.0 s | 2.2 | 4.24 GB |
| Granite 4.0 350M | yes | 354,642,712 | 1.6 s | 1.2 s (0) | 8.7 s | 4.1 | 3.42 GB |
| LFM2.5-350M | no: GatherBlockQuantized, see above | | | | | | |
| Qwen3.5-0.8B text | no: GatherBlockQuantized, see above | | | | | | |

Notes on the table:

- Bytes fetched are what the local server sent for the model files during the load (the model, tokenizer and two small config files). Add the runtime on a cold load: the Transformers.js bundle (587,917 bytes) and the WebAssembly runtime (26,914,834 bytes with its loader), 27,502,751 in all, which the browser then keeps (0 bytes on the cached load). The model files fetched do not match the repository's file sizes exactly because of the tokenizer and config files; for Qwen3 the model file is 569,789,750 of the 578,918,293.
- Load times are small because the files come from localhost. The first cold loads of LFM (23.1 s) and Qwen3.5 (41.5 s) also downloaded their files from huggingface.co (258 and 489 MB, about 11 to 12 MB per second on this connection); that is incidental, not a controlled measurement, and I reran the cold phase afterwards with the files on disk to get the numbers above.
- The first generation after a WebGPU load is slower than the median (first token 470, 656, 120 and 235 ms for Qwen3, Granite, LFM and Qwen3.5), which is kernel and buffer setup. The runner does a short warm-up generation before the items so it does not land on question one.
- Memory is the resident set of the browser's process tree read with `ps` twice a second (sum over the browser, GPU, renderer and utility processes), peak over the cold session. It includes the renderer's copy of the weights while they are uploaded, and the Mac's memory is shared with the GPU, so treat it as an upper bound on what the tab needs, and as noisy: the same model's peak differed by up to 0.8 GB between the cold and cached sessions. It is not the GPU's own allocation.
- Prefill speed (prompt tokens over time to first token) is about 1,750 to 2,250 tokens per second for Qwen3, 4,000 for Granite, 8,000 for LFM and 3,200 for Qwen3.5 on WebGPU, and 38 (Qwen3) and 65 (Granite) on WebAssembly.

## Settings for a sane answer

One prompt for all models, in `harness/prompt.mjs`: a system message and a user message with the numbered passages and the question, rendered by each model's own chat template (the rendered text for each model is in `harness/results/<model>-q4f16-webgpu.json`, field `sanity[0].prompt`).

- System message: "You answer questions about a personal website using only the numbered passages from it that the user gives you. Answer in at most two sentences, in plain words, using only facts stated in the passages. Do not add anything from your own knowledge. If the passages do not contain the answer, reply with exactly this sentence and nothing else: This site does not seem to cover that."
- Fixed refusal sentence (suits a personal site, said in the third person like the similar site's "The blog does not seem to cover this."): **This site does not seem to cover that.**
- User message: `Passages:`, then `[n] title` and the text for each passage, then `Question: ...`.
- Chat template: the model's own (`chat_template` in its tokenizer files). Qwen3 and Qwen3.5: `enable_thinking: false`, which makes the template add an empty `<think>\n\n</think>\n\n` after the assistant tag (checked in the rendered prompts). Granite and LFM: the templates have no thinking mode, no extra arguments. The Qwen3.5 template already skips thinking by default.
- Decoding: greedy (`do_sample: false`) for all.
- Repetition penalty: 1.0 (off) for all four. The research file says the similar site turns it off for Qwen3 and LFM2.5 (1.15 stops loops but pushes the model off the passages' words). For Granite and Qwen3.5 there is no evidence either way; I saw no repetition or looping in the sanity answers or in the 60 token forced runs, so off is what the runner uses. `--repetition-penalty` changes it per run.
- Stop conditions: the end-of-sequence token, **two complete sentences** (a `.`, `!` or `?`, plus closing quotes or brackets, followed by whitespace; the answer is cut after the second), or a cap of 100 new tokens (`--max-new-tokens`; the speed runs used 60). A sentence that ends in an abbreviation such as "e.g. " would count as a sentence end; I did not handle that.
- Determinism: the same item gave the same answer in 8 repeats on WebGPU for Granite. Across backends greedy output is not identical (Granite's second sanity answer differs between WebGPU and WebAssembly), because the numerics differ. Compare models on one backend.

## Sanity samples

Three made up questions over the same four neutral passages (a backyard weather station, a sourdough diary and the station's power box; `harness/data/sanity-items.json`). Passage 1 says a reading is saved every ten minutes and also mentions the first version saved one every minute, which is a distractor. Raw outputs, WebGPU, greedy, two sentence stop. The WebAssembly answers for Granite and Qwen3 were the same except where noted. Whether an answer is faithful is my reading of three samples, not an evaluation.

| Model | Answerable: "How often does the weather station save a reading?" (right: every ten minutes) | Partly answered: "Which sensor measures the wind speed and how accurate is it?" (passages name a three cup anemometer, say nothing about accuracy) | Not answered: "Which programming language is the station's firmware written in?" |
|---|---|---|---|
| Qwen3-0.6B | "The weather station saves a reading every minute." | "The wind sensor in the backyard weather station measures wind speed and is accurate." | "The station's firmware is written in a programming language." |
| Granite 4.0 350M | "The weather station saves a reading every minute." | "The wind sensor measures wind speed and is how accurate it is. It is a three cup anemometer fixed to the top of a two-meter wooden mast, which is well above the fence so that the shed does not shelter it." | "The station's firmware is written in Python." |
| LFM2.5-350M | "One" | "The wind sensor measures wind speed." | "Programming language is Rust." |
| Qwen3.5-0.8B text | "The weather station saves a reading every ten minutes." | "The wind sensor is a three-cup anemometer mounted on a wooden mast that spins past a switch to count pulses, making it accurate for measuring wind speed." | "The text does not mention the programming language used for the firmware." |

What this shows, and only this: all four produce fluent short text and none crashes or loops; three of four took the distractor ("every minute") or gave a non-answer on the answerable question; none says anything about accuracy being unstated (Qwen3.5 invents "making it accurate", Qwen3 asserts "is accurate"); on the unanswerable question Granite and LFM made up a language, Qwen3 gave an empty non-answer, and only Qwen3.5 declined, in its own words. **No model used the fixed refusal sentence**, so the evaluation must not count refusals by string match. Three questions cannot rank the models.

## Things found on the way

1. **Cache Storage and large files.** Transformers.js 4.3.2 stores a downloaded file with `Cache.put` from a buffer. In this Chromium, a `Cache.put` of a Uint8Array or a Blob body worked at 350 MB and 520 MB and failed at 570 MB and 700 MB with `UnknownError: Failed to execute 'put' on 'Cache': Unexpected internal error` (raw test in the page). A streamed or fetched `Response` of 570 MB stored fine. Qwen3-0.6B's q4f16 file is one 569,789,750 byte file, so it is not cached: the load logs `Unable to add response to browser cache` and the cached load fetched all 569.8 MB again (table above). The other three (the largest part is 469 MB) are cached and load with 0 bytes. A fix would be a custom cache object passed as `env.customCache` that stores the original streamed response; I did not build or test that. This matters to the plan's "downloads once" claim for Qwen3-0.6B.
2. **Pinning a revision.** Passing `revision` to `from_pretrained` in 4.3.2 builds a cache key that is not a URL, and the tokenizer loader asks about `tokenizer_config.json` at revision `main` whatever revision is passed (a one byte range request). The harness instead sets `env.remotePathTemplate` to `{model}/resolve/<commit>/`, which keeps every request on the pinned commit and caches normally. I read the first part in the library source; I did not test the `revision` option in isolation after switching.
3. **The runtime fetch.** By default 4.3.2 loads its WebAssembly runtime from jsDelivr (`wasmPaths`); the harness points it at the local server, and a site would self-host it (about 27 MB, loaded once and cached; 0 bytes on the cached load).
4. **Browser mode.** See the adapter table: the default headless shell cannot run WebGPU models here.

## The runner

`harness/run-answers.mjs`, full instructions in `harness/README.md`:

```bash
cd _devlog/local-search/evals/answers/harness
npm install --ignore-scripts      # Node 24.22.0
node run-answers.mjs --items items.json --model qwen3 --backend webgpu --out out/qwen3-webgpu.jsonl
```

- Input: a JSON array of `{ id, question, passages: [{ title, text }] }`. Models: `qwen3`, `granite`, `lfm`, `qwen35`. Backends: `webgpu`, `wasm`.
- Output: JSONL, one line per item written as it finishes (`id`, `answer`, `tokens`, `ms`, plus `stop`, `promptTokens`, `ttftMs`, `decodeTokensPerSecond`, `raw` and the exact `prompt`), a first `run` line with the model, pinned revision, quantization, backend, hashes, the prompt (system text and refusal sentence), the settings, the environment (versions, machine, adapter) and the load facts, and a last `end` line with run time, peak memory and bytes. When all items have an answer a `.json` copy `{ run, items: [{ id, answer, tokens, ms, stop }] }` is written next to it.
- Resumable: run the same command again; finished items are skipped, and it refuses to continue if the model, revision, quantization, backend, settings, prompt file or items file changed. Tested by killing a WebAssembly run with `kill -9` after two of three items and rerunning: the third item was added to the same file.
- After a failed item the model is reloaded once and the item retried; three failures in a row stop the run (rerun resumes). One call times out after 20 minutes (`--timeout-min`).
- The prompt, refusal sentence and decoding defaults are in `harness/prompt.mjs`; per model settings, repositories and pinned revisions in `harness/models.mjs`.
- Timings (`ms`, `ttftMs`) are per item and depend on the machine's load; answers do not.

## Which models are usable for the evaluation

- **Usable on WebGPU, q4f16:** Qwen3-0.6B, Granite 4.0 350M, LFM2.5-350M, Qwen3.5-0.8B text. All four loaded, generated and gave repeatable output on this Mac. A run of 45 questions takes seconds to about a minute each.
- **Usable on WebAssembly (one thread), q4f16:** Qwen3-0.6B and Granite 4.0 350M. A question takes about 10 to 60 seconds (10 to 22 seconds for the short answers in the sanity test, more for a 100 token answer), so 45 questions take roughly 10 to 45 minutes per model.
- **Not usable on WebAssembly:** LFM2.5-350M and Qwen3.5-0.8B text, at q4f16, q4 and q8.
- Nothing here says a model is good enough to ship; that is the evaluation's job.

## What I did not do

- A phone, or any device other than this Mac. No Firefox or Safari. No measurement of memory on a phone or of storage quota.
- A real network: file transfers were local, so cold load times exclude download time. The one incidental download rate is above.
- WebAssembly with threads (cross-origin isolation), which GitHub Pages cannot provide anyway.
- Headed mode for the model runs (only for the adapter probe), the other repositories in the research file, or an fp16 export for the two WebAssembly failures.
- More than three questions of quality sampling, and more than three timing runs (one on WebAssembly).

## Commands run

All under Node 24.22.0 from a temporary download outside the repo, in `_devlog/local-search/evals/answers/harness/`, with the model cache at the session scratchpad:

- `npm install --ignore-scripts` (12 packages, 0 vulnerabilities, Transformers.js 4.3.2 and playwright-core 1.64.1).
- `node probe-gpu.mjs --mode shell|headless|headed [--flags none]`: the adapter table.
- `node measure.mjs --model <qwen3|granite|lfm|qwen35> --backend webgpu`, and `--backend wasm` for all four; `--backend wasm --dtype q4` and `--dtype q8` for LFM and Qwen3.5. Results are in `harness/results/`.
- `node run-answers.mjs` on the sanity items for Qwen3 (WebGPU), Granite (WebGPU and WebAssembly, including the `kill -9` resume test), LFM (WebGPU, `--fresh-profile`), and on 24 items (the three, eight times) for Granite on WebGPU to check repeatability.
- Not run: the repo's `quarto render` and npm checks (not asked, no site code changed).
