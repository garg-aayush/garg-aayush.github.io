import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FUSION, INDEX_VERSION, analyzeQuery, createIndex, fuse, matchRanges, passages, rankHybrid, rankVectors, search, stem, tokenize } from '../static/js/search-rank.js';
import { SCHEMA_VERSION } from './build-search-index.mjs';

const data = {
  pages: [
    { h: 'flash.html', t: 'FlashAttention', d: 'Fast attention kernels.', p: [['online-softmax', 'Online softmax', 'The softmax is computed in one pass with a running maximum.'], ['tiling', 'Tiling', 'Blocks of keys and values stay in SRAM.']] },
    { h: 'kalman.html', t: 'Kalman filters', d: 'Filtering noisy series.', p: [['gaps', 'Filling gaps', 'Smoothing fills deleted gaps in a seasonal series. The filter uses the future too.', 'llama-server --parallel 2']] },
    { h: 'about.html', t: 'About', d: 'Work history.', p: [['shell', 'Shell', 'Research geophysicist working on seismic data.']] },
    { h: 'weather.html', t: 'India Weather', d: 'Live air quality.', p: [] },
  ],
};
const options = { stopWords: ['the', 'a', 'how', 'does'] };
const index = createIndex(data, options);
const keys = query => search(index, query).map(row => row.page.key);

test('the module and the builder agree on the index version', () => {
  assert.equal(INDEX_VERSION, SCHEMA_VERSION);
});

test('tokenizes to lowercase words', () => {
  assert.deepEqual(tokenize('Bradley-Terry model, GLM-5.3'), ['bradley', 'terry', 'model', 'glm', '5', '3']);
});

test('the stemmers join word forms and leave other words alone', () => {
  const pairs = { caresses: 'caress', ponies: 'poni', agreed: 'agre', motoring: 'motor', relational: 'relat', conditional: 'condit', hopefulness: 'hope', adjustment: 'adjust', derivation: 'deriv', diarization: 'diariz', geophysical: 'geophys', gpus: 'gpu', sky: 'sky' };
  for (const [word, expected] of Object.entries(pairs)) assert.equal(stem(word, 'porter'), expected, word);
  assert.equal(stem('tokenizers', 's'), 'tokenizer');
  assert.equal(stem('queries', 's'), 'query');
  assert.equal(stem('class', 's'), 'class');
  assert.equal(stem('gemma4s', 'porter'), 'gemma4s');
  assert.equal(stem('running', 'none'), 'running');
});

test('ranks by BM25, with a page title and a heading above body text', () => {
  assert.deepEqual(keys('kalman'), ['kalman.html']);
  assert.equal(keys('attention')[0], 'flash.html');
  assert.deepEqual(keys('softmax'), ['flash.html']);
  assert.equal(search(index, 'softmax')[0].doc.anchor, 'online-softmax');
  const flat = createIndex(data, { ...options, weights: { title: 1, heading: 1, body: 1, code: 1 } });
  assert.ok(search(index, 'shell')[0].score > search(flat, 'shell')[0].score, 'a heading hit counts for more');
});

test('returns one row per page with its best passage, and the description when only that matches', () => {
  const rows = search(index, 'keys values sram');
  assert.deepEqual(rows.map(row => row.page.key), ['flash.html']);
  assert.equal(rows[0].doc.anchor, 'tiling');
  const description = search(index, 'fast kernels')[0];
  assert.equal(description.doc.text, 'Fast attention kernels.');
  assert.equal(description.doc.anchor, '');
});

test('matches the last word as a prefix while it is typed and not once it is finished', () => {
  assert.deepEqual(keys('kalm'), ['kalman.html']);
  assert.deepEqual(keys('flash attent'), ['flash.html']);
  assert.deepEqual(keys('kalm '), [], 'a trailing space ends the word');
  assert.deepEqual(keys('k'), [], 'one letter is not expanded');
  const exact = createIndex(data, { ...options, prefix: false });
  assert.deepEqual(search(exact, 'kalm'), []);
  assert.equal(analyzeQuery(index, 'kalm').terms[0].prefix, true);
});

test('stemming joins word forms, and a word with no stem in common is not found', () => {
  assert.deepEqual(keys('filters'), ['kalman.html']);
  assert.deepEqual(keys('filling gap'), ['kalman.html']);
  assert.deepEqual(keys('geophysics '), [], 'geophysics has no stem in common with geophysicist');
  const plain = createIndex(data, { ...options, stem: 'none', prefix: false });
  assert.deepEqual(search(plain, 'filtered'), []);
  assert.deepEqual(keys('filtered'), ['kalman.html']);
});

test('code and formula words are searchable and can be switched off', () => {
  assert.equal(keys('parallel')[0], 'kalman.html');
  const without = createIndex(data, { ...options, weights: { code: 0 } });
  assert.deepEqual(search(without, 'parallel'), []);
});

test('drops stop words unless the query is nothing else', () => {
  assert.deepEqual(analyzeQuery(index, 'how does the kalman work').terms.map(term => term.word), ['kalman', 'work']);
  assert.deepEqual(analyzeQuery(index, 'how does the').terms.map(term => term.word), ['how', 'does', 'the']);
  assert.deepEqual(analyzeQuery(index, '   ').terms, []);
});

test('returns no rows for words the site does not have, and finds a page that has no passages', () => {
  assert.deepEqual(keys('kubernetes'), []);
  assert.deepEqual(keys('air quality'), ['weather.html']);
});

test('gives the ranges of matching words for highlighting, with the same stemming', () => {
  const text = 'Smoothing fills deleted gaps in a series.';
  const slices = query => matchRanges(index, analyzeQuery(index, query), text).map(([start, end]) => text.slice(start, end));
  assert.deepEqual(slices('fill gap'), ['fills', 'gaps']);
  assert.deepEqual(slices('smoo'), ['Smoothing']);
});

// Two dimensions: x is "attention", y is "weather". One unit vector per passage of `data` in index order (a description first, then the page's passages).
const unit = (x, y) => { const n = Math.hypot(x, y); return [x / n, y / n]; };
const vectors = { dimensions: 2, rows: Float32Array.from([
  ...unit(1, 0), ...unit(1, 0.2), ...unit(0.8, 0.5), // flash.html: description, online softmax, tiling
  ...unit(0, 1), ...unit(0.1, 1), // kalman.html: description, gaps
  ...unit(0.2, 1), ...unit(0.3, 1), // about.html: description, shell
  ...unit(-1, 0), // weather.html: description
]) };

test('passages lists the description of every page before its own passages, the order createIndex numbers them in', () => {
  const list = [...passages(data)];
  assert.deepEqual(list.map(entry => entry.page), [0, 0, 0, 1, 1, 2, 2, 3]);
  assert.equal(list[0].text, 'Fast attention kernels.');
  assert.equal(list[1].anchor, 'online-softmax');
  assert.equal(index.docs.length, list.length);
  assert.deepEqual(index.docs.map(doc => doc.anchor), list.map(entry => entry.anchor));
});

test('ranks pages by the cosine of their best passage and finds a page that has no passages', () => {
  const rows = rankVectors(index, vectors, [1, 0]);
  assert.deepEqual(rows.map(row => row.page.key), ['flash.html', 'about.html', 'kalman.html', 'weather.html']);
  assert.equal(rows[0].doc.anchor, '', 'the description matches best');
  assert.equal(rankVectors(index, vectors, [0, 1])[0].page.key, 'kalman.html');
  assert.equal(rankVectors(index, vectors, [-1, 0])[0].page.key, 'weather.html');
  assert.deepEqual(rankVectors(index, vectors, [0, 0]), [], 'a query the table does not know has no meaning rows');
});

test('fuses ranked lists by reciprocal rank, takes each list only as far as its top, and shows the passage of the list that ranks the page higher', () => {
  const row = (order, doc) => ({ page: index.pages[order], order, doc: index.docs[doc], score: 1 });
  const bm25 = [row(2, 5), row(0, 1), row(1, 3)];
  const meaning = [row(0, 2), row(3, 7), row(2, 6)];
  const full = fuse([bm25, meaning], { k: 10 });
  assert.deepEqual(full.map(entry => entry.order), [0, 2, 3, 1]);
  assert.ok(Math.abs(full[0].score - (1 / 12 + 1 / 11)) < 1e-12);
  assert.deepEqual(full[0].ranks, [2, 1]);
  assert.equal(full[0].doc, index.docs[2], 'the meaning list ranks page 0 first, so its passage is shown');
  assert.equal(full[1].doc, index.docs[5], 'page 2 is first in the keyword list');
  assert.equal(full[2].ranks[0], undefined, 'a page only one list has');
  assert.equal(full[2].ranks[1], 2);
  const cut = fuse([bm25, meaning], { k: 10, tops: [1, 2] });
  assert.deepEqual(cut.map(entry => entry.order), [2, 0, 3], 'rows beyond a list\'s top do not count and a page outside both tops is gone');
  const weighted = fuse([bm25, meaning], { k: 10, weights: [1, 5] });
  assert.deepEqual(weighted.map(entry => entry.order), [0, 2, 3, 1], 'weight 5 on the meaning list puts its page 3 above the keyword-only page 1');
});

test('the page fusion is reciprocal rank fusion with k 60 over the first 10 pages of each list, and it needs a keyword term', () => {
  assert.deepEqual(FUSION, { k: 60, tops: [10, 10] });
  const analysis = analyzeQuery(index, 'seismic', options);
  const rows = rankHybrid(index, vectors, analysis, [1, 0]);
  assert.deepEqual(rows.map(row => row.page.key), ['about.html', 'flash.html', 'kalman.html', 'weather.html']);
  assert.equal(rows[0].ranks[0], 1);
  assert.deepEqual(rankHybrid(index, vectors, analyzeQuery(index, '?!', options), [1, 0]), [], 'no word, nothing to rank');
});
