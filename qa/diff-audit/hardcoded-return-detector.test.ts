import { describe, expect, test } from "vitest";
import {
  detectHardcodedReturns,
  HARDCODED_RETURN_PATTERN_ID,
} from "./hardcoded-return-detector.js";

describe("detectHardcodedReturns", () => {
  test("flags return { success: true } in src/", () => {
    const diff = `diff --git a/src/auth/login.ts b/src/auth/login.ts
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1,1 +1,1 @@
-async function login() { return await realAuth(); }
+async function login() { return { success: true }; }
`;
    const findings = detectHardcodedReturns(diff);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.patternId).toBe(HARDCODED_RETURN_PATTERN_ID);
    expect(findings[0]?.severity).toBe("warn");
    expect(findings[0]?.file).toBe("src/auth/login.ts");
  });

  test("flags various truthy key names", () => {
    const diff = `diff --git a/app/api/auth.ts b/app/api/auth.ts
--- a/app/api/auth.ts
+++ b/app/api/auth.ts
@@ -1,0 +1,4 @@
+return { authenticated: true };
+return { valid: true };
+return { ok: true };
+return { allowed: true };
`;
    const findings = detectHardcodedReturns(diff);
    expect(findings.length).toBeGreaterThanOrEqual(4);
    expect(
      findings.every((f) => f.patternId === HARDCODED_RETURN_PATTERN_ID),
    ).toBe(true);
  });

  test("does not flag in test files", () => {
    const diff = `diff --git a/src/auth/login.test.ts b/src/auth/login.test.ts
--- a/src/auth/login.test.ts
+++ b/src/auth/login.test.ts
@@ -1,0 +1,1 @@
+mockLogin.mockReturnValue({ success: true });
`;
    expect(detectHardcodedReturns(diff)).toHaveLength(0);
  });

  test("does not flag outside src/app/lib/components/pages", () => {
    const diff = `diff --git a/scripts/seed.ts b/scripts/seed.ts
--- a/scripts/seed.ts
+++ b/scripts/seed.ts
@@ -1,0 +1,1 @@
+return { success: true };
`;
    expect(detectHardcodedReturns(diff)).toHaveLength(0);
  });

  test("does not flag false values", () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,0 +1,1 @@
+return { success: false };
`;
    expect(detectHardcodedReturns(diff)).toHaveLength(0);
  });

  test("flags arrow return { ok: true }", () => {
    const diff = `diff --git a/src/handler.ts b/src/handler.ts
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -1,1 +1,1 @@
-export const handler = () => real();
+export const handler = () => { return { ok: true } };
`;
    expect(detectHardcodedReturns(diff).length).toBeGreaterThanOrEqual(1);
  });

  test("includes matched content snippet", () => {
    const diff = `diff --git a/src/x.ts b/src/x.ts
--- a/src/x.ts
+++ b/src/x.ts
@@ -1,1 +1,1 @@
-const x = 1;
+return { success: true };
`;
    const findings = detectHardcodedReturns(diff);
    expect(findings[0]?.matchedContent).toContain("success");
  });
});
