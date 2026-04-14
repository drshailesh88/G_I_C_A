import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  buildRepairPacket,
  loadRepairPacket,
} from "./packet-builder.js";
import { applyMutationMeasurement, initializeState } from "./state-manager.js";
import type {
  ContractIndex,
  GateResult,
  PriorAttempt,
  ViolationHistoryEntry,
} from "./types.js";

let root: string;
let runArtifactsDir: string;

beforeEach(async () => {
  root = join(tmpdir(), `packet-${randomBytes(6).toString("hex")}`);
  runArtifactsDir = join(root, ".quality", "runs", "run-2026-04-14-001");
  await fs.mkdir(runArtifactsDir, { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function contractFixture(
  overrides: Partial<ContractIndex["feature"]> = {},
): ContractIndex {
  return {
    schema_version: 1,
    feature: {
      id: "auth-login",
      title: "User login",
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
      examples: 3,
      counterexamples: 1,
      invariants: 2,
      acceptance_tests: 4,
      regression_tests: 0,
    },
    affected_modules: ["src/auth/**", "src/lib/session.ts"],
    test_data: { seeded_users: ["test_user"], requires_services: ["clerk"] },
    hashes: {
      "examples.md":
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

function vitestFailResult(): GateResult {
  return {
    gateId: "vitest-unit",
    status: "fail",
    durationMs: 1200,
    details: {
      total: 10,
      passed: 8,
      failed: 2,
      skipped: 0,
      failures: [
        {
          suite: "auth/login",
          test: "rejects expired tokens",
          error: "Cannot read property 'reason' of undefined",
          file: "src/auth/login.ts",
        },
        {
          suite: "auth/login",
          test: "handles malformed JWT",
          error: "TypeError: Cannot read properties of undefined (reading 'split')",
          file: "src/auth/login.ts",
        },
      ],
    },
    artifacts: ["/evidence/vitest-unit/junit.xml"],
    shortCircuit: false,
  };
}

function strykerFailResult(): GateResult {
  return {
    gateId: "stryker-incremental",
    status: "pass",
    durationMs: 120_000,
    details: {
      overallScore: 54,
      perFileSummary: [
        {
          filePath: "src/auth/login.ts",
          killed: 4,
          survived: 7,
          timeout: 1,
          score: 50,
          freshlyMeasured: true,
        },
      ],
    },
    artifacts: ["/evidence/stryker-incremental/report.json"],
    shortCircuit: false,
  };
}

describe("buildRepairPacket — structure", () => {
  test("writes packet file with YAML frontmatter", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const r = await buildRepairPacket({
      runId: "run-2026-04-14-001",
      attemptNumber: 1,
      sessionId: "session-1",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir: join(root, ".quality/contracts/auth-login"),
      state,
      failedGates: [vitestFailResult()],
      priorAttempts: [],
      violationHistory: [],
    });
    expect(r.packetPath).toContain("auth-login-1.md");
    const contents = await fs.readFile(r.packetPath, "utf8");
    expect(contents.startsWith("---\n")).toBe(true);
    expect(contents).toContain("feature_id: auth-login");
    expect(contents).toContain("## Task");
    expect(contents).toContain("## Failing Gates");
    expect(contents).toContain("## Rules (non-negotiable)");
  });

  test("frontmatter round-trips through loadRepairPacket", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const built = await buildRepairPacket({
      runId: "run-2026-04-14-001",
      attemptNumber: 3,
      sessionId: "session-1",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir: root,
      state,
      failedGates: [vitestFailResult()],
      priorAttempts: [
        { attempt: 1, approach: "added null check", result: "still failed" },
        {
          attempt: 2,
          approach: "async rewrite",
          result: "REGRESSED, reverted",
          error_output: "FAIL\nstack",
        },
      ],
      violationHistory: [],
    });

    const loaded = await loadRepairPacket(built.packetPath);
    expect(loaded.frontmatter.attempt_number).toBe(3);
    expect(loaded.frontmatter.feature_id).toBe("auth-login");
    expect(loaded.frontmatter.prior_attempts).toHaveLength(2);
    expect(loaded.frontmatter.prior_attempts[1]?.error_output).toContain("FAIL");
  });
});

describe("buildRepairPacket — hypothesis generation", () => {
  test("vitest 'Cannot read property of undefined' → null check hypothesis", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const r = await buildRepairPacket({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir: root,
      state,
      failedGates: [vitestFailResult()],
      priorAttempts: [],
      violationHistory: [],
    });
    expect(r.frontmatter.hypothesis).toBeDefined();
    expect(r.frontmatter.hypothesis?.summary).toMatch(/null\/undefined/);
    expect(r.frontmatter.hypothesis?.confidence).toBe("medium");
  });

  test("Playwright selector error → wire-selectors hypothesis", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const pwFail: GateResult = {
      gateId: "playwright-targeted",
      status: "fail",
      durationMs: 30_000,
      details: {
        failed: 1,
        failures: [
          {
            file: "e2e/auth.spec.ts",
            title: "login button renders",
            projectName: "chromium",
            error: "locator('[data-testid=\"login-btn\"]') did not resolve",
          },
        ],
      },
      artifacts: [],
      shortCircuit: false,
    };
    const r = await buildRepairPacket({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir: root,
      state,
      failedGates: [pwFail],
      priorAttempts: [],
      violationHistory: [],
    });
    expect(r.frontmatter.hypothesis?.summary).toMatch(/selector|wire-selectors/);
  });

  test("no hypothesis when gates have no recognizable error patterns", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const unknownFail: GateResult = {
      gateId: "knip",
      status: "fail",
      durationMs: 100,
      details: { unusedFilesCount: 1, unusedFiles: ["src/dead.ts"] },
      artifacts: [],
      shortCircuit: false,
    };
    const r = await buildRepairPacket({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir: root,
      state,
      failedGates: [unknownFail],
      priorAttempts: [],
      violationHistory: [],
    });
    expect(r.frontmatter.hypothesis).toBeUndefined();
  });

  test("stryker-survived pattern generates module-specific hypothesis", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const strykerOnly = { ...strykerFailResult(), status: "fail" as const };
    const r = await buildRepairPacket({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir: root,
      state,
      failedGates: [strykerOnly],
      priorAttempts: [],
      violationHistory: [],
    });
    expect(r.frontmatter.hypothesis?.summary).toMatch(/src\/auth\/login\.ts/);
  });
});

describe("buildRepairPacket — codebase_context", () => {
  test("includes direct deps of failing source files", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const getDirectDeps = async (file: string): Promise<string[]> => {
      if (file === "src/auth/login.ts") {
        return ["src/auth/session.ts", "src/lib/jwt.ts"];
      }
      return [];
    };
    const r = await buildRepairPacket({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir: root,
      state,
      failedGates: [vitestFailResult()],
      priorAttempts: [],
      violationHistory: [],
      getDirectDeps,
    });
    expect(r.frontmatter.codebase_context).toContain("src/auth/login.ts");
    expect(r.frontmatter.codebase_context).toContain("src/auth/session.ts");
    expect(r.frontmatter.codebase_context).toContain("src/lib/jwt.ts");
  });

  test("includes changedPaths", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const r = await buildRepairPacket({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir: root,
      state,
      failedGates: [],
      priorAttempts: [],
      violationHistory: [],
      changedPaths: ["src/new.ts", "src/auth/helper.ts"],
    });
    expect(r.frontmatter.codebase_context).toContain("src/new.ts");
    expect(r.frontmatter.codebase_context).toContain("src/auth/helper.ts");
  });
});

describe("buildRepairPacket — ratchet targets", () => {
  test("includes tier-floor targets for modules in scope", async () => {
    let state = initializeState("2026-04-14T22:00:00Z");
    state = applyMutationMeasurement({
      state,
      modulePath: "src/auth/login.ts",
      newScore: 80,
      tier: "critical_75",
      runId: "run-0",
      timestamp: "2026-04-14T22:00:00Z",
    }).state;

    const r = await buildRepairPacket({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir: root,
      state,
      failedGates: [],
      priorAttempts: [],
      violationHistory: [],
    });
    const target = r.frontmatter.ratchet_targets.find((t) =>
      t.metric.includes("src/auth/login.ts"),
    );
    expect(target).toBeDefined();
    expect(target?.must_be).toContain(">= 75");
  });

  test("always includes playwright target for the feature", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const r = await buildRepairPacket({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir: root,
      state,
      failedGates: [],
      priorAttempts: [],
      violationHistory: [],
    });
    const pwTarget = r.frontmatter.ratchet_targets.find((t) =>
      t.metric.startsWith("playwright."),
    );
    expect(pwTarget).toBeDefined();
    expect(pwTarget?.must_be).toBe("all_pass");
  });

  test("excludes ui_gates_only modules (no floor)", async () => {
    let state = initializeState("2026-04-14T22:00:00Z");
    state = applyMutationMeasurement({
      state,
      modulePath: "src/components/Button.tsx",
      newScore: 20,
      tier: "ui_gates_only",
      runId: "run-0",
      timestamp: "2026-04-14T22:00:00Z",
    }).state;

    const r = await buildRepairPacket({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir: root,
      state,
      failedGates: [],
      priorAttempts: [],
      violationHistory: [],
    });
    const uiTarget = r.frontmatter.ratchet_targets.find((t) =>
      t.metric.includes("Button.tsx"),
    );
    expect(uiTarget).toBeUndefined();
  });
});

describe("buildRepairPacket — edit paths", () => {
  test("allowed_edit_paths includes contract scope + helpers", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const r = await buildRepairPacket({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir: root,
      state,
      failedGates: [],
      priorAttempts: [],
      violationHistory: [],
    });
    expect(r.frontmatter.allowed_edit_paths).toContain("src/auth/**");
    expect(r.frontmatter.allowed_edit_paths).toContain("tests/helpers/**");
    expect(r.frontmatter.allowed_edit_paths).toContain("tests/unit/**");
  });

  test("forbidden_edit_paths always locks quality + configs", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const r = await buildRepairPacket({
      runId: "run-1",
      attemptNumber: 1,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir: root,
      state,
      failedGates: [],
      priorAttempts: [],
      violationHistory: [],
    });
    expect(r.frontmatter.forbidden_edit_paths).toContain(".quality/**");
    expect(r.frontmatter.forbidden_edit_paths).toContain("vitest.config.ts");
    expect(r.frontmatter.forbidden_edit_paths).toContain("playwright.config.ts");
    expect(r.frontmatter.forbidden_edit_paths).toContain("stryker.conf.mjs");
    expect(r.frontmatter.forbidden_edit_paths).toContain("tests/contracts/**");
  });
});

describe("buildRepairPacket — prior attempts C4 graduated fidelity", () => {
  test("body renders one-line summaries for older priors + full error for recent", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const priors: PriorAttempt[] = [
      { attempt: 1, approach: "tried A", result: "failed" },
      { attempt: 2, approach: "tried B", result: "REGRESSED", error_output: "FAIL: full stack trace here" },
    ];
    const r = await buildRepairPacket({
      runId: "run-1",
      attemptNumber: 3,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir: root,
      state,
      failedGates: [vitestFailResult()],
      priorAttempts: priors,
      violationHistory: [],
    });
    expect(r.bodyMarkdown).toContain("tried A");
    expect(r.bodyMarkdown).toContain("full stack trace here");
  });

  test("violation history rendered as diff blocks", async () => {
    const state = initializeState("2026-04-14T22:00:00Z");
    const violations: ViolationHistoryEntry[] = [
      {
        attempt: 2,
        pattern_ids: ["SKIP_ADDED"],
        offending_diff: "+it.skip('fails', () => {});",
      },
    ];
    const r = await buildRepairPacket({
      runId: "run-1",
      attemptNumber: 3,
      sessionId: "s",
      workingDir: root,
      runArtifactsDir,
      contract: contractFixture(),
      contractDir: root,
      state,
      failedGates: [],
      priorAttempts: [],
      violationHistory: violations,
    });
    expect(r.bodyMarkdown).toContain("Cheating Attempts Rejected");
    expect(r.bodyMarkdown).toContain("SKIP_ADDED");
    expect(r.bodyMarkdown).toContain("it.skip");
  });
});

describe("loadRepairPacket", () => {
  test("rejects malformed files", async () => {
    const path = join(runArtifactsDir, "packets", "bad.md");
    await fs.mkdir(join(path, ".."), { recursive: true });
    await fs.writeFile(path, "# no frontmatter");
    await expect(loadRepairPacket(path)).rejects.toThrow(/frontmatter/);
  });
});
