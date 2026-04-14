import { describe, expect, test } from "vitest";
import { computePlateauSignature, judgeIteration } from "./judge.js";
import { initializeState } from "./state-manager.js";
import type { GateResult, GateStatus } from "./types.js";
import type { DiffAuditResult } from "./diff-audit/diff-audit.js";

const NOW = "2026-04-14T22:00:00Z";

function gate(
  gateId: string,
  status: GateStatus,
  details: Record<string, unknown> = {},
  shortCircuit = false,
): GateResult {
  return {
    gateId,
    status,
    durationMs: 100,
    details,
    artifacts: [],
    shortCircuit,
  };
}

function passBundle(): GateResult[] {
  return [
    gate("contract-hash-verify", "pass"),
    gate("lock-manifest-verify", "pass"),
    gate("tsc", "pass"),
    gate("eslint", "pass"),
    gate("knip", "pass"),
    gate("vitest-unit", "pass", { total: 10, passed: 10, failed: 0 }),
    gate("vitest-integration", "pass"),
    gate("playwright-targeted", "pass"),
    gate("contract-test-count", "pass"),
    gate("test-count-sanity", "pass"),
    gate("stryker-incremental", "pass"),
    gate("tier-floor", "pass"),
    gate("ratchet", "pass", { overall: "IMPROVED" }),
  ];
}

function emptyAudit(): DiffAuditResult {
  return {
    violations: [],
    warnings: [],
    astByFile: new Map(),
    changedFiles: [],
    patternsApplied: 15,
  };
}

// ─── GREEN ────────────────────────────────────────────────────────────────────

describe("judgeIteration — GREEN", () => {
  test("all gates pass + ratchet clean", () => {
    const r = judgeIteration({
      gateResults: passBundle(),
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(r.outcome).toBe("GREEN");
  });

  test("GREEN when ratchet gate absent but all mandatory pass", () => {
    const bundle = passBundle().filter((g) => g.gateId !== "ratchet");
    const r = judgeIteration({
      gateResults: bundle,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(r.outcome).toBe("GREEN");
  });
});

// ─── BLOCKED — integrity breach ──────────────────────────────────────────────

describe("judgeIteration — BLOCKED (integrity)", () => {
  test("contract-hash-verify fail → BLOCKED immediately", () => {
    const bundle = passBundle();
    bundle[0] = gate("contract-hash-verify", "fail", { mismatches: [{ file: "x" }] }, true);
    const r = judgeIteration({
      gateResults: bundle,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(r.outcome).toBe("BLOCKED");
    expect(r.primaryGateId).toBe("contract-hash-verify");
    expect(r.reason).toContain("integrity breach");
  });

  test("lock-manifest-verify fail → BLOCKED", () => {
    const bundle = passBundle();
    bundle[1] = gate("lock-manifest-verify", "fail", { mismatches: [{ file: "vitest.config.ts" }] }, true);
    const r = judgeIteration({
      gateResults: bundle,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(r.outcome).toBe("BLOCKED");
    expect(r.primaryGateId).toBe("lock-manifest-verify");
  });
});

// ─── VIOLATION — diff audit ──────────────────────────────────────────────────

describe("judgeIteration — VIOLATION", () => {
  test("diff audit violations → VIOLATION", () => {
    const r = judgeIteration({
      gateResults: passBundle(),
      diffAudit: {
        violations: [
          {
            source: "regex",
            patternId: "SKIP_ADDED",
            severity: "reject",
            file: "tests/unit/a.test.ts",
            line: 10,
          },
        ],
        warnings: [],
        astByFile: new Map(),
        changedFiles: ["tests/unit/a.test.ts"],
        patternsApplied: 15,
      },
      state: initializeState(NOW),
    });
    expect(r.outcome).toBe("VIOLATION");
    expect(r.reason).toContain("1 violation");
    expect(r.signals[0]).toContain("SKIP_ADDED");
  });

  test("warnings alone do not trigger VIOLATION", () => {
    const r = judgeIteration({
      gateResults: passBundle(),
      diffAudit: {
        violations: [],
        warnings: [
          {
            source: "regex",
            patternId: "EXCESSIVE_MOCKING",
            severity: "warn",
            file: "tests/a.test.ts",
          },
        ],
        astByFile: new Map(),
        changedFiles: [],
        patternsApplied: 15,
      },
      state: initializeState(NOW),
    });
    expect(r.outcome).toBe("GREEN");
  });
});

// ─── BLOCKED — hard sanity ───────────────────────────────────────────────────

describe("judgeIteration — BLOCKED (hard sanity)", () => {
  test("contract-test-count short-circuit → BLOCKED", () => {
    const bundle = passBundle();
    bundle[8] = gate("contract-test-count", "fail", { mismatchDelta: -3 }, true);
    const r = judgeIteration({
      gateResults: bundle,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(r.outcome).toBe("BLOCKED");
    expect(r.primaryGateId).toBe("contract-test-count");
  });

  test("test-count-sanity short-circuit → BLOCKED", () => {
    const bundle = passBundle();
    bundle[9] = gate("test-count-sanity", "fail", { anomalies: [{ reason: "truncated" }] }, true);
    const r = judgeIteration({
      gateResults: bundle,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(r.outcome).toBe("BLOCKED");
    expect(r.primaryGateId).toBe("test-count-sanity");
  });
});

// ─── REGRESSED ───────────────────────────────────────────────────────────────

describe("judgeIteration — REGRESSED", () => {
  test("ratchet fail → REGRESSED", () => {
    const bundle = passBundle();
    bundle[12] = gate("ratchet", "fail", {
      overall: "REGRESSED",
      regressedCount: 1,
      improvedCount: 0,
    });
    const r = judgeIteration({
      gateResults: bundle,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(r.outcome).toBe("REGRESSED");
    expect(r.primaryGateId).toBe("ratchet");
  });

  test("tier-floor fail → REGRESSED", () => {
    const bundle = passBundle();
    bundle[11] = gate("tier-floor", "fail", { regressionsBelowFloor: 2 });
    const r = judgeIteration({
      gateResults: bundle,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(r.outcome).toBe("REGRESSED");
    expect(r.primaryGateId).toBe("tier-floor");
  });
});

// ─── IMPROVED_NOT_GREEN ──────────────────────────────────────────────────────

describe("judgeIteration — IMPROVED_NOT_GREEN", () => {
  test("test fails but ratchet clean → IMPROVED_NOT_GREEN", () => {
    const bundle = passBundle();
    bundle[5] = gate("vitest-unit", "fail", { total: 10, passed: 8, failed: 2 });
    const r = judgeIteration({
      gateResults: bundle,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(r.outcome).toBe("IMPROVED_NOT_GREEN");
    expect(r.reason).toContain("vitest-unit");
  });

  test("multiple failures but no regression → IMPROVED_NOT_GREEN", () => {
    const bundle = passBundle();
    bundle[3] = gate("eslint", "fail", { errorCount: 1 });
    bundle[5] = gate("vitest-unit", "fail", { failed: 1 });
    const r = judgeIteration({
      gateResults: bundle,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(r.outcome).toBe("IMPROVED_NOT_GREEN");
    expect(r.signals.length).toBeGreaterThanOrEqual(2);
  });

  test("gate 'error' status also counts as failure", () => {
    const bundle = passBundle();
    bundle[4] = gate("knip", "error", { parseError: "JSON parse failed" });
    const r = judgeIteration({
      gateResults: bundle,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(r.outcome).toBe("IMPROVED_NOT_GREEN");
  });
});

// ─── Precedence ──────────────────────────────────────────────────────────────

describe("judgeIteration — precedence", () => {
  test("integrity failure beats everything else", () => {
    const bundle = passBundle();
    bundle[0] = gate("contract-hash-verify", "fail", {}, true);
    bundle[5] = gate("vitest-unit", "fail", { failed: 5 });
    bundle[12] = gate("ratchet", "fail", { regressedCount: 3 });

    const r = judgeIteration({
      gateResults: bundle,
      diffAudit: {
        violations: [
          {
            source: "regex",
            patternId: "SKIP_ADDED",
            severity: "reject",
            file: "a.test.ts",
          },
        ],
        warnings: [],
        astByFile: new Map(),
        changedFiles: [],
        patternsApplied: 15,
      },
      state: initializeState(NOW),
    });
    expect(r.outcome).toBe("BLOCKED"); // integrity wins
  });

  test("violation beats ratchet failure", () => {
    const bundle = passBundle();
    bundle[12] = gate("ratchet", "fail", { regressedCount: 1 });
    const r = judgeIteration({
      gateResults: bundle,
      diffAudit: {
        violations: [
          {
            source: "regex",
            patternId: "ONLY_ADDED",
            severity: "reject",
            file: "a.test.ts",
          },
        ],
        warnings: [],
        astByFile: new Map(),
        changedFiles: [],
        patternsApplied: 15,
      },
      state: initializeState(NOW),
    });
    expect(r.outcome).toBe("VIOLATION");
  });

  test("hard sanity beats ratchet", () => {
    const bundle = passBundle();
    bundle[8] = gate("contract-test-count", "fail", { mismatchDelta: -2 }, true);
    bundle[12] = gate("ratchet", "fail", { regressedCount: 1 });
    const r = judgeIteration({
      gateResults: bundle,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(r.outcome).toBe("BLOCKED"); // sanity wins
  });
});

// ─── computePlateauSignature ─────────────────────────────────────────────────

describe("computePlateauSignature", () => {
  test("identical failures produce identical signatures", () => {
    const bundle1 = passBundle();
    bundle1[5] = gate("vitest-unit", "fail", {
      total: 10,
      failed: 1,
      failures: [{ error: "expected true got false" }],
    });
    const bundle2 = [...bundle1];

    const sig1 = computePlateauSignature({
      gateResults: bundle1,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    const sig2 = computePlateauSignature({
      gateResults: bundle2,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(sig1).toBe(sig2);
  });

  test("different errors produce different signatures", () => {
    const bundle1 = passBundle();
    bundle1[5] = gate("vitest-unit", "fail", {
      failures: [{ error: "error A" }],
    });
    const bundle2 = passBundle();
    bundle2[5] = gate("vitest-unit", "fail", {
      failures: [{ error: "error B" }],
    });

    const sig1 = computePlateauSignature({
      gateResults: bundle1,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    const sig2 = computePlateauSignature({
      gateResults: bundle2,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(sig1).not.toBe(sig2);
  });

  test("mutation score drift changes signature", () => {
    const bundle1 = passBundle();
    bundle1[12] = gate("ratchet", "fail", {
      regressedCount: 1,
      modules: [{ filePath: "src/a.ts", score: 50 }],
    });
    const bundle2 = passBundle();
    bundle2[12] = gate("ratchet", "fail", {
      regressedCount: 1,
      modules: [{ filePath: "src/a.ts", score: 55 }],
    });
    const sig1 = computePlateauSignature({
      gateResults: bundle1,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    const sig2 = computePlateauSignature({
      gateResults: bundle2,
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(sig1).not.toBe(sig2);
  });

  test("signature stable when all gates pass", () => {
    const sig = computePlateauSignature({
      gateResults: passBundle(),
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(sig).toMatch(/^[0-9a-f]{16}$/);
  });

  test("diff audit violations influence signature", () => {
    const withViolation: DiffAuditResult = {
      violations: [
        {
          source: "regex",
          patternId: "SKIP_ADDED",
          severity: "reject",
          file: "tests/a.test.ts",
        },
      ],
      warnings: [],
      astByFile: new Map(),
      changedFiles: [],
      patternsApplied: 15,
    };
    const sigA = computePlateauSignature({
      gateResults: passBundle(),
      diffAudit: withViolation,
      state: initializeState(NOW),
    });
    const sigB = computePlateauSignature({
      gateResults: passBundle(),
      diffAudit: emptyAudit(),
      state: initializeState(NOW),
    });
    expect(sigA).not.toBe(sigB);
  });
});
