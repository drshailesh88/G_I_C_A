import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  acquireSessionLock,
  appendTestCountHistory,
  applyMutationMeasurement,
  checkTestCountSanity,
  detectPlateau,
  endRun,
  forceAcquireSessionLock,
  incrementFeatureAttempt,
  incrementViolationCount,
  initializeState,
  isLockAlive,
  isLockStale,
  markFeatureBlocked,
  markFeatureGreen,
  readSessionLock,
  readState,
  recordRunFeatureOutcome,
  releaseSessionLock,
  resetFeatureAttempts,
  resetModuleBaseline,
  runPreflight,
  startRun,
  writeState,
} from "./state-manager.js";
import {
  ConcurrentRunError,
  DirtyWorkingTreeError,
  ParseError,
  QaError,
  RatchetViolationError,
  StaleLockError,
  StateCorruptionError,
  type StateJson,
  type SessionLock,
} from "./types.js";

let workDir: string;

beforeEach(async () => {
  workDir = join(tmpdir(), `qa-test-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(workDir, { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(workDir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

const NOW = "2026-04-14T22:00:00Z";
const LATER = "2026-04-14T22:30:00Z";
const RUN_ID = "run-2026-04-14-001";

function freshState(): StateJson {
  return initializeState(NOW);
}

// ─── readState / writeState ──────────────────────────────────────────────────

describe("readState / writeState", () => {
  test("round-trips a valid state", async () => {
    const statePath = join(workDir, "state.json");
    const state = freshState();
    await writeState(statePath, state);
    const loaded = await readState(statePath);
    expect(loaded).toEqual(state);
  });

  test("throws StateCorruptionError when file missing", async () => {
    const statePath = join(workDir, "missing.json");
    await expect(readState(statePath)).rejects.toBeInstanceOf(StateCorruptionError);
  });

  test("throws StateCorruptionError on empty file", async () => {
    const statePath = join(workDir, "empty.json");
    await fs.writeFile(statePath, "");
    await expect(readState(statePath)).rejects.toBeInstanceOf(StateCorruptionError);
  });

  test("throws StateCorruptionError on invalid JSON", async () => {
    const statePath = join(workDir, "bad.json");
    await fs.writeFile(statePath, "{not json");
    await expect(readState(statePath)).rejects.toBeInstanceOf(StateCorruptionError);
  });

  test("throws StateCorruptionError on schema_version drift", async () => {
    const statePath = join(workDir, "drift.json");
    await fs.writeFile(
      statePath,
      JSON.stringify({ schema_version: 2, last_updated: NOW }),
    );
    await expect(readState(statePath)).rejects.toBeInstanceOf(StateCorruptionError);
  });

  test("writeState creates parent directory", async () => {
    const statePath = join(workDir, "nested", "dir", "state.json");
    await writeState(statePath, freshState());
    const stat = await fs.stat(statePath);
    expect(stat.isFile()).toBe(true);
  });

  test("writeState is atomic (no partial file on crash)", async () => {
    const statePath = join(workDir, "state.json");
    await writeState(statePath, freshState());

    // Sabotage: monkey-patch fs.rename to throw after tmp file is created.
    const real = fs.rename.bind(fs);
    const spy = vi.spyOn(fs, "rename").mockRejectedValueOnce(new Error("boom"));

    await expect(writeState(statePath, freshState())).rejects.toThrow("boom");
    spy.mockRestore();

    // Original file should still be readable (untouched).
    const loaded = await readState(statePath);
    expect(loaded.schema_version).toBe(1);

    // No .tmp leftover.
    const entries = await fs.readdir(workDir);
    expect(entries.some((f) => f.includes(".tmp."))).toBe(false);

    void real;
  });

  test("writeState re-validates with Zod before writing", async () => {
    const statePath = join(workDir, "state.json");
    const bad = { ...freshState(), schema_version: 2 } as unknown as StateJson;
    await expect(writeState(statePath, bad)).rejects.toThrow();
  });
});

// ─── applyMutationMeasurement (B4 ratchet) ───────────────────────────────────

describe("applyMutationMeasurement", () => {
  test("creates new baseline when module is unseen", () => {
    const { state, outcome, baseline } = applyMutationMeasurement({
      state: freshState(),
      modulePath: "src/auth/login.ts",
      newScore: 82,
      tier: "critical_75",
      runId: RUN_ID,
      timestamp: NOW,
    });
    expect(outcome).toBe("created");
    expect(baseline.mutation_baseline).toBe(82);
    expect(baseline.has_exceeded_floor).toBe(true); // 82 >= 75
    expect(state.modules["src/auth/login.ts"]).toBeDefined();
  });

  test("ratchets up on higher measurement", () => {
    const state0 = freshState();
    const { state: state1 } = applyMutationMeasurement({
      state: state0,
      modulePath: "src/auth/login.ts",
      newScore: 70,
      tier: "critical_75",
      runId: RUN_ID,
      timestamp: NOW,
    });
    const { state: state2, outcome, baseline } = applyMutationMeasurement({
      state: state1,
      modulePath: "src/auth/login.ts",
      newScore: 82,
      tier: "critical_75",
      runId: RUN_ID,
      timestamp: LATER,
    });
    expect(outcome).toBe("ratcheted_up");
    expect(baseline.mutation_baseline).toBe(82);
    expect(state2.modules["src/auth/login.ts"]?.mutation_baseline_set_at).toBe(LATER);
  });

  test("unchanged on equal measurement", () => {
    const state0 = freshState();
    const { state: state1 } = applyMutationMeasurement({
      state: state0,
      modulePath: "src/auth/login.ts",
      newScore: 80,
      tier: "critical_75",
      runId: RUN_ID,
      timestamp: NOW,
    });
    const { state: state2, outcome } = applyMutationMeasurement({
      state: state1,
      modulePath: "src/auth/login.ts",
      newScore: 80,
      tier: "critical_75",
      runId: RUN_ID,
      timestamp: LATER,
    });
    expect(outcome).toBe("unchanged");
    expect(state2.modules["src/auth/login.ts"]?.mutation_baseline_set_at).toBe(NOW);
  });

  test("throws RatchetViolationError on downward move", () => {
    const state0 = freshState();
    const { state: state1 } = applyMutationMeasurement({
      state: state0,
      modulePath: "src/auth/login.ts",
      newScore: 80,
      tier: "critical_75",
      runId: RUN_ID,
      timestamp: NOW,
    });
    expect(() =>
      applyMutationMeasurement({
        state: state1,
        modulePath: "src/auth/login.ts",
        newScore: 75,
        tier: "critical_75",
        runId: RUN_ID,
        timestamp: LATER,
      }),
    ).toThrow(RatchetViolationError);
  });

  test("has_exceeded_floor is monotonic — never cleared by equal/unchanged measurements", () => {
    const state0 = freshState();
    const { state: state1 } = applyMutationMeasurement({
      state: state0,
      modulePath: "src/auth/login.ts",
      newScore: 80,
      tier: "critical_75",
      runId: RUN_ID,
      timestamp: NOW,
    });
    expect(state1.modules["src/auth/login.ts"]?.has_exceeded_floor).toBe(true);

    // Equal reading, still above floor → stays true.
    const { state: state2 } = applyMutationMeasurement({
      state: state1,
      modulePath: "src/auth/login.ts",
      newScore: 80,
      tier: "critical_75",
      runId: RUN_ID,
      timestamp: LATER,
    });
    expect(state2.modules["src/auth/login.ts"]?.has_exceeded_floor).toBe(true);
  });

  test("created baseline below floor has has_exceeded_floor=false", () => {
    const { baseline } = applyMutationMeasurement({
      state: freshState(),
      modulePath: "src/lib/foo.ts",
      newScore: 50,
      tier: "business_60",
      runId: RUN_ID,
      timestamp: NOW,
    });
    expect(baseline.mutation_baseline).toBe(50);
    expect(baseline.has_exceeded_floor).toBe(false);
  });

  test("ui_gates_only tier has has_exceeded_floor=true regardless of score", () => {
    const { baseline } = applyMutationMeasurement({
      state: freshState(),
      modulePath: "src/components/Button.tsx",
      newScore: 5,
      tier: "ui_gates_only",
      runId: RUN_ID,
      timestamp: NOW,
    });
    expect(baseline.has_exceeded_floor).toBe(true);
  });

  test("ratchet up flips has_exceeded_floor from false to true once", () => {
    const state0 = freshState();
    const { state: state1 } = applyMutationMeasurement({
      state: state0,
      modulePath: "src/auth/login.ts",
      newScore: 70,
      tier: "critical_75",
      runId: RUN_ID,
      timestamp: NOW,
    });
    expect(state1.modules["src/auth/login.ts"]?.has_exceeded_floor).toBe(false);

    const { state: state2 } = applyMutationMeasurement({
      state: state1,
      modulePath: "src/auth/login.ts",
      newScore: 80,
      tier: "critical_75",
      runId: RUN_ID,
      timestamp: LATER,
    });
    expect(state2.modules["src/auth/login.ts"]?.has_exceeded_floor).toBe(true);
  });

  test("rejects out-of-range scores", () => {
    expect(() =>
      applyMutationMeasurement({
        state: freshState(),
        modulePath: "src/x.ts",
        newScore: 150,
        tier: "critical_75",
        runId: RUN_ID,
        timestamp: NOW,
      }),
    ).toThrow(QaError);
    expect(() =>
      applyMutationMeasurement({
        state: freshState(),
        modulePath: "src/x.ts",
        newScore: -1,
        tier: "critical_75",
        runId: RUN_ID,
        timestamp: NOW,
      }),
    ).toThrow(QaError);
    expect(() =>
      applyMutationMeasurement({
        state: freshState(),
        modulePath: "src/x.ts",
        newScore: Number.NaN,
        tier: "critical_75",
        runId: RUN_ID,
        timestamp: NOW,
      }),
    ).toThrow(QaError);
  });
});

// ─── resetModuleBaseline ─────────────────────────────────────────────────────

describe("resetModuleBaseline", () => {
  function stateWithBaseline(score = 80): StateJson {
    return applyMutationMeasurement({
      state: freshState(),
      modulePath: "src/auth/login.ts",
      newScore: score,
      tier: "critical_75",
      runId: RUN_ID,
      timestamp: NOW,
    }).state;
  }

  test("allows downward move and appends audit entry", () => {
    const before = stateWithBaseline(80);
    const after = resetModuleBaseline({
      state: before,
      modulePath: "src/auth/login.ts",
      newBaseline: 60,
      reason: "Refactor per PRD v2",
      triggered_by: "qa-baseline-reset",
      approved_by: "shailesh",
      timestamp: LATER,
    });
    expect(after.modules["src/auth/login.ts"]?.mutation_baseline).toBe(60);
    expect(after.baseline_reset_log).toHaveLength(1);
    expect(after.baseline_reset_log[0]).toMatchObject({
      module: "src/auth/login.ts",
      old_baseline: 80,
      new_baseline: 60,
      reason: "Refactor per PRD v2",
      triggered_by: "qa-baseline-reset",
      approved_by: "shailesh",
    });
  });

  test("preserves has_exceeded_floor even when resetting below floor", () => {
    const before = stateWithBaseline(80); // exceeds 75 floor
    const after = resetModuleBaseline({
      state: before,
      modulePath: "src/auth/login.ts",
      newBaseline: 50,
      reason: "legitimate",
      triggered_by: "qa-baseline-reset",
      approved_by: "shailesh",
      timestamp: LATER,
    });
    expect(after.modules["src/auth/login.ts"]?.has_exceeded_floor).toBe(true);
  });

  test("requires non-empty reason", () => {
    expect(() =>
      resetModuleBaseline({
        state: stateWithBaseline(),
        modulePath: "src/auth/login.ts",
        newBaseline: 60,
        reason: "",
        triggered_by: "x",
        approved_by: "y",
        timestamp: LATER,
      }),
    ).toThrow(QaError);
  });

  test("requires non-empty triggered_by and approved_by", () => {
    expect(() =>
      resetModuleBaseline({
        state: stateWithBaseline(),
        modulePath: "src/auth/login.ts",
        newBaseline: 60,
        reason: "x",
        triggered_by: "",
        approved_by: "y",
        timestamp: LATER,
      }),
    ).toThrow(QaError);
    expect(() =>
      resetModuleBaseline({
        state: stateWithBaseline(),
        modulePath: "src/auth/login.ts",
        newBaseline: 60,
        reason: "x",
        triggered_by: "y",
        approved_by: "",
        timestamp: LATER,
      }),
    ).toThrow(QaError);
  });

  test("refuses reset for unknown module", () => {
    expect(() =>
      resetModuleBaseline({
        state: freshState(),
        modulePath: "src/nope.ts",
        newBaseline: 50,
        reason: "x",
        triggered_by: "y",
        approved_by: "z",
        timestamp: LATER,
      }),
    ).toThrow(QaError);
  });

  test("multiple resets append in order", () => {
    let state = stateWithBaseline(80);
    state = resetModuleBaseline({
      state,
      modulePath: "src/auth/login.ts",
      newBaseline: 70,
      reason: "first",
      triggered_by: "x",
      approved_by: "y",
      timestamp: LATER,
    });
    state = resetModuleBaseline({
      state,
      modulePath: "src/auth/login.ts",
      newBaseline: 65,
      reason: "second",
      triggered_by: "x",
      approved_by: "y",
      timestamp: "2026-04-14T23:00:00Z",
    });
    expect(state.baseline_reset_log).toHaveLength(2);
    expect(state.baseline_reset_log.map((e) => e.reason)).toEqual(["first", "second"]);
  });
});

// ─── feature state transitions ───────────────────────────────────────────────

describe("markFeatureGreen / markFeatureBlocked / plateau", () => {
  test("markFeatureGreen sets status and clears blocked fields", () => {
    let state = freshState();
    state = markFeatureBlocked(state, "auth-login", {
      reason: "plateau",
      signature: "sig-1",
      timestamp: NOW,
    });
    expect(state.features["auth-login"]?.status).toBe("blocked");

    state = markFeatureGreen(state, "auth-login", RUN_ID, LATER);
    expect(state.features["auth-login"]?.status).toBe("green");
    expect(state.features["auth-login"]?.last_green_run_id).toBe(RUN_ID);
    expect(state.features["auth-login"]?.blocked_reason).toBeUndefined();
    expect(state.features["auth-login"]?.blocked_signature).toBeUndefined();
  });

  test("markFeatureBlocked records reason and signature", () => {
    const state = markFeatureBlocked(freshState(), "auth-login", {
      reason: "plateau",
      signature: "sig-42",
      timestamp: NOW,
    });
    expect(state.features["auth-login"]?.blocked_reason).toBe("plateau");
    expect(state.features["auth-login"]?.blocked_signature).toBe("sig-42");
  });

  test("incrementFeatureAttempt increments and buffers signatures (kept at 3)", () => {
    let state = freshState();
    state = incrementFeatureAttempt(state, "auth-login", "sig-a", NOW);
    state = incrementFeatureAttempt(state, "auth-login", "sig-b", NOW);
    state = incrementFeatureAttempt(state, "auth-login", "sig-c", NOW);
    state = incrementFeatureAttempt(state, "auth-login", "sig-d", NOW);
    expect(state.features["auth-login"]?.attempts_this_session).toBe(4);
    expect(state.features["auth-login"]?.plateau_buffer).toEqual([
      "sig-b",
      "sig-c",
      "sig-d",
    ]);
  });

  test("detectPlateau false when buffer has <3 entries", () => {
    let state = freshState();
    state = incrementFeatureAttempt(state, "auth-login", "sig-a", NOW);
    expect(detectPlateau(state, "auth-login")).toBe(false);
  });

  test("detectPlateau false when last 3 signatures differ", () => {
    let state = freshState();
    state = incrementFeatureAttempt(state, "auth-login", "sig-a", NOW);
    state = incrementFeatureAttempt(state, "auth-login", "sig-a", NOW);
    state = incrementFeatureAttempt(state, "auth-login", "sig-b", NOW);
    expect(detectPlateau(state, "auth-login")).toBe(false);
  });

  test("detectPlateau true when last 3 signatures identical", () => {
    let state = freshState();
    state = incrementFeatureAttempt(state, "auth-login", "sig-a", NOW);
    state = incrementFeatureAttempt(state, "auth-login", "sig-a", NOW);
    state = incrementFeatureAttempt(state, "auth-login", "sig-a", NOW);
    expect(detectPlateau(state, "auth-login")).toBe(true);
  });

  test("resetFeatureAttempts clears counter and buffer", () => {
    let state = freshState();
    state = incrementFeatureAttempt(state, "auth-login", "sig-a", NOW);
    state = resetFeatureAttempts(state, "auth-login", LATER);
    expect(state.features["auth-login"]?.attempts_this_session).toBe(0);
    expect(state.features["auth-login"]?.plateau_buffer).toEqual([]);
  });

  test("rejects invalid feature ids", () => {
    expect(() =>
      markFeatureGreen(freshState(), "Auth-Login", RUN_ID, NOW),
    ).toThrow();
  });
});

// ─── run records ─────────────────────────────────────────────────────────────

describe("startRun / endRun / recordRunFeatureOutcome / incrementViolationCount", () => {
  test("startRun creates a run record with empty lists", () => {
    const state = startRun(freshState(), RUN_ID, NOW);
    expect(state.runs[RUN_ID]?.features_attempted).toEqual([]);
    expect(state.runs[RUN_ID]?.violations_count).toBe(0);
    expect(state.last_run_id).toBe(RUN_ID);
  });

  test("startRun records baseline_full_mutation_score when provided", () => {
    const state = startRun(freshState(), RUN_ID, NOW, 65);
    expect(state.runs[RUN_ID]?.baseline_full_mutation_score).toBe(65);
  });

  test("endRun sets ended_at and final score", () => {
    let state = startRun(freshState(), RUN_ID, NOW);
    state = endRun(state, RUN_ID, LATER, 78);
    expect(state.runs[RUN_ID]?.ended_at).toBe(LATER);
    expect(state.runs[RUN_ID]?.final_full_mutation_score).toBe(78);
  });

  test("endRun refuses to close an unknown run", () => {
    expect(() => endRun(freshState(), "run-nope", LATER)).toThrow(QaError);
  });

  test("recordRunFeatureOutcome aggregates without duplicates", () => {
    let state = startRun(freshState(), RUN_ID, NOW);
    state = recordRunFeatureOutcome(state, RUN_ID, "auth-login", "attempted", NOW);
    state = recordRunFeatureOutcome(state, RUN_ID, "auth-login", "green", NOW);
    state = recordRunFeatureOutcome(state, RUN_ID, "auth-login", "green", NOW);
    expect(state.runs[RUN_ID]?.features_attempted).toEqual(["auth-login"]);
    expect(state.runs[RUN_ID]?.features_green).toEqual(["auth-login"]);
  });

  test("incrementViolationCount increments run counter", () => {
    let state = startRun(freshState(), RUN_ID, NOW);
    state = incrementViolationCount(state, RUN_ID, NOW);
    state = incrementViolationCount(state, RUN_ID, NOW);
    expect(state.runs[RUN_ID]?.violations_count).toBe(2);
  });
});

// ─── test count history + sanity ─────────────────────────────────────────────

describe("appendTestCountHistory / checkTestCountSanity", () => {
  test("appends all three runner counts and respects history limit", () => {
    let state = freshState();
    for (let i = 0; i < 25; i++) {
      state = appendTestCountHistory(
        state,
        { vitest_unit: 200 + i, vitest_integration: 80, playwright: 40 },
        NOW,
        20,
      );
    }
    expect(state.test_count_history.vitest_unit).toHaveLength(20);
    expect(state.test_count_history.vitest_unit[0]).toBe(205);
  });

  test("partial sample only updates provided runners", () => {
    let state = freshState();
    state = appendTestCountHistory(state, { vitest_unit: 100 }, NOW);
    expect(state.test_count_history.vitest_unit).toEqual([100]);
    expect(state.test_count_history.vitest_integration).toEqual([]);
  });

  test("rejects negative counts", () => {
    expect(() =>
      appendTestCountHistory(freshState(), { vitest_unit: -1 }, NOW),
    ).toThrow(QaError);
  });

  test("sanity check reports drop-to-zero as anomaly", () => {
    let state = freshState();
    state = appendTestCountHistory(state, { vitest_unit: 200 }, NOW);
    const { ok, anomalies } = checkTestCountSanity(state, { vitest_unit: 0 });
    expect(ok).toBe(false);
    expect(anomalies[0]?.runner).toBe("vitest_unit");
    expect(anomalies[0]?.reason).toContain("truncated");
  });

  test("sanity check reports large drop as anomaly", () => {
    let state = freshState();
    state = appendTestCountHistory(state, { vitest_unit: 200 }, NOW);
    const { ok, anomalies } = checkTestCountSanity(state, { vitest_unit: 100 });
    expect(ok).toBe(false);
    expect(anomalies[0]?.runner).toBe("vitest_unit");
    expect(anomalies[0]?.reason).toMatch(/dropped/i);
  });

  test("sanity check accepts small drop within tolerance", () => {
    let state = freshState();
    state = appendTestCountHistory(state, { vitest_unit: 200 }, NOW);
    const { ok } = checkTestCountSanity(state, { vitest_unit: 195 }); // 2.5% drop
    expect(ok).toBe(true);
  });

  test("sanity check accepts growth but flags extreme spike", () => {
    let state = freshState();
    state = appendTestCountHistory(state, { vitest_unit: 10 }, NOW);
    const { ok: smallOk } = checkTestCountSanity(state, { vitest_unit: 40 });
    expect(smallOk).toBe(true);
    const { ok: extremeOk, anomalies } = checkTestCountSanity(state, {
      vitest_unit: 200,
    });
    expect(extremeOk).toBe(false);
    expect(anomalies.some((a) => a.reason.toLowerCase().includes("grew"))).toBe(true);
  });

  test("empty history bypasses sanity check", () => {
    const { ok } = checkTestCountSanity(freshState(), { vitest_unit: 999 });
    expect(ok).toBe(true);
  });
});

// ─── session lock (L1) ───────────────────────────────────────────────────────

describe("session lock", () => {
  test("acquireSessionLock creates file with current pid", async () => {
    const lockPath = join(workDir, "state.lock");
    const lock = await acquireSessionLock({
      lockPath,
      runId: RUN_ID,
      qaControllerVersion: "0.1.0",
      timestamp: NOW,
    });
    expect(lock.pid).toBe(process.pid);
    expect(lock.run_id).toBe(RUN_ID);
    const readBack = await readSessionLock(lockPath);
    expect(readBack).toEqual(lock);
  });

  test("concurrent acquire against alive pid throws ConcurrentRunError", async () => {
    const lockPath = join(workDir, "state.lock");
    await acquireSessionLock({
      lockPath,
      runId: RUN_ID,
      qaControllerVersion: "0.1.0",
      timestamp: NOW,
    });
    await expect(
      acquireSessionLock({
        lockPath,
        runId: "run-other",
        qaControllerVersion: "0.1.0",
        timestamp: LATER,
      }),
    ).rejects.toBeInstanceOf(ConcurrentRunError);
  });

  test("stale lock (dead pid on same host) throws StaleLockError", async () => {
    const lockPath = join(workDir, "state.lock");
    // Hand-craft a lock file with a dead PID + current host.
    const stale: SessionLock = {
      pid: 1, // PID 1 is init; process.kill(1, 0) typically throws EPERM.
      // To ensure we simulate a dead pid deterministically, use a PID we know
      // is not running. Use a high unlikely PID. But kill() may return EPERM
      // for existing pids owned by another user. For portability, use a high
      // integer and rely on ESRCH.
      run_id: RUN_ID,
      acquired_at: NOW,
      host: (await import("node:os")).hostname(),
      qa_controller_version: "0.1.0",
    };
    stale.pid = 0x7ffffffe; // extremely unlikely to exist
    await fs.writeFile(lockPath, JSON.stringify(stale, null, 2));

    await expect(
      acquireSessionLock({
        lockPath,
        runId: "run-new",
        qaControllerVersion: "0.1.0",
        timestamp: LATER,
      }),
    ).rejects.toBeInstanceOf(StaleLockError);
  });

  test("forceAcquireSessionLock replaces existing lock", async () => {
    const lockPath = join(workDir, "state.lock");
    await fs.writeFile(
      lockPath,
      JSON.stringify(
        {
          pid: 0x7ffffffe,
          run_id: "run-dead",
          acquired_at: NOW,
          host: (await import("node:os")).hostname(),
          qa_controller_version: "0.1.0",
        },
        null,
        2,
      ),
    );
    const lock = await forceAcquireSessionLock({
      lockPath,
      runId: "run-forced",
      qaControllerVersion: "0.1.0",
      timestamp: LATER,
    });
    expect(lock.run_id).toBe("run-forced");
    expect(lock.pid).toBe(process.pid);
  });

  test("releaseSessionLock deletes file, tolerates missing", async () => {
    const lockPath = join(workDir, "state.lock");
    await acquireSessionLock({
      lockPath,
      runId: RUN_ID,
      qaControllerVersion: "0.1.0",
      timestamp: NOW,
    });
    await releaseSessionLock(lockPath);
    expect(await readSessionLock(lockPath)).toBeNull();
    // second release is a no-op
    await expect(releaseSessionLock(lockPath)).resolves.toBeUndefined();
  });

  test("readSessionLock returns null when file missing or empty", async () => {
    const lockPath = join(workDir, "state.lock");
    expect(await readSessionLock(lockPath)).toBeNull();
    await fs.writeFile(lockPath, "");
    expect(await readSessionLock(lockPath)).toBeNull();
  });

  test("readSessionLock throws ParseError on malformed content", async () => {
    const lockPath = join(workDir, "state.lock");
    await fs.writeFile(lockPath, "{not json");
    await expect(readSessionLock(lockPath)).rejects.toBeInstanceOf(ParseError);
  });

  test("isLockAlive uses injected pidAlive predicate", () => {
    const lock: SessionLock = {
      pid: 999999,
      run_id: RUN_ID,
      acquired_at: NOW,
      host: (require("node:os") as typeof import("node:os")).hostname(),
      qa_controller_version: "0.1.0",
    };
    expect(isLockAlive(lock, () => true)).toBe(true);
    expect(isLockAlive(lock, () => false)).toBe(false);
    expect(isLockStale(lock, () => false)).toBe(true);
  });

  test("isLockAlive treats cross-host locks as alive (cannot verify)", () => {
    const lock: SessionLock = {
      pid: 1,
      run_id: RUN_ID,
      acquired_at: NOW,
      host: "some-other-host",
      qa_controller_version: "0.1.0",
    };
    expect(isLockAlive(lock, () => false)).toBe(true);
  });
});

// ─── R-2 preflight ───────────────────────────────────────────────────────────

describe("runPreflight", () => {
  test("clean tree + no lock + valid state → passes", async () => {
    const statePath = join(workDir, "state.json");
    const lockPath = join(workDir, "state.lock");
    await writeState(statePath, freshState());

    const report = await runPreflight({
      statePath,
      lockPath,
      workingTreeChecker: async () => ({ clean: true, dirtyFiles: [] }),
    });
    expect(report.lock.status).toBe("none");
    expect(report.stateReadable).toBe(true);
    expect(report.workingTree.clean).toBe(true);
  });

  test("dirty tree → throws DirtyWorkingTreeError", async () => {
    const statePath = join(workDir, "state.json");
    const lockPath = join(workDir, "state.lock");
    await writeState(statePath, freshState());

    await expect(
      runPreflight({
        statePath,
        lockPath,
        workingTreeChecker: async () => ({
          clean: false,
          dirtyFiles: ["src/foo.ts"],
        }),
      }),
    ).rejects.toBeInstanceOf(DirtyWorkingTreeError);
  });

  test("stale lock is cleared and reported", async () => {
    const statePath = join(workDir, "state.json");
    const lockPath = join(workDir, "state.lock");
    await writeState(statePath, freshState());
    await fs.writeFile(
      lockPath,
      JSON.stringify(
        {
          pid: 0x7ffffffe,
          run_id: RUN_ID,
          acquired_at: NOW,
          host: (await import("node:os")).hostname(),
          qa_controller_version: "0.1.0",
        },
        null,
        2,
      ),
    );

    const report = await runPreflight({
      statePath,
      lockPath,
      workingTreeChecker: async () => ({ clean: true, dirtyFiles: [] }),
      pidAlive: () => false,
    });
    expect(report.lock.status).toBe("cleared_stale");
    expect(report.lock.previous?.run_id).toBe(RUN_ID);
    expect(await readSessionLock(lockPath)).toBeNull();
  });

  test("alive lock → throws ConcurrentRunError", async () => {
    const statePath = join(workDir, "state.json");
    const lockPath = join(workDir, "state.lock");
    await writeState(statePath, freshState());
    await fs.writeFile(
      lockPath,
      JSON.stringify(
        {
          pid: process.pid,
          run_id: RUN_ID,
          acquired_at: NOW,
          host: (await import("node:os")).hostname(),
          qa_controller_version: "0.1.0",
        },
        null,
        2,
      ),
    );

    await expect(
      runPreflight({
        statePath,
        lockPath,
        workingTreeChecker: async () => ({ clean: true, dirtyFiles: [] }),
        pidAlive: () => true,
      }),
    ).rejects.toBeInstanceOf(ConcurrentRunError);
  });

  test("unreadable state → propagates StateCorruptionError", async () => {
    const statePath = join(workDir, "state.json");
    const lockPath = join(workDir, "state.lock");
    await fs.writeFile(statePath, "{corrupt");
    await expect(
      runPreflight({
        statePath,
        lockPath,
        workingTreeChecker: async () => ({ clean: true, dirtyFiles: [] }),
      }),
    ).rejects.toBeInstanceOf(StateCorruptionError);
  });
});
