/**
 * Gates 6 + 7 — Vitest unit and integration tests.
 *
 * Runs `npx vitest run --reporter=junit --outputFile=<evidence-path>` and
 * hands the generated JUnit XML to the Phase 1 parser. Fails if any test
 * failed OR any test skipped (blueprint: α strategy rejects .skip additions;
 * skipped tests indicate pre-existing skips that still need resolution).
 *
 * The split between unit and integration is a caller concern — both use this
 * function with different `runMode` values that translate to Vitest CLI
 * project/filter flags. Vitest supports project-scoping via
 * `--project <name>` when workspaces are configured.
 */
import { join } from "node:path";
import {
  buildGateResult,
  defaultRunCommand,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import { parseVitestJunit } from "../parsers/vitest-junit.js";
import { ParseError, type GateResult, type VitestResult } from "../types.js";

export type VitestMode = "unit" | "integration" | "all";

export const VITEST_GATE_IDS = {
  unit: "vitest-unit",
  integration: "vitest-integration",
  all: "vitest-all",
} as const;

export interface VitestGateConfig extends GateConfig {
  mode: VitestMode;
  /** Additional Vitest CLI args (e.g. ["--coverage"] for release loop). */
  extraArgs?: string[];
}

export interface VitestDetails {
  mode: VitestMode;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  failures: VitestResult["failures"];
  command: string[];
  junitPath: string;
  rawStdoutPath: string;
  parseError?: string;
}

export async function runVitestGate(config: VitestGateConfig): Promise<GateResult> {
  const start = Date.now();
  const runner = config.runCommand ?? defaultRunCommand();
  const gateId = VITEST_GATE_IDS[config.mode];

  const junitPath = join(config.evidenceDir, gateId, "junit.xml");
  // Pre-create the output directory so Vitest can write into it.
  await writeEvidence(config.evidenceDir, gateId, ".keep", "");

  const args = [
    "vitest",
    "run",
    "--reporter=junit",
    `--outputFile=${junitPath}`,
  ];
  if (config.mode === "unit") {
    args.push("--project", "unit");
  } else if (config.mode === "integration") {
    args.push("--project", "integration");
  }
  for (const extra of config.extraArgs ?? []) args.push(extra);

  const result = await runner("npx", args, {
    ...(config.workingDir !== undefined ? { cwd: config.workingDir } : {}),
    timeout: config.timeoutMs ?? 300_000,
  });

  const rawStdoutPath = await writeEvidence(
    config.evidenceDir,
    gateId,
    "stdout.txt",
    result.stdout + (result.stderr ? `\n---STDERR---\n${result.stderr}` : ""),
  );

  const details: VitestDetails = {
    mode: config.mode,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: 0,
    failures: [],
    command: ["npx", ...args],
    junitPath,
    rawStdoutPath,
  };

  if (result.timedOut) {
    return buildGateResult({
      gateId,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: "vitest timed out" } as unknown as Record<string, unknown>,
      artifacts: [rawStdoutPath],
      shortCircuit: false,
    });
  }

  let parsed: VitestResult;
  try {
    parsed = await parseVitestJunit(junitPath);
  } catch (err) {
    if (err instanceof ParseError) {
      return buildGateResult({
        gateId,
        status: "error",
        durationMs: Date.now() - start,
        details: { ...details, parseError: err.message } as unknown as Record<string, unknown>,
        artifacts: [rawStdoutPath],
        shortCircuit: false,
      });
    }
    throw err;
  }

  details.total = parsed.total;
  details.passed = parsed.passed;
  details.failed = parsed.failed;
  details.skipped = parsed.skipped;
  details.errors = parsed.errors;
  details.failures = parsed.failures;

  const pass =
    result.exitCode === 0 &&
    parsed.failed === 0 &&
    parsed.errors === 0 &&
    parsed.skipped === 0;

  return buildGateResult({
    gateId,
    status: pass ? "pass" : "fail",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [rawStdoutPath, junitPath],
    shortCircuit: false,
  });
}
