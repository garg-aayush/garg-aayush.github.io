// Scores the search rankers on questions.json against a rendered site and writes one result file per run.
// Usage, from the repo root after quarto render: node _devlog/local-search/evals/run-eval.mjs [--site _site] [--only name,name]
// It imports static/js/search-rank.js, the file the page loads, so the numbers are the page's ranking. Runs:
//   placeholder-quarto          the step one ranking over Quarto's search.json (baseline-placeholder.mjs)
//   bm25-quarto.<variant>      BM25 over the same cleaned passages
//   bm25-clean.<variant>       BM25 over search-index.json, every variant
//   bm25-clean.<ablation>      one change to the default, to see what it is worth
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIndex, search, wordSpans } from '../../../static/js/search-rank.js';
import { placeholderIndexData, placeholderPages, placeholderRanker } from './baseline-placeholder.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const args = process.argv.slice(2);
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const siteDir = resolve(root, option('--site') ?? '_site');
const outDir = resolve(here, option('--out') ?? 'results');
const only = option('--only')?.split(',');

// The principled variants: how words are matched. The default is chosen from these results and recorded in the journal.
export const VARIANTS = {
  exact: { stem: 'none', prefix: false },
  prefix: { stem: 'none', prefix: true },
  s: { stem: 's', prefix: false },
  's-prefix': { stem: 's', prefix: true },
  porter: { stem: 'porter', prefix: false },
  'porter-prefix': { stem: 'porter', prefix: true },
};
// One change each, on top of porter-prefix
export const ABLATIONS = {
  'porter-prefix.no-code': { ...VARIANTS['porter-prefix'], weights: { code: 0 } },
  'porter-prefix.no-boost': { ...VARIANTS['porter-prefix'], weights: { title: 1, heading: 1, body: 1, code: 1 } },
  'porter-prefix.stop-words-kept': { ...VARIANTS['porter-prefix'], keepStopWords: true },
};

const read = path => readFileSync(join(siteDir, path), 'utf8');
const sha = text => createHash('sha256').update(text).digest('hex').slice(0, 12);

const questionsText = readFileSync(join(here, 'questions.json'), 'utf8');
const questions = JSON.parse(questionsText).questions;
const searchPage = read('search/index.html');
const records = [...searchPage.matchAll(/<script type="application\/json" class="search-records">([\s\S]*?)<\/script>/g)].flatMap(match => JSON.parse(match[1]));
const stopWords = JSON.parse(searchPage.match(/<script type="application\/json" class="search-copy">([\s\S]*?)<\/script>/)[1]).stopWords;
const cleanText = read('search-index.json');
const cleanData = JSON.parse(cleanText);
const quartoText = read('search.json');
const quartoPages = placeholderPages(records, JSON.parse(quartoText));
const quartoData = placeholderIndexData(quartoPages);

const count = data => ({ pages: data.pages.length, passages: data.pages.reduce((sum, page) => sum + page.p.length, 0) });
const sources = {
  quarto: { file: 'search.json', bytes: Buffer.byteLength(quartoText), hash: sha(quartoText), ...count(quartoData), note: 'passages after the placeholder cleaning, not Quarto rows' },
  clean: { file: 'search-index.json', bytes: Buffer.byteLength(cleanText), hash: cleanData.hash, ...count(cleanData) },
};

const judged = question => new Map(question.relevant.map(entry => [entry.href, entry.grade]));

function score(question, ranked) {
  const grades = judged(question);
  const rank = new Map(ranked.map((row, i) => [row.key, i + 1]));
  const top2 = [...grades].filter(([, grade]) => grade === 2).map(([key]) => key);
  const found = top2.filter(key => rank.get(key) <= 5).length;
  const first = top2.map(key => rank.get(key)).filter(r => r <= 10).sort((a, b) => a - b)[0];
  let dcg = 0;
  ranked.slice(0, 10).forEach((row, i) => { dcg += (grades.get(row.key) ?? 0) / Math.log2(i + 2); });
  const ideal = [...grades.values()].sort((a, b) => b - a).slice(0, 10);
  const idcg = ideal.reduce((sum, grade, i) => sum + grade / Math.log2(i + 2), 0);
  return { recall5: top2.length ? found / top2.length : null, rr: first ? 1 / first : 0, ndcg: idcg ? dcg / idcg : null };
}

const mean = values => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const median = values => { const sorted = [...values].sort((a, b) => a - b); const mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };

function summarize(rows) {
  return { queries: rows.length, recall5: mean(rows.map(r => r.recall5)), mrr10: mean(rows.map(r => r.rr)), ndcg10: mean(rows.map(r => r.ndcg)) };
}

// rank(query) returns [{ key, score }] best first, one row per page
function evaluate(rank) {
  const rows = questions.map(question => {
    const ranked = rank(question.query);
    const grades = judged(question);
    const row = { id: question.id, type: question.type, query: question.query, results: ranked.length, topScore: ranked[0]?.score ?? 0, top10: ranked.slice(0, 10).map(r => ({ key: r.key, score: Math.round(r.score * 1000) / 1000, grade: grades.get(r.key) ?? 0 })) };
    if (question.type === 'none') return row;
    const ranks = Object.fromEntries(question.relevant.map(entry => [entry.href, { grade: entry.grade, rank: ranked.findIndex(r => r.key === entry.href) + 1 || null }]));
    const bestRelevant = ranked.find(r => grades.get(r.key) === 2);
    return { ...row, ranks, bestRelevantScore: bestRelevant?.score ?? 0, ...score(question, ranked) };
  });
  const answerable = rows.filter(row => row.type !== 'none');
  const byType = {};
  for (const row of answerable) (byType[row.type] ??= []).push(row);
  const none = rows.filter(row => row.type === 'none');
  const floor = Math.max(...none.map(row => row.topScore));
  return {
    typing: typingReplay(rank),
    relativeCutoffs: [0.25, 0.5].map(fraction => cutoff(rows, fraction)),
    overall: summarize(answerable),
    byType: Object.fromEntries(Object.entries(byType).map(([type, list]) => [type, summarize(list)])),
    none: { queries: none.length, resultCounts: none.map(row => ({ id: row.id, query: row.query, results: row.results, topScore: Math.round(row.topScore * 1000) / 1000 })) },
    // A score floor only helps if it sits above every no-answer query's top score and below the first right answer of the answerable ones
    floor: { noneTopMax: Math.round(floor * 1000) / 1000, answerableBestRelevantBelowFloor: answerable.filter(row => row.bestRelevantScore <= floor).map(row => row.id) },
    queries: rows,
  };
}

// Every answerable query again with its last word cut to its first half (words of four letters or more), as it looks one keystroke burst before it is finished. Only a ranker that matches the start of the last word can score here.
function typingReplay(rank) {
  const scores = [];
  for (const question of questions) {
    if (question.type === 'none') continue;
    const last = wordSpans(question.query).at(-1);
    if (!last || last.word.length < 4) continue;
    const typed = question.query.slice(0, last.start) + question.query.slice(last.start, last.start + Math.ceil(last.word.length / 2));
    scores.push(score(question, rank(typed)));
  }
  return { queries: scores.length, recall5: mean(scores.map(r => r.recall5)), mrr10: mean(scores.map(r => r.rr)) };
}

// What hiding results scoring under a fraction of the top score would do: relevant pages (grade 1 or 2) lost, and results left for the no-answer queries
function cutoff(rows, fraction) {
  let relevant = 0;
  let lost = 0;
  const left = [];
  for (const row of rows) {
    const limit = fraction * row.topScore;
    if (row.type === 'none') { left.push(row.top10.length === 0 ? 0 : row.top10.filter(r => r.score >= limit).length); continue; }
    for (const r of row.top10) if (r.grade > 0) { relevant++; if (r.score < limit) lost++; }
  }
  return { fraction, relevantInTop10: relevant, lost, noneResultsLeftInTop10: left };
}

function latency(rank) {
  const runs = [];
  for (const question of questions) {
    rank(question.query);
    const times = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      rank(question.query);
      times.push(performance.now() - start);
    }
    runs.push({ median: median(times), worst: Math.max(...times) });
  }
  return { medianMs: round(median(runs.map(r => r.median))), worstMs: round(Math.max(...runs.map(r => r.worst))) };
}

const round = value => Math.round(value * 1000) / 1000;

function bm25Ranker(data, config) {
  const { keepStopWords, ...options } = config;
  const started = performance.now();
  const index = createIndex(data, options);
  const buildMs = round(performance.now() - started);
  const searchOptions = { stopWords: keepStopWords ? [] : stopWords };
  return { buildMs, rank: query => search(index, query, searchOptions).map(row => ({ key: row.page.key, score: row.score })) };
}

const runs = [{ name: 'placeholder-quarto', description: 'The step one placeholder ranking over Quarto\'s search.json', source: 'quarto', config: { ranker: 'placeholder' }, make: () => ({ rank: placeholderRanker(placeholderPages(records, JSON.parse(quartoText)), stopWords) }) }];
for (const [name, config] of Object.entries(VARIANTS)) runs.push({ name: `bm25-quarto.${name}`, description: `BM25, ${name}, over Quarto's search.json passages`, source: 'quarto', config, make: () => bm25Ranker(quartoData, config) });
for (const [name, config] of Object.entries({ ...VARIANTS, ...ABLATIONS })) runs.push({ name: `bm25-clean.${name}`, description: `BM25, ${name}, over the clean index`, source: 'clean', config, make: () => bm25Ranker(cleanData, config) });

const pct = value => (value === null || value === undefined ? 'n/a' : value.toFixed(2));

function markdown(result) {
  const lines = [`# ${result.run}`, '', result.description, '', `Index: ${result.index.file}, ${result.index.pages} pages, ${result.index.passages} passages, ${result.index.bytes} bytes. Questions: ${result.questions.count}, file hash ${result.questions.hash}.`, '', '| Type | Queries | Recall@5 | MRR@10 | nDCG@10 |', '|---|---|---|---|---|'];
  for (const [type, s] of Object.entries(result.byType)) lines.push(`| ${type} | ${s.queries} | ${pct(s.recall5)} | ${pct(s.mrr10)} | ${pct(s.ndcg10)} |`);
  const o = result.overall;
  lines.push(`| **answerable** | ${o.queries} | ${pct(o.recall5)} | ${pct(o.mrr10)} | ${pct(o.ndcg10)} |`, '', `Typing replay (last word cut to its first half, ${result.typing.queries} queries): recall@5 ${pct(result.typing.recall5)}, MRR@10 ${pct(result.typing.mrr10)}.`, '', 'No-answer queries:', '', '| Query | Results | Top score |', '|---|---|---|');
  for (const n of result.none.resultCounts) lines.push(`| ${n.query} | ${n.results} | ${n.topScore} |`);
  lines.push('', `Latency in Node ${result.node}: ranking ${result.latency.medianMs} ms median, ${result.latency.worstMs} ms worst over ${result.questions.count} queries${result.latency.buildMs === undefined ? '' : `; index build ${result.latency.buildMs} ms`}.`, '');
  return lines.join('\n');
}

mkdirSync(outDir, { recursive: true });
const summary = ['# Results', '', `Scored on ${questions.length} queries (${questions.filter(q => q.type !== 'none').length} answerable). Written by run-eval.mjs; each run has its own .json (per-query ranks) and .md.`, '', '| Run | Recall@5 | MRR@10 | nDCG@10 | Typing MRR@10 | None: results (top score) | Rank ms median / worst |', '|---|---|---|---|---|---|---|'];
const typeRows = [];
for (const run of runs) {
  if (only && !only.includes(run.name)) continue;
  const made = run.make();
  const result = { run: run.name, description: run.description, config: run.config, index: sources[run.source], questions: { file: 'questions.json', hash: sha(questionsText), count: questions.length }, node: process.version, ...evaluate(made.rank) };
  result.latency = { ...latency(made.rank), buildMs: made.buildMs };
  writeFileSync(join(outDir, `${run.name}.json`), `${JSON.stringify(result, null, 1)}\n`);
  writeFileSync(join(outDir, `${run.name}.md`), markdown(result));
  const o = result.overall;
  typeRows.push(`| ${run.name} | ${Object.values(result.byType).map(t => `${pct(t.recall5)} / ${pct(t.mrr10)}`).join(' | ')} |`);
  summary.push(`| ${run.name} | ${pct(o.recall5)} | ${pct(o.mrr10)} | ${pct(o.ndcg10)} | ${pct(result.typing.mrr10)} | ${result.none.resultCounts.map(n => `${n.results} (${n.topScore})`).join(', ')} | ${result.latency.medianMs} / ${result.latency.worstMs} |`);
}
if (typeRows.length) {
  const types = Object.keys(JSON.parse(readFileSync(join(outDir, `${runs[0].name}.json`), 'utf8')).byType);
  summary.push('', `Recall@5 / MRR@10 per type (${types.join(', ')}):`, '', `| Run | ${types.join(' | ')} |`, `|${'---|'.repeat(types.length + 1)}`, ...typeRows);
}
if (!only) writeFileSync(join(outDir, 'summary.md'), `${summary.join('\n')}\n`);
console.log(summary.join('\n'));
