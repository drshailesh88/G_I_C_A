/**
 * Hardcoded success-return detector (blueprint 10.1 HARDCODED_SUCCESS_RETURN).
 *
 * Scans ADDED lines in `src/**` and `app/**` paths for `return { success: true }`
 * style patterns. These often indicate an agent faked a feature's return value
 * to pass a failing test rather than implementing the real behavior.
 *
 * Severity is `warn` because the pattern CAN be legitimate (a stub in a test
 * fixture, or the actual correct return in trivial services). The diff-audit
 * orchestrator logs these but does not revert automatically.
 */
import { parseUnifiedDiff, type PatternFinding } from "./regex-patterns.js";

export const HARDCODED_RETURN_PATTERN_ID = "HARDCODED_SUCCESS_RETURN";

export const TRUTHY_KEY_NAMES = [
  "success",
  "authenticated",
  "valid",
  "ok",
  "authorized",
  "enabled",
  "allowed",
  "active",
  "verified",
] as const;

const TRUTHY_OBJECT_PATTERN = new RegExp(
  `return\\s*\\{\\s*(?:${TRUTHY_KEY_NAMES.join("|")})\\s*:\\s*true`,
);

const TRIVIAL_BOOLEAN_RETURN = /return\s+true\s*;?\s*$/;

const SOURCE_PATH_PATTERN = /^(?:src|app|components|lib|pages)\//;

export function detectHardcodedReturns(diff: string): PatternFinding[] {
  const parsed = parseUnifiedDiff(diff);
  const findings: PatternFinding[] = [];

  for (const file of parsed.files) {
    if (!SOURCE_PATH_PATTERN.test(file.path)) continue;
    // Exclude test files even if they live under src/ (rare but possible)
    if (/\.(test|spec)\.(js|ts|jsx|tsx)$/.test(file.path)) continue;

    for (const { line, text } of file.addedLines) {
      if (TRUTHY_OBJECT_PATTERN.test(text)) {
        findings.push({
          patternId: HARDCODED_RETURN_PATTERN_ID,
          severity: "warn",
          file: file.path,
          line,
          matchedContent: text.trim().slice(0, 200),
        });
        continue;
      }
      // Trivial `return true` in an isolated function body is suspicious but
      // VERY noisy. Only flag when the line also contains `function` keyword
      // or arrow → to raise signal.
      if (
        TRIVIAL_BOOLEAN_RETURN.test(text) &&
        /(?:=>|function)/.test(file.rawBody.substring(0, file.rawBody.indexOf(text) + text.length))
      ) {
        // Heuristic is soft — only flag when we see the return appearing
        // RIGHT after an arrow `=>` or `function () {` opener in the same
        // added hunk. This limits false positives but keeps the signal.
        const nearby =
          file.addedLines
            .filter((l) => Math.abs(l.line - line) <= 2)
            .map((l) => l.text)
            .join("\n");
        if (/(?:=>|function\s*\([^)]*\)\s*\{)/.test(nearby)) {
          findings.push({
            patternId: HARDCODED_RETURN_PATTERN_ID,
            severity: "warn",
            file: file.path,
            line,
            matchedContent: text.trim().slice(0, 200),
          });
        }
      }
    }
  }

  return findings;
}
