// Keyword ranking for the search page: tokens, Okapi BM25 over passages, one row per page. No DOM and no globals, so the page and the evaluation in _devlog/local-search/evals/ run this same file. An ES module, loaded by static/js/search.js and imported by Node.

// The version of search-index.json this module reads, the same number as SCHEMA_VERSION in scripts/build-search-index.mjs
export const INDEX_VERSION = 1;

export const DEFAULTS = {
  k1: 1.2,
  b: 0.75,
  // A field's words count this many times in a passage. The page title and the section heading outrank body text; code and formula words count for half.
  weights: { title: 3, heading: 2, body: 1, code: 0.5 },
  // 'porter', 's' (plurals only) or 'none'
  stem: 'porter',
  // The last word of a query also matches the start of longer words, so a half-typed word finds its page
  prefix: true,
  // The shortest last word that is matched as a prefix. One letter matches most of the vocabulary.
  minPrefix: 2,
  stopWords: [],
};

const WORD = /[\p{L}\p{N}]+/gu;

// Lowercase words with their offsets in the original text
export function wordSpans(text) {
  const spans = [];
  for (const match of text.matchAll(WORD)) spans.push({ word: match[0].toLowerCase(), start: match.index, end: match.index + match[0].length });
  return spans;
}

export function tokenize(text) {
  return wordSpans(text).map(span => span.word);
}

// Harman's S stemmer: plurals only
function sStem(word) {
  if (word.length < 4) return word;
  if (/ies$/.test(word) && !/[ae]ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/es$/.test(word) && !/[aeo]es$/.test(word)) return word.slice(0, -1);
  if (/s$/.test(word) && !/(us|ss)$/.test(word)) return word.slice(0, -1);
  return word;
}

const CONSONANT = '[^aeiou]';
const VOWEL = '[aeiouy]';
const C = `${CONSONANT}[^aeiouy]*`;
const V = `${VOWEL}[aeiou]*`;
const M_GT_0 = new RegExp(`^(${C})?${V}${C}`);
const M_EQ_1 = new RegExp(`^(${C})?${V}${C}(${V})?$`);
const M_GT_1 = new RegExp(`^(${C})?${V}${C}${V}${C}`);
const HAS_VOWEL = new RegExp(`^(${C})?${VOWEL}`);
const CVC = new RegExp(`^${C}${VOWEL}[^aeiouwxy]$`);
const STEP2 = { ational: 'ate', tional: 'tion', enci: 'ence', anci: 'ance', izer: 'ize', bli: 'ble', alli: 'al', entli: 'ent', eli: 'e', ousli: 'ous', ization: 'ize', ation: 'ate', ator: 'ate', alism: 'al', iveness: 'ive', fulness: 'ful', ousness: 'ous', aliti: 'al', iviti: 'ive', biliti: 'ble', logi: 'log' };
const STEP3 = { icate: 'ic', ative: '', alize: 'al', iciti: 'ic', ical: 'ic', ful: '', ness: '' };

// The Porter (1980) stemmer
function porter(input) {
  if (input.length < 3) return input;
  let word = input[0] === 'y' ? `Y${input.slice(1)}` : input;
  let match;
  if (/^(.+?)(ss|i)es$/.test(word)) word = word.replace(/^(.+?)(ss|i)es$/, '$1$2');
  else if (/^(.+?)([^s])s$/.test(word)) word = word.replace(/^(.+?)([^s])s$/, '$1$2');
  if ((match = /^(.+?)eed$/.exec(word))) {
    if (M_GT_0.test(match[1])) word = word.slice(0, -1);
  } else if ((match = /^(.+?)(ed|ing)$/.exec(word)) && HAS_VOWEL.test(match[1])) {
    word = match[1];
    if (/(at|bl|iz)$/.test(word)) word += 'e';
    else if (/([^aeiouylsz])\1$/.test(word)) word = word.slice(0, -1);
    else if (CVC.test(word)) word += 'e';
  }
  if ((match = /^(.+?)y$/.exec(word)) && HAS_VOWEL.test(match[1])) word = `${match[1]}i`;
  if ((match = /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/.exec(word)) && M_GT_0.test(match[1])) word = match[1] + STEP2[match[2]];
  if ((match = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/.exec(word)) && M_GT_0.test(match[1])) word = match[1] + STEP3[match[2]];
  if ((match = /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/.exec(word))) {
    if (M_GT_1.test(match[1])) word = match[1];
  } else if ((match = /^(.+?)(s|t)(ion)$/.exec(word)) && M_GT_1.test(match[1] + match[2])) word = match[1] + match[2];
  if ((match = /^(.+?)e$/.exec(word)) && (M_GT_1.test(match[1]) || (M_EQ_1.test(match[1]) && !CVC.test(match[1])))) word = match[1];
  if (/ll$/.test(word) && M_GT_1.test(word)) word = word.slice(0, -1);
  return word[0] === 'Y' ? `y${word.slice(1)}` : word;
}

const caches = { porter: new Map(), s: new Map() };

// Words with digits (gemma4, h200) and words that are not plain Latin letters are left alone
export function stem(word, mode = DEFAULTS.stem) {
  if (mode === 'none' || !/^[a-z]+$/.test(word)) return word;
  const cache = caches[mode];
  let result = cache.get(word);
  if (result === undefined) {
    result = mode === 'porter' ? porter(word) : sStem(word);
    cache.set(word, result);
  }
  return result;
}

// The passages of the parsed search-index.json ({ pages: [{ h, t, d, p: [[anchor, heading, text, code?], ...] }] }) in index order: for each page, first a passage made of its description and linked to the page itself, then its own. createIndex numbers its passages in this order, and so do the passage vectors that scripts/build-search-vectors.mjs writes.
export function* passages(data) {
  for (let page = 0; page < data.pages.length; page++) {
    const entry = data.pages[page];
    yield { page, anchor: '', heading: '', text: entry.d, code: '' };
    for (const [anchor, heading, text, code = ''] of entry.p) yield { page, anchor, heading, text, code };
  }
}

export function createIndex(data, options = {}) {
  const settings = { ...DEFAULTS, ...options, weights: { ...DEFAULTS.weights, ...options.weights } };
  const { weights } = settings;
  const pages = data.pages.map(entry => ({ key: entry.h, title: entry.t, description: entry.d, titleWords: tokenize(entry.t) }));
  const docs = [];
  const postings = new Map();
  let total = 0;

  for (const { page, anchor, heading, text, code } of passages(data)) {
    const counts = new Map();
    let length = 0;
    const count = (words, weight) => {
      if (!weight) return;
      for (const word of words) {
        const term = stem(word, settings.stem);
        counts.set(term, (counts.get(term) ?? 0) + weight);
        length += weight;
      }
    };
    count(pages[page].titleWords, weights.title);
    count(tokenize(heading), weights.heading);
    count(tokenize(text), weights.body);
    count(tokenize(code), weights.code);
    const id = docs.length;
    docs.push({ page, anchor, heading, text, length });
    total += length;
    for (const [term, tf] of counts) {
      let list = postings.get(term);
      if (!list) postings.set(term, (list = { docs: [], tfs: [] }));
      list.docs.push(id);
      list.tfs.push(tf);
    }
  }
  return { settings, pages, docs, postings, avgLength: total / docs.length || 1 };
}

// The terms a query is made of. A term is the list of index words it can match: the stem of a word, or for the last word of a query that is still being typed, every indexed word that starts with it.
export function analyzeQuery(index, query, options = {}) {
  const { stopWords, prefix, minPrefix } = { ...index.settings, ...options };
  const stops = new Set(stopWords);
  const words = tokenize(query);
  const typing = prefix && words.length > 0 && /[\p{L}\p{N}]$/u.test(query);
  const kept = words.filter(word => !stops.has(word));
  const used = kept.length ? kept : words;
  const last = words[words.length - 1];
  const terms = [];
  const seen = new Set();
  for (const word of used) {
    const base = stem(word, index.settings.stem);
    const isPrefix = typing && word === last && word.length >= minPrefix && used[used.length - 1] === word;
    const key = isPrefix ? `${word}*` : base;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!isPrefix) { terms.push({ word, words: [base] }); continue; }
    const matches = new Set([base]);
    for (const term of index.postings.keys()) if (term.startsWith(base) || term.startsWith(word)) matches.add(term);
    terms.push({ word, words: [...matches], prefix: true });
  }
  return { query, terms, matched: new Set(terms.flatMap(term => term.words)) };
}

// One row per page, best first: { page, score, doc } where page and doc are entries of index.pages and index.docs. Only pages with at least one matching word are returned.
export function search(index, query, options = {}) {
  return rankTerms(index, analyzeQuery(index, query, options), options);
}

export function rankTerms(index, analysis, options = {}) {
  const { k1, b } = { ...index.settings, ...options };
  const n = index.docs.length;
  const scores = new Map();
  for (const term of analysis.terms) {
    const tfs = new Map();
    for (const word of term.words) {
      const list = index.postings.get(word);
      if (!list) continue;
      for (let i = 0; i < list.docs.length; i++) tfs.set(list.docs[i], (tfs.get(list.docs[i]) ?? 0) + list.tfs[i]);
    }
    const idf = Math.log(1 + (n - tfs.size + 0.5) / (tfs.size + 0.5));
    for (const [id, tf] of tfs) {
      const norm = k1 * (1 - b + (b * index.docs[id].length) / index.avgLength);
      scores.set(id, (scores.get(id) ?? 0) + (idf * tf * (k1 + 1)) / (tf + norm));
    }
  }
  const best = new Map();
  for (const [id, score] of scores) {
    const page = index.docs[id].page;
    const current = best.get(page);
    if (!current || score > current.score || (score === current.score && id < current.id)) best.set(page, { id, score });
  }
  return [...best.entries()]
    .map(([page, { id, score }]) => ({ page: index.pages[page], order: page, score, doc: index.docs[id] }))
    .sort((a, b) => b.score - a.score || a.order - b.order);
}

// Meaning ranking: vectors is { dimensions, rows } with one unit length row per passage of the index, in index order (see passages), and query is a unit length vector from search-embed.js. One row per page from its best passage by cosine similarity, best first, in the shape of rankTerms. A query vector of zeros (no word the table knows) gives no rows.
export function rankVectors(index, vectors, query) {
  const { dimensions, rows } = vectors;
  const best = new Map();
  let any = false;
  for (let i = 0; i < dimensions; i++) if (query[i]) { any = true; break; }
  if (!any) return [];
  for (let id = 0; id < index.docs.length; id++) {
    let score = 0;
    for (let i = 0, at = id * dimensions; i < dimensions; i++) score += query[i] * rows[at + i];
    const page = index.docs[id].page;
    const current = best.get(page);
    if (!current || score > current.score) best.set(page, { id, score });
  }
  return [...best.entries()]
    .map(([page, { id, score }]) => ({ page: index.pages[page], order: page, score, doc: index.docs[id] }))
    .sort((a, b) => b.score - a.score || a.order - b.order);
}

// Reciprocal rank fusion of ranked lists (rows of rankTerms and rankVectors): a page earns weight / (k + rank) from each list it is in, counting only the first `top` rows of that list. One row per page, best first; its passage is the one from the list that ranks the page higher, the first list on a tie. ranks holds the page's rank in each list.
export function fuse(lists, { k = 60, tops = [], weights = [] } = {}) {
  const total = new Map();
  lists.forEach((rows, list) => {
    const limit = tops[list] ?? Infinity;
    const weight = weights[list] ?? 1;
    rows.forEach((row, i) => {
      if (i >= limit) return;
      const entry = total.get(row.order) ?? { score: 0, row, ranks: [], best: Infinity };
      entry.score += weight / (k + i + 1);
      entry.ranks[list] = i + 1;
      if (i + 1 < entry.best) { entry.best = i + 1; entry.row = row; }
      total.set(row.order, entry);
    });
  });
  return [...total.values()]
    .map(({ score, row, ranks }) => ({ page: row.page, order: row.order, score, doc: row.doc, ranks }))
    .sort((a, b) => b.score - a.score || (a.ranks[0] ?? Infinity) - (b.ranks[0] ?? Infinity) || a.order - b.order);
}

// How the keyword and meaning rankings are combined: reciprocal rank fusion with k = 60 over the first 10 pages of each list. Fusing the whole lists let BM25's long tail of pages that share one common word outvote good meaning ranks (see _devlog/local-search/journal.md). nearest is how many pages a query with no keyword match gets, all by meaning.
export const FUSION = { k: 60, tops: [10, 10], nearest: 5 };

// Keyword and meaning together, in the shape of rankTerms. query is the unit length vector of the query text. The fused rows come first; every other page that matches a keyword follows in keyword order (ranks holds only its keyword rank), so a page that literally matches is never dropped. A query with no keyword term has no rows, and one with no keyword match gets its FUSION.nearest closest pages by meaning (no row has a keyword rank).
export function rankHybrid(index, vectors, analysis, query) {
  if (!analysis.terms.length) return [];
  const keyword = rankTerms(index, analysis);
  const rows = fuse([keyword, rankVectors(index, vectors, query)], FUSION);
  if (!keyword.length) return rows.slice(0, FUSION.nearest);
  const fused = new Set(rows.map(row => row.order));
  keyword.forEach((row, i) => { if (!fused.has(row.order)) rows.push({ ...row, ranks: [i + 1] }); });
  return rows;
}

// How a page's path joins the index to the page list: no fragment, and a folder means its index.html. Used by the page and by scripts/build-search-index.mjs.
export function pageKey(href) {
  return String(href).split('#')[0].replace(/^\//, '').replace(/(^|\/)$/, '$1index.html');
}

// The [start, end] offsets of the words in text that match the query, for highlighting
export function matchRanges(index, analysis, text) {
  const ranges = [];
  for (const { word, start, end } of wordSpans(text)) if (analysis.matched.has(stem(word, index.settings.stem))) ranges.push([start, end]);
  return ranges;
}
