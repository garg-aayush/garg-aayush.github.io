# Answer runner

Runs one small language model in real Chromium (Playwright's own build, a Web Worker running Transformers.js 4.3.2, served from localhost with no cross-origin isolation, like GitHub Pages) and writes its answers to questions from supplied passages. Greedy decoding, so a run is repeatable. What was measured with it, and which models work, is in `../feasibility.md`. No site code is involved; nothing here is part of the site build.

## Setup (once)

```bash
cd _devlog/local-search/evals/answers/harness
npm install --ignore-scripts      # Node 24.22.0; installs @huggingface/transformers 4.3.2 and playwright-core 1.64.1
```

The Chromium build comes from the repo's Playwright install (`npx playwright install chromium` at the repo root, Chromium 156). Model files download anonymously from huggingface.co on first use, at the pinned revisions in `models.mjs`, and are kept on disk in `$ANSWER_MODEL_CACHE` (default `~/.cache/local-search-answer-models`, outside the repo). No account or token is needed.

## Run

```bash
node run-answers.mjs --items items.json --model qwen3 --backend webgpu --out out/qwen3-webgpu.jsonl
```

- `--items`: a JSON array of `{ "id": "...", "question": "...", "passages": [{ "title": "...", "text": "..." }] }`. Passages are numbered in the order given. Ids must be unique.
- `--model`: `qwen3`, `granite`, `lfm` or `qwen35` (see `models.mjs` for the repository, pinned revision, quantization and per-model settings).
- `--backend`: `webgpu` or `wasm` (WebAssembly, one thread).
- `--out`: a `.jsonl` file. When every item has an answer, a plain `.json` copy (`{ run, items: [{ id, answer, tokens, ms, stop }] }`) is written next to it.

Other options: `--mode headless|headed|shell`, `--max-new-tokens`, `--max-sentences`, `--repetition-penalty`, `--dtype` (for example `q4` instead of `q4f16`), `--limit N` (first N items), `--fresh-profile` (empty browser cache), `--cache-dir`, `--port`, `--timeout-min` (give up on one load or answer, default 20), `--chromium-flags`, `--force`, `--no-warmup`. `node run-answers.mjs --help` lists them.

Run models one at a time on a quiet machine if the timings matter; the answers do not depend on the load.

### Output (JSONL)

1. One `run` line: the identity of the run (model, repository, pinned revision, quantization, backend, hashes of the settings, the prompt file and the items file), the Chromium mode and flags, the prompt (system text, the fixed refusal sentence, hash of `prompt.mjs`), the generation settings, one rendered example of the messages, the environment (versions, machine, adapter and `shader-f16` for WebGPU) and the load facts (time, bytes fetched).
2. One `item` line per question, written as soon as it is done: `id`, `answer` (cut after the second sentence), `tokens`, `ms`, `stop` (`sentences`, `eos` or `length`), `promptTokens`, `ttftMs`, `decodeTokensPerSecond`, `raw` (everything the model generated, before the cut) and `prompt` (the exact text the model saw after the chat template). A failed item has `error` instead.
3. One `end` line: items done, run time, peak resident memory of the browser, bytes fetched.

### Resume

Run the same command again. Items already in the file with an answer are skipped. The run refuses to continue if the model, revision, quantization, backend, settings, prompt file or items file differ from the first line (use another `--out`, or `--force` to start over). Items with an `error` are tried again. After one failed item the model is reloaded once and the item retried; three failures in a row stop the run.

## The prompt

All models get the same prompt, which lives in `prompt.mjs` and nowhere else: a system instruction (answer in at most two sentences, use only the numbered passages, reply with one fixed sentence when they do not contain the answer) and a user turn with the passages (`[1] title`, text) then `Question: ...`. The fixed sentence is `REFUSAL` in the same file: "This site does not seem to cover that." The runner cuts an answer after its second complete sentence and stops generating there. Citations are not requested; add them in `prompt.mjs` if wanted (the prompt hash changes, so old output files will not resume).

## Other scripts

- `measure.mjs --model qwen3 --backend webgpu`: the feasibility measurements (cold load with an empty browser cache, speed on a four passage prompt, three sanity questions, load from the browser cache). Writes `results/<model>-<dtype>-<backend>.json`.
- `probe-gpu.mjs [--mode headless|headed|shell] [--flags none]`: prints the WebGPU adapter the worker sees.
- `data/sanity-items.json`: the three made up test questions.

## Things to know

- WebGPU needs a real adapter with `shader-f16` for q4f16. In this Playwright's Chromium, `--mode headless` (the default) and `headed` give the Metal adapter on this Mac with no flags; `shell` gives only SwiftShader, a software adapter. The runner prints a warning when the adapter is a fallback.
- The browser's cache is keyed by origin, so the runner uses a port derived from the model, quantization and backend, and a profile directory per model, backend and quantization under the cache directory. Change either and the model is downloaded to the browser again (the local disk cache is separate and keeps it from going to huggingface.co again).
- The local server counts the bytes it sends; "bytes fetched" in the output is what the browser asked for, not time on a network.
