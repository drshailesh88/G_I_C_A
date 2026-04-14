/**
 * Release gate — npm audit.
 *
 * Runs `npm audit --json`. Parses the vulnerability totals. Fails if any
 * high/critical vulnerabilities are present. Moderate/low roll into warn.
 *
 * npm audit output schema (npm 10.x):
 *   {
 *     "vulnerabilities": {
 *       "<pkg>": {
 *         "severity": "info" | "low" | "moderate" | "high" | "critical",
 *         ...
 *       }
 *     },
 *     "metadata": {
 *       "vulnerabilities": {
 *         "info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0
 *       }
 *     }
 *   }
 *
 * npm audit's exit code is non-zero whenever vulnerabilities exist; we rely
 * on parsed metadata, not exit code.
 */
import { z } from "zod";
import {
  buildGateResult,
  defaultRunCommand,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import type { GateResult } from "../types.js";

export const NPM_AUDIT_GATE_ID = "npm-audit";

const VulnerabilityCountsSchema = z
  .object({
    info: z.number().int().nonnegative().default(0),
    low: z.number().int().nonnegative().default(0),
    moderate: z.number().int().nonnegative().default(0),
    high: z.number().int().nonnegative().default(0),
    critical: z.number().int().nonnegative().default(0),
    total: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const NpmAuditReportSchema = z
  .object({
    metadata: z
      .object({
        vulnerabilities: VulnerabilityCountsSchema.optional(),
      })
      .passthrough()
      .optional(),
    vulnerabilities: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export interface NpmAuditDetails {
  exitCode: number;
  info: number;
  low: number;
  moderate: number;
  high: number;
  critical: number;
  total: number;
  topPackages: string[];
  timedOut: boolean;
  rawOutputPath: string;
  command: string[];
  parseError?: string;
}

export async function runNpmAuditGate(
  config: GateConfig,
): Promise<GateResult> {
  const start = Date.now();
  const runner = config.runCommand ?? defaultRunCommand();
  const command = ["npm", "audit", "--json"];
  const result = await runner(command[0]!, command.slice(1), {
    ...(config.workingDir !== undefined ? { cwd: config.workingDir } : {}),
    timeout: config.timeoutMs ?? 120_000,
  });

  const rawPath = await writeEvidence(
    config.evidenceDir,
    NPM_AUDIT_GATE_ID,
    "output.json",
    result.stdout || "{}",
  );

  const details: NpmAuditDetails = {
    exitCode: result.exitCode,
    info: 0,
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
    total: 0,
    topPackages: [],
    timedOut: result.timedOut,
    rawOutputPath: rawPath,
    command,
  };

  if (result.timedOut) {
    return buildGateResult({
      gateId: NPM_AUDIT_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: "npm audit timed out" } as unknown as Record<string, unknown>,
      artifacts: [rawPath],
      shortCircuit: false,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch (err) {
    return buildGateResult({
      gateId: NPM_AUDIT_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: {
        ...details,
        parseError: `JSON.parse failed: ${(err as Error).message}`,
      } as unknown as Record<string, unknown>,
      artifacts: [rawPath],
      shortCircuit: false,
    });
  }

  const safe = NpmAuditReportSchema.safeParse(parsed);
  if (!safe.success) {
    return buildGateResult({
      gateId: NPM_AUDIT_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: {
        ...details,
        parseError: `schema validation failed: ${safe.error.issues[0]?.message ?? "unknown"}`,
      } as unknown as Record<string, unknown>,
      artifacts: [rawPath],
      shortCircuit: false,
    });
  }

  const counts = safe.data.metadata?.vulnerabilities;
  if (counts) {
    details.info = counts.info ?? 0;
    details.low = counts.low ?? 0;
    details.moderate = counts.moderate ?? 0;
    details.high = counts.high ?? 0;
    details.critical = counts.critical ?? 0;
    details.total =
      counts.total ??
      details.info +
        details.low +
        details.moderate +
        details.high +
        details.critical;
  }

  if (safe.data.vulnerabilities) {
    details.topPackages = Object.keys(safe.data.vulnerabilities).slice(0, 20);
  }

  const pass = details.high === 0 && details.critical === 0;
  return buildGateResult({
    gateId: NPM_AUDIT_GATE_ID,
    status: pass ? "pass" : "fail",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [rawPath],
    shortCircuit: false,
  });
}
