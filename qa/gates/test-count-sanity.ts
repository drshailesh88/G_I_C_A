/**
 * Gate 11 — Test count sanity (blueprint 8a addition).
 *
 * Pure logic — no subprocess. Consumes:
 *   - The current session's measured test counts (vitest unit/integration
 *     and playwright totals).
 *   - The StateJson's test_count_history.
 *
 * Delegates to state-manager.checkTestCountSanity. HARD short-circuit on any
 * anomaly: output truncated, >20% drop, or >500% growth.
 */
import {
  buildGateResult,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import type { GateResult, StateJson } from "../types.js";
import {
  checkTestCountSanity,
  type TestCountAnomaly,
  type TestCountSample,
} from "../state-manager.js";

export const TEST_COUNT_SANITY_GATE_ID = "test-count-sanity";

export interface TestCountSanityDetails {
  sample: TestCountSample;
  anomalies: TestCountAnomaly[];
  historySummary: {
    vitest_unit_last?: number;
    vitest_integration_last?: number;
    playwright_last?: number;
  };
  thresholds: {
    maxDropPct: number;
    maxGrowthPct: number;
  };
}

export interface TestCountSanityInput {
  config: GateConfig;
  state: StateJson;
  sample: TestCountSample;
  /** Override thresholds; defaults mirror state-manager defaults. */
  maxDropPct?: number;
  maxGrowthPct?: number;
}

export async function runTestCountSanityGate(
  input: TestCountSanityInput,
): Promise<GateResult> {
  const start = Date.now();
  const maxDropPct = input.maxDropPct ?? 20;
  const maxGrowthPct = input.maxGrowthPct ?? 500;

  const { ok, anomalies } = checkTestCountSanity(input.state, input.sample, {
    maxDropPct,
    maxGrowthPct,
  });

  const history = input.state.test_count_history;
  const details: TestCountSanityDetails = {
    sample: input.sample,
    anomalies,
    historySummary: {
      ...(history.vitest_unit.length > 0
        ? { vitest_unit_last: history.vitest_unit[history.vitest_unit.length - 1] }
        : {}),
      ...(history.vitest_integration.length > 0
        ? {
            vitest_integration_last:
              history.vitest_integration[history.vitest_integration.length - 1],
          }
        : {}),
      ...(history.playwright.length > 0
        ? { playwright_last: history.playwright[history.playwright.length - 1] }
        : {}),
    },
    thresholds: { maxDropPct, maxGrowthPct },
  };

  const evidencePath = await writeEvidence(
    input.config.evidenceDir,
    TEST_COUNT_SANITY_GATE_ID,
    "report.json",
    JSON.stringify(details, null, 2),
  );

  return buildGateResult({
    gateId: TEST_COUNT_SANITY_GATE_ID,
    status: ok ? "pass" : "fail",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [evidencePath],
    // HARD short-circuit — data integrity failure.
    shortCircuit: !ok,
  });
}
