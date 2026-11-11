import { test as base, expect } from '@playwright/test';

const test = base.extend({
  // Console messages a test expects, such as the browser's own note that a blocked request failed
  allowedErrors: [[], { option: true }],
  page: async ({ page, allowedErrors }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/gtag/js**', route => route.fulfill({ status: 200, body: '' }));
    await use(page);
    expect(errors.filter(text => !allowedErrors.some(pattern => pattern.test(text))), 'browser errors').toEqual([]);
  },
});

const keyword = 'Keyword search';
const hybrid = 'Keyword and meaning search';
const rows = page => page.locator('.search-rows .post-title a');

// The titles of the first few rows. A new post can rank above the page a query is about, so tests look for the page near the top, except where the query is the page's own title.
const topTitles = page => rows(page).allTextContents().then(titles => titles.slice(0, 3));
const kalman = 'Kalman Filters and Smoothing for Time-Series Data';
const ppo = 'Deriving the PPO Loss from First Principles';

test('the meaning files wait for the first keystroke, a query ranks the right page near the top, and typing then makes no request', async ({ page, baseURL }) => {
  const own = [];
  const later = [];
  let loaded = false;
  page.on('request', request => {
    if (!request.url().startsWith(baseURL)) return;
    const { pathname, search } = new URL(request.url());
    if (['fetch', 'xhr'].includes(request.resourceType())) own.push(pathname + search);
    if (loaded) later.push(`${request.resourceType()} ${request.url()}`);
  });
  const indexLoaded = page.waitForResponse(response => response.url().endsWith('/search-index.json'));
  await page.goto('/search/');
  expect((await indexLoaded).status()).toBe(200);
  // The box is focused on a desktop, which does not count as use: only the index is fetched
  await expect(page.locator('.search-input')).toBeFocused();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  expect(own).toEqual(['/search-index.json']);
  await expect(page.locator('.search-mode')).toHaveText(keyword);

  await page.locator('.search-input').pressSequentially('kalman fil');
  await expect(page.locator('.search-mode')).toHaveText(hybrid);
  await page.waitForLoadState('networkidle');
  expect(own.map(path => path.replace(/\?v=.*/, ''))).toEqual(['/search-index.json', '/search-vectors.json', '/static/search/potion-base-8M.int8.bin', '/static/search/potion-base-8M.vocab.txt']);
  expect(own.slice(1).every(path => /\?v=[0-9a-f]{12,16}$/.test(path)), 'meaning files are fetched under hash versioned URLs').toBe(true);
  loaded = true;

  await expect.poll(() => topTitles(page)).toContain(kalman);
  const row = page.locator('.search-rows .post-row', { hasText: kalman });
  await expect(row.locator('.post-title a')).toHaveAttribute('href', /posts\/2026-07-15-kalman-filters-time-series\/index\.html#/);
  await expect(row.locator('.post-desc mark').first()).toBeVisible();

  await page.locator('.search-input').fill('derive ppo loss');
  await expect.poll(() => topTitles(page)).toContain(ppo);
  expect(later, 'requests after the files loaded').toEqual([]);
});

for (const [name, connection] of [['save-data is on', { saveData: true }], ['the connection is 2g', { effectiveType: '2g' }], ['the connection is slow-2g', { effectiveType: 'slow-2g' }]]) {
  test(`meaning files are not fetched when ${name}`, async ({ page }) => {
    await page.addInitScript(value => Object.defineProperty(navigator, 'connection', { value, configurable: true }), connection);
    const asked = [];
    page.on('request', request => { if (/search-vectors|\.bin/.test(request.url())) asked.push(request.url()); });
    await page.goto('/search/');
    await page.locator('.search-input').pressSequentially('kalman fil');
    await expect.poll(() => topTitles(page)).toContain(kalman);
    await page.waitForTimeout(600);
    expect(asked).toEqual([]);
    await expect(page.locator('.search-mode')).toHaveText(keyword);
  });
}

test('meaning search loads on the first keystroke, and a paraphrase that keywords miss then finds its page', async ({ page }) => {
  // A phone has no automatic focus, so nothing uses the box until the test does
  await page.setViewportSize({ width: 390, height: 844 });
  const held = [];
  await page.route('**/search-vectors.json*', route => held.push(route));
  const asked = page.waitForRequest(request => request.url().includes('/search-vectors.json'), { timeout: 1500 }).then(() => true, () => false);
  await page.goto('/search/');
  await expect(page.locator('.search-mode')).toHaveText(keyword);
  expect(await asked, 'nothing is fetched before the box is used').toBe(false);

  await page.locator('.search-input').fill('has he worked in oil and gas');
  await expect.poll(() => held.length).toBe(1);
  await expect(page.locator('.search-mode')).toHaveText(keyword);
  await expect(rows(page).first(), 'keywords alone do not put About first').not.toHaveText('About');

  await held[0].continue();
  await expect(page.locator('.search-mode')).toHaveText(hybrid);
  await expect.poll(() => topTitles(page)).toContain('About');
});

// Holds the meaning files until release() so a test sees the same query in keyword mode and then in hybrid mode
async function heldMeaning(page) {
  const held = [];
  await page.route('**/search-vectors.json*', route => held.push(route));
  await page.goto('/search/');
  return {
    held,
    release: async () => {
      await expect.poll(() => held.length).toBe(1);
      await held[0].continue();
      await expect(page.locator('.search-mode')).toHaveText(hybrid);
    },
  };
}

// Every row of the list, with the section filters' counts: Show all is pressed first when the list is cut
async function everyRow(page) {
  const more = page.locator('.search-more');
  if (await more.isVisible() && (await more.getAttribute('aria-expanded')) === 'false') await more.click();
  return {
    pages: await rows(page).evaluateAll(links => links.map(link => link.getAttribute('href').split('#')[0])),
    counts: (await page.locator('.search-filters .search-choice-count').allTextContents()).map(Number),
  };
}

test('every page that matches a word is still listed after the meaning files load, and the filter counts do not shrink', async ({ page }) => {
  const { release } = await heldMeaning(page);
  await page.locator('.search-input').fill('image');
  await expect(page.locator('.search-more')).toBeVisible();
  const before = await everyRow(page);
  expect(before.pages.length, 'image is a word of many pages').toBeGreaterThan(8);
  await release();
  await expect(page.locator('.search-count')).toHaveText(/\d+ results/);
  const after = await everyRow(page);
  for (const key of before.pages) expect(after.pages, `${key} matches the word and stays listed`).toContain(key);
  expect(after.pages.length).toBeGreaterThanOrEqual(before.pages.length);
  after.counts.forEach((count, i) => expect(count, `filter ${i}`).toBeGreaterThanOrEqual(before.counts[i]));
});

test('a query with no keyword match lists the five nearest pages by meaning under a plain line, and a keyword-only search says no results', async ({ page }) => {
  const { release } = await heldMeaning(page);
  await page.locator('.search-input').fill('zzzzqq');
  await expect(page.locator('.search-count')).toHaveText('No results for "zzzzqq". Try a shorter phrase or pick a topic.');
  await expect(rows(page)).toHaveCount(0);
  await release();
  await expect(page.locator('.search-count')).toHaveText('No exact matches for "zzzzqq". These 5 pages are the closest by meaning.');
  await expect(rows(page)).toHaveCount(5);
  await expect(page.locator('.search-more')).toBeHidden();
  const counts = (await page.locator('.search-filters .search-choice-count').allTextContents()).map(Number);
  expect(counts[0], 'All counts what is shown').toBe(5);
  expect(counts.slice(1).reduce((sum, count) => sum + count, 0)).toBe(5);

  // A filter keeps the line true to what is shown
  const section = page.locator('.search-filters .search-choice:not(:disabled)').nth(1);
  const name = await section.getAttribute('data-name');
  const number = Number(await section.locator('.search-choice-count').textContent());
  await section.click();
  await expect(rows(page)).toHaveCount(number);
  await expect(page.locator('.search-count')).toHaveText(number === 1 ? 'No exact matches for "zzzzqq". This page is the closest by meaning.' : `No exact matches for "zzzzqq". These ${number} pages are the closest by meaning.`);
  expect(name).toBeTruthy();
});

test('a word the site has no page for in the wording, but means the same as, is found by meaning alone', async ({ page }) => {
  await page.goto('/search/');
  await page.locator('.search-input').fill('diarisation');
  await expect(page.locator('.search-mode')).toHaveText(hybrid);
  await expect(page.locator('.search-count')).toHaveText(/No exact matches for "diarisation"/);
  const titles = await rows(page).allTextContents();
  expect(titles.some(title => /Spectral Clustering|Integration of speech separation/.test(title)), titles.join(' | ')).toBe(true);
});

test('a long query lists its best 8 rows, and Show all lists the rest with the counts unchanged', async ({ page }) => {
  await page.goto('/search/');
  await page.locator('.search-input').pressSequentially('make a photo black and white');
  await expect(page.locator('.search-mode')).toHaveText(hybrid);
  await expect(rows(page)).toHaveCount(8);
  const total = Number((await page.locator('.search-more').textContent()).match(/\d+/)[0]);
  expect(total).toBeGreaterThan(8);
  const all = page.locator('.search-filters .search-choice').first().locator('.search-choice-count');
  await expect(page.locator('.search-count')).toHaveText(`Best 8 of ${total} results`);
  await expect(all).toHaveText(String(total));

  await page.locator('.search-more').focus();
  await page.keyboard.press('Enter');
  await expect(rows(page)).toHaveCount(total);
  await expect(rows(page).filter({ hasText: /^Image Adjust & Transform$/ }), 'the meaning of "black and white" finds the tool that says Grayscale').toHaveCount(1);
  await expect(page.locator('.search-count')).toHaveText(`${total} results`);
  await expect(page.locator('.search-more')).toHaveText('Show the best 8');
  await expect(all).toHaveText(String(total));

  await page.locator('.search-input').fill('attention');
  await expect(rows(page)).toHaveCount(8);
  // A section with few matches lists them all, with no control
  await page.locator('.search-filters .search-choice[data-name="Work"]').click();
  await expect(page.locator('.search-more')).toBeHidden();
  await expect(page.locator('.search-count')).toHaveText(/^(\d+ results|1 result)$/);
});

test('the filters and topics have one spoken name each, with the count', async ({ page }) => {
  await page.goto('/search/');
  const labels = await page.locator('.search-filters .search-choice, .search-topic-list .search-choice').evaluateAll(buttons => buttons.map(button => [button.dataset.name, button.getAttribute('aria-label')]));
  expect(labels.length).toBeGreaterThan(6);
  for (const [name, label] of labels) expect(label, name).toMatch(new RegExp(`^${name}, (1 (result|post)|\\d+ (results|posts))$`));
  expect(labels[0][1]).toMatch(/^All, \d+ results$/);
  expect(labels.find(([name]) => name === 'Writing')[1]).toMatch(/^Writing, \d+ results$/);
});

test('a result that has focus keeps it when the rows are drawn again, and equal rows are not redrawn', async ({ page }) => {
  const { release } = await heldMeaning(page);
  await page.locator('.search-input').fill('kalman');
  await expect.poll(() => topTitles(page)).toContain(kalman);
  await page.locator('.search-rows .post-row', { hasText: kalman }).locator('.post-title a').focus();
  const focused = () => page.evaluate(() => document.activeElement.closest('.post-row')?.querySelector('.post-title a').textContent);
  expect(await focused()).toBe(kalman);
  // The meaning files arrive and the list changes under the visitor
  await release();
  await expect.poll(() => page.locator('.search-rows .post-row').count()).toBeGreaterThan(1);
  expect(await focused(), 'focus stays on the same result').toBe(kalman);

  // Nothing changed in the rows, so they are the same elements
  await page.evaluate(() => { window.__row = document.querySelector('.search-rows .post-row'); });
  await page.locator('.search-filters .search-choice').first().click();
  expect(await page.evaluate(() => window.__row === document.querySelector('.search-rows .post-row')), 'the rows were not redrawn').toBe(true);
});

test('text, titles, headings and anchors with markup and quotes show as text and create no element', async ({ page }) => {
  const record = {
    title: 'Tags <img src=x onerror="window.__pwned=1"> &amp; "quotes" &lt;b&gt;',
    href: 'weird.html',
    section: 'Work',
    date: '1 Jan 2026',
    categories: ['<i>cat</i>"'],
    read: '1 min "read"',
    description: 'Says &lt;script&gt;window.__pwned=1&lt;/script&gt; with \'single\' and "double" quotes',
    body: true,
  };
  const index = {
    v: 1,
    hash: 'weird',
    pages: [{ h: 'weird.html', t: 'Tags &lt;b&gt; "quotes"', d: 'Says <script>window.__pwned=1</script>', p: [['x"><i id="pwn">', 'Heading <u>h</u> "quoted"', 'weirdword then <img src=x onerror="window.__pwned=1"> with "double" and \'single\' quotes']] }],
  };
  await page.route('**/search/', async route => {
    let blocks = 0;
    const html = (await (await route.fetch()).text()).replace(/(<script type="application\/json" class="search-records">)[\s\S]*?(<\/script>)/g, (_, open, close) => `${open}${blocks++ ? '[]' : JSON.stringify([record]).replace(/</g, '\\u003c')}${close}`);
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.route('**/search-index.json', route => route.fulfill({ json: index }));
  await page.goto('/search/');
  await page.locator('.search-input').fill('weirdword');
  const row = page.locator('.search-rows .post-row');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.post-title a')).toHaveText(/<b>/);
  await expect(row.locator('.post-title a')).toContainText('"quotes"');
  await expect(row.locator('.post-desc')).toContainText('<img src=x onerror="window.__pwned=1">');
  await expect(row.locator('.post-desc')).toContainText('"double" and \'single\' quotes');
  await expect(row.locator('.post-cat')).toHaveText('<i>cat</i>"');
  await expect(row.locator('.post-read')).toHaveText('1 min "read"');
  const link = row.locator('.post-title a');
  expect(await link.getAttribute('href')).toBe('../weird.html#x"><i id="pwn">');
  expect(await link.evaluate(a => a.getAttributeNames().sort())).toEqual(['class', 'href']);
  const elements = await page.locator('.search-rows').evaluate(list => [...list.querySelectorAll('*')].map(element => element.tagName.toLowerCase()));
  expect(elements.filter(tag => !['li', 'time', 'div', 'h3', 'a', 'p', 'span', 'mark'].includes(tag)), 'only the row\'s own elements exist').toEqual([]);
  expect(await page.locator('#pwn').count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('with JavaScript off only the note shows', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/search/');
  await expect(page.locator('.search-note')).toBeVisible();
  await expect(page.locator('.search-note')).toHaveText('Search needs JavaScript.');
  for (const part of ['.search-input', '.search-mode', '.search-count', '.search-rows', '.search-filters']) await expect(page.locator(part), part).toBeHidden();
  await context.close();
});

test.describe('when a meaning file is missing or does not match', () => {
  test.use({ allowedErrors: [/Failed to load resource|Failed to fetch|net::ERR/] });

  const keywordStillWorks = async page => {
    await page.locator('.search-input').fill('kalman fil');
    await expect.poll(() => topTitles(page)).toContain(kalman);
    await page.waitForTimeout(500);
    await expect(page.locator('.search-mode')).toHaveText(keyword);
    await page.locator('.search-input').fill('derive ppo loss');
    await expect.poll(() => topTitles(page)).toContain(ppo);
  };

  test('with the table blocked', async ({ page }) => {
    await page.route('**/static/search/*.bin*', route => route.abort());
    const tried = page.waitForRequest(request => request.url().includes('.bin'));
    await page.goto('/search/');
    await page.locator('.search-input').pressSequentially('k');
    await tried;
    await keywordStillWorks(page);
  });

  test('with the vectors blocked', async ({ page }) => {
    await page.route('**/search-vectors.json*', route => route.abort());
    const tried = page.waitForRequest(request => request.url().includes('search-vectors'));
    await page.goto('/search/');
    await page.locator('.search-input').pressSequentially('k');
    await tried;
    await keywordStillWorks(page);
  });

  test('with vectors that belong to another index', async ({ page }) => {
    await page.route('**/search-vectors.json*', async route => {
      const body = await (await route.fetch()).json();
      await route.fulfill({ json: { ...body, index: '0000000000000000' } });
    });
    await page.goto('/search/');
    await page.locator('.search-input').pressSequentially('k');
    await keywordStillWorks(page);
  });

  test('with a table that does not match its hash', async ({ page }) => {
    await page.route('**/static/search/*.bin*', async route => {
      const body = await (await route.fetch()).body();
      body[1000] ^= 1;
      await route.fulfill({ body, contentType: 'application/octet-stream' });
    });
    const sent = page.waitForResponse(response => response.url().includes('.bin'));
    await page.goto('/search/');
    await page.locator('.search-input').pressSequentially('k');
    await sent;
    await keywordStillWorks(page);
  });
});
