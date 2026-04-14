import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  runVisualRegressionGate,
  VISUAL_REGRESSION_GATE_ID,
} from "./visual-regression.js";
import type { CommandOutcome, GateConfig, RunCommandFn } from "./base.js";

let evidenceDir: string;
beforeEach(async () => {
  evidenceDir = join(tmpdir(), `vr-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(evidenceDir, { recursive: true });
});
afterEach(async () => {
  try {
    await fs.rm(evidenceDir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function cfg(runner: RunCommandFn): GateConfig {
  return { runId: "run-1", workingDir: "/repo", evidenceDir, runCommand: runner };
}

function runnerWritesPw(
  json: string,
  outcome: Partial<CommandOutcome> = {},
): RunCommandFn {
  return async (_cmd, _args, options) => {
    const pwPath = options?.env?.PLAYWRIGHT_JSON_OUTPUT_FILE;
    if (pwPath) {
      await fs.mkdir(join(pwPath, ".."), { recursive: true });
      await fs.writeFile(pwPath, json);
    }
    return {
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 500,
      timedOut: false,
      ...outcome,
    };
  };
}

describe("runVisualRegressionGate", () => {
  test("pass when all screenshots match", async () => {
    const pw = JSON.stringify({
      stats: { duration: 1000 },
      suites: [
        {
          file: "visual.spec.ts",
          specs: [
            {
              title: "/ @ desktop",
              file: "visual.spec.ts",
              tests: [
                {
                  projectName: "chromium",
                  results: [{ status: "passed", duration: 500, retry: 0 }],
                },
              ],
            },
          ],
        },
      ],
    });
    const result = await runVisualRegressionGate({
      config: cfg(runnerWritesPw(pw)),
      routes: ["/"],
    });
    expect(result.status).toBe("pass");
    expect(result.gateId).toBe(VISUAL_REGRESSION_GATE_ID);
    expect((result.details as any).passed).toBe(1);
    expect((result.details as any).failed).toBe(0);
  });

  test("fail when any snapshot differs", async () => {
    const pw = JSON.stringify({
      stats: { duration: 1000 },
      suites: [
        {
          file: "visual.spec.ts",
          specs: [
            {
              title: "/ @ desktop",
              file: "visual.spec.ts",
              tests: [
                {
                  projectName: "chromium",
                  results: [
                    {
                      status: "failed",
                      duration: 500,
                      retry: 0,
                      error: { message: "Screenshot comparison failed: 500 pixels different" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const result = await runVisualRegressionGate({
      config: cfg(runnerWritesPw(pw, { exitCode: 1 })),
      routes: ["/"],
    });
    expect(result.status).toBe("fail");
    expect((result.details as any).failed).toBe(1);
    expect((result.details as any).failures).toHaveLength(1);
  });

  test("default viewports include desktop + mobile", async () => {
    const pw = JSON.stringify({ stats: { duration: 0 }, suites: [] });
    const result = await runVisualRegressionGate({
      config: cfg(runnerWritesPw(pw)),
      routes: ["/"],
    });
    const viewports = (result.details as any).viewports;
    expect(viewports.map((v: any) => v.label)).toEqual(["desktop", "mobile"]);
  });

  test("custom viewports honored", async () => {
    const pw = JSON.stringify({ stats: { duration: 0 }, suites: [] });
    const result = await runVisualRegressionGate({
      config: cfg(runnerWritesPw(pw)),
      routes: ["/"],
      viewports: [{ label: "tablet", width: 768, height: 1024 }],
    });
    const viewports = (result.details as any).viewports;
    expect(viewports).toEqual([{ label: "tablet", width: 768, height: 1024 }]);
  });

  test("error on timeout", async () => {
    const result = await runVisualRegressionGate({
      config: cfg(runnerWritesPw("", { timedOut: true })),
      routes: ["/"],
    });
    expect(result.status).toBe("error");
  });

  test("error on missing Playwright JSON", async () => {
    const result = await runVisualRegressionGate({
      config: cfg(async () => ({
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 100,
        timedOut: false,
      })),
      routes: ["/"],
    });
    expect(result.status).toBe("error");
  });

  test("generates spec with viewports", async () => {
    const pw = JSON.stringify({ stats: { duration: 0 }, suites: [] });
    await runVisualRegressionGate({
      config: cfg(runnerWritesPw(pw)),
      routes: ["/home"],
      viewports: [{ label: "phone", width: 390, height: 844 }],
    });
    const specPath = join(evidenceDir, VISUAL_REGRESSION_GATE_ID, "visual.spec.ts");
    const spec = await fs.readFile(specPath, "utf8");
    expect(spec).toContain("toHaveScreenshot");
    expect(spec).toContain("phone");
    expect(spec).toContain("/home");
  });
});
