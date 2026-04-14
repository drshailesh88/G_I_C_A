/**
 * State manager — reads/writes `.quality/state.json` with crash-safe writes,
 * B4 ratchet semantics (up only, down only via explicit reset with audit log),
 * `has_exceeded_floor` high-water-mark, L1 session lock with PID + stale-lock
 * detection, and test-count history tracking.
 *
 * Blueprint references:
 *   Part 6.2    — state.json schema (S2)
 *   Part 8a add — test count consistency check
 *   Part 15c    — R-2 crash recovery preflight
 *   Appendix B  — tier floor table
 *
 * Design rules:
 *   1. Every disk read goes through Zod (StateJsonSchema / SessionLockSchema).
 *      If validation fails, throw StateCorruptionError — never silently coerce.
 *   2. State transforms are pure functions. I/O is separate.
 *   3. writeState atomicity: write to a `<path>.tmp.<pid>.<rand>` then rename.
 *      Cross-FS rename is not a concern because `.quality/` lives in the repo.
 *   4. The ratchet function rejects downward moves. Only resetModuleBaseline
 *      may decrease a baseline, and it always logs an audit entry.
 *   5. `has_exceeded_floor` is monotonic true — once set, never cleared by
 *      any function in this module. ui_gates_only modules start at true
 *      (no floor to exceed).
 */
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { hostname } from "node:os";
import { dirname } from "node:path";
import { z } from "zod";
import {
  ConcurrentRunError,
  DirtyWorkingTreeError,
  FeatureIdSchema,
  FeatureState,
  FeatureStateSchema,
  IsoDateTime,
  ModuleBaseline,
  ModuleBaselineSchema,
  ParseError,
  QaError,
  RatchetViolationError,
  RunId,
  RunRecord,
  SessionLock,
  SessionLockSchema,
  StateCorruptionError,
  StateJson,
  StateJsonSchema,
  StaleLockError,
  Tier,
  TierFloors,
} from "./types.js";

// ─── I/O primitives ───────────────────────────────────────────────────────────

/**
 * Read and Zod-validate state.json. Throws StateCorruptionError on any schema
 * drift, parse failure, or missing required field.
 */
export async function readState(path: string): Promise<StateJson> {
  let raw: string;
  try {
    raw = await fs.readFile(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new StateCorruptionError(
        `state.json missing at ${path}. Run \`npm run qa baseline\` to initialize.`,
      );
    }
    throw new StateCorruptionError(`state.json unreadable at ${path}: ${String(err)}`);
  }

  if (raw.trim() === "") {
    throw new StateCorruptionError(`state.json is empty at ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new StateCorruptionError(
      `state.json JSON parse failed at ${path}: ${(err as Error).message}`,
    );
  }

  const result = StateJsonSchema.safeParse(parsed);
  if (!result.success) {
    throw new StateCorruptionError(
      `state.json schema validation failed: ${formatZodError(result.error)}`,
      { path, zod_issues: result.error.issues },
    );
  }
  return result.data;
}

/**
 * Write state.json crash-safely: serialize → temp file → atomic rename.
 * Re-validates the payload with Zod before writing to catch in-memory drift.
 */
export async function writeState(path: string, state: StateJson): Promise<void> {
  const validated = StateJsonSchema.parse(state);
  const serialized = `${JSON.stringify(validated, null, 2)}\n`;

  const tmpPath = `${path}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  await fs.mkdir(dirname(path), { recursive: true });
  try {
    await fs.writeFile(tmpPath, serialized, { encoding: "utf8", flag: "wx" });
    await fs.rename(tmpPath, path);
  } catch (err) {
    // Best-effort cleanup; ignore ENOENT.
    try {
      await fs.unlink(tmpPath);
    } catch {
      /* noop */
    }
    throw err;
  }
}

/** Build a fresh empty state.json payload for first-time initialization. */
export function initializeState(now: IsoDateTime): StateJson {
  return StateJsonSchema.parse({
    schema_version: 1,
    last_updated: now,
    features: {},
    modules: {},
    baseline_reset_log: [],
    test_count_history: { vitest_unit: [], vitest_integration: [], playwright: [] },
    runs: {},
  });
}

// ─── B4 ratchet semantics ─────────────────────────────────────────────────────

export interface MutationMeasurementInput {
  state: StateJson;
  modulePath: string;
  newScore: number;
  tier: Tier;
  runId: RunId;
  timestamp: IsoDateTime;
  contractFeatureId?: string;
}

export type MutationMeasurementOutcome =
  | "created"
  | "ratcheted_up"
  | "unchanged";

export interface MutationMeasurementResult {
  state: StateJson;
  outcome: MutationMeasurementOutcome;
  baseline: ModuleBaseline;
}

/**
 * Apply one module's freshly-measured mutation score against state.
 *
 *   - If module missing: create baseline at newScore.
 *   - If newScore > stored baseline: ratchet up.
 *   - If newScore == stored baseline: no change.
 *   - If newScore  < stored baseline: throw RatchetViolationError.
 *
 * `has_exceeded_floor` is set true if newScore >= TierFloors[tier] (and
 * remains true forever once set). For ui_gates_only (null floor), it is
 * always true.
 */
export function applyMutationMeasurement(
  input: MutationMeasurementInput,
): MutationMeasurementResult {
  const { state, modulePath, newScore, tier, runId, timestamp } = input;
  assertScoreInRange(newScore, modulePath);

  const existing = state.modules[modulePath];
  const floor = TierFloors[tier];
  const exceedsFloor = floor === null ? true : newScore >= floor;

  if (!existing) {
    const baseline = ModuleBaselineSchema.parse({
      tier,
      declared_in_contract: input.contractFeatureId,
      mutation_baseline: newScore,
      mutation_baseline_set_at: timestamp,
      mutation_baseline_run_id: runId,
      has_exceeded_floor: exceedsFloor,
    });
    const next: StateJson = {
      ...state,
      last_updated: timestamp,
      modules: { ...state.modules, [modulePath]: baseline },
    };
    return { state: next, outcome: "created", baseline };
  }

  if (newScore < existing.mutation_baseline) {
    throw new RatchetViolationError(
      `ratchet violation for ${modulePath}: new score ${newScore} < baseline ${existing.mutation_baseline}. ` +
        `Use resetModuleBaseline with a logged reason to explicitly lower the baseline.`,
      { modulePath, newScore, baseline: existing.mutation_baseline },
    );
  }

  if (newScore === existing.mutation_baseline) {
    // has_exceeded_floor is monotonic true; only raise, never lower.
    const hasExceededNow = existing.has_exceeded_floor || exceedsFloor;
    if (hasExceededNow === existing.has_exceeded_floor) {
      return { state, outcome: "unchanged", baseline: existing };
    }
    const baseline: ModuleBaseline = {
      ...existing,
      has_exceeded_floor: hasExceededNow,
    };
    const next: StateJson = {
      ...state,
      last_updated: timestamp,
      modules: { ...state.modules, [modulePath]: baseline },
    };
    return { state: next, outcome: "unchanged", baseline };
  }

  // newScore > existing.mutation_baseline → ratchet up
  const baseline = ModuleBaselineSchema.parse({
    ...existing,
    tier, // allow tier reassignment when tiers.yaml updates
    mutation_baseline: newScore,
    mutation_baseline_set_at: timestamp,
    mutation_baseline_run_id: runId,
    has_exceeded_floor: existing.has_exceeded_floor || exceedsFloor,
  });
  const next: StateJson = {
    ...state,
    last_updated: timestamp,
    modules: { ...state.modules, [modulePath]: baseline },
  };
  return { state: next, outcome: "ratcheted_up", baseline };
}

export interface BaselineResetInput {
  state: StateJson;
  modulePath: string;
  newBaseline: number;
  reason: string;
  triggered_by: string;
  approved_by: string;
  timestamp: IsoDateTime;
}

/**
 * Explicit ratchet-down. Always logs an entry in `baseline_reset_log` and
 * updates the module baseline. Preserves `has_exceeded_floor` (never clears
 * it — a module that hit the floor stays flagged forever).
 */
export function resetModuleBaseline(input: BaselineResetInput): StateJson {
  const { state, modulePath, newBaseline, reason, triggered_by, approved_by, timestamp } =
    input;
  assertScoreInRange(newBaseline, modulePath);

  if (!reason.trim()) {
    throw new QaError("resetModuleBaseline requires a non-empty reason");
  }
  if (!triggered_by.trim() || !approved_by.trim()) {
    throw new QaError(
      "resetModuleBaseline requires triggered_by and approved_by (audit trail)",
    );
  }

  const existing = state.modules[modulePath];
  if (!existing) {
    throw new QaError(
      `resetModuleBaseline: no existing baseline for ${modulePath}`,
      { modulePath },
    );
  }

  const baseline: ModuleBaseline = {
    ...existing,
    mutation_baseline: newBaseline,
    mutation_baseline_set_at: timestamp,
    // has_exceeded_floor intentionally preserved (never cleared).
  };

  const logEntry = {
    timestamp,
    module: modulePath,
    old_baseline: existing.mutation_baseline,
    new_baseline: newBaseline,
    reason,
    triggered_by,
    approved_by,
  };

  return {
    ...state,
    last_updated: timestamp,
    modules: { ...state.modules, [modulePath]: baseline },
    baseline_reset_log: [...state.baseline_reset_log, logEntry],
  };
}

// ─── Feature state transitions ────────────────────────────────────────────────

export function markFeatureGreen(
  state: StateJson,
  featureId: string,
  runId: RunId,
  timestamp: IsoDateTime,
): StateJson {
  FeatureIdSchema.parse(featureId);
  const existing = state.features[featureId];
  const next: FeatureState = FeatureStateSchema.parse({
    ...(existing ?? {}),
    status: "green",
    last_green_run_id: runId,
    last_green_at: timestamp,
    attempts_this_session: existing?.attempts_this_session ?? 0,
    plateau_buffer: [],
    // blocked_* fields removed by not spreading them back in
    blocked_at: undefined,
    blocked_reason: undefined,
    blocked_signature: undefined,
  });
  return {
    ...state,
    last_updated: timestamp,
    features: { ...state.features, [featureId]: next },
  };
}

export function markFeatureBlocked(
  state: StateJson,
  featureId: string,
  params: { reason: string; signature: string; timestamp: IsoDateTime },
): StateJson {
  FeatureIdSchema.parse(featureId);
  const existing = state.features[featureId];
  const next: FeatureState = FeatureStateSchema.parse({
    ...(existing ?? {}),
    status: "blocked",
    blocked_at: params.timestamp,
    blocked_reason: params.reason,
    blocked_signature: params.signature,
    attempts_this_session: existing?.attempts_this_session ?? 0,
    plateau_buffer: existing?.plateau_buffer ?? [],
  });
  return {
    ...state,
    last_updated: params.timestamp,
    features: { ...state.features, [featureId]: next },
  };
}

export function incrementFeatureAttempt(
  state: StateJson,
  featureId: string,
  plateauSignature: string,
  timestamp: IsoDateTime,
): StateJson {
  FeatureIdSchema.parse(featureId);
  const existing = state.features[featureId];
  const current = existing?.attempts_this_session ?? 0;
  const buffer = [...(existing?.plateau_buffer ?? []), plateauSignature];
  const trimmed = buffer.slice(-3); // plateau detection keeps last 3
  const next: FeatureState = FeatureStateSchema.parse({
    ...(existing ?? {}),
    status: existing?.status ?? "in_progress",
    attempts_this_session: current + 1,
    plateau_buffer: trimmed,
  });
  return {
    ...state,
    last_updated: timestamp,
    features: { ...state.features, [featureId]: next },
  };
}

export function resetFeatureAttempts(
  state: StateJson,
  featureId: string,
  timestamp: IsoDateTime,
): StateJson {
  FeatureIdSchema.parse(featureId);
  const existing = state.features[featureId];
  if (!existing) return state;
  const next: FeatureState = FeatureStateSchema.parse({
    ...existing,
    attempts_this_session: 0,
    plateau_buffer: [],
  });
  return {
    ...state,
    last_updated: timestamp,
    features: { ...state.features, [featureId]: next },
  };
}

/**
 * Detect plateau per blueprint P2: last 3 signatures identical.
 * Caller owns the decision to mark BLOCKED (controller-level).
 */
export function detectPlateau(state: StateJson, featureId: string): boolean {
  const feat = state.features[featureId];
  if (!feat) return false;
  if (feat.plateau_buffer.length < 3) return false;
  const last3 = feat.plateau_buffer.slice(-3);
  return last3.every((s) => s === last3[0]);
}

// ─── Run records ──────────────────────────────────────────────────────────────

export function startRun(
  state: StateJson,
  runId: RunId,
  timestamp: IsoDateTime,
  baselineFullMutationScore?: number,
): StateJson {
  const run: RunRecord = {
    started_at: timestamp,
    features_attempted: [],
    features_green: [],
    features_blocked: [],
    violations_count: 0,
    ...(baselineFullMutationScore !== undefined
      ? { baseline_full_mutation_score: baselineFullMutationScore }
      : {}),
  };
  return {
    ...state,
    last_updated: timestamp,
    last_run_id: runId,
    runs: { ...state.runs, [runId]: run },
  };
}

export function endRun(
  state: StateJson,
  runId: RunId,
  timestamp: IsoDateTime,
  finalFullMutationScore?: number,
): StateJson {
  const existing = state.runs[runId];
  if (!existing) {
    throw new QaError(`endRun: no run record for ${runId}`, { runId });
  }
  const run: RunRecord = {
    ...existing,
    ended_at: timestamp,
    ...(finalFullMutationScore !== undefined
      ? { final_full_mutation_score: finalFullMutationScore }
      : {}),
  };
  return {
    ...state,
    last_updated: timestamp,
    runs: { ...state.runs, [runId]: run },
  };
}

export type RunFeatureOutcome = "attempted" | "green" | "blocked";

export function recordRunFeatureOutcome(
  state: StateJson,
  runId: RunId,
  featureId: string,
  outcome: RunFeatureOutcome,
  timestamp: IsoDateTime,
): StateJson {
  FeatureIdSchema.parse(featureId);
  const existing = state.runs[runId];
  if (!existing) {
    throw new QaError(`recordRunFeatureOutcome: no run record for ${runId}`, { runId });
  }
  const attempted = includeUnique(existing.features_attempted, featureId);
  const green =
    outcome === "green" ? includeUnique(existing.features_green, featureId) : existing.features_green;
  const blocked =
    outcome === "blocked"
      ? includeUnique(existing.features_blocked, featureId)
      : existing.features_blocked;
  const run: RunRecord = {
    ...existing,
    features_attempted: attempted,
    features_green: green,
    features_blocked: blocked,
  };
  return {
    ...state,
    last_updated: timestamp,
    runs: { ...state.runs, [runId]: run },
  };
}

export function incrementViolationCount(
  state: StateJson,
  runId: RunId,
  timestamp: IsoDateTime,
): StateJson {
  const existing = state.runs[runId];
  if (!existing) {
    throw new QaError(`incrementViolationCount: no run record for ${runId}`, {
      runId,
    });
  }
  const run: RunRecord = {
    ...existing,
    violations_count: existing.violations_count + 1,
  };
  return {
    ...state,
    last_updated: timestamp,
    runs: { ...state.runs, [runId]: run },
  };
}

// ─── Test count history (8a sanity check) ─────────────────────────────────────

export interface TestCountSample {
  vitest_unit?: number;
  vitest_integration?: number;
  playwright?: number;
}

export interface TestCountAnomaly {
  runner: "vitest_unit" | "vitest_integration" | "playwright";
  previous: number;
  current: number;
  reason: string;
}

/**
 * Append a measurement sample. Each runner's history is kept capped at `historyLimit`.
 */
export function appendTestCountHistory(
  state: StateJson,
  sample: TestCountSample,
  timestamp: IsoDateTime,
  historyLimit = 20,
): StateJson {
  const next = { ...state.test_count_history };
  for (const key of ["vitest_unit", "vitest_integration", "playwright"] as const) {
    const value = sample[key];
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 0) {
      throw new QaError(`appendTestCountHistory: ${key} must be non-negative integer`);
    }
    const appended = [...next[key], value];
    next[key] = appended.slice(-historyLimit);
  }
  return { ...state, last_updated: timestamp, test_count_history: next };
}

/**
 * 8a sanity check: a test run with a count that deviates drastically from
 * recent history is probably truncated/corrupted. Flag and refuse decisions
 * based on it.
 *
 *   - Any DROP of more than `maxDropPct` from the most recent sample is an
 *     anomaly (tests silently deleted).
 *   - Any drop to zero from non-zero history is an anomaly.
 *   - Extreme growth (>`maxGrowthPct`) is flagged but permitted (features
 *     added legitimately).
 */
export function checkTestCountSanity(
  state: StateJson,
  sample: TestCountSample,
  params: { maxDropPct?: number; maxGrowthPct?: number } = {},
): { ok: boolean; anomalies: TestCountAnomaly[] } {
  const maxDropPct = params.maxDropPct ?? 20;
  const maxGrowthPct = params.maxGrowthPct ?? 500;
  const anomalies: TestCountAnomaly[] = [];

  for (const runner of [
    "vitest_unit",
    "vitest_integration",
    "playwright",
  ] as const) {
    const value = sample[runner];
    if (value === undefined) continue;
    const history = state.test_count_history[runner];
    if (history.length === 0) continue; // first measurement, nothing to compare
    const last = history[history.length - 1];
    if (last === undefined) continue;

    if (last > 0 && value === 0) {
      anomalies.push({
        runner,
        previous: last,
        current: value,
        reason: "count dropped to 0 — output likely truncated or tests deleted",
      });
      continue;
    }

    if (last > 0) {
      const dropPct = ((last - value) / last) * 100;
      if (dropPct > maxDropPct) {
        anomalies.push({
          runner,
          previous: last,
          current: value,
          reason: `count dropped ${dropPct.toFixed(1)}% (> ${maxDropPct}%) — possible deletion`,
        });
      }
      const growthPct = ((value - last) / last) * 100;
      if (growthPct > maxGrowthPct) {
        anomalies.push({
          runner,
          previous: last,
          current: value,
          reason: `count grew ${growthPct.toFixed(1)}% (> ${maxGrowthPct}%) — flagged for review`,
        });
      }
    }
  }

  return { ok: anomalies.length === 0, anomalies };
}

// ─── L1 session lock ──────────────────────────────────────────────────────────

export interface AcquireLockInput {
  lockPath: string;
  runId: RunId;
  qaControllerVersion: string;
  timestamp: IsoDateTime;
}

/**
 * Try to acquire the session lock. Three outcomes:
 *   - Success → writes a SessionLock file atomically (O_EXCL) and returns it.
 *   - Lock held by ALIVE PID → throws ConcurrentRunError.
 *   - Lock held by DEAD PID (stale) → throws StaleLockError. Caller decides
 *     whether to force-acquire (R-2 behaviour) by calling
 *     `forceAcquireSessionLock` after logging.
 */
export async function acquireSessionLock(
  input: AcquireLockInput,
): Promise<SessionLock> {
  const lock: SessionLock = {
    pid: process.pid,
    run_id: input.runId,
    acquired_at: input.timestamp,
    host: hostname(),
    qa_controller_version: input.qaControllerVersion,
  };
  SessionLockSchema.parse(lock);

  await fs.mkdir(dirname(input.lockPath), { recursive: true });

  try {
    // O_EXCL ensures atomic creation; fails if file exists.
    await fs.writeFile(input.lockPath, JSON.stringify(lock, null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
    return lock;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw err;
  }

  // Lock existed — inspect it.
  const existing = await readSessionLock(input.lockPath);
  if (!existing) {
    // File was deleted in the race; retry once.
    return acquireSessionLock(input);
  }
  if (isLockAlive(existing)) {
    throw new ConcurrentRunError(
      `another qa controller is running (pid ${existing.pid}, run ${existing.run_id}, since ${existing.acquired_at})`,
      { existing },
    );
  }
  throw new StaleLockError(
    `stale lock detected (pid ${existing.pid} dead). Clear via recovery preflight.`,
    { existing },
  );
}

/**
 * R-2 recovery path: caller has confirmed the lock is stale and wants to
 * forcibly take over. Replaces the lock file atomically.
 */
export async function forceAcquireSessionLock(
  input: AcquireLockInput,
): Promise<SessionLock> {
  const lock: SessionLock = {
    pid: process.pid,
    run_id: input.runId,
    acquired_at: input.timestamp,
    host: hostname(),
    qa_controller_version: input.qaControllerVersion,
  };
  SessionLockSchema.parse(lock);

  await fs.mkdir(dirname(input.lockPath), { recursive: true });
  const tmpPath = `${input.lockPath}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  await fs.writeFile(tmpPath, JSON.stringify(lock, null, 2), {
    encoding: "utf8",
    flag: "wx",
  });
  await fs.rename(tmpPath, input.lockPath);
  return lock;
}

export async function releaseSessionLock(lockPath: string): Promise<void> {
  try {
    await fs.unlink(lockPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }
}

export async function readSessionLock(
  lockPath: string,
): Promise<SessionLock | null> {
  let raw: string;
  try {
    raw = await fs.readFile(lockPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  if (raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ParseError("state.lock", `invalid JSON: ${(err as Error).message}`);
  }
  const result = SessionLockSchema.safeParse(parsed);
  if (!result.success) {
    throw new ParseError(
      "state.lock",
      `schema validation failed: ${formatZodError(result.error)}`,
    );
  }
  return result.data;
}

/**
 * Check if the PID in a lock is alive. Uses `process.kill(pid, 0)` which does
 * not deliver a signal; a missing process raises ESRCH. EPERM means the
 * process exists but we can't signal it (owned by different user) — still
 * alive for our purposes.
 *
 * Allows injecting a custom pidAlive predicate for tests.
 */
export function isLockAlive(
  lock: SessionLock,
  pidAlive: (pid: number) => boolean = defaultPidAlive,
): boolean {
  if (lock.host !== hostname()) {
    // Cross-host lock — we can't verify remote aliveness. Treat as alive to be safe.
    return true;
  }
  return pidAlive(lock.pid);
}

export function isLockStale(
  lock: SessionLock,
  pidAlive: (pid: number) => boolean = defaultPidAlive,
): boolean {
  return !isLockAlive(lock, pidAlive);
}

function defaultPidAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    return false; // ESRCH, etc.
  }
}

// ─── R-2 recovery preflight helpers ───────────────────────────────────────────

export interface PreflightInput {
  statePath: string;
  lockPath: string;
  workingTreeChecker: () => Promise<{ clean: boolean; dirtyFiles: string[] }>;
  pidAlive?: (pid: number) => boolean;
}

export interface PreflightReport {
  lock: { status: "none" | "cleared_stale" | "held_alive"; previous?: SessionLock };
  stateReadable: boolean;
  workingTree: { clean: boolean; dirtyFiles: string[] };
}

/**
 * Execute the blueprint 15c preflight sequence (minus Stryker cache + abandoned
 * run moves — those live in the recovery module built later). Ensures lock is
 * clear or stale, working tree is clean, and state.json parses.
 *
 * Does NOT acquire the new lock — caller does that after preflight passes.
 */
export async function runPreflight(input: PreflightInput): Promise<PreflightReport> {
  const report: PreflightReport = {
    lock: { status: "none" },
    stateReadable: false,
    workingTree: { clean: true, dirtyFiles: [] },
  };

  // Lock check
  const existingLock = await readSessionLock(input.lockPath);
  if (existingLock) {
    const alive = isLockAlive(existingLock, input.pidAlive);
    if (alive) {
      throw new ConcurrentRunError(
        `another qa controller is running (pid ${existingLock.pid})`,
        { existingLock },
      );
    }
    await releaseSessionLock(input.lockPath);
    report.lock = { status: "cleared_stale", previous: existingLock };
  }

  // State readability
  try {
    await readState(input.statePath);
    report.stateReadable = true;
  } catch (err) {
    if (err instanceof StateCorruptionError) {
      const code = (err.context as { path?: string } | undefined)?.path;
      if (code === undefined) throw err; // true corruption, bubble up
      throw err;
    }
    throw err;
  }

  // Working tree
  report.workingTree = await input.workingTreeChecker();
  if (!report.workingTree.clean) {
    throw new DirtyWorkingTreeError(
      `working tree has uncommitted changes; commit or stash before qa run`,
      { dirtyFiles: report.workingTree.dirtyFiles },
    );
  }

  return report;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function assertScoreInRange(score: number, modulePath: string): void {
  if (
    !Number.isFinite(score) ||
    score < 0 ||
    score > 100 ||
    Number.isNaN(score)
  ) {
    throw new QaError(
      `mutation score out of range for ${modulePath}: ${score}. Expected 0..100.`,
      { modulePath, score },
    );
  }
}

function includeUnique<T>(arr: readonly T[], value: T): T[] {
  return arr.includes(value) ? [...arr] : [...arr, value];
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
}
