/**
 * Release gate — Full Stryker mutation run (no --incremental).
 *
 * Mandatory session-end gate per blueprint Part 5.4 #1: after the fast-repair
 * loops have finished per feature, re-measure the ENTIRE project with Stryker
 * to verify the final state. Incremental cache is not used here — this is the
 * authoritative baseline refresh.
 */
import { join } from "node:path";
import {
  buildGateResult,
  defaultRunCommand,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import { parseStrykerReport } from "../parsers/stryker-json.js";
import type {
  GateResult,
  StrykerResult,
  TierConfig,
} from "../types.js";

export const STRYKER_FULL_GATE_ID = "stryker-full";

export interface StrykerFullInput {
  config: GateConfig;
  tiers?: TierConfig;
  mutationJsonPath?: string;
}

export interface StrykerFullDetails {
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  overallScore: number | null;
  totalMutants: number;
  perFileSummary: Array<{
    filePath: string;
    score: number | null;
    killed: number;
    survived: number;
    tier?: string;
  }>;
  mutationJsonPath: string;
  command: string[];
  parseError?: string;
}

export async function runStrykerFullGate(
  input: StrykerFullInput,
): Promise<GateResult> {
  const start = Date.now();
  const runner = input.config.runCommand ?? defaultRunCommand();
  const mutationJsonPath =
    input.mutationJsonPath ??
    join(input.config.workingDir, "reports", "mutation", "mutation.json");

  const command = ["npx", "stryker", "run"];
  const result = await runner(command[0]!, command.slice(1), {
    ...(input.config.workingDir !== undefined ? { cwd: input.config.workingDir } : {}),
    timeout: input.config.timeoutMs ?? 60 * 60 * 1000, // 1h safety
  });

  await writeEvidence(
    input.config.evidenceDir,
    STRYKER_FULL_GATE_ID,
    "stdout.txt",
    result.stdout + (result.stderr ? `\n---STDERR---\n${result.stderr}` : ""),
  );

  const details: StrykerFullDetails = {
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    overallScore: null,
    totalMutants: 0,
    perFileSummary: [],
    mutationJsonPath,
    command,
  };

  if (result.timedOut) {
    return buildGateResult({
      gateId: STRYKER_FULL_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: "stryker full run timed out" } as unknown as Record<string, unknown>,
      shortCircuit: false,
    });
  }

  let parsed: StrykerResult;
  try {
    parsed = await parseStrykerReport(
      mutationJsonPath,
      input.tiers ? { tiers: input.tiers } : {},
    );
  } catch (err) {
    return buildGateResult({
      gateId: STRYKER_FULL_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: (err as Error).message } as unknown as Record<string, unknown>,
      shortCircuit: false,
    });
  }

  details.overallScore = parsed.overallScore;
  details.totalMutants = parsed.totalMutants;
  for (const [filePath, score] of parsed.perFile.entries()) {
    details.perFileSummary.push({
      filePath,
      score: score.score,
      killed: score.killed,
      survived: score.survived,
      ...(score.tier !== undefined ? { tier: score.tier } : {}),
    });
  }

  await writeEvidence(
    input.config.evidenceDir,
    STRYKER_FULL_GATE_ID,
    "report.json",
    JSON.stringify(details, null, 2),
  );

  // Gate itself is non-blocking at release — the resulting data drives the
  // state-delta computation and the "Baseline → Final" summary row. Stryker
  // exit codes 0 and 1 are both "normal" runs; other codes signal tool error.
  const pass = result.exitCode === 0 || result.exitCode === 1;
  return buildGateResult({
    gateId: STRYKER_FULL_GATE_ID,
    status: pass ? "pass" : "fail",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    shortCircuit: false,
  });
}
