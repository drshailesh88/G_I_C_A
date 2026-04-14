import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runTierFloorGate, TIER_FLOOR_GATE_ID } from "./tier-floor.js";
import { initializeState, applyMutationMeasurement } from "../state-manager.js";
import type { GateConfig } from "./base.js";
import type {
  StateJson,
  StrykerFileScore,
  StrykerResult,
  TierConfig,
} from "../types.js";

let root: string;
beforeEach(async () => {
  root = join(tmpdir(), `tf-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(join(root, "evidence"), { recursive: true });
});
afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function cfg(): GateConfig {
  return {
    runId: "run-1",
    workingDir: root,
    evidenceDir: join(root, "evidence"),
  };
}

const TIERS: TierConfig = {
  schema_version: 1,
  tiers: {
    critical_75: ["src/auth/**", "src/lib/payments/**"],
    business_60: ["src/lib/**", "app/api/**"],
    ui_gates_only: ["src/components/**"],
  },
  unclassified_behavior: "fail_fast",
};

function buildStrykerResult(
  perFile: Record<string, Partial<StrykerFileScore> & { score: number | null }>,
): StrykerResult {
  const map = new Map<string, StrykerFileScore>();
  for (const [filePath, data] of Object.entries(perFile)) {
    map.set(filePath, {
      filePath,
      killed: 0,
      survived: 0,
      timeout: 0,
      noCoverage: 0,
      runtimeErrors: 0,
      compileErrors: 0,
      skipped: 0,
      pending: 0,
      ignored: 0,
      total: 0,
      freshlyMeasured: true,
      topSurvivingMutants: [],
      ...data,
    });
  }
  return {
    perFile: map,
    overallScore: null,
    totalMutants: 0,
    freshlyTested: 0,
    cachedFromIncremental: 0,
    unclassifiedFiles: [],
  };
}

const NOW = "2026-04-14T22:00:00Z";

describe("runTierFloorGate", () => {
  test("pass when all modules at/above floor", async () => {
    const state = initializeState(NOW);
    const stryker = buildStrykerResult({
      "src/auth/login.ts": { score: 80 }, // ≥75
      "src/lib/util.ts": { score: 65 }, // ≥60
      "src/components/Button.tsx": { score: 20 }, // no floor
    });
    const result = await runTierFloorGate({
      config: cfg(),
      strykerResult: stryker,
      tiers: TIERS,
      state,
    });
    expect(result.status).toBe("pass");
    expect(result.gateId).toBe(TIER_FLOOR_GATE_ID);
    const details = result.details as any;
    expect(details.atOrAbove).toBe(2);
    expect(details.noFloor).toBe(1);
    expect(details.regressionsBelowFloor).toBe(0);
  });

  test("fail on regression below floor (has_exceeded_floor=true)", async () => {
    // First establish the baseline above floor...
    let state = initializeState(NOW);
    state = applyMutationMeasurement({
      state,
      modulePath: "src/auth/login.ts",
      newScore: 80,
      tier: "critical_75",
      runId: "run-1",
      timestamp: NOW,
    }).state;
    // state.modules[src/auth/login.ts].has_exceeded_floor === true

    // Now measure below floor.
    const stryker = buildStrykerResult({
      "src/auth/login.ts": { score: 60 },
    });
    const result = await runTierFloorGate({
      config: cfg(),
      strykerResult: stryker,
      tiers: TIERS,
      state,
    });
    expect(result.status).toBe("fail");
    const details = result.details as any;
    expect(details.regressionsBelowFloor).toBe(1);
    expect(details.modules[0].verdict).toBe("regression_below_floor");
  });

  test("pass when below floor but never reached (no regression)", async () => {
    const state = initializeState(NOW);
    const stryker = buildStrykerResult({
      "src/auth/login.ts": { score: 60 }, // first measurement, below floor
    });
    const result = await runTierFloorGate({
      config: cfg(),
      strykerResult: stryker,
      tiers: TIERS,
      state,
    });
    expect(result.status).toBe("pass");
    const details = result.details as any;
    expect(details.belowNeverReached).toBe(1);
    expect(details.modules[0].verdict).toBe("below_never_reached");
  });

  test("ui_gates_only tier → no_floor verdict", async () => {
    const state = initializeState(NOW);
    const stryker = buildStrykerResult({
      "src/components/Button.tsx": { score: 5 }, // would be low, but no floor applies
    });
    const result = await runTierFloorGate({
      config: cfg(),
      strykerResult: stryker,
      tiers: TIERS,
      state,
    });
    expect(result.status).toBe("pass");
    const details = result.details as any;
    expect(details.modules[0].verdict).toBe("no_floor");
  });

  test("null score → no_score verdict (not a failure)", async () => {
    const state = initializeState(NOW);
    const stryker = buildStrykerResult({
      "src/lib/trivial.ts": { score: null },
    });
    const result = await runTierFloorGate({
      config: cfg(),
      strykerResult: stryker,
      tiers: TIERS,
      state,
    });
    expect(result.status).toBe("pass");
    const details = result.details as any;
    expect(details.noScore).toBe(1);
    expect(details.modules[0].verdict).toBe("no_score");
  });

  test("uses declared tier from StrykerFileScore when present", async () => {
    const state = initializeState(NOW);
    const stryker = buildStrykerResult({
      // File path doesn't match any glob, but tier is declared on the score.
      "non/standard/path.ts": { score: 70, tier: "critical_75" },
    });
    const result = await runTierFloorGate({
      config: cfg(),
      strykerResult: stryker,
      tiers: TIERS,
      state,
    });
    const details = result.details as any;
    expect(details.modules[0].tier).toBe("critical_75");
    expect(details.modules[0].verdict).toBe("below_never_reached"); // 70 < 75
  });

  test("classifies via tiers.yaml when StrykerFileScore lacks tier", async () => {
    const state = initializeState(NOW);
    const stryker = buildStrykerResult({
      "src/lib/util.ts": { score: 65 },
    });
    const result = await runTierFloorGate({
      config: cfg(),
      strykerResult: stryker,
      tiers: TIERS,
      state,
    });
    const details = result.details as any;
    expect(details.modules[0].tier).toBe("business_60");
  });

  test("writes evidence", async () => {
    const state = initializeState(NOW);
    const stryker = buildStrykerResult({
      "src/auth/login.ts": { score: 80 },
    });
    const result = await runTierFloorGate({
      config: cfg(),
      strykerResult: stryker,
      tiers: TIERS,
      state,
    });
    expect(result.artifacts).toHaveLength(1);
    const body = JSON.parse(await fs.readFile(result.artifacts[0]!, "utf8"));
    expect(body).toHaveProperty("modules");
    expect(body.modules).toHaveLength(1);
  });
});
