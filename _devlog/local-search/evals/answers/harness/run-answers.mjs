#!/usr/bin/env node
// Answer questions from supplied passages with one small language model in real Chromium (a Web Worker running Transformers.js), greedy, one line of JSON per item written as it is finished.
// See README.md in this folder. Example:
//   node run-answers.mjs --items items.json --model qwen3 --backend webgpu --out out/qwen3-webgpu.jsonl
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { MODELS, BACKENDS } from './models.mjs';
import { MODES, openSession } from './browser.mjs';
import { defaultCacheDir } from './server.mjs';
import { environment, generateOne, loadModel, portFor, promptRecord, settingsFor, sha } from './core.mjs';
import { buildMessages } from './prompt.mjs';

const USAGE = `usage: node run-answers.mjs --items <items.json> --model <${Object.keys(MODELS).join('|')}> --backend <webgpu|wasm> --out <file.jsonl>
options:
  --mode headless|headed|shell   Chromium mode (default headless; headless and headed give the real GPU, shell gives only a software adapter)
  --max-new-tokens N             generation cap (default from prompt.mjs)
  --max-sentences N              stop after N complete sentences, 0 for no sentence stop (default from prompt.mjs)
  --repetition-penalty X         default from models.mjs
  --dtype q4f16|q4|...           quantization to load instead of the one in models.mjs (e.g. q4 if q4f16 does not run on WebAssembly)
  --limit N                      only the first N items (for a try)
  --cache-dir DIR                model files and browser profiles (default $ANSWER_MODEL_CACHE or ~/.cache/local-search-answer-models)
  --fresh-profile                start with an empty browser cache (cold load) instead of reusing this model's profile
  --timeout-min N                give up on one load or one answer after N minutes (default 20)
  --port N                       local server port (default derived from model, quantization and backend; the browser's cache is keyed by it)
  --chromium-flags a,b           extra Chromium flags, replacing the defaults (none are needed on the Mac of feasibility.md)
  --force                        discard an existing output file instead of resuming it
  --no-warmup                    skip the short warm-up generation after loading`;

function parseArgs(argv) {
  const args = {};
  const flags = new Set(['force', 'fresh-profile', 'no-warmup', 'help']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}\n${USAGE}`);
    const name = a.slice(2);
    if (flags.has(name)) args[name] = true;
    else { args[name] = argv[++i]; if (args[name] === undefined) throw new Error(`--${name} needs a value`); }
  }
  return args;
}

const num = (v, name) => { if (v === undefined) return undefined; const n = Number(v); if (!Number.isFinite(n)) throw new Error(`--${name} must be a number`); return n; };

export function readItems(file) {
  const text = readFileSync(file, 'utf8');
  const items = JSON.parse(text);
  if (!Array.isArray(items)) throw new Error('items file must be a JSON array');
  const seen = new Set();
  for (const item of items) {
    if (typeof item.id !== 'string' || typeof item.question !== 'string' || !Array.isArray(item.passages)) throw new Error(`bad item ${JSON.stringify(item.id)}: need { id, question, passages: [{ title, text }] }`);
    if (seen.has(item.id)) throw new Error(`duplicate id ${item.id}`);
    seen.add(item.id);
    for (const p of item.passages) if (typeof p.title !== 'string' || typeof p.text !== 'string') throw new Error(`bad passage in ${item.id}: need { title, text }`);
  }
  return { items, sha: sha(text) };
}

// Read an existing output: its header and the ids that finished without an error
export function readOutput(file) {
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  const header = rows.find(r => r.type === 'run');
  const done = new Map();
  for (const r of rows) if (r.type === 'item' && !r.error) done.set(r.id, r);
  return { header, done, rows };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); return; }
  for (const need of ['items', 'model', 'backend', 'out']) if (!args[need]) throw new Error(`--${need} is required\n${USAGE}`);
  const key = args.model;
  const backend = args.backend;
  if (!MODELS[key]) throw new Error(`unknown model ${key}; choose ${Object.keys(MODELS).join(', ')}`);
  if (!BACKENDS.includes(backend)) throw new Error(`backend must be ${BACKENDS.join(' or ')}`);
  if (!MODELS[key].backends.includes(backend)) console.error(`warning: ${key} is not known to load on ${backend} (see models.mjs); trying anyway`);
  const mode = args.mode ?? 'headless';
  if (!MODES.includes(mode)) throw new Error(`--mode must be ${MODES.join(', ')}`);
  const model = MODELS[key];
  const dtype = args.dtype ?? model.dtype;
  const { items: allItems, sha: itemsSha } = readItems(resolve(args.items));
  const items = args.limit ? allItems.slice(0, Number(args.limit)) : allItems;
  const settings = settingsFor(key, { maxNewTokens: num(args['max-new-tokens'], 'max-new-tokens'), maxSentences: num(args['max-sentences'], 'max-sentences'), repetitionPenalty: num(args['repetition-penalty'], 'repetition-penalty') });
  const out = resolve(args.out);
  mkdirSync(dirname(out), { recursive: true });
  const identity = { model: key, repo: model.repo, revision: model.revision, dtype, backend, settingsSha: sha(JSON.stringify(settings)), promptSha: promptRecord().sha, itemsSha };

  let done = new Map();
  if (existsSync(out) && !args.force) {
    const prior = readOutput(out);
    if (prior.header) {
      for (const k of Object.keys(identity)) if (prior.header.identity?.[k] !== identity[k]) throw new Error(`${out} was made with a different ${k} (${prior.header.identity?.[k]} against ${identity[k]}); use --force to start it over, or another --out`);
      done = prior.done;
      console.error(`resuming ${out}: ${done.size} of ${items.length} items already done`);
    }
  } else if (existsSync(out)) writeFileSync(out, '');

  const cacheDir = args['cache-dir'] ? resolve(args['cache-dir']) : defaultCacheDir();
  const profileDir = args['fresh-profile'] ? undefined : join(cacheDir, 'profiles', `${key}-${dtype}-${backend}-${mode}`);
  if (profileDir) mkdirSync(profileDir, { recursive: true });
  const session = await openSession({ mode, backend, profileDir, cacheDir, port: args.port ? Number(args.port) : portFor(`${key}-${dtype}-${backend}`), callTimeoutMs: Number(args['timeout-min'] ?? 20) * 60000, extraArgs: args['chromium-flags'] ? args['chromium-flags'].split(',').filter(Boolean) : undefined, log: m => console.error(m) });
  const t0 = performance.now();
  try {
    const probe = (await session.call('probe')).result;
    if (backend === 'webgpu' && (!probe.adapter || probe.adapter.isFallbackAdapter || !probe.shaderF16)) console.error(`warning: WebGPU adapter is ${JSON.stringify(probe.adapter)}, shader-f16 ${probe.shaderF16}; q4f16 needs a real adapter with shader-f16`);
    const load = await loadModel(session, key, backend, dtype);
    if (!load.ok) throw new Error(`load failed: ${load.error.message}`);
    console.error(`${model.label} loaded on ${backend} in ${(load.wallMs / 1000).toFixed(1)} s (${(load.bytesModelFiles / 1e6).toFixed(1)} MB fetched)`);
    const header = {
      type: 'run', date: new Date().toISOString(), identity, mode, chromiumFlags: args['chromium-flags'] ?? 'none',
      prompt: promptRecord(), settings, exampleMessages: buildMessages(items[0]?.question ?? '', items[0]?.passages ?? []),
      environment: environment(probe),
      load: { ok: true, wallMs: Math.round(load.wallMs), bytesModelFiles: load.bytesModelFiles, bytesRuntime: load.bytesRuntime, files: load.files },
    };
    if (!done.size) writeFileSync(out, '');
    appendFileSync(out, `${JSON.stringify(header)}\n`);

    if (!args['no-warmup'] && items.length) {
      const w = await generateOne(session, key, items[0], { ...settings, maxNewTokens: 8, maxSentences: 0 });
      console.error(w.ok ? `warm-up ${Math.round(w.ms)} ms` : `warm-up failed: ${w.error.message}`);
    }

    let failures = 0;
    let n = 0;
    for (const item of items) {
      n++;
      if (done.has(item.id)) continue;
      let r = await generateOne(session, key, item, settings);
      if (!r.ok) {
        // One reload and one retry: a lost GPU device shows up as an error from the next run call
        console.error(`${item.id}: ${r.error.message}; reloading the model once`);
        await session.call('dispose');
        const again = await loadModel(session, key, backend, dtype);
        r = again.ok ? await generateOne(session, key, item, settings) : { ok: false, error: again.error };
      }
      if (r.ok) {
        failures = 0;
        appendFileSync(out, `${JSON.stringify({ type: 'item', id: item.id, answer: r.answer, tokens: r.tokens, ms: Math.round(r.ms), stop: r.stop, promptTokens: r.promptTokens, ttftMs: Math.round(r.ttftMs ?? 0), decodeTokensPerSecond: r.decodeTokensPerSecond ? +r.decodeTokensPerSecond.toFixed(1) : null, raw: r.raw, prompt: r.prompt })}\n`);
        console.error(`[${n}/${items.length}] ${item.id}: ${r.tokens} tokens, ${Math.round(r.ms)} ms, ${r.stop}`);
      } else {
        failures++;
        appendFileSync(out, `${JSON.stringify({ type: 'item', id: item.id, error: r.error.message })}\n`);
        console.error(`[${n}/${items.length}] ${item.id}: FAILED ${r.error.message}`);
        if (failures >= 3) throw new Error('three items in a row failed; stopping (rerun to resume)');
      }
    }
    const final = readOutput(out);
    appendFileSync(out, `${JSON.stringify({ type: 'end', date: new Date().toISOString(), itemsDone: final.done.size, itemsTotal: items.length, runMs: Math.round(performance.now() - t0), peakBrowserMemoryBytes: session.memory.peak, peakByProcessType: session.memory.peakByType, bytesModelFilesThisRun: session.server.stats.model })}\n`);
    // A plain JSON copy next to the JSONL, in item order, when every item has an answer
    if (final.done.size === items.length) {
      const rows = items.map(item => { const r = final.done.get(item.id); return { id: item.id, answer: r.answer, tokens: r.tokens, ms: r.ms, stop: r.stop }; });
      writeFileSync(out.replace(/\.jsonl$/, '') + '.json', JSON.stringify({ run: { identity, settings, prompt: header.prompt, environment: header.environment }, items: rows }, null, 1) + '\n');
    }
    console.error(`done: ${final.done.size} of ${items.length} items in ${out}`);
  } finally {
    await session.close();
  }
}

main().catch(error => { console.error(error.message); process.exit(1); });
