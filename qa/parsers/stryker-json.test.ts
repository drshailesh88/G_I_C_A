import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  classifyFile,
  matchGlob,
  parseIncrementalSnapshot,
  parseStrykerReport,
} from "./stryker-json.js";
import { ParseError, type TierConfig } from "../types.js";

const FIXTURES_DIR = resolve(__dirname, "..", "__fixtures__");

let workDir: string;
beforeEach(async () => {
  workDir = join(tmpdir(), `stryker-test-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(workDir, { recursive: true });
});
afterEach(async () => {
  try {
    await fs.rm(workDir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

// ─── matchGlob ───────────────────────────────────────────────────────────────

describe("matchGlob", () => {
  test("literal file match", () => {
    expect(matchGlob("middleware.ts", "middleware.ts")).toBe(true);
    expect(matchGlob("src/x.ts", "middleware.ts")).toBe(false);
  });

  test("single star does not cross slashes", () => {
    expect(matchGlob("src/auth.ts", "src/*.ts")).toBe(true);
    expect(matchGlob("src/auth/login.ts", "src/*.ts")).toBe(false);
  });

  test("double star crosses slashes", () => {
    expect(matchGlob("src/auth/login.ts", "src/auth/**")).toBe(true);
    expect(matchGlob("src/auth/providers/clerk.ts", "src/auth/**")).toBe(true);
    expect(matchGlob("src/lib/foo.ts", "src/auth/**")).toBe(false);
  });

  test("mid-path double star", () => {
    expect(matchGlob("src/server/auth/clerk.ts", "src/**/auth/**")).toBe(true);
    expect(matchGlob("src/ui/auth.ts", "src/**/auth/**")).toBe(false);
  });

  test("question mark matches single non-slash char", () => {
    expect(matchGlob("src/a.ts", "src/?.ts")).toBe(true);
    expect(matchGlob("src/ab.ts", "src/?.ts")).toBe(false);
  });

  test("escapes regex metacharacters in literal parts", () => {
    expect(matchGlob("src/file.ts", "src/file.ts")).toBe(true);
    expect(matchGlob("src/fileXts", "src/file.ts")).toBe(false); // dot is escaped
    expect(matchGlob("src/(scoped)/x.ts", "src/(scoped)/x.ts")).toBe(true);
  });
});

// ─── classifyFile ────────────────────────────────────────────────────────────

describe("classifyFile", () => {
  const tiers: TierConfig = {
    schema_version: 1,
    tiers: {
      critical_75: ["src/auth/**", "middleware.ts", "src/lib/payments/**"],
      business_60: ["src/lib/**", "app/api/**"],
      ui_gates_only: ["src/components/**", "app/**/page.tsx"],
    },
    unclassified_behavior: "fail_fast",
  };

  test("critical_75 wins over later tiers when file matches multiple globs", () => {
    // "src/lib/payments/refund.ts" matches critical_75 AND business_60
    expect(classifyFile("src/lib/payments/refund.ts", tiers)).toBe("critical_75");
  });

  test("business_60 match", () => {
    expect(classifyFile("src/lib/utils.ts", tiers)).toBe("business_60");
  });

  test("ui_gates_only match", () => {
    expect(classifyFile("src/components/Button.tsx", tiers)).toBe("ui_gates_only");
    expect(classifyFile("app/dashboard/page.tsx", tiers)).toBe("ui_gates_only");
  });

  test("literal filename match", () => {
    expect(classifyFile("middleware.ts", tiers)).toBe("critical_75");
  });

  test("unclassified returns undefined", () => {
    expect(classifyFile("src/server/random.ts", tiers)).toBeUndefined();
    expect(classifyFile("scripts/seed.ts", tiers)).toBeUndefined();
  });
});

// ─── parseIncrementalSnapshot ────────────────────────────────────────────────

describe("parseIncrementalSnapshot", () => {
  test("parses v2 mutants shape", async () => {
    const raw = await fs.readFile(
      join(FIXTURES_DIR, "stryker-incremental-v2.json"),
      "utf8",
    );
    const snapshot = parseIncrementalSnapshot(raw);
    expect(snapshot.get("src/auth/login.ts")?.get("1")).toBe("Killed");
    expect(snapshot.get("src/auth/login.ts")?.get("4")).toBe("Survived");
    expect(snapshot.get("src/components/Button.tsx")?.get("2")).toBe("Survived");
  });

  test("parses v1 files shape", async () => {
    const raw = await fs.readFile(
      join(FIXTURES_DIR, "stryker-incremental-v1.json"),
      "utf8",
    );
    const snapshot = parseIncrementalSnapshot(raw);
    expect(snapshot.get("src/auth/login.ts")?.get("1")).toBe("Killed");
    expect(snapshot.get("src/auth/login.ts")?.get("2")).toBe("Survived");
  });

  test("rejects empty", () => {
    expect(() => parseIncrementalSnapshot("")).toThrow(ParseError);
  });

  test("rejects unknown shape", () => {
    expect(() =>
      parseIncrementalSnapshot(JSON.stringify({ somethingElse: true })),
    ).toThrow(ParseError);
  });

  test("rejects invalid JSON", () => {
    expect(() => parseIncrementalSnapshot("{broken")).toThrow(ParseError);
  });
});

// ─── parseStrykerReport ──────────────────────────────────────────────────────

describe("parseStrykerReport", () => {
  test("mixed fixture: per-file scores computed correctly", async () => {
    const result = await parseStrykerReport(
      join(FIXTURES_DIR, "stryker-mutation-mixed.json"),
    );

    // src/auth/login.ts: killed=2, survived=2, timeout=1, noCoverage=1 → score = 2 / (2+2+1) = 40.00
    const login = result.perFile.get("src/auth/login.ts");
    expect(login).toBeDefined();
    expect(login?.killed).toBe(2);
    expect(login?.survived).toBe(2);
    expect(login?.timeout).toBe(1);
    expect(login?.noCoverage).toBe(1);
    expect(login?.score).toBe(40);
    expect(login?.topSurvivingMutants).toHaveLength(2);
    expect(login?.topSurvivingMutants[0]?.line).toBe(42);

    // src/components/Button.tsx: killed=1, survived=1 → score = 50.00
    const button = result.perFile.get("src/components/Button.tsx");
    expect(button?.score).toBe(50);

    // src/lib/date-utils.ts: all NoCoverage → score null (denominator 0)
    const dateUtils = result.perFile.get("src/lib/date-utils.ts");
    expect(dateUtils?.score).toBeNull();
  });

  test("without incremental snapshot, everything is freshly measured", async () => {
    const result = await parseStrykerReport(
      join(FIXTURES_DIR, "stryker-mutation-mixed.json"),
    );
    expect(result.cachedFromIncremental).toBe(0);
    expect(result.freshlyTested).toBe(result.totalMutants);
    for (const score of result.perFile.values()) {
      expect(score.freshlyMeasured).toBe(true);
    }
  });

  test("with incremental snapshot, cached mutants detected", async () => {
    const result = await parseStrykerReport(
      join(FIXTURES_DIR, "stryker-mutation-mixed.json"),
      {
        incrementalPath: join(FIXTURES_DIR, "stryker-incremental-v2.json"),
      },
    );
    // For src/auth/login.ts:
    //   mutation: 1=Killed, 2=Killed, 3=Survived, 4=Survived, 5=Timeout, 6=NoCoverage
    //   incremental: 1=Killed (same), 2=Killed (same), 3=Killed (DIFFERENT→fresh),
    //                4=Survived (same), 5=Timeout (same)
    //   6 is new (not in incremental) → fresh
    //   Fresh = 2 (ids 3 and 6). Cached = 4 (ids 1, 2, 4, 5).
    //
    // For src/components/Button.tsx:
    //   mutation: 1=Killed, 2=Survived
    //   incremental: 1=Killed (same), 2=Survived (same) → all cached
    //
    // For src/lib/date-utils.ts: not in incremental → both fresh

    expect(result.freshlyTested).toBe(4); // 2 (login) + 0 (button) + 2 (dateUtils)
    expect(result.cachedFromIncremental).toBe(6); // 4 (login) + 2 (button) + 0 (dateUtils)

    const login = result.perFile.get("src/auth/login.ts");
    expect(login?.freshlyMeasured).toBe(true);
    const button = result.perFile.get("src/components/Button.tsx");
    expect(button?.freshlyMeasured).toBe(false);
    const dateUtils = result.perFile.get("src/lib/date-utils.ts");
    expect(dateUtils?.freshlyMeasured).toBe(true);
  });

  test("tier classification applied when config provided", async () => {
    const tiers: TierConfig = {
      schema_version: 1,
      tiers: {
        critical_75: ["src/auth/**"],
        business_60: ["src/lib/**"],
        ui_gates_only: ["src/components/**"],
      },
      unclassified_behavior: "fail_fast",
    };
    const result = await parseStrykerReport(
      join(FIXTURES_DIR, "stryker-mutation-mixed.json"),
      { tiers },
    );
    expect(result.perFile.get("src/auth/login.ts")?.tier).toBe("critical_75");
    expect(result.perFile.get("src/components/Button.tsx")?.tier).toBe(
      "ui_gates_only",
    );
    expect(result.perFile.get("src/lib/date-utils.ts")?.tier).toBe("business_60");
    expect(result.unclassifiedFiles).toEqual([]);
  });

  test("unclassified files surfaced for fail-fast", async () => {
    const tiers: TierConfig = {
      schema_version: 1,
      tiers: {
        critical_75: ["src/auth/**"],
        business_60: [],
        ui_gates_only: [],
      },
      unclassified_behavior: "fail_fast",
    };
    const result = await parseStrykerReport(
      join(FIXTURES_DIR, "stryker-mutation-mixed.json"),
      { tiers },
    );
    expect(result.unclassifiedFiles).toEqual(
      expect.arrayContaining([
        "src/components/Button.tsx",
        "src/lib/date-utils.ts",
      ]),
    );
    expect(result.perFile.get("src/components/Button.tsx")?.tier).toBeUndefined();
  });

  test("overall score computed across all files", async () => {
    // killed=3 (2 login + 1 button + 0 dateUtils)
    // scored denom = (2+2+1) + (1+1) + 0 = 7
    // score = 3/7 ≈ 42.86
    const result = await parseStrykerReport(
      join(FIXTURES_DIR, "stryker-mutation-mixed.json"),
    );
    expect(result.overallScore).toBeCloseTo(42.86, 1);
  });

  test("inline mutationContents bypasses file I/O", async () => {
    const inline = await fs.readFile(
      join(FIXTURES_DIR, "stryker-mutation-mixed.json"),
      "utf8",
    );
    const result = await parseStrykerReport("", {
      mutationContents: inline,
    });
    expect(result.totalMutants).toBeGreaterThan(0);
  });

  test("throws ParseError on missing file", async () => {
    await expect(
      parseStrykerReport(join(workDir, "missing.json")),
    ).rejects.toBeInstanceOf(ParseError);
  });

  test("throws ParseError on invalid status value", async () => {
    const path = join(workDir, "bad-status.json");
    await fs.writeFile(
      path,
      JSON.stringify({
        schemaVersion: "2.0.0",
        files: {
          "src/x.ts": {
            mutants: [{ id: "1", mutatorName: "x", status: "NotAStatus" }],
          },
        },
      }),
    );
    await expect(parseStrykerReport(path)).rejects.toBeInstanceOf(ParseError);
  });

  test("treats numeric mutant ids as strings", async () => {
    const inline = JSON.stringify({
      schemaVersion: "2.0.0",
      files: {
        "src/x.ts": {
          mutants: [
            { id: 1, mutatorName: "x", status: "Killed" },
            { id: 2, mutatorName: "x", status: "Survived" },
          ],
        },
      },
    });
    const result = await parseStrykerReport("", { mutationContents: inline });
    const file = result.perFile.get("src/x.ts");
    expect(file?.topSurvivingMutants[0]?.id).toBe("2");
  });
});
