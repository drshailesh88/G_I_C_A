import { defineConfig } from '@playwright/test';
import path from 'path';

const PORT = process.env.PORT || 4000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './generated',
  fullyParallel: true,
  retries: 0,
  reporter: 'json',
  timeout: 20000,

  globalSetup: require.resolve('../e2e/auth/global-setup.ts'),

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    storageState: path.join(__dirname, '../playwright/.clerk/user.json'),
  },

  projects: [
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
      use: { storageState: undefined },
    },
    {
      name: 'laptop',
      use: { viewport: { width: 1280, height: 800 }, browserName: 'chromium' },
      dependencies: ['setup'],
    },
  ],
});
