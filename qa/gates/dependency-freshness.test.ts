import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  runDependencyFreshnessGate,
  DEPENDENCY_FRESHNESS_GATE_ID,
  classifyBump,
} from "./dependency-freshness.js";
import type { CommandOutcome, GateConfig, RunCommandFn } from "./base.js";

let evidenceDir: string;
beforeEach(async () => {
  evidenceDir = join(tmpdir(), `depfresh-${randomBytes(6).toString("hex")}`);
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

describe("classifyBump", () => {
  test("major bumps", () => {
    expect(classifyBump("1.2.3", "2.0.0")).toBe("major");
    expect(classifyBump("^1.2.3", "2.0.0")).toBe("major");
    expect(classifyBump("v0.5.0", "1.0.0")).toBe("major");
  });

  test("minor bumps", () => {
    expect(classifyBump("1.2.3", "1.3.0")).toBe("minor");
    expect(classifyBump("~1.2.3", "1.5.0")).toBe("minor");
  });

  test("patch bumps", () => {
    expect(classifyBump("1.2.3", "1.2.4")).toBe("patch");
  });

  test("same version → unknown", () => {
    expect(classifyBump("1.2.3", "1.2.3")).toBe("unknown");
  });

  test("downgrade → unknown", () => {
    expect(classifyBump("2.0.0", "1.0.0")).toBe("unknown");
  });

  test("unparseable → unknown", () => {
    expect(classifyBump("latest", "1.0.0")).toBe("unknown");
    expect(classifyBump("1.0", "1.0.1")).toBe("unknown");
  });
});

describe("runDependencyFreshnessGate", () => {
  test("pass on empty outdated output (everything fresh)", async () => {
    const result = await runDependencyFreshnessGate(
      cfg(fakeRunner({ exitCode: 0, stdout: "" })),
    );
    expect(result.status).toBe("pass");
    expect(result.gateId).toBe(DEPENDENCY_FRESHNESS_GATE_ID);
    expect((result.details as any).total).toBe(0);
  });

  test("pass on empty JSON object", async () => {
    const result = await runDependencyFreshnessGate(
      cfg(fakeRunner({ exitCode: 0, stdout: "{}" })),
    );
    expect(result.status).toBe("pass");
    expect((result.details as any).total).toBe(0);
  });

  test("categorizes outdated packages by bump kind", async () => {
    const outdated = {
      "pkg-a": { current: "1.2.3", wanted: "1.2.5", latest: "2.0.0" }, // major
      "pkg-b": { current: "1.2.3", wanted: "1.3.0", latest: "1.3.0" }, // minor
      "pkg-c": { current: "1.2.3", wanted: "1.2.4", latest: "1.2.4" }, // patch
      "pkg-d": { current: "?", wanted: "?", latest: "?" },             // unknown
    };
    const result = await runDependencyFreshnessGate(
      cfg(fakeRunner({ exitCode: 1, stdout: JSON.stringify(outdated) })),
    );
    expect(result.status).toBe("pass");
    const details = result.details as any;
    expect(details.majorCount).toBe(1);
    expect(details.minorCount).toBe(1);
    expect(details.patchCount).toBe(1);
    expect(details.unknownCount).toBe(1);
    expect(details.total).toBe(4);
  });

  test("warn-only semantics: always pass, never fail", async () => {
    const hugeList = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [
        `pkg-${i}`,
        { current: "1.0.0", wanted: "1.0.0", latest: "10.0.0" },
      ]),
    );
    const result = await runDependencyFreshnessGate(
      cfg(fakeRunner({ exitCode: 1, stdout: JSON.stringify(hugeList) })),
    );
    expect(result.status).toBe("pass");
    expect((result.details as any).majorCount).toBe(50);
  });

  test("error on timeout", async () => {
    const result = await runDependencyFreshnessGate(
      cfg(fakeRunner({ timedOut: true })),
    );
    expect(result.status).toBe("error");
  });

  test("error on invalid JSON", async () => {
    const result = await runDependencyFreshnessGate(
      cfg(fakeRunner({ exitCode: 1, stdout: "not json" })),
    );
    expect(result.status).toBe("error");
  });

  test("includes outdated list in details", async () => {
    const outdated = {
      react: { current: "18.0.0", wanted: "18.3.0", latest: "19.0.0" },
    };
    const result = await runDependencyFreshnessGate(
      cfg(fakeRunner({ exitCode: 1, stdout: JSON.stringify(outdated) })),
    );
    const details = result.details as any;
    expect(details.outdated).toHaveLength(1);
    expect(details.outdated[0].name).toBe("react");
    expect(details.outdated[0].bump).toBe("major");
  });
});
