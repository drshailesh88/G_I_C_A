import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  HASHED_ARTIFACTS,
  bumpContractVersion,
  computeContractHashes,
  freezeContract,
  initializeContract,
  readIndexYaml,
  validateContractIntegrity,
  writeIndexYaml,
} from "./contract-utils.js";
import { ContractIndexSchema, type ContractIndex } from "./types.js";

let root: string;

beforeEach(async () => {
  root = join(tmpdir(), `contract-utils-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(root, { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function sha256(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

async function seedArtifacts(
  contents: Partial<Record<(typeof HASHED_ARTIFACTS)[number] | "regressions.spec.ts", string>> = {},
): Promise<void> {
  const defaults: Record<string, string> = {
    "examples.md": "# Examples\n\n## Example 1\nbody\n\n## Example 2\nbody\n",
    "counterexamples.md": "# Counter\n\n## CE 1\nbody\n",
    "invariants.md": "1. first invariant\n2. second invariant\n3. third\n",
    "acceptance.spec.ts":
      "test('a', () => {});\ntest('b', () => {});\ntest('c', () => {});\n",
    "regressions.spec.ts": "test('regression-1', () => {});\n",
  };
  for (const [file, content] of Object.entries({ ...defaults, ...contents })) {
    if (content === undefined) continue;
    await fs.writeFile(join(root, file), content);
  }
}

// ─── computeContractHashes ────────────────────────────────────────────────────

describe("computeContractHashes", () => {
  test("hashes every present artifact except regressions", async () => {
    await seedArtifacts();
    const hashes = await computeContractHashes(root);
    expect(Object.keys(hashes).sort()).toEqual(
      ["acceptance.spec.ts", "counterexamples.md", "examples.md", "invariants.md"],
    );
    expect(hashes["regressions.spec.ts"]).toBeUndefined();
  });

  test("includes api-contract.json when present", async () => {
    await seedArtifacts();
    await fs.writeFile(
      join(root, "api-contract.json"),
      JSON.stringify({ feature: "x", endpoints: [] }),
    );
    const hashes = await computeContractHashes(root);
    expect(hashes["api-contract.json"]).toBeDefined();
  });

  test("skips missing artifacts silently", async () => {
    await fs.writeFile(join(root, "examples.md"), "only this one");
    const hashes = await computeContractHashes(root);
    expect(hashes["examples.md"]).toBe(sha256("only this one"));
    expect(hashes["counterexamples.md"]).toBeUndefined();
  });

  test("content change → different hash", async () => {
    await seedArtifacts();
    const before = await computeContractHashes(root);
    await fs.writeFile(join(root, "examples.md"), "different content");
    const after = await computeContractHashes(root);
    expect(before["examples.md"]).not.toBe(after["examples.md"]);
  });
});

// ─── writeIndexYaml + readIndexYaml round-trip ───────────────────────────────

describe("writeIndexYaml / readIndexYaml", () => {
  test("round-trips a valid contract", async () => {
    await seedArtifacts();
    const hashes = await computeContractHashes(root);
    const contract: ContractIndex = ContractIndexSchema.parse({
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
        examples: 2,
        counterexamples: 1,
        invariants: 3,
        acceptance_tests: 3,
        regression_tests: 1,
      },
      affected_modules: ["src/auth/**"],
      test_data: { seeded_users: [], requires_services: [] },
      hashes,
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
    });
    await writeIndexYaml({ contractDir: root, metadata: contract });

    const loaded = await readIndexYaml(root);
    expect(loaded.feature.id).toBe("auth-login");
    expect(loaded.version).toBe(1);
    expect(loaded.hashes).toEqual(hashes);
  });

  test("rejects schema drift on write", async () => {
    await seedArtifacts();
    const bogus = { schema_version: 999 } as unknown as ContractIndex;
    await expect(
      writeIndexYaml({ contractDir: root, metadata: bogus }),
    ).rejects.toThrow();
  });

  test("includes preamble comment", async () => {
    await seedArtifacts();
    await initializeContract({
      contractDir: root,
      featureId: "x",
      title: "X",
      tier: "business_60",
      category: "business_logic",
      approvedBy: "t",
      affectedModules: ["src/**"],
    });
    const body = await fs.readFile(join(root, "index.yaml"), "utf8");
    expect(body).toContain("# Auto-managed by /playbook:contract-pack");
  });
});

// ─── initializeContract ──────────────────────────────────────────────────────

describe("initializeContract", () => {
  test("creates pending_approval contract with counted artifacts", async () => {
    await seedArtifacts();
    const contract = await initializeContract({
      contractDir: root,
      featureId: "auth-login",
      title: "Auth Login",
      tier: "critical_75",
      category: "auth",
      approvedBy: "shailesh",
      affectedModules: ["src/auth/**"],
      seededUsers: ["test_user"],
      requiresServices: ["clerk"],
    });

    expect(contract.feature.status).toBe("pending_approval");
    expect(contract.feature.security_sensitive).toBe(true); // auth → auto-true
    expect(contract.counts.examples).toBe(2);
    expect(contract.counts.counterexamples).toBe(1);
    expect(contract.counts.invariants).toBe(3);
    expect(contract.counts.acceptance_tests).toBe(3);
    expect(contract.version).toBe(1);
    expect(contract.version_history).toHaveLength(1);
    expect(contract.version_history[0]?.reason).toBe("Initial contract authoring");
  });

  test("non-security category gets security_sensitive=false when tier not critical", async () => {
    await seedArtifacts();
    const contract = await initializeContract({
      contractDir: root,
      featureId: "settings-panel",
      title: "Settings",
      tier: "ui_gates_only",
      category: "ui",
      approvedBy: "shailesh",
      affectedModules: ["src/**"],
    });
    expect(contract.feature.security_sensitive).toBe(false);
  });

  test("critical_75 tier alone → security_sensitive true", async () => {
    await seedArtifacts();
    const contract = await initializeContract({
      contractDir: root,
      featureId: "core-calc",
      title: "Core",
      tier: "critical_75",
      category: "business_logic",
      approvedBy: "shailesh",
      affectedModules: ["src/**"],
    });
    expect(contract.feature.security_sensitive).toBe(true);
  });
});

// ─── freezeContract ──────────────────────────────────────────────────────────

describe("freezeContract", () => {
  test("flips status to frozen and refreshes hashes", async () => {
    await seedArtifacts();
    await initializeContract({
      contractDir: root,
      featureId: "auth-login",
      title: "Auth",
      tier: "critical_75",
      category: "auth",
      approvedBy: "t",
      affectedModules: ["src/auth/**"],
    });

    // Modify an artifact between init and freeze — freeze should capture
    // the new hash.
    await fs.writeFile(join(root, "examples.md"), "# Revised\n\n## New\ntext\n");

    const frozen = await freezeContract({
      contractDir: root,
      approvedBy: "t",
      prOrCommit: "abc1234",
    });
    expect(frozen.feature.status).toBe("frozen");
    expect(frozen.approval.pr_or_commit).toBe("abc1234");

    // Hash should match the NEW content, not what initializeContract captured.
    const expected = sha256("# Revised\n\n## New\ntext\n");
    expect(frozen.hashes["examples.md"]).toBe(expected);
  });
});

// ─── bumpContractVersion ─────────────────────────────────────────────────────

describe("bumpContractVersion", () => {
  async function init(): Promise<void> {
    await seedArtifacts();
    await initializeContract({
      contractDir: root,
      featureId: "auth-login",
      title: "Auth",
      tier: "critical_75",
      category: "auth",
      approvedBy: "t",
      affectedModules: ["src/auth/**"],
    });
    await freezeContract({ contractDir: root, approvedBy: "t" });
  }

  test("increments version + appends history + records reason", async () => {
    await init();
    const bumped = await bumpContractVersion({
      contractDir: root,
      reason: "Social login added per PRD v2",
      approvedBy: "shailesh",
      diffSummary: "+3 examples, +2 tests",
      timestamp: "2026-04-18T10:00:00Z",
    });
    expect(bumped.version).toBe(2);
    expect(bumped.version_history).toHaveLength(2);
    const latest = bumped.version_history[1]!;
    expect(latest.version).toBe(2);
    expect(latest.reason).toBe("Social login added per PRD v2");
    expect(latest.approved_by).toBe("shailesh");
    expect(latest.diff_summary).toBe("+3 examples, +2 tests");
    expect(latest.date).toBe("2026-04-18");
    expect(latest.authoring_mode).toBe("source_denied");
    expect(latest.baseline_reset_triggered).toBe(true);
  });

  test("security_sensitive features force source_denied authoring mode", async () => {
    await init();
    const bumped = await bumpContractVersion({
      contractDir: root,
      reason: "x",
      approvedBy: "y",
    });
    expect(bumped.feature.security_sensitive).toBe(true);
    expect(bumped.version_history[1]?.authoring_mode).toBe("source_denied");
  });

  test("hashes are recomputed on bump", async () => {
    await init();
    // Alter an artifact between freeze and bump.
    await fs.writeFile(join(root, "examples.md"), "wholly new content");
    const bumped = await bumpContractVersion({
      contractDir: root,
      reason: "x",
      approvedBy: "y",
    });
    expect(bumped.hashes["examples.md"]).toBe(sha256("wholly new content"));
  });

  test("status set to versioning during bump", async () => {
    await init();
    const bumped = await bumpContractVersion({
      contractDir: root,
      reason: "x",
      approvedBy: "y",
    });
    expect(bumped.feature.status).toBe("versioning");
  });

  test("empty reason → error", async () => {
    await init();
    await expect(
      bumpContractVersion({ contractDir: root, reason: "", approvedBy: "y" }),
    ).rejects.toThrow(/reason is required/);
  });

  test("empty approvedBy → error", async () => {
    await init();
    await expect(
      bumpContractVersion({ contractDir: root, reason: "x", approvedBy: "" }),
    ).rejects.toThrow(/approvedBy is required/);
  });
});

// ─── validateContractIntegrity ───────────────────────────────────────────────

describe("validateContractIntegrity", () => {
  async function initAndFreeze(): Promise<void> {
    await seedArtifacts();
    await initializeContract({
      contractDir: root,
      featureId: "auth-login",
      title: "Auth",
      tier: "critical_75",
      category: "auth",
      approvedBy: "t",
      affectedModules: ["src/auth/**"],
    });
    await freezeContract({ contractDir: root, approvedBy: "t" });
  }

  test("pass when all hashes match", async () => {
    await initAndFreeze();
    const result = await validateContractIntegrity(root);
    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.unexpected).toEqual([]);
  });

  test("detects tampered artifact", async () => {
    await initAndFreeze();
    await fs.writeFile(join(root, "examples.md"), "TAMPERED");
    const result = await validateContractIntegrity(root);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]?.artifact).toBe("examples.md");
  });

  test("detects missing artifact", async () => {
    await initAndFreeze();
    await fs.unlink(join(root, "invariants.md"));
    const result = await validateContractIntegrity(root);
    expect(result.ok).toBe(false);
    expect(result.missing.map((m) => m.artifact)).toContain("invariants.md");
  });

  test("ignores regressions.spec.ts changes (not in hash set)", async () => {
    await initAndFreeze();
    await fs.writeFile(
      join(root, "regressions.spec.ts"),
      "test('new regression', () => {});\n",
    );
    const result = await validateContractIntegrity(root);
    expect(result.ok).toBe(true);
  });

  test("unexpected artifact (hashed file not in stored set) → fail", async () => {
    await initAndFreeze();
    // Add an api-contract.json AFTER freeze (not covered by stored hashes).
    await fs.writeFile(
      join(root, "api-contract.json"),
      JSON.stringify({ feature: "x", endpoints: [] }),
    );
    const result = await validateContractIntegrity(root);
    expect(result.ok).toBe(false);
    expect(result.unexpected.map((u) => u.artifact)).toContain("api-contract.json");
  });

  test("after version-bump, validation passes for new hashes", async () => {
    await initAndFreeze();
    await fs.writeFile(join(root, "examples.md"), "updated content");
    await bumpContractVersion({
      contractDir: root,
      reason: "update",
      approvedBy: "t",
    });
    const result = await validateContractIntegrity(root);
    expect(result.ok).toBe(true);
  });
});

// ─── Schema invariant: security_sensitive enforcement via Zod ────────────────

describe("contract-utils integration with schema invariants", () => {
  test("auth category MUST have security_sensitive=true — initialize() respects this", async () => {
    await seedArtifacts();
    const contract = await initializeContract({
      contractDir: root,
      featureId: "auth-login",
      title: "A",
      tier: "critical_75",
      category: "auth",
      approvedBy: "t",
      affectedModules: ["src/**"],
    });
    expect(contract.feature.security_sensitive).toBe(true);
    // Reading back validates via Zod superRefine — if security_sensitive were
    // false, parse would throw.
    const loaded = await readIndexYaml(root);
    expect(loaded.feature.security_sensitive).toBe(true);
  });
});

// ─── Preamble check ──────────────────────────────────────────────────────────

describe("writeIndexYaml — preamble", () => {
  test("writes warning preamble discouraging hand-edits", async () => {
    await seedArtifacts();
    await initializeContract({
      contractDir: root,
      featureId: "x",
      title: "X",
      tier: "business_60",
      category: "business_logic",
      approvedBy: "t",
      affectedModules: ["src/**"],
    });
    const body = await fs.readFile(join(root, "index.yaml"), "utf8");
    const firstLines = body.split("\n").slice(0, 3).join("\n");
    expect(firstLines).toContain("/playbook:contract-pack");
  });
});

// Silence unused imports in some TS configs
void yaml;
