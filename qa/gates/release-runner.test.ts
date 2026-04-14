import { promises as fs } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runReleaseGates } from "./release-runner.js";
import type { CommandOutcome, GateConfig, RunCommandFn } from "./base.js";
import type { ContractIndex } from "../types.js";

let root: string;

beforeEach(async () => {
  root = join(tmpdir(), `rr-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(join(root, ".quality", "contracts"), { recursive: true });
  await fs.mkdir(join(root, ".quality", "policies"), { recursive: true });
  await fs.mkdir(join(root, "evidence"), { recursive: true });
  // Seed an empty lock manifest + no-contract tree so contract-hash passes
  // with zero contracts.
});

afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function cfg(runner: RunCommandFn): GateConfig {
  return {
    runId: "run-1",
    workingDir: root,
    evidenceDir: join(root, "evidence"),
    runCommand: runner,
  };
}

async function writeContractForHash(feature: string, content: string): Promise<void> {
  const dir = join(root, ".quality", "contracts", feature);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, "examples.md"), content);
  await fs.writeFile(join(dir, "counterexamples.md"), "");
  await fs.writeFile(join(dir, "invariants.md"), "");
  await fs.writeFile(join(dir, "acceptance.spec.ts"), "");
  await fs.writeFile(join(dir, "regressions.spec.ts"), "");

  const hashEmpty = `sha256:${createHash("sha256").update("").digest("hex")}`;
  const hashContent = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  const c: ContractIndex = {
    schema_version: 1,
    feature: {
      id: feature,
      title: feature,
      tier: "critical_75",
      category: "auth",
      status: "frozen",
      security_sensitive: true,
    },
    approval: { approved_by: "t", approved_at: "2026-04-14T22:00:00Z" },
    source_docs: [],
    artifacts: {
      examples: "examples.md",
      counterexamples: "counterexamples.md",
      invariants: "invariants.md",
      acceptance_tests: "acceptance.spec.ts",
      regression_tests: "regressions.spec.ts",
      api_contract: null,
    },
    counts: { examples: 1, counterexamples: 0, invariants: 0, acceptance_tests: 1, regression_tests: 0 },
    affected_modules: ["src/**"],
    test_data: { seeded_users: [], requires_services: [] },
    hashes: {
      "examples.md": hashContent,
      "counterexamples.md": hashEmpty,
      "invariants.md": hashEmpty,
      "acceptance.spec.ts": hashEmpty,
    },
    version: 1,
    version_history: [
      {
        version: 1,
        date: "2026-04-14",
        approved_by: "t",
        reason: "initial",
        authoring_mode: "source_denied",
        baseline_reset_triggered: false,
      },
    ],
  };
  await fs.writeFile(join(dir, "index.yaml"), yaml.dump(c));
}

/** Writes minimal subprocess outputs so all gates produce a valid result. */
function releaseScenarioRunner(
  opts: { stryker?: "pass" | "fail"; vitest?: "pass" | "fail" } = {},
): RunCommandFn {
  return async (cmd, args, options) => {
    if (cmd === "npx") {
      const tool = args[0];

      if (tool === "stryker") {
        // Write full mutation.json the parser can read.
        const mutPath = join(root, "reports", "mutation", "mutation.json");
        await fs.mkdir(join(mutPath, ".."), { recursive: true });
        const killedCount = opts.stryker === "fail" ? 0 : 3;
        const survivedCount = opts.stryker === "fail" ? 3 : 1;
        await fs.writeFile(
          mutPath,
          JSON.stringify({
            schemaVersion: "2.0.0",
            files: {
              "src/a.ts": {
                mutants: [
                  ...Array(killedCount).fill(null).map((_, i) => ({
                    id: `k${i}`,
                    mutatorName: "BL",
                    status: "Killed",
                  })),
                  ...Array(survivedCount).fill(null).map((_, i) => ({
                    id: `s${i}`,
                    mutatorName: "BL",
                    status: "Survived",
                  })),
                ],
              },
            },
          }),
        );
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 100, timedOut: false };
      }

      if (tool === "vitest") {
        const outFileArg = args.find((a) => a.startsWith("--outputFile="));
        if (outFileArg) {
          const outPath = outFileArg.split("=", 2)[1]!;
          await fs.mkdir(join(outPath, ".."), { recursive: true });
          const failed = opts.vitest === "fail" ? 1 : 0;
          const passed = 3 - failed;
          await fs.writeFile(
            outPath,
            `<?xml version="1.0"?>
<testsuites tests="3" failures="${failed}" errors="0" time="0.3">
  <testsuite name="s" tests="3" failures="${failed}" errors="0" skipped="0" time="0.3">
    ${Array(passed).fill(`<testcase classname="c" name="p" time="0.1"/>`).join("")}
    ${failed > 0 ? `<testcase classname="c" name="f" time="0.1"><failure message="m" type="E">s</failure></testcase>` : ""}
  </testsuite>
</testsuites>`,
          );
        }
        return { exitCode: failed(opts.vitest) ? 1 : 0, stdout: "", stderr: "", durationMs: 100, timedOut: false };
      }

      if (tool === "playwright") {
        const outPath = options?.env?.PLAYWRIGHT_JSON_OUTPUT_FILE as string | undefined;
        if (outPath) {
          await fs.mkdir(join(outPath, ".."), { recursive: true });
          await fs.writeFile(
            outPath,
            JSON.stringify({
              stats: { duration: 100 },
              suites: [
                {
                  file: "e2e/all.spec.ts",
                  specs: [
                    {
                      title: "all",
                      file: "e2e/all.spec.ts",
                      tests: [
                        {
                          projectName: "chromium",
                          results: [{ status: "passed", duration: 100, retry: 0 }],
                        },
                      ],
                    },
                  ],
                },
              ],
            }),
          );
        }
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 100, timedOut: false };
      }

      if (tool === "lhci") {
        const lhciPath = join(root, ".lighthouseci", "manifest.json");
        await fs.mkdir(join(lhciPath, ".."), { recursive: true });
        await fs.writeFile(
          lhciPath,
          JSON.stringify([
            {
              isRepresentativeRun: true,
              summary: { performance: 0.95, accessibility: 1, "best-practices": 0.95, seo: 0.95 },
            },
          ]),
        );
        return { exitCode: 0, stdout: "", stderr: "", durationMs: 100, timedOut: false };
      }

      if (tool === "license-checker") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ "pkg@1": { licenses: "MIT" } }),
          stderr: "",
          durationMs: 50,
          timedOut: false,
        };
      }
    }

    if (cmd === "npm") {
      if (args[0] === "audit") {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
            vulnerabilities: {},
          }),
          stderr: "",
          durationMs: 50,
          timedOut: false,
        };
      }
      if (args[0] === "outdated") {
        return { exitCode: 0, stdout: "{}", stderr: "", durationMs: 50, timedOut: false };
      }
    }

    return { exitCode: 0, stdout: "", stderr: "", durationMs: 5, timedOut: false };
  };
}

function failed(v?: "pass" | "fail"): boolean {
  return v === "fail";
}

describe("runReleaseGates", () => {
  test("GREEN verdict when all gates pass", async () => {
    // Seed a build dir so bundle-size has something to report.
    await fs.mkdir(join(root, ".next", "static", "chunks"), { recursive: true });
    await fs.writeFile(join(root, ".next", "static", "chunks", "main.js"), Buffer.alloc(1000));
    await fs.writeFile(join(root, ".quality", "policies", "lock-manifest.json"), JSON.stringify({ schema_version: 1, files: {} }));

    const result = await runReleaseGates({
      config: cfg(releaseScenarioRunner({ stryker: "pass", vitest: "pass" })),
      axe: { routes: ["/"] },
      visual: { routes: ["/"] },
      skipGates: ["axe-accessibility", "visual-regression", "api-contract-validation"],
    });
    expect(result.verdict).toBe("GREEN");
    expect(result.failedGates).toEqual([]);
  });

  test("RED verdict when primary gate fails", async () => {
    await fs.mkdir(join(root, ".next", "static", "chunks"), { recursive: true });
    await fs.writeFile(join(root, ".next", "static", "chunks", "main.js"), Buffer.alloc(1000));
    await fs.writeFile(join(root, ".quality", "policies", "lock-manifest.json"), JSON.stringify({ schema_version: 1, files: {} }));

    const result = await runReleaseGates({
      config: cfg(releaseScenarioRunner({ vitest: "fail" })),
      skipGates: ["axe-accessibility", "visual-regression", "api-contract-validation"],
    });
    expect(result.verdict).toBe("RED");
    expect(result.verdictReason).toContain("vitest-all");
  });

  test("WARN verdict when only secondary gate fails", async () => {
    await fs.mkdir(join(root, ".next", "static", "chunks"), { recursive: true });
    await fs.writeFile(join(root, ".next", "static", "chunks", "main.js"), Buffer.alloc(1_000_000));
    await fs.writeFile(join(root, ".quality", "policies", "lock-manifest.json"), JSON.stringify({ schema_version: 1, files: {} }));

    const result = await runReleaseGates({
      config: cfg(releaseScenarioRunner()),
      bundleSize: { buildDir: ".next/static", totalMaxBytes: 100 },
      skipGates: ["axe-accessibility", "visual-regression", "api-contract-validation"],
    });
    // bundle-size fails but it's a secondary (warn) gate
    expect(result.warnGates).toContain("bundle-size");
    expect(result.verdict).toBe("WARN");
  });

  test("HARD verdict when contract hash fails", async () => {
    await fs.writeFile(join(root, ".quality", "policies", "lock-manifest.json"), JSON.stringify({ schema_version: 1, files: {} }));
    await writeContractForHash("feat-1", "original content");
    // Tamper the artifact to force hash mismatch.
    await fs.writeFile(
      join(root, ".quality", "contracts", "feat-1", "examples.md"),
      "TAMPERED",
    );
    await fs.mkdir(join(root, ".next", "static", "chunks"), { recursive: true });
    await fs.writeFile(join(root, ".next", "static", "chunks", "main.js"), Buffer.alloc(100));

    const result = await runReleaseGates({
      config: cfg(releaseScenarioRunner()),
      skipGates: ["axe-accessibility", "visual-regression", "api-contract-validation"],
    });
    expect(result.verdict).toBe("HARD");
    expect(result.verdictReason).toContain("contract-hash-verify");
  });

  test("skipGates omits gates entirely", async () => {
    await fs.writeFile(join(root, ".quality", "policies", "lock-manifest.json"), JSON.stringify({ schema_version: 1, files: {} }));
    const result = await runReleaseGates({
      config: cfg(releaseScenarioRunner()),
      skipGates: [
        "stryker-full",
        "vitest-all",
        "playwright-full",
        "axe-accessibility",
        "visual-regression",
        "api-contract-validation",
        "migration-safety",
        "bundle-size",
        "lighthouse-ci",
        "npm-audit",
        "license-compliance",
        "dependency-freshness",
      ],
    });
    // Only contract-hash ran.
    expect(result.gateResults.map((g) => g.gateId)).toEqual(["contract-hash-verify"]);
    expect(result.verdict).toBe("GREEN");
  });

  test("parallelization: gates in Group 2 run concurrently", async () => {
    await fs.mkdir(join(root, ".next", "static", "chunks"), { recursive: true });
    await fs.writeFile(join(root, ".next", "static", "chunks", "main.js"), Buffer.alloc(100));
    await fs.writeFile(join(root, ".quality", "policies", "lock-manifest.json"), JSON.stringify({ schema_version: 1, files: {} }));

    const startTimes: Record<string, number> = {};
    const endTimes: Record<string, number> = {};
    const slowRunner: RunCommandFn = async (cmd, args, options) => {
      const key = `${cmd}:${args[0] ?? ""}`;
      startTimes[key] = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 30));
      endTimes[key] = Date.now();
      return releaseScenarioRunner()(cmd, args, options);
    };

    const result = await runReleaseGates({
      config: cfg(slowRunner),
      skipGates: ["axe-accessibility", "visual-regression", "api-contract-validation"],
    });
    expect(result.verdict).toBe("GREEN");

    // Group 2 vitest + playwright + npm-audit should overlap (parallel).
    const vitestStart = startTimes["npx:vitest"];
    const pwStart = startTimes["npx:playwright"];
    const auditStart = startTimes["npm:audit"];
    if (vitestStart && pwStart && auditStart) {
      const spread = Math.max(vitestStart, pwStart, auditStart) -
                     Math.min(vitestStart, pwStart, auditStart);
      // In series at 30ms each, spread would be >=30ms. In parallel, <15ms.
      expect(spread).toBeLessThan(25);
    }
  });

  test("returns timing metadata", async () => {
    await fs.writeFile(join(root, ".quality", "policies", "lock-manifest.json"), JSON.stringify({ schema_version: 1, files: {} }));
    const result = await runReleaseGates({
      config: cfg(releaseScenarioRunner()),
      skipGates: [
        "stryker-full", "vitest-all", "playwright-full",
        "axe-accessibility", "visual-regression", "api-contract-validation",
        "migration-safety", "bundle-size", "lighthouse-ci",
        "npm-audit", "license-compliance", "dependency-freshness",
      ],
    });
    expect(result.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
