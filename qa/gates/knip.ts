/**
 * Gate 5 — Knip (dead-code detector).
 *
 * Runs `npx knip --reporter json`. Knip's JSON reporter structure (stable
 * v5+):
 *   {
 *     "files": ["src/unused.ts"],
 *     "issues": [
 *       { "file": "...", "owners": [...], "dependencies": [...],
 *         "devDependencies": [...], "unlisted": [...], "binaries": [...],
 *         "unresolved": [...], "exports": [...], "types": [...],
 *         "duplicates": [...], "enumMembers": {...}, "classMembers": {...} }
 *     ]
 *   }
 *
 * Some fields are arrays, some are objects; we tolerate both. Gate fails if
 * any unused file / export / dependency is reported.
 */
import { z } from "zod";
import {
  buildGateResult,
  defaultRunCommand,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import type { GateResult } from "../types.js";

export const KNIP_GATE_ID = "knip";

const KnipIssueSchema = z
  .object({
    file: z.string().optional(),
    dependencies: z.array(z.unknown()).optional(),
    devDependencies: z.array(z.unknown()).optional(),
    exports: z.array(z.unknown()).optional(),
    types: z.array(z.unknown()).optional(),
    duplicates: z.array(z.unknown()).optional(),
    unlisted: z.array(z.unknown()).optional(),
    binaries: z.array(z.unknown()).optional(),
    unresolved: z.array(z.unknown()).optional(),
  })
  .passthrough();

const KnipReportSchema = z
  .object({
    files: z.array(z.string()).default([]),
    issues: z.array(KnipIssueSchema).default([]),
  })
  .passthrough();

export interface KnipDetails {
  exitCode: number;
  unusedFilesCount: number;
  unusedFiles: string[];
  unusedExportsCount: number;
  unusedDependenciesCount: number;
  unusedDevDependenciesCount: number;
  duplicatesCount: number;
  unlistedCount: number;
  timedOut: boolean;
  durationMs: number;
  rawOutputPath: string;
  command: string[];
  parseError?: string;
}

export async function runKnipGate(
  config: GateConfig,
): Promise<GateResult> {
  const start = Date.now();
  const runner = config.runCommand ?? defaultRunCommand();
  const command = ["npx", "knip", "--reporter", "json"];
  const result = await runner(command[0]!, command.slice(1), {
    ...(config.workingDir !== undefined ? { cwd: config.workingDir } : {}),
    timeout: config.timeoutMs ?? 120_000,
  });

  const rawOutputPath = await writeEvidence(
    config.evidenceDir,
    KNIP_GATE_ID,
    "output.json",
    result.stdout || "{}",
  );

  const details: KnipDetails = {
    exitCode: result.exitCode,
    unusedFilesCount: 0,
    unusedFiles: [],
    unusedExportsCount: 0,
    unusedDependenciesCount: 0,
    unusedDevDependenciesCount: 0,
    duplicatesCount: 0,
    unlistedCount: 0,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    rawOutputPath,
    command,
  };

  if (result.timedOut) {
    return buildGateResult({
      gateId: KNIP_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: "knip timed out" } as unknown as Record<string, unknown>,
      artifacts: [rawOutputPath],
      shortCircuit: false,
    });
  }

  const stdout = result.stdout.trim();
  if (stdout === "") {
    // No output and non-zero exit is a tool failure. Zero output + exit 0
    // means clean.
    return buildGateResult({
      gateId: KNIP_GATE_ID,
      status: result.exitCode === 0 ? "pass" : "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: "knip produced empty stdout" } as unknown as Record<string, unknown>,
      artifacts: [rawOutputPath],
      shortCircuit: false,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    return buildGateResult({
      gateId: KNIP_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: `JSON.parse failed: ${(err as Error).message}` } as unknown as Record<string, unknown>,
      artifacts: [rawOutputPath],
      shortCircuit: false,
    });
  }

  const safe = KnipReportSchema.safeParse(parsed);
  if (!safe.success) {
    return buildGateResult({
      gateId: KNIP_GATE_ID,
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

  const report = safe.data;
  details.unusedFiles = report.files;
  details.unusedFilesCount = report.files.length;

  for (const issue of report.issues) {
    details.unusedExportsCount += (issue.exports ?? []).length;
    details.unusedExportsCount += (issue.types ?? []).length;
    details.unusedDependenciesCount += (issue.dependencies ?? []).length;
    details.unusedDevDependenciesCount += (issue.devDependencies ?? []).length;
    details.duplicatesCount += (issue.duplicates ?? []).length;
    details.unlistedCount += (issue.unlisted ?? []).length;
  }

  const totalIssues =
    details.unusedFilesCount +
    details.unusedExportsCount +
    details.unusedDependenciesCount +
    details.unusedDevDependenciesCount +
    details.duplicatesCount +
    details.unlistedCount;

  return buildGateResult({
    gateId: KNIP_GATE_ID,
    status: totalIssues === 0 ? "pass" : "fail",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [rawOutputPath],
    shortCircuit: false,
  });
}
