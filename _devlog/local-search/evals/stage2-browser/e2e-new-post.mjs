// End to end: a new post, an edit and a removal in a throwaway copy of the project, rendered with Quarto, and what the search files and the search page do each time. Then the same for a page that is not a post.
// Usage (Node 24.22.0, Quarto 1.10.18, Playwright in the repo's node_modules): node e2e-new-post.mjs <empty scratch folder outside the repo>
// The repo itself is never written to: the project is copied with rsync (no .git, no node_modules, no _site) and rendered there.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { root } from './harness.mjs';
import { checkSearch } from '../../../../scripts/check-site.mjs';

const work = resolve(process.argv[2]);
const copy = join(work, 'project');
const port = 4297;
const log = [];
const say = line => { log.push(line); console.log(line); };
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: copy, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });

mkdirSync(work, { recursive: true });
rmSync(copy, { recursive: true, force: true });
run('rsync', ['-a', '--exclude=.git', '--exclude=node_modules', '--exclude=_site', '--exclude=.quarto', '--exclude=test-results', '--exclude=_devlog', `${root}/`, `${copy}/`], { cwd: root });
symlinkSync(join(root, 'node_modules'), join(copy, 'node_modules'));

const site = join(copy, '_site');
const render = () => run('quarto', ['render'], { env: { ...process.env } });
const read = name => JSON.parse(readFileSync(join(site, name), 'utf8'));
const state = () => {
  const index = read('search-index.json');
  const vectors = read('search-vectors.json');
  const hit = index.pages.find(page => page.h.includes('quokka-garden'));
  const hitPage = index.pages.find(page => page.h.includes('quokka-garden') || page.h.includes('e2e-page'));
  return { index, vectors, pages: index.pages.length, passages: index.pages.reduce((sum, page) => sum + 1 + page.p.length, 0), hit: hit ?? hitPage };
};
const describe = (s, label) => `${label}: index ${s.index.hash} (${s.pages} pages, ${s.passages} passages); vectors for index ${s.vectors.index}, ${s.vectors.count} vectors, table ${s.vectors.table.sha256.slice(0, 12)}; vectors match index: ${s.vectors.index === s.index.hash && s.vectors.count === s.passages}`;

let server;
const browser = await chromium.launch();

// What the search page lists for a query, in order, with the vectors either loaded or blocked
async function search(query, { keywordOnly = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route('**/gtag/js**', route => route.fulfill({ status: 200, body: '' }));
  if (keywordOnly) await page.route('**/search-vectors.json*', route => route.abort());
  await page.goto(`http://127.0.0.1:${port}/search/`);
  await page.waitForFunction(blocked => blocked || document.querySelector('.search-mode').textContent.includes('meaning'), keywordOnly, { timeout: 20000 });
  await page.locator('.search-input').fill(query);
  const more = page.locator('.search-more');
  if (await more.isVisible()) await more.click();
  const titles = await page.locator('.search-rows .post-title a').allTextContents();
  const snippets = await page.locator('.search-rows .post-row').evaluateAll(rows => rows.map(row => row.querySelector('.post-desc')?.textContent ?? ''));
  const mode = await page.locator('.search-mode').textContent();
  await page.close();
  return { titles, snippets, mode };
}
const where = (found, title) => { const i = found.titles.indexOf(title); return i === -1 ? `not listed (${found.titles.length} rows)` : `row ${i + 1} of ${found.titles.length}`; };
const snippetOf = (found, title) => { const i = found.titles.indexOf(title); return i === -1 ? 'none' : `"${found.snippets[i].slice(0, 70)}..."`; };
const checks = async label => {
  const result = await checkSearch(site);
  say(`check:site search guard ${label}: ${result.errors.length ? `FAILED ${result.errors.join('; ')}` : `passed (${result.pages} pages, ${result.passages} passages)`}`);
};

try {
  say('# New post, edit and removal in a scratch copy of the project');
  say(`Render: quarto ${run('quarto', ['--version']).trim()}, Node ${process.version}. The deploy runs the same \`quarto render\`; no npm install and no network fetch happens in the post-render steps.`);
  render();
  // serve-site.mjs needs a rendered _site to start
  server = spawn(process.execPath, [join(root, 'scripts/serve-site.mjs')], { cwd: root, env: { ...process.env, SITE_OUTPUT_DIR: site, SITE_TEST_PORT: String(port) }, stdio: 'ignore' });
  await new Promise(done => setTimeout(done, 700));
  const base = state();
  say(describe(base, 'Baseline render'));
  await checks('on the baseline');

  // 1. A new post: a distinctive phrase for the keyword query, and one idea told without those words for the meaning query
  const dir = join(copy, 'posts/2026-11-12-quokka-garden');
  mkdirSync(dir, { recursive: true });
  const front = body => `---\ntitle: "Notes From The Quokka Garden"\ntags: ["Gardening"]\ncategories: [Time Series]\ndescription: "A short test post about watering plants."\ndate: 2026-11-12\npermalink: /2026-11-12-quokka-garden/\n---\n\n${body}\n`;
  const first = 'The zymurgical quokkaberry protocol keeps houseplants alive. A slow drip bottle pushed into the soil waters the pots by itself, so nobody has to come round while the family is away on a long trip abroad.';
  writeFileSync(join(dir, 'index.qmd'), front(first));
  render();
  const added = state();
  say('');
  say('## 1. A new post is added and the site rendered');
  say(describe(added, 'After adding the post'));
  say(`The post is in search-index.json: ${added.hit ? `yes, ${added.hit.h}, ${added.hit.p.length} passage(s)` : 'NO'}. Index hash changed: ${added.index.hash !== base.index.hash}. Passage count went from ${base.passages} to ${added.passages}.`);
  await checks('after adding');
  const keywordHit = await search('quokkaberry');
  say(`Keyword query "quokkaberry": ${where(keywordHit, 'Notes From The Quokka Garden')}; status "${keywordHit.mode}".`);
  const meaningQuery = 'how to stop my indoor greenery from dying when I am on vacation';
  const meaningHit = await search(meaningQuery);
  const meaningKeyword = await search(meaningQuery, { keywordOnly: true });
  say(`Meaning-only query "${meaningQuery}" (it shares no content word with the post): hybrid ${where(meaningHit, 'Notes From The Quokka Garden')}; keyword search alone, with the vectors blocked: ${where(meaningKeyword, 'Notes From The Quokka Garden')}.`);

  // 2. Edit the post
  writeFileSync(join(dir, 'index.qmd'), front('The pangolinesque ledger method balances a household budget. Every receipt goes into a paper envelope, and on Sunday the envelopes are counted against the monthly allowance.'));
  render();
  const edited = state();
  say('');
  say('## 2. The post text is edited and the site rendered again');
  say(describe(edited, 'After the edit'));
  say(`Index hash changed: ${edited.index.hash !== added.index.hash} (${added.index.hash} to ${edited.index.hash}). Vectors now belong to index ${edited.vectors.index}; vectors file changed: ${edited.vectors.vectors !== added.vectors.vectors}.`);
  await checks('after the edit');
  const title = 'Notes From The Quokka Garden';
  say(`Old keyword "quokkaberry", keyword search alone: ${where(await search('quokkaberry', { keywordOnly: true }), title)}.`);
  const oldHybrid = await search('quokkaberry');
  say(`Old keyword "quokkaberry" with meaning on: ${where(oldHybrid, title)}, because the post's title still says Quokka and meaning matches word pieces; the text shown is ${snippetOf(oldHybrid, title)}, which is the page description; the old body text is gone from the page.`);
  const oldMeaning = await search(meaningQuery);
  say(`Old meaning query "${meaningQuery}": ${where(oldMeaning, title)}; text shown ${snippetOf(oldMeaning, title)}.`);
  const fresh = await search('pangolinesque');
  const freshMeaning = await search('keeping track of what the family spends each month');
  say(`New keyword "pangolinesque": ${where(fresh, 'Notes From The Quokka Garden')}. New meaning query "keeping track of what the family spends each month": ${where(freshMeaning, 'Notes From The Quokka Garden')}.`);

  // 3. Remove the post
  rmSync(dir, { recursive: true });
  render();
  const removed = state();
  say('');
  say('## 3. The post is removed and the site rendered again (an ordinary render, not --clean)');
  say(describe(removed, 'After the removal'));
  say(`The post is in search-index.json: ${removed.hit ? 'YES' : 'no'}. Index hash back to the baseline: ${removed.index.hash === base.index.hash}. Vectors back to the baseline: ${removed.vectors.vectors === base.vectors.vectors}.`);
  await checks('after the removal');
  say(`Keyword "pangolinesque": ${where(await search('pangolinesque'), 'Notes From The Quokka Garden')}.`);

  // 4. A page that is not a post
  say('');
  say('## 4. A page that is not a post');
  mkdirSync(join(copy, 'pages'), { recursive: true });
  writeFileSync(join(copy, 'pages/e2e-page.qmd'), '---\ntitle: "Quokka Notes Page"\n---\n\nThe flibbertigibbet archive lists every wombat sighting.\n');
  render();
  const unlisted = state();
  say(`Page rendered but not added to the list in search/index.qmd: in the index: ${unlisted.index.pages.some(page => page.h === 'pages/e2e-page.html')}. This is the one hand step.`);
  const qmd = readFileSync(join(copy, 'search/index.qmd'), 'utf8');
  writeFileSync(join(copy, 'search/index.qmd'), qmd.replace('      - title: About\n', '      - title: Quokka Notes Page\n        href: pages/e2e-page.html\n        section: Work\n        description: A scratch page for the search check.\n      - title: About\n'));
  render();
  const listed = state();
  say(describe(listed, 'After adding the entry to the list'));
  say(`The page is in search-index.json: ${listed.index.pages.some(page => page.h === 'pages/e2e-page.html')}.`);
  await checks('after adding the entry');
  say(`Keyword "flibbertigibbet": ${where(await search('flibbertigibbet'), 'Quokka Notes Page')}.`);
  // A listed page that does not exist must stop the render, not pass quietly
  rmSync(join(copy, 'pages/e2e-page.qmd'));
  rmSync(join(site, 'pages/e2e-page.html'));
  let failure = 'the render did not fail';
  try { render(); } catch (error) { failure = `the render failed as it should: ${(error.stderr || error.message).split('\n').filter(line => /^Error: Search index/.test(line)).join(' ').trim()}`; }
  say(`Entry listed but the page deleted: ${failure}`);
} finally {
  await browser.close();
  server?.kill();
  writeFileSync(join(root, '_devlog/local-search/evals/results/stage2-browser/e2e-new-post.md'), `${log.join('\n')}\n`);
}
