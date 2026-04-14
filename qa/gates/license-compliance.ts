/**
 * Release gate — license compliance.
 *
 * Runs `npx license-checker --json --production`. Checks every dependency's
 * license against a forbidden list (default: GPL-3.0, AGPL-3.0, SSPL-1.0).
 * Unknown licenses are flagged as warnings.
 *
 * license-checker output:
 *   {
 *     "package@version": {
 *       "licenses": "MIT" | "MIT OR Apache-2.0" | ...,
 *       "repository": "...",
 *       "publisher": "..."
 *     },
 *     ...
 *   }
 */
import { z } from "zod";
import {
  buildGateResult,
  defaultRunCommand,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import type { GateResult } from "../types.js";

export const LICENSE_COMPLIANCE_GATE_ID = "license-compliance";

export const DEFAULT_FORBIDDEN_LICENSES: readonly string[] = [
  "GPL-3.0",
  "GPL-2.0",
  "AGPL-3.0",
  "AGPL-1.0",
  "SSPL-1.0",
  "LGPL-3.0",
  "LGPL-2.1",
];

const LicenseEntrySchema = z
  .object({
    licenses: z.union([z.string(), z.array(z.string())]).optional(),
    repository: z.string().optional(),
    publisher: z.string().optional(),
  })
  .passthrough();

const LicenseReportSchema = z.record(z.string(), LicenseEntrySchema);

export interface LicenseViolation {
  package: string;
  license: string;
  repository?: string;
}

export interface LicenseComplianceDetails {
  exitCode: number;
  packagesChecked: number;
  forbiddenLicenses: string[];
  violations: LicenseViolation[];
  unknownLicenses: LicenseViolation[];
  timedOut: boolean;
  rawOutputPath: string;
  command: string[];
  parseError?: string;
}

export interface LicenseComplianceInput {
  config: GateConfig;
  forbidden?: string[];
  /** Also fail when a dep has no license metadata. Default: false (warn). */
  failOnUnknown?: boolean;
}

export async function runLicenseComplianceGate(
  input: LicenseComplianceInput,
): Promise<GateResult> {
  const start = Date.now();
  const runner = input.config.runCommand ?? defaultRunCommand();
  const forbidden = input.forbidden ?? [...DEFAULT_FORBIDDEN_LICENSES];
  const command = ["npx", "license-checker", "--json", "--production"];
  const result = await runner(command[0]!, command.slice(1), {
    ...(input.config.workingDir !== undefined
      ? { cwd: input.config.workingDir }
      : {}),
    timeout: input.config.timeoutMs ?? 120_000,
  });

  const rawPath = await writeEvidence(
    input.config.evidenceDir,
    LICENSE_COMPLIANCE_GATE_ID,
    "output.json",
    result.stdout || "{}",
  );

  const details: LicenseComplianceDetails = {
    exitCode: result.exitCode,
    packagesChecked: 0,
    forbiddenLicenses: forbidden,
    violations: [],
    unknownLicenses: [],
    timedOut: result.timedOut,
    rawOutputPath: rawPath,
    command,
  };

  if (result.timedOut) {
    return buildGateResult({
      gateId: LICENSE_COMPLIANCE_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: "license-checker timed out" } as unknown as Record<string, unknown>,
      artifacts: [rawPath],
      shortCircuit: false,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch (err) {
    return buildGateResult({
      gateId: LICENSE_COMPLIANCE_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: `JSON.parse failed: ${(err as Error).message}` } as unknown as Record<string, unknown>,
      artifacts: [rawPath],
      shortCircuit: false,
    });
  }

  const safe = LicenseReportSchema.safeParse(parsed);
  if (!safe.success) {
    return buildGateResult({
      gateId: LICENSE_COMPLIANCE_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: `schema validation failed: ${safe.error.issues[0]?.message ?? "unknown"}` } as unknown as Record<string, unknown>,
      artifacts: [rawPath],
      shortCircuit: false,
    });
  }

  const report = safe.data;
  details.packagesChecked = Object.keys(report).length;

  const forbiddenSet = new Set(forbidden.map((l) => l.toUpperCase()));

  for (const [pkg, entry] of Object.entries(report)) {
    const licenses = entry.licenses;
    const licenseList: string[] = Array.isArray(licenses)
      ? licenses
      : typeof licenses === "string"
        ? licenses.split(/\s+(?:OR|AND)\s+/i).map((s) => s.trim())
        : [];

    if (licenseList.length === 0 || licenseList.every((l) => l === "UNKNOWN")) {
      details.unknownLicenses.push({
        package: pkg,
        license: "UNKNOWN",
        ...(entry.repository !== undefined ? { repository: entry.repository } : {}),
      });
      continue;
    }

    for (const lic of licenseList) {
      const upper = lic.toUpperCase().replace(/[()]/g, "").trim();
      if (forbiddenSet.has(upper)) {
        details.violations.push({
          package: pkg,
          license: lic,
          ...(entry.repository !== undefined ? { repository: entry.repository } : {}),
        });
        break;
      }
    }
  }

  const failOnUnknown = input.failOnUnknown ?? false;
  const pass =
    details.violations.length === 0 &&
    (!failOnUnknown || details.unknownLicenses.length === 0);

  return buildGateResult({
    gateId: LICENSE_COMPLIANCE_GATE_ID,
    status: pass ? "pass" : "fail",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [rawPath],
    shortCircuit: false,
  });
}
