import { defineConfig } from '@playwright/test';
import * as path from 'path';

const PORT = process.env.PORT || 4000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  retries: 0,
  reporter: 'json',
  timeout: 20000,

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    storageState: path.join(__dirname, '../playwright/.clerk/user.json'),
  },

  projects: [
    {
      name: 'setup',
      testDir: '../e2e/auth',
      testMatch: /global-setup\.ts/,
      use: { storageState: undefined },
    },
    {
      name: 'laptop',
      testDir: './generated',
      use: { viewport: { width: 1280, height: 800 }, browserName: 'chromium' },
      dependencies: ['setup'],
    },
  ],
});
