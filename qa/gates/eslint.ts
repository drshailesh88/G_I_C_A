/**
 * Gate 4 — ESLint with anti-cheat rules.
 *
 * Runs `npx eslint . --ext .ts,.tsx --max-warnings 0 --format json`. ESLint's
 * JSON reporter writes an array to stdout: `[{filePath, messages: [...]}]`.
 * Each message has severity 1 (warn) or 2 (error). --max-warnings 0 turns
 * warnings into non-zero exit.
 *
 * Fails on any error OR warning count > 0. Short-circuit=false.
 */
import { z } from "zod";
import {
  buildGateResult,
  defaultRunCommand,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import type { GateResult } from "../types.js";

export const ESLINT_GATE_ID = "eslint";

const EslintMessageSchema = z
  .object({
    ruleId: z.string().nullable().optional(),
    severity: z.union([z.literal(1), z.literal(2)]),
    message: z.string(),
    line: z.number().optional(),
    column: z.number().optional(),
  })
  .passthrough();

const EslintFileReportSchema = z
  .object({
    filePath: z.string(),
    messages: z.array(EslintMessageSchema).default([]),
    errorCount: z.number().int().nonnegative().optional(),
    warningCount: z.number().int().nonnegative().optional(),
    fatalErrorCount: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const EslintReportSchema = z.array(EslintFileReportSchema);

export interface EslintTopMessage {
  filePath: string;
  ruleId: string | null;
  severity: "error" | "warning";
  line?: number;
  message: string;
}

export interface EslintDetails {
  exitCode: number;
  errorCount: number;
  warningCount: number;
  fatalErrorCount: number;
  filesWithIssues: number;
  topMessages: EslintTopMessage[];
  timedOut: boolean;
  durationMs: number;
  rawOutputPath: string;
  command: string[];
  parseError?: string;
}

export async function runEslintGate(
  config: GateConfig,
): Promise<GateResult> {
  const start = Date.now();
  const runner = config.runCommand ?? defaultRunCommand();
  const command = [
    "npx",
    "eslint",
    ".",
    "--ext",
    ".ts,.tsx",
    "--max-warnings",
    "0",
    "--format",
    "json",
  ];
  const result = await runner(
    command[0]!,
    command.slice(1),
    {
      ...(config.workingDir !== undefined ? { cwd: config.workingDir } : {}),
      timeout: config.timeoutMs ?? 180_000,
    },
  );

  const rawOutputPath = await writeEvidence(
    config.evidenceDir,
    ESLINT_GATE_ID,
    "output.json",
    result.stdout || "[]",
  );

  if (result.stderr) {
    await writeEvidence(
      config.evidenceDir,
      ESLINT_GATE_ID,
      "stderr.txt",
      result.stderr,
    );
  }

  const details: EslintDetails = {
    exitCode: result.exitCode,
    errorCount: 0,
    warningCount: 0,
    fatalErrorCount: 0,
    filesWithIssues: 0,
    topMessages: [],
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    rawOutputPath,
    command,
  };

  if (result.timedOut) {
    return buildGateResult({
      gateId: ESLINT_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: "eslint timed out" } as unknown as Record<string, unknown>,
      artifacts: [rawOutputPath],
      shortCircuit: false,
    });
  }

  // Parse JSON (be tolerant — ESLint may print noise on stderr that corrupts
  // stdout if the config is broken).
  const stdout = result.stdout.trim();
  if (stdout === "") {
    // ESLint found nothing to lint, no output. Treat as pass iff exit 0.
    return buildGateResult({
      gateId: ESLINT_GATE_ID,
      status: result.exitCode === 0 ? "pass" : "fail",
      durationMs: Date.now() - start,
      details: { ...details, parseError: "eslint produced empty stdout" } as unknown as Record<string, unknown>,
      artifacts: [rawOutputPath],
      shortCircuit: false,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    return buildGateResult({
      gateId: ESLINT_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: `JSON.parse failed: ${(err as Error).message}` } as unknown as Record<string, unknown>,
      artifacts: [rawOutputPath],
      shortCircuit: false,
    });
  }

  const safe = EslintReportSchema.safeParse(parsed);
  if (!safe.success) {
    return buildGateResult({
      gateId: ESLINT_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: {
        ...details,
        parseError: `schema validation failed: ${safe.error.issues[0]?.message ?? "unknown"}`,
      } as unknown as Record<string, unknown>,
      artifacts: [rawOutputPath],
      shortCircuit: false,
    });
  }

  for (const file of safe.data) {
    details.errorCount += file.errorCount ?? 0;
    details.warningCount += file.warningCount ?? 0;
    details.fatalErrorCount += file.fatalErrorCount ?? 0;
    if ((file.errorCount ?? 0) + (file.warningCount ?? 0) > 0) {
      details.filesWithIssues++;
    }
    for (const msg of file.messages) {
      if (details.topMessages.length >= 15) break;
      details.topMessages.push({
        filePath: file.filePath,
        ruleId: msg.ruleId ?? null,
        severity: msg.severity === 2 ? "error" : "warning",
        ...(msg.line !== undefined ? { line: msg.line } : {}),
        message: msg.message,
      });
    }
  }

  // If ESLint reports 0 from parsed but fails-counted, prefer parsed values.
  // Infer counts directly when fields missing.
  if (
    details.errorCount === 0 &&
    details.warningCount === 0 &&
    details.topMessages.length > 0
  ) {
    for (const tm of details.topMessages) {
      if (tm.severity === "error") details.errorCount++;
      else details.warningCount++;
    }
  }

  const pass =
    details.errorCount === 0 &&
    details.warningCount === 0 &&
    details.fatalErrorCount === 0;

  return buildGateResult({
    gateId: ESLINT_GATE_ID,
    status: pass ? "pass" : "fail",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [rawOutputPath],
    shortCircuit: false,
  });
}
