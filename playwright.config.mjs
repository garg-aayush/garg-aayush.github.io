import { defineConfig } from '@playwright/test';

const baseURL = `http://127.0.0.1:${process.env.SITE_TEST_PORT ?? 4173}`;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 30000,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL, browserName: 'chromium', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/serve-site.mjs', url: baseURL, reuseExistingServer: false, timeout: 10000 },
});
