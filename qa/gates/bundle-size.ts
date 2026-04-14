/**
 * Release gate — Bundle size check.
 *
 * Walks `.next/static/chunks` (or a configurable build output dir) and
 * reports total bundle size plus per-chunk sizes. Fails when any chunk
 * exceeds its configured threshold OR total bundle exceeds `totalMaxBytes`.
 *
 * Thresholds are matched longest-prefix-first: `chunks/framework-*.js` beats
 * `chunks/*`, etc. Unmatched chunks fall back to `defaultMaxBytes` (or
 * Infinity if not set).
 */
import { promises as fs } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  buildGateResult,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import type { GateResult } from "../types.js";

export const BUNDLE_SIZE_GATE_ID = "bundle-size";

export interface BundleSizeInput {
  config: GateConfig;
  /** Directory to scan. Default: `.next/static`. */
  buildDir?: string;
  /** Max bytes per chunk-pattern. Patterns use glob-like `*` wildcards. */
  thresholds?: Record<string, number>;
  /** Max bytes total across all files in buildDir. */
  totalMaxBytes?: number;
  /** Fallback max per chunk when no pattern matches. Default: Infinity. */
  defaultMaxBytes?: number;
}

export interface BundleFileReport {
  path: string;
  sizeBytes: number;
  matchedPattern: string | null;
  limit: number;
  overLimit: boolean;
}

export interface BundleSizeDetails {
  buildDir: string;
  fileCount: number;
  totalBytes: number;
  totalMaxBytes: number | null;
  exceededTotal: boolean;
  filesOverLimit: BundleFileReport[];
  largestFiles: BundleFileReport[];
  thresholds: Record<string, number>;
  defaultMaxBytes: number | null;
  message?: string;
}

export async function runBundleSizeGate(
  input: BundleSizeInput,
): Promise<GateResult> {
  const start = Date.now();
  const buildDir = input.buildDir ?? ".next/static";
  const absoluteBuildDir = join(input.config.workingDir, buildDir);
  const thresholds = input.thresholds ?? {};
  const defaultMaxBytes = input.defaultMaxBytes ?? Number.POSITIVE_INFINITY;
  const totalMaxBytes = input.totalMaxBytes ?? null;

  const files = await walkFiles(absoluteBuildDir);
  const reports: BundleFileReport[] = [];
  let totalBytes = 0;

  for (const absPath of files) {
    const stat = await fs.stat(absPath);
    totalBytes += stat.size;
    const rel = toPosix(relative(absoluteBuildDir, absPath));
    const { pattern, limit } = resolveLimit(rel, thresholds, defaultMaxBytes);
    reports.push({
      path: rel,
      sizeBytes: stat.size,
      matchedPattern: pattern,
      limit,
      overLimit: stat.size > limit,
    });
  }

  const filesOverLimit = reports.filter((r) => r.overLimit);
  const largestFiles = [...reports]
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 10);

  const exceededTotal =
    totalMaxBytes !== null && totalBytes > totalMaxBytes;

  const details: BundleSizeDetails = {
    buildDir,
    fileCount: reports.length,
    totalBytes,
    totalMaxBytes,
    exceededTotal,
    filesOverLimit,
    largestFiles,
    thresholds,
    defaultMaxBytes:
      defaultMaxBytes === Number.POSITIVE_INFINITY ? null : defaultMaxBytes,
    ...(reports.length === 0
      ? { message: `no files found in ${buildDir}; did \`next build\` run?` }
      : {}),
  };

  const evidencePath = await writeEvidence(
    input.config.evidenceDir,
    BUNDLE_SIZE_GATE_ID,
    "report.json",
    JSON.stringify(details, null, 2),
  );

  // Missing build dir → error (caller should next-build before release).
  if (reports.length === 0) {
    return buildGateResult({
      gateId: BUNDLE_SIZE_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: details as unknown as Record<string, unknown>,
      artifacts: [evidencePath],
      shortCircuit: false,
    });
  }

  const pass = filesOverLimit.length === 0 && !exceededTotal;
  return buildGateResult({
    gateId: BUNDLE_SIZE_GATE_ID,
    status: pass ? "pass" : "fail",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [evidencePath],
    shortCircuit: false,
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function walkFiles(dir: string): Promise<string[]> {
  const result: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        result.push(...(await walkFiles(full)));
      } else if (entry.isFile()) {
        result.push(full);
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return result;
}

function resolveLimit(
  relPath: string,
  thresholds: Record<string, number>,
  fallback: number,
): { pattern: string | null; limit: number } {
  // Longest-pattern-first wins.
  const patterns = Object.keys(thresholds).sort(
    (a, b) => b.length - a.length,
  );
  for (const pattern of patterns) {
    if (matchGlob(relPath, pattern)) {
      return { pattern, limit: thresholds[pattern]! };
    }
  }
  return { pattern: null, limit: fallback };
}

export function matchGlob(path: string, pattern: string): boolean {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (/[.+^${}()|[\]\\]/.test(c as string)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`).test(path);
}

function toPosix(p: string): string {
  return p.split(sep).join("/");
}
