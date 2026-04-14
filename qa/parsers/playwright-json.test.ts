import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  parsePlaywrightJson,
  parsePlaywrightJsonString,
  parsePlaywrightReport,
} from "./playwright-json.js";
import { ParseError } from "../types.js";

const FIXTURES_DIR = resolve(__dirname, "..", "__fixtures__");

let workDir: string;
beforeEach(async () => {
  workDir = join(tmpdir(), `pw-test-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(workDir, { recursive: true });
});
afterEach(async () => {
  try {
    await fs.rm(workDir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

describe("parsePlaywrightJson — happy paths", () => {
  test("all-pass fixture", async () => {
    const r = await parsePlaywrightJson(
      join(FIXTURES_DIR, "playwright-all-pass.json"),
    );
    expect(r.total).toBe(2);
    expect(r.passed).toBe(2);
    expect(r.failed).toBe(0);
    expect(r.flaky).toBe(0);
    expect(r.skipped).toBe(0);
    expect(r.durationMs).toBe(3420);
    expect(r.failures).toEqual([]);
    expect(r.executedSpecFiles).toEqual(["tests/e2e/auth.spec.ts"]);
  });

  test("mixed fixture reduces nested suites + retries + skips", async () => {
    const r = await parsePlaywrightJson(
      join(FIXTURES_DIR, "playwright-mixed.json"),
    );
    // Total across all tests (each project counts):
    // - pay button renders (1 test, timedOut)
    // - applies coupon (1 test, retry then pass → flaky)
    // - deferred for later (1 test, skipped)
    // - shows user name (2 projects, both pass)
    // 5 tests total
    expect(r.total).toBe(5);
    expect(r.failed).toBe(1);
    expect(r.passed).toBe(3);
    expect(r.flaky).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.durationMs).toBe(12000);

    // Failure details
    expect(r.failures).toHaveLength(1);
    const failure = r.failures[0]!;
    expect(failure.file).toBe("tests/e2e/checkout.spec.ts");
    expect(failure.projectName).toBe("chromium");
    expect(failure.error).toContain("Test timeout");
    expect(failure.traceFile).toBe("/tmp/trace.zip");
    expect(failure.screenshotFile).toBe("/tmp/shot.png");

    // Executed spec files (deduped + sorted)
    expect(r.executedSpecFiles).toEqual([
      "tests/e2e/checkout.spec.ts",
      "tests/e2e/profile.spec.ts",
    ]);
  });
});

describe("parsePlaywrightJson — error paths", () => {
  test("missing file throws ParseError", async () => {
    await expect(
      parsePlaywrightJson(join(workDir, "missing.json")),
    ).rejects.toBeInstanceOf(ParseError);
  });

  test("empty file throws ParseError", async () => {
    const path = join(workDir, "empty.json");
    await fs.writeFile(path, "");
    await expect(parsePlaywrightJson(path)).rejects.toBeInstanceOf(ParseError);
  });

  test("directory path throws ParseError", async () => {
    await expect(parsePlaywrightJson(workDir)).rejects.toBeInstanceOf(ParseError);
  });

  test("invalid JSON throws ParseError", async () => {
    const path = join(workDir, "bad.json");
    await fs.writeFile(path, "{not valid");
    await expect(parsePlaywrightJson(path)).rejects.toBeInstanceOf(ParseError);
  });

  test("schema drift throws ParseError", async () => {
    const path = join(workDir, "schema-drift.json");
    await fs.writeFile(
      path,
      JSON.stringify({
        suites: [{ specs: [{ tests: [{ results: [{ status: "unknown" }] }] }] }],
      }),
    );
    await expect(parsePlaywrightJson(path)).rejects.toBeInstanceOf(ParseError);
  });
});

describe("parsePlaywrightJsonString / parsePlaywrightReport — inline", () => {
  test("parsePlaywrightReport accepts parsed object", () => {
    const r = parsePlaywrightReport({
      stats: { duration: 100 },
      suites: [
        {
          title: "a",
          file: "a.spec.ts",
          specs: [
            {
              title: "test",
              file: "a.spec.ts",
              tests: [
                {
                  projectName: "chromium",
                  results: [{ status: "passed", duration: 100, retry: 0 }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(r.total).toBe(1);
    expect(r.passed).toBe(1);
  });

  test("parsePlaywrightJsonString accepts valid JSON", () => {
    const r = parsePlaywrightJsonString(
      JSON.stringify({
        stats: { duration: 0 },
        suites: [],
      }),
    );
    expect(r.total).toBe(0);
  });

  test("empty string throws ParseError", () => {
    expect(() => parsePlaywrightJsonString("", "memory")).toThrow(ParseError);
  });
});

describe("parser edge cases", () => {
  test("interrupted status counted as failed", () => {
    const r = parsePlaywrightReport({
      stats: { duration: 100 },
      suites: [
        {
          file: "a.spec.ts",
          specs: [
            {
              title: "t",
              file: "a.spec.ts",
              tests: [
                {
                  projectName: "chromium",
                  results: [{ status: "interrupted", duration: 100, retry: 0 }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(r.failed).toBe(1);
  });

  test("empty results array counts as skipped", () => {
    const r = parsePlaywrightReport({
      stats: { duration: 0 },
      suites: [
        {
          file: "a.spec.ts",
          specs: [
            {
              title: "t",
              file: "a.spec.ts",
              tests: [{ projectName: "chromium", results: [] }],
            },
          ],
        },
      ],
    });
    expect(r.skipped).toBe(1);
    expect(r.total).toBe(1);
  });

  test("flaky = pass after earlier failure/timeout", () => {
    const r = parsePlaywrightReport({
      stats: { duration: 100 },
      suites: [
        {
          file: "a.spec.ts",
          specs: [
            {
              title: "t",
              file: "a.spec.ts",
              tests: [
                {
                  projectName: "chromium",
                  results: [
                    { status: "failed", duration: 50, retry: 0 },
                    { status: "passed", duration: 60, retry: 1 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(r.passed).toBe(1);
    expect(r.flaky).toBe(1);
  });

  test("pass on first attempt is NOT flaky", () => {
    const r = parsePlaywrightReport({
      stats: { duration: 100 },
      suites: [
        {
          file: "a.spec.ts",
          specs: [
            {
              title: "t",
              file: "a.spec.ts",
              tests: [
                {
                  projectName: "chromium",
                  results: [{ status: "passed", duration: 100, retry: 0 }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(r.flaky).toBe(0);
  });

  test("specs inside nested suites are discovered", () => {
    const r = parsePlaywrightReport({
      stats: { duration: 50 },
      suites: [
        {
          title: "outer",
          file: "outer.spec.ts",
          suites: [
            {
              title: "inner",
              file: "outer.spec.ts",
              specs: [
                {
                  title: "t",
                  file: "outer.spec.ts",
                  tests: [
                    {
                      projectName: "chromium",
                      results: [{ status: "passed", duration: 50, retry: 0 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(r.total).toBe(1);
    expect(r.executedSpecFiles).toEqual(["outer.spec.ts"]);
  });

  test("executedSpecFiles deduplicates across tests in same file", () => {
    const r = parsePlaywrightReport({
      stats: { duration: 0 },
      suites: [
        {
          file: "same.spec.ts",
          specs: [
            {
              title: "a",
              file: "same.spec.ts",
              tests: [
                { projectName: "p1", results: [{ status: "passed", duration: 0, retry: 0 }] },
              ],
            },
            {
              title: "b",
              file: "same.spec.ts",
              tests: [
                { projectName: "p1", results: [{ status: "passed", duration: 0, retry: 0 }] },
              ],
            },
          ],
        },
      ],
    });
    expect(r.executedSpecFiles).toEqual(["same.spec.ts"]);
  });

  test("durationMs prefers top-level stats.duration", () => {
    const r = parsePlaywrightReport({
      stats: { duration: 9999 },
      suites: [
        {
          file: "a.spec.ts",
          specs: [
            {
              title: "t",
              file: "a.spec.ts",
              tests: [
                {
                  projectName: "chromium",
                  results: [{ status: "passed", duration: 100, retry: 0 }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(r.durationMs).toBe(9999);
  });
});
