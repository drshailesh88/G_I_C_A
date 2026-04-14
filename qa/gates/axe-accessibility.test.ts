import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  runAxeAccessibilityGate,
  AXE_ACCESSIBILITY_GATE_ID,
} from "./axe-accessibility.js";
import type { CommandOutcome, GateConfig, RunCommandFn } from "./base.js";

let evidenceDir: string;
beforeEach(async () => {
  evidenceDir = join(tmpdir(), `axe-${randomBytes(6).toString("hex")}`);
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

function runnerWritesAxeReport(
  report: Array<{ route: string; violations: any[] }>,
  outcome: Partial<CommandOutcome> = {},
): RunCommandFn {
  return async (_cmd, _args, options) => {
    const axePath = options?.env?.QA_AXE_REPORT_PATH;
    if (axePath) {
      await fs.mkdir(join(axePath, ".."), { recursive: true });
      await fs.writeFile(axePath, JSON.stringify(report));
    }
    // Also write a minimal Playwright JSON so fallback path works.
    const pwPath = options?.env?.PLAYWRIGHT_JSON_OUTPUT_FILE;
    if (pwPath) {
      await fs.mkdir(join(pwPath, ".."), { recursive: true });
      await fs.writeFile(
        pwPath,
        JSON.stringify({ stats: { duration: 100 }, suites: [] }),
      );
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

describe("runAxeAccessibilityGate", () => {
  test("pass when no violations", async () => {
    const result = await runAxeAccessibilityGate({
      config: cfg(runnerWritesAxeReport([{ route: "/", violations: [] }])),
      routes: ["/"],
    });
    expect(result.status).toBe("pass");
    expect(result.gateId).toBe(AXE_ACCESSIBILITY_GATE_ID);
    expect((result.details as any).totalViolations).toBe(0);
  });

  test("fail when serious+ violation present", async () => {
    const result = await runAxeAccessibilityGate({
      config: cfg(
        runnerWritesAxeReport([
          {
            route: "/",
            violations: [
              {
                id: "color-contrast",
                impact: "serious",
                description: "Insufficient contrast",
                help: "https://dequeuniversity.com/rules/axe/color-contrast",
                nodes: [{ target: "button" }],
              },
            ],
          },
        ]),
      ),
      routes: ["/"],
    });
    expect(result.status).toBe("fail");
    const details = result.details as any;
    expect(details.blockingViolations).toBe(1);
    expect(details.violations[0].impact).toBe("serious");
    expect(details.violations[0].route).toBe("/");
  });

  test("pass when only minor/moderate violations", async () => {
    const result = await runAxeAccessibilityGate({
      config: cfg(
        runnerWritesAxeReport([
          {
            route: "/",
            violations: [
              { id: "minor-issue", impact: "minor", description: "x", help: "x", nodes: [] },
              { id: "moderate-issue", impact: "moderate", description: "y", help: "y", nodes: [] },
            ],
          },
        ]),
      ),
      routes: ["/"],
    });
    expect(result.status).toBe("pass");
    const details = result.details as any;
    expect(details.totalViolations).toBe(2);
    expect(details.blockingViolations).toBe(0);
    expect(details.byImpact.minor).toBe(1);
    expect(details.byImpact.moderate).toBe(1);
  });

  test("minSeverity=minor catches everything", async () => {
    const result = await runAxeAccessibilityGate({
      config: cfg(
        runnerWritesAxeReport([
          {
            route: "/",
            violations: [
              { id: "minor-issue", impact: "minor", description: "x", help: "x", nodes: [] },
            ],
          },
        ]),
      ),
      routes: ["/"],
      minSeverity: "minor",
    });
    expect(result.status).toBe("fail");
  });

  test("minSeverity=critical only catches critical", async () => {
    const result = await runAxeAccessibilityGate({
      config: cfg(
        runnerWritesAxeReport([
          {
            route: "/",
            violations: [
              { id: "serious-issue", impact: "serious", description: "x", help: "x", nodes: [] },
            ],
          },
        ]),
      ),
      routes: ["/"],
      minSeverity: "critical",
    });
    expect(result.status).toBe("pass");
  });

  test("aggregates violations across multiple routes", async () => {
    const result = await runAxeAccessibilityGate({
      config: cfg(
        runnerWritesAxeReport([
          {
            route: "/",
            violations: [{ id: "a", impact: "serious", description: "", help: "", nodes: [] }],
          },
          {
            route: "/about",
            violations: [{ id: "b", impact: "critical", description: "", help: "", nodes: [] }],
          },
        ]),
      ),
      routes: ["/", "/about"],
    });
    const details = result.details as any;
    expect(details.totalViolations).toBe(2);
    expect(details.byImpact.serious).toBe(1);
    expect(details.byImpact.critical).toBe(1);
  });

  test("generates spec file in evidence dir", async () => {
    await runAxeAccessibilityGate({
      config: cfg(runnerWritesAxeReport([])),
      routes: ["/"],
    });
    const specPath = join(evidenceDir, AXE_ACCESSIBILITY_GATE_ID, "axe.spec.ts");
    const spec = await fs.readFile(specPath, "utf8");
    expect(spec).toContain("AxeBuilder");
    expect(spec).toContain("QA_AXE_REPORT_PATH");
  });

  test("error on timeout", async () => {
    const result = await runAxeAccessibilityGate({
      config: cfg(runnerWritesAxeReport([], { timedOut: true })),
      routes: ["/"],
    });
    expect(result.status).toBe("error");
  });

  test("unknown impact counted separately", async () => {
    const result = await runAxeAccessibilityGate({
      config: cfg(
        runnerWritesAxeReport([
          {
            route: "/",
            violations: [
              { id: "x", impact: "mild", description: "", help: "", nodes: [] },
            ],
          },
        ]),
      ),
      routes: ["/"],
    });
    expect((result.details as any).byImpact.unknown).toBe(1);
  });
});
