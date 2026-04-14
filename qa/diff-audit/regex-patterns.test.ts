import { describe, expect, test } from "vitest";
import {
  ANTI_CHEAT_PATTERNS,
  auditDiff,
  findingToViolation,
  parseUnifiedDiff,
} from "./regex-patterns.js";

// ─── parseUnifiedDiff ────────────────────────────────────────────────────────

describe("parseUnifiedDiff", () => {
  test("parses simple modification", () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
index abc..def 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,3 @@
 existing
-old
+new
`;
    const r = parseUnifiedDiff(diff);
    expect(r.files).toHaveLength(1);
    const file = r.files[0]!;
    expect(file.path).toBe("src/foo.ts");
    expect(file.status).toBe("modified");
    expect(file.addedLines).toEqual([{ line: 2, text: "new" }]);
    expect(file.removedLines).toEqual([{ line: 2, text: "old" }]);
  });

  test("recognizes new file", () => {
    const diff = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+line1
+line2
`;
    const r = parseUnifiedDiff(diff);
    expect(r.files[0]?.status).toBe("added");
  });

  test("recognizes deleted file", () => {
    const diff = `diff --git a/old.test.ts b/old.test.ts
deleted file mode 100644
--- a/old.test.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-gone
-gone2
`;
    const r = parseUnifiedDiff(diff);
    expect(r.files[0]?.status).toBe("removed");
    expect(r.files[0]?.path).toBe("old.test.ts");
  });

  test("handles multiple files in one diff", () => {
    const diff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,1 +1,1 @@
-a
+A
diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -1,1 +1,1 @@
-b
+B
`;
    const r = parseUnifiedDiff(diff);
    expect(r.files).toHaveLength(2);
    expect(r.files.map((f) => f.path)).toEqual(["a.ts", "b.ts"]);
  });
});

// ─── Pattern registry sanity ─────────────────────────────────────────────────

describe("pattern registry", () => {
  test("has stable ids", () => {
    const ids = ANTI_CHEAT_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length); // no dupes
    expect(ids).toContain("SKIP_ADDED");
    expect(ids).toContain("ONLY_ADDED");
    expect(ids).toContain("MOCK_RETURNS_EXPECTED");
    expect(ids).toContain("CONDITIONAL_TEST_LOGIC");
  });
});

// ─── auditDiff — skip / only / todo ──────────────────────────────────────────

describe("auditDiff — skip/only/todo/xit/xdescribe", () => {
  test("flags SKIP_ADDED", () => {
    const diff = `diff --git a/src/foo.test.ts b/src/foo.test.ts
--- a/src/foo.test.ts
+++ b/src/foo.test.ts
@@ -1,1 +1,1 @@
-test('works', () => {});
+test.skip('works', () => {});
`;
    const r = auditDiff(diff);
    const ids = r.violations.map((v) => v.patternId);
    expect(ids).toContain("SKIP_ADDED");
  });

  test("flags ONLY_ADDED", () => {
    const diff = `diff --git a/a.test.ts b/a.test.ts
--- a/a.test.ts
+++ b/a.test.ts
@@ -1,1 +1,1 @@
-test('x', () => {});
+test.only('x', () => {});
`;
    expect(auditDiff(diff).violations.map((v) => v.patternId)).toContain(
      "ONLY_ADDED",
    );
  });

  test("flags TODO_ADDED", () => {
    const diff = `diff --git a/a.test.ts b/a.test.ts
--- a/a.test.ts
+++ b/a.test.ts
@@ -1,1 +1,1 @@
-test('x', () => {});
+test.todo('finish later');
`;
    expect(auditDiff(diff).violations.map((v) => v.patternId)).toContain(
      "TODO_ADDED",
    );
  });

  test("flags xit and xdescribe", () => {
    const diff = `diff --git a/a.test.ts b/a.test.ts
--- a/a.test.ts
+++ b/a.test.ts
@@ -1,2 +1,2 @@
-describe('x', () => {});
-it('y', () => {});
+xdescribe('x', () => {});
+xit('y', () => {});
`;
    const ids = auditDiff(diff).violations.map((v) => v.patternId);
    expect(ids).toContain("XIT_ADDED");
    expect(ids).toContain("XDESCRIBE_ADDED");
  });

  test("does NOT flag .skip in non-test files", () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,1 +1,1 @@
-const s = "";
+const s = "test.skip(ignore)";
`;
    const ids = auditDiff(diff).violations.map((v) => v.patternId);
    expect(ids).not.toContain("SKIP_ADDED");
  });
});

describe("auditDiff — tautologies", () => {
  test("flags expect(true).toBe(true)", () => {
    const diff = `diff --git a/a.test.ts b/a.test.ts
--- a/a.test.ts
+++ b/a.test.ts
@@ -1,1 +1,1 @@
-expect(x).toBe(42);
+expect(true).toBe(true);
`;
    expect(auditDiff(diff).violations.map((v) => v.patternId)).toContain(
      "EXPECT_TRUE_TRUE",
    );
  });

  test("flags expect(N).toBe(N) where N === N", () => {
    const diff = `diff --git a/a.test.ts b/a.test.ts
--- a/a.test.ts
+++ b/a.test.ts
@@ -1,1 +1,1 @@
-expect(x).toBe(42);
+expect(7).toBe(7);
`;
    expect(auditDiff(diff).violations.map((v) => v.patternId)).toContain(
      "EXPECT_NUM_EQUALS_SELF",
    );
  });

  test("does not flag expect(X).toBe(Y) when they differ", () => {
    const diff = `diff --git a/a.test.ts b/a.test.ts
--- a/a.test.ts
+++ b/a.test.ts
@@ -1,1 +1,1 @@
-x
+expect(5).toBe(7);
`;
    const ids = auditDiff(diff).violations.map((v) => v.patternId);
    expect(ids).not.toContain("EXPECT_NUM_EQUALS_SELF");
  });

  test("warns on .not.toThrow() without argument", () => {
    const diff = `diff --git a/a.test.ts b/a.test.ts
--- a/a.test.ts
+++ b/a.test.ts
@@ -1,1 +1,1 @@
-expect(fn).toThrow(SpecificError);
+expect(fn).not.toThrow();
`;
    expect(auditDiff(diff).warnings.map((v) => v.patternId)).toContain(
      "NOT_TOTHROW_WEAKENED",
    );
  });
});

describe("auditDiff — config widening", () => {
  test("flags COVERAGE_EXCLUDE_ADDED in vitest config", () => {
    const diff = `diff --git a/vitest.config.ts b/vitest.config.ts
--- a/vitest.config.ts
+++ b/vitest.config.ts
@@ -5,0 +5,1 @@
+    exclude: ['src/bad.ts'],
`;
    const ids = auditDiff(diff).violations.map((v) => v.patternId);
    expect(ids).toContain("COVERAGE_EXCLUDE_ADDED");
  });

  test("flags THRESHOLD_LOWERED in stryker config", () => {
    const diff = `diff --git a/stryker.conf.mjs b/stryker.conf.mjs
--- a/stryker.conf.mjs
+++ b/stryker.conf.mjs
@@ -10,1 +10,1 @@
-  high: 80,
+  high: 50,
`;
    const ids = auditDiff(diff).violations.map((v) => v.patternId);
    expect(ids).toContain("THRESHOLD_LOWERED");
  });

  test("does not flag threshold RAISED", () => {
    const diff = `diff --git a/stryker.conf.mjs b/stryker.conf.mjs
--- a/stryker.conf.mjs
+++ b/stryker.conf.mjs
@@ -10,1 +10,1 @@
-  high: 50,
+  high: 80,
`;
    const ids = auditDiff(diff).violations.map((v) => v.patternId);
    expect(ids).not.toContain("THRESHOLD_LOWERED");
  });
});

describe("auditDiff — net expect removal", () => {
  test("flags net removal of expect calls", () => {
    const diff = `diff --git a/a.test.ts b/a.test.ts
--- a/a.test.ts
+++ b/a.test.ts
@@ -1,5 +1,2 @@
-expect(a).toBe(1);
-expect(b).toBe(2);
-expect(c).toBe(3);
+expect(a).toBe(1);
`;
    expect(auditDiff(diff).violations.map((v) => v.patternId)).toContain(
      "EXPECT_REMOVED_NET",
    );
  });

  test("does not flag when net added (strengthening)", () => {
    const diff = `diff --git a/a.test.ts b/a.test.ts
--- a/a.test.ts
+++ b/a.test.ts
@@ -1,2 +1,3 @@
-expect(a).toBe(1);
+expect(a).toBe(1);
+expect(b).toBe(2);
`;
    expect(auditDiff(diff).violations.map((v) => v.patternId)).not.toContain(
      "EXPECT_REMOVED_NET",
    );
  });
});

describe("auditDiff — test file deletion", () => {
  test("flags TEST_FILE_DELETED", () => {
    const diff = `diff --git a/src/foo.test.ts b/src/foo.test.ts
deleted file mode 100644
--- a/src/foo.test.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-test('x', () => {});
-test('y', () => {});
-test('z', () => {});
`;
    expect(auditDiff(diff).violations.map((v) => v.patternId)).toContain(
      "TEST_FILE_DELETED",
    );
  });

  test("does not flag src file deletion", () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
deleted file mode 100644
--- a/src/foo.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-export const x = 1;
`;
    expect(auditDiff(diff).violations.map((v) => v.patternId)).not.toContain(
      "TEST_FILE_DELETED",
    );
  });
});

describe("auditDiff — mock abuse", () => {
  test("flags EXCESSIVE_MOCKING with >3 mocks", () => {
    const diff = `diff --git a/a.test.ts b/a.test.ts
--- a/a.test.ts
+++ b/a.test.ts
@@ -1,0 +1,5 @@
+vi.mock('./a');
+vi.mock('./b');
+vi.mock('./c');
+vi.mock('./d');
+vi.mock('./e');
`;
    expect(auditDiff(diff).warnings.map((v) => v.patternId)).toContain(
      "EXCESSIVE_MOCKING",
    );
  });

  test("does not flag with <=3 mocks", () => {
    const diff = `diff --git a/a.test.ts b/a.test.ts
--- a/a.test.ts
+++ b/a.test.ts
@@ -1,0 +1,3 @@
+vi.mock('./a');
+vi.mock('./b');
+vi.mock('./c');
`;
    expect(auditDiff(diff).warnings.map((v) => v.patternId)).not.toContain(
      "EXCESSIVE_MOCKING",
    );
  });

  test("flags MOCK_RETURNS_EXPECTED", () => {
    const diff = `diff --git a/a.test.ts b/a.test.ts
--- a/a.test.ts
+++ b/a.test.ts
@@ -1,0 +1,3 @@
+service.mockReturnValue("HELLO");
+const r = service();
+expect(r).toBe("HELLO");
`;
    expect(auditDiff(diff).warnings.map((v) => v.patternId)).toContain(
      "MOCK_RETURNS_EXPECTED",
    );
  });
});

describe("auditDiff — snapshot laundering", () => {
  test("flags snapshot change with no src change", () => {
    const diff = `diff --git a/src/__snapshots__/Button.tsx.snap b/src/__snapshots__/Button.tsx.snap
--- a/src/__snapshots__/Button.tsx.snap
+++ b/src/__snapshots__/Button.tsx.snap
@@ -1,1 +1,1 @@
-old snap
+new snap
`;
    expect(auditDiff(diff).violations.map((v) => v.patternId)).toContain(
      "SNAPSHOT_UPDATED_WITHOUT_SRC_CHANGE",
    );
  });

  test("does NOT flag when src also changed", () => {
    const diff = `diff --git a/src/components/Button.tsx b/src/components/Button.tsx
--- a/src/components/Button.tsx
+++ b/src/components/Button.tsx
@@ -1,1 +1,1 @@
-export const Button = () => <button>a</button>;
+export const Button = () => <button>b</button>;
diff --git a/src/components/__snapshots__/Button.tsx.snap b/src/components/__snapshots__/Button.tsx.snap
--- a/src/components/__snapshots__/Button.tsx.snap
+++ b/src/components/__snapshots__/Button.tsx.snap
@@ -1,1 +1,1 @@
-<button>a</button>
+<button>b</button>
`;
    expect(auditDiff(diff).violations.map((v) => v.patternId)).not.toContain(
      "SNAPSHOT_UPDATED_WITHOUT_SRC_CHANGE",
    );
  });
});

describe("auditDiff — conditional test logic", () => {
  test("warns on if/else in test body", () => {
    const diff = `diff --git a/a.test.ts b/a.test.ts
--- a/a.test.ts
+++ b/a.test.ts
@@ -1,0 +1,3 @@
+test('x', () => {
+  if (process.env.CI) { expect(a).toBe(1); }
+});
`;
    expect(auditDiff(diff).warnings.map((v) => v.patternId)).toContain(
      "CONDITIONAL_TEST_LOGIC",
    );
  });
});

// ─── findingToViolation ──────────────────────────────────────────────────────

describe("findingToViolation", () => {
  test("converts finding to AntiCheatViolation shape", () => {
    const v = findingToViolation(
      {
        patternId: "SKIP_ADDED",
        severity: "reject",
        file: "src/a.test.ts",
        line: 5,
        matchedContent: "test.skip('x')",
      },
      "2026-04-14T22:00:00Z",
    );
    expect(v).toEqual({
      pattern_id: "SKIP_ADDED",
      severity: "reject",
      file: "src/a.test.ts",
      line: 5,
      matched_content: "test.skip('x')",
      detected_at: "2026-04-14T22:00:00Z",
    });
  });

  test("omits undefined fields", () => {
    const v = findingToViolation(
      {
        patternId: "X",
        severity: "warn",
        file: "a.ts",
      },
      "2026-04-14T22:00:00Z",
    );
    expect(v).not.toHaveProperty("line");
    expect(v).not.toHaveProperty("matched_content");
  });
});
