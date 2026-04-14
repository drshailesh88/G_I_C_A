/**
 * Stryker mutation.json + incremental.json parser.
 *
 * Reads the mutation report (Stryker schema 2.x) plus the optional incremental
 * cache, and emits per-file scores with the freshly-measured-vs-cached
 * distinction required by blueprint 8c + M2.
 *
 * Score definition (matches Stryker documentation):
 *   score = killed / (killed + survived + timeout)
 *
 * Mutants with status NoCoverage / RuntimeError / CompileError / Skipped /
 * Pending / Ignored are EXCLUDED from the denominator. A file whose mutants
 * are all in excluded statuses returns a `null` score (cannot be computed).
 *
 * Freshly-measured vs cached:
 *   - Without a prior incremental snapshot: everything is treated as fresh
 *     (we have no signal otherwise).
 *   - With a prior snapshot: for each mutant ID in the current run, compare
 *     its status to the previous run's recorded status. A status change
 *     means the mutant was re-tested this run (fresh). No change means the
 *     status was carried forward from the cache (potentially stale).
 *   - A file's `freshlyMeasured` flag is true iff ANY of its mutants were
 *     freshly measured.
 *
 * Tier assignment (optional):
 *   - If a TierConfig is passed in, each file path is matched against the
 *     tier globs. First match wins (critical_75 → business_60 → ui_gates_only).
 *   - Unmatched files are surfaced in `unclassifiedFiles` so the controller
 *     can apply fail-fast (6b.iii).
 */
import { promises as fs } from "node:fs";
import { z } from "zod";
import {
  ParseError,
  type StrykerFileScore,
  type StrykerMutantStatus,
  type StrykerResult,
  type StrykerSurvivingMutant,
  type Tier,
  type TierConfig,
} from "../types.js";

// ─── Stryker report shapes ────────────────────────────────────────────────────

const MUTANT_STATUSES = [
  "Killed",
  "Survived",
  "NoCoverage",
  "Timeout",
  "RuntimeError",
  "CompileError",
  "Skipped",
  "Pending",
  "Ignored",
] as const;

const MutantLocationSchema = z.object({
  start: z.object({ line: z.number().int(), column: z.number().int() }),
  end: z.object({ line: z.number().int(), column: z.number().int() }),
});

const MutantSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform((v) => String(v)),
    mutatorName: z.string(),
    status: z.enum(MUTANT_STATUSES),
    statusReason: z.string().optional(),
    location: MutantLocationSchema.optional(),
    replacement: z.string().optional(),
    testsCompleted: z.number().int().optional(),
  })
  .passthrough();

const FileReportSchema = z
  .object({
    language: z.string().optional(),
    source: z.string().optional(),
    mutants: z.array(MutantSchema).default([]),
  })
  .passthrough();

const MutationReportSchema = z
  .object({
    schemaVersion: z.string().optional(),
    thresholds: z.object({}).passthrough().optional(),
    projectRoot: z.string().optional(),
    files: z.record(z.string(), FileReportSchema).default({}),
  })
  .passthrough();

export type StrykerMutationReport = z.infer<typeof MutationReportSchema>;

// Incremental.json format: Stryker persists a per-file map of mutant id →
// status. The exact shape has shifted across versions; we normalize both
// known variants below.
//
//   v1 shape (older):
//     { "files": { "src/foo.ts": { "1": "Killed", "2": "Survived" } } }
//   v2 shape (newer):
//     { "mutants": { "src/foo.ts": { "1": "Killed" } } }
//   canonical output of parseIncrementalSnapshot(): Map<file, Map<id, status>>.

const IncrementalV1Schema = z
  .object({
    files: z.record(z.string(), z.record(z.string(), z.enum(MUTANT_STATUSES))),
  })
  .passthrough();

const IncrementalV2Schema = z
  .object({
    mutants: z.record(z.string(), z.record(z.string(), z.enum(MUTANT_STATUSES))),
  })
  .passthrough();

// ─── Parser entry points ──────────────────────────────────────────────────────

export interface ParseStrykerOptions {
  /** Path to Stryker's incremental.json (optional, enables fresh-vs-cached
   * distinction by diffing mutant statuses). */
  incrementalPath?: string;
  /** Tier classification input. When provided, each file's `tier` is resolved
   * and unclassified files are reported in `unclassifiedFiles`. */
  tiers?: TierConfig;
  /** Inline JSON strings — bypass file I/O. */
  mutationContents?: string;
  incrementalContents?: string;
}

export async function parseStrykerReport(
  mutationPath: string,
  options: ParseStrykerOptions = {},
): Promise<StrykerResult> {
  const mutationRaw = await loadJson(mutationPath, options.mutationContents, "mutation.json");
  const report = safeParseJson(mutationRaw, mutationPath, MutationReportSchema);

  let previousSnapshot: Map<string, Map<string, StrykerMutantStatus>> | undefined;
  if (options.incrementalPath !== undefined || options.incrementalContents !== undefined) {
    const incrementalRaw = await loadJson(
      options.incrementalPath ?? "",
      options.incrementalContents,
      "incremental.json",
    );
    if (incrementalRaw !== undefined) {
      previousSnapshot = parseIncrementalSnapshot(
        incrementalRaw,
        options.incrementalPath ?? "incremental.json",
      );
    }
  }

  return reduceReport(report, previousSnapshot, options.tiers);
}

/**
 * Parse an incremental.json string into a file → (mutantId → status) map.
 * Tolerates both v1 and v2 shapes.
 */
export function parseIncrementalSnapshot(
  raw: string,
  source = "incremental.json",
): Map<string, Map<string, StrykerMutantStatus>> {
  if (raw.trim() === "") {
    throw new ParseError(source, "incremental.json is empty");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ParseError(source, `JSON.parse failed: ${(err as Error).message}`);
  }

  const v2 = IncrementalV2Schema.safeParse(parsed);
  const source2 = v2.success ? v2.data.mutants : undefined;
  const v1 = IncrementalV1Schema.safeParse(parsed);
  const source1 = v1.success ? v1.data.files : undefined;

  const src = source2 ?? source1;
  if (!src) {
    throw new ParseError(
      source,
      "incremental.json did not match known shapes (expected top-level 'mutants' or 'files' object)",
    );
  }

  const map = new Map<string, Map<string, StrykerMutantStatus>>();
  for (const [file, mutants] of Object.entries(src)) {
    const inner = new Map<string, StrykerMutantStatus>();
    for (const [id, status] of Object.entries(mutants)) {
      inner.set(String(id), status);
    }
    map.set(file, inner);
  }
  return map;
}

// ─── Reduction ────────────────────────────────────────────────────────────────

function reduceReport(
  report: StrykerMutationReport,
  previousSnapshot: Map<string, Map<string, StrykerMutantStatus>> | undefined,
  tiers: TierConfig | undefined,
): StrykerResult {
  const perFile = new Map<string, StrykerFileScore>();
  const unclassifiedFiles: string[] = [];
  let totalMutants = 0;
  let freshlyTested = 0;
  let cachedFromIncremental = 0;
  let overallKilled = 0;
  let overallScoredDenominator = 0;

  for (const [filePath, fileReport] of Object.entries(report.files)) {
    const mutants = fileReport.mutants;
    const counts = countByStatus(mutants);
    const topSurviving = extractTopSurvivingMutants(mutants);

    const scoredDenominator = counts.killed + counts.survived + counts.timeout;
    const score = scoredDenominator === 0 ? null : +(counts.killed / scoredDenominator * 100).toFixed(2);

    // Freshly measured computation
    const prev = previousSnapshot?.get(filePath);
    let fileFresh = false;
    for (const m of mutants) {
      totalMutants++;
      if (!prev) {
        freshlyTested++;
        fileFresh = true;
        continue;
      }
      const prevStatus = prev.get(m.id);
      if (prevStatus === undefined || prevStatus !== m.status) {
        freshlyTested++;
        fileFresh = true;
      } else {
        cachedFromIncremental++;
      }
    }

    // Tier classification (optional)
    let tier: Tier | undefined;
    if (tiers) {
      tier = classifyFile(filePath, tiers);
      if (tier === undefined) {
        unclassifiedFiles.push(filePath);
      }
    }

    const fileScore: StrykerFileScore = {
      filePath,
      killed: counts.killed,
      survived: counts.survived,
      timeout: counts.timeout,
      noCoverage: counts.noCoverage,
      runtimeErrors: counts.runtimeError,
      compileErrors: counts.compileError,
      skipped: counts.skipped,
      pending: counts.pending,
      ignored: counts.ignored,
      total: mutants.length,
      score,
      freshlyMeasured: fileFresh || !prev,
      topSurvivingMutants: topSurviving,
      ...(tier !== undefined ? { tier } : {}),
    };

    perFile.set(filePath, fileScore);
    overallKilled += counts.killed;
    overallScoredDenominator += scoredDenominator;
  }

  const overallScore =
    overallScoredDenominator === 0
      ? null
      : +(overallKilled / overallScoredDenominator * 100).toFixed(2);

  return {
    perFile,
    overallScore,
    totalMutants,
    freshlyTested,
    cachedFromIncremental,
    unclassifiedFiles,
  };
}

interface StatusCounts {
  killed: number;
  survived: number;
  timeout: number;
  noCoverage: number;
  runtimeError: number;
  compileError: number;
  skipped: number;
  pending: number;
  ignored: number;
}

function countByStatus(mutants: z.infer<typeof MutantSchema>[]): StatusCounts {
  const counts: StatusCounts = {
    killed: 0,
    survived: 0,
    timeout: 0,
    noCoverage: 0,
    runtimeError: 0,
    compileError: 0,
    skipped: 0,
    pending: 0,
    ignored: 0,
  };
  for (const m of mutants) {
    switch (m.status) {
      case "Killed":
        counts.killed++;
        break;
      case "Survived":
        counts.survived++;
        break;
      case "Timeout":
        counts.timeout++;
        break;
      case "NoCoverage":
        counts.noCoverage++;
        break;
      case "RuntimeError":
        counts.runtimeError++;
        break;
      case "CompileError":
        counts.compileError++;
        break;
      case "Skipped":
        counts.skipped++;
        break;
      case "Pending":
        counts.pending++;
        break;
      case "Ignored":
        counts.ignored++;
        break;
    }
  }
  return counts;
}

function extractTopSurvivingMutants(
  mutants: z.infer<typeof MutantSchema>[],
  limit = 5,
): StrykerSurvivingMutant[] {
  const survivors: StrykerSurvivingMutant[] = [];
  for (const m of mutants) {
    if (m.status !== "Survived") continue;
    const entry: StrykerSurvivingMutant = {
      id: m.id,
      mutatorName: m.mutatorName,
      line: m.location?.start.line ?? 0,
      column: m.location?.start.column ?? 0,
      ...(m.replacement !== undefined ? { replacement: m.replacement } : {}),
    };
    survivors.push(entry);
    if (survivors.length >= limit) break;
  }
  return survivors;
}

// ─── Tier classification ──────────────────────────────────────────────────────

/**
 * Resolve a file path against the tier config. Matching order:
 *   1. critical_75
 *   2. business_60
 *   3. ui_gates_only
 * First glob match wins. Returns undefined if no glob matches (caller should
 * treat this as fail-fast per blueprint 6b.iii).
 */
export function classifyFile(
  filePath: string,
  tiers: TierConfig,
): Tier | undefined {
  for (const tier of ["critical_75", "business_60", "ui_gates_only"] as const) {
    const patterns = tiers.tiers[tier];
    for (const pattern of patterns) {
      if (matchGlob(filePath, pattern)) return tier;
    }
  }
  return undefined;
}

/**
 * Small, self-contained glob matcher supporting:
 *   - `**`  → any sequence of characters including path separators
 *   - `*`   → any sequence of characters except path separators
 *   - `?`   → one character (not `/`)
 *   - everything else matches literally
 *
 * Deliberately does NOT support `{a,b}`, `[abc]`, or `!(...)` — tier globs
 * in practice use only `**` and `*`. Keeping this narrow avoids pulling in
 * picomatch for no added value.
 */
export function matchGlob(path: string, glob: string): boolean {
  const regex = compileGlobToRegex(glob);
  return regex.test(path);
}

const GLOB_CACHE = new Map<string, RegExp>();

function compileGlobToRegex(glob: string): RegExp {
  const cached = GLOB_CACHE.get(glob);
  if (cached) return cached;

  // Escape regex metacharacters EXCEPT those we handle below.
  let pattern = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        pattern += ".*";
        i++;
      } else {
        pattern += "[^/]*";
      }
    } else if (c === "?") {
      pattern += "[^/]";
    } else if (/[.+^${}()|[\]\\]/.test(c as string)) {
      pattern += `\\${c}`;
    } else {
      pattern += c;
    }
  }
  const regex = new RegExp(`^${pattern}$`);
  GLOB_CACHE.set(glob, regex);
  return regex;
}

// ─── I/O + JSON helpers ───────────────────────────────────────────────────────

async function loadJson(
  path: string,
  inlineContents: string | undefined,
  label: string,
): Promise<string> {
  if (inlineContents !== undefined) return inlineContents;
  if (path === "") return ""; // no path and no inline — sentinel for "skip"

  try {
    const stat = await fs.stat(path);
    if (!stat.isFile()) {
      throw new ParseError(path, `${label} path is not a file`);
    }
    if (stat.size === 0) {
      throw new ParseError(path, `${label} is empty`);
    }
  } catch (err) {
    if (err instanceof ParseError) throw err;
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ParseError(path, `${label} not found`);
    }
    throw new ParseError(path, `stat failed: ${String(err)}`);
  }
  return fs.readFile(path, "utf8");
}

function safeParseJson<S extends z.ZodTypeAny>(
  raw: string,
  source: string,
  schema: S,
): z.infer<S> {
  if (raw.trim() === "") {
    throw new ParseError(source, "file is empty");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ParseError(source, `JSON.parse failed: ${(err as Error).message}`);
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ParseError(
      source,
      `schema validation failed: ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}
