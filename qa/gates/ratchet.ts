/**
 * Gate 14 — Ratchet check.
 *
 * Compares each module's freshly-measured Stryker score against the baseline
 * stored in state.json. Per blueprint B4:
 *
 *   - score > baseline  → IMPROVED (ratchet up; controller applies measurement)
 *   - score == baseline → UNCHANGED
 *   - score < baseline  → REGRESSED (REJECT; controller reverts the repair)
 *
 * Only modules with score != null are considered (no-coverage modules
 * return null and do not participate in the ratchet).
 *
 * Note: this gate is PURE — it does not mutate state.json. The controller
 * decides whether to apply the measurement (via state-manager
 * applyMutationMeasurement) after the iteration's overall verdict is in.
 */
import {
  buildGateResult,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import type {
  GateResult,
  StateJson,
  StrykerResult,
} from "../types.js";

export const RATCHET_GATE_ID = "ratchet";

export type ModuleRatchetDelta =
  | "IMPROVED"
  | "UNCHANGED"
  | "REGRESSED"
  | "NEW"
  | "NO_SCORE";

export interface ModuleRatchetReport {
  filePath: string;
  score: number | null;
  baseline: number | null;
  delta: ModuleRatchetDelta;
  /** score - baseline, null if either side is null. */
  deltaValue: number | null;
}

export interface RatchetDetails {
  overall: "IMPROVED" | "UNCHANGED" | "REGRESSED" | "MIXED_NO_REGRESSION";
  regressedCount: number;
  improvedCount: number;
  unchangedCount: number;
  newCount: number;
  noScoreCount: number;
  modules: ModuleRatchetReport[];
}

export interface RatchetInput {
  config: GateConfig;
  strykerResult: StrykerResult;
  state: StateJson;
}

export async function runRatchetGate(
  input: RatchetInput,
): Promise<GateResult> {
  const start = Date.now();
  const { config, strykerResult, state } = input;

  const modules: ModuleRatchetReport[] = [];
  let regressedCount = 0;
  let improvedCount = 0;
  let unchangedCount = 0;
  let newCount = 0;
  let noScoreCount = 0;

  for (const [filePath, score] of strykerResult.perFile.entries()) {
    const baseline = state.modules[filePath]?.mutation_baseline ?? null;
    let delta: ModuleRatchetDelta;
    let deltaValue: number | null = null;

    if (score.score === null) {
      delta = "NO_SCORE";
      noScoreCount++;
    } else if (baseline === null) {
      delta = "NEW";
      newCount++;
    } else {
      deltaValue = score.score - baseline;
      if (deltaValue > 0) {
        delta = "IMPROVED";
        improvedCount++;
      } else if (deltaValue < 0) {
        delta = "REGRESSED";
        regressedCount++;
      } else {
        delta = "UNCHANGED";
        unchangedCount++;
      }
    }

    modules.push({ filePath, score: score.score, baseline, delta, deltaValue });
  }

  let overall: RatchetDetails["overall"];
  if (regressedCount > 0) {
    overall = "REGRESSED";
  } else if (improvedCount > 0) {
    overall = "IMPROVED";
  } else if (unchangedCount > 0 || newCount > 0) {
    overall = "UNCHANGED";
  } else {
    overall = "UNCHANGED";
  }

  // If we have improvements AND no regressions, still report overall as
  // IMPROVED. If there are neither improvements nor regressions (only
  // unchanged/new/noscore), overall is UNCHANGED.
  if (overall === "UNCHANGED" && (improvedCount > 0 || newCount > 0)) {
    overall = improvedCount > 0 ? "IMPROVED" : "UNCHANGED";
  }

  const details: RatchetDetails = {
    overall,
    regressedCount,
    improvedCount,
    unchangedCount,
    newCount,
    noScoreCount,
    modules,
  };

  const evidencePath = await writeEvidence(
    config.evidenceDir,
    RATCHET_GATE_ID,
    "report.json",
    JSON.stringify(details, null, 2),
  );

  const status = regressedCount > 0 ? "fail" : "pass";

  return buildGateResult({
    gateId: RATCHET_GATE_ID,
    status,
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [evidencePath],
    shortCircuit: false,
  });
}
