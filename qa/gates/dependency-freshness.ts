/**
 * Release gate — dependency freshness.
 *
 * Runs `npm outdated --json`. Categorizes outdated packages by semver bump
 * size: major, minor, patch. Severity: **warn** (non-blocking). Surfaces
 * in the release summary.
 *
 * npm outdated output:
 *   {
 *     "pkg-name": {
 *       "current": "1.2.3",
 *       "wanted":  "1.3.0",
 *       "latest":  "2.0.0",
 *       "location": "node_modules/pkg-name"
 *     }
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

export const DEPENDENCY_FRESHNESS_GATE_ID = "dependency-freshness";

const OutdatedEntrySchema = z
  .object({
    current: z.string().optional(),
    wanted: z.string().optional(),
    latest: z.string().optional(),
    location: z.string().optional(),
  })
  .passthrough();

const OutdatedReportSchema = z.record(z.string(), OutdatedEntrySchema);

export type BumpKind = "major" | "minor" | "patch" | "unknown";

export interface OutdatedPackage {
  name: string;
  current: string;
  wanted: string;
  latest: string;
  bump: BumpKind;
}

export interface DependencyFreshnessDetails {
  exitCode: number;
  majorCount: number;
  minorCount: number;
  patchCount: number;
  unknownCount: number;
  total: number;
  outdated: OutdatedPackage[];
  timedOut: boolean;
  rawOutputPath: string;
  command: string[];
  parseError?: string;
}

export async function runDependencyFreshnessGate(
  config: GateConfig,
): Promise<GateResult> {
  const start = Date.now();
  const runner = config.runCommand ?? defaultRunCommand();
  const command = ["npm", "outdated", "--json"];
  const result = await runner(command[0]!, command.slice(1), {
    ...(config.workingDir !== undefined ? { cwd: config.workingDir } : {}),
    timeout: config.timeoutMs ?? 60_000,
  });

  const rawPath = await writeEvidence(
    config.evidenceDir,
    DEPENDENCY_FRESHNESS_GATE_ID,
    "output.json",
    result.stdout || "{}",
  );

  const details: DependencyFreshnessDetails = {
    exitCode: result.exitCode,
    majorCount: 0,
    minorCount: 0,
    patchCount: 0,
    unknownCount: 0,
    total: 0,
    outdated: [],
    timedOut: result.timedOut,
    rawOutputPath: rawPath,
    command,
  };

  if (result.timedOut) {
    return buildGateResult({
      gateId: DEPENDENCY_FRESHNESS_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: "npm outdated timed out" } as unknown as Record<string, unknown>,
      artifacts: [rawPath],
      shortCircuit: false,
    });
  }

  const stdout = result.stdout.trim();
  if (stdout === "" || stdout === "{}") {
    return buildGateResult({
      gateId: DEPENDENCY_FRESHNESS_GATE_ID,
      status: "pass",
      durationMs: Date.now() - start,
      details: details as unknown as Record<string, unknown>,
      artifacts: [rawPath],
      shortCircuit: false,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    return buildGateResult({
      gateId: DEPENDENCY_FRESHNESS_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: `JSON.parse failed: ${(err as Error).message}` } as unknown as Record<string, unknown>,
      artifacts: [rawPath],
      shortCircuit: false,
    });
  }

  const safe = OutdatedReportSchema.safeParse(parsed);
  if (!safe.success) {
    return buildGateResult({
      gateId: DEPENDENCY_FRESHNESS_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: { ...details, parseError: `schema validation failed: ${safe.error.issues[0]?.message ?? "unknown"}` } as unknown as Record<string, unknown>,
      artifacts: [rawPath],
      shortCircuit: false,
    });
  }

  for (const [name, entry] of Object.entries(safe.data)) {
    const current = entry.current ?? "?";
    const wanted = entry.wanted ?? "?";
    const latest = entry.latest ?? "?";
    const bump = classifyBump(current, latest);
    details.outdated.push({ name, current, wanted, latest, bump });
    if (bump === "major") details.majorCount++;
    else if (bump === "minor") details.minorCount++;
    else if (bump === "patch") details.patchCount++;
    else details.unknownCount++;
    details.total++;
  }

  // Always pass — freshness is warn-only. Summary surfaces the counts.
  return buildGateResult({
    gateId: DEPENDENCY_FRESHNESS_GATE_ID,
    status: "pass",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [rawPath],
    shortCircuit: false,
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Classify a semver bump between two versions. Handles common formats
 * including range prefixes (^, ~) and loose strings. */
export function classifyBump(current: string, latest: string): BumpKind {
  const cur = parseSemver(current);
  const lat = parseSemver(latest);
  if (!cur || !lat) return "unknown";
  if (lat.major > cur.major) return "major";
  if (lat.major === cur.major && lat.minor > cur.minor) return "minor";
  if (
    lat.major === cur.major &&
    lat.minor === cur.minor &&
    lat.patch > cur.patch
  )
    return "patch";
  return "unknown";
}

function parseSemver(
  s: string,
): { major: number; minor: number; patch: number } | undefined {
  const match = s.replace(/^[\^~=v]+/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}
