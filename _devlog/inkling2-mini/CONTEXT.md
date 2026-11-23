# Inkling 2 Mini on an RTX 4090: experiment context

This file is the context for anyone (or any agent session) picking up the blog post `posts/2026-11-23-inkling2-mini-llamacpp/index.qmd`. It records what was run on 2026-11-23, why, what came out and what is still open. Quarto does not render underscore folders, so nothing here is published on the site, but the repository is public: keep real IP addresses, hostnames, network names, keys and tokens out of this folder.

## What is in this folder

| Path | What it is |
|---|---|
| `CONTEXT.md` | This file. |
| `data/results.jsonl` | Every measurement, one JSON object per line (786 rows). Field `phase` names the test and `variant` names the server setup. Local absolute paths were removed from four `test_error` strings; nothing else was changed. |
| `plot_blog.py` | Draws every figure of the post from `data/results.jsonl` into `static/img/blog-2026-11-23/`. |
| `bench/inkling_bench.py` | The benchmark driver. It starts `llama-server` with a given setup, runs a phase and appends rows to `results/results.jsonl`. It only runs on the GPU machine. |
| `bench/followup.py` | Later checks: effort switch against the prompt cache, a deep session at the chosen `-c`, clean concurrency. |
| `bench/problems.py` | The 16 short coding problems and their tests. |

Regenerate the figures (Linux or macOS, needs only `uv`):

```bash
uv run --no-project --with matplotlib python _devlog/inkling2-mini/plot_blog.py
# optional PNG previews
uv run --no-project --with matplotlib python _devlog/inkling2-mini/plot_blog.py --png-dir /tmp/inkling-fig
```

The figures, all in `static/img/blog-2026-11-23/` and all used by the post:

| File | Shows | Data |
|---|---|---|
| `max-context.svg` | Largest context that survived a whole session, four setups. | `stable`, field `stable_ctx` |
| `ttft-vs-context.svg` | Cold time to first token against prompt size, three setups, follow-up turn as a dashed line. | `curve2` |
| `code-speed-vs-context.svg` | Code generation speed against code already in context, three setups. | `codedepth` |
| `effort-vs-time.svg` | Mean seconds per coding problem and problems passed for effort none, low, medium and high. | `coding`, variant `f16_ub512`, seed 1 |
| `agent-session.svg` | Seconds per turn in the 12 turn session on setting 1. | `agentloop`, variant `f16_ub512_dspark`, `keep_reasoning` false |

Colors follow the setup in every figure and were checked against the page background `#161618` with the dataviz palette validator: 16-bit KV `#c05fb5`, 16-bit KV + DSpark `#3987e5`, 8-bit KV `#d95926`, 8-bit KV + DSpark `#199e70`. Ideas not drawn: prompt processing speed against `-ub` (`ubsweep`), speed per request against concurrent requests (`parallel2`), tool call latency by setup (`tools`).

Not copied here, still on the GPU machine under `~/llama.cpp-unsloth/bench/results/`: the `llama-server` logs of every run, `run.log`, the generated answers of the coding problems (`code_runs/`), the tokenized prompt corpus (`corpus_tokens.json`, 2.7 MB, rebuilt from the llama.cpp sources) and a longer fact sheet (`blog_facts.md`). The launch script of the running server is `~/llama.cpp-unsloth/run_inkling.sh`.

## Why the experiment was run

Aayush wanted Inkling 2 Mini as a local coding and tool calling model, served from his RTX 4090 workstation and used from his MacBook in the Unsloth desktop app or OpenCode. The question was: on a 24 GB card, what is the best context length and which server settings give the best latency without giving up accuracy? The model supports a 1M token context, so GPU memory decides how much of it is usable, and three knobs trade context against speed: the KV cache precision, the DSpark draft model and the batch size.

## Setup

- GPU machine: one NVIDIA RTX 4090 (24,564 MiB), driver 570.124.06, Ubuntu 24.04. About 175 MiB was used by the desktop during the runs.
- Client: a MacBook with the Unsloth desktop app (connection type `llama.cpp`, base URL `http://<YOUR_GPU_SERVER_IP>:8080/v1`). Aayush confirmed it works. OpenCode was not tested against this server.
- Model: Inkling 2 Mini from Thinking Machines Lab (released 2026-11-20, Apache 2.0, "26.4B, 3.4B active" sparse mixture of experts, looped transformer, up to 1M context). GGUF files from `unsloth/Inkling-2-Mini-GGUF`: `Inkling-2-Mini-UD-Q4_K_XL.gguf` (17.6 GB) and the DSpark drafter `dspark-Inkling-2-Mini-Q8_0.gguf` (0.4 GB). The vision projector `mmproj-F16.gguf` was downloaded and is not loaded.
- llama.cpp: Unsloth's prebuilt fork release `b12631-mix-acc0843`, asset `linux-x64-cuda12-newer`. The GGUF files in the repo root need this build and it supports DSpark. Upstream llama.cpp supports the model from build b12611 only with the files in the repo's `Mainline_Support` folder and has no DSpark yet. Only the Unsloth build was tested.
- Sampling: temperature 1.0, top-p 1.0, top-k 0, min-p 0.0 (from Unsloth's guide for this model).
- Thinking effort: the model's own default is high. The chat template accepts none, minimal, low, medium, high, xhigh and max. The server accepts `"reasoning_effort"` at the top level of a request and `--reasoning-effort` as the default.

The download commands and the full server command are in the post.

## The four setups (field `variant`)

| `variant` | KV cache | DSpark | Name in the figures |
|---|---|---|---|
| `f16_ub512` | 16-bit (llama.cpp default) | off | 16-bit KV |
| `f16_ub512_dspark` | 16-bit | on | 16-bit KV + DSpark |
| `q8_ub512` | 8-bit (`--cache-type-k q8_0 --cache-type-v q8_0`) | off | 8-bit KV |
| `q8_ub512_dspark` | 8-bit | on | 8-bit KV + DSpark |

All use `-ub 512 -ngl 99 -fa on --parallel 1 --jinja`. Other variants in the data (`f16_ub2048`, `f16_ub128`, `f16_ub512_mmproj`, `f16_ub512_nothink`) are side checks.

## What each test is and why it was run

All numbers are single runs. Tokens are llama.cpp tokens. The prompts are real C++ source (llama.cpp's own `src` and `common` files).

| `phase` | Rows | What it measures | Why |
|---|---|---|---|
| `ceiling` | 6 | Largest `-c` at which one nearly full prompt fits. | First estimate of the context limit per setup. |
| `stable` | 4 | Largest `-c` at which a whole scripted session (cold prompts up to nearly the full context, each with a follow-up turn) finished without running out of GPU memory, on a 16,384 token grid. | The single prompt limit was not usable: the server ran out of memory later in the session. This is the number the post calls the context that survives a session. |
| `ubsweep` | 32 | Prompt processing speed at `-ub` 128 to 4096, on 8K and 48K prompts. | Pick the batch size. |
| `curve2` | 102 | A never seen prompt of N tokens (`turn: cold`), then one follow-up turn on the cached prompt. Time to first token (`ttft_s`, the first thinking token for this model), prefill speed, generation speed (200 tokens), GPU memory. | What a coding agent feels as the context grows. |
| `codedepth` | 68 | Four coding problems asked behind 0, 32K, 64K, 96K, 120K and 160K tokens of code, low effort. Speed over all generated tokens and tests passed. | Generation speed on code, which is where DSpark helps, and whether answers still pass at depth. |
| `coding` | 157 | 16 short Python problems graded by tests, per setup, effort and seed. | Sanity check that a setting does not break answers, and the cost of each effort level. Too small to rank setups. |
| `tools` | 324 | 18 tool calling cases with 8 tools defined, graded on the expected tool and valid JSON arguments, on a short context and behind 60K tokens of code. | Whether tool calls stay reliable and how long a call takes. |
| `agentloop` | 72 | A 12 turn tool calling session that starts at about 41K tokens, with and without keeping the reasoning in the history (`keep_reasoning`). | What a real agent session costs per turn once the prompt cache holds. |
| `effortswitch` | 6 | Changing the effort in the middle of a session. | Whether a per request effort breaks the prompt cache. |
| `soak131k` | 6 | A session at 122K tokens on setting 1 as it runs. | Confirm the chosen `-c 131072` holds. |
| `parallel`, `parallel2` | 9 | 1 to 4 concurrent requests on `--parallel 4 -c 65536`. | Whether more than one slot is worth it. |

`curve_v1_discarded.jsonl` (the rows of an earlier version of the curve test, replaced by `curve2`) was left on the GPU machine and is not used.

## Results

### Context that survives a session and GPU memory

| Setup | Context | Peak GPU memory in that session |
|---|---|---|
| 16-bit KV | 180,224 | 23,629 MiB |
| 16-bit KV + DSpark | 139,264 | 23,555 MiB |
| 8-bit KV | 262,144 (the largest size tested, not a limit) | 22,971 MiB |
| 8-bit KV + DSpark | 229,376 | 23,763 MiB |

- The single prompt limit of the 16-bit KV cache was 196,608, but the server ran out of memory in the middle of a session at that size.
- The vision projector cost about 20K tokens of context (176,128 against 196,608 for a single prompt).
- `-ub 2048` cut the single prompt limit to 118,784.
- Setting 1 as it runs (`-c 131072`): a session at 122K tokens passed 6 of 6 coding problems, peak 23,145 MiB, cold first token 50.8 s, generation 55 to 66 tok/s.

### Time to first token on a cold prompt (seconds)

| Prompt size | 16-bit KV | 8-bit KV | 16-bit KV + DSpark | 8-bit KV + DSpark |
|---|---|---|---|---|
| 1K | 0.39 | 0.38 | 0.40 | 0.39 |
| 8K | 2.75 | 2.75 | 2.89 | 2.87 |
| 32K | 11.2 | 11.5 | 11.8 | 12.0 |
| 64K | 23.7 | 24.7 | 24.8 | 26.0 |
| 128K | 52.5 | 57.1 | 54.4 | 59.4 |
| 160K | 68.2 | 75.7 | n.a. | 78.7 |
| 256K | n.a. | 143.7 | n.a. | n.a. |

- Prompt processing is about 3,000 tok/s on short prompts, 2,300 to 2,500 tok/s at 128K and about 1,800 tok/s at 256K (8-bit KV).
- A follow-up turn on a cached prompt gets its first token in 0.2 to 0.75 s at every depth tested (up to 259K).
- The lines in the figure end at 136K (58 s), 226K (125 s) and 259K (146 s).

### Generation speed on thinking or prose text (tok/s, `curve2`, cold request)

| Prompt size | 16-bit KV | 8-bit KV | 16-bit KV + DSpark | 8-bit KV + DSpark |
|---|---|---|---|---|
| 1K | 76.6 | 75.8 | 79.3 | 74.3 |
| 32K | 69.7 | 70.4 | 80.8 | 64.9 |
| 64K | 63.6 | 66.1 | 64.3 | 58.6 |
| 128K | 54.5 | 58.1 | 49.8 | 42.9 |
| 256K | n.a. | 47.3 | n.a. | n.a. |

### Code generation speed at depth (tok/s, low effort, `codedepth`)

| Code already in context | 16-bit KV + DSpark | 8-bit KV | 8-bit KV + DSpark |
|---|---|---|---|
| 0 | 102.8 | 76.5 | 98.4 |
| 32K | 84.9 | 70.3 | 79.0 |
| 64K | 70.8 | 66.0 | 61.9 |
| 96K | 66.0 | 61.6 | 57.5 |
| 120K | 60.6 | 59.1 | 49.0 |
| 160K | does not fit | 55.0 | 42.9 |
| Tests passed | 18 of 20 | 23 of 24 | 24 of 24 |

- 16-bit KV without DSpark was not run in this test. Its short prompt code speed in the coding set is about 78 tok/s.
- DSpark draft acceptance on code was 61 to 71%.
- Like for like on the 8-bit cache, DSpark was 29% faster on an empty context (98 against 77 tok/s), 12% at 32K and slower from 64K up.

### Short coding set (16 problems, low effort unless noted)

- 16-bit KV: 14 of 16 and 15 of 16 (two seeds), about 78 tok/s, 8.5 s mean per problem.
- 16-bit KV + DSpark: 14 of 16, about 105 tok/s, 7.2 s mean.
- 8-bit KV: 16 of 16, about 76 tok/s, 9.0 s mean.
- 8-bit KV + DSpark: 16 of 16 on two seeds, about 101 tok/s, 7.0 s mean.
- Effort on 16-bit KV, one seed: none 16 of 16 (16.1 s mean), low 14 of 16 (8.5 s mean, 7.7 s median), medium 15 of 16 (12.4 s mean), high 16 of 16 (19.1 s mean, 9.1 s median). Effort none still thinks. The mean gap between low and high comes mostly from a few problems.
- `--reasoning-budget 0` (variant `f16_ub512_nothink`) was bad: 4 of 18 tool cases right at about 20 s each.
- Nothing here shows the 8-bit KV cache costing accuracy. The set is too small to prove it does not, and too small to say low effort is free.

### Tool calling

- Valid JSON arguments in all 324 graded requests, no server errors.
- Expected tool called at low effort on a short context: 14 of 18 on all four setups. The 16 misses were the model running a shell command (10) or listing a directory (6) first.
- Median time for a simple tool call: 0.74 s with DSpark (both KV types), 0.92 to 0.97 s without.
- Behind 60K tokens of code: 1.2 to 1.4 s median, expected tool 11 to 13 of 18.

### Agent session (12 turns from about 41K tokens)

- First turn (cold): about 15 s.
- Later turns re-read about 340 tokens each. Median turn 1.6 s (16-bit KV + DSpark), 1.8 s (16-bit KV), 1.9 s (8-bit KV + DSpark). 8-bit KV alone was not run.
- Changing the effort in the middle of a session makes the server re-read the whole history once: 15.2 s to the first token with 40K tokens of history. Going back to a level used earlier took about 1 s.

### Other settings

- `-ub`, prompt processing on an 8K prompt: 128 gives 1,740 tok/s, 256 gives 2,540, 512 gives 3,000, 1024 gives 2,840, 2048 gives 2,640. 4096 fails with an HTTP 500 compute error.
- `--parallel 4 -c 65536` (the context is split evenly between slots): each request got 78 tok/s alone, 60 with two, 52 with three, 42 with four.
- Mixed KV cache (one of K or V in 8-bit): 49 to 50 tok/s at 100K against 58 for 16-bit and 61 for 8-bit. These three numbers came from a separate check and are not in `results.jsonl`.

## The three settings in the post

| | 1 | 2 | 3 |
|---|---|---|---|
| KV cache | 16-bit | 8-bit | 8-bit |
| DSpark | on | off | on |
| `-c` | 131072 | 262144 | 196608 |
| Code speed at 0 / 32K / 64K / 120K / 160K (tok/s) | 103 / 85 / 71 / 61 / does not fit | 77 / 70 / 66 / 59 / 55 | 98 / 79 / 62 / 49 / 43 |
| Peak GPU memory seen | 23,145 MiB at 122K | 22,971 MiB at 259K | 23,763 MiB at 226K |

- Setting 1 is the fastest while a session stays under about 64K tokens and level with setting 2 at 120K.
- Setting 2 is for sessions that need more than 131K tokens. A cold 256K prompt takes about 144 s to the first token.
- Setting 3 is one server for everything with a 196K window. It is slower than setting 1 at every depth and slower than setting 2 from 64K up.
- The card has 24,564 MiB, so the three settings leave 0.8 to 1.6 GB spare.

## What Aayush said or decided

These are the only first person opinions the post may carry.

- He wants the model for coding and tool calls from his Mac, in the Unsloth app or OpenCode, with the best latency without giving up accuracy.
- Default thinking effort low, medium or high per request, no reasoning budget.
- No mixed KV cache: either 16-bit or 8-bit.
- "It seems to me 8-bit KV cache seems to work. DSpark really speeds things up."
- The server runs without an API key because he saw no key field in the Unsloth app's connection form. The port is opened in the firewall only for the client.
- On the model (2026-11-23, after one day of use): Twitter and Reddit call it a very good local model and he agrees. It feels great to talk to and understands the conversation. For local use he puts it on par with Sonnet 5.5 if not at Opus 5.5.
- He recommends the Unsloth desktop app: a great app and easy to set up.

## How he wants the post to read (his dictation, 2026-11-23, lightly cleaned)

> It should start with: if you have been reading recently, Thinking Machines released a model, this model. And if you go through Twitter and Reddit, you will find that it is a very good local model, and I can say the same based on my single day of usage. It feels really great talking to it. It is able to understand your conversation, and I would say if not at Opus 5.5, it is at par with Sonnet 5.5 for local usage.
>
> Then: in the past I have gone through how you can deploy a local model on a 24 GB GPU. In my case I have an RTX 4090. This time also I deployed it and I have been using it on my Mac by running it as a server.
>
> One thing I wanted to test out is what is the best context I can use for my coding agents. I am currently using it with the Unsloth desktop app, and I would suggest it, it is a really great app. It is really easy to set up.
>
> Then: it is a very short post which compares what I think is useful for deploying a model, to find the right context length and the right settings. Then what I consider important to benchmark and compare when deploying locally given your RAM and GPU RAM.
>
> Then: this is what I want to compare. Then show the graph, what it shows and why. It is more like a dialogue you are having. Keep the text, especially in the benchmark comparison, to the minimum.
>
> Then: based on that, these are the 3 good settings we can use. Currently I am using the middle one with the long context.

He also asked for more graphs than the first two and for them to be more intuitive.

## State of the post and open items

- As of the evening of 2026-11-23 nothing is committed. The post folder, `static/img/blog-2026-11-23/` and this folder are untracked files on the `blog-posts` branch of the checkout on the GPU machine. Aayush has not asked for a commit or a push.
- The post follows the dictated order: opening, where it fits, the question, "Deploying with llama.cpp", "What to compare on a 24 GB card", "Benchmarks" (one question, one figure and a few sentences each), "Settings I would pick". It is about 1,070 words outside code and the table.
- Checks run on that state: `quarto render posts/2026-11-23-inkling2-mini-llamacpp/index.qmd` (rendered), `npm run check:posts` (26 posts passed), `node scripts/screenshots.mjs posts/2026-11-23-inkling2-mini-llamacpp/index.html` (the 390 px image was read: figures, table and code blocks fit). `npm run check:secrets` scans tracked files only, so it does not cover these files until they are added.
- **Which setting he runs.** The dictation says the middle one with the long context (setting 2). The server on the GPU machine was started with setting 1 and was still running setting 1 when this was written. The post says setting 1. Change the sentence, or the server, so that both agree.
- OpenCode was not tested with this model, and the post says so. OpenCode's current docs use different config keys than his earlier posts, so the post has no OpenCode JSON block.
- Whether the Unsloth app or OpenCode sends a thinking effort to the server is not known.
- The true limit of the 8-bit KV cache above 262,144 tokens was not measured.
- The link preview card (`image` and `image-alt` in the front matter) is not made yet. The `new-post` skill describes it as a step before shipping.
- Content cut from the post to keep it short, available above if wanted: the mixed KV result, effort none and `--reasoning-budget 0`, the vision projector cost, the `-ub 4096` failure, where each line in the first figure ends, tool calling behind 60K tokens.

## Must not appear in the post

- Any real IP address, hostname, network name, key or token. Use `<YOUR_GPU_SERVER_IP>` and `<YOUR_CLIENT_IP>`.
- Any claim that OpenCode was tested with this server, that the Unsloth app sends a thinking effort, that upstream llama.cpp cannot run the model, or that the 8-bit KV cache or low effort has no accuracy cost.
- Numbers that are not in this file or in `data/results.jsonl`.

The writing rules for posts are in `.claude/rules/blog-writing-style.md` and the repository rules in `AGENTS.md`.
