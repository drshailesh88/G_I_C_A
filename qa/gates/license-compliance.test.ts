import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  runLicenseComplianceGate,
  LICENSE_COMPLIANCE_GATE_ID,
  DEFAULT_FORBIDDEN_LICENSES,
} from "./license-compliance.js";
import type { CommandOutcome, GateConfig, RunCommandFn } from "./base.js";

let evidenceDir: string;
beforeEach(async () => {
  evidenceDir = join(tmpdir(), `license-${randomBytes(6).toString("hex")}`);
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

describe("runLicenseComplianceGate", () => {
  test("pass when all licenses are allowed", async () => {
    const report = {
      "react@19.0.0": { licenses: "MIT" },
      "next@15.0.0": { licenses: "MIT", repository: "https://github.com/vercel/next.js" },
      "zod@3.23.8": { licenses: "MIT" },
    };
    const result = await runLicenseComplianceGate({
      config: cfg(fakeRunner({ exitCode: 0, stdout: JSON.stringify(report) })),
    });
    expect(result.status).toBe("pass");
    expect(result.gateId).toBe(LICENSE_COMPLIANCE_GATE_ID);
    const details = result.details as any;
    expect(details.packagesChecked).toBe(3);
    expect(details.violations).toEqual([]);
  });

  test("fail on GPL-3.0 dependency", async () => {
    const report = {
      "nasty-pkg@1.0.0": {
        licenses: "GPL-3.0",
        repository: "https://github.com/bad/pkg",
      },
    };
    const result = await runLicenseComplianceGate({
      config: cfg(fakeRunner({ exitCode: 0, stdout: JSON.stringify(report) })),
    });
    expect(result.status).toBe("fail");
    const details = result.details as any;
    expect(details.violations).toHaveLength(1);
    expect(details.violations[0].package).toBe("nasty-pkg@1.0.0");
    expect(details.violations[0].license).toBe("GPL-3.0");
  });

  test("fail on AGPL-3.0", async () => {
    const report = { "bad@1.0.0": { licenses: "AGPL-3.0" } };
    const result = await runLicenseComplianceGate({
      config: cfg(fakeRunner({ exitCode: 0, stdout: JSON.stringify(report) })),
    });
    expect(result.status).toBe("fail");
  });

  test("fail on SSPL-1.0", async () => {
    const report = { "mongo@1.0.0": { licenses: "SSPL-1.0" } };
    const result = await runLicenseComplianceGate({
      config: cfg(fakeRunner({ exitCode: 0, stdout: JSON.stringify(report) })),
    });
    expect(result.status).toBe("fail");
  });

  test("unknown licenses tracked but do not fail by default", async () => {
    const report = {
      "unknown@1.0.0": { licenses: "UNKNOWN" },
      "ok@1.0.0": { licenses: "MIT" },
    };
    const result = await runLicenseComplianceGate({
      config: cfg(fakeRunner({ exitCode: 0, stdout: JSON.stringify(report) })),
    });
    expect(result.status).toBe("pass");
    expect((result.details as any).unknownLicenses).toHaveLength(1);
  });

  test("failOnUnknown=true flips status to fail", async () => {
    const report = { "unknown@1.0.0": { licenses: "UNKNOWN" } };
    const result = await runLicenseComplianceGate({
      config: cfg(fakeRunner({ exitCode: 0, stdout: JSON.stringify(report) })),
      failOnUnknown: true,
    });
    expect(result.status).toBe("fail");
  });

  test("handles 'MIT OR Apache-2.0' dual-license strings", async () => {
    const report = {
      "pkg@1.0.0": { licenses: "MIT OR Apache-2.0" },
    };
    const result = await runLicenseComplianceGate({
      config: cfg(fakeRunner({ exitCode: 0, stdout: JSON.stringify(report) })),
    });
    expect(result.status).toBe("pass");
  });

  test("handles array licenses", async () => {
    const report = {
      "pkg@1.0.0": { licenses: ["MIT", "Apache-2.0"] },
    };
    const result = await runLicenseComplianceGate({
      config: cfg(fakeRunner({ exitCode: 0, stdout: JSON.stringify(report) })),
    });
    expect(result.status).toBe("pass");
  });

  test("flags GPL-3.0 even inside parens like '(GPL-3.0)'", async () => {
    const report = {
      "pkg@1.0.0": { licenses: "(GPL-3.0)" },
    };
    const result = await runLicenseComplianceGate({
      config: cfg(fakeRunner({ exitCode: 0, stdout: JSON.stringify(report) })),
    });
    expect(result.status).toBe("fail");
  });

  test("custom forbidden list overrides default", async () => {
    const report = { "pkg@1.0.0": { licenses: "MIT" } };
    const result = await runLicenseComplianceGate({
      config: cfg(fakeRunner({ exitCode: 0, stdout: JSON.stringify(report) })),
      forbidden: ["MIT"],
    });
    expect(result.status).toBe("fail");
  });

  test("default forbidden list includes common copyleft licenses", () => {
    expect(DEFAULT_FORBIDDEN_LICENSES).toContain("GPL-3.0");
    expect(DEFAULT_FORBIDDEN_LICENSES).toContain("AGPL-3.0");
    expect(DEFAULT_FORBIDDEN_LICENSES).toContain("SSPL-1.0");
  });

  test("error on invalid JSON", async () => {
    const result = await runLicenseComplianceGate({
      config: cfg(fakeRunner({ exitCode: 1, stdout: "not json" })),
    });
    expect(result.status).toBe("error");
  });

  test("error on timeout", async () => {
    const result = await runLicenseComplianceGate({
      config: cfg(fakeRunner({ timedOut: true })),
    });
    expect(result.status).toBe("error");
  });
});
