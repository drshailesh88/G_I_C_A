/**
 * Classify checker — enforces blueprint 6b.iii (fail-fast on any source file
 * not covered by a tiers.yaml glob).
 *
 * Walks the target app's conventional source roots (`src/`, `app/`, `lib/`,
 * `components/`, `pages/`) and matches every `.ts` / `.tsx` / `.js` / `.jsx`
 * file against the globs in `tiers.yaml`. Any file unmatched is returned in
 * the `unclassified` list so the caller can:
 *   - print a friendly list (qa classify-check)
 *   - fail a drift-check (qa doctor)
 *   - block a qa run (runSession preflight, future)
 */
import { promises as fs } from "node:fs";
import { join, relative, sep } from "node:path";
import yaml from "js-yaml";
import { classifyFile } from "./parsers/stryker-json.js";
import {
  TierConfigSchema,
  type Tier,
  type TierConfig,
} from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClassifyCheckInput {
  workingDir: string;
  tiersYamlPath?: string;
  sourceRoots?: string[];
  sourceFileExtensions?: string[];
  /** Test files are excluded by default. */
  includeTestFiles?: boolean;
}

export interface ClassifyCheckResult {
  tiersYamlPath: string;
  sourceRoots: string[];
  scanned: number;
  classified: Array<{ path: string; tier: Tier }>;
  unclassified: string[];
  ok: boolean;
}

const DEFAULT_SOURCE_ROOTS: readonly string[] = [
  "src",
  "app",
  "lib",
  "components",
  "pages",
];

const DEFAULT_EXTENSIONS: readonly string[] = [".ts", ".tsx", ".js", ".jsx"];

const TEST_FILE_PATTERN = /\.(test|spec)\.(?:ts|tsx|js|jsx)$/;
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "__snapshots__",
  "coverage",
  "dist",
  "build",
  ".stryker-tmp",
]);

// ─── Main ────────────────────────────────────────────────────────────────────

export async function runClassifyCheck(
  input: ClassifyCheckInput,
): Promise<ClassifyCheckResult> {
  const tiersYamlPath =
    input.tiersYamlPath ??
    join(input.workingDir, ".quality", "policies", "tiers.yaml");
  const sourceRoots = input.sourceRoots ?? [...DEFAULT_SOURCE_ROOTS];
  const extensions = input.sourceFileExtensions ?? [...DEFAULT_EXTENSIONS];
  const includeTestFiles = input.includeTestFiles ?? false;

  const tiers = await loadTiers(tiersYamlPath);

  const classified: Array<{ path: string; tier: Tier }> = [];
  const unclassified: string[] = [];
  let scanned = 0;

  for (const root of sourceRoots) {
    const absRoot = join(input.workingDir, root);
    const files = await walk(absRoot, extensions, includeTestFiles);
    for (const abs of files) {
      scanned++;
      const rel = toPosix(relative(input.workingDir, abs));
      const tier = classifyFile(rel, tiers);
      if (tier) {
        classified.push({ path: rel, tier });
      } else {
        unclassified.push(rel);
      }
    }
  }

  unclassified.sort();
  classified.sort((a, b) => a.path.localeCompare(b.path));

  return {
    tiersYamlPath,
    sourceRoots,
    scanned,
    classified,
    unclassified,
    ok: unclassified.length === 0,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function loadTiers(path: string): Promise<TierConfig> {
  const raw = await fs.readFile(path, "utf8").catch(() => null);
  if (raw === null) {
    return TierConfigSchema.parse({
      schema_version: 1,
      tiers: { critical_75: [], business_60: [], ui_gates_only: [] },
      unclassified_behavior: "fail_fast",
    });
  }
  return TierConfigSchema.parse(yaml.load(raw));
}

async function walk(
  root: string,
  extensions: readonly string[],
  includeTestFiles: boolean,
): Promise<string[]> {
  const out: string[] = [];
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw err;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await walk(full, extensions, includeTestFiles);
      out.push(...nested);
    } else if (entry.isFile()) {
      if (!extensions.some((ext) => entry.name.endsWith(ext))) continue;
      if (!includeTestFiles && TEST_FILE_PATTERN.test(entry.name)) continue;
      out.push(full);
    }
  }
  return out;
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}
