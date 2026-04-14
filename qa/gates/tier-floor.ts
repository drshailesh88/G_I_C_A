/**
 * Gate 13 — Tier floor check.
 *
 * For each module in the Stryker result:
 *   - Resolve its tier (via classifyFile or declared tier on file score).
 *   - Look up the tier's floor from TierFloors.
 *   - If floor is null (ui_gates_only), skip.
 *   - Otherwise compare score to floor.
 *
 * The state's `has_exceeded_floor` distinguishes two failure modes:
 *   - below_never_reached: score < floor, the module has never been above
 *     the floor. Not yet a tier violation but flagged for progress.
 *   - regression_below_floor: score < floor AND has_exceeded_floor is true.
 *     This is a ratchet violation — the module was once above floor and
 *     has dropped back.
 *
 * Returns the overall gate status plus per-module verdicts.
 */
import {
  buildGateResult,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import {
  classifyFile,
  matchGlob,
} from "../parsers/stryker-json.js";
import {
  TierFloors,
  type GateResult,
  type StateJson,
  type StrykerResult,
  type Tier,
  type TierConfig,
} from "../types.js";

export const TIER_FLOOR_GATE_ID = "tier-floor";

export type TierFloorVerdict =
  | "at_or_above_floor"
  | "no_floor"
  | "below_never_reached"
  | "regression_below_floor"
  | "no_score";

export interface TierFloorModuleReport {
  filePath: string;
  tier: Tier | null;
  floor: number | null;
  score: number | null;
  hasExceededFloorPreviously: boolean;
  verdict: TierFloorVerdict;
}

export interface TierFloorDetails {
  totalModules: number;
  atOrAbove: number;
  regressionsBelowFloor: number;
  belowNeverReached: number;
  noFloor: number;
  noScore: number;
  modules: TierFloorModuleReport[];
}

export interface TierFloorInput {
  config: GateConfig;
  strykerResult: StrykerResult;
  tiers: TierConfig;
  state: StateJson;
}

export async function runTierFloorGate(
  input: TierFloorInput,
): Promise<GateResult> {
  const start = Date.now();
  const { config, strykerResult, tiers, state } = input;

  const modules: TierFloorModuleReport[] = [];
  let atOrAbove = 0;
  let regressionsBelowFloor = 0;
  let belowNeverReached = 0;
  let noFloor = 0;
  let noScore = 0;

  for (const [filePath, score] of strykerResult.perFile.entries()) {
    const tier = score.tier ?? classifyFile(filePath, tiers) ?? null;
    const floor = tier ? TierFloors[tier] : null;
    const baseline = state.modules[filePath];
    const hasExceeded = baseline?.has_exceeded_floor ?? false;

    let verdict: TierFloorVerdict;
    if (score.score === null) {
      verdict = "no_score";
      noScore++;
    } else if (tier === null || floor === null) {
      verdict = "no_floor";
      noFloor++;
    } else if (score.score >= floor) {
      verdict = "at_or_above_floor";
      atOrAbove++;
    } else if (hasExceeded) {
      verdict = "regression_below_floor";
      regressionsBelowFloor++;
    } else {
      verdict = "below_never_reached";
      belowNeverReached++;
    }

    modules.push({
      filePath,
      tier,
      floor,
      score: score.score,
      hasExceededFloorPreviously: hasExceeded,
      verdict,
    });
  }

  const details: TierFloorDetails = {
    totalModules: strykerResult.perFile.size,
    atOrAbove,
    regressionsBelowFloor,
    belowNeverReached,
    noFloor,
    noScore,
    modules,
  };

  const evidencePath = await writeEvidence(
    config.evidenceDir,
    TIER_FLOOR_GATE_ID,
    "report.json",
    JSON.stringify(details, null, 2),
  );

  // Gate fails on ANY regression below floor (hard ratchet violation).
  // below_never_reached is progress info, not a gate failure — the
  // controller decides whether to keep attempting repair.
  const status = regressionsBelowFloor > 0 ? "fail" : "pass";

  return buildGateResult({
    gateId: TIER_FLOOR_GATE_ID,
    status,
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [evidencePath],
    shortCircuit: false,
  });
}

// Re-export matchGlob for callers that need to test tier classification
// without pulling in the full Stryker parser.
export { matchGlob };
