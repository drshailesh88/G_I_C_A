import { defineConfig } from '@playwright/test';

const PORT = process.env.PORT || 4000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    storageState: 'playwright/.clerk/user.json',
  },
  projects: [
    {
      name: 'setup',
      testDir: './e2e/auth',
      testMatch: /global-setup\.ts/,
      use: { storageState: undefined },
    },
    {
      name: 'chromium',
      testDir: './e2e',
      testIgnore: /auth\/global-setup\.ts/,
      use: { browserName: 'chromium' },
      dependencies: ['setup'],
    },
  ],
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    process.env.CI ? ['github'] : ['list'],
  ],
  // CRITICAL: never auto-update snapshots in CI
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      threshold: 0.2,
    },
  },
});
