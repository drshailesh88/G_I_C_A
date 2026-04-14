import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runClassifyCheck } from "./classify-checker.js";

let root: string;

beforeEach(async () => {
  root = join(tmpdir(), `classify-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(join(root, ".quality", "policies"), { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

async function writeTiers(tiers: {
  critical_75?: string[];
  business_60?: string[];
  ui_gates_only?: string[];
}): Promise<void> {
  await fs.writeFile(
    join(root, ".quality", "policies", "tiers.yaml"),
    yaml.dump({
      schema_version: 1,
      tiers: {
        critical_75: tiers.critical_75 ?? [],
        business_60: tiers.business_60 ?? [],
        ui_gates_only: tiers.ui_gates_only ?? [],
      },
      unclassified_behavior: "fail_fast",
    }),
  );
}

async function seedSrc(files: string[]): Promise<void> {
  for (const rel of files) {
    const path = join(root, rel);
    await fs.mkdir(join(path, ".."), { recursive: true });
    await fs.writeFile(path, "// source");
  }
}

describe("runClassifyCheck — happy path", () => {
  test("every file matches a glob → ok=true, zero unclassified", async () => {
    await writeTiers({
      critical_75: ["src/auth/**"],
      business_60: ["src/lib/**"],
      ui_gates_only: ["src/components/**"],
    });
    await seedSrc([
      "src/auth/login.ts",
      "src/lib/util.ts",
      "src/components/Button.tsx",
    ]);
    const result = await runClassifyCheck({ workingDir: root });
    expect(result.ok).toBe(true);
    expect(result.unclassified).toEqual([]);
    expect(result.scanned).toBe(3);
    expect(result.classified).toHaveLength(3);
    expect(result.classified.find((c) => c.path === "src/auth/login.ts")?.tier).toBe(
      "critical_75",
    );
    expect(result.classified.find((c) => c.path === "src/lib/util.ts")?.tier).toBe(
      "business_60",
    );
  });
});

describe("runClassifyCheck — unclassified files", () => {
  test("unclassified files in src/ → ok=false, list returned sorted", async () => {
    await writeTiers({
      critical_75: ["src/auth/**"],
    });
    await seedSrc([
      "src/auth/login.ts",
      "src/orphan.ts",
      "src/helpers/another.ts",
    ]);
    const result = await runClassifyCheck({ workingDir: root });
    expect(result.ok).toBe(false);
    expect(result.unclassified).toEqual([
      "src/helpers/another.ts",
      "src/orphan.ts",
    ]);
  });

  test("scans multiple conventional source roots", async () => {
    await writeTiers({ critical_75: ["src/**"] });
    await seedSrc([
      "src/a.ts",
      "app/page.tsx",
      "lib/util.ts",
      "components/Button.tsx",
      "pages/api/route.ts",
    ]);
    const result = await runClassifyCheck({ workingDir: root });
    expect(result.scanned).toBe(5);
    expect(result.ok).toBe(false); // only src/ is classified; others unclassified
    expect(result.unclassified.sort()).toEqual([
      "app/page.tsx",
      "components/Button.tsx",
      "lib/util.ts",
      "pages/api/route.ts",
    ]);
  });

  test("missing tiers.yaml treated as empty config → everything unclassified", async () => {
    await seedSrc(["src/a.ts", "src/b.ts"]);
    const result = await runClassifyCheck({ workingDir: root });
    expect(result.ok).toBe(false);
    expect(result.unclassified).toEqual(["src/a.ts", "src/b.ts"]);
  });
});

describe("runClassifyCheck — exclusions", () => {
  test("test files excluded by default", async () => {
    await writeTiers({ critical_75: ["src/**"] });
    await seedSrc([
      "src/a.ts",
      "src/a.test.ts",
      "src/a.spec.ts",
      "src/b.tsx",
      "src/b.test.tsx",
    ]);
    const result = await runClassifyCheck({ workingDir: root });
    expect(result.scanned).toBe(2); // only a.ts + b.tsx
    expect(result.classified.map((c) => c.path).sort()).toEqual([
      "src/a.ts",
      "src/b.tsx",
    ]);
  });

  test("includeTestFiles=true scans *.test.* and *.spec.*", async () => {
    await writeTiers({ critical_75: ["src/**"] });
    await seedSrc(["src/a.ts", "src/a.test.ts", "src/b.spec.tsx"]);
    const result = await runClassifyCheck({
      workingDir: root,
      includeTestFiles: true,
    });
    expect(result.scanned).toBe(3);
  });

  test("excludes node_modules, .next, coverage, etc.", async () => {
    await writeTiers({ critical_75: ["src/**"] });
    await seedSrc([
      "src/a.ts",
      "src/node_modules/lib/b.ts",
      "src/.next/cache/c.ts",
      "src/coverage/d.ts",
      "src/__snapshots__/e.ts",
    ]);
    const result = await runClassifyCheck({ workingDir: root });
    expect(result.scanned).toBe(1); // only src/a.ts
  });

  test("non-ts/tsx/js/jsx files ignored", async () => {
    await writeTiers({ critical_75: ["src/**"] });
    await seedSrc(["src/a.ts", "src/data.json", "src/readme.md"]);
    await fs.writeFile(join(root, "src", "image.png"), "binary");
    const result = await runClassifyCheck({ workingDir: root });
    expect(result.scanned).toBe(1);
  });
});

describe("runClassifyCheck — configuration overrides", () => {
  test("custom tiersYamlPath", async () => {
    await fs.mkdir(join(root, "custom"), { recursive: true });
    await fs.writeFile(
      join(root, "custom", "my-tiers.yaml"),
      yaml.dump({
        schema_version: 1,
        tiers: { critical_75: ["src/**"], business_60: [], ui_gates_only: [] },
        unclassified_behavior: "fail_fast",
      }),
    );
    await seedSrc(["src/a.ts"]);
    const result = await runClassifyCheck({
      workingDir: root,
      tiersYamlPath: join(root, "custom", "my-tiers.yaml"),
    });
    expect(result.ok).toBe(true);
  });

  test("custom sourceRoots", async () => {
    await writeTiers({ critical_75: ["my-src/**"] });
    await seedSrc(["my-src/a.ts"]);
    const result = await runClassifyCheck({
      workingDir: root,
      sourceRoots: ["my-src"],
    });
    expect(result.scanned).toBe(1);
    expect(result.ok).toBe(true);
  });

  test("custom extensions", async () => {
    await writeTiers({ critical_75: ["src/**"] });
    await seedSrc(["src/a.ts"]);
    await fs.writeFile(join(root, "src", "script.mjs"), "// custom");
    const result = await runClassifyCheck({
      workingDir: root,
      sourceFileExtensions: [".mjs"],
    });
    expect(result.scanned).toBe(1);
    expect(result.classified[0]?.path).toBe("src/script.mjs");
  });

  test("missing source root silently skipped", async () => {
    await writeTiers({ critical_75: ["src/**"] });
    // No files created.
    const result = await runClassifyCheck({ workingDir: root });
    expect(result.scanned).toBe(0);
    expect(result.ok).toBe(true);
  });
});

describe("runClassifyCheck — glob precedence", () => {
  test("critical_75 wins over business_60 when both match", async () => {
    await writeTiers({
      critical_75: ["src/lib/payments/**"],
      business_60: ["src/lib/**"],
    });
    await seedSrc(["src/lib/util.ts", "src/lib/payments/refund.ts"]);
    const result = await runClassifyCheck({ workingDir: root });
    expect(result.classified.find((c) => c.path === "src/lib/util.ts")?.tier).toBe(
      "business_60",
    );
    expect(
      result.classified.find((c) => c.path === "src/lib/payments/refund.ts")?.tier,
    ).toBe("critical_75");
  });
});
