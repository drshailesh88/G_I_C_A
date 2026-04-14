/**
 * Gate 12 — Stryker incremental + targeted (T4).
 *
 * Runs Stryker with --incremental in M2 mode (per-iteration measurement on
 * files touched this iteration). T4 targeting:
 *
 *   mutate = contract.affected_modules ∩ (git-diff ∪ reverse-deps)
 *
 * reverse-deps is STUBBED in Phase 2 — returns empty array. Phase 3 wires
 * dependency-cruiser. For Phase 2 the effective mutate glob is
 * `scope ∩ git-diff`.
 *
 * The caller passes in:
 *   - contract.affected_modules (from ContractIndex)
 *   - changedPaths (files the fixer touched this iteration)
 *   - previous incremental.json path (for the parser's fresh-vs-cached)
 *
 * Gate result reports perFile scores from the parser plus the computed
 * mutate glob for auditability.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildGateResult,
  defaultRunCommand,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import { parseStrykerReport } from "../parsers/stryker-json.js";
import { matchGlob } from "../parsers/stryker-json.js";
import { getReverseDeps as realGetReverseDeps } from "../detection/dependency-analyzer.js";
import type {
  ContractIndex,
  GateResult,
  StrykerResult,
  TierConfig,
} from "../types.js";

export const STRYKER_INCREMENTAL_GATE_ID = "stryker-incremental";

export interface StrykerIncrementalInput {
  config: GateConfig;
  contract: ContractIndex;
  /** Paths (repo-relative) changed by the fixer this iteration. */
  changedPaths: string[];
  /** Optional TierConfig for tier classification in StrykerResult. */
  tiers?: TierConfig;
  /** Override paths (for tests). Defaults relative to workingDir. */
  mutationJsonPath?: string;
  incrementalJsonPath?: string;
  /** Override reverse-deps lookup. Phase 2 default returns []. */
  getReverseDeps?: (files: string[]) => Promise<string[]>;
}

export interface StrykerIncrementalDetails {
  featureId: string;
  scopeGlobs: string[];
  changedPaths: string[];
  reverseDeps: string[];
  mutateGlobs: string[];
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  overallScore: number | null;
  perFileSummary: Array<{
    filePath: string;
    score: number | null;
    killed: number;
    survived: number;
    timeout: number;
    tier?: string;
    freshlyMeasured: boolean;
  }>;
  freshlyTested: number;
  cachedFromIncremental: number;
  mutationJsonPath: string;
  incrementalJsonPath: string;
  command: string[];
  parseError?: string;
  skipped?: boolean;
  skipReason?: string;
}

/** Phase 2 stub kept for tests; Phase 3 default is real dependency-cruiser. */
export async function stubReverseDeps(_files: string[]): Promise<string[]> {
  return [];
}

export async function runStrykerIncrementalGate(
  input: StrykerIncrementalInput,
): Promise<GateResult> {
  const start = Date.now();
  const { config, contract, changedPaths, tiers } = input;
  const runner = config.runCommand ?? defaultRunCommand();
  // Phase 3: real dependency-cruiser by default; fall back to the stub when
  // workingDir isn't set (e.g. in synthetic tests).
  const getReverseDeps =
    input.getReverseDeps ??
    (async (files: string[]) => {
      if (!config.workingDir) return [];
      try {
        return await realGetReverseDeps(files, config.workingDir);
      } catch {
        return [];
      }
    });

  const scopeGlobs = contract.affected_modules;
  const reverseDeps = await getReverseDeps(changedPaths);
  const candidates = unique([...changedPaths, ...reverseDeps]);
  const mutateGlobs = computeMutateGlobs(scopeGlobs, candidates);

  const mutationJsonPath =
    input.mutationJsonPath ??
    join(config.workingDir, "reports", "mutation", "mutation.json");
  const incrementalJsonPath =
    input.incrementalJsonPath ??
    join(config.workingDir, ".stryker-tmp", "incremental.json");

  const details: StrykerIncrementalDetails = {
    featureId: contract.feature.id,
    scopeGlobs,
    changedPaths,
    reverseDeps,
    mutateGlobs,
    exitCode: 0,
    timedOut: false,
    durationMs: 0,
    overallScore: null,
    perFileSummary: [],
    freshlyTested: 0,
    cachedFromIncremental: 0,
    mutationJsonPath,
    incrementalJsonPath,
    command: [],
  };

  // If no files to mutate (no changes in scope), skip and return pass.
  if (mutateGlobs.length === 0) {
    details.skipped = true;
    details.skipReason =
      "no files to mutate (changed paths intersected with contract scope is empty)";
    const evidence = await writeEvidence(
      config.evidenceDir,
      STRYKER_INCREMENTAL_GATE_ID,
      "report.json",
      JSON.stringify(details, null, 2),
    );
    return buildGateResult({
      gateId: STRYKER_INCREMENTAL_GATE_ID,
      status: "skipped",
      durationMs: Date.now() - start,
      details: details as unknown as Record<string, unknown>,
      artifacts: [evidence],
      shortCircuit: false,
    });
  }

  const command = [
    "npx",
    "stryker",
    "run",
    "--incremental",
    "--mutate",
    mutateGlobs.join(","),
  ];
  details.command = command;
  const result = await runner(command[0]!, command.slice(1), {
    ...(config.workingDir !== undefined ? { cwd: config.workingDir } : {}),
    timeout: config.timeoutMs ?? 600_000,
  });

  details.exitCode = result.exitCode;
  details.timedOut = result.timedOut;
  details.durationMs = result.durationMs;

  await writeEvidence(
    config.evidenceDir,
    STRYKER_INCREMENTAL_GATE_ID,
    "stdout.txt",
    result.stdout + (result.stderr ? `\n---STDERR---\n${result.stderr}` : ""),
  );

  if (result.timedOut) {
    const evidence = await writeEvidence(
      config.evidenceDir,
      STRYKER_INCREMENTAL_GATE_ID,
      "report.json",
      JSON.stringify({ ...details, parseError: "stryker timed out" }, null, 2),
    );
    return buildGateResult({
      gateId: STRYKER_INCREMENTAL_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: "stryker timed out" } as unknown as Record<string, unknown>,
      artifacts: [evidence],
      shortCircuit: false,
    });
  }

  // Parse mutation.json (+ incremental.json if present).
  let parsed: StrykerResult;
  try {
    const hasIncremental = existsSync(incrementalJsonPath);
    const opts: Parameters<typeof parseStrykerReport>[1] = {
      ...(tiers ? { tiers } : {}),
      ...(hasIncremental ? { incrementalPath: incrementalJsonPath } : {}),
    };
    parsed = await parseStrykerReport(mutationJsonPath, opts);
  } catch (err) {
    const evidence = await writeEvidence(
      config.evidenceDir,
      STRYKER_INCREMENTAL_GATE_ID,
      "report.json",
      JSON.stringify({ ...details, parseError: (err as Error).message }, null, 2),
    );
    return buildGateResult({
      gateId: STRYKER_INCREMENTAL_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: (err as Error).message } as unknown as Record<string, unknown>,
      artifacts: [evidence],
      shortCircuit: false,
    });
  }

  details.overallScore = parsed.overallScore;
  details.freshlyTested = parsed.freshlyTested;
  details.cachedFromIncremental = parsed.cachedFromIncremental;
  for (const [filePath, score] of parsed.perFile.entries()) {
    details.perFileSummary.push({
      filePath,
      score: score.score,
      killed: score.killed,
      survived: score.survived,
      timeout: score.timeout,
      ...(score.tier !== undefined ? { tier: score.tier } : {}),
      freshlyMeasured: score.freshlyMeasured,
    });
  }

  const evidencePath = await writeEvidence(
    config.evidenceDir,
    STRYKER_INCREMENTAL_GATE_ID,
    "report.json",
    JSON.stringify(details, null, 2),
  );

  const status = result.exitCode === 0 ? "pass" : "fail";
  return buildGateResult({
    gateId: STRYKER_INCREMENTAL_GATE_ID,
    status,
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [evidencePath],
    shortCircuit: false,
  });
}

// ─── T4 targeting helper ──────────────────────────────────────────────────────

/**
 * Compute the mutate globs as `scope ∩ candidates`. A candidate file is
 * included in the output iff it matches at least one scope glob. The output
 * deduplicates and preserves candidate order.
 */
export function computeMutateGlobs(
  scopeGlobs: string[],
  candidates: string[],
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    if (scopeGlobs.some((g) => matchGlob(candidate, g))) {
      result.push(candidate);
      seen.add(candidate);
    }
  }
  return result;
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
