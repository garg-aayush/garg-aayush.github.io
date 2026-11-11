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

test('a query ranks the right page first, and typing makes no request once the files are loaded', async ({ page, baseURL }) => {
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
  // The box is focused on a desktop, which is its first use, so the meaning files follow
  await expect(page.locator('.search-mode')).toHaveText(hybrid);
  await page.waitForLoadState('networkidle');
  expect(own.map(path => path.replace(/\?v=.*/, ''))).toEqual(['/search-index.json', '/search-vectors.json', '/static/search/potion-base-8M.int8.bin', '/static/search/potion-base-8M.vocab.txt']);
  expect(own.slice(1).every(path => /\?v=[0-9a-f]{12,16}$/.test(path)), 'meaning files are fetched under hash versioned URLs').toBe(true);
  loaded = true;

  await page.locator('.search-input').pressSequentially('kalman fil');
  const first = page.locator('.search-rows .post-row').first();
  await expect(first.locator('.post-title a')).toHaveText('Kalman Filters and Smoothing for Time-Series Data');
  await expect(first.locator('.post-title a')).toHaveAttribute('href', /posts\/2026-07-15-kalman-filters-time-series\/index\.html#/);
  await expect(first.locator('.post-desc mark').first()).toBeVisible();

  await page.locator('.search-input').fill('derive ppo loss');
  await expect(rows(page).first()).toHaveText('Deriving the PPO Loss from First Principles');
  expect(later, 'requests after the files loaded').toEqual([]);
});

test('meaning search loads on the first use of the box, and a paraphrase that keywords miss then finds its page', async ({ page }) => {
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
  await expect(rows(page).first()).toHaveText('About');
});

test('a long query lists its best 8 rows, and Show all lists the rest with the counts unchanged', async ({ page }) => {
  await page.goto('/search/');
  await expect(page.locator('.search-mode')).toHaveText(hybrid);
  await page.locator('.search-input').fill('make a photo black and white');
  await expect(rows(page)).toHaveCount(8);
  const total = Number((await page.locator('.search-more').textContent()).match(/\d+/)[0]);
  expect(total).toBeGreaterThan(8);
  const all = page.locator('.search-filters .search-choice').first().locator('.search-choice-count');
  await expect(page.locator('.search-count')).toHaveText(`Best 8 of ${total} results`);
  await expect(all).toHaveText(String(total));
  await expect(rows(page).filter({ hasText: /^Image Adjust & Transform$/ }), 'the meaning of "black and white" finds the tool that says Grayscale').toHaveCount(1);

  await page.locator('.search-more').focus();
  await page.keyboard.press('Enter');
  await expect(rows(page)).toHaveCount(total);
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

test.describe('when a meaning file is missing or does not match', () => {
  test.use({ allowedErrors: [/Failed to load resource|Failed to fetch|net::ERR/] });

  const keywordStillWorks = async page => {
    await page.locator('.search-input').fill('kalman fil');
    await expect(rows(page).first()).toHaveText('Kalman Filters and Smoothing for Time-Series Data');
    await page.waitForTimeout(500);
    await expect(page.locator('.search-mode')).toHaveText(keyword);
    await page.locator('.search-input').fill('derive ppo loss');
    await expect(rows(page).first()).toHaveText('Deriving the PPO Loss from First Principles');
  };

  test('with the table blocked', async ({ page }) => {
    await page.route('**/static/search/*.bin*', route => route.abort());
    const tried = page.waitForRequest(request => request.url().includes('.bin'));
    await page.goto('/search/');
    await tried;
    await keywordStillWorks(page);
  });

  test('with the vectors blocked', async ({ page }) => {
    await page.route('**/search-vectors.json*', route => route.abort());
    const tried = page.waitForRequest(request => request.url().includes('search-vectors'));
    await page.goto('/search/');
    await tried;
    await keywordStillWorks(page);
  });

  test('with vectors that belong to another index', async ({ page }) => {
    await page.route('**/search-vectors.json*', async route => {
      const body = await (await route.fetch()).json();
      await route.fulfill({ json: { ...body, index: '0000000000000000' } });
    });
    await page.goto('/search/');
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
    await sent;
    await keywordStillWorks(page);
  });
});
