#!/usr/bin/env node
// Stage 3, step 1: retrieval for the 45 questions with the page's own hybrid ranking, the retrieval hit check, the model input file and the "skip the model" gate for the record. No model runs here.
// Run from the repo root with Node 24: node _devlog/local-search/evals/answers/prepare.mjs
//
// Passage format, fixed here before any model ran, the same for every model:
//   - the top four pages of rankHybrid for the question as typed (the page's fusion, stop words from search/index.html), one passage per page: the page's best passage in the fused list
//   - title: the page title, then ", section: <heading>" when the passage has a heading (the description passage has none)
//   - text: the passage text exactly as indexed in search-index.json (at most 1000 characters, no code field, no truncation or rewriting)
//   - numbered [1] to [4] in rank order by harness/prompt.mjs; fewer than four when the ranking returns fewer pages
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytesToBase64 } from '../../../../static/js/search-embed.js';
import { analyzeQuery, rankHybrid, stem, tokenize } from '../../../../static/js/search-rank.js';
import { embedPassages } from '../../../../scripts/build-search-vectors.mjs';
import { loadSite, root } from '../stage2-browser/harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(here, 'results');
mkdirSync(resultsDir, { recursive: true });

const TOP = 4;
const questions = JSON.parse(readFileSync(join(here, 'questions.json'), 'utf8'));
const site = await loadSite(join(root, '_site'));
const { index, embedder, vectors, stopWords, data } = site;

// The vectors the page would load must be the ones this script ranks with
const shipped = JSON.parse(readFileSync(join(root, '_site/search-vectors.json'), 'utf8'));
if (shipped.index !== data.hash) throw new Error('search-vectors.json is for another index than search-index.json');
if (bytesToBase64(new Uint8Array(embedPassages(data, embedder).data.buffer)) !== shipped.vectors) throw new Error('search-vectors.json differs from the vectors made here');

// Plain words of a text: markdown links keep their label, everything that is not a letter or digit becomes a space, lowercase. Used to find a quote inside passages.
const squash = text => text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Content words of a text for the gate: not a search stop word, at least three characters, stemmed as the index does
const stops = new Set(stopWords);
const content = text => new Set(tokenize(text).filter(w => w.length >= 3 && !stops.has(w)).map(w => stem(w)));

function retrieve(question) {
  const analysis = analyzeQuery(index, question, { stopWords });
  const fused = rankHybrid(index, vectors, analysis, embedder.embed(question));
  const passages = fused.slice(0, TOP).map((row, i) => ({
    rank: i + 1,
    href: row.page.key,
    page: row.page.title,
    anchor: row.doc.anchor,
    heading: row.doc.heading,
    title: row.doc.heading ? `${row.page.title}, section: ${row.doc.heading}` : row.page.title,
    text: row.doc.text,
  }));
  return { fused, passages };
}

// Every indexed passage of each page, squashed, to tell "the page was retrieved but its best passage is another one" from "the quote is not in the index text at all"
const pagePassages = new Map(data.pages.map(page => [page.h, [page.d, ...page.p.map(([, heading, text]) => `${heading}\n${text}`)].map(squash)]));

function checkHit(entry, fused, passages) {
  const hrefs = new Set(entry.support.map(s => s.href));
  const pageRank = fused.findIndex(row => hrefs.has(row.page.key)) + 1 || null;
  const supplied = passages.map(p => squash(`${p.title}\n${p.text}`));
  const quotes = entry.support.map(s => {
    const q = squash(s.quote);
    const inRank = supplied.findIndex(text => text.includes(q)) + 1 || null;
    return { href: s.href, found: inRank !== null, passageRank: inRank, inIndexedPage: (pagePassages.get(s.href) ?? []).some(text => text.includes(q)) };
  });
  const found = quotes.filter(q => q.found);
  // A near miss to read by hand: the supporting page is among the four but no quote is whole inside its passage. The share of a quote's words that appear in the supplied text, in order of the five word runs.
  const words = q => squash(q).split(' ');
  const runs = q => { const w = words(q); const out = []; for (let i = 0; i + 5 <= w.length; i++) out.push(w.slice(i, i + 5).join(' ')); return out; };
  const allText = supplied.join(' ');
  const partial = Math.max(...entry.support.map(s => { const r = runs(s.quote); return r.length ? r.filter(x => allText.includes(x)).length / r.length : 0; }));
  const pageInTop = passages.some(p => hrefs.has(p.href));
  return { hit: found.length > 0, passageRank: found.length ? Math.min(...found.map(q => q.passageRank)) : null, supportPageRank: pageRank, supportPageInTop: pageInTop, quotesFound: found.length, quotesTotal: quotes.length, quotesInIndexedPage: quotes.filter(q => q.inIndexedPage).length, bestPartialShare: +partial.toFixed(2), quotes };
}

const rows = [];
const all = [...questions.answerable.map(q => ({ ...q, half: 'answerable' })), ...questions.unanswerable.map(q => ({ ...q, half: 'unanswerable' }))];
for (const entry of all) {
  const { fused, passages } = retrieve(entry.question);
  const row = { id: entry.id, half: entry.half, kind: entry.kind, question: entry.question, results: fused.length, passages };
  if (entry.half === 'answerable') row.retrieval = checkHit(entry, fused, passages);
  // The gate for the record: no content word of the question appears in the supplied passages
  const q = content(entry.question);
  const p = content(passages.map(x => `${x.title}\n${x.text}`).join('\n'));
  const shared = [...q].filter(w => p.has(w));
  row.gate = { questionWords: [...q], shared, fires: shared.length === 0 };
  rows.push(row);
}

const answerable = rows.filter(r => r.half === 'answerable');
const hits = answerable.filter(r => r.retrieval.hit);
const rankCounts = {};
for (const r of hits) rankCounts[r.retrieval.passageRank] = (rankCounts[r.retrieval.passageRank] ?? 0) + 1;
const gate = half => { const list = rows.filter(r => r.half === half); return { fired: list.filter(r => r.gate.fires).length, of: list.length, firedIds: list.filter(r => r.gate.fires).map(r => r.id) }; };
const unanswerable = rows.filter(r => r.half === 'unanswerable');
const summary = {
  made: new Date().toISOString(),
  indexHash: data.hash,
  passageFormat: 'top 4 pages of rankHybrid, one passage per page (the page\'s best passage in the fused list); title = page title + ", section: <heading>" when there is a heading; text = indexed passage text unchanged',
  hitRule: 'an answerable question is a hit when at least one of its supporting quotes, after markdown link labels are kept, text lowercased and every run of non letters and digits replaced by one space, is a contiguous substring of any supplied passage (title line plus text) normalized the same way',
  answerable: answerable.length,
  hits: hits.length,
  hitPassageRanks: rankCounts,
  supportPageInTopFourButNoQuote: answerable.filter(r => !r.retrieval.hit && r.retrieval.supportPageInTop).map(r => r.id),
  noHitQuoteNotInIndexedPage: answerable.filter(r => !r.retrieval.hit && r.retrieval.quotesInIndexedPage === 0).map(r => r.id),
  noHitSupportPageRank: Object.fromEntries(answerable.filter(r => !r.retrieval.hit).map(r => [r.id, r.retrieval.supportPageRank])),
  fewerThanFour: rows.filter(r => r.passages.length < TOP).map(r => r.id),
  gate: { rule: 'fires when no content word (three or more characters, not a search stop word, Porter stem) of the question is in the four supplied passages (title and text)', unanswerable: gate('unanswerable'), nearMiss: { fired: unanswerable.filter(r => r.kind === 'near-miss' && r.gate.fires).length, of: unanswerable.filter(r => r.kind === 'near-miss').length }, offTopic: { fired: unanswerable.filter(r => r.kind === 'off-topic' && r.gate.fires).length, of: unanswerable.filter(r => r.kind === 'off-topic').length }, answerable: gate('answerable') },
};
writeFileSync(join(resultsDir, 'retrieval.json'), `${JSON.stringify({ summary, questions: rows }, null, 1)}\n`);
writeFileSync(join(resultsDir, 'items.json'), `${JSON.stringify(rows.map(r => ({ id: r.id, question: r.question, passages: r.passages.map(p => ({ title: p.title, text: p.text })) })), null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
