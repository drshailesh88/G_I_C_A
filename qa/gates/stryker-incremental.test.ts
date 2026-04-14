import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  computeMutateGlobs,
  runStrykerIncrementalGate,
  STRYKER_INCREMENTAL_GATE_ID,
} from "./stryker-incremental.js";
import type { CommandOutcome, GateConfig, RunCommandFn } from "./base.js";
import type { ContractIndex } from "../types.js";

let root: string;
beforeEach(async () => {
  root = join(tmpdir(), `stryker-gate-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(join(root, "evidence"), { recursive: true });
});
afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function cfg(runner: RunCommandFn): GateConfig {
  return {
    runId: "run-1",
    workingDir: root,
    evidenceDir: join(root, "evidence"),
    runCommand: runner,
  };
}

function baseContract(): ContractIndex {
  return {
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
      acceptance_tests: 1,
      regression_tests: 0,
    },
    affected_modules: ["src/auth/**", "src/lib/session.ts"],
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
}

async function writeMutationJson(): Promise<string> {
  const mutPath = join(root, "reports", "mutation", "mutation.json");
  await fs.mkdir(join(mutPath, ".."), { recursive: true });
  await fs.writeFile(
    mutPath,
    JSON.stringify({
      schemaVersion: "2.0.0",
      files: {
        "src/auth/login.ts": {
          mutants: [
            { id: "1", mutatorName: "BL", status: "Killed" },
            { id: "2", mutatorName: "BL", status: "Survived" },
          ],
        },
      },
    }),
  );
  return mutPath;
}

// ─── computeMutateGlobs ──────────────────────────────────────────────────────

describe("computeMutateGlobs (T4)", () => {
  test("intersects scope with candidates", () => {
    const scope = ["src/auth/**", "src/lib/session.ts"];
    const candidates = [
      "src/auth/login.ts",
      "src/ui/Button.tsx",
      "src/lib/session.ts",
    ];
    expect(computeMutateGlobs(scope, candidates)).toEqual([
      "src/auth/login.ts",
      "src/lib/session.ts",
    ]);
  });

  test("candidate must match at least one scope glob", () => {
    expect(computeMutateGlobs(["src/auth/**"], ["src/lib/foo.ts"])).toEqual([]);
  });

  test("deduplicates candidates", () => {
    expect(
      computeMutateGlobs(["src/**"], ["src/a.ts", "src/a.ts", "src/b.ts"]),
    ).toEqual(["src/a.ts", "src/b.ts"]);
  });

  test("empty candidates → empty output", () => {
    expect(computeMutateGlobs(["src/**"], [])).toEqual([]);
  });

  test("empty scope → empty output", () => {
    expect(computeMutateGlobs([], ["src/a.ts"])).toEqual([]);
  });
});

// ─── runStrykerIncrementalGate ───────────────────────────────────────────────

describe("runStrykerIncrementalGate", () => {
  test("skipped when no files intersect scope", async () => {
    const runner: RunCommandFn = async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 0,
      timedOut: false,
    });
    const result = await runStrykerIncrementalGate({
      config: cfg(runner),
      contract: baseContract(),
      changedPaths: ["src/ui/Button.tsx"], // outside scope
    });
    expect(result.status).toBe("skipped");
    expect(result.gateId).toBe(STRYKER_INCREMENTAL_GATE_ID);
    expect((result.details as any).skipReason).toMatch(/no files to mutate/);
  });

  test("runs stryker and parses results", async () => {
    await writeMutationJson();
    let capturedArgs: string[] = [];
    const runner: RunCommandFn = async (_cmd, args) => {
      capturedArgs = args;
      return { exitCode: 0, stdout: "done", stderr: "", durationMs: 100, timedOut: false };
    };
    const result = await runStrykerIncrementalGate({
      config: cfg(runner),
      contract: baseContract(),
      changedPaths: ["src/auth/login.ts"],
    });
    expect(result.status).toBe("pass");
    expect(capturedArgs).toContain("--incremental");
    expect(capturedArgs).toContain("--mutate");
    expect(capturedArgs).toContain("src/auth/login.ts");
    const details = result.details as any;
    expect(details.mutateGlobs).toEqual(["src/auth/login.ts"]);
    expect(details.overallScore).toBe(50); // 1 killed / 2 scorable
    expect(details.perFileSummary).toHaveLength(1);
  });

  test("honors reverse-deps injection", async () => {
    await writeMutationJson();
    let capturedArgs: string[] = [];
    const runner: RunCommandFn = async (_cmd, args) => {
      capturedArgs = args;
      return { exitCode: 0, stdout: "", stderr: "", durationMs: 100, timedOut: false };
    };
    const result = await runStrykerIncrementalGate({
      config: cfg(runner),
      contract: baseContract(),
      changedPaths: ["tests/unit/auth.test.ts"], // outside scope directly
      getReverseDeps: async () => ["src/auth/login.ts"],
    });
    expect(result.status).toBe("pass");
    const details = result.details as any;
    expect(details.mutateGlobs).toEqual(["src/auth/login.ts"]);
    expect(capturedArgs).toContain("src/auth/login.ts");
  });

  test("error on timeout", async () => {
    await writeMutationJson();
    const runner: RunCommandFn = async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 600_000,
      timedOut: true,
    });
    const result = await runStrykerIncrementalGate({
      config: cfg(runner),
      contract: baseContract(),
      changedPaths: ["src/auth/login.ts"],
    });
    expect(result.status).toBe("error");
    expect((result.details as any).parseError).toContain("timed out");
  });

  test("fail on non-zero exit from stryker", async () => {
    await writeMutationJson();
    const runner: RunCommandFn = async () => ({
      exitCode: 1,
      stdout: "stryker crashed",
      stderr: "err",
      durationMs: 100,
      timedOut: false,
    });
    const result = await runStrykerIncrementalGate({
      config: cfg(runner),
      contract: baseContract(),
      changedPaths: ["src/auth/login.ts"],
    });
    expect(result.status).toBe("fail");
  });

  test("error when mutation.json missing", async () => {
    // Do not write mutation.json.
    const runner: RunCommandFn = async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 100,
      timedOut: false,
    });
    const result = await runStrykerIncrementalGate({
      config: cfg(runner),
      contract: baseContract(),
      changedPaths: ["src/auth/login.ts"],
    });
    expect(result.status).toBe("error");
    expect((result.details as any).parseError).toContain("mutation.json");
  });

  test("uses custom mutation + incremental paths", async () => {
    const mutPath = join(root, "custom", "mutation.json");
    await fs.mkdir(join(mutPath, ".."), { recursive: true });
    await fs.writeFile(
      mutPath,
      JSON.stringify({
        schemaVersion: "2.0.0",
        files: {
          "src/auth/login.ts": {
            mutants: [{ id: "1", mutatorName: "BL", status: "Killed" }],
          },
        },
      }),
    );
    const runner: RunCommandFn = async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 100,
      timedOut: false,
    });
    const result = await runStrykerIncrementalGate({
      config: cfg(runner),
      contract: baseContract(),
      changedPaths: ["src/auth/login.ts"],
      mutationJsonPath: mutPath,
    });
    expect(result.status).toBe("pass");
  });
});
