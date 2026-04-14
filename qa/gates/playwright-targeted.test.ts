import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  runPlaywrightTargetedGate,
  PLAYWRIGHT_TARGETED_GATE_ID,
} from "./playwright-targeted.js";
import type { CommandOutcome, GateConfig, RunCommandFn } from "./base.js";
import type { ContractIndex } from "../types.js";

let root: string;
let contractDir: string;

beforeEach(async () => {
  root = join(tmpdir(), `pw-gate-${randomBytes(6).toString("hex")}`);
  contractDir = join(root, ".quality", "contracts", "auth-login");
  await fs.mkdir(contractDir, { recursive: true });
  await fs.mkdir(join(root, "evidence"), { recursive: true });

  const contract: ContractIndex = {
    schema_version: 1,
    feature: {
      id: "auth-login",
      title: "Auth",
      tier: "critical_75",
      category: "auth",
      status: "frozen",
      security_sensitive: true,
    },
    approval: { approved_by: "t", approved_at: "2026-04-14T22:00:00Z" },
    source_docs: [],
    artifacts: {
      examples: "examples.md",
      counterexamples: "counterexamples.md",
      invariants: "invariants.md",
      acceptance_tests: "acceptance.spec.ts",
      regression_tests: "regressions.spec.ts",
      api_contract: null,
    },
    counts: {
      examples: 1,
      counterexamples: 0,
      invariants: 0,
      acceptance_tests: 2,
      regression_tests: 0,
    },
    affected_modules: ["src/auth/**"],
    test_data: { seeded_users: [], requires_services: [] },
    hashes: {
      "acceptance.spec.ts":
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    },
    version: 1,
    version_history: [
      {
        version: 1,
        date: "2026-04-14",
        approved_by: "t",
        reason: "initial",
        authoring_mode: "source_denied",
        baseline_reset_triggered: false,
      },
    ],
  };
  await fs.writeFile(join(contractDir, "index.yaml"), yaml.dump(contract));
  await fs.writeFile(join(contractDir, "acceptance.spec.ts"), "// placeholder");
});

afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

const PASSING_JSON = JSON.stringify({
  config: {},
  stats: { expected: 2, unexpected: 0, flaky: 0, skipped: 0, duration: 1000 },
  suites: [
    {
      file: "tests/e2e/auth.spec.ts",
      specs: [
        {
          title: "logs in",
          file: "tests/e2e/auth.spec.ts",
          tests: [
            {
              projectName: "chromium",
              results: [{ status: "passed", duration: 500, retry: 0 }],
            },
          ],
        },
        {
          title: "logs out",
          file: "tests/e2e/auth.spec.ts",
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

const FAILING_JSON = JSON.stringify({
  config: {},
  stats: { expected: 1, unexpected: 1, flaky: 0, skipped: 0, duration: 2000 },
  suites: [
    {
      file: "tests/e2e/auth.spec.ts",
      specs: [
        {
          title: "logs in",
          file: "tests/e2e/auth.spec.ts",
          tests: [
            {
              projectName: "chromium",
              results: [
                {
                  status: "failed",
                  duration: 2000,
                  retry: 0,
                  error: { message: "selector not found" },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

function runnerWritesJson(
  json: string,
  outcome: Partial<CommandOutcome> = {},
): RunCommandFn {
  return async (_command, _args, opts) => {
    const outPath = opts?.env?.PLAYWRIGHT_JSON_OUTPUT_FILE;
    if (outPath) {
      await fs.mkdir(join(outPath, ".."), { recursive: true });
      await fs.writeFile(outPath, json);
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

function cfg(runner: RunCommandFn): GateConfig {
  return {
    runId: "run-1",
    workingDir: root,
    evidenceDir: join(root, "evidence"),
    contractDir,
    featureId: "auth-login",
    runCommand: runner,
  };
}

describe("runPlaywrightTargetedGate", () => {
  test("pass when all tests pass", async () => {
    const result = await runPlaywrightTargetedGate(cfg(runnerWritesJson(PASSING_JSON)));
    expect(result.status).toBe("pass");
    expect(result.gateId).toBe(PLAYWRIGHT_TARGETED_GATE_ID);
    expect((result.details as any).passed).toBe(2);
    expect((result.details as any).failed).toBe(0);
    expect((result.details as any).executedSpecFiles).toContain(
      "tests/e2e/auth.spec.ts",
    );
  });

  test("fail when any test fails", async () => {
    const result = await runPlaywrightTargetedGate(
      cfg(runnerWritesJson(FAILING_JSON, { exitCode: 1 })),
    );
    expect(result.status).toBe("fail");
    expect((result.details as any).failed).toBe(1);
    expect((result.details as any).failures).toHaveLength(1);
  });

  test("error on missing contractDir", async () => {
    const result = await runPlaywrightTargetedGate({
      runId: "run-1",
      workingDir: root,
      evidenceDir: join(root, "evidence"),
      runCommand: runnerWritesJson(PASSING_JSON),
    });
    expect(result.status).toBe("error");
    expect((result.details as any).parseError).toContain("contractDir is required");
  });

  test("error on missing contract index.yaml", async () => {
    await fs.unlink(join(contractDir, "index.yaml"));
    const result = await runPlaywrightTargetedGate(cfg(runnerWritesJson(PASSING_JSON)));
    expect(result.status).toBe("error");
  });

  test("error on invalid contract schema", async () => {
    await fs.writeFile(
      join(contractDir, "index.yaml"),
      yaml.dump({ schema_version: 2 }),
    );
    const result = await runPlaywrightTargetedGate(cfg(runnerWritesJson(PASSING_JSON)));
    expect(result.status).toBe("error");
  });

  test("error on timeout", async () => {
    const result = await runPlaywrightTargetedGate(
      cfg(runnerWritesJson(PASSING_JSON, { timedOut: true })),
    );
    expect(result.status).toBe("error");
    expect((result.details as any).parseError).toContain("timed out");
  });

  test("fallback to stdout when JSON file not produced", async () => {
    const runner: RunCommandFn = async () => ({
      exitCode: 0,
      stdout: PASSING_JSON,
      stderr: "",
      durationMs: 500,
      timedOut: false,
    });
    const result = await runPlaywrightTargetedGate(cfg(runner));
    expect(result.status).toBe("pass");
    expect((result.details as any).passed).toBe(2);
  });

  test("error when neither JSON file nor JSON stdout available", async () => {
    const runner: RunCommandFn = async () => ({
      exitCode: 1,
      stdout: "Playwright crashed",
      stderr: "",
      durationMs: 100,
      timedOut: false,
    });
    const result = await runPlaywrightTargetedGate(cfg(runner));
    expect(result.status).toBe("error");
  });

  test("skipped tests count as failure (α)", async () => {
    const skippedJson = JSON.stringify({
      config: {},
      stats: { duration: 100 },
      suites: [
        {
          file: "tests/e2e/auth.spec.ts",
          specs: [
            {
              title: "t",
              file: "tests/e2e/auth.spec.ts",
              tests: [
                { projectName: "chromium", results: [{ status: "skipped", duration: 0, retry: 0 }] },
              ],
            },
          ],
        },
      ],
    });
    const result = await runPlaywrightTargetedGate(cfg(runnerWritesJson(skippedJson)));
    expect(result.status).toBe("fail");
  });
});
