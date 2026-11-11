// Shared by the stage 2 browser evaluation: the page's own modules (search-rank.js, search-embed.js and the committed table) run in Node over a rendered site, the scoring of ../run-eval.mjs, and the fusion methods that were compared.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dequantizeRows, parseVocab } from '../../../../static/js/search-embed.js';
import { analyzeQuery, createIndex, fuse, rankHybrid, rankTerms, rankVectors, stem, wordSpans } from '../../../../static/js/search-rank.js';
import { embedPassages, loadTable } from '../../../../scripts/build-search-vectors.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, '../../../..');
export const evalsDir = resolve(here, '..');

export const sha = text => createHash('sha256').update(text).digest('hex').slice(0, 12);

// The page's ranking over one rendered site: BM25 as stage 1 chose it, the table from static/search, passage vectors made the way the build makes them (int8, read back as unit rows)
export async function loadSite(siteDir) {
  const indexText = readFileSync(join(siteDir, 'search-index.json'), 'utf8');
  const data = JSON.parse(indexText);
  const searchPage = readFileSync(join(siteDir, 'search/index.html'), 'utf8');
  const stopWords = JSON.parse(searchPage.match(/<script type="application\/json" class="search-copy">([\s\S]*?)<\/script>/)[1]).stopWords;
  const index = createIndex(data, { stopWords });
  const { manifest, embedder } = await loadTable(join(root, 'static/search'));
  const vocab = parseVocab(readFileSync(join(root, 'static/search', manifest.files.vocab.path), 'utf8'));
  const { data: int8, scale } = embedPassages(data, embedder);
  const vectors = { dimensions: manifest.dimensions, rows: dequantizeRows(int8, manifest.dimensions, scale) };
  return { data, indexInfo: { bytes: Buffer.byteLength(indexText), hash: data.hash, pages: data.pages.length, passages: index.docs.length }, stopWords, index, embedder, vectors, manifest, vocab };
}

// Pages that match a query only through one term that is in more than this share of the passages (a "generic" term)
export const GENERIC_SHARE = 0.05;

// A BM25 list without the pages that match only a single generic term, when the query has more than one term
export function withoutGenericMatches(index, analysis, rows) {
  if (analysis.terms.length < 2) return rows;
  const matchedBy = new Map();
  const share = [];
  analysis.terms.forEach((term, t) => {
    const docs = new Set();
    for (const word of term.words) for (const id of index.postings.get(word)?.docs ?? []) docs.add(id);
    share.push(docs.size / index.docs.length);
    for (const id of docs) {
      const page = index.docs[id].page;
      if (!matchedBy.has(page)) matchedBy.set(page, new Set());
      matchedBy.get(page).add(t);
    }
  });
  return rows.filter(row => {
    const terms = matchedBy.get(row.order);
    return terms.size > 1 || share[[...terms][0]] <= GENERIC_SHARE;
  });
}

// Every ranking is a function from a query to rows { key, score, rows? }. The methods are the candidates of the fusion comparison.
export function rankers(site) {
  const { index, embedder, vectors, stopWords } = site;
  const bm25 = query => {
    const analysis = analyzeQuery(index, query, { stopWords });
    return { analysis, rows: rankTerms(index, analysis) };
  };
  const semantic = query => rankVectors(index, vectors, embedder.embed(query));
  // While a word is still being typed, its pieces are noise to the table. The meaning of a query that ends in a word neither the index nor the table's vocabulary has is taken without that word (unless it is the only one).
  const settled = query => {
    const last = wordSpans(query).at(-1);
    if (!last || !/[\p{L}\p{N}]$/u.test(query) || index.postings.has(stem(last.word)) || site.vocab.has(last.word)) return query;
    return query.slice(0, last.start).trim() || query;
  };
  const hybrid = (query, options, filter, settle) => {
    const { analysis, rows } = bm25(query);
    if (!analysis.terms.length) return [];
    return fuse([filter ? withoutGenericMatches(index, analysis, rows) : rows, semantic(settle ? settled(query) : query)], options);
  };
  return {
    bm25: { label: 'BM25 alone', rank: query => bm25(query).rows },
    semantic: { label: 'Meaning alone (reference)', rank: query => (analyzeQuery(index, query, { stopWords }).terms.length ? semantic(query) : []) },
    'rrf-full': { label: 'RRF, full lists, k = 60', rank: query => hybrid(query, {}) },
    'rrf-top10': { label: 'RRF over the top 10 of each list', rank: query => hybrid(query, { tops: [10, 10] }) },
    // What the page runs: FUSION in search-rank.js
    page: { label: 'The page (rankHybrid)', rank: query => rankHybrid(index, vectors, analyzeQuery(index, query, { stopWords }), embedder.embed(query)) },
    'rrf-top20': { label: 'RRF over the top 20 of each list', rank: query => hybrid(query, { tops: [20, 20] }) },
    'rrf-meaning-x2': { label: 'RRF, full lists, meaning weighted 2 to 1', rank: query => hybrid(query, { weights: [1, 2] }) },
    'rrf-top10-settled': { label: 'RRF top 10, meaning without an unfinished last word', rank: query => hybrid(query, { tops: [10, 10] }, false, true) },
    'rrf-no-generic': { label: 'RRF, BM25 list without single generic term matches', rank: query => hybrid(query, {}, true) },
  };
}

// Scoring, as ../run-eval.mjs and ../embed/score.mjs: recall at 5 of the grade 2 pages, reciprocal rank of the first of them within 10, nDCG at 10 with gains 2 and 1
export const judged = question => new Map(question.relevant.map(entry => [entry.href, entry.grade]));

export function score(question, ranked) {
  const grades = judged(question);
  const rank = new Map(ranked.map((row, i) => [row.page.key, i + 1]));
  const top2 = [...grades].filter(([, grade]) => grade === 2).map(([key]) => key);
  const found = top2.filter(key => rank.get(key) <= 5).length;
  const first = top2.map(key => rank.get(key)).filter(r => r <= 10).sort((a, b) => a - b)[0];
  let dcg = 0;
  ranked.slice(0, 10).forEach((row, i) => { dcg += (grades.get(row.page.key) ?? 0) / Math.log2(i + 2); });
  const ideal = [...grades.values()].sort((a, b) => b - a).slice(0, 10);
  const idcg = ideal.reduce((sum, grade, i) => sum + grade / Math.log2(i + 2), 0);
  const firstRank = top2.map(key => rank.get(key)).filter(Boolean).sort((a, b) => a - b)[0] ?? null;
  return { recall5: top2.length ? found / top2.length : null, rr: first ? 1 / first : 0, ndcg: idcg ? dcg / idcg : null, firstRank };
}

export const mean = values => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
export const round = (value, digits = 3) => (value === null || value === undefined ? value : Math.round(value * 10 ** digits) / 10 ** digits);
export const summarize = rows => ({ queries: rows.length, recall5: mean(rows.map(r => r.recall5)), mrr10: mean(rows.map(r => r.rr)), ndcg10: mean(rows.map(r => r.ndcg)) });

export function evaluate(questions, rank) {
  const rows = questions.map(question => {
    const ranked = rank(question.query);
    const base = { id: question.id, type: question.type, query: question.query, results: ranked.length, top5: ranked.slice(0, 5).map(r => r.page.key) };
    return question.type === 'none' ? base : { ...base, ...score(question, ranked) };
  });
  const answerable = rows.filter(row => row.type !== 'none');
  const byType = {};
  for (const row of answerable) (byType[row.type] ??= []).push(row);
  return { overall: summarize(answerable), byType: Object.fromEntries(Object.entries(byType).map(([type, list]) => [type, summarize(list)])), queries: rows };
}

// The typing replay of ../run-eval.mjs: every answerable query whose last word has four letters or more, with that word cut to its first half
export function typedQueries(questions) {
  const out = [];
  for (const question of questions) {
    if (question.type === 'none') continue;
    const last = wordSpans(question.query).at(-1);
    if (!last || last.word.length < 4) continue;
    out.push({ question, typed: question.query.slice(0, last.start) + question.query.slice(last.start, last.start + Math.ceil(last.word.length / 2)) });
  }
  return out;
}

export function typingReplay(questions, rank) {
  const scores = typedQueries(questions).map(({ question, typed }) => score(question, rank(typed)));
  return { queries: scores.length, recall5: mean(scores.map(r => r.recall5)), mrr10: mean(scores.map(r => r.rr)) };
}

// How much the top of the list moves while the last word is typed one letter at a time (from two letters to the whole word): the share of the top 5 pages kept from one keystroke to the next, and how often the first page changes
export function typingStability(questions, rank) {
  const overlaps = [];
  let steps = 0;
  let firstChanges = 0;
  let words = 0;
  for (const question of questions) {
    if (question.type === 'none') continue;
    const last = wordSpans(question.query).at(-1);
    if (!last || last.word.length < 3) continue;
    words++;
    let previous = null;
    for (let length = 2; length <= last.word.length; length++) {
      const typed = question.query.slice(0, last.start) + question.query.slice(last.start, last.start + length);
      const top = rank(typed).slice(0, 5).map(row => row.page.key);
      if (previous) {
        steps++;
        const kept = top.filter(key => previous.includes(key)).length;
        overlaps.push(kept / Math.max(top.length, previous.length, 1));
        if (top[0] !== previous[0]) firstChanges++;
      }
      previous = top;
    }
  }
  return { words, steps, keptTop5: mean(overlaps), firstPageChangesPerWord: words ? firstChanges / words : null };
}
