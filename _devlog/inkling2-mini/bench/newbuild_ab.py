#!/usr/bin/env python3
"""Old build against newer Unsloth llama.cpp builds: the codedepth test of inkling_bench.py, per build.

usage: newbuild_ab.py DEPTHS BUILD[:MODELDIR] ...     e.g.  newbuild_ab.py 0,64000 b12631 b12676
Results go to results_newbuild/results.jsonl with the build in every key, so a rerun resumes.
"""
import os
import shutil
import sys

import inkling_bench as ib

HERE = os.path.dirname(os.path.abspath(__file__))
ib.OUT = f"{HERE}/results_newbuild"
ib.RESULTS = f"{ib.OUT}/results.jsonl"
os.makedirs(ib.OUT, exist_ok=True)
if not os.path.exists(f"{ib.OUT}/corpus_tokens.json"):          # same prompts as the first benchmark
    shutil.copy(f"{HERE}/results/corpus_tokens.json", f"{ib.OUT}/corpus_tokens.json")

PLAN = (("f16_ub512_dspark", 139264), ("q8_ub512", 196608), ("q8_ub512_dspark", 196608), ("f16_ub512", 139264))
PROBS = [ib.PROBLEMS[i] for i in (0, 4, 10, 12)]                 # the four codedepth problems


def run(build, mdir, depths, variants):
    ib.BIN = f"{ib.HOME}/llama.cpp-unsloth/{build}"
    files = "old"
    if mdir:
        ib.MODEL = f"{mdir}/Inkling-2-Mini-UD-Q4_K_XL.gguf"
        ib.DRAFT = f"{mdir}/dspark-Inkling-2-Mini-Q8_0.gguf"
        files = os.path.basename(mdir.rstrip("/"))
    for name, ctx in PLAN:
        if name not in variants:
            continue
        label = f"{build}|{files}|{name}"
        if all(ib.done(f"ab|{label}|d{d}|{p[0]}") for d in depths for p in PROBS):
            continue
        if not ib.start(ctx, tag=f"ab_{build}_{files}_{name}", **ib.VARIANTS[name]):
            ib.record(f"abload|{label}|fail", phase="abload", build=build, files=files, variant=name, ctx=ctx, loaded=False)
            ib.say("failed to load", label)
            continue
        v0 = ib.vram_used()
        ib.chat([{"role": "user", "content": "Say hi."}], 16)
        if not ib.done(f"abload|{label}"):
            ib.record(f"abload|{label}", phase="abload", build=build, files=files, variant=name, ctx=ctx, loaded=True,
                      vram_after_load_mib=v0)
        for d in depths:
            system = "You are a coding assistant."
            if d:
                system += "\n\nRepository context (selected source files):\n\n" + ib.code_text(d, offset=3000 + d % 7000)
            for pname, spec, tests in PROBS:
                key = f"ab|{label}|d{d}|{pname}"
                if ib.done(key):
                    continue
                r = ib.chat([{"role": "system", "content": system}, {"role": "user", "content": ib.CODE_PROMPT + spec}],
                            6000, effort="low", cache_prompt=True)
                base = dict(phase="ab", build=build, files=files, variant=name, ctx=ctx, depth=d, problem=pname)
                if "error" in r:
                    ib.record(key, passed=False, **base, **r)
                    if ib.proc.poll() is not None:
                        break
                    continue
                passed, _ = ib.run_tests(f"ab_{build}_{files}_{name}_{d}_{pname}", ib.extract_code(r["_content"]), tests)
                ib.record(key, passed=passed, **base, **r)
            if ib.proc is None or ib.proc.poll() is not None:
                break
    ib.stop()


if __name__ == "__main__":
    depths = [int(x) for x in sys.argv[1].split(",")]
    variants = os.environ.get("AB_VARIANTS", "f16_ub512_dspark,q8_ub512").split(",")
    try:
        for spec in sys.argv[2:]:
            build, _, mdir = spec.partition(":")
            ib.say("=== build", build, mdir or "(old files)", depths, variants)
            run(build, mdir, depths, variants)
    finally:
        ib.stop()
    ib.say("ALL DONE")
