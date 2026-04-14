import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  runContractHashVerify,
  CONTRACT_HASH_GATE_ID,
} from "./contract-hash-verify.js";
import type { GateConfig } from "./base.js";
import type { ContractIndex } from "../types.js";

let root: string;

beforeEach(async () => {
  root = join(tmpdir(), `gate-hash-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(join(root, ".quality", "contracts"), { recursive: true });
  await fs.mkdir(join(root, "runs", "evidence"), { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function baseConfig(): GateConfig {
  return {
    runId: "run-test-001",
    workingDir: root,
    evidenceDir: join(root, "runs", "evidence"),
  };
}

function sha256(contents: string): string {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

async function writeContract(
  feature: string,
  artifacts: Record<string, string>,
  overrides: Partial<ContractIndex> = {},
): Promise<void> {
  const dir = join(root, ".quality", "contracts", feature);
  await fs.mkdir(dir, { recursive: true });
  const hashes: Record<string, string> = {};
  for (const [name, contents] of Object.entries(artifacts)) {
    const filePath = join(dir, name);
    await fs.writeFile(filePath, contents);
    if (name !== "regressions.spec.ts") {
      // regressions.spec.ts is not hashed per blueprint Part 3.2
      hashes[name] = sha256(contents);
    }
  }
  const contract: ContractIndex = {
    schema_version: 1,
    feature: {
      id: feature,
      title: `Feature ${feature}`,
      tier: "critical_75",
      category: "auth",
      status: "frozen",
      security_sensitive: true,
    },
    approval: {
      approved_by: "test",
      approved_at: "2026-04-14T22:00:00Z",
    },
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
      acceptance_tests: 1,
      regression_tests: 0,
    },
    affected_modules: ["src/foo/**"],
    test_data: { seeded_users: [], requires_services: [] },
    hashes,
    version: 1,
    version_history: [
      {
        version: 1,
        date: "2026-04-14",
        approved_by: "test",
        reason: "initial",
        authoring_mode: "source_denied",
        baseline_reset_triggered: false,
      },
    ],
    ...overrides,
  };
  await fs.writeFile(join(dir, "index.yaml"), yaml.dump(contract));
}

describe("runContractHashVerify — happy paths", () => {
  test("passes when all hashes match", async () => {
    await writeContract("auth-login", {
      "examples.md": "content",
      "counterexamples.md": "cc",
      "invariants.md": "inv",
      "acceptance.spec.ts": "spec",
      "regressions.spec.ts": "reg-not-hashed",
    });

    const result = await runContractHashVerify(baseConfig());
    expect(result.status).toBe("pass");
    expect(result.shortCircuit).toBe(false);
    expect(result.gateId).toBe(CONTRACT_HASH_GATE_ID);
    const details = result.details as any;
    expect(details.contractsChecked).toBe(1);
    expect(details.mismatches).toEqual([]);
  });

  test("no contracts directory → passes cleanly", async () => {
    await fs.rm(join(root, ".quality"), { recursive: true });
    const result = await runContractHashVerify(baseConfig());
    expect(result.status).toBe("pass");
    const details = result.details as any;
    expect(details.contractsChecked).toBe(0);
  });

  test("writes evidence file", async () => {
    await writeContract("auth-login", { "examples.md": "c", "counterexamples.md": "", "invariants.md": "", "acceptance.spec.ts": "", "regressions.spec.ts": "" });
    const result = await runContractHashVerify(baseConfig());
    expect(result.artifacts).toHaveLength(1);
    const contents = await fs.readFile(result.artifacts[0]!, "utf8");
    expect(JSON.parse(contents)).toHaveProperty("mismatches");
  });
});

describe("runContractHashVerify — failure paths", () => {
  test("detects tampered artifact", async () => {
    await writeContract("auth-login", {
      "examples.md": "original content",
      "counterexamples.md": "",
      "invariants.md": "",
      "acceptance.spec.ts": "",
      "regressions.spec.ts": "",
    });
    // Tamper:
    await fs.writeFile(
      join(root, ".quality", "contracts", "auth-login", "examples.md"),
      "TAMPERED",
    );

    const result = await runContractHashVerify(baseConfig());
    expect(result.status).toBe("fail");
    expect(result.shortCircuit).toBe(true);
    const details = result.details as any;
    expect(details.mismatches).toHaveLength(1);
    expect(details.mismatches[0].artifact).toBe("examples.md");
    expect(details.mismatches[0].contractFeature).toBe("auth-login");
  });

  test("detects missing artifact", async () => {
    await writeContract("auth-login", {
      "examples.md": "c",
      "counterexamples.md": "",
      "invariants.md": "",
      "acceptance.spec.ts": "",
      "regressions.spec.ts": "",
    });
    await fs.unlink(join(root, ".quality", "contracts", "auth-login", "examples.md"));
    const result = await runContractHashVerify(baseConfig());
    expect(result.status).toBe("fail");
    expect(result.shortCircuit).toBe(true);
    const details = result.details as any;
    expect(details.missingArtifacts).toHaveLength(1);
    expect(details.missingArtifacts[0].reason).toContain("not found");
  });

  test("detects invalid index.yaml", async () => {
    const dir = join(root, ".quality", "contracts", "bad");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, "index.yaml"), "not: valid: yaml: :::");
    const result = await runContractHashVerify(baseConfig());
    expect(result.status).toBe("fail");
    expect(result.shortCircuit).toBe(true);
    const details = result.details as any;
    expect(details.invalidContracts).toHaveLength(1);
  });

  test("detects schema drift in index.yaml", async () => {
    const dir = join(root, ".quality", "contracts", "drift");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      join(dir, "index.yaml"),
      yaml.dump({ schema_version: 999, feature: { id: "drift" } }),
    );
    const result = await runContractHashVerify(baseConfig());
    expect(result.status).toBe("fail");
    const details = result.details as any;
    expect(details.invalidContracts[0].reason).toContain("schema validation failed");
  });

  test("multiple contracts: passes when all match, fails when any mismatches", async () => {
    await writeContract("auth-login", {
      "examples.md": "a",
      "counterexamples.md": "",
      "invariants.md": "",
      "acceptance.spec.ts": "",
      "regressions.spec.ts": "",
    });
    await writeContract("payment-checkout", {
      "examples.md": "b",
      "counterexamples.md": "",
      "invariants.md": "",
      "acceptance.spec.ts": "",
      "regressions.spec.ts": "",
    }, { feature: { id: "payment-checkout", title: "P", tier: "critical_75", category: "payments", status: "frozen", security_sensitive: true } });

    const r1 = await runContractHashVerify(baseConfig());
    expect(r1.status).toBe("pass");

    await fs.writeFile(
      join(root, ".quality", "contracts", "payment-checkout", "examples.md"),
      "X",
    );
    const r2 = await runContractHashVerify(baseConfig());
    expect(r2.status).toBe("fail");
    const details = r2.details as any;
    expect(details.mismatches).toHaveLength(1);
    expect(details.mismatches[0].contractFeature).toBe("payment-checkout");
  });
});
