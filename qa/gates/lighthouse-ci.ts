/**
 * Release gate — Lighthouse CI.
 *
 * Runs `npx lhci autorun` and parses the summary output for category scores
 * (performance, accessibility, best-practices, seo, pwa). Fails when any
 * category score is below its configured threshold.
 *
 * LHCI's `assert` reporter already enforces thresholds via `lighthouserc.json`,
 * but this gate parses `.lighthouseci/manifest.json` directly so we own the
 * pass/fail surface here.
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  buildGateResult,
  defaultRunCommand,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import type { GateResult } from "../types.js";

export const LIGHTHOUSE_CI_GATE_ID = "lighthouse-ci";

export type LighthouseCategory =
  | "performance"
  | "accessibility"
  | "best-practices"
  | "seo"
  | "pwa";

export interface LighthouseThresholds {
  performance?: number;
  accessibility?: number;
  "best-practices"?: number;
  seo?: number;
  pwa?: number;
}

const DEFAULT_THRESHOLDS: Required<Pick<LighthouseThresholds, "performance" | "accessibility" | "best-practices" | "seo">> = {
  performance: 0.8,
  accessibility: 0.95,
  "best-practices": 0.9,
  seo: 0.9,
};

export interface LighthouseScore {
  category: LighthouseCategory;
  score: number;
  threshold: number;
  pass: boolean;
}

export interface LighthouseCiDetails {
  thresholds: Required<LighthouseThresholds>;
  scores: LighthouseScore[];
  failures: LighthouseScore[];
  exitCode: number;
  timedOut: boolean;
  manifestPath: string;
  command: string[];
  parseError?: string;
}

export interface LighthouseCiInput {
  config: GateConfig;
  thresholds?: LighthouseThresholds;
  /** Path to lighthouserc.json relative to workingDir. Default:
   * "lighthouserc.json". */
  configPath?: string;
}

export async function runLighthouseCiGate(
  input: LighthouseCiInput,
): Promise<GateResult> {
  const start = Date.now();
  const runner = input.config.runCommand ?? defaultRunCommand();
  const thresholds: Required<LighthouseThresholds> = {
    ...DEFAULT_THRESHOLDS,
    pwa: 0,
    ...input.thresholds,
  };
  const configPath = input.configPath ?? "lighthouserc.json";

  const command = ["npx", "lhci", "autorun", `--config=${configPath}`];
  const result = await runner(command[0]!, command.slice(1), {
    ...(input.config.workingDir !== undefined ? { cwd: input.config.workingDir } : {}),
    timeout: input.config.timeoutMs ?? 15 * 60 * 1000,
  });

  await writeEvidence(
    input.config.evidenceDir,
    LIGHTHOUSE_CI_GATE_ID,
    "stdout.txt",
    result.stdout + (result.stderr ? `\n---STDERR---\n${result.stderr}` : ""),
  );

  const details: LighthouseCiDetails = {
    thresholds,
    scores: [],
    failures: [],
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    manifestPath: ".lighthouseci/manifest.json",
    command,
  };

  if (result.timedOut) {
    return buildGateResult({
      gateId: LIGHTHOUSE_CI_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: "lhci timed out" } as unknown as Record<string, unknown>,
      shortCircuit: false,
    });
  }

  const manifestAbs = join(input.config.workingDir ?? ".", details.manifestPath);
  let categoryScores: Record<string, number>;
  try {
    categoryScores = await parseLighthouseManifest(manifestAbs);
  } catch (err) {
    return buildGateResult({
      gateId: LIGHTHOUSE_CI_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: (err as Error).message } as unknown as Record<string, unknown>,
      shortCircuit: false,
    });
  }

  for (const [category, threshold] of Object.entries(thresholds) as Array<
    [LighthouseCategory, number]
  >) {
    const score = categoryScores[category];
    if (score === undefined) continue; // category not reported
    const scoreEntry: LighthouseScore = {
      category,
      score,
      threshold,
      pass: score >= threshold,
    };
    details.scores.push(scoreEntry);
    if (!scoreEntry.pass) details.failures.push(scoreEntry);
  }

  await writeEvidence(
    input.config.evidenceDir,
    LIGHTHOUSE_CI_GATE_ID,
    "report.json",
    JSON.stringify(details, null, 2),
  );

  const pass = details.failures.length === 0;
  return buildGateResult({
    gateId: LIGHTHOUSE_CI_GATE_ID,
    status: pass ? "pass" : "fail",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    shortCircuit: false,
  });
}

/**
 * Parse lhci's manifest.json. Structure:
 *   [
 *     {
 *       "url": "...",
 *       "isRepresentativeRun": true,
 *       "summary": { "performance": 0.95, "accessibility": 1, ... }
 *     },
 *     ...
 *   ]
 * Returns averaged scores across all representative runs.
 */
export async function parseLighthouseManifest(
  path: string,
): Promise<Record<string, number>> {
  const raw = await fs.readFile(path, "utf8");
  if (raw.trim() === "") {
    throw new Error("lhci manifest.json is empty");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`manifest JSON parse failed: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("lhci manifest.json must be an array");
  }
  const representative = parsed.filter(
    (r): r is { summary?: Record<string, number> } =>
      typeof r === "object" &&
      r !== null &&
      (r as { isRepresentativeRun?: boolean }).isRepresentativeRun === true,
  );
  const runs = representative.length > 0 ? representative : (parsed as Array<{ summary?: Record<string, number> }>);

  const totals: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const run of runs) {
    for (const [cat, score] of Object.entries(run.summary ?? {})) {
      if (typeof score !== "number") continue;
      totals[cat] = (totals[cat] ?? 0) + score;
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
  }
  const averaged: Record<string, number> = {};
  for (const cat of Object.keys(totals)) {
    averaged[cat] = totals[cat]! / counts[cat]!;
  }
  return averaged;
}
