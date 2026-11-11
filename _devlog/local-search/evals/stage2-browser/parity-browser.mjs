// Parity between the page in Chromium and Node: the query vectors (cosine) and the rankings the page shows, for both question files and for the texts of the Model2Vec cross-check.
// Usage (Node 24.22.0, a server for _site running, Playwright installed): PARITY_URL=http://127.0.0.1:4181 node parity-browser.mjs [work folder with texts.json from crosscheck-model2vec.mjs]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { evalsDir, loadSite, rankers, root } from './harness.mjs';

const base = process.env.PARITY_URL ?? 'http://127.0.0.1:4181';
const site = await loadSite(join(root, '_site'));
const methods = rankers(site);
const load = name => JSON.parse(readFileSync(join(evalsDir, name), 'utf8')).questions.map(q => ({ id: q.id, query: q.query }));
const queries = [...load('questions.json'), ...load('questions-holdout.json')];
const extra = process.argv[2] ? JSON.parse(readFileSync(join(resolve(process.argv[2]), 'texts.json'), 'utf8')) : [];

const keyOf = href => href.replace(/^\.\.\//, '').split('#')[0].replace(/(^|\/)$/, '$1index.html');
const anchorOf = href => href.split('#')[1] ?? '';
const cosine = (a, b) => { let dot = 0; let na = 0; let nb = 0; for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; } return na && nb ? dot / Math.sqrt(na * nb) : (na === nb ? 1 : 0); };

const browser = await chromium.launch();
async function openPage(blockVectors) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route('**/gtag/js**', route => route.fulfill({ status: 200, body: '' }));
  if (blockVectors) await page.route('**/search-vectors.json*', route => route.abort());
  await page.goto(`${base}/search/`);
  await page.locator('.search-input').pressSequentially('a');
  await page.waitForFunction(blocked => blocked || document.querySelector('.search-mode').textContent.includes('meaning'), blockVectors, { timeout: 20000 });
  if (blockVectors) await page.waitForTimeout(300);
  return page;
}

// What the page lists for a query, every row, as [page key, anchor]
async function shown(page, query) {
  await page.locator('.search-input').fill(query);
  const more = page.locator('.search-more');
  if (await more.isVisible() && (await more.getAttribute('aria-expanded')) === 'false') await more.click();
  return page.locator('.search-rows .post-title a').evaluateAll(links => links.map(link => link.getAttribute('href')));
}

const result = { queries: queries.length, rankings: {}, vectors: {} };
for (const [name, blocked, method] of [['hybrid', false, methods.page], ['keyword only', true, methods.bm25]]) {
  const page = await openPage(blocked);
  let identical = 0;
  const differing = [];
  for (const { id, query } of queries) {
    const hrefs = await shown(page, query);
    const expected = method.rank(query).map(row => [row.page.key, row.doc.anchor]);
    const actual = hrefs.map(href => [keyOf(href), anchorOf(href)]);
    const same = JSON.stringify(expected.map(([key]) => key)) === JSON.stringify(actual.map(([key]) => key));
    const sameAnchors = JSON.stringify(expected) === JSON.stringify(actual);
    if (same && sameAnchors) identical++; else differing.push({ id, query, sameOrder: same, expected: expected.slice(0, 3), actual: actual.slice(0, 3) });
  }
  result.rankings[name] = { queries: queries.length, identical, differing };
  await page.close();
}

// Query vectors: the embedder module and the table, loaded in the page the way the page loads them, against Node's
const page = await openPage(false);
const texts = [...queries.map(q => q.query), ...extra];
const inBrowser = await page.evaluate(async ({ texts, root }) => {
  const embed = await import('/static/js/search-embed.js');
  const file = await (await fetch('/search-vectors.json')).json();
  const [table, vocab] = await Promise.all([fetch(root + file.table.path).then(r => r.arrayBuffer()), fetch(root + file.vocab.path).then(r => r.arrayBuffer())]);
  const embedder = embed.createEmbedder({ vocab: embed.parseVocab(new TextDecoder().decode(vocab)), table: new Int8Array(table), dimensions: file.dimensions });
  return texts.map(text => ({ ids: embedder.tokenIds(text), vector: Array.from(embedder.embed(text)) }));
}, { texts, root: '/' });
await page.close();
await browser.close();

const rows = texts.map((text, i) => {
  const node = site.embedder.embed(text);
  return { text, sameIds: JSON.stringify(inBrowser[i].ids) === JSON.stringify(site.embedder.tokenIds(text)), cosine: cosine(inBrowser[i].vector, node), maxAbsDifference: Math.max(...node.map((value, j) => Math.abs(value - inBrowser[i].vector[j]))) };
});
const group = (name, from, to) => {
  const part = rows.slice(from, to);
  return { name, count: part.length, sameTokenIds: part.filter(r => r.sameIds).length, minCosine: Math.min(...part.map(r => r.cosine)), maxAbsDifference: Math.max(...part.map(r => r.maxAbsDifference)) };
};
result.vectors = [group('development and held-out queries', 0, queries.length), ...(extra.length ? [group('cross-check texts (queries, passages and edge cases)', queries.length, texts.length)] : [])];
const lines = ['# Browser against Node', '', `Chromium ${browser.version?.() ?? ''} against Node ${process.version}, ${queries.length} queries (40 development, 20 held-out). Index ${site.indexInfo.hash}.`, ''];
for (const [name, r] of Object.entries(result.rankings)) lines.push(`Rankings, ${name}: ${r.identical} of ${r.queries} queries list the same pages, in the same order, with the same passage links, as Node.${r.differing.length ? ` Differing: ${r.differing.map(d => d.id).join(', ')}` : ''}`);
lines.push('');
for (const v of result.vectors) lines.push(`Vectors, ${v.name}: ${v.count} texts, same token ids ${v.sameTokenIds} of ${v.count}, lowest cosine ${v.minCosine.toFixed(9)}, largest difference in any component ${v.maxAbsDifference.toExponential(2)}.`);
lines.push('');
console.log(lines.join('\n'));
writeFileSync(join(evalsDir, 'results', 'stage2-browser', 'parity.md'), lines.join('\n'));
writeFileSync(join(evalsDir, 'results', 'stage2-browser', 'parity.json'), `${JSON.stringify(result, null, 1)}\n`);
