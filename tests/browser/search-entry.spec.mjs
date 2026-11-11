import { test as base, expect } from '@playwright/test';

const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.url().startsWith(baseURL) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.route('**/gtag/js**', route => route.fulfill({ status: 200, body: '' }));
    await use(page);
    expect(errors, 'browser errors').toEqual([]);
  },
});

const post = '/posts/2026-07-15-kalman-filters-time-series/index.html';
const navLink = page => page.locator('.navbar .nav-link[href$="/search/"]');
const onSearchPage = page => { const { pathname, search, hash } = new URL(page.url()); return { pathname, search, hash }; };

for (const [name, path] of [['the homepage', '/'], ['a post', post], ['the Writing page', '/blog/'], ['the search page', '/search/']]) {
  test(`the navbar has a Search icon link to /search/ on ${name}`, async ({ page }) => {
    await page.goto(path);
    const link = navLink(page);
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAccessibleName('Search');
    await expect(link.locator('.bi-search')).toBeVisible();
    // It is the last item, after About
    await expect(page.locator('.navbar .nav-link').last()).toHaveAttribute('href', /\/search\/$/);
    if (path === '/search/') {
      await expect(link, 'the current page is marked like the others').toHaveClass(/active/);
      await expect(link).toHaveAttribute('aria-current', 'page');
    } else {
      await expect(link).not.toHaveClass(/active/);
      await link.click();
      await expect(page).toHaveURL(/\/search\/$/);
    }
  });
}

test('the current page is marked in the navbar on the Writing page, and Quarto\'s own search is gone', async ({ page }) => {
  await page.goto('/blog/');
  await expect(page.locator('.navbar .nav-link.active')).toHaveText('Writing');
  await expect(page.locator('#quarto-search, .aa-Autocomplete, .aa-DetachedOverlay, [data-bs-target="#quarto-search"]')).toHaveCount(0);
  const before = page.url();
  for (const key of ['s', 'f']) await page.keyboard.press(key);
  await expect(page.locator('.aa-DetachedOverlay, .aa-Panel')).toHaveCount(0);
  expect(page.url(), 's and f do nothing').toBe(before);
});

for (const [name, path, size] of [['the homepage', '/', { width: 1280, height: 900 }], ['a post', post, { width: 1280, height: 900 }], ['the homepage on a phone', '/', { width: 390, height: 844 }]]) {
  test(`/ on ${name} goes to the search page with the field focused and nothing in the address`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto(path);
    await page.keyboard.press('/');
    await expect(page).toHaveURL(/\/search\/$/);
    expect(onSearchPage(page)).toEqual({ pathname: '/search/', search: '', hash: '' });
    await expect(page.locator('.search-input')).toBeFocused();
    await expect(page.locator('.search-input')).toHaveValue('');
    expect(await page.evaluate(() => sessionStorage.getItem('search-focus')), 'the flag is used once').toBeNull();
    await expect(page.locator('.aa-DetachedOverlay')).toHaveCount(0);
  });
}

test('/ does nothing in a field or with a modifier, and keeps focusing the field on the search page', async ({ page }) => {
  await page.goto('/tools/');
  const filter = page.locator('input').first();
  await filter.focus();
  await page.keyboard.press('/');
  await expect(filter).toHaveValue('/');
  expect(onSearchPage(page).pathname).toBe('/tools/');
  await filter.blur();
  await page.keyboard.press('Control+/');
  await page.keyboard.press('Meta+/');
  await page.waitForTimeout(300);
  expect(onSearchPage(page).pathname, 'a modifier keeps the browser\'s own shortcut').toBe('/tools/');

  await page.goto('/search/');
  await page.locator('.search-input').blur();
  await page.keyboard.press('/');
  await expect(page.locator('.search-input')).toBeFocused();
  await expect(page.locator('.search-input')).toHaveValue('');
  expect(onSearchPage(page).pathname).toBe('/search/');
});

test('the Writing page has a small Search link under its description', async ({ page }) => {
  await page.goto('/blog/');
  const link = page.locator('.writing-search a');
  await expect(link).toHaveText('Search');
  await expect(link).toHaveClass(/link-arrow/);
  // Quarto opens links to another host in a new tab and the test host is not the site's, so the target is checked rather than a click
  expect(new URL(await link.evaluate(a => a.href)).pathname).toBe('/search/');
});

test('the search page is an ordinary page: it can be indexed, analytics is on, and typing sends nothing', async ({ page }) => {
  const sent = [];
  page.on('request', request => sent.push(`${request.method()} ${request.url()} ${request.postData() ?? ''}`));
  await page.goto('/search/');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  expect(await page.evaluate(() => window['ga-disable-G-16JWTLXJNG']), 'the analytics opt-out is gone').toBeUndefined();
  expect(await page.evaluate(() => Array.isArray(window.dataLayer) && window.dataLayer.length > 0), 'the analytics snippet is present').toBe(true);
  await expect(page.locator('.search-mode')).toBeVisible();
  await page.locator('.search-input').pressSequentially('secretquerywords');
  await expect(page.locator('.search-count')).not.toHaveText('');
  await expect(page.locator('.search-mode')).toHaveText('Keyword and meaning search');
  await page.waitForLoadState('networkidle');
  expect(onSearchPage(page)).toEqual({ pathname: '/search/', search: '', hash: '' });
  expect(sent.join('\n'), 'no request carries the query').not.toMatch(/secretquery/i);
  expect(JSON.stringify(await page.evaluate(() => Array.from(window.dataLayer, entry => Array.from(entry)))), 'analytics saw nothing of the query').not.toMatch(/secretquery/i);
});

for (const path of [post, '/posts/2025-12-25-deriving-ppo-loss.html']) {
  test(`with Quarto's search off, the category of ${path.split('/').pop() === 'index.html' ? 'a post in its own folder' : 'a single-file post'} still links to a listing and nothing is missing`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('meta[name="quarto:offset"]')).toHaveCount(1);
    const link = page.locator('.quarto-category a').first();
    await expect(link).toBeVisible();
    expect(await link.getAttribute('href')).toMatch(/^\/index\.html#category=/);
  });
}
