import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  applyCategoryGate,
  buildCli,
  generateRunId,
  listRuns,
  loadAllContracts,
  readRunSummary,
  runAuditViolations,
  runBaselineReset,
  runClean,
  runDoctor,
  runSession,
  runStatus,
  runUnblock,
} from "./controller.js";
import { renderSummary as buildSummary } from "./reports/summary-writer.js";
import {
  applyMutationMeasurement,
  initializeState,
  readState,
  writeState,
} from "./state-manager.js";
import type { CommandOutcome, RunCommandFn } from "./gates/base.js";
import type { ContractIndex, TierConfig } from "./types.js";

let root: string;

beforeEach(async () => {
  root = join(tmpdir(), `ctrl-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(join(root, ".quality", "policies"), { recursive: true });
  await fs.mkdir(join(root, ".quality", "contracts"), { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function hashEmpty(): string {
  return `sha256:${createHash("sha256").update("").digest("hex")}`;
}

function makeContract(
  id: string,
  overrides: Partial<ContractIndex["feature"]> = {},
): ContractIndex {
  return {
    schema_version: 1,
    feature: {
      id,
      title: id,
      tier: "critical_75",
      category: "auth",
      status: "frozen",
      security_sensitive: true,
      ...overrides,
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
    affected_modules: ["src/**"],
    test_data: { seeded_users: [], requires_services: [] },
    hashes: {
      "examples.md": hashEmpty(),
      "acceptance.spec.ts": hashEmpty(),
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

async function writeContractOnDisk(id: string, contract: ContractIndex): Promise<void> {
  const dir = join(root, ".quality", "contracts", id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, "examples.md"), "");
  await fs.writeFile(join(dir, "acceptance.spec.ts"), "");
  await fs.writeFile(join(dir, "index.yaml"), yaml.dump(contract));
}

async function writeTiers(): Promise<void> {
  const tiers: TierConfig = {
    schema_version: 1,
    tiers: {
      critical_75: ["src/**"],
      business_60: [],
      ui_gates_only: [],
    },
    unclassified_behavior: "fail_fast",
  };
  await fs.writeFile(
    join(root, ".quality", "policies", "tiers.yaml"),
    yaml.dump(tiers),
  );
}

// ─── applyCategoryGate ────────────────────────────────────────────────────────

describe("applyCategoryGate", () => {
  test("security-sensitive frozen → included", () => {
    const c = makeContract("auth-login", { category: "auth", status: "frozen" });
    expect(applyCategoryGate([c])).toHaveLength(1);
  });

  test("security-sensitive draft → HARD ERROR", () => {
    const c = makeContract("auth-login", { category: "auth", status: "draft" });
    expect(() => applyCategoryGate([c])).toThrow(/HARD ERROR/);
  });

  test("non-critical draft → skipped silently", () => {
    const c = makeContract("other-feature", {
      category: "business_logic",
      status: "draft",
      security_sensitive: false,
    });
    expect(applyCategoryGate([c])).toHaveLength(0);
  });

  test("featureId filter applies", () => {
    const a = makeContract("feat-a");
    const b = makeContract("feat-b");
    expect(applyCategoryGate([a, b], { featureId: "feat-b" })).toHaveLength(1);
  });

  test("category filter applies", () => {
    const a = makeContract("feat-a", { category: "auth" });
    const b = makeContract("feat-b", { category: "payments" });
    expect(applyCategoryGate([a, b], { category: "payments" })).toHaveLength(1);
  });
});

// ─── loadAllContracts ────────────────────────────────────────────────────────

describe("loadAllContracts", () => {
  test("loads every valid contract; skips invalid", async () => {
    await writeContractOnDisk("feat-a", makeContract("feat-a"));
    await writeContractOnDisk("feat-b", makeContract("feat-b"));

    // Broken contract
    const brokenDir = join(root, ".quality", "contracts", "broken");
    await fs.mkdir(brokenDir, { recursive: true });
    await fs.writeFile(
      join(brokenDir, "index.yaml"),
      "schema_version: 999",
    );

    const contracts = await loadAllContracts(
      join(root, ".quality", "contracts"),
    );
    const ids = contracts.map((c) => c.feature.id);
    expect(ids).toContain("feat-a");
    expect(ids).toContain("feat-b");
    expect(ids).not.toContain("broken");
  });

  test("empty directory returns []", async () => {
    const contracts = await loadAllContracts(
      join(root, ".quality", "contracts"),
    );
    expect(contracts).toEqual([]);
  });

  test("missing directory returns []", async () => {
    const contracts = await loadAllContracts(
      join(root, ".quality", "missing"),
    );
    expect(contracts).toEqual([]);
  });
});

// ─── generateRunId ────────────────────────────────────────────────────────────

describe("generateRunId", () => {
  test("matches run-id pattern", () => {
    const id = generateRunId();
    expect(id).toMatch(/^run-[0-9a-zA-Z_-]+$/);
  });

  test("produces distinct ids across calls", () => {
    const ids = new Set(
      Array.from({ length: 20 }, () => generateRunId()),
    );
    expect(ids.size).toBeGreaterThan(5);
  });
});

// ─── renderSummary (re-exported as buildSummary for backwards-compat tests) ──
// Note: the comprehensive summary-writer tests live in reports/summary-writer.test.ts.
// These tests just verify the re-export + wiring through the controller.

describe("summary-writer is exposed through controller wiring", () => {
  test("renderSummary produces expected headers", () => {
    const md = buildSummary({
      runId: "run-abc",
      startedAt: "2026-04-14T21:30:00Z",
      endedAt: "2026-04-14T22:45:00Z",
      controllerVersion: "0.1.0",
      featureResults: [],
      violationEntries: [],
      state: initializeState("2026-04-14T21:30:00Z"),
      baselineStrykerScore: 70,
    });
    expect(md).toContain("# QA Run Summary — run-abc");
    expect(md).toContain("## Verdict");
    expect(md).toContain("## Contract Integrity");
  });
});

// ─── new subcommand coverage ─────────────────────────────────────────────────

describe("runStatus", () => {
  test("returns counts + module list", async () => {
    await writeTiers();
    await fs.writeFile(
      join(root, ".quality", "state.json"),
      JSON.stringify({
        schema_version: 1,
        last_updated: "2026-04-14T22:00:00Z",
        last_run_id: "run-1",
        features: {
          "auth-login": { status: "green", attempts_this_session: 0, plateau_buffer: [] },
          "payment": { status: "blocked", attempts_this_session: 10, plateau_buffer: [] },
        },
        modules: {
          "src/a.ts": {
            tier: "critical_75",
            mutation_baseline: 80,
            mutation_baseline_set_at: "2026-04-14T22:00:00Z",
            has_exceeded_floor: true,
          },
          "src/b.ts": {
            tier: "critical_75",
            mutation_baseline: 60,
            mutation_baseline_set_at: "2026-04-14T22:00:00Z",
            has_exceeded_floor: false,
          },
        },
        baseline_reset_log: [],
        test_count_history: { vitest_unit: [100], vitest_integration: [], playwright: [] },
        runs: {},
      }),
    );
    const report = await runStatus(root);
    expect(report.lastRunId).toBe("run-1");
    expect(report.features.green).toBe(1);
    expect(report.features.blocked).toBe(1);
    expect(report.modules).toHaveLength(2);
    expect(report.modules.find((m) => m.path === "src/b.ts")?.belowFloor).toBe(true);
    expect(report.testCountHistoryLatest.vitest_unit).toBe(100);
  });
});

describe("listRuns + readRunSummary", () => {
  test("lists runs that have summaries", async () => {
    const runsDir = join(root, ".quality", "runs");
    await fs.mkdir(join(runsDir, "run-001"), { recursive: true });
    await fs.writeFile(
      join(runsDir, "run-001", "summary.md"),
      "# QA Run Summary — run-001\n\n**Status:** 🟢 1 GREEN\n",
    );
    await fs.mkdir(join(runsDir, "run-002"), { recursive: true });
    // no summary.md for run-002

    const runs = await listRuns(root);
    expect(runs.map((r) => r.runId)).toEqual(["run-001", "run-002"]);
    expect(runs[0]?.summaryExists).toBe(true);
    expect(runs[0]?.verdictLine).toContain("GREEN");
    expect(runs[1]?.summaryExists).toBe(false);
  });

  test("readRunSummary returns file contents", async () => {
    const runsDir = join(root, ".quality", "runs");
    await fs.mkdir(join(runsDir, "run-x"), { recursive: true });
    await fs.writeFile(join(runsDir, "run-x", "summary.md"), "# hello");
    const md = await readRunSummary(root, "run-x");
    expect(md).toBe("# hello");
  });
});

describe("runDoctor", () => {
  test("no issues on clean project", async () => {
    await writeTiers();
    const report = await runDoctor(root);
    expect(report.checked).toContain("contract-hashes");
    expect(report.checked).toContain("tiers-coverage");
    expect(report.checked).toContain("providers-policy");
  });

  test("flags tampered contract hash", async () => {
    await writeTiers();
    await writeContractOnDisk("auth", makeContract("auth"));
    // Tamper the artifact.
    await fs.writeFile(
      join(root, ".quality", "contracts", "auth", "examples.md"),
      "TAMPERED",
    );
    const report = await runDoctor(root);
    const hashIssues = report.issues.filter((i) => i.check === "contract-hashes");
    expect(hashIssues.length).toBeGreaterThan(0);
    expect(hashIssues[0]?.severity).toBe("error");
    expect(report.ok).toBe(false);
  });

  test("flags unclassified source files", async () => {
    await writeTiers();
    await fs.mkdir(join(root, "src"), { recursive: true });
    // A source file that DOESN'T match any tier glob.
    await fs.writeFile(join(root, "src", "orphan.ts"), "export const x = 1;");

    // Override tiers to not match orphan.ts.
    await fs.writeFile(
      join(root, ".quality", "policies", "tiers.yaml"),
      yaml.dump({
        schema_version: 1,
        tiers: {
          critical_75: ["src/auth/**"],
          business_60: [],
          ui_gates_only: [],
        },
        unclassified_behavior: "fail_fast",
      }),
    );
    const report = await runDoctor(root);
    const tierIssues = report.issues.filter((i) => i.check === "tiers-coverage");
    expect(tierIssues.length).toBeGreaterThan(0);
  });
});

describe("runUnblock", () => {
  test("transitions blocked → pending + clears plateau buffer", async () => {
    await writeTiers();
    await fs.writeFile(
      join(root, ".quality", "state.json"),
      JSON.stringify({
        schema_version: 1,
        last_updated: "2026-04-14T22:00:00Z",
        features: {
          "auth-login": {
            status: "blocked",
            blocked_at: "2026-04-14T22:00:00Z",
            blocked_reason: "plateau",
            blocked_signature: "abc",
            attempts_this_session: 10,
            plateau_buffer: ["sig", "sig", "sig"],
          },
        },
        modules: {},
        baseline_reset_log: [],
        test_count_history: { vitest_unit: [], vitest_integration: [], playwright: [] },
        runs: {},
      }),
    );
    await runUnblock(root, "auth-login");
    const updated = JSON.parse(
      await fs.readFile(join(root, ".quality", "state.json"), "utf8"),
    );
    expect(updated.features["auth-login"].status).toBe("pending");
    expect(updated.features["auth-login"].plateau_buffer).toEqual([]);
    expect(updated.features["auth-login"].attempts_this_session).toBe(0);
  });

  test("throws on unknown feature", async () => {
    await fs.writeFile(
      join(root, ".quality", "state.json"),
      JSON.stringify({
        schema_version: 1,
        last_updated: "2026-04-14T22:00:00Z",
        features: {},
        modules: {},
        baseline_reset_log: [],
        test_count_history: { vitest_unit: [], vitest_integration: [], playwright: [] },
        runs: {},
      }),
    );
    await expect(runUnblock(root, "missing")).rejects.toThrow(/not found/);
  });

  test("throws on non-blocked feature", async () => {
    await fs.writeFile(
      join(root, ".quality", "state.json"),
      JSON.stringify({
        schema_version: 1,
        last_updated: "2026-04-14T22:00:00Z",
        features: {
          "auth-login": { status: "green", attempts_this_session: 0, plateau_buffer: [] },
        },
        modules: {},
        baseline_reset_log: [],
        test_count_history: { vitest_unit: [], vitest_integration: [], playwright: [] },
        runs: {},
      }),
    );
    await expect(runUnblock(root, "auth-login")).rejects.toThrow(/not blocked/);
  });
});

describe("runAuditViolations", () => {
  test("empty when no runs", async () => {
    const report = await runAuditViolations(root);
    expect(report.totalRuns).toBe(0);
    expect(report.totalViolations).toBe(0);
  });

  test("aggregates violations across multiple runs by pattern", async () => {
    const runsDir = join(root, ".quality", "runs");
    await fs.mkdir(join(runsDir, "run-001"), { recursive: true });
    await fs.mkdir(join(runsDir, "run-002"), { recursive: true });

    const ventry = (runId: string, patternId: string) => ({
      run_id: runId,
      feature_id: "auth-login",
      attempt: 1,
      detected_at: "2026-04-14T22:00:00Z",
      provider: "claude",
      violations: [
        { pattern_id: patternId, severity: "reject", file: "x.test.ts", detected_at: "2026-04-14T22:00:00Z" },
      ],
      reverted_paths: [],
    });
    await fs.writeFile(
      join(runsDir, "run-001", "violations.jsonl"),
      [
        JSON.stringify(ventry("run-001", "SKIP_ADDED")),
        JSON.stringify(ventry("run-001", "SKIP_ADDED")),
      ].join("\n"),
    );
    await fs.writeFile(
      join(runsDir, "run-002", "violations.jsonl"),
      JSON.stringify(ventry("run-002", "EXPECT_REMOVED_NET")),
    );

    const report = await runAuditViolations(root);
    expect(report.totalRuns).toBe(2);
    expect(report.runsWithViolations).toBe(2);
    expect(report.totalViolations).toBe(3);
    expect(report.byPattern["SKIP_ADDED"]?.count).toBe(2);
    expect(report.byPattern["EXPECT_REMOVED_NET"]?.count).toBe(1);
  });
});

// ─── runBaselineReset ────────────────────────────────────────────────────────

describe("runBaselineReset", () => {
  test("applies reset + writes state.json with audit entry", async () => {
    let state = initializeState("2026-04-14T22:00:00Z");
    state = applyMutationMeasurement({
      state,
      modulePath: "src/auth/login.ts",
      newScore: 80,
      tier: "critical_75",
      runId: "run-0",
      timestamp: "2026-04-14T22:00:00Z",
    }).state;
    await writeState(join(root, ".quality", "state.json"), state);

    await runBaselineReset({
      workingDir: root,
      module: "src/auth/login.ts",
      reason: "Refactor per PRD v2",
      newBaseline: 60,
      approvedBy: "shailesh",
    });

    const updated = await readState(join(root, ".quality", "state.json"));
    expect(updated.modules["src/auth/login.ts"]?.mutation_baseline).toBe(60);
    expect(updated.baseline_reset_log).toHaveLength(1);
    expect(updated.baseline_reset_log[0]?.reason).toBe("Refactor per PRD v2");
  });

  test("refuses empty reason", async () => {
    await writeState(
      join(root, ".quality", "state.json"),
      applyMutationMeasurement({
        state: initializeState("2026-04-14T22:00:00Z"),
        modulePath: "src/a.ts",
        newScore: 70,
        tier: "business_60",
        runId: "run-0",
        timestamp: "2026-04-14T22:00:00Z",
      }).state,
    );
    await expect(
      runBaselineReset({
        workingDir: root,
        module: "src/a.ts",
        reason: "",
        newBaseline: 50,
        approvedBy: "x",
      }),
    ).rejects.toThrow();
  });
});

// ─── runClean ────────────────────────────────────────────────────────────────

describe("runClean", () => {
  test("clears stale lock", async () => {
    const lockPath = join(root, ".quality", "state.lock");
    await fs.writeFile(
      lockPath,
      JSON.stringify({
        pid: 999999,
        run_id: "run-old",
        acquired_at: "2026-04-14T22:00:00Z",
        host: (await import("node:os")).hostname(),
        qa_controller_version: "0.1.0",
      }),
    );
    const result = await runClean({
      workingDir: root,
      pidAlive: () => false,
    });
    expect(result.staleLockCleared).toBe(true);
  });

  test("archives heavy artifacts from old runs", async () => {
    const oldRunDir = join(root, ".quality", "runs", "run-old");
    const evidenceDir = join(oldRunDir, "evidence");
    await fs.mkdir(evidenceDir, { recursive: true });
    await fs.writeFile(join(evidenceDir, "big.log"), "x".repeat(100));
    await fs.writeFile(join(oldRunDir, "summary.md"), "old");

    // Force mtime 60 days old
    const oldDate = new Date(Date.now() - 60 * 24 * 3600 * 1000);
    await fs.utimes(oldRunDir, oldDate, oldDate);

    const result = await runClean({
      workingDir: root,
      retentionDays: 30,
      pidAlive: () => true,
    });
    expect(result.archivedRuns).toContain("run-old");
    const evidenceGone = await fs
      .access(evidenceDir)
      .then(() => false)
      .catch(() => true);
    expect(evidenceGone).toBe(true);
    // But summary is retained
    const summaryStill = await fs
      .access(join(oldRunDir, "summary.md"))
      .then(() => true)
      .catch(() => false);
    expect(summaryStill).toBe(true);
  });

  test("retains recent runs", async () => {
    const recent = join(root, ".quality", "runs", "run-recent");
    await fs.mkdir(join(recent, "evidence"), { recursive: true });
    await fs.writeFile(join(recent, "summary.md"), "recent");

    const result = await runClean({
      workingDir: root,
      retentionDays: 30,
      pidAlive: () => true,
    });
    expect(result.retainedRuns).toContain("run-recent");
  });
});

// ─── buildCli ─────────────────────────────────────────────────────────────────

describe("buildCli", () => {
  test("registers all documented subcommands", () => {
    const cli = buildCli();
    const names = cli.commands.map((c) => c.name()).sort();
    expect(names).toEqual(
      [
        "audit-violations",
        "baseline",
        "baseline-reset",
        "clean",
        "doctor",
        "report",
        "run",
        "status",
        "unblock",
      ].sort(),
    );
  });
});

// ─── runSession smoke (integration-light) ────────────────────────────────────

describe("runSession — category gate hard error", () => {
  test("throws when security-sensitive contract is not frozen", async () => {
    await writeContractOnDisk(
      "payment-x",
      makeContract("payment-x", { category: "payments", status: "draft" }),
    );
    await writeTiers();
    await expect(
      runSession({
        workingDir: root,
        runId: "run-test-1",
        runCommand: async () => ({
          exitCode: 0,
          stdout: "",
          stderr: "",
          durationMs: 5,
          timedOut: false,
        }),
        skipBaselineStryker: true,
        noNotification: true,
      }),
    ).rejects.toThrow(/HARD ERROR/);
  });
});

describe("runSession — empty contracts → clean session", () => {
  test("no contracts → writes empty summary", async () => {
    await writeTiers();
    const result = await runSession({
      workingDir: root,
      runId: "run-test-2",
      runCommand: async (cmd, args) => {
        // git status returns empty (clean tree)
        if (cmd === "git" && args[0] === "status") {
          return { exitCode: 0, stdout: "", stderr: "", durationMs: 5, timedOut: false };
        }
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 5, timedOut: false };
      },
      skipBaselineStryker: true,
      skipReleaseGates: true,
      noNotification: true,
    });
    expect(result.runId).toBe("run-test-2");
    expect(result.featuresAttempted).toEqual([]);
    const summaryExists = await fs
      .access(result.summaryPath)
      .then(() => true)
      .catch(() => false);
    expect(summaryExists).toBe(true);
  });
});

// Silence unused helper export for types
void (null as unknown as CommandOutcome);
void (null as unknown as RunCommandFn);
