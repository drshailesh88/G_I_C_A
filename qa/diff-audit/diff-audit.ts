/**
 * Top-level diff-audit orchestrator.
 *
 * Combines three layers of anti-cheat analysis:
 *   1. Regex patterns (diff-audit/regex-patterns.ts)
 *   2. AST assertion analysis (diff-audit/ast-assertion-analyzer.ts) —
 *      requires before/after source for each changed TEST file.
 *   3. Hardcoded success-return detection (diff-audit/hardcoded-return-detector.ts)
 *
 * Returns a unified `DiffAuditResult` that the controller consumes for
 * Layer-3 diff-rejection + feeding violations into the next repair packet.
 *
 * Design note: the orchestrator does NOT call git itself. The caller
 * (controller in Phase 3) reads before/after content via a GitFileReader
 * and passes it in as `fileContents`. This keeps the orchestrator pure
 * and testable.
 */
import { auditDiff, parseUnifiedDiff, type PatternFinding } from "./regex-patterns.js";
import {
  analyzeTestFileChange,
  type ASTAuditResult,
} from "./ast-assertion-analyzer.js";
import { detectHardcodedReturns } from "./hardcoded-return-detector.js";
import type { Severity } from "../types.js";

export interface DiffAuditFinding {
  source: "regex" | "ast" | "hardcoded-return";
  patternId: string;
  severity: Severity;
  file: string;
  line?: number;
  message?: string;
}

export interface DiffAuditResult {
  violations: DiffAuditFinding[];
  warnings: DiffAuditFinding[];
  astByFile: Map<string, ASTAuditResult>;
  changedFiles: string[];
  patternsApplied: number;
}

/**
 * Caller-supplied function that returns the before + after contents of a
 * changed file. Implementations typically call:
 *   - `git show HEAD:<path>` for `before` (empty for new files)
 *   - fs.readFile of the working tree for `after` (empty for deleted files)
 */
export type GitFileReader = (
  path: string,
) => Promise<{ before: string; after: string }>;

export interface DiffAuditInput {
  diff: string;
  /**
   * Provide per-file before/after content for AST analysis. Only TEST files
   * are inspected by the AST analyzer; source files are covered by the other
   * layers.
   */
  fileContents?: Map<string, { before: string; after: string }>;
  /** Alternative — let the orchestrator fetch each changed test file lazily. */
  gitFileReader?: GitFileReader;
}

export async function runDiffAudit(
  input: DiffAuditInput,
): Promise<DiffAuditResult> {
  const parsed = parseUnifiedDiff(input.diff);
  const changedFiles = parsed.files.map((f) => f.path);

  // Layer 1: regex
  const regexResult = auditDiff(input.diff);
  const regexFindings: DiffAuditFinding[] = [
    ...regexResult.violations.map((f) => regexToFinding(f, "regex")),
    ...regexResult.warnings.map((f) => regexToFinding(f, "regex")),
  ];

  // Layer 2: hardcoded-return (treated as its own source for clarity)
  const hcFindings = detectHardcodedReturns(input.diff).map((f) =>
    regexToFinding(f, "hardcoded-return"),
  );

  // Layer 3: AST assertion analysis — only on test files, requires before+after.
  const astByFile = new Map<string, ASTAuditResult>();
  const astFindings: DiffAuditFinding[] = [];

  const testFiles = parsed.files.filter((f) =>
    /\.(test|spec)\.(js|ts|jsx|tsx)$/.test(f.path) || f.path.includes("/e2e/"),
  );

  for (const file of testFiles) {
    let before = "";
    let after = "";
    const cached = input.fileContents?.get(file.path);
    if (cached) {
      before = cached.before;
      after = cached.after;
    } else if (input.gitFileReader) {
      try {
        const c = await input.gitFileReader(file.path);
        before = c.before;
        after = c.after;
      } catch (err) {
        astFindings.push({
          source: "ast",
          patternId: "AST_READ_ERROR",
          severity: "warn",
          file: file.path,
          message: `failed to read file contents: ${(err as Error).message}`,
        });
        continue;
      }
    } else {
      // No content source — AST layer silently skips this file.
      continue;
    }

    const astResult = analyzeTestFileChange(before, after);
    astByFile.set(file.path, astResult);

    for (const finding of astResult.findings) {
      astFindings.push({
        source: "ast",
        patternId: finding.patternId,
        severity: finding.severity,
        file: file.path,
        ...(finding.line !== undefined ? { line: finding.line } : {}),
        message: finding.message,
      });
    }

    if (astResult.parseError) {
      astFindings.push({
        source: "ast",
        patternId: "AST_PARSE_ERROR",
        severity: "warn",
        file: file.path,
        message: `parse error (${astResult.parseError.phase}): ${astResult.parseError.message}`,
      });
    }
  }

  const allFindings = [...regexFindings, ...hcFindings, ...astFindings];
  const violations = allFindings.filter((f) => f.severity === "reject");
  const warnings = allFindings.filter((f) => f.severity === "warn");

  return {
    violations,
    warnings,
    astByFile,
    changedFiles,
    patternsApplied:
      regexResult.patternsApplied + 1 /* hardcoded-return */ + (testFiles.length > 0 ? 1 : 0),
  };
}

function regexToFinding(
  f: PatternFinding,
  source: DiffAuditFinding["source"],
): DiffAuditFinding {
  return {
    source,
    patternId: f.patternId,
    severity: f.severity,
    file: f.file,
    ...(f.line !== undefined ? { line: f.line } : {}),
    ...(f.matchedContent !== undefined ? { message: f.matchedContent } : {}),
  };
}
