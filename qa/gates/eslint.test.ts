import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runEslintGate, ESLINT_GATE_ID } from "./eslint.js";
import type { CommandOutcome, GateConfig, RunCommandFn } from "./base.js";

let evidenceDir: string;
beforeEach(async () => {
  evidenceDir = join(tmpdir(), `eslint-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(evidenceDir, { recursive: true });
});
afterEach(async () => {
  try {
    await fs.rm(evidenceDir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function fakeRunner(outcome: Partial<CommandOutcome>): RunCommandFn {
  return async () => ({
    exitCode: 0,
    stdout: "",
    stderr: "",
    durationMs: 100,
    timedOut: false,
    ...outcome,
  });
}

function cfg(runner: RunCommandFn): GateConfig {
  return {
    runId: "run-1",
    workingDir: "/repo",
    evidenceDir,
    runCommand: runner,
  };
}

describe("runEslintGate", () => {
  test("pass when all files have zero errors/warnings", async () => {
    const output = JSON.stringify([
      { filePath: "/repo/src/a.ts", messages: [], errorCount: 0, warningCount: 0 },
      { filePath: "/repo/src/b.ts", messages: [], errorCount: 0, warningCount: 0 },
    ]);
    const result = await runEslintGate(
      cfg(fakeRunner({ exitCode: 0, stdout: output })),
    );
    expect(result.status).toBe("pass");
    expect(result.gateId).toBe(ESLINT_GATE_ID);
    expect((result.details as any).errorCount).toBe(0);
    expect((result.details as any).warningCount).toBe(0);
  });

  test("fail when any file has errors", async () => {
    const output = JSON.stringify([
      {
        filePath: "/repo/src/a.ts",
        messages: [
          { ruleId: "no-unused-vars", severity: 2, message: "unused", line: 5 },
        ],
        errorCount: 1,
        warningCount: 0,
      },
    ]);
    const result = await runEslintGate(
      cfg(fakeRunner({ exitCode: 1, stdout: output })),
    );
    expect(result.status).toBe("fail");
    expect((result.details as any).errorCount).toBe(1);
    expect((result.details as any).topMessages).toHaveLength(1);
    expect((result.details as any).topMessages[0].severity).toBe("error");
  });

  test("fail when warnings present (max-warnings 0 policy)", async () => {
    const output = JSON.stringify([
      {
        filePath: "/repo/src/a.ts",
        messages: [{ ruleId: "prefer-const", severity: 1, message: "use const" }],
        errorCount: 0,
        warningCount: 1,
      },
    ]);
    const result = await runEslintGate(
      cfg(fakeRunner({ exitCode: 1, stdout: output })),
    );
    expect(result.status).toBe("fail");
    expect((result.details as any).warningCount).toBe(1);
  });

  test("error on invalid JSON output", async () => {
    const result = await runEslintGate(
      cfg(fakeRunner({ exitCode: 1, stdout: "totally not json" })),
    );
    expect(result.status).toBe("error");
    expect((result.details as any).parseError).toContain("JSON.parse");
  });

  test("error on timeout", async () => {
    const result = await runEslintGate(
      cfg(fakeRunner({ timedOut: true })),
    );
    expect(result.status).toBe("error");
    expect((result.details as any).parseError).toContain("timed out");
  });

  test("empty stdout + exit 0 → pass", async () => {
    const result = await runEslintGate(
      cfg(fakeRunner({ exitCode: 0, stdout: "" })),
    );
    expect(result.status).toBe("pass");
  });

  test("topMessages caps at 15", async () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({
      ruleId: `r${i}`,
      severity: 2 as const,
      message: `m${i}`,
    }));
    const output = JSON.stringify([
      { filePath: "/repo/x.ts", messages, errorCount: 25, warningCount: 0 },
    ]);
    const result = await runEslintGate(
      cfg(fakeRunner({ exitCode: 1, stdout: output })),
    );
    expect((result.details as any).topMessages).toHaveLength(15);
    expect((result.details as any).errorCount).toBe(25);
  });

  test("filesWithIssues counts files having any errors or warnings", async () => {
    const output = JSON.stringify([
      { filePath: "/a.ts", messages: [], errorCount: 0, warningCount: 0 },
      { filePath: "/b.ts", messages: [{ ruleId: "r", severity: 2, message: "m" }], errorCount: 1, warningCount: 0 },
      { filePath: "/c.ts", messages: [{ ruleId: "r", severity: 1, message: "m" }], errorCount: 0, warningCount: 1 },
    ]);
    const result = await runEslintGate(
      cfg(fakeRunner({ exitCode: 1, stdout: output })),
    );
    expect((result.details as any).filesWithIssues).toBe(2);
  });

  test("writes output.json evidence", async () => {
    const output = JSON.stringify([{ filePath: "/x.ts", messages: [] }]);
    const result = await runEslintGate(
      cfg(fakeRunner({ exitCode: 0, stdout: output })),
    );
    expect(result.artifacts).toHaveLength(1);
    const body = await fs.readFile(result.artifacts[0]!, "utf8");
    expect(body).toContain("filePath");
  });
});
