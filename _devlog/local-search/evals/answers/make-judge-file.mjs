#!/usr/bin/env node
// Stage 3, step 4: the blinded file for the judge. One entry per (question, model) pair, shuffled with a fixed seed, with an opaque key. Writes results/to-judge.json and results/key-map.json (the judge must not open the second).
// The entries carry no model name, timing, token count, stop reason or ordering clue. Run from anywhere with Node 24 after the four runs are complete.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const results = join(here, 'results');
const SEED = 20261112;
const MODELS = ['qwen3', 'granite', 'lfm', 'qwen35'];
const NOT_ANSWERED = 'The site does not answer this question. A correct reply declines. Any fact the model states is unsupported.';

const questions = JSON.parse(readFileSync(join(here, 'questions.json'), 'utf8'));
const byId = new Map([...questions.answerable, ...questions.unanswerable].map(q => [q.id, q]));
const retrieval = JSON.parse(readFileSync(join(results, 'retrieval.json'), 'utf8')).questions;

// The pairs in a fixed order first (question order, then model order), so the shuffle depends only on the seed
const pairs = [];
const missing = [];
for (const model of MODELS) {
  const rows = readFileSync(join(results, 'raw', `${model}-webgpu.jsonl`), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const items = new Map();
  for (const r of rows) if (r.type === 'item') items.set(r.id, r);
  for (const r of retrieval) {
    const item = items.get(r.id);
    if (!item || item.error) { missing.push({ model, id: r.id, error: item?.error ?? 'no item' }); continue; }
    pairs.push({ model, id: r.id, answer: item.answer, retrieval: r });
  }
}
pairs.sort((a, b) => retrieval.findIndex(r => r.id === a.id) - retrieval.findIndex(r => r.id === b.id) || MODELS.indexOf(a.model) - MODELS.indexOf(b.model));

// mulberry32 and a Fisher-Yates shuffle
let state = SEED >>> 0;
const random = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
for (let i = pairs.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }

// Opaque keys: ten hex characters of a hash of the seed and the pair; they carry no order and no model
const keyOf = pair => createHash('sha256').update(`${SEED}:${pair.id}:${pair.model}`).digest('hex').slice(0, 10);
const keys = new Set();
const judge = [];
const keyMap = {};
for (const pair of pairs) {
  const key = keyOf(pair);
  if (keys.has(key)) throw new Error(`key collision ${key}`);
  keys.add(key);
  const q = byId.get(pair.id);
  const entry = { key, question: q.question, passages: pair.retrieval.passages.map(p => ({ n: p.rank, title: p.title, text: p.text })), answer: pair.answer };
  if (pair.retrieval.half === 'answerable') { entry.reference = q.reference; entry.supportingQuotes = q.support.map(s => s.quote); }
  else entry.note = NOT_ANSWERED;
  judge.push(entry);
  keyMap[key] = { model: pair.model, id: pair.id, half: pair.retrieval.half, kind: q.kind, retrievalHit: pair.retrieval.half === 'answerable' ? pair.retrieval.retrieval.hit : null };
}
writeFileSync(join(results, 'to-judge.json'), `${JSON.stringify(judge, null, 1)}\n`);
writeFileSync(join(results, 'key-map.json'), `${JSON.stringify({ seed: SEED, missing, keys: keyMap }, null, 1)}\n`);
console.log(`${judge.length} entries, ${missing.length} missing pairs`);
