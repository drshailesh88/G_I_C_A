/**
 * Regex-based anti-cheat patterns (blueprint Part 10.1).
 *
 * Every pattern has an `id`, a `severity` (reject|warn), and either a regex
 * or a `computed` function that takes the full diff text. Callers may also
 * scope a pattern to specific `paths` (checked against changed file paths).
 *
 * The `auditDiff()` function runs every pattern against a diff and returns
 * a list of violations. It parses the diff into per-file chunks so path
 * filters can apply correctly.
 *
 * Input format: standard unified `git diff` output. We inspect lines
 * beginning with `+` (added) and `-` (removed), not `+++`/`---` (which are
 * file-header markers).
 */
import type {
  AntiCheatPattern,
  AntiCheatViolation,
  Severity,
} from "../types.js";

// ─── Pattern definitions ──────────────────────────────────────────────────────

export interface ParsedFileChunk {
  path: string;
  status: "added" | "removed" | "modified" | "renamed";
  oldPath?: string;
  addedLines: Array<{ line: number; text: string }>;
  removedLines: Array<{ line: number; text: string }>;
  rawBody: string;
}

export interface ParsedDiff {
  files: ParsedFileChunk[];
}

export interface AuditContext {
  diff: string;
  parsed: ParsedDiff;
}

export type PatternComputedFn = (ctx: AuditContext) => PatternFinding[];

export interface PatternFinding {
  patternId: string;
  severity: Severity;
  file: string;
  line?: number;
  matchedContent?: string;
}

export interface RegexPattern {
  id: string;
  severity: Severity;
  description: string;
  /** Regex tested against each added line (for `+ scope`) or each removed
   * line (for `- scope`). Pattern ignored if `computed` is set. */
  regex?: RegExp;
  /** Which line scope to match against. */
  scope?: "added" | "removed";
  /** Only apply pattern to changed files whose path matches any of these. */
  paths?: string[];
  /** Custom computed function. Overrides regex if present. */
  computed?: PatternComputedFn;
}

// Individual pattern definitions — all from blueprint Part 10.1.

export const ANTI_CHEAT_PATTERNS: RegexPattern[] = [
  // ── Skip / disable ──
  {
    id: "SKIP_ADDED",
    severity: "reject",
    description: "Added .skip() to a test",
    regex: /\b(?:test|it|describe)\.skip\s*\(/,
    scope: "added",
    paths: [testFileSuffixRegex()],
  },
  {
    id: "ONLY_ADDED",
    severity: "reject",
    description: "Added .only() to a test",
    regex: /\b(?:test|it|describe)\.only\s*\(/,
    scope: "added",
    paths: [testFileSuffixRegex()],
  },
  {
    id: "TODO_ADDED",
    severity: "reject",
    description: "Added .todo() to a test",
    regex: /\b(?:test|it)\.todo\s*\(/,
    scope: "added",
    paths: [testFileSuffixRegex()],
  },
  {
    id: "XIT_ADDED",
    severity: "reject",
    description: "Added xit() to a test",
    regex: /^\s*xit\s*\(/,
    scope: "added",
    paths: [testFileSuffixRegex()],
  },
  {
    id: "XDESCRIBE_ADDED",
    severity: "reject",
    description: "Added xdescribe() to a test",
    regex: /^\s*xdescribe\s*\(/,
    scope: "added",
    paths: [testFileSuffixRegex()],
  },

  // ── Tautologies ──
  {
    id: "EXPECT_TRUE_TRUE",
    severity: "reject",
    description: "expect(true).toBe(true) is tautological",
    regex: /expect\(\s*true\s*\)\.toBe\(\s*true\s*\)/,
    scope: "added",
    paths: [testFileSuffixRegex()],
  },
  {
    id: "EXPECT_NUM_EQUALS_SELF",
    severity: "reject",
    description: "expect(N).toBe(N) is tautological",
    regex: /expect\(\s*(\d+)\s*\)\.toBe\(\s*\1\s*\)/,
    scope: "added",
    paths: [testFileSuffixRegex()],
  },
  {
    id: "NOT_TOTHROW_WEAKENED",
    severity: "warn",
    description: "Added .not.toThrow() without arg (weak assertion)",
    regex: /\.not\.toThrow\s*\(\s*\)/,
    scope: "added",
    paths: [testFileSuffixRegex()],
  },

  // ── Config widening ──
  {
    id: "COVERAGE_EXCLUDE_ADDED",
    severity: "reject",
    description: "Added an exclude/ignore entry in test or mutation config",
    regex: /(?:exclude|ignore|testPathIgnorePatterns)\s*[:=]/,
    scope: "added",
    paths: [
      escapeRegex("vitest.config.ts"),
      escapeRegex("vitest.config.mjs"),
      escapeRegex("vitest.config.js"),
      escapeRegex("stryker.conf.mjs"),
      escapeRegex("stryker.conf.json"),
    ],
  },
  {
    id: "THRESHOLD_LOWERED",
    severity: "reject",
    description: "A threshold value was lowered in vitest/stryker config",
    computed: detectThresholdLoweredComputed,
    paths: [
      escapeRegex("vitest.config.ts"),
      escapeRegex("vitest.config.mjs"),
      escapeRegex("stryker.conf.mjs"),
      escapeRegex("stryker.conf.json"),
    ],
  },

  // ── Mock abuse signals ──
  {
    id: "EXCESSIVE_MOCKING",
    severity: "warn",
    description: ">3 vi.mock() calls added in a single test file",
    computed: detectExcessiveMockingComputed,
    paths: [testFileSuffixRegex()],
  },
  {
    id: "MOCK_RETURNS_EXPECTED",
    severity: "warn",
    description:
      "mockReturnValue(X) where X matches an expect assertion in the same test (testing the mock)",
    computed: detectMockReturnsExpectedComputed,
    paths: [testFileSuffixRegex()],
  },

  // ── Snapshot laundering ──
  {
    id: "SNAPSHOT_UPDATED_WITHOUT_SRC_CHANGE",
    severity: "reject",
    description:
      "Snapshot file changed without matching change in src/app/lib/components",
    computed: detectSnapshotLaunderingComputed,
  },

  // ── Net assertion reduction ──
  {
    id: "EXPECT_REMOVED_NET",
    severity: "reject",
    description: "Net removal of expect() calls in a test file",
    computed: detectExpectRemovedNetComputed,
    paths: [testFileSuffixRegex()],
  },

  // ── Test file deletion ──
  {
    id: "TEST_FILE_DELETED",
    severity: "reject",
    description: "A test file was deleted",
    computed: detectTestFileDeletedComputed,
  },

  // ── Conditional logic in tests ──
  {
    id: "CONDITIONAL_TEST_LOGIC",
    severity: "warn",
    description:
      "if/else branching inside test body (tests should be deterministic)",
    computed: detectConditionalTestLogicComputed,
    paths: [testFileSuffixRegex()],
  },
];

// ─── Top-level audit function ─────────────────────────────────────────────────

export interface AuditResult {
  violations: PatternFinding[];
  warnings: PatternFinding[];
  patternsApplied: number;
}

export function auditDiff(diff: string): AuditResult {
  const parsed = parseUnifiedDiff(diff);
  const ctx: AuditContext = { diff, parsed };

  const violations: PatternFinding[] = [];
  const warnings: PatternFinding[] = [];

  for (const pattern of ANTI_CHEAT_PATTERNS) {
    const findings = runPattern(pattern, ctx);
    for (const f of findings) {
      (f.severity === "reject" ? violations : warnings).push(f);
    }
  }

  return {
    violations,
    warnings,
    patternsApplied: ANTI_CHEAT_PATTERNS.length,
  };
}

/**
 * Convert a PatternFinding into the AntiCheatViolation shape stored in
 * violations.jsonl.
 */
export function findingToViolation(
  finding: PatternFinding,
  detectedAt: string,
): AntiCheatViolation {
  return {
    pattern_id: finding.patternId,
    severity: finding.severity,
    file: finding.file,
    ...(finding.line !== undefined ? { line: finding.line } : {}),
    ...(finding.matchedContent !== undefined
      ? { matched_content: finding.matchedContent }
      : {}),
    detected_at: detectedAt,
  };
}

// ─── Pattern runner ───────────────────────────────────────────────────────────

function runPattern(pattern: RegexPattern, ctx: AuditContext): PatternFinding[] {
  if (pattern.computed) {
    const findings = pattern.computed(ctx);
    // Ensure severity/patternId are set consistently.
    return findings.map((f) => ({
      ...f,
      patternId: f.patternId || pattern.id,
      severity: f.severity || pattern.severity,
    }));
  }

  if (!pattern.regex) return [];

  const findings: PatternFinding[] = [];
  for (const file of ctx.parsed.files) {
    if (pattern.paths && !pathMatchesAny(file.path, pattern.paths)) continue;
    const lines =
      pattern.scope === "removed" ? file.removedLines : file.addedLines;
    for (const { line, text } of lines) {
      if (pattern.regex.test(text)) {
        findings.push({
          patternId: pattern.id,
          severity: pattern.severity,
          file: file.path,
          line,
          matchedContent: text.trim().slice(0, 200),
        });
      }
    }
  }
  return findings;
}

// ─── Computed pattern implementations ─────────────────────────────────────────

function detectExpectRemovedNetComputed(ctx: AuditContext): PatternFinding[] {
  const results: PatternFinding[] = [];
  for (const file of ctx.parsed.files) {
    if (!isTestFile(file.path)) continue;
    const added = countInLines(file.addedLines, /\bexpect\s*\(/g);
    const removed = countInLines(file.removedLines, /\bexpect\s*\(/g);
    if (removed > added) {
      results.push({
        patternId: "EXPECT_REMOVED_NET",
        severity: "reject",
        file: file.path,
        matchedContent: `net expect() delta: removed=${removed}, added=${added}`,
      });
    }
  }
  return results;
}

function detectExcessiveMockingComputed(ctx: AuditContext): PatternFinding[] {
  const results: PatternFinding[] = [];
  for (const file of ctx.parsed.files) {
    if (!isTestFile(file.path)) continue;
    const count = countInLines(file.addedLines, /\bvi\.mock\s*\(/g);
    if (count > 3) {
      results.push({
        patternId: "EXCESSIVE_MOCKING",
        severity: "warn",
        file: file.path,
        matchedContent: `${count} vi.mock() calls added`,
      });
    }
  }
  return results;
}

/**
 * Detect `mockReturnValue(X)` or `mockResolvedValue(X)` where X appears
 * literally as an argument to expect/toBe/toEqual in added lines of the
 * same file. Flags "testing the mock" pattern.
 */
function detectMockReturnsExpectedComputed(ctx: AuditContext): PatternFinding[] {
  const results: PatternFinding[] = [];
  for (const file of ctx.parsed.files) {
    if (!isTestFile(file.path)) continue;
    const addedText = file.addedLines.map((l) => l.text).join("\n");

    // Extract mockReturnValue(...) / mockResolvedValue(...) args.
    const mockArgs: string[] = [];
    const mockPattern =
      /mock(?:Return|Resolved|Rejected)Value(?:Once)?\(\s*([^)]+?)\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = mockPattern.exec(addedText)) !== null) {
      mockArgs.push(m[1]!.trim());
    }
    if (mockArgs.length === 0) continue;

    // Look for expect(...).toBe(X) / toEqual(X) where X matches a mock arg.
    const exprPattern = /\.(?:toBe|toEqual|toStrictEqual)\(\s*([^)]+?)\s*\)/g;
    let e: RegExpExecArray | null;
    while ((e = exprPattern.exec(addedText)) !== null) {
      const asserted = e[1]!.trim();
      if (
        mockArgs.some((a) => a === asserted && a.length > 0 && a !== "undefined")
      ) {
        results.push({
          patternId: "MOCK_RETURNS_EXPECTED",
          severity: "warn",
          file: file.path,
          matchedContent: `mock return value "${asserted}" also used in assertion`,
        });
        break; // one finding per file
      }
    }
  }
  return results;
}

function detectSnapshotLaunderingComputed(ctx: AuditContext): PatternFinding[] {
  const snapshotFiles = ctx.parsed.files.filter(
    (f) =>
      f.path.includes("__snapshots__") ||
      f.path.endsWith(".snap") ||
      f.path.includes("-snapshots/"),
  );
  if (snapshotFiles.length === 0) return [];

  const srcChanged = ctx.parsed.files.some(
    (f) =>
      (f.path.startsWith("src/") ||
        f.path.startsWith("app/") ||
        f.path.startsWith("components/") ||
        f.path.startsWith("lib/")) &&
      !f.path.includes("__snapshots__"),
  );
  if (srcChanged) return [];

  return snapshotFiles.map((f) => ({
    patternId: "SNAPSHOT_UPDATED_WITHOUT_SRC_CHANGE",
    severity: "reject" as const,
    file: f.path,
    matchedContent: "snapshot changed without matching src/app/components/lib change",
  }));
}

function detectTestFileDeletedComputed(ctx: AuditContext): PatternFinding[] {
  const results: PatternFinding[] = [];
  for (const file of ctx.parsed.files) {
    if (file.status !== "removed") continue;
    if (!isTestFile(file.path)) continue;
    results.push({
      patternId: "TEST_FILE_DELETED",
      severity: "reject",
      file: file.path,
      matchedContent: "test file deleted",
    });
  }
  return results;
}

function detectConditionalTestLogicComputed(ctx: AuditContext): PatternFinding[] {
  const results: PatternFinding[] = [];
  const IF_IN_TEST = /^\s*if\s*\(/;
  for (const file of ctx.parsed.files) {
    if (!isTestFile(file.path)) continue;
    for (const { line, text } of file.addedLines) {
      if (IF_IN_TEST.test(text)) {
        results.push({
          patternId: "CONDITIONAL_TEST_LOGIC",
          severity: "warn",
          file: file.path,
          line,
          matchedContent: text.trim().slice(0, 200),
        });
      }
    }
  }
  return results;
}

function detectThresholdLoweredComputed(ctx: AuditContext): PatternFinding[] {
  const results: PatternFinding[] = [];
  // Look for a removed line with "threshold" plus a number, and a paired
  // added line with a LOWER number for the same key.
  const NUMERIC_THRESHOLD = /(\w+)\s*[:=]\s*(\d+(?:\.\d+)?)/;
  for (const file of ctx.parsed.files) {
    if (!isConfigFile(file.path)) continue;
    for (const removed of file.removedLines) {
      if (!/threshold|high|low|break|mutationScore|statements|branches|functions|lines/i.test(removed.text)) continue;
      const mRemoved = NUMERIC_THRESHOLD.exec(removed.text);
      if (!mRemoved) continue;
      const key = mRemoved[1];
      const removedValue = Number(mRemoved[2]);
      for (const added of file.addedLines) {
        if (!added.text.includes(key!)) continue;
        const mAdded = NUMERIC_THRESHOLD.exec(added.text);
        if (!mAdded) continue;
        const addedValue = Number(mAdded[2]);
        if (addedValue < removedValue) {
          results.push({
            patternId: "THRESHOLD_LOWERED",
            severity: "reject",
            file: file.path,
            line: added.line,
            matchedContent: `${key}: ${removedValue} → ${addedValue}`,
          });
          break;
        }
      }
    }
  }
  return results;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countInLines(
  lines: Array<{ text: string }>,
  pattern: RegExp,
): number {
  let count = 0;
  for (const { text } of lines) {
    const matches = text.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"));
    if (matches) count += matches.length;
  }
  return count;
}

function pathMatchesAny(path: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    try {
      if (new RegExp(pattern).test(path)) return true;
    } catch {
      // Fallback to literal suffix match.
      if (path.endsWith(pattern)) return true;
    }
  }
  return false;
}

function isTestFile(path: string): boolean {
  return /\.(test|spec)\.(js|ts|jsx|tsx|mjs|cjs)$/.test(path) || path.includes("/e2e/");
}

function isConfigFile(path: string): boolean {
  return (
    /vitest\.config\.(ts|js|mjs|cjs)$/.test(path) ||
    /stryker\.conf\.(mjs|json|js)$/.test(path) ||
    path.endsWith("playwright.config.ts") ||
    path.endsWith("eslint.config.mjs") ||
    path.endsWith("tsconfig.json")
  );
}

function testFileSuffixRegex(): string {
  return "\\.(?:test|spec)\\.(?:js|ts|jsx|tsx|mjs|cjs)$|/e2e/.*\\.spec\\.(?:ts|js)$";
}

function escapeRegex(s: string): string {
  return "^" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
}

// ─── Unified diff parser ──────────────────────────────────────────────────────

/**
 * Minimal unified-diff parser. Handles the common git diff format:
 *
 *   diff --git a/<old> b/<new>
 *   [index ...]
 *   [--- a/<old>]
 *   [+++ b/<new>]
 *   @@ -<a>,<b> +<c>,<d> @@
 *   context or +added or -removed lines...
 *
 * For each file, tracks status (added/removed/modified/renamed), added
 * lines with their NEW line numbers, removed lines with their OLD line
 * numbers.
 */
export function parseUnifiedDiff(diff: string): ParsedDiff {
  const lines = diff.split("\n");
  const files: ParsedFileChunk[] = [];

  let current: ParsedFileChunk | null = null;
  let newLineNum = 0;
  let oldLineNum = 0;
  let isDeleted = false;
  let isNew = false;

  function finalize(): void {
    if (current) {
      if (isDeleted) current.status = "removed";
      else if (isNew) current.status = "added";
      files.push(current);
    }
  }

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      finalize();
      const match = /diff --git a\/(.+) b\/(.+)/.exec(line);
      const path = match ? match[2]! : "<unknown>";
      current = {
        path,
        status: "modified",
        addedLines: [],
        removedLines: [],
        rawBody: "",
      };
      isDeleted = false;
      isNew = false;
      newLineNum = 0;
      oldLineNum = 0;
      continue;
    }
    if (!current) continue;
    current.rawBody += line + "\n";

    if (line.startsWith("deleted file mode")) {
      isDeleted = true;
      continue;
    }
    if (line.startsWith("new file mode")) {
      isNew = true;
      continue;
    }
    if (line.startsWith("rename from ")) {
      current.oldPath = line.replace("rename from ", "").trim();
      current.status = "renamed";
      continue;
    }
    if (line.startsWith("@@")) {
      const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match) {
        oldLineNum = Number(match[1]);
        newLineNum = Number(match[2]);
      }
      continue;
    }
    if (line.startsWith("---") || line.startsWith("+++")) continue;

    if (line.startsWith("+")) {
      current.addedLines.push({ line: newLineNum, text: line.slice(1) });
      newLineNum++;
    } else if (line.startsWith("-")) {
      current.removedLines.push({ line: oldLineNum, text: line.slice(1) });
      oldLineNum++;
    } else {
      // context line (starts with space or is empty)
      if (newLineNum > 0) newLineNum++;
      if (oldLineNum > 0) oldLineNum++;
    }
  }
  finalize();

  return { files };
}
