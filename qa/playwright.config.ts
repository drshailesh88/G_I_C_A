import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./generated",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  timeout: 60000,
  workers: 1,
  reporter: "json",

  use: {
    baseURL: "http://localhost:4000",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 }, browserName: "chromium" },
    },
  ],
});
