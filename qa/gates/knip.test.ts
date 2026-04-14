import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runKnipGate, KNIP_GATE_ID } from "./knip.js";
import type { CommandOutcome, GateConfig, RunCommandFn } from "./base.js";

let evidenceDir: string;
beforeEach(async () => {
  evidenceDir = join(tmpdir(), `knip-${randomBytes(6).toString("hex")}`);
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

describe("runKnipGate", () => {
  test("pass when no unused anything", async () => {
    const output = JSON.stringify({ files: [], issues: [] });
    const result = await runKnipGate(cfg(fakeRunner({ exitCode: 0, stdout: output })));
    expect(result.status).toBe("pass");
    expect(result.gateId).toBe(KNIP_GATE_ID);
    expect((result.details as any).unusedFilesCount).toBe(0);
  });

  test("fail when unused files present", async () => {
    const output = JSON.stringify({
      files: ["src/dead.ts", "src/orphan.ts"],
      issues: [],
    });
    const result = await runKnipGate(cfg(fakeRunner({ exitCode: 1, stdout: output })));
    expect(result.status).toBe("fail");
    expect((result.details as any).unusedFilesCount).toBe(2);
    expect((result.details as any).unusedFiles).toEqual(["src/dead.ts", "src/orphan.ts"]);
  });

  test("fail when unused exports present", async () => {
    const output = JSON.stringify({
      files: [],
      issues: [
        {
          file: "src/lib.ts",
          exports: [{ name: "unusedFn" }, { name: "anotherUnused" }],
          types: [],
          dependencies: [],
          devDependencies: [],
        },
      ],
    });
    const result = await runKnipGate(cfg(fakeRunner({ exitCode: 1, stdout: output })));
    expect(result.status).toBe("fail");
    expect((result.details as any).unusedExportsCount).toBe(2);
  });

  test("fail when unused dependencies present", async () => {
    const output = JSON.stringify({
      files: [],
      issues: [
        {
          file: "package.json",
          dependencies: [{ name: "unused-lib" }],
          devDependencies: [{ name: "unused-dev" }, { name: "also-unused" }],
        },
      ],
    });
    const result = await runKnipGate(cfg(fakeRunner({ exitCode: 1, stdout: output })));
    expect(result.status).toBe("fail");
    expect((result.details as any).unusedDependenciesCount).toBe(1);
    expect((result.details as any).unusedDevDependenciesCount).toBe(2);
  });

  test("counts duplicates and unlisted", async () => {
    const output = JSON.stringify({
      files: [],
      issues: [
        {
          file: "src/a.ts",
          duplicates: [{ name: "x" }, { name: "y" }],
          unlisted: [{ name: "z" }],
        },
      ],
    });
    const result = await runKnipGate(cfg(fakeRunner({ exitCode: 1, stdout: output })));
    expect(result.status).toBe("fail");
    expect((result.details as any).duplicatesCount).toBe(2);
    expect((result.details as any).unlistedCount).toBe(1);
  });

  test("error on invalid JSON", async () => {
    const result = await runKnipGate(cfg(fakeRunner({ exitCode: 1, stdout: "not json" })));
    expect(result.status).toBe("error");
    expect((result.details as any).parseError).toContain("JSON.parse");
  });

  test("error on timeout", async () => {
    const result = await runKnipGate(cfg(fakeRunner({ timedOut: true })));
    expect(result.status).toBe("error");
    expect((result.details as any).parseError).toContain("timed out");
  });

  test("writes evidence", async () => {
    const output = JSON.stringify({ files: ["src/x.ts"], issues: [] });
    const result = await runKnipGate(cfg(fakeRunner({ exitCode: 1, stdout: output })));
    expect(result.artifacts).toHaveLength(1);
    const body = await fs.readFile(result.artifacts[0]!, "utf8");
    expect(body).toContain("files");
  });
});
