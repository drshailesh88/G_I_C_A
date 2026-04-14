import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runRecoveryPreflight } from "./recovery.js";
import {
  initializeState,
  writeState,
} from "./state-manager.js";
import {
  ConcurrentRunError,
  DirtyWorkingTreeError,
  type SessionLock,
} from "./types.js";
import type { CommandOutcome, RunCommandFn } from "./gates/base.js";

let root: string;
beforeEach(async () => {
  root = join(tmpdir(), `recovery-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(join(root, ".quality"), { recursive: true });
});
afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function fakeRunner(outcome: Partial<CommandOutcome> = {}): RunCommandFn {
  return async () => ({
    exitCode: 0,
    stdout: "",
    stderr: "",
    durationMs: 5,
    timedOut: false,
    ...outcome,
  });
}

async function writeLock(pid: number, hostOverride?: string): Promise<void> {
  const lock: SessionLock = {
    pid,
    run_id: "run-prev",
    acquired_at: "2026-04-14T22:00:00Z",
    host: hostOverride ?? (await import("node:os")).hostname(),
    qa_controller_version: "0.1.0",
  };
  await fs.writeFile(
    join(root, ".quality", "state.lock"),
    JSON.stringify(lock, null, 2),
  );
}

async function seedValidState(): Promise<void> {
  await writeState(
    join(root, ".quality", "state.json"),
    initializeState("2026-04-14T22:00:00Z"),
  );
}

describe("runRecoveryPreflight — lock", () => {
  test("no lock → LockOutcome none", async () => {
    await seedValidState();
    const report = await runRecoveryPreflight({
      workingDir: root,
      newRunId: "run-new-1",
      runCommand: fakeRunner(),
    });
    expect(report.lock.status).toBe("none");
  });

  test("stale lock → cleared with previous info", async () => {
    await seedValidState();
    await writeLock(0x7ffffffe); // dead pid
    const report = await runRecoveryPreflight({
      workingDir: root,
      newRunId: "run-new-1",
      runCommand: fakeRunner(),
      pidAlive: () => false,
    });
    expect(report.lock.status).toBe("cleared_stale");
    expect(report.lock.previous?.run_id).toBe("run-prev");
    const lockExists = await fs
      .access(join(root, ".quality", "state.lock"))
      .then(() => true)
      .catch(() => false);
    expect(lockExists).toBe(false);
  });

  test("alive lock → ConcurrentRunError", async () => {
    await seedValidState();
    await writeLock(process.pid);
    await expect(
      runRecoveryPreflight({
        workingDir: root,
        newRunId: "run-new-1",
        runCommand: fakeRunner(),
        pidAlive: () => true,
      }),
    ).rejects.toBeInstanceOf(ConcurrentRunError);
  });
});

describe("runRecoveryPreflight — working tree", () => {
  test("clean tree → passes", async () => {
    await seedValidState();
    const report = await runRecoveryPreflight({
      workingDir: root,
      newRunId: "run-new-1",
      runCommand: fakeRunner({ stdout: "" }),
    });
    expect(report.workingTree.clean).toBe(true);
  });

  test("dirty tree → DirtyWorkingTreeError", async () => {
    await seedValidState();
    await expect(
      runRecoveryPreflight({
        workingDir: root,
        newRunId: "run-new-1",
        runCommand: fakeRunner({ stdout: " M src/a.ts\n?? src/new.ts" }),
      }),
    ).rejects.toBeInstanceOf(DirtyWorkingTreeError);
  });

  test("non-git dir (exit 128) → treated as clean", async () => {
    await seedValidState();
    const report = await runRecoveryPreflight({
      workingDir: root,
      newRunId: "run-new-1",
      runCommand: fakeRunner({ exitCode: 128 }),
    });
    expect(report.workingTree.clean).toBe(true);
  });
});

describe("runRecoveryPreflight — abandoned runs", () => {
  test("moves runs without summary.md to abandoned/", async () => {
    await seedValidState();
    const runsDir = join(root, ".quality", "runs");
    await fs.mkdir(join(runsDir, "run-old-1"), { recursive: true });
    // No summary.md
    await fs.mkdir(join(runsDir, "run-old-2"), { recursive: true });
    await fs.writeFile(join(runsDir, "run-old-2", "summary.md"), "# Done");

    const report = await runRecoveryPreflight({
      workingDir: root,
      newRunId: "run-new-1",
      runCommand: fakeRunner(),
    });
    expect(report.abandonedRuns.map((r) => r.runId)).toContain("run-old-1");
    expect(report.abandonedRuns.map((r) => r.runId)).not.toContain("run-old-2");

    const markerExists = await fs
      .access(join(runsDir, "abandoned", "run-old-1", "ABANDONED.txt"))
      .then(() => true)
      .catch(() => false);
    expect(markerExists).toBe(true);
  });

  test("new run id and abandoned dir itself are skipped", async () => {
    await seedValidState();
    const runsDir = join(root, ".quality", "runs");
    await fs.mkdir(join(runsDir, "run-new-1"), { recursive: true });
    await fs.mkdir(join(runsDir, "abandoned"), { recursive: true });
    const report = await runRecoveryPreflight({
      workingDir: root,
      newRunId: "run-new-1",
      runCommand: fakeRunner(),
    });
    expect(report.abandonedRuns).toEqual([]);
  });
});

describe("runRecoveryPreflight — Stryker cache", () => {
  test("discards cache newer than state.json", async () => {
    await seedValidState();
    const tmpDir = join(root, ".stryker-tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    const incrementalPath = join(tmpDir, "incremental.json");
    await fs.writeFile(incrementalPath, "{}");
    // Bump incremental.json mtime 1 hour in the future.
    const future = new Date(Date.now() + 3600_000);
    await fs.utimes(incrementalPath, future, future);

    const report = await runRecoveryPreflight({
      workingDir: root,
      newRunId: "run-new-1",
      runCommand: fakeRunner(),
    });
    expect(report.strykerCache.discarded).toBe(true);
    const stillExists = await fs
      .access(incrementalPath)
      .then(() => true)
      .catch(() => false);
    expect(stillExists).toBe(false);
  });

  test("keeps cache older than state.json", async () => {
    await seedValidState();
    const tmpDir = join(root, ".stryker-tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    const incrementalPath = join(tmpDir, "incremental.json");
    await fs.writeFile(incrementalPath, "{}");
    // Bump state.json to be newer than cache.
    const statePath = join(root, ".quality", "state.json");
    const future = new Date(Date.now() + 60_000);
    await fs.utimes(statePath, future, future);

    const report = await runRecoveryPreflight({
      workingDir: root,
      newRunId: "run-new-1",
      runCommand: fakeRunner(),
    });
    expect(report.strykerCache.discarded).toBe(false);
  });

  test("absent cache → not present, not discarded", async () => {
    await seedValidState();
    const report = await runRecoveryPreflight({
      workingDir: root,
      newRunId: "run-new-1",
      runCommand: fakeRunner(),
    });
    expect(report.strykerCache.discarded).toBe(false);
    expect(report.strykerCache.reason).toBe("not present");
  });
});

describe("runRecoveryPreflight — log file", () => {
  test("writes preflight.log with section headers", async () => {
    await seedValidState();
    const report = await runRecoveryPreflight({
      workingDir: root,
      newRunId: "run-new-1",
      runCommand: fakeRunner(),
    });
    expect(report.logPath).toContain("preflight.log");
    const contents = await fs.readFile(report.logPath, "utf8");
    expect(contents).toContain("# Preflight run-new-1");
    expect(contents).toContain("lock:");
    expect(contents).toContain("working_tree_clean:");
    expect(contents).toContain("state_readable:");
  });
});

describe("runRecoveryPreflight — state integrity", () => {
  test("returns parsed state when valid", async () => {
    await seedValidState();
    const report = await runRecoveryPreflight({
      workingDir: root,
      newRunId: "run-new-1",
      runCommand: fakeRunner(),
    });
    expect(report.stateReadable).toBe(true);
    expect(report.state?.schema_version).toBe(1);
  });

  test("propagates StateCorruptionError on malformed state", async () => {
    await fs.writeFile(join(root, ".quality", "state.json"), "{corrupt");
    await expect(
      runRecoveryPreflight({
        workingDir: root,
        newRunId: "run-new-1",
        runCommand: fakeRunner(),
      }),
    ).rejects.toThrow();
  });

  test("absent state.json is tolerated (first-run scenario)", async () => {
    const report = await runRecoveryPreflight({
      workingDir: root,
      newRunId: "run-new-1",
      runCommand: fakeRunner(),
    });
    expect(report.stateReadable).toBe(false);
  });
});
