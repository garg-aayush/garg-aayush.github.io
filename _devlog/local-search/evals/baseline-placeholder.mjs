// The placeholder ranking of step one, kept as a baseline. This is static/js/search.js as it was before BM25 (the cleaning of Quarto's search.json and rankPages), lifted out of the DOM so run-eval.mjs can score it. Do not improve it: it exists to be compared with.
import { decodeEntities } from '../../../scripts/build-search-index.mjs';
import { pageKey } from '../../../static/js/search-rank.js';

const WORD = '[\\p{L}\\p{N}]';

function clean(text) {
  return text
    .replace(/\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => math.replace(/\\[a-zA-Z]+/g, '').replace(/[{}_^\\]/g, ''))
    .replace(/No matching items/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*All writing$/, '')
    .trim();
}

const plain = value => decodeEntities(String(value ?? '').replace(/<[^>]+>/g, ''));

// records: the search page's listing records. rows: Quarto's search.json. Returns the pages with the passages the old page searched.
export function placeholderPages(records, rows) {
  const pages = [];
  const byKey = {};
  for (const record of records) {
    const page = { order: pages.length, key: pageKey(record.href), title: plain(record.title), href: record.href, description: plain(record.description), body: record.body !== false, passages: [] };
    page.titleLower = page.title.toLowerCase();
    page.descriptionLower = page.description.toLowerCase();
    pages.push(page);
    byKey[page.key] = page;
  }
  const titles = {};
  for (const row of rows) {
    if (row.section) (titles[pageKey(row.href)] = titles[pageKey(row.href)] || {})[row.section.trim()] = true;
  }
  for (const row of rows) {
    const key = pageKey(row.href);
    const page = byKey[key];
    if (!page || !page.body) continue;
    const anchored = row.href.indexOf('#') !== -1;
    const title = anchored ? clean(row.section) : '';
    let body = row.text;
    if (anchored && body.indexOf(row.section) === 0) body = body.slice(row.section.length);
    else if (!anchored && /^Contents\n/.test(body)) {
      const lines = body.split('\n');
      let at = 1;
      while (at < lines.length && (!lines[at].trim() || (titles[key] || {})[lines[at].trim()])) at++;
      body = lines.slice(at).join('\n');
    }
    body = clean(body);
    const last = page.passages[page.passages.length - 1];
    if (!body || (last && last.text === body)) continue;
    page.passages.push({ href: row.href, heading: title, text: body, lower: body.toLowerCase(), headingLower: title.toLowerCase() });
  }
  return pages;
}

// The same passages in the shape of search-index.json, so BM25 can run over them
export function placeholderIndexData(pages) {
  return { pages: pages.map(page => ({ h: page.key, t: page.title, d: page.description, p: page.passages.map(passage => [passage.href.split('#')[1] ?? '', passage.heading, passage.text]) })) };
}

export function placeholderRanker(pages, stopWords) {
  const tokens = query => query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const queryTerms = query => {
    const all = tokens(query);
    const kept = all.filter(word => stopWords.indexOf(word) === -1);
    const terms = kept.length ? kept : all;
    return terms.filter((word, i) => terms.indexOf(word) === i);
  };
  const startRe = term => new RegExp(`(?<!${WORD})${term}`, 'gu');
  const count = (lower, re) => (lower.match(re) || []).length;

  return query => {
    const terms = queryTerms(query);
    const res = terms.map(startRe);
    const ranked = [];
    pages.forEach(page => {
      let score = 0;
      const matched = res.every(re => {
        const inTitle = count(page.titleLower, re);
        const inDescription = count(page.descriptionLower, re);
        let inHeading = 0;
        let inText = 0;
        page.passages.forEach(passage => {
          if (count(passage.headingLower, re)) inHeading++;
          inText += count(passage.lower, re);
        });
        score += (inTitle ? 10 : 0) + (inHeading ? 4 : 0) + (inDescription ? 3 : 0) + Math.min(inText, 5);
        return inTitle || inDescription || inHeading || inText;
      });
      if (matched) ranked.push({ key: page.key, score, order: page.order });
    });
    return ranked.sort((a, b) => b.score - a.score || a.order - b.order);
  };
}
