/**
 * Dependency analyzer — wraps dependency-cruiser.
 *
 * Phase 2 stub is replaced here by a real programmatic cruise. Two public
 * helpers:
 *
 *   getReverseDeps(targetFiles, projectRoot)
 *     → files in the project that IMPORT FROM any of the target files.
 *       Used by Stryker T4 targeting: scope ∩ (git-diff ∪ reverse-deps).
 *
 *   getDirectDeps(filePath, projectRoot)
 *     → the file's own DIRECT imports (depth 1).
 *       Used by packet builder for the `codebase_context` field.
 *
 * Both functions accept an injectable `cruise` option so tests can stub the
 * dependency-cruiser call with canned module lists.
 *
 * Cruise results are normalized to project-relative paths with forward
 * slashes so downstream callers (Stryker glob matcher, repair packet) get a
 * consistent shape.
 */
import { relative, resolve, sep } from "node:path";
import { cruise as realCruise } from "dependency-cruiser";
import type { IModule, IDependency } from "dependency-cruiser";

// ─── Public types ─────────────────────────────────────────────────────────────

export type CruiseFn = typeof realCruise;

export interface AnalyzeOptions {
  cruise?: CruiseFn;
  /** Path to the project's tsconfig.json (relative or absolute). Defaults
   * to "tsconfig.json" in projectRoot. */
  tsConfigPath?: string;
  /** Extra includeOnly regex. Default: none (cruise all). */
  includeOnly?: string;
  /** Extra exclude regex. Default: node_modules + common build output. */
  exclude?: string;
}

const DEFAULT_EXCLUDE =
  "node_modules|\\.next|dist|coverage|reports/mutation|\\.stryker-tmp";

// ─── getDirectDeps ────────────────────────────────────────────────────────────

export async function getDirectDeps(
  filePath: string,
  projectRoot: string,
  options: AnalyzeOptions = {},
): Promise<string[]> {
  const cruise = options.cruise ?? realCruise;
  const cruiseOpts = buildCruiseOpts(projectRoot, options, 1);
  const result = await cruise([filePath], cruiseOpts);
  const output = extractOutput(result);
  if (!output) return [];

  const normalized = normalize(filePath, projectRoot);
  const sourceModule = findSourceModule(output.modules ?? [], normalized, filePath);
  if (!sourceModule) return [];

  return (sourceModule.dependencies ?? [])
    .filter(isUsableDep)
    .map((d) => normalize(d.resolved, projectRoot))
    .filter((p, i, arr) => arr.indexOf(p) === i)
    .sort();
}

// ─── getReverseDeps ───────────────────────────────────────────────────────────

export async function getReverseDeps(
  targetFiles: string[],
  projectRoot: string,
  options: AnalyzeOptions = {},
): Promise<string[]> {
  if (targetFiles.length === 0) return [];
  const cruise = options.cruise ?? realCruise;
  const cruiseOpts = buildCruiseOpts(projectRoot, options);
  const result = await cruise([projectRoot], cruiseOpts);
  const output = extractOutput(result);
  if (!output) return [];

  const targetSet = new Set(targetFiles.map((f) => normalize(f, projectRoot)));
  const reverse = new Set<string>();

  for (const module of output.modules ?? []) {
    const source = normalize(module.source, projectRoot);
    if (targetSet.has(source)) continue;
    for (const dep of module.dependencies ?? []) {
      if (!isUsableDep(dep)) continue;
      const resolved = normalize(dep.resolved, projectRoot);
      if (targetSet.has(resolved)) {
        reverse.add(source);
        break;
      }
    }
  }

  return [...reverse].sort();
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildCruiseOpts(
  projectRoot: string,
  options: AnalyzeOptions,
  maxDepth?: number,
): Parameters<CruiseFn>[1] {
  return {
    baseDir: projectRoot,
    tsConfig: {
      fileName: options.tsConfigPath ?? "tsconfig.json",
    },
    exclude: {
      path: options.exclude ?? DEFAULT_EXCLUDE,
    },
    ...(options.includeOnly !== undefined
      ? { includeOnly: { path: options.includeOnly } }
      : {}),
    ...(maxDepth !== undefined ? { maxDepth } : {}),
    outputType: "json" as const,
  };
}

function extractOutput(
  result: Awaited<ReturnType<CruiseFn>>,
): { modules: IModule[] } | undefined {
  // cruise() returns IReporterOutput; its `.output` is either a rendered
  // string (error paths) or an ICruiseResult with `.modules`.
  const output = (result as { output?: unknown }).output;
  if (!output || typeof output === "string") return undefined;
  if (typeof output !== "object" || !("modules" in output)) return undefined;
  return output as { modules: IModule[] };
}

function isUsableDep(d: IDependency): boolean {
  if (d.coreModule) return false;
  if (d.couldNotResolve) return false;
  if (typeof d.resolved !== "string" || d.resolved.length === 0) return false;
  return true;
}

function findSourceModule(
  modules: IModule[],
  normalized: string,
  rawPath: string,
): IModule | undefined {
  // dependency-cruiser may return the source as either the resolved absolute
  // path or the project-relative path depending on cruise configuration.
  // Match against both shapes.
  return modules.find(
    (m) => m.source === normalized || m.source === rawPath,
  );
}

/**
 * Normalize any path to project-relative forward-slash form. Keeps things
 * consistent across platforms. Throws if the path is clearly outside the
 * project root (to keep glob matching sane).
 */
export function normalize(path: string, projectRoot: string): string {
  if (!path) return path;
  // Always convert backslashes to forward slashes — normalize to POSIX-style
  // regardless of platform.
  const forward = path.replace(/\\/g, "/");
  // Already relative → keep as-is (with slashes normalized).
  if (!forward.startsWith("/") && !forward.match(/^[A-Z]:\//i)) {
    return forward;
  }
  const absolute = resolve(forward);
  const absoluteRoot = resolve(projectRoot);
  const rel = relative(absoluteRoot, absolute);
  return rel.split(sep).join("/");
}
