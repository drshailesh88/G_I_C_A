/**
 * Gate 2 — Lock manifest verification.
 *
 * Reads `.quality/policies/lock-manifest.json`. For every entry in `files`,
 * recomputes SHA256 of the file on disk and compares. Mismatch →
 * LOCK_TAMPERED failure, shortCircuit=true.
 *
 * Blueprint: Part 4 Layer 1 context + Part 5.3 gate #2.
 *
 * Schema of lock-manifest.json:
 *   {
 *     "schema_version": 1,
 *     "last_updated": "<ISO datetime>",
 *     "files": {
 *       "vitest.config.ts": "sha256:...",
 *       "playwright.config.ts": "sha256:...",
 *       ...
 *     }
 *   }
 *
 * Typical locked files: vitest.config.ts, playwright.config.ts,
 * stryker.conf.mjs, tsconfig.json, eslint.config.mjs, .claude/settings.json,
 * .quality/policies/tiers.yaml. The set is authoritative in the manifest
 * itself (not hardcoded here) so projects can customize.
 */
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  buildGateResult,
  computeFileHash,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import { IsoDateTimeSchema, type GateResult } from "../types.js";

export const LOCK_MANIFEST_GATE_ID = "lock-manifest-verify";

export const LockManifestSchema = z.object({
  schema_version: z.literal(1),
  last_updated: IsoDateTimeSchema.optional(),
  files: z.record(
    z.string().min(1),
    z.string().regex(/^sha256:[a-f0-9]{64}$/i, "expected sha256:<64 hex>"),
  ),
});
export type LockManifest = z.infer<typeof LockManifestSchema>;

export interface LockManifestMismatch {
  file: string;
  expected: string;
  actual: string;
  absolutePath: string;
}

export interface LockManifestMissing {
  file: string;
  absolutePath: string;
  reason: string;
}

export interface LockManifestDetails {
  manifestPath: string;
  filesChecked: number;
  mismatches: LockManifestMismatch[];
  missingFiles: LockManifestMissing[];
  manifestError?: string;
}

export async function runLockManifestVerify(
  config: GateConfig,
): Promise<GateResult> {
  const start = Date.now();
  const manifestPath = join(
    config.workingDir,
    ".quality",
    "policies",
    "lock-manifest.json",
  );

  const details: LockManifestDetails = {
    manifestPath,
    filesChecked: 0,
    mismatches: [],
    missingFiles: [],
  };

  let manifest: LockManifest;
  try {
    manifest = await readAndValidateManifest(manifestPath);
  } catch (err) {
    details.manifestError = (err as Error).message;
    const evidencePath = await writeEvidence(
      config.evidenceDir,
      LOCK_MANIFEST_GATE_ID,
      "report.json",
      JSON.stringify(details, null, 2),
    );
    return buildGateResult({
      gateId: LOCK_MANIFEST_GATE_ID,
      status: "fail",
      durationMs: Date.now() - start,
      details: details as unknown as Record<string, unknown>,
      artifacts: [evidencePath],
      shortCircuit: true,
    });
  }

  for (const [relPath, expected] of Object.entries(manifest.files)) {
    details.filesChecked++;
    const abs = resolve(config.workingDir, relPath);
    try {
      const actual = await computeFileHash(abs);
      if (actual !== expected) {
        details.mismatches.push({
          file: relPath,
          expected,
          actual,
          absolutePath: abs,
        });
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      details.missingFiles.push({
        file: relPath,
        absolutePath: abs,
        reason: code === "ENOENT" ? "file not found" : String(err),
      });
    }
  }

  const hasFailure =
    details.mismatches.length > 0 || details.missingFiles.length > 0;

  const evidencePath = await writeEvidence(
    config.evidenceDir,
    LOCK_MANIFEST_GATE_ID,
    "report.json",
    JSON.stringify(details, null, 2),
  );

  return buildGateResult({
    gateId: LOCK_MANIFEST_GATE_ID,
    status: hasFailure ? "fail" : "pass",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [evidencePath],
    shortCircuit: hasFailure,
  });
}

async function readAndValidateManifest(path: string): Promise<LockManifest> {
  let raw: string;
  try {
    raw = await fs.readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`lock-manifest.json not found at ${path}`);
    }
    throw err;
  }
  if (raw.trim() === "") throw new Error("lock-manifest.json is empty");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`JSON parse failed: ${(err as Error).message}`);
  }
  const result = LockManifestSchema.safeParse(parsed);
  if (!result.success) {
    const msg = result.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new Error(`schema validation failed: ${msg}`);
  }
  return result.data;
}
