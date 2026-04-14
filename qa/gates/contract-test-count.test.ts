import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  runContractTestCountGate,
  CONTRACT_TEST_COUNT_GATE_ID,
} from "./contract-test-count.js";
import type { GateConfig } from "./base.js";
import type { ContractIndex, PlaywrightResult } from "../types.js";

let root: string;
let contractDir: string;
beforeEach(async () => {
  root = join(tmpdir(), `ctc-${randomBytes(6).toString("hex")}`);
  contractDir = join(root, ".quality", "contracts", "auth-login");
  await fs.mkdir(contractDir, { recursive: true });
  await fs.mkdir(join(root, "evidence"), { recursive: true });
});
afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function writeContract(overrides: Partial<ContractIndex["counts"]> = {}): Promise<void> {
  const contract: ContractIndex = {
    schema_version: 1,
    feature: {
      id: "auth-login",
      title: "Auth",
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
    counts: {
      examples: 1,
      counterexamples: 0,
      invariants: 0,
      acceptance_tests: 5,
      regression_tests: 0,
      ...overrides,
    },
    affected_modules: ["src/auth/**"],
    test_data: { seeded_users: [], requires_services: [] },
    hashes: {
      "acceptance.spec.ts":
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
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
  return fs.writeFile(join(contractDir, "index.yaml"), yaml.dump(contract));
}

function cfg(): GateConfig {
  return {
    runId: "run-1",
    workingDir: root,
    evidenceDir: join(root, "evidence"),
    contractDir,
    featureId: "auth-login",
  };
}

function pwResult(
  overrides: Partial<PlaywrightResult> = {},
): PlaywrightResult {
  return {
    total: 5,
    passed: 5,
    failed: 0,
    skipped: 0,
    flaky: 0,
    durationMs: 100,
    failures: [],
    executedSpecFiles: ["acceptance.spec.ts"],
    ...overrides,
  };
}

describe("runContractTestCountGate", () => {
  test("pass when declared count matches executed count", async () => {
    await writeContract({ acceptance_tests: 5 });
    const result = await runContractTestCountGate({
      config: cfg(),
      playwrightResult: pwResult({ total: 5 }),
    });
    expect(result.status).toBe("pass");
    expect(result.shortCircuit).toBe(false);
    expect(result.gateId).toBe(CONTRACT_TEST_COUNT_GATE_ID);
  });

  test("fail when executed count is lower than declared", async () => {
    await writeContract({ acceptance_tests: 5 });
    const result = await runContractTestCountGate({
      config: cfg(),
      playwrightResult: pwResult({ total: 3 }),
    });
    expect(result.status).toBe("fail");
    expect(result.shortCircuit).toBe(true);
    const details = result.details as any;
    expect(details.mismatchDelta).toBe(-2);
  });

  test("fail when executed count is higher than declared", async () => {
    await writeContract({ acceptance_tests: 5 });
    const result = await runContractTestCountGate({
      config: cfg(),
      playwrightResult: pwResult({ total: 7 }),
    });
    expect(result.status).toBe("fail");
    expect(result.shortCircuit).toBe(true);
    const details = result.details as any;
    expect(details.mismatchDelta).toBe(2);
  });

  test("fail when spec file was not executed", async () => {
    await writeContract({ acceptance_tests: 5 });
    const result = await runContractTestCountGate({
      config: cfg(),
      playwrightResult: pwResult({
        total: 5,
        executedSpecFiles: ["other.spec.ts"],
      }),
    });
    expect(result.status).toBe("fail");
    expect(result.shortCircuit).toBe(true);
    expect((result.details as any).missingFromRun).toBe(true);
  });

  test("pass when executed spec path is a suffix match", async () => {
    await writeContract({ acceptance_tests: 2 });
    const result = await runContractTestCountGate({
      config: cfg(),
      playwrightResult: pwResult({
        total: 2,
        executedSpecFiles: [
          ".quality/contracts/auth-login/acceptance.spec.ts",
        ],
      }),
    });
    expect(result.status).toBe("pass");
  });

  test("error on missing contractDir", async () => {
    const result = await runContractTestCountGate({
      config: { runId: "run-1", workingDir: root, evidenceDir: join(root, "evidence") },
      playwrightResult: pwResult(),
    });
    expect(result.status).toBe("error");
    expect((result.details as any).loadError).toContain("contractDir");
  });

  test("error on missing index.yaml", async () => {
    const result = await runContractTestCountGate({
      config: cfg(),
      playwrightResult: pwResult(),
    });
    expect(result.status).toBe("error");
  });

  test("accepts pre-loaded contract (skips disk read)", async () => {
    await writeContract({ acceptance_tests: 3 });
    const preloaded: ContractIndex = {
      schema_version: 1,
      feature: {
        id: "auth-login",
        title: "Auth",
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
      counts: { examples: 1, counterexamples: 0, invariants: 0, acceptance_tests: 3, regression_tests: 0 },
      affected_modules: ["src/auth/**"],
      test_data: { seeded_users: [], requires_services: [] },
      hashes: {
        "acceptance.spec.ts":
          "sha256:0000000000000000000000000000000000000000000000000000000000000000",
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
    const result = await runContractTestCountGate({
      config: cfg(),
      playwrightResult: pwResult({ total: 3 }),
      contract: preloaded,
    });
    expect(result.status).toBe("pass");
  });

  test("writes JSON evidence", async () => {
    await writeContract({ acceptance_tests: 5 });
    const result = await runContractTestCountGate({
      config: cfg(),
      playwrightResult: pwResult({ total: 3 }),
    });
    expect(result.artifacts).toHaveLength(1);
    const body = JSON.parse(await fs.readFile(result.artifacts[0]!, "utf8"));
    expect(body.declaredCount).toBe(5);
    expect(body.executedCount).toBe(3);
  });
});
