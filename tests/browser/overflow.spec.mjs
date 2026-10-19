import { test as base, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { settled } from '../../scripts/page-settled.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)), process.env.SITE_OUTPUT_DIR ?? '_site');
const pages = readdirSync(root, { recursive: true }).filter(path => path.endsWith('.html') && !path.startsWith('site_libs/')).sort();

// Overflow is the only assertion: the weather page reaches external services and has no Mapbox token locally.
const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/tools/analytics.js', route => route.fulfill({ status: 200, body: '' }));
    await page.route('**/gtag/js**', route => route.fulfill({ status: 200, body: '' }));
    await use(page);
  },
});

function measureOverflow() {
  const limit = window.innerWidth;
  const overflow = document.documentElement.scrollWidth - limit;
  if (overflow <= 0) return { overflow };
  // A scroll container clips its children, so only unclipped elements can widen the page.
  const clipped = el => {
    for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      if (getComputedStyle(parent).overflowX !== 'visible') return true;
    }
    return false;
  };
  let widest = null;
  let widestClipped = null;
  for (const el of document.body.querySelectorAll('*')) {
    const right = el.getBoundingClientRect().right;
    if (right <= limit) continue;
    if (clipped(el)) { if (right > (widestClipped?.right ?? 0)) widestClipped = { el, right }; }
    else if (right > (widest?.right ?? 0)) widest = { el, right };
  }
  const culprit = widest ?? widestClipped;
  if (!culprit) return { overflow };
  const classes = [...culprit.el.classList].slice(0, 2).map(name => `.${name}`).join('');
  return { overflow, element: culprit.el.localName + classes, past: Math.round(culprit.right - limit) };
}

for (const path of pages) {
  for (const width of [390, 1280]) {
    test(`${path} fits ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/${path}`);
      await settled(page, { idle: path === 'india-weather.html' });
      const { overflow, element, past } = await page.evaluate(measureOverflow);
      const cause = element ? `, widest element ${element} reaches ${past}px past the edge` : '';
      expect(overflow, `${path} at ${width}px overflows by ${overflow}px${cause}`).toBeLessThanOrEqual(0);
    });
  }
}
