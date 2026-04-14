import { describe, expect, test } from "vitest";
import { analyzeTestFileChange } from "./ast-assertion-analyzer.js";

describe("analyzeTestFileChange — expect count", () => {
  test("counts expect() calls in both before and after", () => {
    const before = `
      test('x', () => {
        expect(a).toBe(1);
        expect(b).toEqual(2);
      });
    `;
    const after = `
      test('x', () => {
        expect(a).toBe(1);
        expect(b).toEqual(2);
        expect(c).toBe(3);
      });
    `;
    const r = analyzeTestFileChange(before, after);
    expect(r.expectCountBefore).toBe(2);
    expect(r.expectCountAfter).toBe(3);
    expect(r.findings.map((f) => f.patternId)).not.toContain("NET_EXPECT_DECREASE");
  });

  test("flags NET_EXPECT_DECREASE when expects drop", () => {
    const before = `
      test('x', () => {
        expect(a).toBe(1);
        expect(b).toBe(2);
        expect(c).toBe(3);
      });
    `;
    const after = `
      test('x', () => {
        expect(a).toBe(1);
      });
    `;
    const r = analyzeTestFileChange(before, after);
    expect(r.findings.map((f) => f.patternId)).toContain("NET_EXPECT_DECREASE");
    expect(r.findings.find((f) => f.patternId === "NET_EXPECT_DECREASE")?.severity).toBe("reject");
  });
});

describe("analyzeTestFileChange — matcher weakening", () => {
  test("flags specific-to-weak substitution", () => {
    const before = `
      test('x', () => {
        expect(result).toEqual({ success: true, id: 5 });
      });
    `;
    const after = `
      test('x', () => {
        expect(result).toBeTruthy();
      });
    `;
    const r = analyzeTestFileChange(before, after);
    expect(r.strongMatchersBefore).toBe(1);
    expect(r.strongMatchersAfter).toBe(0);
    expect(r.weakMatchersBefore).toBe(0);
    expect(r.weakMatchersAfter).toBe(1);
    expect(r.findings.map((f) => f.patternId)).toContain("MATCHER_WEAKENED");
  });

  test("does not flag when adding both specific and weak", () => {
    const before = `
      test('x', () => { expect(a).toBe(1); });
    `;
    const after = `
      test('x', () => {
        expect(a).toBe(1);
        expect(b).toEqual({ x: 1 });
        expect(c).toBeDefined();
      });
    `;
    const r = analyzeTestFileChange(before, after);
    expect(r.findings.map((f) => f.patternId)).not.toContain("MATCHER_WEAKENED");
  });

  test("toThrow() without arg counts as weak; toThrow(Error) counts as strong", () => {
    const before = `
      test('x', () => { expect(fn).toThrow(TypeError); });
    `;
    const after = `
      test('x', () => { expect(fn).toThrow(); });
    `;
    const r = analyzeTestFileChange(before, after);
    expect(r.strongMatchersBefore).toBe(1);
    expect(r.strongMatchersAfter).toBe(0);
    expect(r.weakMatchersBefore).toBe(0);
    expect(r.weakMatchersAfter).toBe(1);
    expect(r.findings.map((f) => f.patternId)).toContain("MATCHER_WEAKENED");
  });

  test("does not flag specific→specific changes", () => {
    const before = `
      test('x', () => { expect(a).toBe(1); });
    `;
    const after = `
      test('x', () => { expect(a).toEqual({ x: 1 }); });
    `;
    const r = analyzeTestFileChange(before, after);
    expect(r.findings.map((f) => f.patternId)).not.toContain("MATCHER_WEAKENED");
  });
});

describe("analyzeTestFileChange — conditional test logic", () => {
  test("flags if/else inside test body", () => {
    const before = "test('x', () => { expect(a).toBe(1); });";
    const after = `
      test('x', () => {
        if (process.env.CI) {
          expect(a).toBe(1);
        }
      });
    `;
    const r = analyzeTestFileChange(before, after);
    expect(r.conditionalsInTestsAfter).toHaveLength(1);
    expect(r.conditionalsInTestsAfter[0]?.kind).toBe("if/else");
    expect(r.findings.map((f) => f.patternId)).toContain("CONDITIONAL_TEST_LOGIC");
  });

  test("flags ternary inside test body", () => {
    const before = "test('x', () => { expect(a).toBe(1); });";
    const after = `
      test('x', () => {
        const n = process.env.CI ? 1 : 2;
        expect(a).toBe(n);
      });
    `;
    const r = analyzeTestFileChange(before, after);
    expect(r.conditionalsInTestsAfter.some((c) => c.kind === "ternary")).toBe(true);
  });

  test("does not flag if outside test body", () => {
    const before = "test('x', () => {});";
    const after = `
      const helper = (flag: boolean) => flag ? 1 : 2;
      test('x', () => { expect(helper(true)).toBe(1); });
    `;
    const r = analyzeTestFileChange(before, after);
    // helper's ternary is outside test body, should not flag
    const testConditionals = r.conditionalsInTestsAfter.filter(c => c.line > 0);
    // Only conditionals inside test bodies should be counted
    expect(r.findings.filter((f) => f.patternId === "CONDITIONAL_TEST_LOGIC")).toHaveLength(testConditionals.length);
  });

  test("flags if/else inside describe body", () => {
    const before = "describe('x', () => {});";
    const after = `
      describe('x', () => {
        if (process.env.CI) { it.skip('x', () => {}); }
      });
    `;
    const r = analyzeTestFileChange(before, after);
    expect(r.conditionalsInTestsAfter.length).toBeGreaterThan(0);
  });
});

describe("analyzeTestFileChange — edge cases", () => {
  test("empty before (new file) produces zero-baseline stats", () => {
    const r = analyzeTestFileChange(
      "",
      `test('x', () => { expect(a).toBe(1); });`,
    );
    expect(r.expectCountBefore).toBe(0);
    expect(r.expectCountAfter).toBe(1);
    expect(r.findings.map((f) => f.patternId)).not.toContain("NET_EXPECT_DECREASE");
  });

  test("empty after (deleted content) yields zero-after stats", () => {
    const r = analyzeTestFileChange(
      `test('x', () => { expect(a).toBe(1); });`,
      "",
    );
    expect(r.expectCountBefore).toBe(1);
    expect(r.expectCountAfter).toBe(0);
    expect(r.findings.map((f) => f.patternId)).toContain("NET_EXPECT_DECREASE");
  });

  test("parse error on after is surfaced", () => {
    const r = analyzeTestFileChange(
      "test('x', () => { expect(a).toBe(1); });",
      "not ) valid { typescript",
    );
    expect(r.parseError).toBeDefined();
  });

  test("TypeScript syntax is supported", () => {
    const before = `
      test('x', () => {
        const user: { name: string } = { name: 'a' };
        expect(user.name).toBe('a');
      });
    `;
    const after = `
      test('x', () => {
        const user: { name: string; age: number } = { name: 'a', age: 1 };
        expect(user.name).toBe('a');
        expect(user.age).toBe(1);
      });
    `;
    const r = analyzeTestFileChange(before, after);
    expect(r.expectCountAfter).toBe(2);
  });

  test("JSX syntax is supported", () => {
    const before = `
      test('x', () => {
        const el = <div>hi</div>;
        expect(el).toBeDefined();
      });
    `;
    const after = `
      test('x', () => {
        const el = <div className="a">hi</div>;
        expect(el).toBeDefined();
      });
    `;
    const r = analyzeTestFileChange(before, after);
    expect(r.expectCountAfter).toBe(1);
  });

  test("does not double-count matchers in expect().not.toBe() chains", () => {
    const code = `test('x', () => { expect(a).not.toBe(1); });`;
    const r = analyzeTestFileChange("", code);
    expect(r.strongMatchersAfter).toBe(1);
  });

  test("ignores matcher-named calls on non-expect receivers", () => {
    const code = `
      test('x', () => {
        const sut = Foo();
        sut.toBe(1);          // not expect chain — should be ignored
        expect(sut).toBe(1);  // real matcher
      });
    `;
    const r = analyzeTestFileChange("", code);
    expect(r.strongMatchersAfter).toBe(1);
  });
});
