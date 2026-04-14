import { describe, expect, test } from "vitest";
import {
  getDirectDeps,
  getReverseDeps,
  normalize,
  type CruiseFn,
} from "./dependency-analyzer.js";

// Fake dependency-cruiser cruise function factory. Returns canned module
// data so tests don't actually shell out.
function makeCruise(modules: Array<{
  source: string;
  dependencies: Array<{ resolved: string; coreModule?: boolean; couldNotResolve?: boolean }>;
}>): CruiseFn {
  return (async () => ({
    output: {
      modules,
      summary: {},
    },
    exitCode: 0,
  })) as unknown as CruiseFn;
}

const PROJECT_ROOT = "/repo";

describe("normalize", () => {
  test("absolute path inside root → relative forward-slash", () => {
    expect(normalize("/repo/src/auth/login.ts", "/repo")).toBe(
      "src/auth/login.ts",
    );
  });

  test("already-relative stays relative", () => {
    expect(normalize("src/auth/login.ts", "/repo")).toBe("src/auth/login.ts");
  });

  test("backslash paths are converted", () => {
    expect(normalize("src\\auth\\login.ts", "/repo")).toBe("src/auth/login.ts");
  });
});

// ─── getDirectDeps ────────────────────────────────────────────────────────────

describe("getDirectDeps", () => {
  test("returns direct imports of the target file", async () => {
    const cruise = makeCruise([
      {
        source: "src/auth/login.ts",
        dependencies: [
          { resolved: "src/auth/session.ts" },
          { resolved: "src/lib/jwt.ts" },
          { resolved: "src/lib/logger.ts" },
        ],
      },
    ]);
    const deps = await getDirectDeps("src/auth/login.ts", PROJECT_ROOT, {
      cruise,
    });
    expect(deps).toEqual([
      "src/auth/session.ts",
      "src/lib/jwt.ts",
      "src/lib/logger.ts",
    ]);
  });

  test("filters out core modules and unresolved imports", async () => {
    const cruise = makeCruise([
      {
        source: "src/x.ts",
        dependencies: [
          { resolved: "node:fs", coreModule: true },
          { resolved: "totally-missing", couldNotResolve: true },
          { resolved: "src/y.ts" },
        ],
      },
    ]);
    const deps = await getDirectDeps("src/x.ts", PROJECT_ROOT, { cruise });
    expect(deps).toEqual(["src/y.ts"]);
  });

  test("deduplicates and sorts", async () => {
    const cruise = makeCruise([
      {
        source: "src/x.ts",
        dependencies: [
          { resolved: "src/b.ts" },
          { resolved: "src/a.ts" },
          { resolved: "src/a.ts" }, // duplicate
        ],
      },
    ]);
    const deps = await getDirectDeps("src/x.ts", PROJECT_ROOT, { cruise });
    expect(deps).toEqual(["src/a.ts", "src/b.ts"]);
  });

  test("returns empty when source module not in cruise output", async () => {
    const cruise = makeCruise([
      { source: "src/other.ts", dependencies: [] },
    ]);
    const deps = await getDirectDeps("src/missing.ts", PROJECT_ROOT, { cruise });
    expect(deps).toEqual([]);
  });

  test("handles cruise returning string output (skip)", async () => {
    const cruise: CruiseFn = (async () => ({
      output: "error message",
      exitCode: 1,
    })) as unknown as CruiseFn;
    const deps = await getDirectDeps("src/x.ts", PROJECT_ROOT, { cruise });
    expect(deps).toEqual([]);
  });
});

// ─── getReverseDeps ───────────────────────────────────────────────────────────

describe("getReverseDeps", () => {
  test("finds modules importing from target", async () => {
    const cruise = makeCruise([
      {
        source: "src/auth/login.ts",
        dependencies: [],
      },
      {
        source: "src/auth/middleware.ts",
        dependencies: [{ resolved: "src/auth/login.ts" }],
      },
      {
        source: "src/pages/login.tsx",
        dependencies: [{ resolved: "src/auth/login.ts" }],
      },
      {
        source: "src/lib/unrelated.ts",
        dependencies: [{ resolved: "src/lib/util.ts" }],
      },
    ]);
    const reverse = await getReverseDeps(["src/auth/login.ts"], PROJECT_ROOT, {
      cruise,
    });
    expect(reverse).toEqual(["src/auth/middleware.ts", "src/pages/login.tsx"]);
  });

  test("does not include the target files themselves", async () => {
    const cruise = makeCruise([
      {
        source: "src/auth/login.ts",
        dependencies: [{ resolved: "src/auth/login.ts" }], // self-import shouldn't happen but test it
      },
    ]);
    const reverse = await getReverseDeps(["src/auth/login.ts"], PROJECT_ROOT, {
      cruise,
    });
    expect(reverse).toEqual([]);
  });

  test("returns empty for empty targets", async () => {
    let cruiseCalled = false;
    const cruise: CruiseFn = (async () => {
      cruiseCalled = true;
      return { output: { modules: [], summary: {} }, exitCode: 0 };
    }) as unknown as CruiseFn;
    const reverse = await getReverseDeps([], PROJECT_ROOT, { cruise });
    expect(reverse).toEqual([]);
    expect(cruiseCalled).toBe(false);
  });

  test("skips core and unresolved deps in the reverse check", async () => {
    const cruise = makeCruise([
      {
        source: "src/a.ts",
        dependencies: [
          { resolved: "node:fs", coreModule: true },
          { resolved: "src/target.ts" },
        ],
      },
    ]);
    const reverse = await getReverseDeps(["src/target.ts"], PROJECT_ROOT, {
      cruise,
    });
    expect(reverse).toEqual(["src/a.ts"]);
  });

  test("handles multiple targets (union)", async () => {
    const cruise = makeCruise([
      {
        source: "src/a.ts",
        dependencies: [{ resolved: "src/t1.ts" }],
      },
      {
        source: "src/b.ts",
        dependencies: [{ resolved: "src/t2.ts" }],
      },
      {
        source: "src/c.ts",
        dependencies: [{ resolved: "src/other.ts" }],
      },
    ]);
    const reverse = await getReverseDeps(
      ["src/t1.ts", "src/t2.ts"],
      PROJECT_ROOT,
      { cruise },
    );
    expect(reverse).toEqual(["src/a.ts", "src/b.ts"]);
  });

  test("handles absolute paths in module output (normalizes)", async () => {
    const cruise = makeCruise([
      {
        source: "/repo/src/consumer.ts",
        dependencies: [{ resolved: "/repo/src/auth.ts" }],
      },
    ]);
    const reverse = await getReverseDeps(["src/auth.ts"], PROJECT_ROOT, {
      cruise,
    });
    expect(reverse).toEqual(["src/consumer.ts"]);
  });

  test("returns empty when output is a string (cruise error)", async () => {
    const cruise: CruiseFn = (async () => ({
      output: "cruise failed",
      exitCode: 1,
    })) as unknown as CruiseFn;
    const reverse = await getReverseDeps(["src/x.ts"], PROJECT_ROOT, { cruise });
    expect(reverse).toEqual([]);
  });
});
