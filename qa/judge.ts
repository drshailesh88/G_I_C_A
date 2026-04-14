/**
 * Judge — per-iteration decision function (blueprint Part 5.2 + 5.3).
 *
 * Given a bundle of gate results + diff audit result + state, returns one of
 * five outcomes:
 *
 *   GREEN               All mandatory gates pass, mutation ratcheted (no
 *                       regression), tier floors met.
 *   IMPROVED_NOT_GREEN  Not GREEN but measurable progress (ratchet IMPROVED
 *                       or UNCHANGED, no regressions). Commit and keep going.
 *   REGRESSED           Mutation score regressed vs baseline, OR tier floor
 *                       regression detected. Revert to pre-attempt checkpoint.
 *   VIOLATION           Diff audit caught a cheating pattern. Locked paths
 *                       already reverted elsewhere; feed violation into next
 *                       packet.
 *   BLOCKED             Integrity breach (contract hashes / lock manifest /
 *                       test count sanity / contract test count). Session
 *                       must abort for this feature.
 *
 * Short-circuit rules from Part 5.3:
 *   - Integrity gates (contract-hash-verify, lock-manifest-verify) → BLOCKED
 *   - contract-test-count shortCircuit → BLOCKED (test deletion signal)
 *   - test-count-sanity shortCircuit → BLOCKED (data corruption)
 *
 * Judge is PURE. It reads state.json but never mutates it. The caller
 * (feature loop) decides whether to apply a measurement, revert a
 * checkpoint, or log violations.
 */
import type {
  GateResult,
  IterationOutcome,
  StateJson,
} from "./types.js";
import type { DiffAuditResult } from "./diff-audit/diff-audit.js";

export interface JudgeInput {
  gateResults: GateResult[];
  diffAudit: DiffAuditResult | undefined;
  state: StateJson;
}

export interface JudgeReasoning {
  outcome: IterationOutcome;
  primaryGateId?: string;
  reason: string;
  signals: string[];
}

/** Gates whose failure implies a hard integrity breach. */
const INTEGRITY_GATE_IDS: readonly string[] = [
  "contract-hash-verify",
  "lock-manifest-verify",
];

/** Gates whose short-circuit failure implies data corruption / test deletion.
 * These fall through to BLOCKED regardless of test pass state. */
const HARD_SANITY_GATE_IDS: readonly string[] = [
  "contract-test-count",
  "test-count-sanity",
];

/** Gates that must ALL pass for GREEN. Absent gates count as pass (the
 * iteration may have short-circuited before reaching them). */
const MANDATORY_PASS_GATE_IDS: readonly string[] = [
  "tsc",
  "eslint",
  "vitest-unit",
  "vitest-integration",
  "playwright-targeted",
  "contract-test-count",
  "test-count-sanity",
  "knip",
];

/** Ratchet-sensitive gates — a fail here flips the iteration to REGRESSED
 * unless an integrity breach already forced BLOCKED. */
const RATCHET_GATE_IDS: readonly string[] = ["ratchet", "tier-floor"];

export function judgeIteration(input: JudgeInput): JudgeReasoning {
  const signals: string[] = [];
  const byId = indexByGateId(input.gateResults);

  // 1. Integrity breach → BLOCKED (highest priority)
  for (const gateId of INTEGRITY_GATE_IDS) {
    const gate = byId.get(gateId);
    if (gate && gate.status === "fail") {
      return {
        outcome: "BLOCKED",
        primaryGateId: gateId,
        reason: `integrity breach: ${gateId} failed (shortCircuit=${gate.shortCircuit})`,
        signals: [`${gateId}: ${summarizeGate(gate)}`],
      };
    }
  }

  // 2. Diff audit violations → VIOLATION
  if (input.diffAudit && input.diffAudit.violations.length > 0) {
    const sample = input.diffAudit.violations.slice(0, 3);
    return {
      outcome: "VIOLATION",
      reason: `diff audit caught ${input.diffAudit.violations.length} violation(s)`,
      signals: sample.map(
        (v) => `${v.patternId} in ${v.file}${v.line ? `:${v.line}` : ""}`,
      ),
    };
  }

  // 3. Hard sanity failures → BLOCKED (test deletion / data corruption)
  for (const gateId of HARD_SANITY_GATE_IDS) {
    const gate = byId.get(gateId);
    if (gate && gate.status === "fail" && gate.shortCircuit) {
      return {
        outcome: "BLOCKED",
        primaryGateId: gateId,
        reason: `hard sanity failure: ${gateId} (shortCircuit=true)`,
        signals: [summarizeGate(gate)],
      };
    }
  }

  // 4. Ratchet / tier-floor regression → REGRESSED
  for (const gateId of RATCHET_GATE_IDS) {
    const gate = byId.get(gateId);
    if (gate && gate.status === "fail") {
      return {
        outcome: "REGRESSED",
        primaryGateId: gateId,
        reason: `ratchet regression detected: ${gateId}`,
        signals: [summarizeGate(gate)],
      };
    }
  }

  // 5. Compute overall verdict based on pass/fail of mandatory gates.
  const mandatoryFailures: string[] = [];
  for (const gateId of MANDATORY_PASS_GATE_IDS) {
    const gate = byId.get(gateId);
    if (!gate) continue; // gate didn't run — treat as absent/not-failed
    if (gate.status === "fail" || gate.status === "error") {
      mandatoryFailures.push(gateId);
      signals.push(`${gateId}: ${summarizeGate(gate)}`);
    }
  }

  if (mandatoryFailures.length === 0) {
    // All mandatory gates pass. Is mutation improving or static?
    const ratchetGate = byId.get("ratchet");
    if (ratchetGate?.status === "pass") {
      return {
        outcome: "GREEN",
        reason: "all mandatory gates pass, ratchet clean",
        signals: ["all gates pass"],
      };
    }
    // Ratchet didn't run or passed without a gate result → still GREEN.
    return {
      outcome: "GREEN",
      reason: "all mandatory gates pass",
      signals: ["all gates pass"],
    };
  }

  // 6. Something failed but not integrity / not ratchet regression → partial
  // progress. Return IMPROVED_NOT_GREEN — the feature loop will commit and
  // reuse baselines as the new starting point. Plateau detection handles
  // "stuck" cases upstream.
  return {
    outcome: "IMPROVED_NOT_GREEN",
    reason: `${mandatoryFailures.length} gate(s) failed but no ratchet regression: ${mandatoryFailures.join(", ")}`,
    signals,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function indexByGateId(results: GateResult[]): Map<string, GateResult> {
  const m = new Map<string, GateResult>();
  for (const r of results) m.set(r.gateId, r);
  return m;
}

function summarizeGate(gate: GateResult): string {
  const details = gate.details as Record<string, unknown>;
  const pieces: string[] = [`status=${gate.status}`];

  if (typeof details.failed === "number") {
    pieces.push(`failed=${details.failed}`);
  }
  if (typeof details.errorCount === "number") {
    pieces.push(`errors=${details.errorCount}`);
  }
  if (typeof details.regressedCount === "number" && details.regressedCount > 0) {
    pieces.push(`regressed=${details.regressedCount}`);
  }
  if (
    typeof details.regressionsBelowFloor === "number" &&
    details.regressionsBelowFloor > 0
  ) {
    pieces.push(`floor_violations=${details.regressionsBelowFloor}`);
  }
  if (Array.isArray(details.mismatches) && details.mismatches.length > 0) {
    pieces.push(`mismatches=${details.mismatches.length}`);
  }
  if (Array.isArray(details.anomalies) && details.anomalies.length > 0) {
    pieces.push(`anomalies=${details.anomalies.length}`);
  }
  if (typeof details.mismatchDelta === "number" && details.mismatchDelta !== 0) {
    pieces.push(`delta=${details.mismatchDelta}`);
  }
  if (typeof details.parseError === "string") {
    pieces.push(`parseError="${details.parseError.slice(0, 80)}"`);
  }
  return pieces.join(" ");
}

// ─── Plateau signature builder ──────────────────────────────────────────────

/**
 * Build a stable hash of (failed_gate + first_error + metric_snapshot) per
 * blueprint P2. Identical signatures across 3 consecutive iterations =
 * plateau (feature loop marks BLOCKED).
 */
export function computePlateauSignature(input: JudgeInput): string {
  const parts: string[] = [];
  for (const gate of input.gateResults) {
    if (gate.status === "pass" || gate.status === "skipped") continue;
    parts.push(gate.gateId);
    const details = gate.details as Record<string, unknown>;
    const failures = (details.failures as Array<{ error?: string }>) ?? [];
    if (failures[0]?.error) {
      parts.push(failures[0].error.slice(0, 160));
    }
    if (typeof details.errorCount === "number") {
      parts.push(`errors=${details.errorCount}`);
    }
    if (typeof details.mismatchDelta === "number") {
      parts.push(`delta=${details.mismatchDelta}`);
    }
  }
  if (input.diffAudit) {
    for (const v of input.diffAudit.violations.slice(0, 5)) {
      parts.push(`violation:${v.patternId}@${v.file}`);
    }
  }
  // Incorporate the per-module mutation score snapshot if present.
  const ratchet = input.gateResults.find((g) => g.gateId === "ratchet");
  if (ratchet) {
    const modules =
      ((ratchet.details as Record<string, unknown>).modules as Array<{
        filePath: string;
        score: number | null;
      }>) ?? [];
    for (const m of modules) {
      parts.push(`${m.filePath}:${m.score ?? "null"}`);
    }
  }
  // Simple hash: join + fnv-1a 64-bit (JS-safe). We cap the length to make
  // signatures log-friendly.
  return fnv1a64(parts.join("|"));
}

function fnv1a64(s: string): string {
  // JS lacks native 64-bit ints; use BigInt.
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < s.length; i++) {
    hash ^= BigInt(s.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}
