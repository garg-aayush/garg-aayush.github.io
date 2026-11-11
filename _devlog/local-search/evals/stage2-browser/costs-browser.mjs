// What the meaning search costs in Chromium on this machine: file sizes as sent, the time from the first focus until it is ready (cold and warm cache, with and without an emulated slow link), per query time for keyword and hybrid ranking, and memory.
// Usage (Node 24.22.0, after quarto render, Playwright installed): node costs-browser.mjs
// A phone was not measured. GitHub Pages' own compression of these files was not observed: the sizes are Node's gzip (level 9) and brotli (quality 11), and the throttled runs use brotli at quality 5 or no compression, which brackets it.
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { evalsDir, root } from './harness.mjs';

const siteDir = join(root, '_site');
const files = ['search-index.json', 'search-vectors.json', 'static/search/potion-base-8M.int8.bin', 'static/search/potion-base-8M.vocab.txt', 'static/search/manifest.json', 'static/js/search.js', 'static/js/search-rank.js', 'static/js/search-embed.js'];
const mb = bytes => (bytes / 1e6).toFixed(2);
const median = values => { const sorted = [...values].sort((a, b) => a - b); const mid = sorted.length >> 1; return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const ms = value => Math.round(value * 10) / 10;

const sizes = files.map(file => {
  const bytes = readFileSync(join(siteDir, file));
  return { file, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length } }).length };
});

// A static server with the headers a CDN sends: a Cache-Control max-age, an ETag, conditional requests, and optionally brotli
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain', '.bin': 'application/octet-stream', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml' };
function serve({ port, maxAge, compress }) {
  const log = [];
  const cache = new Map();
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://x');
    let path = join(siteDir, decodeURIComponent(url.pathname));
    try { if (statSync(path).isDirectory()) path = join(path, 'index.html'); statSync(path); } catch { response.writeHead(404).end(); return; }
    const type = types[extname(path)] ?? 'application/octet-stream';
    const stat = statSync(path);
    const etag = `"${stat.size}-${Math.round(stat.mtimeMs)}"`;
    const headers = { 'Content-Type': type, 'Cache-Control': `max-age=${maxAge}`, ETag: etag };
    if (request.headers['if-none-match'] === etag) { log.push({ path: url.pathname, status: 304, bytes: 0 }); response.writeHead(304, headers).end(); return; }
    const wantsBrotli = compress && /\bbr\b/.test(request.headers['accept-encoding'] ?? '') && /text|json|javascript|octet-stream/.test(type) && (compress === 'all' || type !== 'application/octet-stream');
    if (wantsBrotli) {
      if (!cache.has(path)) cache.set(path, brotliCompressSync(readFileSync(path), { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }));
      const body = cache.get(path);
      log.push({ path: url.pathname, status: 200, bytes: body.length });
      response.writeHead(200, { ...headers, 'Content-Encoding': 'br', 'Content-Length': body.length }).end(body);
      return;
    }
    log.push({ path: url.pathname, status: 200, bytes: stat.size });
    response.writeHead(200, { ...headers, 'Content-Length': stat.size });
    createReadStream(path).pipe(response);
  });
  return new Promise(done => server.listen(port, '127.0.0.1', () => done({ server, log, url: `http://127.0.0.1:${port}` })));
}

const browser = await chromium.launch();
const phoneless = { viewport: { width: 390, height: 844 } };

// Fresh context: first focus of the box until the status says meaning is included. Returns the time and what the browser fetched.
// route: false leaves the page without request interception, which in Chromium switches off the HTTP cache, so the warm cache runs need it
async function readyTime(url, { context, throttle, route = true } = {}) {
  const ctx = context ?? await browser.newContext(phoneless);
  const page = await ctx.newPage();
  if (route) await page.route('**/gtag/js**', handler => handler.fulfill({ status: 200, body: '' }));
  const cdp = await ctx.newCDPSession(page);
  await page.goto(`${url}/search/`);
  await page.waitForFunction(() => document.querySelector('.search-mode')?.textContent === 'Keyword search');
  await page.waitForLoadState('networkidle');
  // The link is slowed after the page and the keyword index are in, so the time is that of the meaning files alone
  if (throttle) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: throttle.latency, downloadThroughput: throttle.kbps * 125, uploadThroughput: throttle.kbps * 125 });
  const elapsed = await page.evaluate(() => new Promise((resolve, reject) => {
    const mode = document.querySelector('.search-mode');
    const start = performance.now();
    const watcher = new MutationObserver(() => { if (mode.textContent.includes('meaning')) { watcher.disconnect(); resolve(performance.now() - start); } });
    watcher.observe(mode, { childList: true, characterData: true, subtree: true });
    setTimeout(() => reject(new Error('not ready in 120 s')), 120000);
    document.querySelector('.search-input').focus();
  }));
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => /search-vectors|\.bin|vocab/.test(entry.name)).map(entry => ({ file: entry.name.replace(/^.*\//, '').replace(/\?.*/, ''), start: Math.round(entry.startTime), end: Math.round(entry.responseEnd), transfer: entry.transferSize, decoded: entry.decodedBodySize })));
  return { elapsed, resources, page, ctx, cdp };
}

const lines = ['# Costs of the meaning search in Chromium', '', `Measured on ${new Date().toISOString().slice(0, 10)} on one laptop (${process.platform} ${process.arch}), Chromium ${browser.version()} driven by Playwright, Node ${process.version}, against a local server. A phone was not measured. GitHub Pages' own compression of these files was not observed.`, ''];

lines.push('## Bytes of each file', '', '| File | Raw | gzip (level 9) | brotli (quality 11) |', '|---|---|---|---|');
for (const s of sizes) lines.push(`| ${s.file} | ${s.raw} | ${s.gzip} | ${s.brotli} |`);
const meaningFiles = sizes.filter(s => /search-vectors|\.bin|vocab/.test(s.file));
const total = key => meaningFiles.reduce((sum, s) => sum + s[key], 0);
lines.push('', `The three files the page fetches on first use: ${total('raw')} bytes raw (${mb(total('raw'))} MB), ${total('gzip')} gzip (${mb(total('gzip'))} MB), ${total('brotli')} brotli (${mb(total('brotli'))} MB). The keyword index (${sizes[0].raw} raw, ${sizes[0].gzip} gzip) is fetched on every visit as before. The int8 passage vectors alone are ${506 * 256} bytes; the JSON carries them as base64.`, '');

// Cold: fresh context, local, no throttle, 9 runs, headers like a CDN with 10 minutes of cache
const runs = 9;
const local = await serve({ port: 4291, maxAge: 600, compress: false });
const coldTimes = [];
let lastResources;
for (let i = 0; i < runs; i++) {
  const r = await readyTime(local.url);
  coldTimes.push(r.elapsed);
  lastResources = r.resources;
  await r.ctx.close();
}
lines.push('## First focus until meaning search is ready', '', `Cold cache, a fresh browser context each time, local server without compression, ${runs} runs: median ${ms(median(coldTimes))} ms, fastest ${ms(Math.min(...coldTimes))} ms, slowest ${ms(Math.max(...coldTimes))} ms. This includes the three fetches (a local read, not a download), hashing the table and vocabulary, building the embedder and reading the vectors.`, '', 'Fetches in the last cold run (start and end in ms from navigation, bytes transferred):', '');
for (const r of lastResources) lines.push(`- ${r.file}: ${r.start} to ${r.end} ms, ${r.transfer} bytes`);

// Warm: the same context, a second visit within the 10 minutes of max-age
const warmTimes = [];
const warmRequests = [];
for (let i = 0; i < 5; i++) {
  const first = await readyTime(local.url, { route: false });
  await first.page.close();
  local.log.length = 0;
  const second = await readyTime(local.url, { context: first.ctx, route: false });
  warmTimes.push(second.elapsed);
  warmRequests.push(local.log.filter(entry => /search-vectors|\.bin|vocab/.test(entry.path)).map(entry => `${entry.status} ${entry.path}`));
  await first.ctx.close();
}
lines.push('', `Warm cache (second visit in the same browser within max-age = 600 s, as GitHub Pages sends), 5 runs: median ${ms(median(warmTimes))} ms. Requests the server saw for the three files on the second visit: ${warmRequests.every(r => r.length === 0) ? 'none, all served from the browser cache' : JSON.stringify(warmRequests[0])}.${' '}Playwright\'s in-memory browser contexts do not keep the 7.5 MB table, which is why it is fetched again here; cache-check.mjs repeats the visit in a persistent profile with a disk cache, where all three files came from the cache (results/stage2-browser/cache-check.md).`);
await new Promise(done => local.server.close(done));

// Revalidation: max-age 0, so every use asks the server and gets 304 for unchanged files
const revalidate = await serve({ port: 4292, maxAge: 0, compress: false });
const again = await readyTime(revalidate.url, { route: false });
await again.page.close();
revalidate.log.length = 0;
const second = await readyTime(revalidate.url, { context: again.ctx, route: false });
lines.push(`Revalidation (max-age = 0, as if the 10 minutes had passed): ready in ${ms(second.elapsed)} ms; the server answered ${revalidate.log.filter(entry => /search-vectors|\.bin|vocab/.test(entry.path)).map(entry => `${entry.status} ${entry.path.replace(/^.*\//, '')}`).join(', ')}.`);
await again.ctx.close();
await new Promise(done => revalidate.server.close(done));

// An emulated link, Chromium's network throttling at the stated rate and latency, cold, 3 runs each
lines.push('', '## Emulated slow links (cold cache, 3 runs each, median)', '', '| Link | Server compression | Bytes on the wire for the three files | Ready after first focus |', '|---|---|---|---|');
for (const link of [{ name: '10 Mbit/s, 40 ms', kbps: 10000, latency: 40 }, { name: '1.6 Mbit/s, 150 ms (Lighthouse slow 4G)', kbps: 1600, latency: 150 }]) {
  for (const [label, compress] of [['none', false], ['brotli on every file', 'all']]) {
    const server = await serve({ port: 4293, maxAge: 600, compress });
    const times = [];
    let wire = 0;
    for (let i = 0; i < 3; i++) {
      server.log.length = 0;
      const r = await readyTime(server.url, { throttle: link });
      times.push(r.elapsed);
      wire = r.resources.reduce((sum, entry) => sum + entry.transfer, 0);
      await r.ctx.close();
    }
    lines.push(`| ${link.name} | ${label} | ${wire} | ${ms(median(times))} ms |`);
    await new Promise(done => server.server.close(done));
  }
}

// Per query time and memory, with the page loaded from the local server
const timing = await serve({ port: 4294, maxAge: 600, compress: false });
const questions = JSON.parse(readFileSync(join(evalsDir, 'questions.json'), 'utf8')).questions.map(q => q.query);
async function measure(blockVectors) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.route('**/gtag/js**', route => route.fulfill({ status: 200, body: '' }));
  if (blockVectors) await page.route('**/search-vectors.json*', route => route.abort());
  const cdp = await ctx.newCDPSession(page);
  await page.goto(`${timing.url}/search/`);
  await page.waitForFunction(blocked => blocked || document.querySelector('.search-mode').textContent.includes('meaning'), blockVectors, { timeout: 20000 });
  await page.waitForTimeout(300);
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize;
  // The whole keystroke: set the value, run the page's input handler (ranking and drawing the rows), read the rows back. Every query 40 times; the browser clock steps in 0.1 ms, so the mean over many runs is what is reported.
  const perQuery = await page.evaluate(async ({ queries }) => {
    const input = document.querySelector('.search-input');
    const times = [];
    for (const query of queries) {
      let sum = 0;
      const runs = 40;
      for (let i = 0; i < runs; i++) {
        const start = performance.now();
        input.value = query;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        sum += performance.now() - start;
      }
      times.push(sum / runs);
    }
    return times;
  }, { queries: questions });
  // Ranking alone, with the page's own modules over the page's index
  const rankingOnly = blockVectors ? null : await page.evaluate(async ({ queries }) => {
    const rank = await import('/static/js/search-rank.js');
    const embed = await import('/static/js/search-embed.js');
    const copy = JSON.parse(document.querySelector('.search-copy').textContent);
    const data = await (await fetch('/search-index.json')).json();
    const built = performance.now();
    const index = rank.createIndex(data, { stopWords: copy.stopWords });
    const buildMs = performance.now() - built;
    const file = await (await fetch('/search-vectors.json')).json();
    const [table, vocab] = await Promise.all([fetch('/' + file.table.path).then(r => r.arrayBuffer()), fetch('/' + file.vocab.path).then(r => r.arrayBuffer())]);
    const prepared = performance.now();
    const embedder = embed.createEmbedder({ vocab: embed.parseVocab(new TextDecoder().decode(vocab)), table: new Int8Array(table), dimensions: file.dimensions });
    const vectors = { dimensions: file.dimensions, rows: embed.dequantizeRows(new Int8Array(embed.base64ToBytes(file.vectors).buffer), file.dimensions, file.scale) };
    const prepareMs = performance.now() - prepared;
    const measureAll = fn => queries.map(query => { const runs = 200; const start = performance.now(); for (let i = 0; i < runs; i++) fn(query); return (performance.now() - start) / runs; });
    const keywordMs = measureAll(query => rank.rankTerms(index, rank.analyzeQuery(index, query)));
    const embedMsList = measureAll(query => embedder.embed(query));
    const hybridMs = measureAll(query => rank.rankHybrid(index, vectors, rank.analyzeQuery(index, query), embedder.embed(query)));
    return { buildMs, prepareMs, keywordMs, embedMs: embedMsList, hybridMs };
  }, { queries: questions });
  await ctx.close();
  return { heap, perQuery, rankingOnly };
}
const keywordRun = await measure(true);
const hybridRun = await measure(false);
const m = values => `${ms(median(values) * 1000) / 1000} ms median, ${ms(Math.max(...values) * 1000) / 1000} ms slowest query (mean over runs)`;
lines.push('', '## Per query time and memory', '', `Over the 40 questions, each repeated many times in one page (Chromium, this machine).`, '', `- Ranking alone, keyword (BM25): ${m(hybridRun.rankingOnly.keywordMs)}.`, `- Embedding the query: ${m(hybridRun.rankingOnly.embedMs)}.`, `- Ranking alone, hybrid (embed, cosine over ${506} passages, fuse): ${m(hybridRun.rankingOnly.hybridMs)}.`, `- A whole keystroke through the page's input handler (rank, snippets, drawing the rows), keyword only: ${m(keywordRun.perQuery)}; hybrid: ${m(hybridRun.perQuery)}.`, `- One-off work after the files arrive: building the BM25 index ${ms(hybridRun.rankingOnly.buildMs)} ms; the embedder (vocabulary map and median token length) and the vectors, excluding hashing: ${ms(hybridRun.rankingOnly.prepareMs)} ms.`, `- JS heap after garbage collection: ${mb(keywordRun.heap)} MB keyword only, ${mb(hybridRun.heap)} MB with meaning (difference ${mb(hybridRun.heap - keywordRun.heap)} MB). The 7.56 MB table and the 0.52 MB float vectors are typed arrays, which V8 counts outside this heap, so the page holds about 8 MB more than the difference above.`, '');
await new Promise(done => timing.server.close(done));
await browser.close();
writeFileSync(join(evalsDir, 'results', 'stage2-browser', 'costs.md'), lines.join('\n'));
console.log(lines.join('\n'));
