import { describe, expect, test } from "vitest";
import { runDiffAudit } from "./diff-audit.js";

describe("runDiffAudit — orchestration", () => {
  test("combines regex + AST + hardcoded-return violations", async () => {
    const diff = `diff --git a/src/auth/login.ts b/src/auth/login.ts
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1,1 +1,1 @@
-async function login() { return realAuth(); }
+async function login() { return { success: true }; }
diff --git a/src/auth/login.test.ts b/src/auth/login.test.ts
--- a/src/auth/login.test.ts
+++ b/src/auth/login.test.ts
@@ -1,3 +1,1 @@
-test('x', () => { expect(a).toBe(1); });
-test('y', () => { expect(b).toEqual({ n: 1 }); });
+test('x', () => { expect(a).toBeTruthy(); });
`;
    const fileContents = new Map([
      [
        "src/auth/login.test.ts",
        {
          before: `
            test('x', () => { expect(a).toBe(1); });
            test('y', () => { expect(b).toEqual({ n: 1 }); });
          `,
          after: `test('x', () => { expect(a).toBeTruthy(); });`,
        },
      ],
    ]);

    const result = await runDiffAudit({ diff, fileContents });
    expect(result.changedFiles).toContain("src/auth/login.ts");
    expect(result.changedFiles).toContain("src/auth/login.test.ts");

    // Hardcoded return finding
    const hc = result.warnings.find((v) => v.source === "hardcoded-return");
    expect(hc).toBeDefined();
    expect(hc?.patternId).toBe("HARDCODED_SUCCESS_RETURN");

    // AST: expect count decreased AND matcher weakened
    const ast = result.violations.filter((v) => v.source === "ast");
    const astIds = ast.map((v) => v.patternId);
    expect(astIds).toContain("NET_EXPECT_DECREASE");
    expect(astIds).toContain("MATCHER_WEAKENED");
  });

  test("AST layer skipped when no fileContents and no gitFileReader provided", async () => {
    const diff = `diff --git a/src/x.test.ts b/src/x.test.ts
--- a/src/x.test.ts
+++ b/src/x.test.ts
@@ -1,1 +1,1 @@
-expect(a).toBe(1);
+expect(a).toBeTruthy();
`;
    const result = await runDiffAudit({ diff });
    expect(result.astByFile.size).toBe(0);
  });

  test("gitFileReader is called when no fileContents provided", async () => {
    const diff = `diff --git a/src/x.test.ts b/src/x.test.ts
--- a/src/x.test.ts
+++ b/src/x.test.ts
@@ -1,1 +1,1 @@
-expect(a).toBe(1);
+expect(a).toBeTruthy();
`;
    let called = false;
    const result = await runDiffAudit({
      diff,
      gitFileReader: async () => {
        called = true;
        return {
          before: "test('x', () => expect(a).toBe(1));",
          after: "test('x', () => expect(a).toBeTruthy());",
        };
      },
    });
    expect(called).toBe(true);
    expect(result.astByFile.has("src/x.test.ts")).toBe(true);
    expect(
      result.violations.some((v) => v.patternId === "MATCHER_WEAKENED"),
    ).toBe(true);
  });

  test("gitFileReader errors surface as AST_READ_ERROR warnings", async () => {
    const diff = `diff --git a/src/x.test.ts b/src/x.test.ts
--- a/src/x.test.ts
+++ b/src/x.test.ts
@@ -1,1 +1,1 @@
-a
+b
`;
    const result = await runDiffAudit({
      diff,
      gitFileReader: async () => {
        throw new Error("unreachable");
      },
    });
    expect(
      result.warnings.some((w) => w.patternId === "AST_READ_ERROR"),
    ).toBe(true);
  });

  test("clean diff with legitimate changes produces no findings", async () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,1 +1,1 @@
-export const x = computeFromDb();
+export const x = computeFromDb(validated);
`;
    const result = await runDiffAudit({ diff });
    expect(result.violations).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("reports changedFiles list", async () => {
    const diff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,1 +1,1 @@
-x
+y
diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -1,1 +1,1 @@
-x
+y
`;
    const result = await runDiffAudit({ diff });
    expect(result.changedFiles).toEqual(["a.ts", "b.ts"]);
  });

  test("violations array has only reject severities", async () => {
    const diff = `diff --git a/src/x.test.ts b/src/x.test.ts
--- a/src/x.test.ts
+++ b/src/x.test.ts
@@ -1,1 +1,1 @@
-expect(a).toBe(1);
+test.skip('x', () => {});
`;
    const result = await runDiffAudit({ diff });
    expect(result.violations.every((v) => v.severity === "reject")).toBe(true);
    expect(result.warnings.every((w) => w.severity === "warn")).toBe(true);
  });
});
