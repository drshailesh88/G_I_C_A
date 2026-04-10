import { defineConfig } from "@playwright/test";

const PORT = process.env.PORT || 4000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  globalSetup: require.resolve("./e2e/auth/global-setup.ts"),

  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },

  snapshotPathTemplate:
    "e2e/responsive/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    storageState: "playwright/.clerk/user.json",
  },

  projects: [
    // Auth setup — runs first, no storageState
    {
      name: "setup",
      testMatch: /global-setup\.ts/,
      use: { storageState: undefined },
    },
    {
      name: "phone",
      use: { viewport: { width: 375, height: 812 }, browserName: "chromium" },
      dependencies: ["setup"],
    },
    {
      name: "tablet",
      use: { viewport: { width: 768, height: 1024 }, browserName: "chromium" },
      dependencies: ["setup"],
    },
    {
      name: "laptop",
      use: { viewport: { width: 1280, height: 800 }, browserName: "chromium" },
      dependencies: ["setup"],
    },
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 }, browserName: "chromium" },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: `PORT=${PORT} npm run dev`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
