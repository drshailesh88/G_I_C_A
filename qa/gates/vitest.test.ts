import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runVitestGate, VITEST_GATE_IDS } from "./vitest.js";
import type { CommandOutcome, GateConfig, RunCommandFn } from "./base.js";

let root: string;
beforeEach(async () => {
  root = join(tmpdir(), `vitest-gate-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(join(root, "evidence"), { recursive: true });
});
afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

/**
 * Fake runner: accepts a function that, given the JUnit output path, writes
 * an XML fixture and returns a command outcome.
 */
function runnerWritesJunit(
  xml: string,
  outcome: Partial<CommandOutcome> = {},
): RunCommandFn {
  return async (_command, args) => {
    const outFileArg = args.find((a) => a.startsWith("--outputFile="));
    if (outFileArg) {
      const outPath = outFileArg.split("=", 2)[1]!;
      await fs.mkdir(join(outPath, ".."), { recursive: true });
      await fs.writeFile(outPath, xml);
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

function cfg(runner: RunCommandFn, mode: "unit" | "integration" | "all" = "unit"): Parameters<typeof runVitestGate>[0] {
  return {
    runId: "run-1",
    workingDir: root,
    evidenceDir: join(root, "evidence"),
    runCommand: runner,
    mode,
  };
}

const PASSING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="2" failures="0" errors="0" time="0.1">
  <testsuite name="s" tests="2" failures="0" errors="0" skipped="0" time="0.1">
    <testcase classname="c" name="a" time="0.05"/>
    <testcase classname="c" name="b" time="0.05"/>
  </testsuite>
</testsuites>`;

const FAILING_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="2" failures="1" errors="0" time="0.1">
  <testsuite name="s" tests="2" failures="1" errors="0" skipped="0" time="0.1">
    <testcase classname="c" name="a" time="0.05"/>
    <testcase classname="c" name="b" time="0.05">
      <failure message="boom" type="AssertionError">stack</failure>
    </testcase>
  </testsuite>
</testsuites>`;

const SKIPPED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="2" failures="0" errors="0" time="0.1">
  <testsuite name="s" tests="2" failures="0" errors="0" skipped="1" time="0.1">
    <testcase classname="c" name="a" time="0.05"/>
    <testcase classname="c" name="b" time="0.05"><skipped/></testcase>
  </testsuite>
</testsuites>`;

describe("runVitestGate", () => {
  test("pass with all green", async () => {
    const result = await runVitestGate(cfg(runnerWritesJunit(PASSING_XML)));
    expect(result.status).toBe("pass");
    expect(result.gateId).toBe(VITEST_GATE_IDS.unit);
    expect((result.details as any).passed).toBe(2);
    expect((result.details as any).failed).toBe(0);
  });

  test("fail when any test failed", async () => {
    const result = await runVitestGate(
      cfg(runnerWritesJunit(FAILING_XML, { exitCode: 1 })),
    );
    expect(result.status).toBe("fail");
    expect((result.details as any).failed).toBe(1);
    expect((result.details as any).failures).toHaveLength(1);
  });

  test("fail when any test skipped (α strategy)", async () => {
    const result = await runVitestGate(cfg(runnerWritesJunit(SKIPPED_XML)));
    expect(result.status).toBe("fail");
    expect((result.details as any).skipped).toBe(1);
  });

  test("error on timeout", async () => {
    const result = await runVitestGate(
      cfg(runnerWritesJunit(PASSING_XML, { timedOut: true })),
    );
    expect(result.status).toBe("error");
    expect((result.details as any).parseError).toContain("timed out");
  });

  test("error when JUnit output missing", async () => {
    // Runner does not write the output file.
    const runner: RunCommandFn = async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 100,
      timedOut: false,
    });
    const result = await runVitestGate(cfg(runner));
    expect(result.status).toBe("error");
    expect((result.details as any).parseError).toBeDefined();
  });

  test("mode=integration → integration gate id", async () => {
    const result = await runVitestGate(
      cfg(runnerWritesJunit(PASSING_XML), "integration"),
    );
    expect(result.gateId).toBe(VITEST_GATE_IDS.integration);
  });

  test("includes --project flag for unit mode", async () => {
    let capturedArgs: string[] = [];
    const runner: RunCommandFn = async (_cmd, args) => {
      capturedArgs = args;
      const outFileArg = args.find((a) => a.startsWith("--outputFile="));
      if (outFileArg) {
        const outPath = outFileArg.split("=", 2)[1]!;
        await fs.mkdir(join(outPath, ".."), { recursive: true });
        await fs.writeFile(outPath, PASSING_XML);
      }
      return { exitCode: 0, stdout: "", stderr: "", durationMs: 100, timedOut: false };
    };
    await runVitestGate(cfg(runner, "unit"));
    expect(capturedArgs).toContain("--project");
    expect(capturedArgs).toContain("unit");
  });

  test("writes stdout + junit artifacts", async () => {
    const result = await runVitestGate(cfg(runnerWritesJunit(PASSING_XML)));
    expect(result.artifacts.length).toBeGreaterThanOrEqual(2);
    expect(result.artifacts.some((p) => p.endsWith("stdout.txt"))).toBe(true);
    expect(result.artifacts.some((p) => p.endsWith("junit.xml"))).toBe(true);
  });
});
