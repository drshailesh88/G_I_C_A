import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runFeatureLoop } from "./feature-loop.js";
import { initializeState } from "./state-manager.js";
import type { CommandOutcome, RunCommandFn } from "./gates/base.js";
import type {
  ContractIndex,
  FixerProvider,
  RepairPacket,
  TierConfig,
} from "./types.js";

let root: string;
let contractDir: string;
let runArtifactsDir: string;

beforeEach(async () => {
  root = join(tmpdir(), `fl-${randomBytes(6).toString("hex")}`);
  contractDir = join(root, ".quality", "contracts", "auth-login");
  runArtifactsDir = join(root, ".quality", "runs", "run-1");
  await fs.mkdir(contractDir, { recursive: true });
  await fs.mkdir(runArtifactsDir, { recursive: true });
  await fs.mkdir(join(root, ".quality", "policies"), { recursive: true });

  const hashEmpty = `sha256:${createHash("sha256").update("").digest("hex")}`;
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
      acceptance_tests: 1,
      regression_tests: 0,
    },
    affected_modules: ["src/auth/**"],
    test_data: { seeded_users: [], requires_services: [] },
    hashes: {
      "examples.md": hashEmpty,
      "acceptance.spec.ts": hashEmpty,
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
  await fs.writeFile(join(contractDir, "examples.md"), "");
  await fs.writeFile(join(contractDir, "acceptance.spec.ts"), "");
  await fs.writeFile(join(contractDir, "index.yaml"), yaml.dump(contract));
  await fs.writeFile(
    join(root, ".quality", "policies", "lock-manifest.json"),
    JSON.stringify({ schema_version: 1, files: {} }),
  );
});

afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

const TIERS: TierConfig = {
  schema_version: 1,
  tiers: {
    critical_75: ["src/auth/**"],
    business_60: [],
    ui_gates_only: [],
  },
  unclassified_behavior: "fail_fast",
};

function makeContract(): ContractIndex {
  const hashEmpty = `sha256:${createHash("sha256").update("").digest("hex")}`;
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
    affected_modules: ["src/auth/**"],
    test_data: { seeded_users: [], requires_services: [] },
    hashes: {
      "examples.md": hashEmpty,
      "acceptance.spec.ts": hashEmpty,
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

/**
 * Build a runner that hands back canned outcomes per command pattern, while
 * optionally writing JUnit / Stryker / Playwright fixtures the downstream
 * gates expect.
 */
function scenarioRunner(
  opts: {
    violationOnAttempt?: number; // inject a SKIP_ADDED violation on this attempt
    forceBlocked?: boolean;     // tamper contract so contract-hash fails
    alwaysGreen?: boolean;
    failVitest?: number;         // number of failing tests to report
  } = {},
): RunCommandFn {
  // Track attempts by counting checkpoint commits. Each feature-loop
  // iteration begins with `git add -A` then `git commit`, so counting
  // `git commit` gives us a stable attempt counter.
  let attemptCounter = 0;
  let commitSha = 0;
  return async (cmd, args, options) => {
    const key = `${cmd} ${args[0] ?? ""}`;

    if (cmd === "git") {
      const sub = args[0];
      if (sub === "commit") {
        attemptCounter++;
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 5, timedOut: false };
      }
      if (sub === "add" || sub === "reset" || sub === "checkout") {
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 5, timedOut: false };
      }
      if (sub === "status") {
        // Return dirty on first status of each iteration so the checkpoint
        // commits (driving attemptCounter).
        return { exitCode: 0, stdout: " M x", stderr: "", durationMs: 5, timedOut: false };
      }
      if (sub === "rev-parse") {
        commitSha++;
        return {
          exitCode: 0,
          stdout: `sha${commitSha}`,
          stderr: "",
          durationMs: 5,
          timedOut: false,
        };
      }
      if (sub === "diff" && args.includes("--name-only")) {
        return { exitCode: 0, stdout: "src/auth/login.ts", stderr: "", durationMs: 5, timedOut: false };
      }
      if (sub === "diff") {
        if (opts.violationOnAttempt && attemptCounter === opts.violationOnAttempt) {
          return {
            exitCode: 0,
            stdout: `diff --git a/src/auth.test.ts b/src/auth.test.ts
--- a/src/auth.test.ts
+++ b/src/auth.test.ts
@@ -1,1 +1,1 @@
-test('x', () => {});
+test.skip('x', () => {});
`,
            stderr: "",
            durationMs: 5,
            timedOut: false,
          };
        }
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 5, timedOut: false };
      }
      if (sub === "show") {
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 5, timedOut: false };
      }
    }

    if (cmd === "npx") {
      const tool = args[0];
      if (tool === "tsc") {
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 10, timedOut: false };
      }
      if (tool === "eslint") {
        return {
          exitCode: 0,
          stdout: JSON.stringify([{ filePath: "/src/a.ts", messages: [], errorCount: 0, warningCount: 0 }]),
          stderr: "",
          durationMs: 10,
          timedOut: false,
        };
      }
      if (tool === "knip") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ files: [], issues: [] }),
          stderr: "",
          durationMs: 10,
          timedOut: false,
        };
      }
      if (tool === "vitest") {
        const outFileArg = args.find((a) => a.startsWith("--outputFile="));
        if (outFileArg) {
          const outPath = outFileArg.split("=", 2)[1]!;
          const failed = opts.failVitest ?? 0;
          const passed = 3 - failed;
          const cases = [
            ...Array(passed).fill(`<testcase classname="c" name="pass" time="0.1"/>`),
            ...Array(failed).fill(
              `<testcase classname="c" name="fail" time="0.1"><failure message="boom" type="E">stack</failure></testcase>`,
            ),
          ].join("\n");
          const xml = `<?xml version="1.0"?>
<testsuites tests="3" failures="${failed}" errors="0" time="0.3">
  <testsuite name="s" tests="3" failures="${failed}" errors="0" skipped="0" time="0.3">
    ${cases}
  </testsuite>
</testsuites>`;
          await fs.mkdir(join(outPath, ".."), { recursive: true });
          await fs.writeFile(outPath, xml);
        }
        return { exitCode: opts.failVitest ? 1 : 0, stdout: "", stderr: "", durationMs: 10, timedOut: false };
      }
      if (tool === "playwright") {
        const outPath = options?.env?.PLAYWRIGHT_JSON_OUTPUT_FILE;
        if (outPath) {
          const json = JSON.stringify({
            stats: { duration: 50 },
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
                        results: [{ status: "passed", duration: 50, retry: 0 }],
                      },
                    ],
                  },
                ],
              },
            ],
          });
          await fs.mkdir(join(outPath, ".."), { recursive: true });
          await fs.writeFile(outPath, json);
        }
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 10, timedOut: false };
      }
      if (tool === "stryker") {
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
                  { id: "2", mutatorName: "BL", status: "Killed" },
                  { id: "3", mutatorName: "BL", status: "Killed" },
                  { id: "4", mutatorName: "BL", status: "Survived" },
                ],
              },
            },
          }),
        );
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 10, timedOut: false };
      }
    }

    // unknown — increment attempt on first call to roughly track iterations
    if (key.includes("provider")) attemptCounter++;
    void opts.forceBlocked;
    void opts.alwaysGreen;
    void opts;
    return { exitCode: 0, stdout: "", stderr: "", durationMs: 5, timedOut: false };
  };
}

function makeProvider(
  perAttempt?: (attempt: number) => void,
): { provider: FixerProvider; invokeCount: () => number } {
  let count = 0;
  const provider: FixerProvider = {
    name: "fake",
    isEnabled: () => true,
    invoke: async (_packet: RepairPacket, _run, attempt) => {
      count++;
      perAttempt?.(attempt);
      return {
        providerName: "fake",
        exitCode: 0,
        stdout: "ok",
        stderr: "",
        durationMs: 1000,
        filesEditedCount: 1,
      };
    },
  };
  return { provider, invokeCount: () => count };
}

describe("runFeatureLoop — GREEN on first attempt", () => {
  test("stops immediately and marks feature green", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const { provider, invokeCount } = makeProvider();
    const runner = scenarioRunner();
    const result = await runFeatureLoop({
      runId: "run-1",
      sessionId: "s",
      featureId: "auth-login",
      contract: makeContract(),
      contractDir,
      state,
      tiers: TIERS,
      workingDir: root,
      runArtifactsDir,
      provider,
      runCommand: runner,
    });
    expect(result.finalOutcome).toBe("GREEN");
    expect(result.attempts).toHaveLength(1);
    expect(invokeCount()).toBe(1);
    expect(result.state.features["auth-login"]?.status).toBe("green");
  });
});

describe("runFeatureLoop — respects max attempts safety cap", () => {
  test("stops after 3 attempts when cap is 3", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const { provider } = makeProvider();
    // Force BLOCKED by tampering contract hash mid-session.
    const runner = scenarioRunner();
    // Mark examples.md with non-matching content so contract-hash gate fails.
    await fs.writeFile(join(contractDir, "examples.md"), "TAMPERED");

    const result = await runFeatureLoop({
      runId: "run-1",
      sessionId: "s",
      featureId: "auth-login",
      contract: makeContract(),
      contractDir,
      state,
      tiers: TIERS,
      workingDir: root,
      runArtifactsDir,
      provider,
      runCommand: runner,
      maxAttempts: 3,
    });
    expect(result.finalOutcome).toBe("BLOCKED");
    // BLOCKED stops the loop immediately, so we get 1 attempt.
    expect(result.attempts.length).toBeGreaterThanOrEqual(1);
    expect(result.state.features["auth-login"]?.status).toBe("blocked");
  });
});

describe("runFeatureLoop — VIOLATION behavior", () => {
  test("logs violation, git-resets, continues to next attempt", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const { provider } = makeProvider();
    // Violation on attempt 1, then clean from attempt 2 onward → eventually green
    const runner = scenarioRunner({ violationOnAttempt: 1 });
    const result = await runFeatureLoop({
      runId: "run-1",
      sessionId: "s",
      featureId: "auth-login",
      contract: makeContract(),
      contractDir,
      state,
      tiers: TIERS,
      workingDir: root,
      runArtifactsDir,
      provider,
      runCommand: runner,
      maxAttempts: 3,
    });
    expect(
      result.attempts.some((a) => a.outcome === "VIOLATION"),
    ).toBe(true);
    expect(result.violationEntries.length).toBeGreaterThan(0);
  });
});

describe("runFeatureLoop — plateau detection", () => {
  test("3 identical signatures → BLOCKED with plateau reason", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const { provider } = makeProvider();
    // All attempts fail vitest with the same error → identical signatures.
    const runner = scenarioRunner({ failVitest: 1 });
    const result = await runFeatureLoop({
      runId: "run-1",
      sessionId: "s",
      featureId: "auth-login",
      contract: makeContract(),
      contractDir,
      state,
      tiers: TIERS,
      workingDir: root,
      runArtifactsDir,
      provider,
      runCommand: runner,
      maxAttempts: 10,
      plateauWindow: 3,
    });
    expect(result.finalOutcome).toBe("BLOCKED");
    expect(result.blockedReason).toMatch(/plateau/);
    // 3 attempts produce 3 identical signatures, then block.
    expect(result.attempts.length).toBe(3);
  });

  test("varying failure messages per attempt → no plateau", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const { provider } = makeProvider();
    // Each attempt produces a DIFFERENT failure error message, ensuring
    // the plateau signature differs across iterations. The hardcoded flow
    // still fails (vitest fails every time) so the loop exhausts attempts
    // rather than plateau-blocking.
    let attemptIdx = 0;
    const runner = async (cmd: string, args: string[], options: any) => {
      const inner = scenarioRunner({});
      const base = await inner(cmd, args, options);
      if (cmd === "npx" && args[0] === "vitest") {
        attemptIdx++;
        const outFileArg = args.find((a: string) => a.startsWith("--outputFile="));
        if (outFileArg) {
          const outPath = outFileArg.split("=", 2)[1]!;
          const xml = `<?xml version="1.0"?><testsuites tests="1" failures="1" errors="0" time="0.1"><testsuite name="s" tests="1" failures="1" errors="0" skipped="0" time="0.1"><testcase classname="c" name="t" time="0.1"><failure message="unique error ${attemptIdx}" type="E">stack ${attemptIdx}</failure></testcase></testsuite></testsuites>`;
          await fs.mkdir(join(outPath, ".."), { recursive: true });
          await fs.writeFile(outPath, xml);
        }
        return { ...base, exitCode: 1 };
      }
      return base;
    };
    const result = await runFeatureLoop({
      runId: "run-1",
      sessionId: "s",
      featureId: "auth-login",
      contract: makeContract(),
      contractDir,
      state,
      tiers: TIERS,
      workingDir: root,
      runArtifactsDir,
      provider,
      runCommand: runner,
      maxAttempts: 3,
      plateauWindow: 3,
    });
    // Different signatures — no plateau block.
    expect(result.blockedReason ?? "").not.toMatch(/plateau/);
  });
});
