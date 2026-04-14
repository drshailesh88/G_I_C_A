/**
 * Playwright JSON reporter parser.
 *
 * Reads the JSON output from `playwright test --reporter=json > <path>` and
 * returns a PlaywrightResult. The parsed shape matches Playwright 1.49+.
 *
 * Root structure (simplified):
 *   {
 *     "config": {...},
 *     "stats": { expected, unexpected, flaky, skipped, duration, startTime },
 *     "suites": Suite[],
 *     "errors": [...]
 *   }
 *
 * A Suite has:
 *   - title, file, line, column
 *   - suites: Suite[]        (nested)
 *   - specs: Spec[]
 *
 * A Spec has:
 *   - title, file, line, column, ok, tags
 *   - tests: Test[]          (one per project/retry set)
 *
 * A Test has:
 *   - projectName, projectId, timeout, expectedStatus
 *   - results: TestResult[]  (one per attempt — first + retries)
 *
 * A TestResult has:
 *   - status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted"
 *   - duration, retry, startTime
 *   - error: { message, stack, ... }
 *   - attachments: [{ name, contentType, path }]
 *
 * Reduction rules:
 *   - A test's final outcome is the LAST result (after retries).
 *   - "flaky" = a test that eventually passed but had at least one earlier
 *     failed attempt — Playwright marks these via stats.flaky.
 *   - We additionally compute flaky locally by scanning results[].
 *
 * Blueprint notes:
 *   - executedSpecFiles drives gate 14a (contract-test-count verification).
 *   - Attachments surface trace/screenshot/video paths for repair packets.
 */
import { promises as fs } from "node:fs";
import { z } from "zod";
import {
  ParseError,
  type PlaywrightFailureDetail,
  type PlaywrightResult,
} from "../types.js";

// ─── Playwright report Zod schemas ────────────────────────────────────────────

const ErrorShapeSchema = z
  .object({
    message: z.string().optional(),
    stack: z.string().optional(),
    value: z.string().optional(),
    snippet: z.string().optional(),
    location: z
      .object({
        file: z.string().optional(),
        line: z.number().optional(),
        column: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();

const AttachmentSchema = z
  .object({
    name: z.string(),
    contentType: z.string().optional(),
    path: z.string().optional(),
    body: z.string().optional(),
  })
  .passthrough();

const TestResultSchema = z
  .object({
    status: z.enum([
      "passed",
      "failed",
      "timedOut",
      "skipped",
      "interrupted",
    ]),
    duration: z.number().nonnegative().optional().default(0),
    retry: z.number().int().nonnegative().optional().default(0),
    startTime: z.string().optional(),
    error: ErrorShapeSchema.optional(),
    errors: z.array(ErrorShapeSchema).optional(),
    attachments: z.array(AttachmentSchema).optional().default([]),
    stdout: z.array(z.any()).optional(),
    stderr: z.array(z.any()).optional(),
  })
  .passthrough();

const TestSchema = z
  .object({
    projectName: z.string().optional().default(""),
    projectId: z.string().optional(),
    timeout: z.number().optional(),
    expectedStatus: z.string().optional(),
    annotations: z.array(z.any()).optional(),
    results: z.array(TestResultSchema).optional().default([]),
  })
  .passthrough();

const SpecSchema = z
  .object({
    title: z.string(),
    file: z.string().optional().default(""),
    line: z.number().optional(),
    column: z.number().optional(),
    ok: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    tests: z.array(TestSchema).optional().default([]),
  })
  .passthrough();

interface Suite {
  title?: string;
  file?: string;
  suites?: Suite[];
  specs?: z.infer<typeof SpecSchema>[];
}

// z.lazy() with strict exactOptionalPropertyTypes + .passthrough() produces
// an input/output type asymmetry that TS cannot reconcile generically. The
// runtime parse still enforces structure; we cast the schema here and keep
// the Suite interface as the consumer-facing shape.
const SuiteSchema: z.ZodType<Suite> = z.lazy(() =>
  z
    .object({
      title: z.string().optional(),
      file: z.string().optional(),
      suites: z.array(SuiteSchema).optional(),
      specs: z.array(SpecSchema).optional(),
    })
    .passthrough(),
) as unknown as z.ZodType<Suite>;

const StatsSchema = z
  .object({
    expected: z.number().int().nonnegative().optional(),
    unexpected: z.number().int().nonnegative().optional(),
    flaky: z.number().int().nonnegative().optional(),
    skipped: z.number().int().nonnegative().optional(),
    duration: z.number().nonnegative().optional(),
  })
  .passthrough()
  .optional();

const PlaywrightReportSchema = z
  .object({
    config: z.any().optional(),
    stats: StatsSchema,
    suites: z.array(SuiteSchema).optional().default([]),
    errors: z.array(ErrorShapeSchema).optional(),
  })
  .passthrough();

export type PlaywrightReport = z.infer<typeof PlaywrightReportSchema>;

// ─── Parser entry points ──────────────────────────────────────────────────────

export interface ParsePlaywrightOptions {
  /** Inline JSON string — bypass file I/O. */
  contents?: string;
}

export async function parsePlaywrightJson(
  path: string,
  options: ParsePlaywrightOptions = {},
): Promise<PlaywrightResult> {
  const json = await loadJson(path, options);
  return parsePlaywrightJsonString(json, path);
}

export function parsePlaywrightJsonString(
  raw: string,
  source = "<inline>",
): PlaywrightResult {
  if (raw.trim() === "") {
    throw new ParseError(source, "Playwright JSON is empty");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ParseError(source, `JSON.parse failed: ${(err as Error).message}`);
  }
  return parsePlaywrightReport(parsed, source);
}

export function parsePlaywrightReport(
  raw: unknown,
  source = "<report>",
): PlaywrightResult {
  const parseResult = PlaywrightReportSchema.safeParse(raw);
  if (!parseResult.success) {
    throw new ParseError(
      source,
      `schema validation failed: ${parseResult.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ")}`,
    );
  }
  const report = parseResult.data;
  return reduceReport(report);
}

// ─── Reduction ────────────────────────────────────────────────────────────────

function reduceReport(report: PlaywrightReport): PlaywrightResult {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let flaky = 0;
  let durationMs = 0;
  const failures: PlaywrightFailureDetail[] = [];
  const executedSpecFiles = new Set<string>();

  const walk = (suite: Suite): void => {
    for (const nested of suite.suites ?? []) {
      walk(nested);
    }
    for (const spec of suite.specs ?? []) {
      const specFile = spec.file || suite.file || "<unknown>";
      if (specFile) executedSpecFiles.add(specFile);

      for (const testEntry of spec.tests ?? []) {
        const outcome = classifyTest(testEntry.results);
        total++;
        durationMs += outcome.durationMs;

        if (outcome.state === "passed") {
          passed++;
          if (outcome.hadRetryFailure) {
            flaky++;
          }
        } else if (outcome.state === "skipped") {
          skipped++;
        } else {
          failed++;
          failures.push({
            file: specFile,
            title: buildFullTitle(suite, spec),
            projectName: testEntry.projectName || "<default>",
            error: outcome.errorMessage || "(no error message)",
            ...(outcome.errorStack !== undefined ? { stack: outcome.errorStack } : {}),
            ...(outcome.traceFile !== undefined ? { traceFile: outcome.traceFile } : {}),
            ...(outcome.screenshotFile !== undefined
              ? { screenshotFile: outcome.screenshotFile }
              : {}),
            ...(outcome.videoFile !== undefined ? { videoFile: outcome.videoFile } : {}),
          });
        }
      }
    }
  };

  for (const suite of report.suites ?? []) walk(suite);

  // Prefer top-level stats.duration when available (covers worker parallelism).
  if (report.stats?.duration !== undefined) {
    durationMs = Math.round(report.stats.duration);
  } else {
    durationMs = Math.round(durationMs);
  }

  return {
    total,
    passed,
    failed,
    skipped,
    flaky,
    durationMs,
    failures,
    executedSpecFiles: [...executedSpecFiles].sort(),
  };
}

interface TestOutcome {
  state: "passed" | "failed" | "skipped";
  hadRetryFailure: boolean;
  durationMs: number;
  errorMessage?: string;
  errorStack?: string;
  traceFile?: string;
  screenshotFile?: string;
  videoFile?: string;
}

function classifyTest(results: z.infer<typeof TestResultSchema>[] | undefined): TestOutcome {
  if (!results || results.length === 0) {
    return { state: "skipped", hadRetryFailure: false, durationMs: 0 };
  }

  // Sort by retry ascending so last = final attempt.
  const sorted = [...results].sort((a, b) => a.retry - b.retry);
  const last = sorted[sorted.length - 1]!;
  const durationMs = sorted.reduce((sum, r) => sum + (r.duration ?? 0), 0);

  if (last.status === "passed") {
    const hadRetryFailure = sorted
      .slice(0, -1)
      .some((r) => r.status === "failed" || r.status === "timedOut");
    return { state: "passed", hadRetryFailure, durationMs };
  }
  if (last.status === "skipped") {
    return { state: "skipped", hadRetryFailure: false, durationMs };
  }

  // failed / timedOut / interrupted → failed
  const err = last.error ?? last.errors?.[0];
  const attachments = last.attachments ?? [];
  const trace = attachments.find((a) => a.name === "trace" && a.path);
  const screenshot = attachments.find(
    (a) => a.name === "screenshot" && a.path,
  );
  const video = attachments.find((a) => a.name === "video" && a.path);

  const outcome: TestOutcome = {
    state: "failed",
    hadRetryFailure: false,
    durationMs,
  };
  if (err?.message) outcome.errorMessage = err.message;
  if (err?.stack) outcome.errorStack = err.stack;
  if (trace?.path) outcome.traceFile = trace.path;
  if (screenshot?.path) outcome.screenshotFile = screenshot.path;
  if (video?.path) outcome.videoFile = video.path;
  return outcome;
}

function buildFullTitle(suite: Suite, spec: z.infer<typeof SpecSchema>): string {
  const suiteTitle = suite.title && suite.title !== spec.file ? suite.title : "";
  return [suiteTitle, spec.title].filter((s) => s && s.length > 0).join(" > ");
}

async function loadJson(
  path: string,
  options: ParsePlaywrightOptions,
): Promise<string> {
  if (options.contents !== undefined) return options.contents;
  try {
    const stat = await fs.stat(path);
    if (!stat.isFile()) {
      throw new ParseError(path, "path is not a file");
    }
    if (stat.size === 0) {
      throw new ParseError(path, "Playwright JSON file is empty");
    }
  } catch (err) {
    if (err instanceof ParseError) throw err;
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ParseError(path, "Playwright JSON file not found");
    }
    throw new ParseError(path, `stat failed: ${String(err)}`);
  }
  return fs.readFile(path, "utf8");
}
