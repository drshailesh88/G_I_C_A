import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runTscGate, TSC_GATE_ID } from "./tsc.js";
import type { CommandOutcome, GateConfig, RunCommandFn } from "./base.js";

let evidenceDir: string;
beforeEach(async () => {
  evidenceDir = join(tmpdir(), `tsc-${randomBytes(6).toString("hex")}`);
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

describe("runTscGate", () => {
  test("pass on exit 0 with no errors", async () => {
    const result = await runTscGate(cfg(fakeRunner({ exitCode: 0, stdout: "" })));
    expect(result.status).toBe("pass");
    expect(result.shortCircuit).toBe(false);
    expect(result.gateId).toBe(TSC_GATE_ID);
    expect((result.details as any).errorCount).toBe(0);
  });

  test("fail on error TSxxxx patterns in stdout", async () => {
    const output = `src/auth/login.ts(42,10): error TS2322: Type 'null' is not assignable to type 'string'.
src/auth/session.ts(10,1): error TS2304: Cannot find name 'badVar'.

Found 2 errors.`;
    const result = await runTscGate(cfg(fakeRunner({ exitCode: 1, stdout: output })));
    expect(result.status).toBe("fail");
    expect((result.details as any).errorCount).toBe(2);
    expect((result.details as any).firstErrors).toHaveLength(2);
  });

  test("collects errors from stderr too", async () => {
    const result = await runTscGate(
      cfg(fakeRunner({ exitCode: 1, stdout: "", stderr: "foo.ts(1,1): error TS1005: ';' expected." })),
    );
    expect(result.status).toBe("fail");
    expect((result.details as any).errorCount).toBe(1);
  });

  test("fail on exit != 0 even if no error lines matched", async () => {
    const result = await runTscGate(
      cfg(fakeRunner({ exitCode: 2, stdout: "something went wrong" })),
    );
    expect(result.status).toBe("fail");
  });

  test("fail on timeout", async () => {
    const result = await runTscGate(
      cfg(fakeRunner({ exitCode: 0, timedOut: true })),
    );
    expect(result.status).toBe("fail");
    expect((result.details as any).timedOut).toBe(true);
  });

  test("writes output evidence file", async () => {
    const output = "src/x.ts(1,1): error TS2304: Cannot find name 'y'.";
    const result = await runTscGate(cfg(fakeRunner({ exitCode: 1, stdout: output })));
    expect(result.artifacts).toHaveLength(1);
    const body = await fs.readFile(result.artifacts[0]!, "utf8");
    expect(body).toContain("TS2304");
  });

  test("firstErrors caps at 10", async () => {
    const lines = Array.from({ length: 20 }, (_, i) =>
      `file${i}.ts(1,1): error TS${i}: err`,
    ).join("\n");
    const result = await runTscGate(cfg(fakeRunner({ exitCode: 1, stdout: lines })));
    expect((result.details as any).firstErrors).toHaveLength(10);
    expect((result.details as any).errorCount).toBe(20);
  });
});
