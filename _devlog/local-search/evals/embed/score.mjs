// The scoring of ../run-eval.mjs (score, summarize, the per-query row), copied so this folder can import it: run-eval.mjs runs the whole stage 1 evaluation when imported and rewrites its result files.
// compare.mjs checks that these functions reproduce results/bm25-clean.porter-prefix.json exactly.
import { questions } from './data.mjs';

export const judged = question => new Map(question.relevant.map(entry => [entry.href, entry.grade]));

export function score(question, ranked) {
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

export const mean = values => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
export const round = (value, digits = 3) => (value === null || value === undefined ? value : Math.round(value * 10 ** digits) / 10 ** digits);

export function summarize(rows) {
  return { queries: rows.length, recall5: mean(rows.map(r => r.recall5)), mrr10: mean(rows.map(r => r.rr)), ndcg10: mean(rows.map(r => r.ndcg)) };
}

// rank(question) returns [{ key, score }] best first, one row per page
export function evaluate(rank) {
  const rows = questions.map(question => {
    const ranked = rank(question);
    const grades = judged(question);
    const row = { id: question.id, type: question.type, query: question.query, results: ranked.length, topScore: ranked[0]?.score ?? 0, top10: ranked.slice(0, 10).map(r => ({ key: r.key, score: round(r.score, 4), grade: grades.get(r.key) ?? 0 })) };
    if (question.type === 'none') return row;
    const ranks = Object.fromEntries(question.relevant.map(entry => [entry.href, { grade: entry.grade, rank: ranked.findIndex(r => r.key === entry.href) + 1 || null }]));
    const bestRelevant = ranked.find(r => grades.get(r.key) === 2);
    return { ...row, ranks, bestRelevantScore: bestRelevant?.score ?? 0, ...score(question, ranked) };
  });
  const answerable = rows.filter(row => row.type !== 'none');
  const byType = {};
  for (const row of answerable) (byType[row.type] ??= []).push(row);
  return { overall: summarize(answerable), byType: Object.fromEntries(Object.entries(byType).map(([type, list]) => [type, summarize(list)])), queries: rows };
}
