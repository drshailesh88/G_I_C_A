import { defineConfig } from "vitest/config";

/**
 * Integration test config — runs the full-pipeline test that spins up a real
 * Next.js fixture, invokes `runInstaller`, writes a real contract, runs real
 * Stryker + Vitest via subprocess, and inspects state.json.
 *
 * Separated from the default vitest config because:
 *   - testTimeout / hookTimeout are much larger (subprocess tool runs)
 *   - fileParallelism is off (shared temp workspace + npm registry)
 *   - default unit runs should NOT pay the ~5-minute cost
 *
 * Invoke via `npm run test:integration`.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["**/__tests__/integration/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/__fixtures__/**"],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    reporters: ["verbose"],
  },
});
