import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './generated',
  fullyParallel: true,
  retries: 0,
  reporter: 'json',
  timeout: 20000,

  use: {
    baseURL: process.env.APP_PORT
      ? `http://localhost:${process.env.APP_PORT}`
      : 'http://localhost:4000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'laptop',
      use: { viewport: { width: 1280, height: 800 }, browserName: 'chromium' },
    },
  ],
});
