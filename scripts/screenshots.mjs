import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { settled } from './page-settled.mjs';

// Usage: node scripts/screenshots.mjs [page ...], after quarto render. Pages are paths inside the output directory.
const projectDir = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(projectDir, process.env.SITE_OUTPUT_DIR ?? '_site');
const outDir = join(projectDir, 'test-results', 'screenshots');
const widths = [390, 1280];
const post = /^\d{4}-\d{2}-\d{2}-[^/]*(\/index)?\.html$/;

async function newestPost() {
  const names = (await readdir(join(root, 'posts'), { recursive: true })).filter(name => post.test(name)).sort();
  if (!names.length) throw new Error(`no posts found under ${relative(projectDir, root)}/posts`);
  return `posts/${names.at(-1)}`;
}

const slug = page => page.replace(/(^|\/)index\.html$/, '').replace(/\.html$/, '').replace(/\/+$/, '').replaceAll('/', '-') || 'home';

async function freePort() {
  const probe = createServer();
  await new Promise((done, fail) => probe.once('error', fail).listen(0, '127.0.0.1', done));
  const { port } = probe.address();
  await new Promise(done => probe.close(done));
  return port;
}

async function waitForServer(url, server) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (server.exitCode !== null) throw new Error('scripts/serve-site.mjs exited before it was ready');
    try { if ((await fetch(url)).ok) return; } catch {}
    await sleep(100);
  }
  throw new Error(`${url} did not respond`);
}

const port = await freePort();
const baseURL = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [fileURLToPath(new URL('./serve-site.mjs', import.meta.url))], { env: { ...process.env, SITE_TEST_PORT: String(port) }, stdio: ['ignore', 'inherit', 'inherit'] });
const written = [];
const errors = [];
try {
  const pages = process.argv.length > 2
    ? process.argv.slice(2).map(page => page.replace(/^\/+/, ''))
    : ['index.html', 'blog/', 'projects.html', 'about.html', 'publications.html', 'tools/', 'india-weather.html', await newestPost()];
  await waitForServer(baseURL, server);
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      await context.route('**/tools/analytics.js', route => route.fulfill({ status: 200, body: '' }));
      await context.route('**/gtag/js**', route => route.fulfill({ status: 200, body: '' }));
      for (const page of pages) {
        const tab = await context.newPage();
        try {
          const response = await tab.goto(`${baseURL}/${page}`);
          if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
          await settled(tab, { idle: true });
          const path = join(outDir, `${width}-${slug(page)}.png`);
          await tab.screenshot({ path, fullPage: true });
          written.push(path);
        } catch (error) { errors.push(`${page} at ${width}px: ${error.message}`); }
        await tab.close();
      }
      await context.close();
    }
  } finally { await browser.close(); }
} catch (error) { errors.push(error.message); }
finally { server.kill(); }

for (const path of written) console.log(relative(projectDir, path));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
