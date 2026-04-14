/**
 * Release gate — Full Playwright suite.
 *
 * Runs `npx playwright test` with no spec filter — every E2E + acceptance
 * spec configured in playwright.config.ts. Used at session end for the
 * release verdict.
 */
import { join } from "node:path";
import {
  buildGateResult,
  defaultRunCommand,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import { parsePlaywrightJson } from "../parsers/playwright-json.js";
import { ParseError, type GateResult, type PlaywrightResult } from "../types.js";

export const PLAYWRIGHT_FULL_GATE_ID = "playwright-full";

export interface PlaywrightFullDetails {
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  failures: PlaywrightResult["failures"];
  executedSpecFiles: string[];
  jsonOutputPath: string;
  command: string[];
  parseError?: string;
}

export async function runPlaywrightFullGate(
  config: GateConfig,
): Promise<GateResult> {
  const start = Date.now();
  const runner = config.runCommand ?? defaultRunCommand();
  const jsonOutputPath = join(
    config.evidenceDir,
    PLAYWRIGHT_FULL_GATE_ID,
    "report.json",
  );
  await writeEvidence(config.evidenceDir, PLAYWRIGHT_FULL_GATE_ID, ".keep", "");

  const command = ["npx", "playwright", "test", "--reporter=json"];
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PLAYWRIGHT_JSON_OUTPUT_FILE: jsonOutputPath,
  };
  const result = await runner("npx", command.slice(1), {
    ...(config.workingDir !== undefined ? { cwd: config.workingDir } : {}),
    timeout: config.timeoutMs ?? 30 * 60 * 1000,
    env,
  });

  await writeEvidence(
    config.evidenceDir,
    PLAYWRIGHT_FULL_GATE_ID,
    "stdout.txt",
    result.stdout + (result.stderr ? `\n---STDERR---\n${result.stderr}` : ""),
  );

  const details: PlaywrightFullDetails = {
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
    failures: [],
    executedSpecFiles: [],
    jsonOutputPath,
    command,
  };

  if (result.timedOut) {
    return buildGateResult({
      gateId: PLAYWRIGHT_FULL_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: "playwright full run timed out" } as unknown as Record<string, unknown>,
      shortCircuit: false,
    });
  }

  let parsed: PlaywrightResult;
  try {
    parsed = await parsePlaywrightJson(jsonOutputPath);
  } catch (err) {
    if (err instanceof ParseError) {
      return buildGateResult({
        gateId: PLAYWRIGHT_FULL_GATE_ID,
        status: "error",
        durationMs: Date.now() - start,
        details: { ...details, parseError: err.message } as unknown as Record<string, unknown>,
        shortCircuit: false,
      });
    }
    throw err;
  }

  details.total = parsed.total;
  details.passed = parsed.passed;
  details.failed = parsed.failed;
  details.skipped = parsed.skipped;
  details.flaky = parsed.flaky;
  details.failures = parsed.failures;
  details.executedSpecFiles = parsed.executedSpecFiles;

  const pass = result.exitCode === 0 && parsed.failed === 0 && parsed.skipped === 0;
  return buildGateResult({
    gateId: PLAYWRIGHT_FULL_GATE_ID,
    status: pass ? "pass" : "fail",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    shortCircuit: false,
  });
}
