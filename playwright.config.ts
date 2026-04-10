import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },

  snapshotPathTemplate:
    "e2e/responsive/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "phone",
      use: { viewport: { width: 375, height: 812 }, browserName: "chromium" },
    },
    {
      name: "tablet",
      use: { viewport: { width: 768, height: 1024 }, browserName: "chromium" },
    },
    {
      name: "laptop",
      use: { viewport: { width: 1280, height: 800 }, browserName: "chromium" },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 }, browserName: "chromium" },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
