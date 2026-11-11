// Scores BM25, each embedding configuration alone and each fused with BM25, on the 40 queries, and writes results/stage2/.
// Usage (Node 24.22.0): node compare.mjs   (after embed.mjs has saved vectors for the models; a missing model is skipped and said so)
// Hybrid is reciprocal rank fusion of the BM25 page ranking and the semantic page ranking, k = 60. Other k values are ablations.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createIndex, search } from '../../../../static/js/search-rank.js';
import { pages, passages, mainCount, questions, siteDir, evalsDir, vectorsDir, indexInfo, indexData } from './data.mjs';
import { evaluate, judged, mean, round, score } from './score.mjs';

const outDir = join(evalsDir, 'results', 'stage2');
mkdirSync(outDir, { recursive: true });
const K = 60;
const ABLATION_K = [10, 20, 100];

// BM25, the stage 1 default, through the same module and the same stop words as run-eval.mjs
const searchPage = readFileSync(join(siteDir, 'search/index.html'), 'utf8');
const stopWords = JSON.parse(searchPage.match(/<script type="application\/json" class="search-copy">([\s\S]*?)<\/script>/)[1]).stopWords;
const bm25Index = createIndex(indexData, { stem: 'porter', prefix: true });
const bm25Lists = new Map(questions.map(q => [q.id, search(bm25Index, q.query, { stopWords }).map(row => ({ key: row.page.key, score: row.score }))]));
const bm25Rank = question => bm25Lists.get(question.id);

// The stage 1 file is the reference: the scoring here has to give the same per-query numbers
const stage1 = JSON.parse(readFileSync(join(evalsDir, 'results', 'bm25-clean.porter-prefix.json'), 'utf8'));
const bm25Result = evaluate(bm25Rank);
const mismatches = stage1.queries.filter((row, i) => {
  const mine = bm25Result.queries[i];
  return row.id !== mine.id || row.type !== 'none' && (Math.abs(row.recall5 - mine.recall5) > 1e-9 || Math.abs(row.rr - mine.rr) > 1e-9 || Math.abs(row.ndcg - mine.ndcg) > 1e-9) || row.results !== mine.results;
});
const reproduction = { reference: 'results/bm25-clean.porter-prefix.json', stage1: stage1.overall, mine: bm25Result.overall, queriesDiffering: mismatches.map(row => row.id), indexHash: indexData.hash, stage1IndexHash: stage1.index.hash };
if (mismatches.length || stage1.index.hash !== indexData.hash) throw new Error(`BM25 does not reproduce stage 1: ${JSON.stringify(reproduction)}`);

// Vectors
const loadF32 = file => { const buffer = readFileSync(join(vectorsDir, file)); return new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)); };
const loadMeta = name => JSON.parse(readFileSync(join(vectorsDir, `${name}.meta.json`), 'utf8'));
const available = name => existsSync(join(vectorsDir, `${name}.meta.json`));

function normalizeRows(data, dim) {
  for (let r = 0; r < data.length / dim; r++) {
    let sum = 0;
    for (let i = 0; i < dim; i++) sum += data[r * dim + i] ** 2;
    const norm = Math.sqrt(sum) || 1;
    for (let i = 0; i < dim; i++) data[r * dim + i] /= norm;
  }
  return data;
}
function truncate(data, dim, target) {
  if (!target || target >= dim) return { data, dim };
  const rows = data.length / dim;
  const out = new Float32Array(rows * target);
  for (let r = 0; r < rows; r++) for (let i = 0; i < target; i++) out[r * target + i] = data[r * dim + i];
  return { data: normalizeRows(out, target), dim: target };
}
// Stored passage vectors as int8: one scale for the whole matrix (largest absolute value), rounded, then read back and renormalized
function int8Vectors(data, dim) {
  let max = 0;
  for (const value of data) max = Math.max(max, Math.abs(value));
  const scale = max / 127;
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = Math.max(-127, Math.min(127, Math.round(data[i] / scale))) * scale;
  return { data: normalizeRows(out, dim), dim, scale };
}

// The passage matrix for a representation: 'titled' (headline), 'plain', 'code' (titled, with code words appended for the passages that have them), 'desc' (titled plus one row per page description)
function passageMatrix(name, rep) {
  const meta = loadMeta(name);
  const dim = meta.reps.titled.dim;
  const base = loadF32(`${name}.${rep === 'plain' ? 'plain' : 'titled'}.f32`);
  let data = base;
  let owners = passages.slice(0, mainCount).map(p => p.page);
  if (rep === 'code') {
    data = Float32Array.from(base);
    const code = loadF32(`${name}.code.f32`);
    meta.reps.code.indices.forEach((passageIndex, i) => data.set(code.subarray(i * dim, (i + 1) * dim), passageIndex * dim));
  }
  if (rep === 'desc') {
    const desc = loadF32(`${name}.desc.f32`);
    data = new Float32Array(base.length + desc.length);
    data.set(base); data.set(desc, base.length);
    owners = passages.map(p => p.page);
  }
  return { data, dim, owners };
}

// Semantic page ranking: one row per page from its best passage, cosine similarity (vectors are unit length)
function semanticLists(cfg) {
  const queryMeta = loadMeta(cfg.query);
  const queryDim = queryMeta.dim;
  let queryData = loadF32(`${cfg.query}.queries.f32`);
  let docs = passageMatrix(cfg.docs, cfg.rep ?? 'titled');
  if (docs.dim !== queryDim) throw new Error(`${cfg.id}: query dim ${queryDim} and passage dim ${docs.dim} differ`);
  let dim = queryDim;
  if (cfg.dim) {
    const q = truncate(queryData, dim, cfg.dim);
    const d = truncate(docs.data, docs.dim, cfg.dim);
    queryData = q.data; docs = { ...docs, data: d.data, dim: d.dim }; dim = q.dim;
  }
  if (cfg.vectors === 'int8') docs = { ...docs, data: int8Vectors(docs.data, dim).data };
  const rows = docs.data.length / dim;
  const lists = new Map();
  const cosines = new Float32Array(questions.length * rows);
  questions.forEach((question, qi) => {
    const best = new Map();
    for (let r = 0; r < rows; r++) {
      let sum = 0;
      for (let i = 0; i < dim; i++) sum += queryData[qi * dim + i] * docs.data[r * dim + i];
      cosines[qi * rows + r] = sum;
      const page = docs.owners[r];
      if (!(best.get(page) >= sum)) best.set(page, sum);
    }
    lists.set(question.id, [...best.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([page, cos]) => ({ key: pages[page].key, score: cos })));
  });
  return { lists, cosines, dim, rows };
}

// Reciprocal rank fusion: each list adds 1 / (k + rank) to a page; ties go to the better BM25 rank, then page order
function fuse(bm25, semantic, k) {
  const total = new Map();
  const bmRank = new Map(bm25.map((row, i) => [row.key, i + 1]));
  for (const list of [bm25, semantic]) list.forEach((row, i) => total.set(row.key, (total.get(row.key) ?? 0) + 1 / (k + i + 1)));
  const order = new Map(pages.map((page, i) => [page.key, i]));
  return [...total.entries()].map(([key, value]) => ({ key, score: value })).sort((a, b) => b.score - a.score || (bmRank.get(a.key) ?? 1e9) - (bmRank.get(b.key) ?? 1e9) || order.get(a.key) - order.get(b.key));
}

// Configurations. id is also the result file name. query and docs name the saved vectors; dim truncates both; vectors: 'int8' stores the passage vectors as int8.
const CONFIGS = [
  // main rows
  { id: 'potion8', group: 'main', label: 'potion-base-8M, fp32 table, 256 dims', query: 'potion8', docs: 'potion8' },
  { id: 'minilm', group: 'main', label: 'all-MiniLM-L6-v2, q8, 384 dims', query: 'minilm', docs: 'minilm' },
  { id: 'leaf', group: 'main', label: 'mdbr-leaf-ir, q8, 768 dims', query: 'leaf', docs: 'leaf' },
  { id: 'leaf.d256', group: 'main', label: 'mdbr-leaf-ir, q8, 256 dims', query: 'leaf', docs: 'leaf', dim: 256 },
  { id: 'gemma2', group: 'main', label: 'EmbeddingGemma 2 text, q4, 768 dims (reference)', query: 'gemma2', docs: 'gemma2' },
  { id: 'gemma2.d256', group: 'main', label: 'EmbeddingGemma 2 text, q4, 256 dims (reference)', query: 'gemma2', docs: 'gemma2', dim: 256 },
  // sub-runs
  { id: 'potion8.int8', group: 'sub', label: 'potion-base-8M, int8 table, 256 dims', query: 'potion8.int8', docs: 'potion8.int8' },
  { id: 'potion8.d128', group: 'sub', label: 'potion-base-8M, fp32 table, PCA 128 dims', query: 'potion8.d128', docs: 'potion8.d128' },
  { id: 'potion8.d128.int8', group: 'sub', label: 'potion-base-8M, int8 table, PCA 128 dims', query: 'potion8.d128.int8', docs: 'potion8.d128.int8' },
  { id: 'gemma2.d512', group: 'sub', label: 'EmbeddingGemma 2 text, q4, 512 dims', query: 'gemma2', docs: 'gemma2', dim: 512 },
  { id: 'gemma2.d128', group: 'sub', label: 'EmbeddingGemma 2 text, q4, 128 dims', query: 'gemma2', docs: 'gemma2', dim: 128 },
  { id: 'minilm.vec-int8', group: 'sub', label: 'all-MiniLM-L6-v2, q8, passage vectors as int8', query: 'minilm', docs: 'minilm', vectors: 'int8' },
  { id: 'leaf.vec-int8', group: 'sub', label: 'mdbr-leaf-ir, q8, 768 dims, passage vectors as int8', query: 'leaf', docs: 'leaf', vectors: 'int8' },
  { id: 'leaf.d256.vec-int8', group: 'sub', label: 'mdbr-leaf-ir, q8, 256 dims, passage vectors as int8', query: 'leaf', docs: 'leaf', dim: 256, vectors: 'int8' },
  { id: 'gemma2.vec-int8', group: 'sub', label: 'EmbeddingGemma 2 text, q4, 768 dims, passage vectors as int8', query: 'gemma2', docs: 'gemma2', vectors: 'int8' },
  { id: 'gemma2.d256.vec-int8', group: 'sub', label: 'EmbeddingGemma 2 text, q4, 256 dims, passage vectors as int8', query: 'gemma2', docs: 'gemma2', dim: 256, vectors: 'int8' },
  // extras
  { id: 'potion32r', group: 'extra', label: 'potion-retrieval-32M, fp32 table, 512 dims', query: 'potion32r', docs: 'potion32r' },
  { id: 'potion32r.d128.int8', group: 'extra', label: 'potion-retrieval-32M, int8 table, PCA 128 dims', query: 'potion32r.d128.int8', docs: 'potion32r.d128.int8' },
  { id: 'arctic', group: 'extra', label: 'arctic-embed-m-v1.5, q8, 768 dims, on both sides', query: 'arctic', docs: 'arctic' },
  { id: 'asym', group: 'extra', label: 'leaf-ir queries against arctic-embed-m-v1.5 passages, 768 dims', query: 'leaf', docs: 'arctic' },
  { id: 'asym.d256', group: 'extra', label: 'leaf-ir queries against arctic-embed-m-v1.5 passages, 256 dims', query: 'leaf', docs: 'arctic', dim: 256 },
];
// Ablations of the passage text, on the headline configurations
const REP_ABLATIONS = [];
for (const base of ['potion8', 'potion8.int8', 'potion8.d128.int8', 'minilm', 'leaf', 'leaf.d256', 'gemma2', 'asym']) {
  const cfg = CONFIGS.find(c => c.id === base);
  for (const rep of (base === 'potion8' || base === 'minilm' || base === 'leaf' || base === 'gemma2' || base === 'asym' ? ['plain', 'code', 'desc'] : ['desc'])) REP_ABLATIONS.push({ ...cfg, id: `${base}@${rep}`, group: 'ablation', label: `${cfg.label}, passage text ${rep}`, rep, baseId: base });
}
const all = [...CONFIGS, ...REP_ABLATIONS];

const needed = cfg => [cfg.query, cfg.docs, ...(cfg.vectorsFrom ? [cfg.vectorsFrom] : [])];
const skipped = [];
const results = new Map();
for (const cfg of all) {
  const missing = needed(cfg).filter(name => !available(name));
  if (missing.length) { skipped.push({ id: cfg.id, missing }); continue; }
  const sem = semanticLists(cfg);
  const semantic = evaluate(question => sem.lists.get(question.id));
  const hybrid = evaluate(question => fuse(bm25Lists.get(question.id), sem.lists.get(question.id), K));
  const hybridK = Object.fromEntries(ABLATION_K.map(k => [k, evaluate(question => fuse(bm25Lists.get(question.id), sem.lists.get(question.id), k))]));
  // Ablation: only the first 10 rows of each list are fused (BM25 matches on generic words fill the rest of its list)
  const hybridTop10 = evaluate(question => fuse(bm25Lists.get(question.id).slice(0, 10), sem.lists.get(question.id).slice(0, 10), K));
  results.set(cfg.id, { cfg, sem, semantic, hybrid, hybridK, hybridTop10 });
}

// ---------- helpers for the report
const pct = value => (value === null || value === undefined ? 'n/a' : value.toFixed(2));
const triple = s => `${pct(s.recall5)} | ${pct(s.mrr10)} | ${pct(s.ndcg10)}`;
const types = Object.keys(bm25Result.byType);
const typeCounts = Object.fromEntries(types.map(t => [t, bm25Result.byType[t].queries]));
const answerableIds = questions.filter(q => q.type !== 'none').map(q => q.id);
const rowOf = (result, id) => result.queries.find(r => r.id === id);

// Per query wins and losses of A against B, on recall at 5 (higher is a win), and on whether the first right page is first
function wins(a, b) {
  const fixed = []; const broken = []; const top1Gained = []; const top1Lost = [];
  for (const id of answerableIds) {
    const x = rowOf(a, id); const y = rowOf(b, id);
    if (x.recall5 > y.recall5) fixed.push(id);
    if (x.recall5 < y.recall5) broken.push(id);
    if (x.rr === 1 && y.rr !== 1) top1Gained.push(id);
    if (x.rr !== 1 && y.rr === 1) top1Lost.push(id);
  }
  return { fixed, broken, top1Gained, top1Lost };
}
const short = id => id.replace(/^(paraphrase|partial|question|lookup|topic|person|tool|multi)-/, (m, t) => `${{ paraphrase: 'para', partial: 'part', question: 'quest', lookup: 'look', topic: 'top', person: 'pers', tool: 'tool', multi: 'multi' }[t]}-`);
const list = ids => (ids.length ? ids.join(', ') : 'none');

const mainIds = ['potion8', 'minilm', 'leaf', 'leaf.d256', 'gemma2', 'gemma2.d256'].filter(id => results.has(id));
const subIds = CONFIGS.filter(c => c.group === 'sub').map(c => c.id).filter(id => results.has(id));
const extraIds = CONFIGS.filter(c => c.group === 'extra').map(c => c.id).filter(id => results.has(id));
const labelOf = id => (results.get(id)?.cfg.label ?? id);

const lines = [];
const push = (...text) => lines.push(...text);
push('# Stage 2: offline embedding comparison', '',
  `Written by compare.mjs on ${new Date().toISOString().slice(0, 10)}. Index: search-index.json, hash ${indexInfo.hash}, ${indexInfo.pages} pages, ${mainCount} passages, ${indexInfo.bytes} bytes. Questions: ${questions.length} (${answerableIds.length} answerable), questions.json unchanged. BM25 is the stage 1 default (Porter stemming, last word as a prefix) run through static/js/search-rank.js; it reproduces results/bm25-clean.porter-prefix.json query for query (checked in this run: 0 queries differ, same index hash).`, '',
  'Semantic ranking: cosine similarity, one row per page from its best passage. Hybrid: reciprocal rank fusion of the BM25 ranking and the semantic ranking, k = 60, nothing tuned to these queries. Counts are queries; with 36 answerable queries and 4 to 6 per type, a difference of one or two queries is noise.', '');
if (skipped.length) push(`Not run (vectors missing): ${skipped.map(s => `${s.id} (${s.missing.join(', ')})`).join('; ')}.`, '');

push('## Headline', '', '| Configuration | Recall@5 | MRR@10 | nDCG@10 |', '|---|---|---|---|', `| BM25 alone (stage 1 default) | ${triple(bm25Result.overall)} |`);
for (const id of mainIds) push(`| ${labelOf(id)}, alone | ${triple(results.get(id).semantic.overall)} |`, `| ${labelOf(id)}, plus BM25 | ${triple(results.get(id).hybrid.overall)} |`);
push('');

push('## Headline with the page descriptions embedded too (ablation)', '', 'The same rows with 47 more passages, one per page, made of its description. BM25 has these passages, and without them the weather page (no passages of its own) cannot be found by an embedding, which is why question-04 is lost in every row above.', '', '| Configuration | Recall@5 | MRR@10 | nDCG@10 |', '|---|---|---|---|', `| BM25 alone (stage 1 default) | ${triple(bm25Result.overall)} |`);
for (const base of ['potion8', 'potion8.int8', 'potion8.d128.int8', 'minilm', 'leaf', 'leaf.d256', 'gemma2']) {
  const id = `${base}@desc`;
  if (!results.has(id)) continue;
  push(`| ${labelOf(base)}, alone | ${triple(results.get(id).semantic.overall)} |`, `| ${labelOf(base)}, plus BM25 | ${triple(results.get(id).hybrid.overall)} |`);
}
push('');

push('## Per type, hybrid (recall@5 / MRR@10)', '', `| Configuration | ${types.map(t => `${t} (${typeCounts[t]})`).join(' | ')} |`, `|${'---|'.repeat(types.length + 1)}`, `| BM25 alone | ${types.map(t => `${pct(bm25Result.byType[t].recall5)} / ${pct(bm25Result.byType[t].mrr10)}`).join(' | ')} |`);
for (const id of mainIds) push(`| ${labelOf(id)}, plus BM25 | ${types.map(t => `${pct(results.get(id).hybrid.byType[t].recall5)} / ${pct(results.get(id).hybrid.byType[t].mrr10)}`).join(' | ')} |`);
push('', '## Per type, semantic alone (recall@5 / MRR@10)', '', `| Configuration | ${types.map(t => `${t} (${typeCounts[t]})`).join(' | ')} |`, `|${'---|'.repeat(types.length + 1)}`);
for (const id of mainIds) push(`| ${labelOf(id)}, alone | ${types.map(t => `${pct(results.get(id).semantic.byType[t].recall5)} / ${pct(results.get(id).semantic.byType[t].mrr10)}`).join(' | ')} |`);
push('');

const tableFor = ids => {
  const out = ['| Configuration | Alone R@5 | MRR@10 | nDCG@10 | Plus BM25 R@5 | MRR@10 | nDCG@10 |', '|---|---|---|---|---|---|---|'];
  for (const id of ids) out.push(`| ${labelOf(id)} | ${triple(results.get(id).semantic.overall)} | ${triple(results.get(id).hybrid.overall)} |`);
  return out;
};
push('## Sub-runs: int8 tables, fewer dimensions, int8 passage vectors', '', ...tableFor(subIds), '');
push('## Extra rows', '', ...tableFor(extraIds), '');

// ---------- wins and losses against BM25 alone
push('## Per query against BM25 alone', '', 'Fixed means recall@5 is higher than BM25 alone on that query, broken means lower. Top 1 gained or lost means the first right page moved to or from rank 1. Over the 36 answerable queries.', '',
  '| Configuration | Fixed | Broken | Top 1 gained | Top 1 lost |', '|---|---|---|---|---|');
const winRows = {};
const descIds = ['potion8', 'potion8.int8', 'potion8.d128.int8', 'minilm', 'leaf', 'leaf.d256', 'gemma2', 'asym'].map(id => `${id}@desc`).filter(id => results.has(id));
for (const id of [...mainIds, ...subIds.filter(i => /d128|int8$/.test(i) && i.startsWith('potion')), ...extraIds, ...descIds]) {
  for (const mode of ['semantic', 'hybrid']) {
    const w = wins(results.get(id)[mode], bm25Result);
    winRows[`${id}.${mode}`] = w;
    push(`| ${labelOf(id)}, ${mode === 'semantic' ? 'alone' : 'plus BM25'} | ${list(w.fixed)} | ${list(w.broken)} | ${list(w.top1Gained)} | ${list(w.top1Lost)} |`);
  }
}
push('');

// between models
const descPairs = [['leaf@desc', 'potion8@desc'], ['leaf@desc', 'minilm@desc'], ['minilm@desc', 'potion8@desc'], ['gemma2@desc', 'leaf@desc'], ['gemma2@desc', 'potion8@desc'], ['potion8.int8@desc', 'potion8.d128.int8@desc'], ['leaf@desc', 'potion8.int8@desc'], ['asym@desc', 'leaf@desc']];
const pairs = [['leaf', 'potion8'], ['leaf', 'minilm'], ['asym', 'leaf'], ['gemma2', 'leaf'], ['minilm', 'potion8'], ['gemma2', 'potion8'], ['leaf', 'potion8.int8'], ['potion8.int8', 'potion8.d128.int8'], ['potion8.int8', 'potion8'], ['leaf.d256', 'leaf'], ['gemma2.d256', 'gemma2'], ...descPairs].filter(([a, b]) => results.has(a) && results.has(b));
push('## Per query between models (hybrids and alone)', '', 'A against B, by recall@5. A fixes a query when A has the higher recall@5 on it.', '', '| A against B | Mode | A fixes | A breaks | Top 1 gained by A | Top 1 lost by A |', '|---|---|---|---|---|---|');
const pairRows = {};
for (const [a, b] of pairs) for (const mode of ['hybrid', 'semantic']) {
  const w = wins(results.get(a)[mode], results.get(b)[mode]);
  pairRows[`${a}|${b}|${mode}`] = w;
  push(`| ${labelOf(a)} against ${labelOf(b)} | ${mode === 'semantic' ? 'alone' : 'plus BM25'} | ${list(w.fixed)} | ${list(w.broken)} | ${list(w.top1Gained)} | ${list(w.top1Lost)} |`);
}
push('');

// Ablation: the same comparisons when only the first 10 rows of each list are fused
push('## Per query with fusion over the first 10 rows of each list (ablation)', '', 'Same definitions as above. The headline fuses whole lists; this variant exists because BM25 returns every page that shares a word with the query, and those matches can outvote a good semantic rank (tool-02 and person-03 are first or second semantically and 27th and 16th when fused).', '',
  '| Configuration | Passage text | Fixed against BM25 | Broken against BM25 | Recall@5 / MRR@10 / nDCG@10 |', '|---|---|---|---|---|');
const topIds = ['potion8', 'potion8.int8', 'potion8.d128.int8', 'minilm', 'leaf', 'leaf.d256', 'gemma2'];
const top10Rows = {};
for (const base of topIds) for (const rep of ['titled', 'desc']) {
  const id = rep === 'titled' ? base : `${base}@desc`;
  if (!results.has(id)) continue;
  const w = wins(results.get(id).hybridTop10, bm25Result);
  top10Rows[id] = w;
  push(`| ${labelOf(base)} | ${rep} | ${list(w.fixed)} | ${list(w.broken)} | ${pct(results.get(id).hybridTop10.overall.recall5)} / ${pct(results.get(id).hybridTop10.overall.mrr10)} / ${pct(results.get(id).hybridTop10.overall.ndcg10)} |`);
}
push('', '| A against B (fused over 10 rows) | Passage text | A fixes | A breaks |', '|---|---|---|---|');
for (const [a, b] of [['leaf', 'potion8.int8'], ['minilm', 'potion8.int8'], ['gemma2', 'leaf'], ['gemma2', 'potion8.int8'], ['potion8.int8', 'potion8.d128.int8']]) for (const rep of ['titled', 'desc']) {
  const ia = rep === 'titled' ? a : `${a}@desc`; const ib = rep === 'titled' ? b : `${b}@desc`;
  if (!results.has(ia) || !results.has(ib)) continue;
  const w = wins(results.get(ia).hybridTop10, results.get(ib).hybridTop10);
  top10Rows[`${ia}|${ib}`] = w;
  push(`| ${labelOf(a)} against ${labelOf(b)} | ${rep} | ${list(w.fixed)} | ${list(w.broken)} |`);
}
push('');

// ---------- failure analysis
const stage1Fail = ['paraphrase-01', 'paraphrase-02', 'paraphrase-03', 'paraphrase-04', 'paraphrase-05', 'tool-02', 'person-02', 'person-03', 'partial-03'];
const bestRank = (result, id) => { const row = rowOf(result, id); const ranks = Object.values(row.ranks).filter(r => r.grade === 2 && r.rank).map(r => r.rank); return ranks.length ? Math.min(...ranks) : null; };
push('## The nine queries keyword search could not fix', '', 'Rank of the best right page (grade 2) in each ranking, a dash if it is not in the list. In bold: in the top 5. A query written "A / B" shows the semantic ranking alone, then the hybrid.', '',
  `| Query | BM25 | ${mainIds.map(id => labelOf(id).replace(/, (q8|q4|fp32 table), /, ', ')).join(' | ')} |`, `|${'---|'.repeat(mainIds.length + 2)}`);
const fmtRank = r => (r === null ? '-' : r <= 5 ? `**${r}**` : String(r));
for (const id of stage1Fail) push(`| ${id}: ${questions.find(q => q.id === id).query} | ${fmtRank(bestRank(bm25Result, id))} | ${mainIds.map(m => `${fmtRank(bestRank(results.get(m).semantic, id))} / ${fmtRank(bestRank(results.get(m).hybrid, id))}`).join(' | ')} |`);
push('');
push('Found in the top 5, by configuration (of the nine):', '', '| Configuration | Alone | Plus BM25 |', '|---|---|---|');
const found5 = (result, ids) => ids.filter(id => rowOf(result, id).recall5 > 0);
for (const id of mainIds) push(`| ${labelOf(id)} | ${list(found5(results.get(id).semantic, stage1Fail))} | ${list(found5(results.get(id).hybrid, stage1Fail))} |`);
push('');
const bm25Right = answerableIds.filter(id => rowOf(bm25Result, id).recall5 === 1);
push(`Queries BM25 gets completely right in the top 5 (recall@5 of 1.00): ${bm25Right.length} of ${answerableIds.length}. Which of them each configuration loses (lower recall@5):`, '', '| Configuration | Alone loses | Plus BM25 loses |', '|---|---|---|');
for (const id of mainIds) push(`| ${labelOf(id)} | ${list(bm25Right.filter(q => rowOf(results.get(id).semantic, q).recall5 < 1))} | ${list(bm25Right.filter(q => rowOf(results.get(id).hybrid, q).recall5 < 1))} |`);
push('');

// ---------- no-answer queries and a gate
const noneIds = questions.filter(q => q.type === 'none').map(q => q.id);
const quantile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); const pos = (sorted.length - 1) * p; const lo = Math.floor(pos); return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo); };
function gate(result) {
  const none = noneIds.map(id => rowOf(result, id).topScore);
  const top1 = answerableIds.map(id => rowOf(result, id).topScore);
  const bestRel = answerableIds.map(id => rowOf(result, id).bestRelevantScore);
  const ceiling = Math.max(...none);
  let wins2 = 0;
  for (const a of top1) for (const n of none) wins2 += a > n ? 1 : a === n ? 0.5 : 0;
  const lowest = answerableIds.map((id, i) => ({ id, top1: top1[i], bestRel: bestRel[i] })).sort((a, b) => a.bestRel - b.bestRel).slice(0, 4);
  return {
    none: Object.fromEntries(noneIds.map((id, i) => [id, round(none[i])])), noneMax: ceiling, noneMean: mean(none),
    top1: { min: Math.min(...top1), p10: quantile(top1, 0.1), median: quantile(top1, 0.5) },
    bestRel: { min: Math.min(...bestRel), p10: quantile(bestRel, 0.1), median: quantile(bestRel, 0.5) },
    answerableTop1AboveNoneMax: top1.filter(v => v > ceiling).length, answerableBestRelAboveNoneMax: bestRel.filter(v => v > ceiling).length,
    auc: wins2 / (top1.length * none.length), lowest,
  };
}
const gates = {};
push('## The four queries with no answer: cosine scores', '', 'Top cosine of the semantic ranking for each no-answer query, against the answerable queries (36): the top cosine of any page, and the cosine of the best right page. A gate needs a number that sits above the no-answer scores and below the right answers. AUC is the chance that an answerable query has a higher top cosine than a no-answer query (1.00 separates them perfectly, 0.50 not at all).', '',
  `| Configuration | ${noneIds.map(id => `${id}`).join(' | ')} | none max | answerable top-1 min / p10 / median | right page min / p10 / median | answerable above none max (top-1, right page) | AUC |`, `|${'---|'.repeat(noneIds.length + 6)}`);
for (const id of [...mainIds, ...extraIds, ...subIds.filter(i => i.startsWith('potion'))]) {
  const g = gate(results.get(id).semantic);
  gates[id] = g;
  push(`| ${labelOf(id)} | ${noneIds.map(n => pct3(g.none[n])).join(' | ')} | ${pct3(g.noneMax)} | ${pct3(g.top1.min)} / ${pct3(g.top1.p10)} / ${pct3(g.top1.median)} | ${pct3(g.bestRel.min)} / ${pct3(g.bestRel.p10)} / ${pct3(g.bestRel.median)} | ${g.answerableTop1AboveNoneMax} of 36, ${g.answerableBestRelAboveNoneMax} of 36 | ${g.auc.toFixed(2)} |`);
}
function pct3(v) { return v.toFixed(3); }
push('', 'Lowest right-page cosines (the answerable queries a gate would cut first):', '', '| Configuration | Four lowest (id, right page cosine, top-1 cosine) |', '|---|---|');
for (const id of mainIds) push(`| ${labelOf(id)} | ${gates[id].lowest.map(l => `${l.id} ${l.bestRel.toFixed(3)} (${l.top1.toFixed(3)})`).join('; ')} |`);
push('');

// ---------- quantization and truncation
function rankingChange(a, b) {
  let overlap = 0; let top1Same = 0;
  for (const q of questions) {
    const x = a.sem.lists.get(q.id).slice(0, 5).map(r => r.key); const y = b.sem.lists.get(q.id).slice(0, 5).map(r => r.key);
    overlap += x.filter(k => y.includes(k)).length / 5;
    if (a.sem.lists.get(q.id)[0].key === b.sem.lists.get(q.id)[0].key) top1Same++;
  }
  let sum = 0; let max = 0;
  for (let i = 0; i < a.sem.cosines.length; i++) { const d = Math.abs(a.sem.cosines[i] - b.sem.cosines[i]); sum += d; max = Math.max(max, d); }
  return { top5Overlap: overlap / questions.length, top1Same, meanCosDiff: sum / a.sem.cosines.length, maxCosDiff: max };
}
const quantPairs = [['potion8', 'potion8.int8'], ['potion8', 'potion8.d128'], ['potion8', 'potion8.d128.int8'], ['minilm', 'minilm.vec-int8'], ['leaf', 'leaf.d256'], ['leaf', 'leaf.vec-int8'], ['leaf', 'leaf.d256.vec-int8'], ['gemma2', 'gemma2.d512'], ['gemma2', 'gemma2.d256'], ['gemma2', 'gemma2.d128'], ['gemma2', 'gemma2.vec-int8'], ['gemma2', 'gemma2.d256.vec-int8']].filter(([a, b]) => results.has(a) && results.has(b));
const quant = {};
push('## What int8 and fewer dimensions do to the ranking', '', 'Each variant against the full configuration of the same model, semantic ranking over all 40 queries: mean overlap of the top 5 pages, queries whose top page is the same (of 40), the mean and the largest change in a query-to-passage cosine, and the change in recall@5, MRR@10 and nDCG@10 (alone, then plus BM25). The potion rows are int8 or PCA tables; the others are the passage vectors stored as int8 (one scale for the matrix, queries stay float) or cut to the first dimensions and renormalized.', '',
  '| Model, full against variant | Top 5 overlap | Same top page | Mean / max cosine change | Alone: change in R@5, MRR, nDCG | Plus BM25: change in R@5, MRR, nDCG |', '|---|---|---|---|---|---|');
const signed = v => (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2));
for (const [a, b] of quantPairs) {
  const c = rankingChange(results.get(a), results.get(b));
  quant[`${a}|${b}`] = c;
  const d = mode => { const x = results.get(a)[mode].overall; const y = results.get(b)[mode].overall; return `${signed(y.recall5 - x.recall5)}, ${signed(y.mrr10 - x.mrr10)}, ${signed(y.ndcg10 - x.ndcg10)}`; };
  push(`| ${labelOf(a)} against ${labelOf(b)} | ${c.top5Overlap.toFixed(2)} | ${c.top1Same} | ${c.meanCosDiff.toFixed(4)} / ${c.maxCosDiff.toFixed(3)} | ${d('semantic')} | ${d('hybrid')} |`);
}
push('');

// ---------- ablations
push('## Ablations', '', 'Passage text: titled is the headline (page title, section heading, prose). plain is the prose alone. code appends a passage\'s code and formula words after the prose (the model cuts at its input limit). desc adds one passage per page made of its description (47 more rows), which is also what BM25 has and the only way the weather page, which has no passages, can be found.', '',
  '| Configuration | Passage text | Alone R@5 | MRR@10 | nDCG@10 | Plus BM25 R@5 | MRR@10 | nDCG@10 |', '|---|---|---|---|---|---|---|---|');
for (const base of ['potion8', 'potion8.int8', 'potion8.d128.int8', 'minilm', 'leaf', 'leaf.d256', 'gemma2', 'asym']) {
  if (!results.has(base)) continue;
  for (const rep of ['titled', 'plain', 'code', 'desc']) {
    const id = rep === 'titled' ? base : `${base}@${rep}`;
    if (!results.has(id)) continue;
    push(`| ${labelOf(base)} | ${rep} | ${triple(results.get(id).semantic.overall)} | ${triple(results.get(id).hybrid.overall)} |`);
  }
}
push('', `Fusion constant k (headline is ${K}, nothing tuned), and fusing only the first 10 rows of each list at k = ${K}. Hybrid recall@5 / MRR@10 / nDCG@10:`, '', `| Configuration | k = ${[...ABLATION_K.slice(0, 2), K, ABLATION_K[2]].join(' | k = ')} | top 10 of each list |`, `|${'---|'.repeat(6)}`);
for (const id of mainIds) {
  const r = results.get(id);
  push(`| ${labelOf(id)} | ${[r.hybridK[10], r.hybridK[20], r.hybrid, r.hybridK[100], r.hybridTop10].map(x => `${pct(x.overall.recall5)} / ${pct(x.overall.mrr10)} / ${pct(x.overall.ndcg10)}`).join(' | ')} |`);
}
push('');

// ---------- sanity
push('## Sanity checks', '', 'Each model embeds three (query, related text, unrelated text) triples, with the model\'s own prefixes; the related text has to score higher. Dimension and norm are read from the output. The card check repeats the example on the model card (fp32 scores there; quantized here).', '', '| Vectors | Model file | Dimension (card) | Norm before normalizing | Triples in the right order | Card example |', '|---|---|---|---|---|---|');
for (const name of ['potion8', 'potion8.int8', 'potion8.d128', 'potion8.d128.int8', 'potion32r', 'minilm', 'leaf', 'arctic', 'gemma2'].filter(available)) {
  const meta = loadMeta(name);
  const norm = meta.reps.titled.normBeforeNormalizing;
  push(`| ${name} | ${meta.model}, ${meta.dtype} | ${meta.dim} (${meta.nativeDim ?? meta.static?.dim}) | ${norm.min.toFixed(2)} to ${norm.max.toFixed(2)} | ${meta.sanity.filter(s => s.ok).length} of ${meta.sanity.length} (${meta.sanity.map(s => `${s.related.toFixed(2)} v ${s.unrelated.toFixed(2)}`).join('; ')}) | ${meta.cardCheck ? `expected ${JSON.stringify(meta.cardCheck.expected)}, measured ${JSON.stringify(meta.cardCheck.measured)}` : 'none on the card'} |`);
}
push('');
writeFileSync(join(outDir, 'summary.md'), `${lines.join('\n')}\n`);

// ---------- result files
const trim = result => ({ overall: result.overall, byType: result.byType, queries: result.queries });
writeFileSync(join(outDir, 'bm25.json'), `${JSON.stringify({ run: 'bm25', description: 'BM25 alone, the stage 1 default (porter stemming, last word as prefix), reproduced through static/js/search-rank.js', reproduction, ...trim(bm25Result) }, null, 1)}\n`);
for (const [id, r] of results) {
  const g = r.cfg.group === 'ablation' ? undefined : gate(r.semantic);
  writeFileSync(join(outDir, `${id}.json`), `${JSON.stringify({ run: id, description: r.cfg.label, config: { query: r.cfg.query, docs: r.cfg.docs, dim: r.cfg.dim ?? 'native', passageVectors: r.cfg.vectors ?? 'float32', passageText: r.cfg.rep ?? 'titled', k: K }, noAnswerGate: g, semantic: trim(r.semantic), hybrid: trim(r.hybrid), hybridK: Object.fromEntries(Object.entries(r.hybridK).map(([k, v]) => [k, { overall: v.overall, byType: v.byType }])), hybridTop10: { overall: r.hybridTop10.overall, byType: r.hybridTop10.byType } })}\n`);
}
writeFileSync(join(outDir, 'wins-and-losses.json'), `${JSON.stringify({ againstBm25: winRows, fusedOverTop10: top10Rows, betweenModels: pairRows, quantization: quant, failureQueries: stage1Fail }, null, 1)}\n`);
console.log(lines.join('\n'));
