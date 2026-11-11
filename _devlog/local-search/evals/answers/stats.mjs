#!/usr/bin/env node
// Stage 3, step 3b: raw statistics of the answer runs, no quality labels. Reads results/raw/*-webgpu.jsonl, writes results/raw-stats.json and results/raw-stats.md.
// Refusal detection is string matching: "exact" is the fixed sentence from harness/prompt.mjs, "heuristic" is a regular expression for refusals in other words. Neither says whether an answer is right.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REFUSAL } from './harness/prompt.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const results = join(here, 'results');
const retrieval = JSON.parse(readFileSync(join(results, 'retrieval.json'), 'utf8')).questions;
const half = new Map(retrieval.map(r => [r.id, r.half]));
const MODELS = ['qwen3', 'granite', 'lfm', 'qwen35'];

// Refusals in other words. Checked on the answer after the exact sentence was ruled out.
const REFUSAL_WORDS = /\b(does not|doesn't|do not|don't|did not|didn't|is not|isn't|are not|aren't|cannot|can't|unable to)\b[^.!?]{0,60}\b(cover|covered|mention|mentioned|say|says|state|stated|specify|specified|provide|provided|contain|contained|include|included|address|addressed|discuss|discussed|know|found|available|clear|given|enough information)\b|\bno (information|mention|details?|answer|data|passages?)\b|\bnot (mentioned|covered|stated|specified|provided|available|discussed)\b|\bi (don't|do not) know\b|\bnot enough information\b|\bunable to (find|answer|determine)\b/i;

const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const round = (v, d = 1) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);
const spread = a => ({ min: round(Math.min(...a)), median: round(med(a)), mean: round(mean(a)), max: round(Math.max(...a)) });

const out = {};
for (const model of MODELS) {
  const rows = readFileSync(join(results, 'raw', `${model}-webgpu.jsonl`), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const run = rows.find(r => r.type === 'run');
  const end = rows.findLast(r => r.type === 'end');
  const items = new Map();
  for (const r of rows) if (r.type === 'item') items.set(r.id, r);
  const done = [...items.values()].filter(r => !r.error);
  const failed = [...items.values()].filter(r => r.error).map(r => ({ id: r.id, error: r.error }));
  const empty = done.filter(r => !r.answer.trim());
  const exact = done.filter(r => r.answer.trim() === REFUSAL);
  const words = done.filter(r => r.answer.trim() && r.answer.trim() !== REFUSAL && REFUSAL_WORDS.test(r.answer));
  const by = list => ({ answerable: list.filter(r => half.get(r.id) === 'answerable').length, unanswerable: list.filter(r => half.get(r.id) === 'unanswerable').length });
  const stops = {};
  for (const r of done) stops[r.stop] = (stops[r.stop] ?? 0) + 1;
  out[model] = {
    label: run.identity.model, revision: run.identity.revision, dtype: run.identity.dtype, backend: run.identity.backend,
    adapter: run.environment.browser?.adapter ? `${run.environment.browser.adapter.vendor} ${run.environment.browser.adapter.architecture}${run.environment.browser.adapter.isFallbackAdapter ? ' (fallback)' : ''}` : null,
    loadMs: run.load.wallMs, loadBytesModelFiles: run.load.bytesModelFiles,
    itemsDone: done.length, itemsFailed: failed, itemsTotal: retrieval.length,
    empty: { n: empty.length, ...by(empty), ids: empty.map(r => r.id) },
    refusalExact: { n: exact.length, ...by(exact) },
    refusalHeuristic: { n: words.length, ...by(words), ids: words.map(r => r.id) },
    stop: stops,
    answerChars: spread(done.map(r => r.answer.length)),
    answerTokens: spread(done.map(r => r.tokens)),
    itemMs: spread(done.map(r => r.ms)),
    firstTokenMs: spread(done.map(r => r.ttftMs)),
    decodeTokensPerSecond: spread(done.filter(r => r.decodeTokensPerSecond).map(r => r.decodeTokensPerSecond)),
    promptTokens: spread(done.map(r => r.promptTokens)),
    runMs: end?.runMs ?? null, peakBrowserMemoryGB: end ? round(end.peakBrowserMemoryBytes / 1e9, 2) : null,
  };
}
writeFileSync(join(results, 'raw-stats.json'), `${JSON.stringify(out, null, 1)}\n`);

const fmt = s => `${s.min} / ${s.median} / ${s.mean} / ${s.max}`;
const lines = ['# Raw statistics of the answer runs (no quality labels)', '', 'Refusal columns are string matching, not judgments: "exact" is the fixed sentence, "heuristic" is a regular expression for refusals in other words (see `stats.mjs`). Split as answerable / unanswerable questions. Spreads are min / median / mean / max.', ''];
lines.push('| Model | Done / failed | Empty (A/U) | Exact refusal (A/U) | Refusal in other words, heuristic (A/U) | Stop: sentences / eos / length |', '|---|---|---|---|---|---|');
for (const [m, s] of Object.entries(out)) lines.push(`| ${m} | ${s.itemsDone} / ${s.itemsFailed.length} | ${s.empty.n} (${s.empty.answerable}/${s.empty.unanswerable}) | ${s.refusalExact.n} (${s.refusalExact.answerable}/${s.refusalExact.unanswerable}) | ${s.refusalHeuristic.n} (${s.refusalHeuristic.answerable}/${s.refusalHeuristic.unanswerable}) | ${s.stop.sentences ?? 0} / ${s.stop.eos ?? 0} / ${s.stop.length ?? 0} |`);
lines.push('', '| Model | Answer characters | Answer tokens | Prompt tokens | Item ms | First token ms | Decode tokens per second | Load ms | Run s | Peak browser memory GB |', '|---|---|---|---|---|---|---|---|---|---|');
for (const [m, s] of Object.entries(out)) lines.push(`| ${m} | ${fmt(s.answerChars)} | ${fmt(s.answerTokens)} | ${fmt(s.promptTokens)} | ${fmt(s.itemMs)} | ${fmt(s.firstTokenMs)} | ${fmt(s.decodeTokensPerSecond)} | ${s.loadMs} | ${round((s.runMs ?? 0) / 1000)} | ${s.peakBrowserMemoryGB} |`);
writeFileSync(join(results, 'raw-stats.md'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
