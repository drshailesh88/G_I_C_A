import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/__tests__/integration/**",
      "**/__fixtures__/**",
    ],
    coverage: {
      reporter: ["text", "json"],
      exclude: [
        "**/*.test.ts",
        "**/__fixtures__/**",
        "**/__tests__/integration/**",
        "dist/**",
      ],
    },
  },
});
