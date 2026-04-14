/**
 * R-2 recovery preflight (blueprint Part 9.2).
 *
 * Runs on every `qa run` start. Five checks, ALL must pass before the new
 * session may acquire the lock:
 *
 *   1. state.lock — alive PID? stale PID → clear + log. alive → throw
 *      ConcurrentRunError.
 *   2. git working tree — must be clean (throws DirtyWorkingTreeError
 *      otherwise; refuses to proceed).
 *   3. Abandoned runs — any run directory missing `summary.md` is moved
 *      to `.quality/runs/abandoned/<run-id>/` with a preflight note.
 *   4. Stryker incremental cache — if `mtime > lastSuccessfulRun.started_at`,
 *      discard. Forces a full baseline next session.
 *   5. state.json parse integrity — StateCorruptionError bubbles.
 *
 * Outputs a structured PreflightReport AND appends to
 * `.quality/runs/<new-run-id>/preflight.log`.
 */
import { promises as fs } from "node:fs";
import { join, basename } from "node:path";
import {
  defaultRunCommand,
  type RunCommandFn,
} from "./gates/base.js";
import {
  isLockAlive,
  readSessionLock,
  readState,
  releaseSessionLock,
} from "./state-manager.js";
import {
  ConcurrentRunError,
  DirtyWorkingTreeError,
  StateCorruptionError,
  type RunId,
  type SessionLock,
  type StateJson,
} from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PreflightInput {
  workingDir: string;
  statePath?: string; // defaults to `<workingDir>/.quality/state.json`
  lockPath?: string; // defaults to `<workingDir>/.quality/state.lock`
  runsDir?: string; // defaults to `<workingDir>/.quality/runs`
  strykerTmpDir?: string; // defaults to `<workingDir>/.stryker-tmp`
  /** Tag appended to the preflight.log path so each run has its own log. */
  newRunId: RunId;
  runCommand?: RunCommandFn;
  /** Testing hook — override the PID-alive check. */
  pidAlive?: (pid: number) => boolean;
}

export interface LockOutcome {
  status: "none" | "cleared_stale";
  previous?: SessionLock;
}

export interface AbandonedRun {
  runId: string;
  movedTo: string;
  reason: string;
}

export interface StrykerCacheOutcome {
  path: string;
  discarded: boolean;
  reason?: string;
}

export interface PreflightReport {
  newRunId: RunId;
  lock: LockOutcome;
  workingTree: { clean: boolean };
  abandonedRuns: AbandonedRun[];
  strykerCache: StrykerCacheOutcome;
  stateReadable: boolean;
  state?: StateJson;
  logPath: string;
  startedAt: string;
  endedAt: string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runRecoveryPreflight(
  input: PreflightInput,
): Promise<PreflightReport> {
  const startedAt = new Date().toISOString();
  const logLines: string[] = [`# Preflight ${input.newRunId}`, `started: ${startedAt}`, ""];

  const statePath =
    input.statePath ?? join(input.workingDir, ".quality", "state.json");
  const lockPath =
    input.lockPath ?? join(input.workingDir, ".quality", "state.lock");
  const runsDir = input.runsDir ?? join(input.workingDir, ".quality", "runs");
  const strykerTmpDir =
    input.strykerTmpDir ?? join(input.workingDir, ".stryker-tmp");
  const runCommand = input.runCommand ?? defaultRunCommand();

  // 1. Lock check
  const lockOutcome = await checkLock(lockPath, logLines, input.pidAlive);

  // 2. Working tree check
  const workingTree = await checkWorkingTree(runCommand, input.workingDir);
  logLines.push(`working_tree_clean: ${workingTree.clean}`);
  if (!workingTree.clean) {
    logLines.push(
      `dirty_files: ${workingTree.dirtyFiles.slice(0, 10).join(", ")}${workingTree.dirtyFiles.length > 10 ? "..." : ""}`,
    );
  }

  // 3. Abandoned runs
  const abandonedRuns = await detectAndMoveAbandonedRuns(
    runsDir,
    input.newRunId,
    logLines,
  );

  // 4. Stryker cache freshness
  const strykerCache = await checkStrykerCache(
    strykerTmpDir,
    statePath,
    logLines,
  );

  // 5. state.json integrity — last since it's the most likely to throw.
  let state: StateJson | undefined;
  let stateReadable = false;
  try {
    state = await readState(statePath);
    stateReadable = true;
    logLines.push(`state_readable: true`);
  } catch (err) {
    if (err instanceof StateCorruptionError) {
      logLines.push(`state_readable: false (${err.message})`);
      // If state doesn't exist yet (first ever run), we let the CLI handle
      // init. Only throw for corruption, not for ENOENT (which is signaled
      // via the StateCorruptionError message containing "missing").
      if (!/missing/i.test(err.message)) {
        await writeLog(runsDir, input.newRunId, logLines);
        throw err;
      }
    } else {
      throw err;
    }
  }

  // Throw dirty-tree AFTER all disk state is captured so log has context.
  if (!workingTree.clean) {
    await writeLog(runsDir, input.newRunId, logLines);
    throw new DirtyWorkingTreeError(
      `working tree has uncommitted changes; commit or stash before qa run`,
      { dirtyFiles: workingTree.dirtyFiles },
    );
  }

  const endedAt = new Date().toISOString();
  logLines.push(`ended: ${endedAt}`);
  const logPath = await writeLog(runsDir, input.newRunId, logLines);

  return {
    newRunId: input.newRunId,
    lock: lockOutcome,
    workingTree: { clean: workingTree.clean },
    abandonedRuns,
    strykerCache,
    stateReadable,
    ...(state !== undefined ? { state } : {}),
    logPath,
    startedAt,
    endedAt,
  };
}

// ─── Individual checks ────────────────────────────────────────────────────────

async function checkLock(
  lockPath: string,
  log: string[],
  pidAlive?: (pid: number) => boolean,
): Promise<LockOutcome> {
  const existing = await readSessionLock(lockPath);
  if (!existing) {
    log.push(`lock: none`);
    return { status: "none" };
  }
  const alive = isLockAlive(existing, pidAlive);
  if (alive) {
    log.push(
      `lock: CONFLICT (pid=${existing.pid} run=${existing.run_id} since=${existing.acquired_at})`,
    );
    throw new ConcurrentRunError(
      `another qa controller is running (pid ${existing.pid})`,
      { existingLock: existing },
    );
  }
  await releaseSessionLock(lockPath);
  log.push(
    `lock: cleared stale (pid=${existing.pid} was dead; previous run=${existing.run_id})`,
  );
  return { status: "cleared_stale", previous: existing };
}

async function checkWorkingTree(
  runCommand: RunCommandFn,
  workingDir: string,
): Promise<{ clean: boolean; dirtyFiles: string[] }> {
  const outcome = await runCommand("git", ["status", "--porcelain"], {
    cwd: workingDir,
  });
  if (outcome.exitCode !== 0) {
    // Not a git repo → treat as clean (controller will error later if
    // repo state becomes relevant).
    return { clean: true, dirtyFiles: [] };
  }
  const lines = outcome.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const dirtyFiles = lines.map((l) => l.slice(3).trim()).filter((s) => s.length > 0);
  return { clean: lines.length === 0, dirtyFiles };
}

async function detectAndMoveAbandonedRuns(
  runsDir: string,
  newRunId: string,
  log: string[],
): Promise<AbandonedRun[]> {
  const result: AbandonedRun[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(runsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      log.push(`abandoned_runs: runs dir absent (ok)`);
      return [];
    }
    throw err;
  }

  const abandonedDir = join(runsDir, "abandoned");
  for (const name of entries) {
    if (name === newRunId || name === "abandoned" || name.startsWith(".")) continue;
    const runDir = join(runsDir, name);
    const stat = await fs.stat(runDir).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;

    const summaryPath = join(runDir, "summary.md");
    try {
      await fs.access(summaryPath);
      continue; // has summary → not abandoned
    } catch {
      /* no summary → abandoned */
    }

    await fs.mkdir(abandonedDir, { recursive: true });
    const movedTo = join(abandonedDir, name);
    try {
      await fs.rename(runDir, movedTo);
      result.push({
        runId: name,
        movedTo,
        reason: "missing summary.md",
      });
      log.push(`abandoned: ${name} → ${movedTo}`);
      // Write a marker file with timestamp.
      await fs.writeFile(
        join(movedTo, "ABANDONED.txt"),
        `Marked ABANDONED during preflight for run ${newRunId} at ${new Date().toISOString()}\nReason: missing summary.md\n`,
      );
    } catch (err) {
      log.push(`abandon_failed: ${name} (${(err as Error).message})`);
    }
  }
  return result;
}

async function checkStrykerCache(
  strykerTmpDir: string,
  statePath: string,
  log: string[],
): Promise<StrykerCacheOutcome> {
  const incrementalPath = join(strykerTmpDir, "incremental.json");
  const stat = await fs.stat(incrementalPath).catch(() => null);
  if (!stat) {
    log.push(`stryker_cache: not present`);
    return { path: incrementalPath, discarded: false, reason: "not present" };
  }

  const cacheMtime = stat.mtime;
  const stateStat = await fs.stat(statePath).catch(() => null);
  if (!stateStat) {
    log.push(`stryker_cache: kept (no state.json to compare mtime)`);
    return {
      path: incrementalPath,
      discarded: false,
      reason: "no state.json to compare",
    };
  }
  const stateMtime = stateStat.mtime;

  // Heuristic: if the cache is newer than state.json, it was written by a
  // crashed/incomplete previous run. Discard it.
  if (cacheMtime.getTime() > stateMtime.getTime()) {
    try {
      await fs.unlink(incrementalPath);
      log.push(
        `stryker_cache: discarded (mtime ${cacheMtime.toISOString()} > state ${stateMtime.toISOString()})`,
      );
      return {
        path: incrementalPath,
        discarded: true,
        reason: `cache newer than last state.json commit`,
      };
    } catch (err) {
      log.push(`stryker_cache: discard failed (${(err as Error).message})`);
    }
  } else {
    log.push(
      `stryker_cache: kept (mtime ${cacheMtime.toISOString()} <= state ${stateMtime.toISOString()})`,
    );
  }
  return { path: incrementalPath, discarded: false };
}

async function writeLog(
  runsDir: string,
  runId: RunId,
  lines: string[],
): Promise<string> {
  const dir = join(runsDir, runId);
  await fs.mkdir(dir, { recursive: true });
  const logPath = join(dir, "preflight.log");
  await fs.writeFile(logPath, lines.join("\n") + "\n", { encoding: "utf8" });
  return logPath;
}

// Unused basename import kept for future expansion (move preserves basenames).
void basename;
