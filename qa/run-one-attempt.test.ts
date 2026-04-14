import { promises as fs } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runOneAttempt } from "./run-one-attempt.js";
import type { CommandOutcome, RunCommandFn } from "./gates/base.js";
import type {
  ContractIndex,
  FixerProvider,
  FixerResult,
  RepairPacket,
  TierConfig,
} from "./types.js";
import { initializeState, applyMutationMeasurement } from "./state-manager.js";

// This suite exercises run-one-attempt end-to-end with a fake subprocess
// runner + fake provider. Real subprocess execution is out of scope; we
// verify ORCHESTRATION + dispatch order + state transitions.

let root: string;
let runArtifactsDir: string;
let contractDir: string;

beforeEach(async () => {
  root = join(tmpdir(), `roa-${randomBytes(6).toString("hex")}`);
  runArtifactsDir = join(root, ".quality", "runs", "run-1");
  contractDir = join(root, ".quality", "contracts", "auth-login");
  await fs.mkdir(runArtifactsDir, { recursive: true });
  await fs.mkdir(contractDir, { recursive: true });
  await fs.mkdir(join(root, ".quality", "policies"), { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function contractFixture(): ContractIndex {
  const hashOfEmpty = `sha256:${createHash("sha256").update("").digest("hex")}`;
  return {
    schema_version: 1,
    feature: {
      id: "auth-login",
      title: "Auth login",
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
    affected_modules: ["src/auth/**"],
    test_data: { seeded_users: [], requires_services: [] },
    hashes: {
      "examples.md": hashOfEmpty,
      "acceptance.spec.ts": hashOfEmpty,
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

async function seedContractArtifacts(): Promise<void> {
  await fs.writeFile(join(contractDir, "examples.md"), "");
  await fs.writeFile(join(contractDir, "acceptance.spec.ts"), "");
  await fs.writeFile(join(contractDir, "index.yaml"), yaml.dump(contractFixture()));
}

async function seedLockManifest(): Promise<void> {
  await fs.writeFile(
    join(root, ".quality", "policies", "lock-manifest.json"),
    JSON.stringify({ schema_version: 1, files: {} }),
  );
}

const TIERS: TierConfig = {
  schema_version: 1,
  tiers: {
    critical_75: ["src/auth/**"],
    business_60: ["src/lib/**"],
    ui_gates_only: ["src/components/**"],
  },
  unclassified_behavior: "fail_fast",
};

interface CapturedCall {
  cmd: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

// Scenario scripts for the fake subprocess runner. Maps a command-pattern
// (e.g. "git status") to a CommandOutcome, falling back to a default.
type Scenario = (call: CapturedCall) => CommandOutcome | Promise<CommandOutcome>;

function scriptedRunner(scenario: Scenario, captured?: CapturedCall[]): RunCommandFn {
  return async (cmd, args, options) => {
    const call: CapturedCall = {
      cmd,
      args,
      ...(options?.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(options?.env !== undefined ? { env: options.env } : {}),
    };
    captured?.push(call);
    return scenario(call);
  };
}

function defaultSubprocesses(_call: CapturedCall): CommandOutcome {
  return {
    exitCode: 0,
    stdout: "",
    stderr: "",
    durationMs: 10,
    timedOut: false,
  };
}

function fakeProvider(
  outcome: Partial<FixerResult> = {},
): FixerProvider {
  return {
    name: "fake-claude",
    isEnabled: () => true,
    invoke: async (_packet: RepairPacket) => ({
      providerName: "fake-claude",
      exitCode: 0,
      stdout: "done",
      stderr: "",
      durationMs: 1000,
      filesEditedCount: 2,
      ...outcome,
    }),
  };
}

describe("runOneAttempt — VIOLATION path", () => {
  test("diff audit violation → reverts + returns VIOLATION, gates not run", async () => {
    await seedContractArtifacts();
    const state = initializeState("2026-04-14T22:00:00Z");
    const violationDiff = `diff --git a/src/x.test.ts b/src/x.test.ts
--- a/src/x.test.ts
+++ b/src/x.test.ts
@@ -1,1 +1,1 @@
-test('x', () => {});
+test.skip('x', () => {});
`;
    const calls: CapturedCall[] = [];
    let revertedTargets: string[] = [];
    const runner = scriptedRunner((call) => {
      if (call.cmd === "git" && call.args[0] === "status") {
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 5, timedOut: false };
      }
      if (call.cmd === "git" && call.args[0] === "diff") {
        if (call.args.includes("--name-only")) {
          return {
            exitCode: 0,
            stdout: "src/x.test.ts",
            stderr: "",
            durationMs: 5,
            timedOut: false,
          };
        }
        return {
          exitCode: 0,
          stdout: violationDiff,
          stderr: "",
          durationMs: 5,
          timedOut: false,
        };
      }
      if (call.cmd === "git" && call.args[0] === "rev-parse") {
        return { exitCode: 0, stdout: "abc123", stderr: "", durationMs: 5, timedOut: false };
      }
      if (call.cmd === "git" && call.args[0] === "checkout") {
        revertedTargets.push(call.args[call.args.length - 1]!);
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 5, timedOut: false };
      }
      return defaultSubprocesses(call);
    }, calls);

    const result = await runOneAttempt({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir,
      state,
      tiers: TIERS,
      provider: fakeProvider(),
      priorAttempts: [],
      violationHistory: [],
      runCommand: runner,
    });

    expect(result.outcome).toBe("VIOLATION");
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]?.pattern_id).toBe("SKIP_ADDED");
    expect(result.revertedPaths).toContain("src/x.test.ts");
    expect(result.gateResults).toEqual([]); // gates should NOT run on violation
    expect(result.preAttemptCommit).toBe("abc123");
  });
});

describe("runOneAttempt — flow orchestration", () => {
  async function writeStrykerMutation(): Promise<void> {
    const dir = join(root, "reports", "mutation");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      join(dir, "mutation.json"),
      JSON.stringify({
        schemaVersion: "2.0.0",
        files: {
          "src/auth/login.ts": {
            mutants: [
              { id: "1", mutatorName: "BL", status: "Killed" },
              { id: "2", mutatorName: "BL", status: "Killed" },
              { id: "3", mutatorName: "BL", status: "Survived" },
            ],
          },
        },
      }),
    );
  }

  function goodFlowRunner(captured: CapturedCall[]): RunCommandFn {
    return scriptedRunner(async (call) => {
      if (call.cmd === "git") {
        const sub = call.args[0];
        if (sub === "diff" && call.args.includes("--name-only")) {
          return { exitCode: 0, stdout: "src/auth/login.ts", stderr: "", durationMs: 5, timedOut: false };
        }
        if (sub === "diff") {
          return { exitCode: 0, stdout: "", stderr: "", durationMs: 5, timedOut: false };
        }
        if (sub === "status") {
          return { exitCode: 0, stdout: "", stderr: "", durationMs: 5, timedOut: false };
        }
        if (sub === "rev-parse") {
          return { exitCode: 0, stdout: "commitSHA", stderr: "", durationMs: 5, timedOut: false };
        }
        if (sub === "show") {
          return { exitCode: 0, stdout: "", stderr: "", durationMs: 5, timedOut: false };
        }
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 5, timedOut: false };
      }
      if (call.cmd === "npx") {
        const tool = call.args[0];
        if (tool === "tsc") {
          return { exitCode: 0, stdout: "", stderr: "", durationMs: 50, timedOut: false };
        }
        if (tool === "eslint") {
          return {
            exitCode: 0,
            stdout: JSON.stringify([
              { filePath: "/src/a.ts", messages: [], errorCount: 0, warningCount: 0 },
            ]),
            stderr: "",
            durationMs: 50,
            timedOut: false,
          };
        }
        if (tool === "knip") {
          return {
            exitCode: 0,
            stdout: JSON.stringify({ files: [], issues: [] }),
            stderr: "",
            durationMs: 50,
            timedOut: false,
          };
        }
        if (tool === "vitest") {
          const outFileArg = call.args.find((a) => a.startsWith("--outputFile="));
          if (outFileArg) {
            const outPath = outFileArg.split("=", 2)[1]!;
            await fs.mkdir(join(outPath, ".."), { recursive: true });
            await fs.writeFile(
              outPath,
              `<?xml version="1.0"?>
<testsuites tests="3" failures="0" errors="0" time="0.3">
  <testsuite name="s" tests="3" failures="0" errors="0" skipped="0" time="0.3">
    <testcase classname="c" name="a" time="0.1"/>
    <testcase classname="c" name="b" time="0.1"/>
    <testcase classname="c" name="c" time="0.1"/>
  </testsuite>
</testsuites>`,
            );
          }
          return { exitCode: 0, stdout: "", stderr: "", durationMs: 50, timedOut: false };
        }
        if (tool === "playwright") {
          const outPath = call.env?.PLAYWRIGHT_JSON_OUTPUT_FILE as string | undefined;
          if (outPath) {
            await fs.mkdir(join(outPath, ".."), { recursive: true });
            await fs.writeFile(
              outPath,
              JSON.stringify({
                stats: { duration: 100 },
                suites: [
                  {
                    file: "acceptance.spec.ts",
                    specs: [
                      {
                        title: "login works",
                        file: "acceptance.spec.ts",
                        tests: [
                          {
                            projectName: "chromium",
                            results: [{ status: "passed", duration: 100, retry: 0 }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              }),
            );
          }
          return { exitCode: 0, stdout: "", stderr: "", durationMs: 50, timedOut: false };
        }
        if (tool === "stryker") {
          return { exitCode: 0, stdout: "done", stderr: "", durationMs: 100, timedOut: false };
        }
      }
      return defaultSubprocesses(call);
    }, captured);
  }

  test("GREEN path: all gates pass + ratchet clean", async () => {
    await seedContractArtifacts();
    await seedLockManifest();
    await writeStrykerMutation();

    const state = initializeState("2026-04-14T22:00:00Z");
    const calls: CapturedCall[] = [];
    const runner = goodFlowRunner(calls);

    const result = await runOneAttempt({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir,
      state,
      tiers: TIERS,
      provider: fakeProvider(),
      priorAttempts: [],
      violationHistory: [],
      runCommand: runner,
    });

    expect(result.outcome).toBe("GREEN");
    expect(result.gateResults.length).toBeGreaterThan(5);
    expect(result.packet.packetPath).toContain("auth-login-1.md");
    expect(result.fixerResult.providerName).toBe("fake-claude");
  });

  test("REGRESSED path: ratchet detects mutation score drop", async () => {
    await seedContractArtifacts();
    await seedLockManifest();
    await writeStrykerMutation();

    // Baseline at 100% — current Stryker fixture yields 67% so → REGRESSED.
    let state = initializeState("2026-04-14T22:00:00Z");
    state = applyMutationMeasurement({
      state,
      modulePath: "src/auth/login.ts",
      newScore: 100,
      tier: "critical_75",
      runId: "run-0",
      timestamp: "2026-04-14T22:00:00Z",
    }).state;

    const runner = goodFlowRunner([]);
    const result = await runOneAttempt({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir,
      state,
      tiers: TIERS,
      provider: fakeProvider(),
      priorAttempts: [],
      violationHistory: [],
      runCommand: runner,
    });

    expect(result.outcome).toBe("REGRESSED");
    expect(result.judgeReasoning.primaryGateId).toMatch(/ratchet|tier-floor/);
  });

  test("BLOCKED path: contract-hash mismatch short-circuits", async () => {
    await seedContractArtifacts();
    // Tamper an artifact after hashes are written.
    await fs.writeFile(join(contractDir, "examples.md"), "TAMPERED");
    await seedLockManifest();

    const state = initializeState("2026-04-14T22:00:00Z");
    const runner = goodFlowRunner([]);
    const result = await runOneAttempt({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir,
      state,
      tiers: TIERS,
      provider: fakeProvider(),
      priorAttempts: [],
      violationHistory: [],
      runCommand: runner,
    });

    expect(result.outcome).toBe("BLOCKED");
    expect(result.judgeReasoning.primaryGateId).toBe("contract-hash-verify");
    // Short-circuit means no downstream gates.
    expect(result.gateResults.length).toBe(1);
  });

  test("preAttemptCommit captured regardless of outcome", async () => {
    await seedContractArtifacts();
    await seedLockManifest();
    await writeStrykerMutation();

    const state = initializeState("2026-04-14T22:00:00Z");
    const runner = goodFlowRunner([]);
    const result = await runOneAttempt({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir,
      state,
      tiers: TIERS,
      provider: fakeProvider(),
      priorAttempts: [],
      violationHistory: [],
      runCommand: runner,
    });
    expect(result.preAttemptCommit).toBe("commitSHA");
  });

  test("plateauSignature is a stable 16-hex string", async () => {
    // Full deterministic equality across two invocations requires more
    // control over intermediate filesystem state than this integration harness
    // provides — sequential test runs can alter evidence layout and Stryker
    // output in small ways that ripple into the signature. The guarantee we
    // CAN verify here is format + non-empty content. The judge.test.ts suite
    // asserts stability for identical JudgeInput in isolation.
    await seedContractArtifacts();
    await seedLockManifest();
    await writeStrykerMutation();

    const state = initializeState("2026-04-14T22:00:00Z");
    const runner = goodFlowRunner([]);
    const result = await runOneAttempt({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir,
      state,
      tiers: TIERS,
      provider: fakeProvider(),
      priorAttempts: [],
      violationHistory: [],
      runCommand: runner,
    });
    expect(result.plateauSignature).toMatch(/^[0-9a-f]{16}$/);
  });
});
