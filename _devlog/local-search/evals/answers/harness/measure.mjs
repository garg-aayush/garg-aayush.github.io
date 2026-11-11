#!/usr/bin/env node
// Feasibility measurements for one model on one backend: cold load (empty browser cache), speed on a four passage prompt, three sanity questions, then a second load from the browser cache.
//   node measure.mjs --model qwen3 --backend webgpu [--dtype q4] [--mode headless] [--out results/qwen3-webgpu.json] [--cache-dir DIR]
// Files come from the local disk cache of server.mjs (fetched once from huggingface.co), so "cold" means an empty browser cache and a local transfer, not network time.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS } from './models.mjs';
import { openSession } from './browser.mjs';
import { defaultCacheDir } from './server.mjs';
import { environment, generateOne, loadModel, portFor, promptRecord, settingsFor } from './core.mjs';
import { buildMessages } from './prompt.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const key = arg('model');
const backend = arg('backend');
if (!MODELS[key] || !['webgpu', 'wasm'].includes(backend)) { console.error('usage: node measure.mjs --model <qwen3|granite|lfm|qwen35> --backend <webgpu|wasm> [--dtype q4] [--mode headless] [--reps 3] [--out file]'); process.exit(1); }
const model = MODELS[key];
const dtype = arg('dtype', model.dtype);
const mode = arg('mode', 'headless');
const reps = Number(arg('reps', backend === 'wasm' ? 1 : 3));
const cacheDir = arg('cache-dir') ? resolve(arg('cache-dir')) : defaultCacheDir();
const out = resolve(arg('out', join(here, 'results', `${key}-${dtype}-${backend}.json`)));
mkdirSync(dirname(out), { recursive: true });

const items = JSON.parse(readFileSync(join(here, 'data/sanity-items.json'), 'utf8'));
// The speed prompt: the same four passages and a question that invites a long answer; generation is forced to 60 tokens (no early end) so the rate is steady
const SPEED_QUESTION = 'Describe everything these passages say about the weather station.';
const speedItem = { messages: buildMessages(SPEED_QUESTION, items[0].passages) };
const speedSettings = { ...settingsFor(key, { maxNewTokens: 60, maxSentences: 0, minNewTokens: 60 }) };
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const round = (n, d = 0) => (n == null ? null : +n.toFixed(d));

async function phase({ profileDir, label, runSanity }) {
  const session = await openSession({ mode, backend, profileDir, cacheDir, port: portFor(`measure-${key}-${dtype}-${backend}`), callTimeoutMs: Number(arg('timeout-min', 20)) * 60000, log: m => console.error(m) });
  const result = { label };
  try {
    result.probe = (await session.call('probe')).result;
    const load = await loadModel(session, key, backend, dtype);
    result.load = { ok: load.ok, error: load.error, wallMs: round(load.wallMs), tokenizerMs: round(load.tokenizerMs), lastFileDoneMs: round(load.lastFileDoneMs), sessionInitMs: round(load.sessionInitMs), bytesModelFiles: load.bytesModelFiles, bytesRuntime: load.bytesRuntime, files: load.files, consoleMessages: load.messages.slice(0, 8) };
    console.error(`${label}: load ${load.ok ? 'ok' : 'FAILED ' + load.error?.message} ${round(load.wallMs)} ms, ${load.bytesModelFiles} model bytes, ${load.bytesRuntime} runtime bytes`);
    result.memoryAfterLoad = session.memoryNow();
    if (!load.ok) return result;
    // First generation after the load (shader and kernel setup included)
    const first = await generateOne(session, key, speedItem, speedSettings);
    result.firstGeneration = first.ok ? { promptTokens: first.promptTokens, tokens: first.tokens, ms: round(first.ms), ttftMs: round(first.ttftMs), decodeTokensPerSecond: round(first.decodeTokensPerSecond, 1) } : { error: first.error };
    console.error(`${label}: first generation`, JSON.stringify(result.firstGeneration));
    if (first.ok && reps > 0) {
      const runs = [];
      for (let i = 0; i < reps; i++) {
        const r = await generateOne(session, key, speedItem, speedSettings);
        if (!r.ok) { runs.push({ error: r.error }); break; }
        runs.push({ promptTokens: r.promptTokens, tokens: r.tokens, ms: round(r.ms), ttftMs: round(r.ttftMs), decodeTokensPerSecond: round(r.decodeTokensPerSecond, 1), raw: r.raw });
      }
      result.speedRuns = runs;
      const ok = runs.filter(r => !r.error);
      result.speed = ok.length ? { promptTokens: ok[0].promptTokens, tokens: ok[0].tokens, ttftMsMedian: round(median(ok.map(r => r.ttftMs))), decodeTokensPerSecondMedian: round(median(ok.map(r => r.decodeTokensPerSecond)), 1), prefillTokensPerSecondMedian: round(median(ok.map(r => r.promptTokens / (r.ttftMs / 1000))), 0) } : null;
      console.error(`${label}: speed`, JSON.stringify(result.speed));
    }
    result.memoryAfterGenerate = session.memoryNow();
    if (runSanity && first.ok) {
      result.sanity = [];
      const settings = settingsFor(key);
      for (const item of items) {
        const r = await generateOne(session, key, item, settings);
        result.sanity.push(r.ok ? { id: item.id, question: item.question, answer: r.answer, raw: r.raw, tokens: r.tokens, stop: r.stop, ms: round(r.ms), ttftMs: round(r.ttftMs), promptTokens: r.promptTokens, prompt: item.id === items[0].id ? r.prompt : undefined } : { id: item.id, error: r.error });
        console.error(`${label}: ${item.id}:`, r.ok ? r.answer : r.error.message);
      }
    }
  } catch (error) {
    result.crash = String(error.stack ?? error);
    console.error(`${label}: crashed: ${error.message}`);
  } finally {
    result.peakMemory = { bytes: session.memory.peak, byProcessType: session.memory.peakByType };
    result.serverTotals = { model: session.server.stats.model, runtime: session.server.stats.runtime, requests: session.server.stats.requests.length };
    result.consoleMessages = session.messages.slice(0, 12);
    await session.close().catch(() => {});
  }
  return result;
}

const profileDir = mkdtempSync(join(tmpdir(), `answer-measure-${key}-${backend}-`));
const record = { model: key, label: model.label, repo: model.repo, revision: model.revision, dtype, backend, mode, reps, date: new Date().toISOString(), prompt: promptRecord(), speedPrompt: { question: SPEED_QUESTION, settings: speedSettings } };
record.cold = await phase({ profileDir, label: `${key}/${backend}/cold`, runSanity: true });
record.environment = environment(record.cold.probe);
if (record.cold.load?.ok) record.cache = await phase({ profileDir, label: `${key}/${backend}/from-cache`, runSanity: false });
writeFileSync(out, JSON.stringify(record, null, 1) + '\n');
rmSync(profileDir, { recursive: true, force: true });
console.error(`wrote ${out}`);
