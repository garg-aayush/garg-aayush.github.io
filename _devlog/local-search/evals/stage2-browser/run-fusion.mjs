// Scores BM25 alone, meaning alone and the fusion methods on a question file, through the page's own modules, and writes results/stage2-browser/<name>.json and .md.
// Usage (Node 24.22.0, from the repo root after quarto render): node _devlog/local-search/evals/stage2-browser/run-fusion.mjs [--site _site] [--questions _devlog/local-search/evals/questions.json] [--methods bm25,rrf-full,...] [--name dev]
// The default methods are all of them. The development set is questions.json, and the methods were compared on it before the held-out file was scored.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { evalsDir, evaluate, GENERIC_SHARE, loadSite, rankers, root, round, sha, typingReplay, typingStability } from './harness.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const siteDir = resolve(root, option('--site', '_site'));
const questionsPath = resolve(root, option('--questions', '_devlog/local-search/evals/questions.json'));
const name = option('--name', 'dev');
const outDir = join(evalsDir, 'results', 'stage2-browser');
mkdirSync(outDir, { recursive: true });

const questionsText = readFileSync(questionsPath, 'utf8');
const questions = JSON.parse(questionsText).questions;
const site = await loadSite(siteDir);
const all = rankers(site);
const names = option('--methods', Object.keys(all).join(',')).split(',');
for (const method of names) if (!all[method]) throw new Error(`unknown method ${method}`);

// On the development set, BM25 here has to be the stage 1 result query for query (same index, same module), or the comparison is not comparing what it says
if (questionsPath === resolve(evalsDir, 'questions.json') && names.includes('bm25')) {
  const stage1 = JSON.parse(readFileSync(join(evalsDir, 'results', 'bm25-clean.porter-prefix.json'), 'utf8'));
  const mine = evaluate(questions, all.bm25.rank);
  const differing = stage1.queries.filter((row, i) => row.id !== mine.queries[i].id || row.results !== mine.queries[i].results || (row.type !== 'none' && (Math.abs(row.recall5 - mine.queries[i].recall5) > 1e-9 || Math.abs(row.rr - mine.queries[i].rr) > 1e-9 || Math.abs(row.ndcg - mine.queries[i].ndcg) > 1e-9)));
  if (differing.length || stage1.index.hash !== site.indexInfo.hash) throw new Error(`BM25 does not reproduce stage 1: ${differing.map(row => row.id).join(', ')} (index ${stage1.index.hash} then, ${site.indexInfo.hash} now)`);
  console.log(`BM25 reproduces results/bm25-clean.porter-prefix.json: 0 of ${questions.length} queries differ, index ${site.indexInfo.hash}`);
}

const results = {};
for (const method of names) {
  const { rank } = all[method];
  results[method] = { label: all[method].label, ...evaluate(questions, rank), typing: typingReplay(questions, rank), stability: typingStability(questions, rank) };
}

const pct = value => (value === null || value === undefined ? 'n/a' : value.toFixed(2));
const lines = [`# Fusion comparison, ${name}`, '', `Written by run-fusion.mjs. Index ${site.indexInfo.hash} (${site.indexInfo.pages} pages, ${site.indexInfo.passages} passages). Table ${site.manifest.model.id} at ${site.manifest.model.revision.slice(0, 7)}, int8, ${site.manifest.dimensions} dimensions. Questions: ${questionsPath.slice(root.length + 1)}, ${questions.length} queries (${questions.filter(q => q.type !== 'none').length} answerable), file hash ${sha(questionsText)}. Generic term: in more than ${GENERIC_SHARE * 100} percent of the passages. A query moves a per-type score by 17 to 25 points and the overall score by about 0.03.`, ''];
lines.push('## Headline, answerable queries', '', '| Method | Recall@5 | MRR@10 | nDCG@10 | Typing recall@5 | Typing MRR@10 |', '|---|---|---|---|---|---|');
for (const method of names) { const r = results[method]; lines.push(`| ${r.label} | ${pct(r.overall.recall5)} | ${pct(r.overall.mrr10)} | ${pct(r.overall.ndcg10)} | ${pct(r.typing.recall5)} | ${pct(r.typing.mrr10)} |`); }
const types = Object.keys(results[names[0]].byType);
lines.push('', `## Per type, recall@5 / MRR@10 / nDCG@10 (queries per type: ${types.map(t => `${t} ${results[names[0]].byType[t].queries}`).join(', ')})`, '', `| Method | ${types.join(' | ')} |`, `|${'---|'.repeat(types.length + 1)}`);
for (const method of names) lines.push(`| ${results[method].label} | ${types.map(t => { const s = results[method].byType[t]; return `${pct(s.recall5)} / ${pct(s.mrr10)} / ${pct(s.ndcg10)}`; }).join(' | ')} |`);

// Per query: the rank of the first right page (grade 2), and what each method fixed or broke against BM25 alone and against full-list RRF
const answerable = questions.filter(q => q.type !== 'none');
lines.push('', '## Rank of the first right page per query', '', `| Query | ${names.join(' | ')} |`, `|${'---|'.repeat(names.length + 1)}`);
answerable.forEach((question, i) => {
  const cells = names.map(method => { const row = results[method].queries.filter(q => q.type !== 'none')[i]; return row.firstRank ?? 'none'; });
  lines.push(`| ${question.id} ${question.query} | ${cells.join(' | ')} |`);
});
const versus = (a, b) => {
  const ra = results[a].queries.filter(q => q.type !== 'none');
  const rb = results[b].queries.filter(q => q.type !== 'none');
  const pick = test => ra.filter((row, i) => test(row, rb[i])).map(row => row.id).join(', ') || 'none';
  return { fixed: pick((x, y) => x.recall5 > y.recall5), broken: pick((x, y) => x.recall5 < y.recall5), top1Gained: pick((x, y) => x.firstRank === 1 && y.firstRank !== 1), top1Lost: pick((x, y) => x.firstRank !== 1 && y.firstRank === 1), mrrUp: pick((x, y) => x.rr > y.rr + 1e-9), mrrDown: pick((x, y) => x.rr < y.rr - 1e-9) };
};
const comparisons = {};
for (const base of ['bm25', 'rrf-full']) {
  if (!names.includes(base)) continue;
  lines.push('', `## Against ${results[base].label} (recall@5 fixed and broken, first right page moved to or from rank 1, MRR@10 up and down)`, '', '| Method | Fixed | Broken | Top 1 gained | Top 1 lost | MRR up | MRR down |', '|---|---|---|---|---|---|---|');
  for (const method of names) {
    if (method === base) continue;
    const v = versus(method, base);
    (comparisons[base] ??= {})[method] = v;
    lines.push(`| ${results[method].label} | ${v.fixed} | ${v.broken} | ${v.top1Gained} | ${v.top1Lost} | ${v.mrrUp} | ${v.mrrDown} |`);
  }
}
const none = questions.filter(q => q.type === 'none');
if (none.length) {
  lines.push('', '## Queries the site cannot answer: results returned (and the first three pages)', '', `| Method | ${none.map(q => q.query).join(' | ')} |`, `|${'---|'.repeat(none.length + 1)}`);
  for (const method of names) lines.push(`| ${results[method].label} | ${results[method].queries.filter(q => q.type === 'none').map(q => `${q.results}: ${q.top5.slice(0, 3).map(key => key.replace(/\/index\.html$|\.html$/g, '').replace(/^posts\/\d{4}-\d{2}-\d{2}-/, '')).join(', ') || 'nothing'}`).join(' | ')} |`);
}
lines.push('', '## Typing: the last word typed one letter at a time, from two letters to the whole word', '', 'Kept top 5 is the mean share of the first five pages that stay among the first five from one keystroke to the next. First page changes is the mean number of times the first page changes while one last word is typed.', '', '| Method | Words | Keystrokes | Kept top 5 | First page changes per word |', '|---|---|---|---|---|');
for (const method of names) { const s = results[method].stability; lines.push(`| ${results[method].label} | ${s.words} | ${s.steps} | ${pct(s.keptTop5)} | ${round(s.firstPageChangesPerWord, 2)} |`); }
lines.push('');
writeFileSync(join(outDir, `${name}.md`), lines.join('\n'));
writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify({ name, index: site.indexInfo, table: { id: site.manifest.model.id, revision: site.manifest.model.revision, tableSha256: site.manifest.files.table.sha256 }, questions: { file: questionsPath.slice(root.length + 1), hash: sha(questionsText), count: questions.length }, node: process.version, comparisons, methods: results }, null, 1)}\n`);
console.log(lines.join('\n'));
