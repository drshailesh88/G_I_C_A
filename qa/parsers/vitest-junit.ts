/**
 * Vitest JUnit XML parser.
 *
 * Reads the JUnit XML emitted by `vitest run --reporter=junit --outputFile=<path>`
 * and returns a structured VitestResult. Validates the file exists and is
 * non-empty before parsing; throws ParseError with actionable context otherwise.
 *
 * JUnit XML shape (Vitest 2.x):
 *   <testsuites tests=".." failures=".." errors=".." time="..">
 *     <testsuite name=".." tests=".." failures=".." errors=".." skipped=".." time="..">
 *       <testcase classname=".." name=".." time="..">
 *         [<failure message=".." type="..">stack...</failure>]
 *         [<skipped/>]
 *         [<error message=".." type="..">...</error>]
 *       </testcase>
 *     </testsuite>
 *   </testsuites>
 *
 * Gotchas handled:
 *   - fast-xml-parser renders single-child elements as objects, multi-child as
 *     arrays; normalized with `isArray` option.
 *   - `<skipped/>` renders as empty string; presence alone signals skip.
 *   - Empty testsuites (no testcase key).
 *   - Rare: testsuites with a single testsuite that fast-xml-parser won't
 *     wrap in an array.
 */
import { promises as fs } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { ParseError, type VitestFailureDetail, type VitestResult } from "../types.js";

interface RawTestCase {
  "@_classname"?: string;
  "@_name"?: string;
  "@_time"?: string;
  failure?: RawFailure | RawFailure[];
  error?: RawFailure | RawFailure[];
  skipped?: string | { "#text"?: string };
}

interface RawFailure {
  "@_message"?: string;
  "@_type"?: string;
  "#text"?: string;
}

interface RawTestSuite {
  "@_name"?: string;
  "@_tests"?: string;
  "@_failures"?: string;
  "@_errors"?: string;
  "@_skipped"?: string;
  "@_time"?: string;
  "@_file"?: string;
  testcase?: RawTestCase | RawTestCase[];
}

interface RawTestSuites {
  "@_tests"?: string;
  "@_failures"?: string;
  "@_errors"?: string;
  "@_time"?: string;
  testsuite?: RawTestSuite | RawTestSuite[];
}

interface RawRoot {
  testsuites?: RawTestSuites;
  testsuite?: RawTestSuite | RawTestSuite[];
}

export interface ParseVitestOptions {
  /** Bypass the file-exists check — used when caller already loaded the XML. */
  contents?: string;
}

/**
 * Parse a Vitest JUnit XML file. Pass `contents` to parse an in-memory string
 * directly; otherwise the function reads the file at `path`.
 */
export async function parseVitestJunit(
  path: string,
  options: ParseVitestOptions = {},
): Promise<VitestResult> {
  const xml = await loadXml(path, options);
  return parseVitestJunitString(xml, path);
}

/** Synchronous variant for callers that already have the XML text. */
export function parseVitestJunitString(xml: string, source = "<inline>"): VitestResult {
  if (xml.trim() === "") {
    throw new ParseError(source, "JUnit XML is empty");
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    trimValues: true,
    isArray: (name) =>
      name === "testsuite" || name === "testcase" || name === "failure" || name === "error",
  });

  let root: RawRoot;
  try {
    root = parser.parse(xml) as RawRoot;
  } catch (err) {
    throw new ParseError(source, `XML parse failed: ${(err as Error).message}`);
  }

  // Vitest typically emits <testsuites><testsuite>...</testsuite></testsuites>,
  // but older reporters sometimes emit a bare <testsuite>. Handle both.
  const suites: RawTestSuite[] = root.testsuites?.testsuite
    ? asArray(root.testsuites.testsuite)
    : root.testsuite
      ? asArray(root.testsuite)
      : [];

  const failures: VitestFailureDetail[] = [];
  let totalCount = 0;
  let failureCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let durationMsSum = 0;

  for (const suite of suites) {
    const suiteName = suite["@_name"] ?? "<unnamed>";
    const file = suite["@_file"];
    durationMsSum += parseNumberAttr(suite["@_time"]) * 1000;

    const testcases = asArray(suite.testcase ?? []);
    for (const tc of testcases) {
      totalCount++;
      const testName = tc["@_name"] ?? "<unnamed>";
      const classname = tc["@_classname"] ?? suiteName;

      // Skipped
      if (tc.skipped !== undefined) {
        skippedCount++;
        continue;
      }

      const failureArr = asArray(tc.failure ?? []);
      const errorArr = asArray(tc.error ?? []);

      if (failureArr.length > 0) {
        failureCount++;
        const f = failureArr[0]!;
        failures.push(buildFailureDetail({
          suite: classname,
          testName,
          raw: f,
          file,
        }));
      } else if (errorArr.length > 0) {
        errorCount++;
        const e = errorArr[0]!;
        failures.push(buildFailureDetail({
          suite: classname,
          testName,
          raw: e,
          file,
        }));
      }
    }
  }

  const passed = totalCount - failureCount - errorCount - skippedCount;
  return {
    total: totalCount,
    passed: Math.max(0, passed),
    failed: failureCount,
    skipped: skippedCount,
    errors: errorCount,
    durationMs: Math.round(durationMsSum),
    failures,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function loadXml(path: string, options: ParseVitestOptions): Promise<string> {
  if (options.contents !== undefined) return options.contents;
  try {
    const stat = await fs.stat(path);
    if (!stat.isFile()) {
      throw new ParseError(path, "path is not a file");
    }
    if (stat.size === 0) {
      throw new ParseError(path, "JUnit XML file is empty");
    }
  } catch (err) {
    if (err instanceof ParseError) throw err;
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ParseError(path, "JUnit XML file not found");
    }
    throw new ParseError(path, `stat failed: ${String(err)}`);
  }
  return fs.readFile(path, "utf8");
}

function asArray<T>(value: T | T[]): T[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function parseNumberAttr(value: string | undefined): number {
  if (value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

interface BuildFailureInput {
  suite: string;
  testName: string;
  raw: RawFailure;
  file: string | undefined;
}

function buildFailureDetail({ suite, testName, raw, file }: BuildFailureInput): VitestFailureDetail {
  const message = raw["@_message"] ?? "";
  const body = typeof raw === "string" ? raw : (raw["#text"] ?? "");
  const stack = body.trim();
  // fast-xml-parser collapses text-only elements to strings sometimes; normalize.
  const errorText = [message, stack].filter((s) => s && s.length > 0).join("\n").trim();

  const detail: VitestFailureDetail = {
    suite,
    test: testName,
    error: errorText || "(no message)",
  };
  if (stack) {
    detail.stack = stack;
  }
  if (file !== undefined && file !== "") {
    detail.file = file;
  }
  return detail;
}
