// Time to fetch and prepare the index, and per-query ranking time, in Chromium, against a served site.
// Usage: SITE_TEST_PORT=4195 node scripts/serve-site.mjs &, then node _devlog/local-search/evals/measure-cost.mjs http://127.0.0.1:4195
// Each preparation is a fresh page with an empty stem cache. A query is timed over 500 runs because Chromium's clock is coarse (0.1 ms).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'http://127.0.0.1:4173';
const here = dirname(fileURLToPath(import.meta.url));
const questions = JSON.parse(readFileSync(join(here, 'questions.json'), 'utf8')).questions.map(q => q.query);
const median = values => { const s = [...values].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round = value => Math.round(value * 1000) / 1000;

const browser = await chromium.launch();
const prepare = [];
let queries;
for (let i = 0; i < 9; i++) {
  const page = await browser.newPage();
  await page.route('**/gtag/**', route => route.fulfill({ status: 200, body: '' }));
  await page.goto(`${base}/search/`);
  await page.waitForLoadState('networkidle');
  prepare.push(await page.evaluate(async () => {
    const rank = await import(`/static/js/search-rank.js?fresh=${Math.random()}`);
    const t0 = performance.now();
    const response = await fetch(`/search-index.json?fresh=${Math.random()}`, { cache: 'no-store' });
    const t1 = performance.now();
    const data = await response.json();
    const t2 = performance.now();
    rank.createIndex(data, {});
    const t3 = performance.now();
    return { fetch: t1 - t0, parse: t2 - t1, build: t3 - t2, total: t3 - t0 };
  }));
  if (i === 8) {
    queries = await page.evaluate(async list => {
      const rank = await import('/static/js/search-rank.js');
      const index = rank.createIndex(await (await fetch('/search-index.json')).json(), {});
      const means = [];
      let single = 0;
      for (const query of list) {
        rank.search(index, query);
        const start = performance.now();
        for (let n = 0; n < 500; n++) rank.search(index, query);
        means.push((performance.now() - start) / 500);
        for (let n = 0; n < 30; n++) { const t = performance.now(); rank.search(index, query); single = Math.max(single, performance.now() - t); }
      }
      return { means, single };
    }, questions);
  }
  await page.close();
}
const version = browser.version();
await browser.close();
const stat = key => round(median(prepare.map(p => p[key])));
console.log(JSON.stringify({
  chromium: version,
  node: process.version,
  freshPages: prepare.length,
  prepareMs: { fetch: stat('fetch'), parse: stat('parse'), build: stat('build'), total: stat('total'), worstTotal: round(Math.max(...prepare.map(p => p.total))) },
  queryMs: { median: round(median(queries.means)), worstQueryMean: round(Math.max(...queries.means)), worstSingleRun: round(queries.single) },
}, null, 1));
