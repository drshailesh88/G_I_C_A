import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  runTestCountSanityGate,
  TEST_COUNT_SANITY_GATE_ID,
} from "./test-count-sanity.js";
import { appendTestCountHistory, initializeState } from "../state-manager.js";
import type { GateConfig } from "./base.js";

let root: string;
beforeEach(async () => {
  root = join(tmpdir(), `tcs-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(join(root, "evidence"), { recursive: true });
});
afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

const NOW = "2026-04-14T22:00:00Z";

function cfg(): GateConfig {
  return {
    runId: "run-1",
    workingDir: root,
    evidenceDir: join(root, "evidence"),
  };
}

describe("runTestCountSanityGate", () => {
  test("pass on first measurement (no history to compare)", async () => {
    const state = initializeState(NOW);
    const result = await runTestCountSanityGate({
      config: cfg(),
      state,
      sample: { vitest_unit: 200, vitest_integration: 80, playwright: 40 },
    });
    expect(result.status).toBe("pass");
    expect(result.gateId).toBe(TEST_COUNT_SANITY_GATE_ID);
    expect((result.details as any).anomalies).toEqual([]);
  });

  test("pass on stable counts", async () => {
    let state = initializeState(NOW);
    state = appendTestCountHistory(state, { vitest_unit: 200 }, NOW);
    const result = await runTestCountSanityGate({
      config: cfg(),
      state,
      sample: { vitest_unit: 195 }, // 2.5% drop — within tolerance
    });
    expect(result.status).toBe("pass");
  });

  test("fail on drop-to-zero", async () => {
    let state = initializeState(NOW);
    state = appendTestCountHistory(state, { vitest_unit: 200 }, NOW);
    const result = await runTestCountSanityGate({
      config: cfg(),
      state,
      sample: { vitest_unit: 0 },
    });
    expect(result.status).toBe("fail");
    expect(result.shortCircuit).toBe(true);
    const details = result.details as any;
    expect(details.anomalies[0].runner).toBe("vitest_unit");
    expect(details.anomalies[0].reason).toMatch(/truncated/);
  });

  test("fail on >20% drop", async () => {
    let state = initializeState(NOW);
    state = appendTestCountHistory(state, { vitest_unit: 200 }, NOW);
    const result = await runTestCountSanityGate({
      config: cfg(),
      state,
      sample: { vitest_unit: 120 }, // 40% drop
    });
    expect(result.status).toBe("fail");
    expect(result.shortCircuit).toBe(true);
  });

  test("fail on extreme growth", async () => {
    let state = initializeState(NOW);
    state = appendTestCountHistory(state, { vitest_unit: 10 }, NOW);
    const result = await runTestCountSanityGate({
      config: cfg(),
      state,
      sample: { vitest_unit: 1000 }, // 9900% growth
    });
    expect(result.status).toBe("fail");
    expect(result.shortCircuit).toBe(true);
  });

  test("respects custom thresholds", async () => {
    let state = initializeState(NOW);
    state = appendTestCountHistory(state, { vitest_unit: 100 }, NOW);
    // 10% drop with default maxDropPct=20 → pass
    const defaultResult = await runTestCountSanityGate({
      config: cfg(),
      state,
      sample: { vitest_unit: 90 },
    });
    expect(defaultResult.status).toBe("pass");
    // Custom threshold of 5 → fail
    const strictResult = await runTestCountSanityGate({
      config: cfg(),
      state,
      sample: { vitest_unit: 90 },
      maxDropPct: 5,
    });
    expect(strictResult.status).toBe("fail");
  });

  test("anomaly in one runner flags overall fail", async () => {
    let state = initializeState(NOW);
    state = appendTestCountHistory(
      state,
      { vitest_unit: 200, vitest_integration: 80, playwright: 40 },
      NOW,
    );
    const result = await runTestCountSanityGate({
      config: cfg(),
      state,
      sample: { vitest_unit: 200, vitest_integration: 20, playwright: 40 },
    });
    expect(result.status).toBe("fail");
    const anomalies = (result.details as any).anomalies;
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].runner).toBe("vitest_integration");
  });

  test("writes evidence", async () => {
    const state = initializeState(NOW);
    const result = await runTestCountSanityGate({
      config: cfg(),
      state,
      sample: { vitest_unit: 100 },
    });
    expect(result.artifacts).toHaveLength(1);
    const body = JSON.parse(await fs.readFile(result.artifacts[0]!, "utf8"));
    expect(body).toHaveProperty("sample");
    expect(body).toHaveProperty("anomalies");
    expect(body).toHaveProperty("thresholds");
  });

  test("history summary reflects last observed counts", async () => {
    let state = initializeState(NOW);
    state = appendTestCountHistory(
      state,
      { vitest_unit: 100, playwright: 40 },
      NOW,
    );
    state = appendTestCountHistory(
      state,
      { vitest_unit: 110, playwright: 45 },
      NOW,
    );
    const result = await runTestCountSanityGate({
      config: cfg(),
      state,
      sample: { vitest_unit: 115 },
    });
    const summary = (result.details as any).historySummary;
    expect(summary.vitest_unit_last).toBe(110);
    expect(summary.playwright_last).toBe(45);
  });
});
