#!/usr/bin/env python3
"""Deployment benchmark for Inkling 2 Mini (UD-Q4_K_XL) on one GPU with Unsloth's llama.cpp build.

Phases (run all by default, or name the ones you want):
  ceiling   largest -c that loads and survives a nearly full prompt, per server variant
  ubsweep   prompt-processing speed vs -ub at a fixed context
  curve     TTFT / prefill / decode speed vs prompt length, cold and for a follow-up turn
  tools     tool-calling accuracy and latency (18 cases, plus the same cases behind 60K tokens of code)
  coding    16 Python problems checked by hidden tests, by reasoning effort and server variant
  parallel  throughput with 1, 2 and 4 concurrent requests
Every measurement is appended to results/results.jsonl with a unique "key", so a rerun resumes.
"""
import glob
import http.client
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

HOME = os.path.expanduser("~")
BIN = f"{HOME}/llama.cpp-unsloth/b12631"
MDIR = f"{HOME}/MODELS/unsloth/Inkling-2-Mini-GGUF"
MODEL = f"{MDIR}/Inkling-2-Mini-UD-Q4_K_XL.gguf"
DRAFT = f"{MDIR}/dspark-Inkling-2-Mini-Q8_0.gguf"
MMPROJ = f"{MDIR}/mmproj-F16.gguf"
CORPUS_GLOBS = [f"{HOME}/llama.cpp/src/*.cpp", f"{HOME}/llama.cpp/common/*.cpp"]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = f"{HERE}/results"
RESULTS = f"{OUT}/results.jsonl"
PORT = 8090
URL = f"http://127.0.0.1:{PORT}"
STEP = 4096
SAMPLING = {"temperature": 1.0, "top_p": 1.0, "top_k": 0, "min_p": 0.0}

# server variants: name -> launch options
VARIANTS = {
    "f16_ub512": dict(ub=512, kv="f16"),
    "f16_ub2048": dict(ub=2048, kv="f16"),
    "f16_ub128": dict(ub=128, kv="f16"),
    "q8_ub512": dict(ub=512, kv="q8_0"),
    "f16_ub512_dspark": dict(ub=512, kv="f16", dspark=True),
    "f16_ub512_mmproj": dict(ub=512, kv="f16", mmproj=True),
    "f16_ub512_nothink": dict(ub=512, kv="f16", extra=("--reasoning-budget", "0")),   # thinking switched off
    "q8_ub512_dspark": dict(ub=512, kv="q8_0", dspark=True),
}
CEILING_VARIANTS = ["f16_ub512", "f16_ub2048", "f16_ub128", "q8_ub512", "f16_ub512_dspark", "f16_ub512_mmproj"]

os.makedirs(OUT, exist_ok=True)
proc = None
log_path = None
_tokens = None
_done = None


def say(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def done(key):
    global _done
    if _done is None:
        _done = set()
        if os.path.exists(RESULTS):
            for line in open(RESULTS):
                try:
                    _done.add(json.loads(line)["key"])
                except (ValueError, KeyError):
                    pass
    return key in _done


def record(key, **kw):
    kw = {k: v for k, v in kw.items() if not k.startswith("_")}
    with open(RESULTS, "a") as f:
        f.write(json.dumps(dict(key=key, **kw)) + "\n")
    done(key)
    _done.add(key)
    say("RESULT", key, json.dumps(kw)[:400])


def results(phase):
    out = []
    if os.path.exists(RESULTS):
        for line in open(RESULTS):
            d = json.loads(line)
            if d.get("phase") == phase:
                out.append(d)
    return out


def vram_used():
    out = subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                         capture_output=True, text=True).stdout
    return int(out.split()[0])


def http_json(path, body=None, timeout=3600):
    req = urllib.request.Request(URL + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def stop():
    global proc
    if proc is not None:
        proc.terminate()
        try:
            proc.wait(timeout=60)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        proc = None
    for _ in range(60):
        if vram_used() < 1500:
            return
        time.sleep(1)


def start(ctx, ub=512, kv="f16", dspark=False, mmproj=False, parallel=1, extra=(), tag=""):
    """Launch llama-server; True once /health is OK, False if it exits (for example out of memory)."""
    global proc, log_path
    stop()
    cmd = [f"{BIN}/llama-server", "-m", MODEL, "-c", str(ctx), "-b", str(max(2048, ub)), "-ub", str(ub),
           "-ngl", "99", "-fa", "on", "--parallel", str(parallel), "--jinja", "--no-webui",
           "--host", "127.0.0.1", "--port", str(PORT)]
    if kv != "f16":
        cmd += ["--cache-type-k", kv, "--cache-type-v", kv]
    if dspark:
        cmd += ["--model-draft", DRAFT, "--spec-type", "draft-dspark", "--spec-draft-n-max", "2",
                "--n-gpu-layers-draft", "99"]
    if mmproj:
        cmd += ["--mmproj", MMPROJ]
    cmd += list(extra)
    log_path = f"{OUT}/server_{tag or 'run'}.log"
    env = dict(os.environ, LD_LIBRARY_PATH=BIN + ":" + os.environ.get("LD_LIBRARY_PATH", ""))
    proc = subprocess.Popen(cmd, cwd=BIN, env=env, stdout=open(log_path, "w"), stderr=subprocess.STDOUT)
    t0 = time.time()
    while time.time() - t0 < 600:
        if proc.poll() is not None:
            return False
        try:
            if http_json("/health", timeout=5).get("status") == "ok":
                return True
        except (urllib.error.URLError, OSError, ValueError):
            pass
        time.sleep(0.5)
    return False


def corpus_tokens():
    """Token ids of a long, real code corpus (local llama.cpp sources), cached on disk."""
    global _tokens
    cache = f"{OUT}/corpus_tokens.json"
    if _tokens is None and os.path.exists(cache):
        _tokens = json.load(open(cache))
    if _tokens is None:
        text = ""
        for g in CORPUS_GLOBS:
            for p in sorted(glob.glob(g)):
                text += f"\n// FILE: {os.path.basename(p)}\n" + open(p, errors="replace").read()
        text = text[:1_200_000]
        toks = []
        for i in range(0, len(text), 200_000):
            toks += http_json("/tokenize", {"content": text[i:i + 200_000]})["tokens"]
        _tokens = toks
        json.dump(toks, open(cache, "w"))
        say(f"corpus: {len(text)} chars, {len(toks)} tokens")
    return _tokens


def code_text(n_tokens, offset=0):
    toks = corpus_tokens()
    toks = toks[offset:] + toks[:offset]
    while len(toks) < n_tokens:
        toks = toks + toks
    return http_json("/detokenize", {"tokens": toks[:n_tokens]})["content"]


def chat(messages, max_tokens=256, tools=None, effort=None, cache_prompt=False, seed=1, timeout=3600):
    """One streamed chat completion with client-side timing.

    ttft_s: first token of any kind (thinking included). ttfa_s: first answer token (content or tool call).
    """
    body = dict(SAMPLING, seed=seed, messages=messages, max_tokens=max_tokens, cache_prompt=cache_prompt,
                stream=True, stream_options={"include_usage": True})
    if tools:
        body["tools"] = tools
    if effort:
        body["reasoning_effort"] = effort
    req = urllib.request.Request(URL + "/v1/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    content, reasoning, calls, tm, finish, ttft, ttfa = "", "", {}, {}, None, None, None
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            for raw in r:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data: "):
                    continue
                if line == "data: [DONE]":
                    break
                d = json.loads(line[6:])
                now = time.time() - t0
                if "error" in d:
                    return {"error": json.dumps(d["error"])[:300]}
                tm = d.get("timings") or tm
                for c in d.get("choices", []):
                    finish = c.get("finish_reason") or finish
                    dl = c.get("delta") or {}
                    if dl.get("reasoning_content"):
                        ttft = now if ttft is None else ttft
                        reasoning += dl["reasoning_content"]
                    if dl.get("content"):
                        ttft = now if ttft is None else ttft
                        ttfa = now if ttfa is None else ttfa
                        content += dl["content"]
                    for tc in dl.get("tool_calls") or []:
                        ttft = now if ttft is None else ttft
                        ttfa = now if ttfa is None else ttfa
                        slot = calls.setdefault(tc.get("index", 0), {"name": "", "arguments": ""})
                        fn = tc.get("function") or {}
                        slot["name"] += fn.get("name") or ""
                        slot["arguments"] += fn.get("arguments") or ""
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}: {e.read()[:300].decode(errors='replace')}"}
    except (urllib.error.URLError, OSError, http.client.HTTPException, ValueError) as e:
        return {"error": f"{type(e).__name__}: {e}"}
    if not tm:                                   # stream ended without the final timings chunk: the server died
        return {"error": "truncated response (server crashed or closed the stream)"}
    r3 = lambda x: None if x is None else round(x, 3)
    return {"total_s": r3(time.time() - t0), "ttft_s": r3(ttft), "ttfa_s": r3(ttfa),
            "prompt_n": tm.get("prompt_n"), "cached_n": tm.get("cache_n"),
            "prefill_s": r3((tm.get("prompt_ms") or 0) / 1000), "prefill_tps": round(tm.get("prompt_per_second") or 0, 1),
            "gen_n": tm.get("predicted_n"), "decode_tps": round(tm.get("predicted_per_second") or 0, 1),
            "draft_n": tm.get("draft_n"), "draft_accepted": tm.get("draft_n_accepted"),
            "finish": finish, "vram_mib": vram_used(),
            "_content": content, "_reasoning": reasoning, "_calls": [calls[i] for i in sorted(calls)]}


def summarize_msg(n_tokens):
    return [{"role": "user", "content": "Here is some C++ code:\n\n" + code_text(n_tokens) +
             "\n\nIn five bullet points, summarize what this code does."}]


# ----------------------------------------------------------------------------- ceiling
def phase_ceiling():
    for name in CEILING_VARIANTS:
        opt = VARIANTS[name]
        key = f"ceiling|{name}"
        if done(key):
            continue
        lo, hi = 4, 262144 // STEP              # units of STEP; 16K is assumed to load
        if start(hi * STEP, tag="ceil", **opt):
            lo = hi
        while hi - lo > 1:
            mid = (lo + hi) // 2
            ok = start(mid * STEP, tag="ceil", **opt)
            say(f"  load test {name} ctx={mid * STEP}: {'ok' if ok else 'FAIL'}")
            lo, hi = (mid, hi) if ok else (lo, mid)
        load_max = ctx = lo * STEP
        while ctx >= 16384:                     # confirm with a nearly full prompt, step down on failure
            if start(ctx, tag=f"fill_{name}", **opt):
                v0 = vram_used()
                r = chat(summarize_msg(ctx - 1400), 64)
                if "error" not in r and proc.poll() is None:
                    record(key, phase="ceiling", variant=name, max_ctx=ctx, load_max_ctx=load_max,
                           vram_after_load_mib=v0, **r)
                    break
                say(f"  fill test failed for {name} at ctx={ctx}: {r.get('error')}")
            ctx -= STEP
    stop()


def ceilings():
    return {d["variant"]: d["max_ctx"] for d in results("ceiling")}


# ----------------------------------------------------------------------------- ubsweep
def phase_ubsweep():
    ctx = 65536
    for kv in ("f16", "q8_0"):
        for ub in ((128, 256, 512, 1024, 2048, 4096) if kv == "f16" else (512, 2048)):
            keys = [f"ubsweep|{kv}|ub{ub}|n{n}|rep{rep}" for n in (8000, 48000) for rep in (1, 2)]
            if all(done(k) for k in keys):
                continue
            if not start(ctx, ub=ub, kv=kv, tag="ubsweep"):
                say("skip ubsweep: failed to start", kv, ub)
                continue
            v0 = vram_used()
            chat(summarize_msg(500), 16)
            for n in (8000, 48000):
                for rep in (1, 2):
                    r = chat(summarize_msg(n), 64)
                    record(f"ubsweep|{kv}|ub{ub}|n{n}|rep{rep}", phase="ubsweep", kv=kv, ub=ub, ctx=ctx,
                           target_prompt=n, rep=rep, vram_after_load_mib=v0, **r)
    stop()


# ----------------------------------------------------------------------------- curve
CURVE_SIZES = [1000, 2000, 4000, 8000, 16000, 32000, 48000, 64000, 96000, 128000, 160000, 192000, 224000, 256000]


def phase_curve(variants=("f16_ub512", "f16_ub2048", "q8_ub512", "f16_ub512_dspark")):
    ceil = ceilings()
    for name in variants:
        if name not in ceil:
            say("skip curve: no ceiling for", name)
            continue
        ctx = ceil[name]
        sizes = [n for n in CURVE_SIZES if n <= ctx - 2500]
        if all(done(f"curve|{name}|n{n}|follow_up") for n in sizes):
            continue
        if not start(ctx, tag=f"curve_{name}", **VARIANTS[name]):
            continue
        chat(summarize_msg(500), 16)
        for n in sizes:
            if done(f"curve|{name}|n{n}|follow_up"):
                continue
            msgs = summarize_msg(n)
            r = chat(msgs, 200, cache_prompt=True)       # nothing useful is cached: every size starts differently
            record(f"curve|{name}|n{n}|cold", phase="curve", variant=name, ctx=ctx, target_prompt=n, turn="cold", **r)
            if "error" in r:
                break
            msgs = msgs + [{"role": "assistant", "content": r["_content"] or "Summary omitted."},
                           {"role": "user", "content": "Now name the three most important functions, one line each."}]
            r2 = chat(msgs, 200, cache_prompt=True)
            record(f"curve|{name}|n{n}|follow_up", phase="curve", variant=name, ctx=ctx, target_prompt=n,
                   turn="follow_up", **r2)
    stop()


# ----------------------------------------------------------------------------- tools
def fn(name, desc, props, required):
    return {"type": "function", "function": {"name": name, "description": desc,
            "parameters": {"type": "object", "properties": props, "required": required}}}


S = {"type": "string"}
I = {"type": "integer"}
B = {"type": "boolean"}
TOOLS = [
    fn("read_file", "Read a text file from the repository. Optionally read a line range.",
       {"path": S, "offset": dict(I, description="1-based first line to read"), "limit": dict(I, description="number of lines to read")}, ["path"]),
    fn("write_file", "Create or overwrite a file with the given content.", {"path": S, "content": S}, ["path", "content"]),
    fn("edit_file", "Replace an exact string in a file.",
       {"path": S, "old_string": S, "new_string": S, "replace_all": B}, ["path", "old_string", "new_string"]),
    fn("run_command", "Run a shell command in the repository root and return its output.",
       {"command": S, "timeout_seconds": I}, ["command"]),
    fn("grep", "Search file contents with a regular expression.",
       {"pattern": S, "path": S, "glob": dict(S, description="file filter such as *.py"), "case_insensitive": B}, ["pattern"]),
    fn("list_directory", "List the files and folders in a directory.", {"path": S}, ["path"]),
    fn("web_search", "Search the web for current information.", {"query": S}, ["query"]),
    fn("ask_user", "Ask the user a clarifying question.", {"question": S}, ["question"]),
]
SYSTEM = ("You are a coding agent working in a git repository. Use the provided tools when you need to inspect or change "
          "files or run commands. When the user asks for a specific action, do it directly with the right tool.")


def args_of(call):
    try:
        a = json.loads(call["arguments"] or "{}")
        return a if isinstance(a, dict) else None
    except ValueError:
        return None


def one(name, check):
    """Pass if any call in the turn is `name` with arguments that satisfy check."""
    def f(calls, content):
        for c in calls:
            a = args_of(c)
            if c["name"] == name and a is not None and check(a):
                return True
        return False
    return f


def any_of(*fs):
    return lambda calls, content: any(f(calls, content) for f in fs)


def no_tool(pattern):
    return lambda calls, content: not calls and re.search(pattern, content, re.I | re.S) is not None


def norm(p):
    return str(p).lstrip("./").rstrip("/")


def tool_msg(i, name, args):
    return {"role": "assistant", "content": None,
            "tool_calls": [{"id": f"call_{i}", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]}


def tool_result(i, text):
    return {"role": "tool", "tool_call_id": f"call_{i}", "content": text}


APP_PY = "import http.server\n\ndef main():\n    server = http.server.HTTPServer(('0.0.0.0', 8642), http.server.SimpleHTTPRequestHandler)\n    print('serving static files')\n    server.serve_forever()\n\nif __name__ == '__main__':\n    main()\n"
PYTEST_OUT = "F.                                                                 [100%]\n=== FAILURES ===\n___ test_add ___\n    def test_add():\n>       assert add(2, 2) == 4\nE       assert 0 == 4\nE        +  where 0 = add(2, 2)\ntests/test_calc.py:5: AssertionError\n1 failed, 1 passed in 0.02s"
U = lambda t: [{"role": "user", "content": t}]
TOOL_CASES = [
    ("read", U("Show me the contents of src/utils/date.py"), one("read_file", lambda a: norm(a.get("path")) == "src/utils/date.py")),
    ("pytest", U("Run the test suite with pytest in quiet mode."), one("run_command", lambda a: "pytest" in a.get("command", "") and ("-q" in a["command"] or "--quiet" in a["command"]))),
    ("grep", U("Find every place where the function parse_config is called in this repo."), one("grep", lambda a: "parse_config" in a.get("pattern", ""))),
    ("write", U("Create a file named hello.py that prints 'hello world'."), one("write_file", lambda a: norm(a.get("path")) == "hello.py" and "print" in a.get("content", ""))),
    ("list", U("What files are in the docs folder?"), one("list_directory", lambda a: norm(a.get("path")) == "docs")),
    ("edit", U("In config.yaml there is a line `debug: true`. Change it to `debug: false`."),
     any_of(one("edit_file", lambda a: norm(a.get("path")) == "config.yaml" and "debug: true" in a.get("old_string", "") and "debug: false" in a.get("new_string", "")),
            one("read_file", lambda a: norm(a.get("path")) == "config.yaml"))),
    ("web", U("Search the web for the newest stable Rust compiler version."), one("web_search", lambda a: "rust" in a.get("query", "").lower())),
    ("no_tool_math", U("What is 17 * 23? Answer with just the number."), no_tool(r"\b391\b")),
    ("no_tool_explain", U("Explain what a Python decorator is in two sentences."), no_tool(r"function")),
    ("read_range", U("Read lines 100 to 150 of server/app.py"), one("read_file", lambda a: norm(a.get("path")) == "server/app.py" and a.get("offset") in (99, 100) and a.get("limit") in (50, 51))),
    ("grep_glob", U("Search for TODO comments, but only in TypeScript files."), one("grep", lambda a: "TODO" in a.get("pattern", "") and "ts" in str(a.get("glob", "")))),
    ("git", U("Check the git status of this repo."), one("run_command", lambda a: "git status" in a.get("command", ""))),
    ("parallel_read", U("Read both package.json and tsconfig.json."),
     lambda calls, content: {norm((args_of(c) or {}).get("path")) for c in calls if c["name"] == "read_file"} == {"package.json", "tsconfig.json"}),
    ("rm", U("Delete the build directory."), one("run_command", lambda a: "rm" in a.get("command", "") and "build" in a["command"])),
    ("replace_all", U("Replace all occurrences of foo_bar with fooBar in lib/names.js"),
     any_of(one("edit_file", lambda a: norm(a.get("path")) == "lib/names.js" and a.get("old_string") == "foo_bar" and a.get("new_string") == "fooBar" and a.get("replace_all") is True),
            one("read_file", lambda a: norm(a.get("path")) == "lib/names.js"),
            one("run_command", lambda a: "sed" in a.get("command", "") and "foo_bar" in a["command"]))),
    ("answer_after_result", U("Which port does app.py listen on?") + [tool_msg(1, "read_file", {"path": "app.py"}), tool_result(1, APP_PY)], no_tool(r"8642")),
    ("recover_from_error", U("Read src/mian.py") + [tool_msg(1, "read_file", {"path": "src/mian.py"}), tool_result(1, "Error: file not found: src/mian.py. Did you mean src/main.py?")],
     one("read_file", lambda a: norm(a.get("path")) == "src/main.py")),
    ("fix_after_test", U("Run the tests and fix whatever fails.") + [tool_msg(1, "run_command", {"command": "pytest -q"}), tool_result(1, PYTEST_OUT)],
     any_of(one("read_file", lambda a: "calc" in norm(a.get("path"))), one("grep", lambda a: "add" in a.get("pattern", "")),
            one("list_directory", lambda a: True), one("run_command", lambda a: "calc" in a.get("command", "") or "add" in a.get("command", "")))),
]


def run_tool_cases(label, variant, efforts, deep_tokens=0, cases=TOOL_CASES):
    system = SYSTEM
    if deep_tokens:
        system += "\n\nRepository context (selected source files):\n\n" + code_text(deep_tokens, offset=5000)
    for effort in efforts:
        for cname, msgs, check in cases:
            key = f"tools|{label}|{effort}|{cname}"
            if done(key):
                continue
            r = chat([{"role": "system", "content": system}] + msgs, 1500, tools=TOOLS, effort=effort, cache_prompt=True)
            if "error" in r:
                record(key, phase="tools", label=label, variant=variant, effort=effort, case=cname, deep_tokens=deep_tokens, passed=False, **r)
                continue
            calls = r["_calls"]
            valid = all(args_of(c) is not None for c in calls)
            try:
                passed = bool(check(calls, r["_content"]))
            except Exception:
                passed = False
            record(key, phase="tools", label=label, variant=variant, effort=effort, case=cname, deep_tokens=deep_tokens,
                   passed=passed, valid_json=valid, n_calls=len(calls), first_tool=calls[0]["name"] if calls else None,
                   calls=[{"name": c["name"], "arguments": c["arguments"][:200]} for c in calls], answer=r["_content"][:120], **r)


def phase_tools():
    efforts = ("high", "medium", "low", "minimal", "none")
    for name, eff in (("f16_ub512", efforts), ("q8_ub512", ("high", "low")), ("f16_ub512_dspark", ("high", "low")),
                      ("f16_ub512_nothink", ("high",)), ("q8_ub512_dspark", ("high", "low"))):
        if all(done(f"tools|{name}|{e}|{c[0]}") for e in eff for c in TOOL_CASES):
            continue
        if not start(32768, tag=f"tools_{name}", **VARIANTS[name]):
            continue
        run_tool_cases(name, name, eff)
    # the same cases with 60K tokens of code in the system prompt, as in a long agent session
    for name in ("f16_ub512", "q8_ub512", "q8_ub512_dspark"):
        label = f"{name}_deep60k"
        eff = ("high", "low")
        if all(done(f"tools|{label}|{e}|{c[0]}") for e in eff for c in TOOL_CASES):
            continue
        if not start(81920, tag=f"tools_{label}", **VARIANTS[name]):
            continue
        run_tool_cases(label, name, eff, deep_tokens=60000)
    stop()


# ----------------------------------------------------------------------------- coding
from problems import PROBLEMS  # noqa: E402  (list of (name, spec, test_code))

CODE_PROMPT = ("Write Python 3 code for the following task. Reply with exactly one ```python code block containing "
               "the complete solution. No tests and no example usage.\n\n")


def extract_code(text):
    blocks = re.findall(r"```(?:python|py)?\s*\n(.*?)```", text, re.S)
    return blocks[-1] if blocks else text


def run_tests(name, code, tests):
    d = f"{OUT}/code_runs"
    os.makedirs(d, exist_ok=True)
    path = f"{d}/{name}.py"
    open(path, "w").write(code + "\n\n" + tests + "\nprint('ALL_OK')\n")
    try:
        p = subprocess.run([sys.executable, "-I", path], capture_output=True, text=True, timeout=60, cwd=d)
        return "ALL_OK" in p.stdout, (p.stderr or "")[-200:]
    except subprocess.TimeoutExpired:
        return False, "timeout"


def run_coding(label, variant, efforts, seeds):
    for effort in efforts:
        for seed in seeds:
            for name, spec, tests in PROBLEMS:
                key = f"coding|{label}|{effort}|seed{seed}|{name}"
                if done(key):
                    continue
                r = chat([{"role": "user", "content": CODE_PROMPT + spec}], 12000, effort=effort, seed=seed)
                if "error" in r:
                    record(key, phase="coding", label=label, variant=variant, effort=effort, seed=seed, problem=name, passed=False, **r)
                    continue
                passed, err = run_tests(f"{label}_{effort}_s{seed}_{name}", extract_code(r["_content"]), tests)
                record(key, phase="coding", label=label, variant=variant, effort=effort, seed=seed, problem=name,
                       passed=passed, test_error=err if not passed else "", reasoning_chars=len(r["_reasoning"]),
                       answer_chars=len(r["_content"]), **r)


def phase_coding():
    plan = (("q8_ub512_dspark", ("low",), (1, 2)),
            ("f16_ub512", ("low",), (1, 2)),
            ("f16_ub512_dspark", ("low",), (1,)),
            ("q8_ub512", ("low",), (1,)),
            ("f16_ub512", ("none", "medium", "high"), (1,)))
    for name, efforts, seeds in plan:
        if all(done(f"coding|{name}|{e}|seed{s}|{p[0]}") for e in efforts for s in seeds for p in PROBLEMS):
            continue
        if not start(32768, tag=f"coding_{name}", **VARIANTS[name]):
            continue
        chat([{"role": "user", "content": "Say hi."}], 16)
        run_coding(name, name, efforts, seeds)
    stop()


# ----------------------------------------------------------------------------- parallel
def phase_parallel():
    if all(done(f"parallel|np4|n{n}") for n in (1, 2, 4)):
        return
    if not start(65536, ub=512, kv="f16", parallel=4, tag="parallel"):
        say("skip parallel: failed to start")
        return
    chat([{"role": "user", "content": "Say hi."}], 16)
    for n in (1, 2, 4):
        out = [None] * n

        def work(i):
            out[i] = chat([{"role": "user", "content": CODE_PROMPT + PROBLEMS[i][1]}], 600, effort="low", seed=1)
        t0 = time.time()
        ths = [threading.Thread(target=work, args=(i,)) for i in range(n)]
        [t.start() for t in ths]
        [t.join() for t in ths]
        wall = time.time() - t0
        ok = [o for o in out if o and "error" not in o]
        toks = sum(o["gen_n"] or 0 for o in ok)
        record(f"parallel|np4|n{n}", phase="parallel", concurrent=n, ok=len(ok), wall_s=round(wall, 2), total_gen_tokens=toks,
               aggregate_tps=round(toks / wall, 1), per_request_decode_tps=[o["decode_tps"] for o in ok],
               ttft_s=[o["ttft_s"] for o in ok], vram_mib=vram_used())
    stop()


# ----------------------------------------------------------------------------- curve2
def curve_session(name, ctx, sizes):
    """One server session: for each prompt size a truly cold prompt (unique prefix), then a follow-up turn."""
    if not start(ctx, tag=f"curve_{name}", **VARIANTS[name]):
        say(f"  curve {name} ctx={ctx}: failed to load")
        return None
    v0 = vram_used()
    chat([{"role": "user", "content": "Say hi."}], 16)
    rows = []
    for n in sizes:
        msgs = [{"role": "user", "content": f"// benchmark session {n}\nHere is some C++ code:\n\n" +
                 code_text(n, offset=(n * 7) % 50000) + "\n\nIn five bullet points, summarize what this code does."}]
        r = chat(msgs, 200, cache_prompt=True)
        if "error" in r:
            say(f"  curve {name} ctx={ctx}: crashed on the cold {n}-token prompt: {r['error'][:80]}")
            return None
        rows.append(("cold", n, r))
        msgs = msgs + [{"role": "assistant", "content": r["_content"] or "Summary omitted."},
                       {"role": "user", "content": "Now name the three most important functions, one line each."}]
        r2 = chat(msgs, 200, cache_prompt=True)
        if "error" in r2:
            say(f"  curve {name} ctx={ctx}: crashed on the follow-up after {n} tokens: {r2['error'][:80]}")
            return None
        rows.append(("follow_up", n, r2))
    return v0, rows


def phase_curve2(variants=("f16_ub512", "q8_ub512", "f16_ub512_dspark", "q8_ub512_dspark")):
    """Latency vs context length. Also finds the largest context that survives the whole multi-request session."""
    ceil = ceilings()
    for name in variants:
        if done(f"stable|{name}"):
            continue
        ctx = ceil.get(name, 262144)
        while ctx >= 32768:
            sizes = [n for n in CURVE_SIZES if n <= ctx - 6000] + [ctx - 3000]
            out = curve_session(name, ctx, sizes)
            if out:
                v0, rows = out
                for turn, n, r in rows:
                    record(f"curve2|{name}|n{n}|{turn}", phase="curve2", variant=name, ctx=ctx, target_prompt=n, turn=turn, **r)
                record(f"stable|{name}", phase="stable", variant=name, stable_ctx=ctx, single_fill_ctx=ceil.get(name),
                       vram_after_load_mib=v0, peak_vram_mib=max(r["vram_mib"] for _, _, r in rows))
                break
            ctx -= 16384
    stop()


def stable_ctx(name, default=131072):
    for d in results("stable"):
        if d["variant"] == name:
            return d["stable_ctx"]
    return default


# ----------------------------------------------------------------------------- agentloop
def phase_agentloop():
    """A 12-turn tool-calling session behind 40K tokens of context: per-turn latency and how much is re-processed.

    Run twice per variant: with the client sending the model's thinking back each turn, and with it dropped
    (what most OpenAI-compatible clients do).
    """
    turns = 12
    for name in ("f16_ub512", "f16_ub512_dspark", "q8_ub512_dspark"):
        for keep in (True, False):
            label = f"{name}|{'keep' if keep else 'drop'}_reasoning"
            if all(done(f"agentloop|{label}|turn{t}") for t in range(1, turns + 1)):
                continue
            if not start(min(131072, stable_ctx(name)), tag=f"agent_{name}", **VARIANTS[name]):
                continue
            system = SYSTEM + "\n\nRepository context (selected source files):\n\n" + code_text(40000, offset=9000)
            msgs = [{"role": "system", "content": system},
                    {"role": "user", "content": "Investigate how sampling works in this codebase. Read the relevant files "
                                                "one at a time with the tools, then summarize."}]
            for t in range(1, turns + 1):
                r = chat(msgs, 1500, tools=TOOLS, effort="low", cache_prompt=True)
                key = f"agentloop|{label}|turn{t}"
                if "error" in r:
                    record(key, phase="agentloop", variant=name, keep_reasoning=keep, turn=t, **r)
                    break
                calls = r["_calls"]
                record(key, phase="agentloop", variant=name, keep_reasoning=keep, turn=t, n_calls=len(calls),
                       valid_json=all(args_of(c) is not None for c in calls), reasoning_chars=len(r["_reasoning"]), **r)
                a = {"role": "assistant", "content": r["_content"] or (None if calls else "(no reply)")}
                if keep and r["_reasoning"]:
                    a["reasoning_content"] = r["_reasoning"]
                if calls:
                    a["tool_calls"] = [{"id": f"call_{t}_{i}", "type": "function",
                                        "function": {"name": c["name"], "arguments": c["arguments"]}} for i, c in enumerate(calls)]
                msgs.append(a)
                if calls:
                    for i in range(len(calls)):
                        msgs.append({"role": "tool", "tool_call_id": f"call_{t}_{i}",
                                     "content": code_text(300, offset=60000 + 900 * t + 350 * i)})
                else:
                    msgs.append({"role": "user", "content": "Continue: read the next relevant file."})
    stop()


# ----------------------------------------------------------------------------- codedepth
def phase_codedepth():
    """Code generation with N tokens of code already in the context: speed, DSpark acceptance and correctness."""
    plan = (("f16_ub512_dspark", 139264, (0, 32000, 64000, 96000, 120000)),
            ("q8_ub512", 196608, (0, 32000, 64000, 96000, 120000, 160000)),
            ("q8_ub512_dspark", 196608, (0, 32000, 64000, 96000, 120000, 160000)))
    probs = [PROBLEMS[i] for i in (0, 4, 10, 12)]       # min_window, topo_order, LRUCache, min_meeting_rooms
    for name, ctx, depths in plan:
        if all(done(f"codedepth|{name}|d{d}|{pr[0]}") for d in depths for pr in probs):
            continue
        if not start(ctx, tag=f"codedepth_{name}", **VARIANTS[name]):
            say("skip codedepth: failed to start", name)
            continue
        chat([{"role": "user", "content": "Say hi."}], 16)
        dead = False
        for d in depths:
            system = "You are a coding assistant."
            if d:
                system += "\n\nRepository context (selected source files):\n\n" + code_text(d, offset=3000 + d % 7000)
            for pname, spec, tests in probs:
                key = f"codedepth|{name}|d{d}|{pname}"
                if done(key) or dead:
                    continue
                r = chat([{"role": "system", "content": system}, {"role": "user", "content": CODE_PROMPT + spec}],
                         6000, effort="low", cache_prompt=True)
                if "error" in r:
                    record(key, phase="codedepth", variant=name, ctx=ctx, depth=d, problem=pname, passed=False, **r)
                    dead = proc.poll() is not None
                    continue
                passed, err = run_tests(f"depth_{name}_{d}_{pname}", extract_code(r["_content"]), tests)
                record(key, phase="codedepth", variant=name, ctx=ctx, depth=d, problem=pname, passed=passed,
                       test_error=err if not passed else "", **r)
    stop()


PHASES = {"ceiling": phase_ceiling, "ubsweep": phase_ubsweep, "curve2": phase_curve2, "tools": phase_tools,
          "parallel": phase_parallel, "agentloop": phase_agentloop, "coding": phase_coding,
          "codedepth": phase_codedepth}

if __name__ == "__main__":
    names = sys.argv[1:] or list(PHASES)
    try:
        for n in names:
            say("=== phase", n)
            PHASES[n]()
    finally:
        stop()
    say("ALL DONE")
