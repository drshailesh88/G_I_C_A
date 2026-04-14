#!/usr/bin/env node
/**
 * QA controller — CLI entry point (blueprint Part 5.1 + 5.4 + 7).
 *
 * Subcommands (all fully implemented in Phase 4):
 *   run                Full session: preflight → lock → baseline → features →
 *                      release gates → deterministic summary.md + state-delta
 *   baseline           Full Stryker + Vitest + Playwright to populate state
 *   status             Current state snapshot + per-tier floor check
 *   report             List all runs or open a specific run's summary.md
 *   doctor             Drift checks (services, contract hashes, deprecated
 *                      commands, tiers coverage, providers consistency)
 *   clean              Clear stale locks + archive old runs' heavy artifacts
 *   unblock            Reset BLOCKED feature → pending + clear plateau buffer
 *   baseline-reset     Explicit ratchet-down with audit log entry
 *   audit-violations   Aggregate violations.jsonl across all runs by pattern
 */
import { promises as fs } from "node:fs";
import { join, relative, resolve } from "node:path";
import { Command } from "commander";
import yaml from "js-yaml";
import {
  defaultRunCommand,
  computeFileHash,
  type RunCommandFn,
} from "./gates/base.js";
import {
  acquireSessionLock,
  endRun,
  incrementViolationCount,
  initializeState,
  markFeatureBlocked,
  readSessionLock,
  readState,
  recordRunFeatureOutcome,
  releaseSessionLock,
  resetFeatureAttempts,
  resetModuleBaseline,
  startRun,
  writeState,
} from "./state-manager.js";
import { runRecoveryPreflight } from "./recovery.js";
import { runFeatureLoop, type FeatureLoopResult } from "./feature-loop.js";
import {
  getDirectDeps,
  getReverseDeps,
} from "./detection/dependency-analyzer.js";
import { loadProvider } from "./providers/base.js";
import { parseStrykerReport } from "./parsers/stryker-json.js";
import { runReleaseGates, type ReleaseResult } from "./gates/release-runner.js";
import { writeSummary } from "./reports/summary-writer.js";
import {
  buildStateDelta,
  writeStateDelta,
} from "./reports/state-delta-writer.js";
import {
  ContractIndexSchema,
  TierConfigSchema,
  ViolationEntrySchema,
  SecurityCategorySet,
  FeatureStateSchema,
  type ContractIndex,
  type FeatureState,
  type RunId,
  type StateJson,
  type TierConfig,
  type ViolationEntry,
} from "./types.js";

const ISO_NOW = (): string => new Date().toISOString();
const CONTROLLER_VERSION = "0.1.0";

const DEPRECATED_COMMANDS: readonly string[] = [
  "anneal",
  "anneal-check",
  "harden",
  "spec-runner",
];

// ─── Session orchestration (testable) ────────────────────────────────────────

export interface SessionInput {
  workingDir: string;
  runCommand?: RunCommandFn;
  runId?: RunId;
  featureId?: string;
  category?: string;
  noNotification?: boolean;
  skipBaselineStryker?: boolean;
  /** Skip release-gate execution (tests, speedy dev runs). */
  skipReleaseGates?: boolean;
  onOpen?: (path: string) => Promise<void>;
  onNotify?: (message: string) => Promise<void>;
}

export interface SessionResult {
  runId: RunId;
  featuresAttempted: string[];
  featuresGreen: string[];
  featuresBlocked: string[];
  violationsCount: number;
  summaryPath: string;
  stateDeltaPath: string;
  releaseVerdict?: ReleaseResult["verdict"];
  endedAt: string;
}

export async function runSession(input: SessionInput): Promise<SessionResult> {
  const runCommand = input.runCommand ?? defaultRunCommand();
  const runId = input.runId ?? generateRunId();

  const qualityDir = join(input.workingDir, ".quality");
  const runsDir = join(qualityDir, "runs");
  const runArtifactsDir = join(runsDir, runId);
  const lockPath = join(qualityDir, "state.lock");
  const statePath = join(qualityDir, "state.json");
  const policiesDir = join(qualityDir, "policies");
  const contractsDir = join(qualityDir, "contracts");

  await runRecoveryPreflight({
    workingDir: input.workingDir,
    newRunId: runId,
    runCommand,
  });

  await fs.mkdir(runArtifactsDir, { recursive: true });
  const startedAt = ISO_NOW();
  await acquireSessionLock({
    lockPath,
    runId,
    qaControllerVersion: CONTROLLER_VERSION,
    timestamp: startedAt,
  });

  let state: StateJson;
  try {
    state = await readState(statePath);
  } catch {
    state = initializeState(startedAt);
    await writeState(statePath, state);
  }
  const startingState: StateJson = JSON.parse(JSON.stringify(state));

  const tiers = await loadTierConfig(policiesDir);
  const contracts = await loadAllContracts(contractsDir);
  const filteredContracts = applyCategoryGate(contracts, {
    ...(input.featureId !== undefined ? { featureId: input.featureId } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
  });

  const baselineStartMs = Date.now();
  let baselineScore: number | undefined;
  if (!input.skipBaselineStryker) {
    baselineScore = await runFullStrykerBaseline(runCommand, input.workingDir);
  }
  const baselineStrykerMs = Date.now() - baselineStartMs;
  state = startRun(state, runId, startedAt, baselineScore);

  const provider = await loadProvider(policiesDir, {
    workingDir: input.workingDir,
    runCommand,
  });

  const featureResults: FeatureLoopResult[] = [];
  const violationEntries: ViolationEntry[] = [];

  for (const contract of filteredContracts) {
    const contractDir = join(contractsDir, contract.feature.id);
    state = recordRunFeatureOutcome(
      state,
      runId,
      contract.feature.id,
      "attempted",
      ISO_NOW(),
    );
    const result = await runFeatureLoop({
      runId,
      sessionId: runId,
      featureId: contract.feature.id,
      contract,
      contractDir,
      state,
      tiers,
      workingDir: input.workingDir,
      runArtifactsDir,
      provider,
      runCommand,
      getDirectDeps: (file: string) => getDirectDeps(file, input.workingDir),
      getReverseDeps: (files: string[]) => getReverseDeps(files, input.workingDir),
    });
    featureResults.push(result);
    state = result.state;

    state = recordRunFeatureOutcome(
      state,
      runId,
      contract.feature.id,
      result.finalOutcome === "GREEN" ? "green" : "blocked",
      ISO_NOW(),
    );

    for (const v of result.violationEntries) {
      violationEntries.push(v);
      state = incrementViolationCount(state, runId, ISO_NOW());
    }
  }

  // ── Release gates
  let releaseResult: ReleaseResult | undefined;
  let finalStrykerScore: number | undefined;
  if (!input.skipReleaseGates) {
    const releaseConfig = await loadReleaseConfig(policiesDir);
    releaseResult = await runReleaseGates({
      config: {
        runId,
        workingDir: input.workingDir,
        evidenceDir: join(runArtifactsDir, "evidence"),
        runCommand,
      },
      tiers,
      ...(releaseConfig.axe?.routes !== undefined
        ? {
            axe: {
              routes: releaseConfig.axe.routes,
              ...(releaseConfig.axe.baseUrl !== undefined ? { baseUrl: releaseConfig.axe.baseUrl } : {}),
              ...(releaseConfig.axe.minSeverity !== undefined ? { minSeverity: releaseConfig.axe.minSeverity } : {}),
            },
          }
        : {}),
      ...(releaseConfig.visual?.routes !== undefined
        ? {
            visual: {
              routes: releaseConfig.visual.routes,
              ...(releaseConfig.visual.baseUrl !== undefined ? { baseUrl: releaseConfig.visual.baseUrl } : {}),
            },
          }
        : {}),
      ...(releaseConfig.apiContract !== undefined ? { apiContract: releaseConfig.apiContract } : {}),
      ...(releaseConfig.bundleSize !== undefined ? { bundleSize: releaseConfig.bundleSize } : {}),
      ...(releaseConfig.lighthouse !== undefined ? { lighthouse: releaseConfig.lighthouse } : {}),
      ...(releaseConfig.license !== undefined ? { license: releaseConfig.license } : {}),
      ...(releaseConfig.migrations !== undefined ? { migrations: releaseConfig.migrations } : {}),
      ...(releaseConfig.skipGates !== undefined ? { skipGates: releaseConfig.skipGates } : {}),
    });
    // Extract final Stryker score from the release-stryker-full gate for the
    // Baseline → Final row in the summary.
    const strykerFull = releaseResult.gateResults.find(
      (g) => g.gateId === "stryker-full",
    );
    if (strykerFull) {
      const details = strykerFull.details as { overallScore?: number | null };
      if (typeof details.overallScore === "number") {
        finalStrykerScore = details.overallScore;
      }
    }
  }

  const endedAt = ISO_NOW();
  state = endRun(state, runId, endedAt, finalStrykerScore);
  await writeState(statePath, state);

  // ── Deterministic summary + state-delta
  const summaryPath = join(runArtifactsDir, "summary.md");
  await writeSummary({
    summaryPath,
    runId,
    startedAt,
    endedAt,
    controllerVersion: CONTROLLER_VERSION,
    triggeredBy: "qa run",
    featureResults,
    violationEntries,
    ...(releaseResult !== undefined ? { releaseResult } : {}),
    state,
    startingState,
    ...(baselineScore !== undefined ? { baselineStrykerScore: baselineScore } : {}),
    ...(finalStrykerScore !== undefined ? { finalStrykerScore } : {}),
    performance: {
      baselineStrykerMs,
      fixerInvocations: featureResults.reduce(
        (sum, f) => sum + f.attempts.length,
        0,
      ),
    },
  });

  const stateDeltaPath = join(runArtifactsDir, "state-delta.json");
  await writeStateDelta(
    stateDeltaPath,
    buildStateDelta({ runId, startingState, endingState: state }),
  );

  if (violationEntries.length > 0) {
    await fs.writeFile(
      join(runArtifactsDir, "violations.jsonl"),
      violationEntries.map((v) => JSON.stringify(v)).join("\n") + "\n",
    );
  }

  // ── Commit state
  try {
    await runCommand(
      "git",
      ["add", ".quality/state.json", `.quality/runs/${runId}/`],
      { cwd: input.workingDir },
    );
    await runCommand(
      "git",
      ["commit", "-m", `chore(qa): state update after ${runId}`],
      {
        cwd: input.workingDir,
        env: { ...process.env, QA_CONTROLLER_COMMIT: "1" },
      },
    );
  } catch {
    /* best-effort */
  }

  await releaseSessionLock(lockPath);

  const greenCount = featureResults.filter((f) => f.finalOutcome === "GREEN").length;
  const blockedCount = featureResults.length - greenCount;
  const verdictMsg = `QA run complete: ${greenCount} green, ${blockedCount} blocked${releaseResult ? `, release ${releaseResult.verdict}` : ""}`;
  if (!input.noNotification) {
    const notifier = input.onNotify ?? defaultNotify;
    await notifier(verdictMsg).catch(() => {});
    const opener = input.onOpen ?? defaultOpen;
    await opener(summaryPath).catch(() => {});
  }

  return {
    runId,
    featuresAttempted: featureResults.map((f) => f.featureId),
    featuresGreen: featureResults.filter((f) => f.finalOutcome === "GREEN").map((f) => f.featureId),
    featuresBlocked: featureResults.filter((f) => f.finalOutcome === "BLOCKED").map((f) => f.featureId),
    violationsCount: violationEntries.length,
    summaryPath,
    stateDeltaPath,
    ...(releaseResult !== undefined ? { releaseVerdict: releaseResult.verdict } : {}),
    endedAt,
  };
}

// ─── Release config loader ───────────────────────────────────────────────────

interface ReleasePolicyFile {
  axe?: { routes?: string[]; baseUrl?: string; minSeverity?: "minor" | "moderate" | "serious" | "critical" };
  visual?: { routes?: string[]; baseUrl?: string };
  apiContract?: { baseUrl?: string };
  bundleSize?: { buildDir?: string; thresholds?: Record<string, number>; totalMaxBytes?: number; defaultMaxBytes?: number };
  lighthouse?: { thresholds?: Record<string, number>; configPath?: string };
  license?: { forbidden?: string[]; failOnUnknown?: boolean };
  migrations?: { migrationsDir?: string };
  skipGates?: string[];
}

async function loadReleaseConfig(
  policiesDir: string,
): Promise<ReleasePolicyFile> {
  const path = join(policiesDir, "release.yaml");
  const raw = await fs.readFile(path, "utf8").catch(() => null);
  if (raw === null) return {};
  try {
    return (yaml.load(raw) as ReleasePolicyFile) ?? {};
  } catch {
    return {};
  }
}

// ─── baseline-reset ──────────────────────────────────────────────────────────

export interface BaselineResetInput {
  workingDir: string;
  module: string;
  reason: string;
  newBaseline: number;
  approvedBy: string;
  runCommand?: RunCommandFn;
}

export async function runBaselineReset(
  input: BaselineResetInput,
): Promise<void> {
  const statePath = join(input.workingDir, ".quality", "state.json");
  const state = await readState(statePath);
  const updated = resetModuleBaseline({
    state,
    modulePath: input.module,
    newBaseline: input.newBaseline,
    reason: input.reason,
    triggered_by: "qa-baseline-reset command",
    approved_by: input.approvedBy,
    timestamp: ISO_NOW(),
  });
  await writeState(statePath, updated);
}

// ─── clean ───────────────────────────────────────────────────────────────────

export interface CleanResult {
  staleLockCleared: boolean;
  archivedRuns: string[];
  retainedRuns: string[];
}

export interface CleanInput {
  workingDir: string;
  retentionDays?: number;
  pidAlive?: (pid: number) => boolean;
}

export async function runClean(input: CleanInput): Promise<CleanResult> {
  const retentionDays = input.retentionDays ?? 30;
  const qualityDir = join(input.workingDir, ".quality");
  const lockPath = join(qualityDir, "state.lock");
  const runsDir = join(qualityDir, "runs");

  let staleLockCleared = false;
  try {
    const { readSessionLock: readLock, isLockAlive } = await import("./state-manager.js");
    const lock = await readLock(lockPath);
    if (lock && !isLockAlive(lock, input.pidAlive)) {
      await fs.unlink(lockPath);
      staleLockCleared = true;
    }
  } catch {
    /* ignore */
  }

  const archivedRuns: string[] = [];
  const retainedRuns: string[] = [];
  let entries: string[] = [];
  try {
    entries = await fs.readdir(runsDir);
  } catch {
    entries = [];
  }
  const cutoff = Date.now() - retentionDays * 24 * 3600 * 1000;
  for (const name of entries) {
    if (name === "abandoned") continue;
    const runDir = join(runsDir, name);
    const stat = await fs.stat(runDir).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;
    if (stat.mtimeMs < cutoff) {
      for (const heavy of [
        "evidence",
        "fixer-notes",
        "traces",
        "stryker-html",
        "playwright-report",
      ]) {
        await fs.rm(join(runDir, heavy), { recursive: true, force: true });
      }
      archivedRuns.push(name);
    } else {
      retainedRuns.push(name);
    }
  }

  return { staleLockCleared, archivedRuns, retainedRuns };
}

// ─── status ──────────────────────────────────────────────────────────────────

export interface StatusReport {
  lastRunId?: string;
  features: {
    total: number;
    green: number;
    blocked: number;
    pending: number;
    in_progress: number;
  };
  modules: Array<{
    path: string;
    tier: string;
    baseline: number;
    floor: number | null;
    hasExceededFloor: boolean;
    belowFloor: boolean;
  }>;
  testCountHistoryLatest: {
    vitest_unit: number | undefined;
    vitest_integration: number | undefined;
    playwright: number | undefined;
  };
}

export async function runStatus(
  workingDir: string,
): Promise<StatusReport> {
  const statePath = join(workingDir, ".quality", "state.json");
  const state = await readState(statePath);

  const counts = { total: 0, green: 0, blocked: 0, pending: 0, in_progress: 0 };
  for (const feat of Object.values(state.features)) {
    counts.total++;
    counts[feat.status]++;
  }

  const modules: StatusReport["modules"] = [];
  for (const [path, baseline] of Object.entries(state.modules)) {
    const floor = tierFloor(baseline.tier);
    modules.push({
      path,
      tier: baseline.tier,
      baseline: baseline.mutation_baseline,
      floor,
      hasExceededFloor: baseline.has_exceeded_floor,
      belowFloor: floor !== null && baseline.mutation_baseline < floor,
    });
  }

  const history = state.test_count_history;
  return {
    ...(state.last_run_id !== undefined ? { lastRunId: state.last_run_id } : {}),
    features: counts,
    modules: modules.sort((a, b) => a.path.localeCompare(b.path)),
    testCountHistoryLatest: {
      vitest_unit: history.vitest_unit[history.vitest_unit.length - 1],
      vitest_integration: history.vitest_integration[history.vitest_integration.length - 1],
      playwright: history.playwright[history.playwright.length - 1],
    },
  };
}

function tierFloor(tier: string): number | null {
  if (tier === "critical_75") return 75;
  if (tier === "business_60") return 60;
  return null;
}

// ─── report ──────────────────────────────────────────────────────────────────

export interface RunListEntry {
  runId: string;
  startedAt?: string;
  endedAt?: string;
  summaryPath: string;
  summaryExists: boolean;
  verdictLine?: string;
}

export async function listRuns(workingDir: string): Promise<RunListEntry[]> {
  const runsDir = join(workingDir, ".quality", "runs");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(runsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const runs: RunListEntry[] = [];
  for (const name of entries) {
    if (name === "abandoned" || name.startsWith(".")) continue;
    const runDir = join(runsDir, name);
    const stat = await fs.stat(runDir).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;
    const summaryPath = join(runDir, "summary.md");
    const summaryExists = await fs
      .access(summaryPath)
      .then(() => true)
      .catch(() => false);
    let verdictLine: string | undefined;
    if (summaryExists) {
      const raw = await fs.readFile(summaryPath, "utf8").catch(() => "");
      const match = raw.match(/\*\*Status:\*\*\s*(.+)/);
      if (match) verdictLine = match[1]!.trim();
    }
    runs.push({
      runId: name,
      summaryPath,
      summaryExists,
      ...(verdictLine !== undefined ? { verdictLine } : {}),
    });
  }
  return runs.sort((a, b) => a.runId.localeCompare(b.runId));
}

export async function readRunSummary(
  workingDir: string,
  runId: string,
): Promise<string> {
  const summaryPath = join(workingDir, ".quality", "runs", runId, "summary.md");
  return fs.readFile(summaryPath, "utf8");
}

// ─── doctor ──────────────────────────────────────────────────────────────────

export interface DoctorReport {
  ok: boolean;
  issues: DoctorIssue[];
  checked: string[];
}

export interface DoctorIssue {
  check: string;
  severity: "error" | "warn";
  message: string;
}

export async function runDoctor(workingDir: string): Promise<DoctorReport> {
  const issues: DoctorIssue[] = [];
  const checked: string[] = [];

  const qualityDir = join(workingDir, ".quality");
  const contractsDir = join(qualityDir, "contracts");
  const policiesDir = join(qualityDir, "policies");

  // 1. Deprecated commands present?
  checked.push("deprecated-commands");
  const playbookCommands = resolve(workingDir, "..", "build_playbook", "commands");
  for (const dep of DEPRECATED_COMMANDS) {
    const path = join(playbookCommands, `${dep}.md`);
    const exists = await fs.access(path).then(() => true).catch(() => false);
    if (exists) {
      issues.push({
        check: "deprecated-commands",
        severity: "warn",
        message: `Deprecated command still present: ${dep}.md. Move to commands/deprecated/ or remove.`,
      });
    }
  }

  // 2. Contract hashes vs actual
  checked.push("contract-hashes");
  const contracts = await loadAllContracts(contractsDir);
  for (const contract of contracts) {
    for (const [filename, storedHash] of Object.entries(contract.hashes)) {
      const artifactPath = join(contractsDir, contract.feature.id, filename);
      try {
        const actual = await computeFileHash(artifactPath);
        if (actual !== storedHash) {
          issues.push({
            check: "contract-hashes",
            severity: "error",
            message: `Contract ${contract.feature.id}/${filename} hash mismatch (stored ${storedHash.slice(0, 22)}..., actual ${actual.slice(0, 22)}...)`,
          });
        }
      } catch {
        issues.push({
          check: "contract-hashes",
          severity: "error",
          message: `Contract artifact missing: ${contract.feature.id}/${filename}`,
        });
      }
    }
  }

  // 3. Tiers coverage (6b.iii fail-fast — unclassified source files)
  checked.push("tiers-coverage");
  const { runClassifyCheck } = await import("./classify-checker.js");
  const classifyResult = await runClassifyCheck({ workingDir }).catch(
    () => null,
  );
  if (classifyResult && !classifyResult.ok) {
    for (const path of classifyResult.unclassified.slice(0, 10)) {
      issues.push({
        check: "tiers-coverage",
        severity: "error",
        message: `Unclassified source file: ${path} (no tiers.yaml glob matched)`,
      });
    }
    if (classifyResult.unclassified.length > 10) {
      issues.push({
        check: "tiers-coverage",
        severity: "error",
        message: `...and ${classifyResult.unclassified.length - 10} more unclassified files`,
      });
    }
  }

  // 4. Providers policy consistency
  checked.push("providers-policy");
  const providersPath = join(policiesDir, "providers.yaml");
  const providersRaw = await fs.readFile(providersPath, "utf8").catch(() => null);
  if (providersRaw) {
    try {
      const policy = yaml.load(providersRaw) as {
        active_fixer?: string;
        enabled?: string[];
        disabled?: string[];
      };
      if (
        policy.active_fixer &&
        policy.disabled?.includes(policy.active_fixer) &&
        !policy.enabled?.includes(policy.active_fixer)
      ) {
        issues.push({
          check: "providers-policy",
          severity: "error",
          message: `active_fixer "${policy.active_fixer}" is in disabled list`,
        });
      }
    } catch {
      issues.push({
        check: "providers-policy",
        severity: "warn",
        message: `providers.yaml failed to parse`,
      });
    }
  }

  // 5. detected-services vs package.json
  checked.push("detected-services");
  const detectedPath = join(policiesDir, "detected-services.yaml");
  const detectedRaw = await fs.readFile(detectedPath, "utf8").catch(() => null);
  if (detectedRaw) {
    try {
      const detected = yaml.load(detectedRaw) as { services?: string[] };
      const pkgPath = join(workingDir, "package.json");
      const pkgRaw = await fs.readFile(pkgPath, "utf8").catch(() => null);
      if (pkgRaw) {
        const pkg = JSON.parse(pkgRaw) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        for (const service of detected.services ?? []) {
          // Heuristic: services often have package name patterns containing
          // the service name (e.g. "@clerk/nextjs" contains "clerk").
          const found = Object.keys(deps).some((d) =>
            d.toLowerCase().includes(service.toLowerCase()),
          );
          if (!found) {
            issues.push({
              check: "detected-services",
              severity: "warn",
              message: `Service "${service}" in detected-services.yaml but no matching package.json dep`,
            });
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return {
    ok: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    checked,
  };
}

// ─── unblock ─────────────────────────────────────────────────────────────────

export async function runUnblock(
  workingDir: string,
  featureId: string,
): Promise<void> {
  const statePath = join(workingDir, ".quality", "state.json");
  const state = await readState(statePath);
  const existing = state.features[featureId];
  if (!existing) {
    throw new Error(`Feature "${featureId}" not found in state.json`);
  }
  if (existing.status !== "blocked") {
    throw new Error(
      `Feature "${featureId}" is ${existing.status}, not blocked. Nothing to unblock.`,
    );
  }
  const next: FeatureState = FeatureStateSchema.parse({
    contract_version: existing.contract_version,
    status: "pending",
    attempts_this_session: 0,
    plateau_buffer: [],
  });
  const updated: StateJson = {
    ...state,
    last_updated: ISO_NOW(),
    features: { ...state.features, [featureId]: next },
  };
  await writeState(statePath, updated);
}

// Re-export for external test consumption
export { markFeatureBlocked, resetFeatureAttempts };

// ─── audit-violations ────────────────────────────────────────────────────────

export interface ViolationAuditReport {
  totalRuns: number;
  runsWithViolations: number;
  totalViolations: number;
  byPattern: Record<string, { count: number; runs: string[] }>;
}

export async function runAuditViolations(
  workingDir: string,
): Promise<ViolationAuditReport> {
  const runsDir = join(workingDir, ".quality", "runs");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(runsDir);
  } catch {
    return {
      totalRuns: 0,
      runsWithViolations: 0,
      totalViolations: 0,
      byPattern: {},
    };
  }

  const report: ViolationAuditReport = {
    totalRuns: 0,
    runsWithViolations: 0,
    totalViolations: 0,
    byPattern: {},
  };
  for (const name of entries) {
    if (name === "abandoned" || name.startsWith(".")) continue;
    const runDir = join(runsDir, name);
    const stat = await fs.stat(runDir).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;
    report.totalRuns++;

    const jsonlPath = join(runDir, "violations.jsonl");
    const raw = await fs.readFile(jsonlPath, "utf8").catch(() => null);
    if (raw === null) continue;
    report.runsWithViolations++;
    for (const line of raw.split("\n")) {
      if (line.trim() === "") continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const result = ViolationEntrySchema.safeParse(parsed);
      if (!result.success) continue;
      for (const v of result.data.violations) {
        report.totalViolations++;
        const bucket = report.byPattern[v.pattern_id] ?? { count: 0, runs: [] };
        bucket.count++;
        if (!bucket.runs.includes(name)) bucket.runs.push(name);
        report.byPattern[v.pattern_id] = bucket;
      }
    }
  }
  return report;
}

// ─── baseline (full) ─────────────────────────────────────────────────────────

export interface BaselineInput {
  workingDir: string;
  runCommand?: RunCommandFn;
  module?: string;
}

export async function runBaseline(input: BaselineInput): Promise<void> {
  const runCommand = input.runCommand ?? defaultRunCommand();
  const statePath = join(input.workingDir, ".quality", "state.json");

  let state: StateJson;
  try {
    state = await readState(statePath);
  } catch {
    state = initializeState(ISO_NOW());
  }

  // Full Stryker — either full project or targeted module.
  const args = ["stryker", "run"];
  if (input.module) {
    args.push("--mutate", input.module);
  }
  const stryker = await runCommand("npx", args, {
    cwd: input.workingDir,
    timeout: 60 * 60 * 1000,
  });
  if (stryker.exitCode !== 0 && stryker.exitCode !== 1) {
    throw new Error(
      `Stryker baseline failed with exit ${stryker.exitCode}: ${stryker.stderr}`,
    );
  }
  const stryReport = await parseStrykerReport(
    join(input.workingDir, "reports", "mutation", "mutation.json"),
  );

  // Apply new module baselines (ratchet-up only; explicit reset required for
  // downward adjustments).
  const tiers = await loadTierConfig(join(input.workingDir, ".quality", "policies"));
  const { applyMutationMeasurement } = await import("./state-manager.js");
  const { classifyFile } = await import("./parsers/stryker-json.js");
  for (const [modulePath, score] of stryReport.perFile.entries()) {
    if (score.score === null) continue;
    const tier = classifyFile(modulePath, tiers) ?? score.tier;
    if (!tier) continue; // unclassified → skip; qa-doctor will flag
    try {
      state = applyMutationMeasurement({
        state,
        modulePath,
        newScore: score.score,
        tier,
        runId: "baseline-manual",
        timestamp: ISO_NOW(),
      }).state;
    } catch {
      // ratchet violation — expected for the baseline command if scores
      // regressed since last ratchet. Skip silently; user should use
      // baseline-reset for those.
    }
  }

  await writeState(statePath, state);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function generateRunId(): RunId {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `run-${ts}-${rand}`;
}

async function loadTierConfig(policiesDir: string): Promise<TierConfig> {
  const path = join(policiesDir, "tiers.yaml");
  const raw = await fs.readFile(path, "utf8").catch(() => null);
  if (raw === null) {
    return TierConfigSchema.parse({
      schema_version: 1,
      tiers: { critical_75: [], business_60: [], ui_gates_only: [] },
      unclassified_behavior: "fail_fast",
    });
  }
  return TierConfigSchema.parse(yaml.load(raw));
}

export async function loadAllContracts(
  contractsDir: string,
): Promise<ContractIndex[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(contractsDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const contracts: ContractIndex[] = [];
  for (const name of entries) {
    const indexPath = join(contractsDir, name, "index.yaml");
    const raw = await fs.readFile(indexPath, "utf8").catch(() => null);
    if (raw === null) continue;
    const parsed = yaml.load(raw);
    const result = ContractIndexSchema.safeParse(parsed);
    if (result.success) contracts.push(result.data);
  }
  return contracts;
}

export interface CategoryGateFilter {
  featureId?: string;
  category?: string;
}

export function applyCategoryGate(
  contracts: ContractIndex[],
  filter: CategoryGateFilter = {},
): ContractIndex[] {
  const critical: ContractIndex[] = [];
  const business: ContractIndex[] = [];
  const errors: string[] = [];

  for (const c of contracts) {
    if (filter.featureId && c.feature.id !== filter.featureId) continue;
    if (filter.category && c.feature.category !== filter.category) continue;

    if (SecurityCategorySet.has(c.feature.category)) {
      if (c.feature.status !== "frozen") {
        errors.push(
          `HARD ERROR: feature ${c.feature.id} (${c.feature.category}) is status=${c.feature.status}; must be frozen before qa run`,
        );
      } else {
        critical.push(c);
      }
    } else {
      if (c.feature.status !== "frozen") continue;
      business.push(c);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  return [...critical, ...business];
}

async function runFullStrykerBaseline(
  runCommand: RunCommandFn,
  workingDir: string,
): Promise<number | undefined> {
  const outcome = await runCommand("npx", ["stryker", "run"], {
    cwd: workingDir,
    timeout: 60 * 60 * 1000,
  });
  if (outcome.exitCode !== 0 && outcome.exitCode !== 1) return undefined;
  try {
    const report = await parseStrykerReport(
      join(workingDir, "reports", "mutation", "mutation.json"),
    );
    return report.overallScore ?? undefined;
  } catch {
    return undefined;
  }
}

// Unclassified-source walking moved to classify-checker.ts.
// qa-doctor and the classify-check command both delegate to it.

async function defaultNotify(message: string): Promise<void> {
  if (process.platform !== "darwin") return;
  const runCommand = defaultRunCommand();
  await runCommand(
    "osascript",
    [
      "-e",
      `display notification "${message.replace(/"/g, '\\"')}" with title "QA"`,
    ],
    {},
  );
}

async function defaultOpen(path: string): Promise<void> {
  if (process.platform !== "darwin") return;
  const runCommand = defaultRunCommand();
  await runCommand("open", [path], {});
}

// ─── CLI wiring ──────────────────────────────────────────────────────────────

export function buildCli(): Command {
  const program = new Command();
  program
    .name("qa")
    .description("QA controller — hardened test-and-repair loop")
    .version(CONTROLLER_VERSION);

  program
    .command("run")
    .description("Run the full QA session")
    .option("--feature <id>", "run only this feature")
    .option("--category <category>", "run only features in this category")
    .option("--no-notification", "skip macOS notification + open")
    .option("--skip-baseline-stryker", "skip full Stryker baseline (dev)")
    .option("--skip-release-gates", "skip session-end release gates (dev)")
    .action(async (opts) => {
      const result = await runSession({
        workingDir: process.cwd(),
        ...(opts.feature ? { featureId: opts.feature as string } : {}),
        ...(opts.category ? { category: opts.category as string } : {}),
        noNotification: opts.notification === false,
        skipBaselineStryker: Boolean(opts.skipBaselineStryker),
        skipReleaseGates: Boolean(opts.skipReleaseGates),
      });
      process.stdout.write(`RUN ${result.runId}\n`);
      process.stdout.write(`summary: ${result.summaryPath}\n`);
      process.stdout.write(
        `green=${result.featuresGreen.length} blocked=${result.featuresBlocked.length} violations=${result.violationsCount}${result.releaseVerdict ? ` release=${result.releaseVerdict}` : ""}\n`,
      );
    });

  program
    .command("baseline")
    .description("Run full Stryker baseline and populate state.json")
    .option("--module <path>", "single-module baseline refresh")
    .action(async (opts) => {
      await runBaseline({
        workingDir: process.cwd(),
        ...(opts.module ? { module: opts.module as string } : {}),
      });
      process.stdout.write("baseline complete\n");
    });

  program
    .command("status")
    .description("Show current state: features + modules + floors")
    .action(async () => {
      const report = await runStatus(process.cwd());
      process.stdout.write(`last run: ${report.lastRunId ?? "<none>"}\n`);
      process.stdout.write(
        `features: ${report.features.green} green / ${report.features.blocked} blocked / ${report.features.pending} pending / ${report.features.in_progress} in-progress\n`,
      );
      const below = report.modules.filter((m) => m.belowFloor);
      process.stdout.write(
        `modules: ${report.modules.length} tracked, ${below.length} below floor\n`,
      );
      for (const m of below) {
        process.stdout.write(
          `  ${m.path} [${m.tier}]: ${m.baseline}% vs floor ${m.floor}%\n`,
        );
      }
    });

  program
    .command("report [run-id]")
    .description("List runs or print a specific run's summary.md")
    .action(async (runId?: string) => {
      if (runId) {
        const md = await readRunSummary(process.cwd(), runId);
        process.stdout.write(md);
      } else {
        const runs = await listRuns(process.cwd());
        for (const r of runs) {
          process.stdout.write(
            `${r.runId}  ${r.summaryExists ? "✅" : "❌"} ${r.verdictLine ?? ""}\n`,
          );
        }
      }
    });

  program
    .command("doctor")
    .description("Drift checks: services, contract hashes, tiers, providers")
    .action(async () => {
      const report = await runDoctor(process.cwd());
      process.stdout.write(
        `doctor: ${report.ok ? "OK" : "ISSUES FOUND"} (${report.issues.length})\n`,
      );
      for (const issue of report.issues) {
        const icon = issue.severity === "error" ? "❌" : "⚠️ ";
        process.stdout.write(`${icon} [${issue.check}] ${issue.message}\n`);
      }
      if (!report.ok) process.exitCode = 1;
    });

  program
    .command("clean")
    .description("Clear stale locks + archive runs older than retention")
    .option("--retention-days <days>", "retain heavy artifacts for N days", "30")
    .action(async (opts) => {
      const result = await runClean({
        workingDir: process.cwd(),
        retentionDays: Number(opts.retentionDays),
      });
      process.stdout.write(
        `clean: staleLockCleared=${result.staleLockCleared} archived=${result.archivedRuns.length} retained=${result.retainedRuns.length}\n`,
      );
    });

  program
    .command("unblock <feature>")
    .description("Reset BLOCKED feature → pending")
    .action(async (feature: string) => {
      await runUnblock(process.cwd(), feature);
      process.stdout.write(`feature ${feature} unblocked → pending\n`);
    });

  program
    .command("baseline-reset")
    .description("Explicit ratchet-down of a module baseline (audit-logged)")
    .requiredOption("--module <path>", "module path")
    .requiredOption("--reason <text>", "reason for the reset")
    .requiredOption("--new-baseline <score>", "new baseline (0-100)")
    .option("--approved-by <user>", "approver name", process.env.USER ?? "unknown")
    .action(async (opts) => {
      await runBaselineReset({
        workingDir: process.cwd(),
        module: opts.module,
        reason: opts.reason,
        newBaseline: Number(opts.newBaseline),
        approvedBy: opts.approvedBy,
      });
      process.stdout.write(`baseline reset for ${opts.module}\n`);
    });

  program
    .command("audit-violations")
    .description("Aggregate violations.jsonl across all runs by pattern")
    .action(async () => {
      const report = await runAuditViolations(process.cwd());
      process.stdout.write(
        `audit: ${report.totalViolations} violations across ${report.runsWithViolations}/${report.totalRuns} runs\n`,
      );
      const entries = Object.entries(report.byPattern).sort(
        (a, b) => b[1].count - a[1].count,
      );
      for (const [pattern, info] of entries) {
        process.stdout.write(
          `  ${pattern}: ${info.count} occurrences across ${info.runs.length} run(s)\n`,
        );
      }
    });

  return program;
}

// ─── Main entry ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cli = buildCli();
  await cli.parseAsync(process.argv);
}

const isMain = (() => {
  try {
    const invoked = resolve(process.argv[1] ?? "");
    const selfUrl = new URL(import.meta.url).pathname;
    return invoked === decodeURIComponent(selfUrl);
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    process.stderr.write(
      `error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
}

// Silence unused — kept for callers that still import them.
void readSessionLock;
