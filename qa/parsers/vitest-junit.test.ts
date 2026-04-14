import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  parseVitestJunit,
  parseVitestJunitString,
} from "./vitest-junit.js";
import { ParseError } from "../types.js";

const FIXTURES_DIR = resolve(__dirname, "..", "__fixtures__");

let workDir: string;
beforeEach(async () => {
  workDir = join(tmpdir(), `vitest-junit-test-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(workDir, { recursive: true });
});
afterEach(async () => {
  try {
    await fs.rm(workDir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

describe("parseVitestJunit — happy paths", () => {
  test("all-pass fixture: 3 total, 3 passed, 0 failed", async () => {
    const result = await parseVitestJunit(
      join(FIXTURES_DIR, "vitest-junit-all-pass.xml"),
    );
    expect(result.total).toBe(3);
    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.failures).toEqual([]);
    expect(result.durationMs).toBe(450); // 0.45s
  });

  test("mixed fixture: 1 failure + 1 error + 1 skipped + 2 passed", async () => {
    const result = await parseVitestJunit(
      join(FIXTURES_DIR, "vitest-junit-mixed.xml"),
    );
    expect(result.total).toBe(5);
    expect(result.failed).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.passed).toBe(2);
    expect(result.failures).toHaveLength(2);
    const failure = result.failures.find((f) => f.test.includes("rejects expired token"));
    expect(failure).toBeDefined();
    expect(failure?.error).toContain("AssertionError");
    expect(failure?.file).toBe("src/auth/login.test.ts");
  });

  test("single-suite variant (no testsuites wrapper)", async () => {
    const result = await parseVitestJunit(
      join(FIXTURES_DIR, "vitest-junit-single-suite.xml"),
    );
    expect(result.total).toBe(1);
    expect(result.passed).toBe(1);
  });
});

describe("parseVitestJunit — string input", () => {
  test("parseVitestJunitString handles inline XML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" ?>
      <testsuites name="t" tests="1" failures="0" errors="0" time="0.1">
        <testsuite name="s" tests="1" failures="0" errors="0" skipped="0" time="0.1">
          <testcase classname="c" name="n" time="0.1"/>
        </testsuite>
      </testsuites>`;
    expect(parseVitestJunitString(xml).total).toBe(1);
  });

  test("parseVitestJunitString rejects empty input", () => {
    expect(() => parseVitestJunitString("", "memory")).toThrow(ParseError);
  });

  test("parseVitestJunitString rejects malformed XML", () => {
    expect(() => parseVitestJunitString("<not valid", "memory")).toThrow(ParseError);
  });
});

describe("parseVitestJunit — error paths", () => {
  test("throws ParseError when file does not exist", async () => {
    await expect(parseVitestJunit(join(workDir, "missing.xml"))).rejects.toBeInstanceOf(
      ParseError,
    );
  });

  test("throws ParseError on empty file", async () => {
    const path = join(workDir, "empty.xml");
    await fs.writeFile(path, "");
    await expect(parseVitestJunit(path)).rejects.toBeInstanceOf(ParseError);
  });

  test("throws ParseError on directory path", async () => {
    await expect(parseVitestJunit(workDir)).rejects.toBeInstanceOf(ParseError);
  });
});

describe("parseVitestJunit — edge cases", () => {
  test("empty testsuites: zero tests, clean result", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" ?>
      <testsuites name="empty" tests="0" failures="0" errors="0" time="0.0">
      </testsuites>`;
    const r = parseVitestJunitString(xml);
    expect(r.total).toBe(0);
    expect(r.passed).toBe(0);
    expect(r.failures).toEqual([]);
  });

  test("testsuite with empty testcases array", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" ?>
      <testsuites tests="0" failures="0" errors="0" time="0.0">
        <testsuite name="empty-suite" tests="0" failures="0" errors="0" skipped="0" time="0.0"/>
      </testsuites>`;
    const r = parseVitestJunitString(xml);
    expect(r.total).toBe(0);
  });

  test("failure without stack #text still produces a detail", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" ?>
      <testsuites tests="1" failures="1" errors="0" time="0.1">
        <testsuite name="s" tests="1" failures="1" errors="0" skipped="0" time="0.1">
          <testcase classname="c" name="n" time="0.1">
            <failure message="boom" type="X"/>
          </testcase>
        </testsuite>
      </testsuites>`;
    const r = parseVitestJunitString(xml);
    expect(r.failed).toBe(1);
    expect(r.failures[0]?.error).toContain("boom");
  });

  test("single testsuite not wrapped in array still parses", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" ?>
      <testsuites tests="2" failures="0" errors="0" time="0.2">
        <testsuite name="solo" tests="2" failures="0" errors="0" skipped="0" time="0.2">
          <testcase classname="c" name="a" time="0.1"/>
          <testcase classname="c" name="b" time="0.1"/>
        </testsuite>
      </testsuites>`;
    const r = parseVitestJunitString(xml);
    expect(r.total).toBe(2);
    expect(r.passed).toBe(2);
  });
});
