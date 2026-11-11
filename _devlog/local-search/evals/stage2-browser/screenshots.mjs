// Full-page screenshots of the search page at 1280 and 390 px: empty, three queries, and the same queries after Show all.
// Usage: node screenshots.mjs <server url> <output folder>
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [url, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const width of [1280, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  await page.route('**/gtag/js**', route => route.fulfill({ status: 200, body: '' }));
  await page.goto(`${url}/search/`);
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  // On a phone the box is not focused, so focus it, which is the first use
  await page.locator('.search-input').focus();
  await page.waitForFunction(() => document.querySelector('.search-mode').textContent.includes('meaning'));
  await page.screenshot({ path: join(out, `${width}-empty.png`), fullPage: true });
  for (const [name, query] of [['attention', 'attention'], ['photo', 'make a photo black and white'], ['now', 'what does he do now']]) {
    await page.locator('.search-input').fill(query);
    await page.screenshot({ path: join(out, `${width}-${name}.png`), fullPage: true });
    await page.locator('.search-more').click();
    await page.screenshot({ path: join(out, `${width}-${name}-all.png`), fullPage: true });
  }
  await page.close();
}
await browser.close();
