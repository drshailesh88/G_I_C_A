/**
 * AST-based assertion-strength analyzer (blueprint 10A-γ).
 *
 * Parses before and after versions of a test file with @babel/parser and
 * computes three signals that pure regex cannot reliably detect:
 *
 *   1. NET_EXPECT_DECREASE — the after version has FEWER expect() calls.
 *   2. MATCHER_WEAKENED — the after version replaces a specific matcher
 *      (toBe / toEqual / toStrictEqual / toMatchObject / toContain /
 *      toHaveProperty / toHaveBeenCalledWith / toThrow-with-arg) with a
 *      weak one (toBeTruthy / toBeFalsy / toBeDefined / toBeUndefined /
 *      toBeNull / not.toThrow() / not.toBeNull).
 *   3. CONDITIONAL_TEST_LOGIC — an if/else or ternary appears inside a
 *      test()/it() callback body.
 *
 * This analyzer ONLY inspects a single file's before/after. The diff-audit
 * orchestrator is responsible for reading both versions from git (current
 * working tree for after, `git show HEAD:<path>` for before) and calling
 * analyzeTestFileChange for each.
 */
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import type { File, Node } from "@babel/types";
import type { Severity } from "../types.js";

// @babel/traverse ships a CJS default export that confuses ESM consumers.
const traverse: typeof traverseModule =
  (traverseModule as unknown as { default?: typeof traverseModule }).default ??
  traverseModule;

// ─── Matcher classification ───────────────────────────────────────────────────

const STRONG_MATCHERS = new Set([
  "toBe",
  "toEqual",
  "toStrictEqual",
  "toMatchObject",
  "toMatch",
  "toContain",
  "toHaveProperty",
  "toHaveBeenCalledWith",
  "toHaveBeenNthCalledWith",
  "toHaveBeenLastCalledWith",
  "toMatchInlineSnapshot",
  "toMatchSnapshot",
  "toThrowError",
  "toContainEqual",
  "toHaveLength",
  "toHaveClass",
  "toHaveAttribute",
]);

const WEAK_MATCHERS = new Set([
  "toBeTruthy",
  "toBeFalsy",
  "toBeDefined",
  "toBeUndefined",
  "toBeNull",
  "toBeNaN",
]);

// ─── Result shape ────────────────────────────────────────────────────────────

export interface ASTAuditFinding {
  patternId: string;
  severity: Severity;
  line?: number;
  message: string;
}

export interface ASTAuditResult {
  expectCountBefore: number;
  expectCountAfter: number;
  strongMatchersBefore: number;
  strongMatchersAfter: number;
  weakMatchersBefore: number;
  weakMatchersAfter: number;
  conditionalsInTestsAfter: Array<{ line: number; kind: string }>;
  findings: ASTAuditFinding[];
  parseError?: { phase: "before" | "after"; message: string };
}

// ─── Main entry point ────────────────────────────────────────────────────────

export function analyzeTestFileChange(
  beforeContent: string,
  afterContent: string,
): ASTAuditResult {
  const result: ASTAuditResult = {
    expectCountBefore: 0,
    expectCountAfter: 0,
    strongMatchersBefore: 0,
    strongMatchersAfter: 0,
    weakMatchersBefore: 0,
    weakMatchersAfter: 0,
    conditionalsInTestsAfter: [],
    findings: [],
  };

  let beforeAst: File | null = null;
  let afterAst: File | null = null;

  // Allow either side to fail parsing independently — an all-new file has no
  // before content; a deleted file has no after content. The analyzer falls
  // back to zeroes for the missing side.
  try {
    if (beforeContent.trim() !== "") {
      beforeAst = parseSource(beforeContent);
    }
  } catch (err) {
    result.parseError = {
      phase: "before",
      message: (err as Error).message,
    };
  }
  try {
    if (afterContent.trim() !== "") {
      afterAst = parseSource(afterContent);
    }
  } catch (err) {
    result.parseError = {
      phase: "after",
      message: (err as Error).message,
    };
  }

  if (beforeAst) {
    const beforeStats = collectStats(beforeAst);
    result.expectCountBefore = beforeStats.expectCount;
    result.strongMatchersBefore = beforeStats.strongMatchers;
    result.weakMatchersBefore = beforeStats.weakMatchers;
  }
  if (afterAst) {
    const afterStats = collectStats(afterAst);
    result.expectCountAfter = afterStats.expectCount;
    result.strongMatchersAfter = afterStats.strongMatchers;
    result.weakMatchersAfter = afterStats.weakMatchers;
    result.conditionalsInTestsAfter = afterStats.conditionalsInTests;
  }

  // Findings.
  if (result.expectCountAfter < result.expectCountBefore) {
    result.findings.push({
      patternId: "NET_EXPECT_DECREASE",
      severity: "reject",
      message: `expect() calls dropped from ${result.expectCountBefore} to ${result.expectCountAfter}`,
    });
  }

  const strongDelta = result.strongMatchersAfter - result.strongMatchersBefore;
  const weakDelta = result.weakMatchersAfter - result.weakMatchersBefore;
  if (strongDelta < 0 && weakDelta > 0) {
    result.findings.push({
      patternId: "MATCHER_WEAKENED",
      severity: "reject",
      message: `specific matchers decreased by ${-strongDelta}, weak matchers increased by ${weakDelta} — likely substitution`,
    });
  }

  for (const cond of result.conditionalsInTestsAfter) {
    result.findings.push({
      patternId: "CONDITIONAL_TEST_LOGIC",
      severity: "warn",
      line: cond.line,
      message: `${cond.kind} inside test body — tests should be deterministic`,
    });
  }

  return result;
}

// ─── AST walker ──────────────────────────────────────────────────────────────

interface FileStats {
  expectCount: number;
  strongMatchers: number;
  weakMatchers: number;
  conditionalsInTests: Array<{ line: number; kind: string }>;
}

function collectStats(ast: File): FileStats {
  const stats: FileStats = {
    expectCount: 0,
    strongMatchers: 0,
    weakMatchers: 0,
    conditionalsInTests: [],
  };

  let testDepth = 0;

  traverse(ast, {
    CallExpression(path) {
      const { node } = path;
      const callee = node.callee;

      // expect(...) — may include member chain: expect(x).toBe(y)
      if (callee.type === "Identifier" && callee.name === "expect") {
        stats.expectCount++;
      }

      // Matcher calls: expect(x).toBe(y) or expect(x).not.toBe(y)
      if (callee.type === "MemberExpression") {
        const propertyName = extractPropertyName(callee.property);
        if (propertyName) {
          // Only count matchers that are chained off expect(...) or
          // expect(...).not or expect(...).resolves etc.
          if (isExpectChain(callee.object)) {
            if (propertyName === "toThrow") {
              // toThrow() with no arg = weak, toThrow(X) = strong
              if (node.arguments.length === 0) {
                stats.weakMatchers++;
              } else {
                stats.strongMatchers++;
              }
            } else if (STRONG_MATCHERS.has(propertyName)) {
              stats.strongMatchers++;
            } else if (WEAK_MATCHERS.has(propertyName)) {
              stats.weakMatchers++;
            }
          }
        }
      }

      // Track test/it/describe depth for conditional detection.
      if (callee.type === "Identifier" || callee.type === "MemberExpression") {
        if (isTestLikeCall(node)) {
          testDepth++;
          path.traverse({
            enter: (childPath) => {
              const child = childPath.node;
              if (
                (child.type === "IfStatement" ||
                  child.type === "ConditionalExpression") &&
                testDepth > 0
              ) {
                stats.conditionalsInTests.push({
                  line: child.loc?.start.line ?? 0,
                  kind:
                    child.type === "IfStatement"
                      ? "if/else"
                      : "ternary",
                });
              }
            },
          });
          testDepth--;
        }
      }
    },
  });

  return stats;
}

function parseSource(code: string): File {
  return parse(code, {
    sourceType: "module",
    plugins: [
      "typescript",
      "jsx",
      "decorators-legacy",
      "importAssertions",
      "topLevelAwait",
    ],
    errorRecovery: true,
  });
}

function extractPropertyName(node: Node): string | null {
  if (node.type === "Identifier") return node.name;
  if (node.type === "StringLiteral") return node.value;
  return null;
}

function isExpectChain(node: Node): boolean {
  if (node.type === "CallExpression") {
    if (node.callee.type === "Identifier" && node.callee.name === "expect") {
      return true;
    }
    // e.g. expect(x).not
    return isExpectChain(node.callee);
  }
  if (node.type === "MemberExpression") {
    return isExpectChain(node.object);
  }
  return false;
}

function isTestLikeCall(node: {
  callee: Node;
}): boolean {
  const callee = node.callee;
  if (callee.type === "Identifier") {
    return ["test", "it", "describe"].includes(callee.name);
  }
  if (callee.type === "MemberExpression") {
    const object = callee.object;
    if (object.type === "Identifier") {
      return ["test", "it", "describe"].includes(object.name);
    }
  }
  return false;
}
