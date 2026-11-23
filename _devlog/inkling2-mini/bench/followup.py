#!/usr/bin/env python3
"""Follow-up checks after the audit: effort switch vs prompt cache, a deep session at the recommended -c, clean concurrency."""
import threading, time, sys
import inkling_bench as b

def effort_switch_and_soak():
    # recommended config exactly: f16 KV + DSpark at -c 131072
    if not b.start(131072, tag="followup_reco", **b.VARIANTS["f16_ub512_dspark"]):
        b.say("followup: recommended config failed to start"); return
    v0 = b.vram_used()
    b.chat([{"role": "user", "content": "Say hi."}], 16)
    # history lives in user/assistant messages, as in a normal chat or agent session
    msgs = [{"role": "system", "content": "You are a coding assistant."},
            {"role": "user", "content": "Here is some C++ code:\n\n" + b.code_text(40000, offset=11000) + "\n\nWhich file is this mostly from? One line."}]
    plan = [("t1 cold, low", "low"), ("t2 follow-up, low", "low"), ("t3 follow-up, switch to high", "high"),
            ("t4 follow-up, still high", "high"), ("t5 follow-up, back to low", "low"), ("t6 follow-up, low", "low")]
    for i, (name, eff) in enumerate(plan, 1):
        r = b.chat(msgs, 300, effort=eff, cache_prompt=True)
        b.record(f"effortswitch|{i}", phase="effortswitch", step=name, effort=eff, **r)
        if "error" in r: break
        msgs = msgs + [{"role": "assistant", "content": r["_content"] or "Not sure."},
                       {"role": "user", "content": f"Follow-up {i}: name one function defined in that code. One line."}]
    # deep session at exactly -c 131072: 122K-token cold prompt, follow-up, then code generation at that depth
    system = "You are a coding assistant.\n\nRepository context (selected source files):\n\n" + b.code_text(122000, offset=2000)
    for j, (pname, spec, tests) in enumerate([b.PROBLEMS[i] for i in (0, 4, 10, 12, 2, 6)], 1):
        r = b.chat([{"role": "system", "content": system}, {"role": "user", "content": b.CODE_PROMPT + spec}], 3000, effort="low", cache_prompt=True)
        if "error" in r:
            b.record(f"soak131k|{j}", phase="soak131k", problem=pname, passed=False, vram_after_load_mib=v0, **r); break
        passed, err = b.run_tests(f"soak_{pname}", b.extract_code(r["_content"]), tests)
        b.record(f"soak131k|{j}", phase="soak131k", problem=pname, passed=passed, vram_after_load_mib=v0, **r)
    b.stop()

def concurrency():
    if not b.start(65536, ub=512, kv="f16", parallel=4, tag="followup_parallel"):
        b.say("followup: parallel server failed to start"); return
    b.chat([{"role": "user", "content": "Say hi."}], 16)
    prompt = b.CODE_PROMPT + b.PROBLEMS[13][1]      # hard problem at high effort: always runs past 500 tokens
    for n in (1, 2, 3, 4, 2, 1):
        out = [None] * n
        def work(i):
            out[i] = b.chat([{"role": "user", "content": prompt}], 500, effort="high", seed=1)
        t0 = time.time()
        ths = [threading.Thread(target=work, args=(i,)) for i in range(n)]
        [t.start() for t in ths]; [t.join() for t in ths]
        wall = time.time() - t0
        ok = [o for o in out if o and "error" not in o]
        key = f"parallel2|n{n}|" + str(sum(1 for k in (b._done or []) if k.startswith(f"parallel2|n{n}|")) + 1)
        b.record(key, phase="parallel2", concurrent=n, ok=len(ok), wall_s=round(wall, 2), gen_tokens=[o["gen_n"] for o in ok],
                 finish=[o["finish"] for o in ok], per_request_decode_tps=[o["decode_tps"] for o in ok],
                 sum_decode_tps=round(sum(o["decode_tps"] for o in ok), 1), wall_tps=round(sum(o["gen_n"] for o in ok) / wall, 1))
    b.stop()

if __name__ == "__main__":
    b.done("x")
    try:
        for name in (sys.argv[1:] or ["effort", "parallel"]):
            {"effort": effort_switch_and_soak, "parallel": concurrency}[name]()
    finally:
        b.stop()
    b.say("FOLLOWUP DONE")
