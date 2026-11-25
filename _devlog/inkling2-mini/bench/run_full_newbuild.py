#!/usr/bin/env python3
"""The whole inkling_bench.py benchmark again on a newer Unsloth llama.cpp build, into its own results folder.

usage: run_full_newbuild.py BUILD [phase ...]      e.g.  run_full_newbuild.py b12676
Rows keep the phase and variant names of the first benchmark, so the same plot script reads either folder.
Differences from the first run: the context search goes above 262,144 for the 8-bit KV cache and uses a
16,384 token grid, and the 8-bit KV + DSpark setup gets its own single prompt limit.
"""
import os
import shutil
import sys
import traceback

import inkling_bench as ib
import followup

BUILD = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
ib.BIN = f"{ib.HOME}/llama.cpp-unsloth/{BUILD}"
TAG = os.environ.get("NB_TAG", "")                              # separate results folder, e.g. for other model files
ib.OUT = f"{HERE}/results_{BUILD}" + (f"_{TAG}" if TAG else "")
ib.RESULTS = f"{ib.OUT}/results.jsonl"
if os.environ.get("NB_MDIR"):                                   # model and drafter files from another folder
    ib.MODEL = f"{os.environ['NB_MDIR']}/Inkling-2-Mini-UD-Q4_K_XL.gguf"
    ib.DRAFT = f"{os.environ['NB_MDIR']}/dspark-Inkling-2-Mini-Q8_0.gguf"
ib.VARIANTS.update({"q8_ub2048": dict(ub=2048, kv="q8_0"),
                    "q8_ub2048_dspark": dict(ub=2048, kv="q8_0", dspark=True),
                    "f16_ub2048_dspark": dict(ub=2048, kv="f16", dspark=True)})
os.makedirs(ib.OUT, exist_ok=True)
if not os.path.exists(f"{ib.OUT}/corpus_tokens.json"):          # same prompts as the first benchmark
    shutil.copy(f"{HERE}/results/corpus_tokens.json", f"{ib.OUT}/corpus_tokens.json")
ib.CURVE_SIZES = ib.CURVE_SIZES + [320000, 384000, 448000]

GRID = 16384
CEILING_PLAN = (("f16_ub512", 262144), ("f16_ub512_dspark", 262144), ("q8_ub512", 524288), ("q8_ub512_dspark", 524288))
if os.environ.get("NB_CEILING"):                                # e.g. "f16_ub2048:262144,q8_ub2048_dspark:524288"
    CEILING_PLAN = tuple((s.split(":")[0], int(s.split(":")[1])) for s in os.environ["NB_CEILING"].split(","))
CURVE2_VARIANTS = tuple(os.environ.get("NB_CURVE2", "f16_ub512,q8_ub512,f16_ub512_dspark,q8_ub512_dspark").split(","))


def phase_ceiling():
    """Largest -c that loads, then the largest that survives one nearly full prompt."""
    for name, top in CEILING_PLAN:
        key = f"ceiling|{name}"
        if ib.done(key):
            continue
        opt = ib.VARIANTS[name]
        lo, hi = 1, top // GRID                      # units of GRID; 16K is assumed to load
        if ib.start(hi * GRID, tag="ceil", **opt):
            lo = hi
        while hi - lo > 1:
            mid = (lo + hi) // 2
            ok = ib.start(mid * GRID, tag="ceil", **opt)
            ib.say(f"  load test {name} ctx={mid * GRID}: {'ok' if ok else 'FAIL'}")
            lo, hi = (mid, hi) if ok else (lo, mid)
        load_max = ctx = lo * GRID
        while ctx >= GRID:
            if ib.start(ctx, tag=f"fill_{name}", **opt):
                v0 = ib.vram_used()
                r = ib.chat(ib.summarize_msg(ctx - 1400), 64)
                if "error" not in r and ib.proc.poll() is None:
                    ib.record(key, phase="ceiling", variant=name, max_ctx=ctx, load_max_ctx=load_max,
                              vram_after_load_mib=v0, **r)
                    break
                ib.say(f"  fill test failed for {name} at ctx={ctx}: {r.get('error')}")
            ctx -= GRID
    ib.stop()


PHASES = {"codedepth": ib.phase_codedepth, "ceiling": phase_ceiling, "curve2": lambda: ib.phase_curve2(CURVE2_VARIANTS),
          "agentloop": ib.phase_agentloop, "tools": ib.phase_tools, "coding": ib.phase_coding,
          "ubsweep": ib.phase_ubsweep, "effort": followup.effort_switch_and_soak, "parallel2": followup.concurrency}

if __name__ == "__main__":
    ib.done("x")
    try:
        for n in sys.argv[2:] or list(PHASES):
            ib.say("=== phase", n, "on", BUILD)
            try:
                PHASES[n]()
            except Exception:
                ib.say("PHASE FAILED", n)
                traceback.print_exc()
                ib.stop()
    finally:
        ib.stop()
    ib.say("ALL DONE")
