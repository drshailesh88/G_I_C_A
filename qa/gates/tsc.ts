/**
 * Gate 3 — TypeScript strict typecheck.
 *
 * Runs `npx tsc --noEmit` via the injected RunCommandFn. Parses error
 * count from stdout+stderr (tsc writes errors to stdout by default).
 * Fails on any errors. Short-circuit=false (continue to collect other
 * gate evidence + diff audit).
 *
 * Error lines look like:
 *   src/auth/login.ts(42,10): error TS2322: Type 'null' is not assignable.
 *
 * We match `error TS\d+:` which is stable across tsc versions.
 */
import {
  buildGateResult,
  defaultRunCommand,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import type { GateResult } from "../types.js";

export const TSC_GATE_ID = "tsc";

const TSC_ERROR_PATTERN = /error TS\d+:/g;

export interface TscDetails {
  exitCode: number;
  errorCount: number;
  timedOut: boolean;
  durationMs: number;
  firstErrors: string[];
  rawOutputPath: string;
  command: string[];
}

export async function runTscGate(
  config: GateConfig,
): Promise<GateResult> {
  const start = Date.now();
  const runner = config.runCommand ?? defaultRunCommand();
  const command = ["npx", "tsc", "--noEmit"];
  const result = await runner("npx", ["tsc", "--noEmit"], {
    ...(config.workingDir !== undefined ? { cwd: config.workingDir } : {}),
    timeout: config.timeoutMs ?? 180_000,
  });

  const combined = result.stdout + (result.stderr ? `\n${result.stderr}` : "");
  const matches = combined.match(TSC_ERROR_PATTERN) ?? [];
  const errorCount = matches.length;

  const firstErrors = extractErrorLines(combined, 10);
  const rawOutputPath = await writeEvidence(
    config.evidenceDir,
    TSC_GATE_ID,
    "output.txt",
    combined,
  );

  const details: TscDetails = {
    exitCode: result.exitCode,
    errorCount,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    firstErrors,
    rawOutputPath,
    command,
  };

  const pass = result.exitCode === 0 && errorCount === 0 && !result.timedOut;
  return buildGateResult({
    gateId: TSC_GATE_ID,
    status: pass ? "pass" : "fail",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [rawOutputPath],
    shortCircuit: false,
  });
}

function extractErrorLines(combined: string, limit: number): string[] {
  const errorLines: string[] = [];
  for (const line of combined.split("\n")) {
    if (TSC_ERROR_PATTERN.test(line)) {
      errorLines.push(line.trim());
      TSC_ERROR_PATTERN.lastIndex = 0; // reset global regex state
      if (errorLines.length >= limit) break;
    }
  }
  return errorLines;
}
