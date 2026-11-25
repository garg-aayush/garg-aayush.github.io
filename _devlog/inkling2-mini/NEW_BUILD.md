# Inkling 2 Mini on an RTX 4090: rerun on the newer Unsloth llama.cpp build (2026-11-25)

This file is the context for updating the published post `posts/2026-11-23-inkling2-mini-llamacpp/index.qmd` with results from a newer llama.cpp build. It records what was checked on 2026-11-25, why, every result and what is still open. Read `CONTEXT.md` first for the original experiment (2026-11-23, build `b12631-mix-acc0843`); this file only covers what came after. Nothing here has been put into the post yet.

## Short version

- The published post was benchmarked on Unsloth's `b12631-mix-acc0843` build. Its 24 Nov note already says a newer build exists and that the benchmarks might be rerun.
- The whole benchmark was rerun on 2026-11-25 on `b12676-mix-c32dcc8` (the latest Unsloth release that day), same machine, same prompts, same model files. Old and new rows share one format, so every figure can be drawn from either dataset.
- Code generation is 13 to 17% faster with an empty context and 13 to 67% faster with code in context. The gain is largest for 8-bit KV + DSpark.
- The post's advice on DSpark flips. On `b12676` the 8-bit KV + DSpark setup (the post's "Balanced") is tied with 16-bit KV + DSpark ("Fast") at empty context, faster than both other setups at every depth from 32K up, and has a 262K window where Fast has 147K.
- Context limits went up: 16-bit KV 180K to 196K, 16-bit KV + DSpark 139K to 147K, 8-bit KV 262K (the largest size tried before) to 377K, 8-bit KV + DSpark 229K to 262K.
- `-ub 512` is no longer the fastest micro-batch size. `-ub 2048` processes prompts 8 to 20% faster on `b12676`, but it costs 49K to 98K tokens of context, so 512 is still the better choice for long sessions.
- `b12649-mix-c7059d6`, the build the post's note names, uses about 1.5 to 2 GB more GPU memory than `b12631` and `b12676`. The post's Long context config (8-bit KV, `-c 262144`) ran out of GPU memory on it.
- The model and drafter files on Hugging Face were re-uploaded on 23 Nov in a new layout. The benchmark used the old-layout files. With the re-uploaded files speed is the same, but the drafter needs about 0.7 GB more GPU memory, which lowers the session limit of 16-bit KV + DSpark from 147K to 131K and of 8-bit KV + DSpark from 262K to 229K.
- Every number is a single run, as in the post.

## What Aayush said or decided

- He pointed at the Unsloth guide (`https://unsloth.ai/docs/models/inkling-2-mini`) and asked to check whether a new build gives faster inference.
- He shared the published post as the final version. Its text differs a lot from the draft described in `CONTEXT.md`: three figures, the configs are named Fast (131K), Long context (262K) and Balanced (196K), and the install steps point to Unsloth's guide.
- "We can update the full blog if needed."
- He is open to showing both the old and the new graph with a toggle.
- "It seems to me with this latest build, 8-bit KV cache plus DSpark should work better." The data agrees.
- He will update the blog himself in a later session. Nothing has been committed for this rerun.

## What is in this folder for the rerun

| Path | What it is |
|---|---|
| `NEW_BUILD.md` | This file. |
| `data/results.jsonl` | The original run on `b12631` (786 rows). Unchanged. |
| `data/results_b12676.jsonl` | The full rerun on `b12676` with the old-layout model files, same `phase` and `variant` names as the original. Also holds the `-ub 2048` extra rows (variants `f16_ub2048`, `q8_ub2048_dspark`). |
| `data/results_b12676_newfiles.jsonl` | `b12676` with the re-uploaded (new-layout) model and drafter files: code speed at depth, single prompt limit and whole-session limit for the two DSpark setups. |
| `data/results_build_ab.jsonl` | Small side tests. Phase `ab`: the four code speed problems per build (`b12631`, `b12649`, `b12676`) and per file set (`files` is `old` or `root-2026-11-25`). Phase `abload`: GPU memory right after load. Phase `postcfg`: the post's three configs loaded on each build. Phase `postfill`: one nearly full prompt plus a follow-up on the post's configs. |
| `plot_blog.py` | Draws the three figures of the post. It now takes `--data FILE` and `--out-dir DIR`; without them it reproduces the published SVGs byte for byte. |
| `bench/run_full_newbuild.py` | Runs every phase of `bench/inkling_bench.py` against another build into its own results folder. Options through environment variables: `NB_TAG`, `NB_MDIR`, `NB_CEILING`, `NB_CURVE2`. |
| `bench/newbuild_ab.py` | The small build against build test (phase `ab`). |
| `bench/run_full_b12676.sh`, `bench/run_extras_b12676.sh` | The exact commands that produced the rerun and the extra run. |

Local absolute paths were removed from `test_error` strings in the three new data files; nothing else was changed. Server logs, generated answers (`code_runs/`) and run logs stayed on the GPU machine under `~/llama.cpp-unsloth/bench/` in `results_b12676/`, `results_b12676_newfiles/` and `results_newbuild/`.

## Why the rerun

The Unsloth guide gained two update notes after the post's benchmark was run:

- **23 Nov:** "Unsloth is up to 1.9x faster than mainline llama.cpp for Inkling-2-Mini inference decoding", a fix for the Q8_0 KV cache using more VRAM than F16, and all quants updated so mainline llama.cpp can load them. The guide's install steps name `b12649-mix-c7059d6`.
- **24 Nov:** fine-tuning support, plus "fixed and improved Inkling-2-Mini inference speed further" and a fix in Unsloth Desktop for context lengths that slowed the model by 2 to 3x there.

Unsloth llama.cpp releases around the post:

| Build | Published (UTC) | Note |
|---|---|---|
| `b12631-mix-acc0843` | 2026-11-22 | The post's build. |
| `b12649-mix-c7059d6` | 2026-11-23 | Named in the guide. Adds both DSpark drafter layouts and a set of fused CUDA kernels for the MoE and attention paths. |
| `b12651-mix-c7059d6` | 2026-11-23 | Same patch set on a newer upstream. Not tested. |
| `b12675-mix-d14fe45` | 2026-11-24 | Not tested. |
| `b12676-mix-c32dcc8` | 2026-11-25 | Latest on the day of the rerun. Adds a faster NVFP4 dequant on CUDA and `--cache-ram auto`. Used for the rerun. |

Unsloth's own table in the guide (decode speed, 1024 generated tokens, `UD-Q4_K_XL`, 16-bit KV) has no RTX 4090 row. Its closest rows: RTX PRO 6000 Blackwell 101 to 125 tok/s and L4 39 to 43 tok/s from `b12631` to their new build.

### Why the drafter file changed

Aayush asked why Unsloth updated the drafter. What the model repo and upstream show:

- Upstream llama.cpp merged its own DSpark support on 2026-11-24 (pull request `ggml-org/llama.cpp#32218`). Its final version reads a different drafter file format from the one Unsloth first shipped: an unpadded `markov_w1` of shape [256, 200058], an explicit `markov_w2` and a softmax-normalised `ctx_mix`.
- Upstream also reads the main model in its own layout (`inkling2_loop`, merged in `#32694`, with a required fix in `#32704`, so any upstream build from b12611 on).
- On 2026-11-23 Unsloth re-uploaded the files at the root of `unsloth/Inkling-2-Mini-GGUF` with the commit "Support mainline llama.cpp". The guide says "all quants are updated so mainline llama.cpp can load them". The repo's READMEs say the two layouts hold the same weights and that only metadata and tensor names differ for the main model.
- The earlier files were kept: the old drafter as `dspark-Inkling-2-Mini-Q8_0_Old.gguf` at the root (described in its commit as the "padded-vocab layout") and the old main models under `Old_Support/`.
- The guide adds that the old drafter at depth 2 was faster on average than upstream's DSpark implementation in their tests, and that the new drafter should use depth 3. I did not test depth 3.

So the reason is compatibility with upstream llama.cpp. I found no statement from Unsloth beyond the commit titles, the READMEs and the guide.

File sizes, to tell the layouts apart:

| File | Old layout (used for the post and the rerun) | Root of the repo since 23 Nov |
|---|---|---|
| `Inkling-2-Mini-UD-Q4_K_XL.gguf` | 17,629,759,456 bytes | 17,629,760,736 bytes |
| `dspark-Inkling-2-Mini-Q8_0.gguf` | 402,278,560 bytes (0.4 GB), sha256 starts `2ec78510`, identical to today's `dspark-Inkling-2-Mini-Q8_0_Old.gguf` | 503,889,952 bytes (0.5 GB), sha256 starts `3da00cf7` |

## Setup of the rerun

Same machine, model quant, prompts, sampling and server flags as in `CONTEXT.md`. Only the llama.cpp build changed, asset `app-b12676-mix-c32dcc8-linux-x64-cuda12-newer.tar.gz`. The four setups keep their names: `f16_ub512` (16-bit KV), `f16_ub512_dspark` (16-bit KV + DSpark, the post's Fast), `q8_ub512` (8-bit KV, Long context), `q8_ub512_dspark` (8-bit KV + DSpark, Balanced).

Two deliberate differences from the first run:

- The search for the largest context goes above 262,144 for the 8-bit KV cache (the first run stopped there because that was the largest size tried), and `CURVE_SIZES` gained 320,000, 384,000 and 448,000.
- The single prompt limit is searched on a 16,384 token grid (4,096 before) and the 8-bit KV + DSpark setup gets its own single prompt limit (it had none before).

## Tests run on 2026-11-25

| Test | Phase in the data | File | What it measures | Why |
|---|---|---|---|---|
| Build against build, empty context | `ab`, `abload` | `results_build_ab.jsonl` | The four code speed problems on `b12631`, `b12649` and `b12676`, and GPU memory after load. | Quick answer to "is the new build faster on this card", with the old build rerun the same day as the baseline. |
| Post configs per build | `postcfg`, `postfill` | `results_build_ab.jsonl` | The post's three configs loaded on each build, then one nearly full prompt and a follow-up on `b12649`. | `b12649` showed more GPU memory after load, so the post's context sizes had to be checked on it. |
| Code speed at depth | `codedepth` | `results_b12676.jsonl` | Four coding problems behind 0, 32K, 64K, 96K, 120K and 160K tokens of code, low effort, three setups. | The post's code speed figure and config table. |
| Single prompt limit | `ceiling` | `results_b12676.jsonl` | Largest `-c` that loads, then the largest that survives one nearly full prompt. | Starting point for the session test and the post's "a single prompt can trick you" paragraph. |
| Session curve | `curve2`, `stable` | `results_b12676.jsonl` | Cold and follow-up time to first token at each prompt size, and the largest context that survives the whole session. | The post's max context and time to first token figures, peak VRAM. |
| Agent session | `agentloop` | `results_b12676.jsonl` | 12 turn tool calling session starting at 41K tokens, with and without the thinking sent back. | The post's first turn and median turn numbers. |
| Tool calls | `tools` | `results_b12676.jsonl` | 18 cases per effort and setup, also behind 60K tokens of code and with `--reasoning-budget 0`. | The post's thinking effort and tool call notes. |
| Coding set | `coding` | `results_b12676.jsonl` | 16 problems with hidden tests per effort and setup. | The effort notes and whether answers still pass on the new build. |
| `-ub` sweep | `ubsweep` | `results_b12676.jsonl` | Prompt processing speed at each micro-batch size. | The post's `-ub 512` bullet. |
| Effort switch and deep session | `effortswitch`, `soak131k` | `results_b12676.jsonl` | Prompt cache behaviour when effort changes, and six problems at 122K on the Fast config. | The post's effort switch note. |
| Concurrency | `parallel2` | `results_b12676.jsonl` | 1 to 4 requests at once on a 4 slot server. | The post's `--parallel` bullet. |
| Re-uploaded files | `ab`, `abload` with `files` = `root-2026-11-25` | `results_build_ab.jsonl` | Whether `b12631` and `b12676` load the re-uploaded files and how fast they run. | A reader who downloads today gets these files. |
| Extra run | see "Extra run" | `results_b12676_newfiles.jsonl`, `results_b12676.jsonl` | The DSpark setups with the re-uploaded files, and `-ub 2048`. | Two findings above needed numbers before the post can be updated. |

The rerun on `b12676` took about 2 hours (774 rows). The extra run took 40 minutes: 25 more rows in `results_b12676.jsonl` (799 in total) and 118 rows in `results_b12676_newfiles.jsonl`.

## Results

### Build against build at empty context

Mean decode speed over the four problems, low effort, one run each.

| Build | 16-bit KV + DSpark | 8-bit KV | GPU memory after load, 16-bit KV + DSpark at 139,264 | GPU memory after load, 8-bit KV at 196,608 |
|---|---|---|---|---|
| `b12631` | 101.9 tok/s | 76.0 tok/s | 23,155 MiB | 20,797 MiB |
| `b12649` | 117.0 tok/s | 88.9 tok/s | 23,597 MiB | 22,263 MiB |
| `b12676` | 119.4 tok/s | 88.7 tok/s | 23,139 MiB | 20,773 MiB |

The `b12631` rerun matches the original run (102 and 77 tok/s by the same averaging), so the comparison is fair.

### The post's three configs on each build

GPU memory right after load, before any prompt.

| Config | `b12631` | `b12649` | `b12676` |
|---|---|---|---|
| Fast: 16-bit KV + DSpark, `-c 131072` | 22,867 MiB | 23,255 MiB | 22,835 MiB |
| Long context: 8-bit KV, `-c 262144` | 22,013 MiB | 23,971 MiB | 21,925 MiB |
| Balanced: 8-bit KV + DSpark, `-c 196608` | 22,303 MiB | 23,769 MiB | 22,279 MiB |

One nearly full prompt (context minus 3,000 tokens) and a follow-up turn:

| Build and config | Outcome | Peak GPU memory |
|---|---|---|
| `b12649`, Long context | Crashed on the follow-up after a 259,144 token prompt with `CUDA error: out of memory`. | |
| `b12649`, Balanced | Survived. | 23,909 MiB |
| `b12649`, Fast | Survived. | 23,385 MiB |
| `b12676`, Long context | Survived, first token after 133.2 s. | 22,043 MiB |

The card has 24,564 MiB. The 23 Nov note about a Q8_0 KV cache fix did not show up as lower memory on this card: `b12676` uses the same memory as `b12631` at the same settings.

### Code speed at depth

Total generated tokens divided by total decode time over the four problems. This is the averaging `plot_blog.py` uses and the one behind the post's table (103 / 71 / 61 and so on). Old build first, `b12676` second.

| Code in context | 16-bit KV + DSpark (Fast) | 8-bit KV (Long context) | 8-bit KV + DSpark (Balanced) |
|---|---|---|---|
| 0 | 102.8 to 117.2 | 76.5 to 88.8 | 98.4 to 119.2 |
| 32K | 84.9 to 97.3 | 70.3 to 81.1 | 79.0 to 104.6 |
| 64K | 70.8 to 89.1 | 66.0 to 75.3 | 61.9 to 97.6 |
| 96K | 66.0 to 78.8 | 61.6 to 70.6 | 57.5 to 81.9 |
| 120K | 60.6 to 76.2 | 59.1 to 66.6 | 49.0 to 82.4 |
| 160K | does not fit | 55.0 to 62.0 | 42.9 to 71.8 |

In the post's table format (0 / 64K / 120K / 160K) the `b12676` rows are: Fast 117 / 89 / 76 / n/a, Long context 89 / 75 / 67 / 62, Balanced 119 / 98 / 82 / 72.

A plain mean of the four per-problem speeds gives slightly different values (for example Balanced 118.9 / 97.0 / 82.0 / 75.1). Earlier chat messages in the session used that mean. Use the table above for the post so old and new stay comparable.

Tests passed on `b12676`: Fast 18 of 20 (2 of 4 at empty context, 4 of 4 elsewhere), Long context 24 of 24, Balanced 23 of 24 (3 of 4 at 96K). The two Fast failures are a wrong method name (`OrderedDict.delete`) and a wrong return value. The seed is fixed, so repeats of that point fail the same way.

Peak GPU memory during these sessions on `b12676`: Fast at `-c 139264` 23,255 MiB, Long context at `-c 196608` 20,883 MiB, Balanced at `-c 196608` 22,395 MiB.

### Largest context

| Setup | Single prompt limit, `b12631` | Single prompt limit, `b12676` | Survived a whole session, `b12631` | Survived a whole session, `b12676` | Peak GPU memory in that session, `b12676` |
|---|---|---|---|---|---|
| 16-bit KV | 196,608 | 196,608 | 180,224 | 196,608 | 23,875 MiB |
| 16-bit KV + DSpark | 155,648 | 147,456 | 139,264 | 147,456 | 23,625 MiB |
| 8-bit KV | 262,144 (largest tried) | 376,832 | 262,144 (largest tried) | 376,832 | 24,063 MiB |
| 8-bit KV + DSpark | not measured | 262,144 | 229,376 | 262,144 | 23,915 MiB |

- The grids differ (4,096 before, 16,384 now), which is why the 16-bit KV + DSpark single prompt limit looks lower. On `b12676` it loaded at 163,840 and failed the fill there; 155,648 was not tried.
- 8-bit KV loaded at 376,832 and failed to load at 393,216. 8-bit KV + DSpark loaded at 278,528 and failed the fill there.
- On `b12676` every setup survived the whole session at its single prompt limit on the first try. The post's remark that the 16-bit server took one 196K prompt and then ran out of memory later did not reproduce on this build.
- 8-bit KV at 376,832 leaves about 0.5 GB of the card spare.

### Cold time to first token

Seconds, old build then `b12676`. A dash means that size did not fit or was not run.

| Prompt size | 16-bit KV | 16-bit KV + DSpark | 8-bit KV | 8-bit KV + DSpark |
|---|---|---|---|---|
| 1K | 0.39 to 0.37 | 0.40 to 0.38 | 0.38 to 0.35 | 0.39 to 0.36 |
| 8K | 2.75 to 2.11 | 2.89 to 2.20 | 2.75 to 2.11 | 2.87 to 2.21 |
| 16K | 5.47 to 4.20 | 5.77 to 4.34 | 5.53 to 4.23 | 5.80 to 4.43 |
| 32K | 11.2 to 8.6 | 11.8 to 9.0 | 11.4 to 8.8 | 12.0 to 9.2 |
| 64K | 23.7 to 19.3 | 24.8 to 20.1 | 24.7 to 19.8 | 26.0 to 20.7 |
| 96K | 37.4 to 32.0 | 38.9 to 33.1 | 39.7 to 32.8 | 41.6 to 34.1 |
| 128K | 52.5 to 47.0 | 54.4 to 48.3 | 57.1 to 48.2 | 59.4 to 49.9 |
| 160K | 68.2 to 64.0 | - | 75.7 to 65.6 | 78.7 to 67.8 |
| 192K | - | - | 96.5 to 85.5 | 100.0 to 88.1 |
| 224K | - | - | 119.1 to 107.3 | - to 110.4 |
| 256K | - | - | 143.7 to 131.7 | - to 135.2 |
| 320K | - | - | - to 186.8 | - |

Largest prompt of each session on `b12676`: 16-bit KV 84.1 s at 194K, 16-bit KV + DSpark 57.0 s at 144K, 8-bit KV 239.8 s at 374K, 8-bit KV + DSpark 137.7 s at 259K.

Follow-up turn on a cached prompt: 0.22 to 0.75 s on the old build, 0.21 to 0.73 s on `b12676` up to 259K, and 0.94 s at 374K. The post's "under 1 s at every depth" still holds.

### Agent session

12 turns, starting at 40,957 tokens, low effort. Total seconds per turn.

| Setup | First turn, old to new | Median later turn (thinking dropped), old to new | Median later turn (thinking sent back), old to new |
|---|---|---|---|
| 16-bit KV | 15.3 to 12.0 | 1.76 to 1.51 | 1.83 to 1.48 |
| 16-bit KV + DSpark | 15.8 to 12.3 | 1.59 to 1.21 | 1.72 to 1.33 |
| 8-bit KV + DSpark | 16.4 to 12.8 | 1.74 to 1.28 | 2.67 to 1.29 |

Every tool call had valid JSON arguments on both builds.

### Tool calls

Cases out of 18 where the expected tool was called. Old build then `b12676`. All 324 graded requests had valid JSON arguments on both builds.

| Setup | High | Low | High behind 60K of code | Low behind 60K of code |
|---|---|---|---|---|
| 16-bit KV | 11 to 12 | 14 to 14 | 11 to 12 | 11 to 12 |
| 16-bit KV + DSpark | 12 to 12 | 14 to 14 | not run | not run |
| 8-bit KV | 11 to 12 | 14 to 15 | 11 to 11 | 13 to 12 |
| 8-bit KV + DSpark | 13 to 13 | 14 to 14 | 11 to 12 | 11 to 11 |

16-bit KV at the other efforts: medium 13 to 13, minimal 14 to 15, none 14 to 14. With `--reasoning-budget 0`: 4 to 5 of 18, so tool calling is still badly broken with thinking switched off.

Median time of a request that made one tool call, low effort, empty context: 16-bit KV 0.95 to 0.82 s, 8-bit KV 0.90 to 0.80 s, 16-bit KV + DSpark 0.70 to 0.63 s, 8-bit KV + DSpark 0.70 to 0.60 s.

### Coding set and thinking effort

16 problems with hidden tests. Passed, then mean seconds per problem.

| Setup and effort | `b12631` | `b12676` |
|---|---|---|
| 16-bit KV, none | 16 of 16, 16.1 s | 15 of 16, 9.7 s |
| 16-bit KV, low (two seeds) | 29 of 32, 8.6 s | 31 of 32, 8.8 s |
| 16-bit KV, medium | 15 of 16, 12.4 s | 14 of 16, 12.3 s |
| 16-bit KV, high | 16 of 16, 19.1 s | 14 of 16, 21.0 s |
| 16-bit KV + DSpark, low | 14 of 16, 7.2 s | 15 of 16, 5.2 s |
| 8-bit KV, low | 16 of 16, 9.0 s | 16 of 16, 8.8 s |
| 8-bit KV + DSpark, low (two seeds) | 32 of 32, 7.0 s | 29 of 32, 5.6 s |

- Effort none still thinks and is still slower than low, but the gap shrank (9.7 s against 8.8 s).
- The three 8-bit KV + DSpark failures on `b12676` are logic bugs in three different problems (`regex_match`, `min_window`, `evaluate`). The 16-bit setups fail the same problems at other efforts. With single runs at temperature 1.0 this cannot be told apart from noise, and it also cannot be ruled out as a real loss.
- High effort passing fewer problems than low on `b12676` (14 against 31 of 32) is the opposite of the first run and is most likely noise for the same reason.
- The `--reasoning-budget 0` coding run of the first benchmark (9 of 13) was not repeated.

### Micro-batch size

Prompt processing speed in tok/s at `-c 65536`, mean of two runs. Old build then `b12676`.

| `-ub` | 16-bit KV, 8K prompt | 16-bit KV, 48K prompt | 8-bit KV, 8K prompt | 8-bit KV, 48K prompt |
|---|---|---|---|---|
| 128 | 1,745 to 1,940 | 1,690 to 1,850 | | |
| 256 | 2,540 to 2,925 | 2,465 to 2,745 | | |
| 512 | 3,000 to 3,940 | 2,860 to 3,630 | 2,985 to 3,865 | 2,735 to 3,485 |
| 1024 | 2,840 to 4,430 | 2,695 to 4,005 | | |
| 2048 | 2,640 to 4,730 | 2,320 to 4,255 | 2,645 to 4,675 | 2,225 to 4,100 |
| 4096 | no result to 4,620 | no result to 4,155 | | |

On the old build 512 was the fastest. On `b12676` speed keeps rising up to 2048, which is 20% faster than 512 on an 8K prompt and 17% faster on a 48K prompt. It costs a lot of usable context, see "Extra run".

### Effort switch, deep session and concurrency

- **Effort switch** (Fast config, 40K tokens of history): changing from low to high still makes the server reread the whole history once. First token after 11.9 s on `b12676` (15.2 s before) with nothing cached. Switching back to low was cached on both builds (about 1 s).
- **Deep session** (Fast config at `-c 131072`, 122K tokens of code, six problems): 6 of 6 passed on both builds. Speed 55 to 66 tok/s before, 75 to 89 tok/s on `b12676`. Cold first token 50.8 s before, 44.9 s now. Peak GPU memory 23,145 MiB before, 22,963 MiB now.
- **Concurrency** (4 slots, 16-bit KV, high effort): per request 78 / 61 / 52 / 42 tok/s with 1 / 2 / 3 / 4 requests before, 94 / 72 / 60 / 53 tok/s on `b12676`.

### Re-uploaded model files

Tested with the files downloaded from the repo root on 2026-11-25.

| Build | Main model | DSpark drafter | Speed at empty context |
|---|---|---|---|
| `b12631` | Loads. | Does not load: `tensor 'joint_proj.weight' has wrong shape; expected 2816, 768, got 5120, 768`. The server exits. | 8-bit KV: 76.7 tok/s (76.0 with the old files) |
| `b12676` | Loads. | Loads. | 16-bit KV + DSpark: 117.8 tok/s (119.4 with the old files), same draft acceptance. 8-bit KV: 90.1 tok/s (88.7). |

GPU memory after load on `b12676`, 16-bit KV + DSpark at `-c 139264`: 23,811 MiB with the re-uploaded drafter against 23,139 MiB with the old one, so about 670 MiB more. Without a drafter the two main model files use the same memory (20,773 MiB for 8-bit KV at 196,608).

Consequence for the post: a reader who follows the Unsloth guide today gets the re-uploaded drafter. Speed is the same, but the DSpark context limits above were measured with the old drafter, which is still downloadable as `dspark-Inkling-2-Mini-Q8_0_Old.gguf`. The limits with the re-uploaded drafter are in "Extra run".

### Extra run

Two follow-ups on `b12676`, run right after the full rerun.

**1. The re-uploaded model and drafter files** (`data/results_b12676_newfiles.jsonl`). This is what a reader gets from the repo root today.

Code speed by the post's averaging, old-layout files then re-uploaded files:

| Code in context | 16-bit KV + DSpark | 8-bit KV | 8-bit KV + DSpark |
|---|---|---|---|
| 0 | 117.2 and 115.4 | 88.8 and 89.3 | 119.2 and 117.4 |
| 32K | 97.3 and 96.0 | 81.1 and 81.3 | 104.6 and 103.4 |
| 64K | 89.1 and 88.4 | 75.3 and 75.8 | 97.6 and 96.4 |
| 96K | 78.8 and 78.4 | 70.6 and 70.6 | 81.9 and 80.5 |
| 120K | 76.2 and 75.4 | 66.6 and 67.1 | 82.4 and 81.7 |
| 160K | does not fit | 62.0 and 62.5 | 71.8 and 71.2 |

Speed is the same within 2%. Tests passed are the same too (18 of 20, 24 of 24, 23 of 24, failing at the same points). Peak GPU memory in these sessions with the re-uploaded files: 16-bit KV + DSpark at `-c 139264` 23,939 MiB (23,255 with the old drafter), 8-bit KV at `-c 196608` 20,879 MiB (unchanged), 8-bit KV + DSpark at `-c 196608` 23,029 MiB (22,395 with the old drafter).

Context limits of the two DSpark setups:

| Setup | Loads up to | Single prompt limit | Survived a whole session | Same with the old drafter | Peak GPU memory in that session |
|---|---|---|---|---|---|
| 16-bit KV + DSpark | 147,456 | 131,072 (147,456 failed) | 131,072 | 147,456 | 23,709 MiB |
| 8-bit KV + DSpark | 245,760 | 245,760 | 229,376 | 262,144 | 23,777 MiB |

- The re-uploaded drafter costs one 16,384 step for 16-bit KV and two for 8-bit KV, in line with the roughly 670 MiB it adds.
- 8-bit KV + DSpark took one 244K prompt at `-c 245760` (first token after 123.5 s, peak 24,043 MiB) and then crashed early in the session test at that size, on the follow-up to the first 1,000 token prompt. So with these files a single prompt passing does not mean the session survives.
- The post's Fast config (`-c 131072`) sits exactly on the limit with the re-uploaded drafter. Balanced (`-c 196608`) keeps about 1.5 GB spare.
- Cold time to first token is unchanged: 19.7 s and 20.3 s at 64K, 47.6 s and 49.2 s at 128K, 111.0 s at 226K for 8-bit KV + DSpark.

**2. `-ub 2048`** (rows with variants `f16_ub2048` and `q8_ub2048_dspark` in `data/results_b12676.jsonl`, old-layout files).

| Setup | Limit at `-ub 512` | Loads up to at `-ub 2048` | Single prompt limit at `-ub 2048` | Survived a whole session at `-ub 2048` |
|---|---|---|---|---|
| 16-bit KV | 196,608 | 163,840 | 147,456 | not run |
| 8-bit KV + DSpark | 262,144 | 180,224 | 163,840 | 163,840 (peak 23,759 MiB) |

On the old build the same comparison for 16-bit KV was 196,608 against 118,784.

Cold time to first token for 8-bit KV + DSpark, `-ub 512` then `-ub 2048`:

| Prompt size | Seconds | Gain |
|---|---|---|
| 1K | 0.36 to 0.31 | 14% |
| 8K | 2.21 to 1.84 | 17% |
| 16K | 4.43 to 3.68 | 17% |
| 32K | 9.24 to 7.81 | 16% |
| 64K | 20.7 to 17.8 | 14% |
| 96K | 34.1 to 30.1 | 12% |
| 128K | 49.9 to 44.7 | 10% |
| 160K | 67.8 to 62.2 | 8% |

So `-ub 2048` reads prompts 8 to 17% sooner and costs 49K tokens of context with 16-bit KV and 98K with 8-bit KV + DSpark. For a long-context coding agent `-ub 512` is still the better trade. The post's bullet keeps its conclusion but its reason changes: higher values no longer slow prompt processing, they only cut usable context.

## The three settings on `b12676`

| | Fast: 16-bit KV + DSpark | Long context: 8-bit KV | Balanced: 8-bit KV + DSpark |
|---|---|---|---|
| Largest context that survived a session, old drafter | 147K | 377K | 262K |
| Same with the re-uploaded drafter | 131K | 377K (no drafter) | 229K |
| Code speed at 0 / 64K / 120K / 160K (tok/s) | 117 / 89 / 76 / n/a | 89 / 75 / 67 / 62 | 119 / 98 / 82 / 72 |
| Same on `b12631` (the post) | 103 / 71 / 61 / n/a | 76 / 66 / 59 / 55 | 98 / 62 / 49 / 43 |
| Cold first token at 64K / 128K | 20 s / 48 s | 20 s / 48 s | 21 s / 50 s |
| GPU memory after load at the post's `-c` | 22,835 MiB at 131,072 | 21,925 MiB at 262,144 | 22,279 MiB at 196,608 |
| Peak GPU memory seen at the post's `-c` | 22,963 MiB (22.4 GB) at 122K | 22,043 MiB (21.5 GB) at 259K | 22,395 MiB (21.9 GB) at 160K |

The post's table gives GB as MiB divided by 1,024 (for example 22.6 GB for 23,145 MiB).

Reading of the data, given to Aayush as a recommendation and not yet confirmed by him as his choice:

- **8-bit KV + DSpark at `-c 196608` with `-ub 512` for daily use.** Tied for fastest at empty context, fastest from 32K up, a larger window than Fast. It fits with either drafter file: about 2 GB of the card spare with the old drafter and about 1.5 GB with the re-uploaded one. The window can go to `-c 262144` with the old drafter (about 0.6 GB spare) or `-c 229376` with the re-uploaded one.
- **Plain 8-bit KV only for sessions above 262K.** Slowest of the three, and a cold 374K prompt takes 240 s to the first token.
- **16-bit KV + DSpark no longer has a speed case.** Same speed or slower with a smaller window. No clear quality difference shows in the coding set or the tool calls, within what single runs can tell.

The model server on the GPU machine still runs the Fast config on `b12631` through `~/llama.cpp-unsloth/run_inkling.sh`. It was not changed. The `b12649` and `b12676` builds are unpacked next to it in `~/llama.cpp-unsloth/`.

## What in the published post no longer holds on `b12676`

| Place in the post | What it says | On `b12676` |
|---|---|---|
| 24 Nov note | Points readers to `b12649-mix-c7059d6` and expects better speeds. | Faster, yes. But `b12649` uses 1.5 to 2 GB more GPU memory and the Long context config ran out of memory on it. `b12676` does not have this. |
| DSpark bullet in "Benchmarking" | "costs some vram and adds overhead once the context gets large" | Still costs context (147K against 196K, 262K against 377K). No longer slower at large context: faster than no DSpark at every depth measured. |
| `-ub` bullet | `-ub 512` was the sweet spot at about 3,000 tok/s; higher slowed prefill down and cut into usable context. | 512 gives about 3,940 tok/s and 2048 gives about 4,730 tok/s, so higher is now faster. It still cuts usable context (262K to 164K for 8-bit KV + DSpark), so 512 remains the choice. |
| Max context paragraph | 16-bit took one 196K prompt, then ran out of memory later. 8-bit pushes usable context from 180K to 262K. DSpark trades away roughly 30 to 40K tokens. | Sessions survived at the single prompt limit. 196K to 377K. DSpark costs 49K with 16-bit KV and 115K with 8-bit KV. |
| Time to first token paragraph | First cold turn 15.8 s, later turns a median of 1.6 to 1.9 s. | 12.3 s and 1.2 to 1.5 s. The claim that setups track each other and follow-ups stay under 1 s still holds. |
| Code speed paragraph and its key sentence | By 120K Fast and plain 8-bit KV are basically tied. Past 64K 8-bit KV + DSpark falls behind plain 8-bit KV. DSpark gives about 30% on short contexts. | 76 against 67 tok/s at 120K. 8-bit KV + DSpark is ahead of plain 8-bit KV at every depth (98 against 75 at 64K, 72 against 62 at 160K). DSpark gives 32 to 34% at empty context. |
| Thinking effort notes | Effort none still thinks and is slower than low. `--reasoning-budget 0` breaks tool calling. Switching effort clears the prompt cache once. | All three still hold. |
| Config table | Context 131K / 262K / 196K, speeds and peak VRAM from `b12631`. | See "The three settings" above. |
| The three bullets under the table | Fast is the fastest under about 64K. Balanced is slower than Fast at every depth and slower than Long context past 64K. A cold 256K prompt takes around 144 s. | Balanced ties or beats Fast at every depth and beats Long context at every depth. A cold 256K prompt takes about 132 s. |
| "Running it with llama.cpp" | `BIN=~/llama.cpp-unsloth/b12631`, drafter described as 0.4 GB, final config is Fast. | The guide now installs a newer build, and the drafter it downloads is 0.5 GB. With that drafter Fast at `-c 131072` is exactly at its limit. |

## Plotting and the old against new toggle

`plot_blog.py` draws from one results file. For the new build:

```bash
uv run --no-project python _devlog/inkling2-mini/plot_blog.py \
  --data _devlog/inkling2-mini/data/results_b12676.jsonl --out-dir /tmp/inkling-b12676
```

It runs on the new data but the charts were laid out for the old numbers, so these need changing before the output is usable:

- `max-context.svg`: the x axis ends at 300K, so the 377K bar runs off the chart. The alt text lists the old limits.
- `ttft-vs-context.svg`: the x axis ends near 262K (the 8-bit KV line goes to 374K), and the end labels "58 s at 136K" and "125 s at 226K" are fixed text.
- `code-speed-vs-context.svg`: the note "Past 64K, plain 8-bit KV beats 8-bit KV + DSpark" is fixed text and is now false. The end labels of the two DSpark lines overlap.

For a toggle, the same three figures can be drawn twice (one set per build) with shared axis ranges so that switching does not rescale, and the post can swap the image set with a small switch above the figures. No toggle exists on the site yet; that is new template or script work under `.claude/rules/site-styling.md`. An alternative without scripting is one figure per chart with old as faint lines and new as solid lines.

Data fields the three figures use: `stable` rows (`stable_ctx`), `curve2` rows (`turn` cold or follow_up, `target_prompt`, `prompt_n`, `ttft_s`), `codedepth` rows (`depth`, `gen_n`, `decode_tps`).

## Open items

- Aayush has not yet said which config the updated post should name as his, or whether the post gets a toggle, a second set of figures or a rewrite.
- Every number is a single run. The coding set difference for 8-bit KV + DSpark (32 of 32 before, 29 of 32 now) is unresolved.
- `--spec-draft-n-max 3`, which Unsloth suggests for the new drafter, was not tested. Everything uses 2.
- `b12651` and `b12675` were not tested. Upstream llama.cpp (which merged DSpark on 24 Nov) was not tested.
- The Unsloth guide's command adds `--mmproj` (the vision projector). No run here loads it; in the first run it cost context (see `CONTEXT.md`).
- The link preview image (`code-speed-card.jpg`) shows the old code speed chart.

## Must not appear in the post

Same rule as in `CONTEXT.md`: the repo is public, so no real IP addresses, hostnames, network names, keys, tokens or home directory paths in the post or in this folder.
