/**
 * Release gate — Migration safety check (blueprint 14b).
 *
 * Scans Drizzle migration files under a configurable directory
 * (`drizzle/` by default) for destructive SQL operations:
 *
 *   - DROP TABLE / DROP COLUMN / DROP INDEX / DROP CONSTRAINT / DROP SCHEMA /
 *     DROP VIEW / DROP DATABASE
 *   - DELETE FROM (any)
 *   - TRUNCATE
 *   - ALTER COLUMN … TYPE   (can destroy data on shrinking/narrowing)
 *   - RENAME TABLE / RENAME COLUMN  (breaks downstream queries silently)
 *
 * Severity: **warn** (not blocking). Flagged in the release summary so
 * humans explicitly acknowledge each destructive migration before the
 * release ships. Per blueprint 14b: destructive migrations must not be
 * silently executed.
 *
 * SQL parsing here is deliberately heuristic (regex). A real SQL parser
 * would add a heavy dependency and false negatives on vendor-specific
 * syntax. For the gate's purpose (catch + flag, not prove correctness),
 * the regex covers Postgres/MySQL/SQLite Drizzle output well enough.
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  buildGateResult,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import type { GateResult } from "../types.js";

export const MIGRATION_SAFETY_GATE_ID = "migration-safety";

export interface MigrationFinding {
  file: string;
  line: number;
  pattern: string;
  statement: string;
}

export interface MigrationSafetyDetails {
  migrationsDir: string;
  filesScanned: number;
  findingsCount: number;
  findings: MigrationFinding[];
  patternsApplied: string[];
}

export interface MigrationSafetyInput {
  config: GateConfig;
  /** Relative to workingDir. Defaults to "drizzle". */
  migrationsDir?: string;
}

// ─── Destructive-operation detectors ─────────────────────────────────────────

interface Detector {
  pattern: string;
  regex: RegExp;
}

const DESTRUCTIVE_DETECTORS: readonly Detector[] = [
  { pattern: "DROP_TABLE", regex: /\bDROP\s+TABLE\b/i },
  { pattern: "DROP_COLUMN", regex: /\bDROP\s+COLUMN\b/i },
  { pattern: "DROP_INDEX", regex: /\bDROP\s+INDEX\b/i },
  { pattern: "DROP_CONSTRAINT", regex: /\bDROP\s+CONSTRAINT\b/i },
  { pattern: "DROP_SCHEMA", regex: /\bDROP\s+SCHEMA\b/i },
  { pattern: "DROP_VIEW", regex: /\bDROP\s+VIEW\b/i },
  { pattern: "DROP_DATABASE", regex: /\bDROP\s+DATABASE\b/i },
  { pattern: "DELETE_FROM", regex: /\bDELETE\s+FROM\b/i },
  { pattern: "TRUNCATE", regex: /\bTRUNCATE\b/i },
  { pattern: "ALTER_COLUMN_TYPE", regex: /\bALTER\s+COLUMN\s+\S+\s+(?:SET\s+DATA\s+)?TYPE\b/i },
  { pattern: "RENAME_TABLE", regex: /\bRENAME\s+(?:TABLE\s+\S+\s+)?TO\b/i },
  { pattern: "RENAME_COLUMN", regex: /\bRENAME\s+COLUMN\b/i },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runMigrationSafetyGate(
  input: MigrationSafetyInput,
): Promise<GateResult> {
  const start = Date.now();
  const migrationsDir = input.migrationsDir ?? "drizzle";
  const absMigrations = join(input.config.workingDir, migrationsDir);

  const files = await listSqlFiles(absMigrations);
  const findings: MigrationFinding[] = [];

  for (const file of files) {
    const contents = await fs.readFile(file, "utf8").catch(() => "");
    const lines = contents.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const stripped = stripSqlComment(line);
      if (stripped.trim().length === 0) continue;
      for (const detector of DESTRUCTIVE_DETECTORS) {
        if (detector.regex.test(stripped)) {
          findings.push({
            file: relativize(file, input.config.workingDir),
            line: i + 1,
            pattern: detector.pattern,
            statement: stripped.trim().slice(0, 200),
          });
        }
      }
    }
  }

  const details: MigrationSafetyDetails = {
    migrationsDir,
    filesScanned: files.length,
    findingsCount: findings.length,
    findings,
    patternsApplied: DESTRUCTIVE_DETECTORS.map((d) => d.pattern),
  };

  const evidencePath = await writeEvidence(
    input.config.evidenceDir,
    MIGRATION_SAFETY_GATE_ID,
    "report.json",
    JSON.stringify(details, null, 2),
  );

  // Gate itself always PASSES (warn-level). Findings surface in the summary
  // via the release-runner's warnings aggregation.
  return buildGateResult({
    gateId: MIGRATION_SAFETY_GATE_ID,
    status: "pass",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [evidencePath],
    shortCircuit: false,
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function listSqlFiles(dir: string): Promise<string[]> {
  const result: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        result.push(...(await listSqlFiles(full)));
      } else if (entry.isFile() && entry.name.endsWith(".sql")) {
        result.push(full);
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return result.sort();
}

function stripSqlComment(line: string): string {
  const idx = line.indexOf("--");
  if (idx === -1) return line;
  return line.slice(0, idx);
}

function relativize(absolute: string, root: string): string {
  if (absolute.startsWith(root + "/")) return absolute.slice(root.length + 1);
  if (absolute.startsWith(root)) return absolute.slice(root.length);
  return absolute;
}
