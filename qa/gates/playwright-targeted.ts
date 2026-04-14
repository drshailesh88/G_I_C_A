/**
 * Gate 8 — Playwright targeted (feature's acceptance.spec.ts only).
 *
 * Runs `npx playwright test <spec>` with the JSON reporter redirected to a
 * file via PLAYWRIGHT_JSON_OUTPUT_FILE. Uses the Phase 1 parser.
 *
 * The gate needs a contractDir pointing at `.quality/contracts/<feature>/`;
 * it looks up the acceptance.spec.ts path from the contract's index.yaml.
 * If contractDir is missing, the gate errors with a clear message.
 *
 * Returned details include executedSpecFiles, which gate 9
 * (contract-test-count) consumes directly.
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import {
  buildGateResult,
  defaultRunCommand,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import { parsePlaywrightJson } from "../parsers/playwright-json.js";
import {
  ContractIndexSchema,
  ParseError,
  type ContractIndex,
  type GateResult,
  type PlaywrightResult,
} from "../types.js";

export const PLAYWRIGHT_TARGETED_GATE_ID = "playwright-targeted";

export interface PlaywrightTargetedDetails {
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  specFile: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  failures: PlaywrightResult["failures"];
  executedSpecFiles: string[];
  command: string[];
  jsonOutputPath: string;
  rawStdoutPath: string;
  parseError?: string;
}

export async function runPlaywrightTargetedGate(
  config: GateConfig,
): Promise<GateResult> {
  const start = Date.now();
  const runner = config.runCommand ?? defaultRunCommand();

  if (!config.contractDir) {
    return buildGateResult({
      gateId: PLAYWRIGHT_TARGETED_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: {
        parseError: "contractDir is required for playwright-targeted gate",
      },
      shortCircuit: false,
    });
  }

  let contract: ContractIndex;
  try {
    contract = await readContract(join(config.contractDir, "index.yaml"));
  } catch (err) {
    return buildGateResult({
      gateId: PLAYWRIGHT_TARGETED_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: {
        parseError: `cannot load contract: ${(err as Error).message}`,
        contractDir: config.contractDir,
      },
      shortCircuit: false,
    });
  }

  const specFile = join(
    config.contractDir,
    contract.artifacts.acceptance_tests,
  );
  const jsonOutputPath = join(
    config.evidenceDir,
    PLAYWRIGHT_TARGETED_GATE_ID,
    "report.json",
  );
  await writeEvidence(config.evidenceDir, PLAYWRIGHT_TARGETED_GATE_ID, ".keep", "");

  const args = ["playwright", "test", specFile, "--reporter=json"];
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PLAYWRIGHT_JSON_OUTPUT_FILE: jsonOutputPath,
  };

  const result = await runner("npx", args, {
    ...(config.workingDir !== undefined ? { cwd: config.workingDir } : {}),
    timeout: config.timeoutMs ?? 600_000,
    env,
  });

  const rawStdoutPath = await writeEvidence(
    config.evidenceDir,
    PLAYWRIGHT_TARGETED_GATE_ID,
    "stdout.txt",
    result.stdout + (result.stderr ? `\n---STDERR---\n${result.stderr}` : ""),
  );

  const details: PlaywrightTargetedDetails = {
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    specFile,
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
    failures: [],
    executedSpecFiles: [],
    command: ["npx", ...args],
    jsonOutputPath,
    rawStdoutPath,
  };

  if (result.timedOut) {
    return buildGateResult({
      gateId: PLAYWRIGHT_TARGETED_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: "playwright timed out" } as unknown as Record<string, unknown>,
      artifacts: [rawStdoutPath],
      shortCircuit: false,
    });
  }

  // If the JSON output file was not written (e.g., early crash), try parsing
  // stdout as a fallback — Playwright's JSON reporter writes to stdout if
  // PLAYWRIGHT_JSON_OUTPUT_FILE is ignored.
  let parsed: PlaywrightResult;
  try {
    if (await pathExists(jsonOutputPath)) {
      parsed = await parsePlaywrightJson(jsonOutputPath);
    } else if (result.stdout.trim().startsWith("{")) {
      const { parsePlaywrightJsonString } = await import(
        "../parsers/playwright-json.js"
      );
      parsed = parsePlaywrightJsonString(result.stdout, "stdout");
    } else {
      throw new ParseError(
        jsonOutputPath,
        "Playwright JSON output missing and stdout is not JSON",
      );
    }
  } catch (err) {
    if (err instanceof ParseError) {
      return buildGateResult({
        gateId: PLAYWRIGHT_TARGETED_GATE_ID,
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
  details.flaky = parsed.flaky;
  details.failures = parsed.failures;
  details.executedSpecFiles = parsed.executedSpecFiles;

  const pass =
    result.exitCode === 0 &&
    parsed.failed === 0 &&
    parsed.skipped === 0;

  const artifacts = [rawStdoutPath];
  if (await pathExists(jsonOutputPath)) artifacts.push(jsonOutputPath);

  return buildGateResult({
    gateId: PLAYWRIGHT_TARGETED_GATE_ID,
    status: pass ? "pass" : "fail",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts,
    shortCircuit: false,
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function readContract(indexPath: string): Promise<ContractIndex> {
  const raw = await fs.readFile(indexPath, "utf8");
  if (raw.trim() === "") throw new Error(`empty index.yaml at ${indexPath}`);
  const parsed = yaml.load(raw);
  const result = ContractIndexSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `contract schema invalid: ${result.error.issues[0]?.message ?? "unknown"}`,
    );
  }
  return result.data;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
