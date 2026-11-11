// Does the browser's own HTTP cache keep the meaning files between visits? A persistent Chromium profile (disk cache) visits the page twice against a server that sends what GitHub Pages sends (Cache-Control max-age 600, an ETag), and the server logs what it was asked for on first use of the search box. Playwright's default in-memory contexts do not cache the 7.5 MB table, which costs-browser.mjs shows, so this is the check that counts.
// Usage (Node 24.22.0, after quarto render): node cache-check.mjs
import { createReadStream, mkdtempSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { chromium } from '@playwright/test';
import { evalsDir, root } from './harness.mjs';
import { writeFileSync } from 'node:fs';

const site = join(root, '_site');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain', '.bin': 'application/octet-stream' };
const log = [];
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://x');
  let path = join(site, decodeURIComponent(url.pathname));
  try {
    if (statSync(path).isDirectory()) path = join(path, 'index.html');
    const stat = statSync(path);
    const etag = `"${stat.size}-${Math.round(stat.mtimeMs)}"`;
    if (request.headers['if-none-match'] === etag) { log.push(`304 ${url.pathname}`); response.writeHead(304, { ETag: etag, 'Cache-Control': 'max-age=600' }).end(); return; }
    log.push(`200 ${url.pathname}`);
    response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600', ETag: etag, 'Content-Length': stat.size });
    createReadStream(path).pipe(response);
  } catch { response.writeHead(404).end(); }
}).listen(4299, '127.0.0.1');

const profile = mkdtempSync(join(tmpdir(), 'cache-check-'));
const lines = ['# HTTP cache between visits', '', `Chromium with a persistent profile, two visits to /search/, a server sending Cache-Control: max-age=600 and an ETag. Requests the server saw for the three meaning files after the first keystroke in the box:`, ''];
for (const visit of [1, 2]) {
  const context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 390, height: 844 } });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto('http://127.0.0.1:4299/search/');
  await page.waitForLoadState('networkidle');
  log.length = 0;
  await page.locator('.search-input').pressSequentially('a');
  await page.waitForFunction(() => document.querySelector('.search-mode').textContent.includes('meaning'), null, { timeout: 30000 });
  const seen = log.filter(entry => /search-vectors|\.bin|vocab/.test(entry));
  lines.push(`- Visit ${visit}: ${seen.length ? seen.join(', ') : 'none, all three served from the browser cache'}`);
  await context.close();
}
server.close();
rmSync(profile, { recursive: true, force: true });
writeFileSync(join(evalsDir, 'results', 'stage2-browser', 'cache-check.md'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
