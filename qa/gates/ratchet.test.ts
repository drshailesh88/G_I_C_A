import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runRatchetGate, RATCHET_GATE_ID } from "./ratchet.js";
import { applyMutationMeasurement, initializeState } from "../state-manager.js";
import type { GateConfig } from "./base.js";
import type { StrykerFileScore, StrykerResult } from "../types.js";

let root: string;
beforeEach(async () => {
  root = join(tmpdir(), `ratchet-${randomBytes(6).toString("hex")}`);
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

function buildStrykerResult(
  perFile: Record<string, { score: number | null }>,
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
      score: data.score,
      freshlyMeasured: true,
      topSurvivingMutants: [],
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

function stateWith(modulePath: string, baseline: number): ReturnType<typeof initializeState> {
  return applyMutationMeasurement({
    state: initializeState(NOW),
    modulePath,
    newScore: baseline,
    tier: "business_60",
    runId: "run-0",
    timestamp: NOW,
  }).state;
}

describe("runRatchetGate", () => {
  test("pass on improvement — new > baseline", async () => {
    const state = stateWith("src/lib/foo.ts", 60);
    const stryker = buildStrykerResult({ "src/lib/foo.ts": { score: 75 } });
    const result = await runRatchetGate({ config: cfg(), strykerResult: stryker, state });
    expect(result.status).toBe("pass");
    expect(result.gateId).toBe(RATCHET_GATE_ID);
    const details = result.details as any;
    expect(details.overall).toBe("IMPROVED");
    expect(details.improvedCount).toBe(1);
    expect(details.modules[0].delta).toBe("IMPROVED");
    expect(details.modules[0].deltaValue).toBe(15);
  });

  test("pass on unchanged — new == baseline", async () => {
    const state = stateWith("src/lib/foo.ts", 60);
    const stryker = buildStrykerResult({ "src/lib/foo.ts": { score: 60 } });
    const result = await runRatchetGate({ config: cfg(), strykerResult: stryker, state });
    expect(result.status).toBe("pass");
    const details = result.details as any;
    expect(details.overall).toBe("UNCHANGED");
    expect(details.unchangedCount).toBe(1);
  });

  test("fail on regression — new < baseline", async () => {
    const state = stateWith("src/lib/foo.ts", 60);
    const stryker = buildStrykerResult({ "src/lib/foo.ts": { score: 55 } });
    const result = await runRatchetGate({ config: cfg(), strykerResult: stryker, state });
    expect(result.status).toBe("fail");
    const details = result.details as any;
    expect(details.overall).toBe("REGRESSED");
    expect(details.regressedCount).toBe(1);
    expect(details.modules[0].delta).toBe("REGRESSED");
    expect(details.modules[0].deltaValue).toBe(-5);
  });

  test("NEW module — no prior baseline", async () => {
    const state = initializeState(NOW);
    const stryker = buildStrykerResult({ "src/new.ts": { score: 50 } });
    const result = await runRatchetGate({ config: cfg(), strykerResult: stryker, state });
    expect(result.status).toBe("pass");
    const details = result.details as any;
    expect(details.newCount).toBe(1);
    expect(details.modules[0].delta).toBe("NEW");
    expect(details.modules[0].deltaValue).toBeNull();
  });

  test("NO_SCORE module — score is null (no coverage)", async () => {
    const state = initializeState(NOW);
    const stryker = buildStrykerResult({ "src/empty.ts": { score: null } });
    const result = await runRatchetGate({ config: cfg(), strykerResult: stryker, state });
    expect(result.status).toBe("pass");
    const details = result.details as any;
    expect(details.noScoreCount).toBe(1);
    expect(details.modules[0].delta).toBe("NO_SCORE");
  });

  test("mixed: one regressed + one improved → overall REGRESSED, status fail", async () => {
    let state = stateWith("src/a.ts", 60);
    state = applyMutationMeasurement({
      state,
      modulePath: "src/b.ts",
      newScore: 70,
      tier: "business_60",
      runId: "run-0",
      timestamp: NOW,
    }).state;
    const stryker = buildStrykerResult({
      "src/a.ts": { score: 80 }, // improved
      "src/b.ts": { score: 65 }, // regressed
    });
    const result = await runRatchetGate({ config: cfg(), strykerResult: stryker, state });
    expect(result.status).toBe("fail");
    const details = result.details as any;
    expect(details.overall).toBe("REGRESSED");
    expect(details.improvedCount).toBe(1);
    expect(details.regressedCount).toBe(1);
  });

  test("mixed improved + unchanged → overall IMPROVED", async () => {
    let state = stateWith("src/a.ts", 60);
    state = applyMutationMeasurement({
      state,
      modulePath: "src/b.ts",
      newScore: 70,
      tier: "business_60",
      runId: "run-0",
      timestamp: NOW,
    }).state;
    const stryker = buildStrykerResult({
      "src/a.ts": { score: 80 },
      "src/b.ts": { score: 70 },
    });
    const result = await runRatchetGate({ config: cfg(), strykerResult: stryker, state });
    expect(result.status).toBe("pass");
    const details = result.details as any;
    expect(details.overall).toBe("IMPROVED");
  });

  test("writes evidence", async () => {
    const state = stateWith("src/a.ts", 60);
    const stryker = buildStrykerResult({ "src/a.ts": { score: 70 } });
    const result = await runRatchetGate({ config: cfg(), strykerResult: stryker, state });
    expect(result.artifacts).toHaveLength(1);
    const body = JSON.parse(await fs.readFile(result.artifacts[0]!, "utf8"));
    expect(body).toHaveProperty("overall");
    expect(body).toHaveProperty("modules");
  });
});
