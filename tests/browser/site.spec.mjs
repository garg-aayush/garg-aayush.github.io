import { test as base, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../fixtures/transparent.png', import.meta.url));
const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const errors = [];
    const missing = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().startsWith(baseURL) && response.status() >= 400) missing.push(`${response.status()} ${response.url()}`);
    });
    page.on('requestfailed', request => {
      if (request.url().startsWith(baseURL) && request.failure()?.errorText !== 'net::ERR_ABORTED') missing.push(request.url());
    });
    await page.route('**/tools/analytics.js', route => route.fulfill({ status: 200, body: '' }));
    await page.route('**/gtag/js**', route => route.fulfill({ status: 200, body: '' }));
    await use(page);
    expect(errors, 'uncaught browser errors').toEqual([]);
    expect(missing, 'missing local requests').toEqual([]);
  },
});

async function decodedDownload(page, testInfo, filename) {
  const pending = page.waitForEvent('download');
  await page.locator('#downloadBtn').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe(filename);
  const path = testInfo.outputPath(filename);
  await download.saveAs(path);
  await page.evaluate(() => {
    const input = document.createElement('input'); input.id = 'download-check'; input.type = 'file'; input.hidden = true; document.body.append(input);
  });
  await page.locator('#download-check').setInputFiles(path);
  const result = await page.evaluate(async () => {
    const file = document.querySelector('#download-check').files[0];
    const image = await createImageBitmap(file);
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { width: image.width, height: image.height, png: bytes[0] === 137 && bytes[1] === 80, pixel: Array.from(ctx.getImageData(0, 0, 1, 1).data) };
  });
  await page.locator('#download-check').evaluate(input => input.remove());
  return result;
}

test('mobile navigation opens and reaches the tools catalog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.getByLabel('Toggle navigation');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#navbarCollapse').getByRole('link', { name: 'Tools', exact: true }).click();
  await expect(page).toHaveURL(/\/tools\/$/);
  await expect(page.getByRole('heading', { name: 'Tools', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Image Resizer', exact: true })).toBeVisible();
});

test('the PPO article typesets visible mathematics', async ({ page }) => {
  await page.goto('/posts/2025-12-25-deriving-ppo-loss.html');
  await expect(page.locator('main mjx-container[jax="CHTML"]').first()).toBeVisible({ timeout: 20000 });
  expect(await page.locator('main mjx-container').count()).toBeGreaterThan(5);
  const equation = page.locator('main mjx-container[display="true"]').first();
  await equation.scrollIntoViewIfNeeded();
  const box = await equation.boundingBox();
  expect(box.width).toBeGreaterThan(20);
  expect(box.height).toBeGreaterThan(10);
  await expect(page.locator('main mjx-merror')).toHaveCount(0);
});

test('converter downloads PNG with original dimensions and transparency', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tools/image-converter.html');
  await expect(page.locator('#result')).toBeHidden();
  await page.locator('#fileInput').setInputFiles(fixture);
  await page.locator('[data-format="png"]').click();
  await expect(page.locator('#downloadBtn')).toHaveAttribute('data-filename', 'transparent.png');
  await expect(page.locator('#qualityRow')).toBeHidden();
  const image = await decodedDownload(page, testInfo, 'transparent.png');
  expect(image).toMatchObject({ width: 160, height: 100, png: true });
  expect(image.pixel[3]).toBe(0);
});

test('resizer preserves the aspect ratio and downloads the requested dimensions', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tools/image-resizer.html');
  await page.locator('#fileInput').setInputFiles(fixture);
  await expect(page.locator('#dimWidth')).toHaveValue('160');
  await page.locator('#dimWidth').fill('80');
  await expect(page.locator('#dimHeight')).toHaveValue('50');
  await expect(page.locator('#downloadBtn')).toHaveAttribute('data-filename', 'transparent-80x50.png');
  const image = await decodedDownload(page, testInfo, 'transparent-80x50.png');
  expect(image).toMatchObject({ width: 80, height: 50, png: true });
  expect(image.pixel[3]).toBe(0);
});
