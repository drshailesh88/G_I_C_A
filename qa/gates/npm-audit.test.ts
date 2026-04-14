import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runNpmAuditGate, NPM_AUDIT_GATE_ID } from "./npm-audit.js";
import type { CommandOutcome, GateConfig, RunCommandFn } from "./base.js";

let evidenceDir: string;
beforeEach(async () => {
  evidenceDir = join(tmpdir(), `npmaudit-${randomBytes(6).toString("hex")}`);
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
  return { runId: "run-1", workingDir: "/repo", evidenceDir, runCommand: runner };
}

describe("runNpmAuditGate", () => {
  test("pass when no high/critical vulnerabilities", async () => {
    const report = {
      metadata: {
        vulnerabilities: { info: 0, low: 2, moderate: 1, high: 0, critical: 0, total: 3 },
      },
      vulnerabilities: {},
    };
    const result = await runNpmAuditGate(cfg(fakeRunner({ exitCode: 1, stdout: JSON.stringify(report) })));
    expect(result.status).toBe("pass");
    expect(result.gateId).toBe(NPM_AUDIT_GATE_ID);
    const details = result.details as any;
    expect(details.low).toBe(2);
    expect(details.moderate).toBe(1);
  });

  test("fail when high vulnerabilities present", async () => {
    const report = {
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 2, critical: 0, total: 2 },
      },
      vulnerabilities: { "lodash": {} },
    };
    const result = await runNpmAuditGate(cfg(fakeRunner({ exitCode: 1, stdout: JSON.stringify(report) })));
    expect(result.status).toBe("fail");
    expect((result.details as any).high).toBe(2);
  });

  test("fail when critical vulnerabilities present", async () => {
    const report = {
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 1, total: 1 },
      },
    };
    const result = await runNpmAuditGate(cfg(fakeRunner({ exitCode: 1, stdout: JSON.stringify(report) })));
    expect(result.status).toBe("fail");
  });

  test("pass when no vulnerabilities at all", async () => {
    const report = {
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
      },
      vulnerabilities: {},
    };
    const result = await runNpmAuditGate(cfg(fakeRunner({ exitCode: 0, stdout: JSON.stringify(report) })));
    expect(result.status).toBe("pass");
    expect((result.details as any).total).toBe(0);
  });

  test("records top package names", async () => {
    const report = {
      metadata: { vulnerabilities: { critical: 1, high: 0, moderate: 0, low: 0, info: 0, total: 1 } },
      vulnerabilities: {
        "pkg-a": {},
        "pkg-b": {},
        "pkg-c": {},
      },
    };
    const result = await runNpmAuditGate(cfg(fakeRunner({ exitCode: 1, stdout: JSON.stringify(report) })));
    expect((result.details as any).topPackages).toEqual(["pkg-a", "pkg-b", "pkg-c"]);
  });

  test("error on invalid JSON", async () => {
    const result = await runNpmAuditGate(cfg(fakeRunner({ exitCode: 1, stdout: "not json" })));
    expect(result.status).toBe("error");
    expect((result.details as any).parseError).toContain("JSON.parse");
  });

  test("error on timeout", async () => {
    const result = await runNpmAuditGate(cfg(fakeRunner({ timedOut: true })));
    expect(result.status).toBe("error");
  });

  test("handles missing metadata gracefully", async () => {
    const result = await runNpmAuditGate(cfg(fakeRunner({ exitCode: 0, stdout: "{}" })));
    expect(result.status).toBe("pass");
    expect((result.details as any).total).toBe(0);
  });

  test("writes JSON evidence", async () => {
    const report = { metadata: { vulnerabilities: { high: 0, critical: 0, moderate: 0, low: 0, info: 0, total: 0 } } };
    const result = await runNpmAuditGate(cfg(fakeRunner({ exitCode: 0, stdout: JSON.stringify(report) })));
    expect(result.artifacts).toHaveLength(1);
  });
});
