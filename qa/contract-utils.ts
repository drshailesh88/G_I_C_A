/**
 * Contract utilities (blueprint Part 3.2 + 3.3 + 12c + 12e).
 *
 * Every utility here operates on ONE contract directory
 * `.quality/contracts/<feature>/` containing:
 *   examples.md
 *   counterexamples.md
 *   invariants.md
 *   acceptance.spec.ts
 *   regressions.spec.ts    (NOT hashed — grows organically)
 *   api-contract.json      (optional)
 *   index.yaml             (machine-readable metadata)
 *
 * The rule is: every artifact the oracle depends on is hashed. Tampering
 * with any of those files causes CONTRACT_TAMPERED. `regressions.spec.ts`
 * is deliberately NOT in the set because it grows as bugs are found.
 */
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import yaml from "js-yaml";
import {
  ContractIndexSchema,
  SecurityCategorySet,
  type ContractIndex,
  type ContractVersionHistoryEntrySchema,
} from "./types.js";
import { z } from "zod";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Files whose SHA256 goes into `index.yaml.hashes`. Order matters only for
 * deterministic output; lookup is by filename. */
export const HASHED_ARTIFACTS: readonly string[] = [
  "examples.md",
  "counterexamples.md",
  "invariants.md",
  "acceptance.spec.ts",
  "api-contract.json",
];

/** NEVER hashed — grows with each reported bug. */
export const UNHASHED_ARTIFACTS: readonly string[] = ["regressions.spec.ts"];

export type VersionHistoryEntry = z.infer<typeof ContractVersionHistoryEntrySchema>;

// ─── computeContractHashes ───────────────────────────────────────────────────

/**
 * Walk the contract directory and SHA256 every artifact in HASHED_ARTIFACTS
 * that actually exists on disk. Missing files are silently skipped (e.g.
 * api-contract.json is optional).
 */
export async function computeContractHashes(
  contractDir: string,
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const artifact of HASHED_ARTIFACTS) {
    const path = join(contractDir, artifact);
    try {
      const buf = await fs.readFile(path);
      hashes[artifact] = `sha256:${createHash("sha256")
        .update(buf)
        .digest("hex")}`;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
  }
  return hashes;
}

// ─── writeIndexYaml ──────────────────────────────────────────────────────────

export interface WriteIndexInput {
  contractDir: string;
  metadata: ContractIndex;
  /** Skip final Zod validation — used by test fixtures. Default: false. */
  skipValidation?: boolean;
}

/**
 * Write the full index.yaml to the contract directory. Zod-validates the
 * metadata before writing; invalid schema aborts.
 */
export async function writeIndexYaml(input: WriteIndexInput): Promise<string> {
  const path = join(input.contractDir, "index.yaml");
  if (!input.skipValidation) {
    ContractIndexSchema.parse(input.metadata);
  }
  await fs.mkdir(input.contractDir, { recursive: true });
  const preamble =
    "# Auto-managed by /playbook:contract-pack. Hashes are recomputed on every\n" +
    "# freeze + version-bump. Editing `installed_from_registry`, `hashes`, or\n" +
    "# `version_history` by hand WILL be rejected by contract-hash-verify.\n";
  await fs.writeFile(
    path,
    preamble + yaml.dump(input.metadata, { lineWidth: 120, noRefs: true }),
  );
  return path;
}

export async function readIndexYaml(contractDir: string): Promise<ContractIndex> {
  const path = join(contractDir, "index.yaml");
  const raw = await fs.readFile(path, "utf8");
  const parsed = yaml.load(raw);
  return ContractIndexSchema.parse(parsed);
}

// ─── bumpContractVersion ─────────────────────────────────────────────────────

export interface BumpVersionInput {
  contractDir: string;
  reason: string;
  approvedBy: string;
  diffSummary?: string;
  timestamp?: string;
}

/**
 * Increment the contract's version, recompute hashes, and append a history
 * entry. For `security_sensitive` features, `authoring_mode` is forced to
 * `source_denied` (blueprint 12e) AND `baseline_reset_triggered` is set to
 * `true` — the controller reads this field on the next `qa run` to force
 * a baseline recomputation for every module in `affected_modules`.
 */
export async function bumpContractVersion(
  input: BumpVersionInput,
): Promise<ContractIndex> {
  const { contractDir } = input;
  const timestamp = input.timestamp ?? new Date().toISOString();

  if (!input.reason.trim()) {
    throw new Error("bumpContractVersion: reason is required");
  }
  if (!input.approvedBy.trim()) {
    throw new Error("bumpContractVersion: approvedBy is required");
  }

  const current = await readIndexYaml(contractDir);
  const nextVersion = current.version + 1;
  const newHashes = await computeContractHashes(contractDir);

  const authoringMode =
    current.feature.security_sensitive ||
    SecurityCategorySet.has(current.feature.category)
      ? "source_denied"
      : "source_denied"; // default to source_denied unconditionally for safety

  const historyEntry: VersionHistoryEntry = {
    version: nextVersion,
    date: timestamp.slice(0, 10),
    approved_by: input.approvedBy,
    reason: input.reason,
    ...(input.diffSummary !== undefined ? { diff_summary: input.diffSummary } : {}),
    authoring_mode: authoringMode,
    baseline_reset_triggered: true,
  };

  const next: ContractIndex = {
    ...current,
    feature: {
      ...current.feature,
      status: "versioning", // briefly during bump; freezeContract flips to frozen
    },
    approval: {
      approved_by: input.approvedBy,
      approved_at: timestamp,
      ...(current.approval.pr_or_commit !== undefined
        ? { pr_or_commit: current.approval.pr_or_commit }
        : {}),
    },
    hashes: newHashes,
    version: nextVersion,
    version_history: [...current.version_history, historyEntry],
  };

  await writeIndexYaml({ contractDir, metadata: next });
  return next;
}

// ─── validateContractIntegrity ───────────────────────────────────────────────

export interface ContractIntegrityResult {
  ok: boolean;
  contractFeature: string;
  version: number;
  checked: number;
  mismatches: Array<{ artifact: string; expected: string; actual: string }>;
  missing: Array<{ artifact: string }>;
  unexpected: Array<{ artifact: string }>;
}

/**
 * Recompute artifact hashes and compare to stored `hashes`. Returns:
 *   - mismatches  — stored hash exists but disk hash differs.
 *   - missing     — stored hash exists but file absent.
 *   - unexpected  — disk file hashed but no stored hash (drift from schema).
 *
 * `regressions.spec.ts` is excluded from the comparison because it grows.
 */
export async function validateContractIntegrity(
  contractDir: string,
): Promise<ContractIntegrityResult> {
  const contract = await readIndexYaml(contractDir);
  const actualHashes = await computeContractHashes(contractDir);

  const result: ContractIntegrityResult = {
    ok: true,
    contractFeature: contract.feature.id,
    version: contract.version,
    checked: 0,
    mismatches: [],
    missing: [],
    unexpected: [],
  };

  for (const [artifact, storedHash] of Object.entries(contract.hashes)) {
    result.checked++;
    const actual = actualHashes[artifact];
    if (actual === undefined) {
      result.missing.push({ artifact });
      continue;
    }
    if (actual !== storedHash) {
      result.mismatches.push({
        artifact,
        expected: storedHash,
        actual,
      });
    }
  }

  for (const artifact of Object.keys(actualHashes)) {
    if (!(artifact in contract.hashes)) {
      result.unexpected.push({ artifact });
    }
  }

  result.ok =
    result.mismatches.length === 0 &&
    result.missing.length === 0 &&
    result.unexpected.length === 0;
  return result;
}

// ─── freezeContract ──────────────────────────────────────────────────────────

export interface FreezeContractInput {
  contractDir: string;
  approvedBy: string;
  timestamp?: string;
  prOrCommit?: string;
}

/**
 * Set status to `frozen`, recompute hashes, and lock the contract. Called
 * at the end of the contract-pack authoring flow AND after a version bump.
 *
 * Post-freeze, Layer 1 permissions.deny covers these files — Claude cannot
 * edit them during the qa-run loop.
 */
export async function freezeContract(
  input: FreezeContractInput,
): Promise<ContractIndex> {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const current = await readIndexYaml(input.contractDir);
  const hashes = await computeContractHashes(input.contractDir);

  const next: ContractIndex = {
    ...current,
    feature: { ...current.feature, status: "frozen" },
    approval: {
      approved_by: input.approvedBy,
      approved_at: timestamp,
      ...(input.prOrCommit !== undefined ? { pr_or_commit: input.prOrCommit } : {}),
    },
    hashes,
  };

  await writeIndexYaml({ contractDir: input.contractDir, metadata: next });
  return next;
}

// ─── High-level helper: initialize a new contract ────────────────────────────

export interface InitContractInput {
  contractDir: string;
  featureId: string;
  title: string;
  tier: "critical_75" | "business_60" | "ui_gates_only";
  category: "auth" | "payments" | "user_data" | "business_logic" | "ui";
  approvedBy: string;
  sourceDocs?: string[];
  affectedModules: string[];
  seededUsers?: string[];
  requiresServices?: string[];
  prOrCommit?: string;
  timestamp?: string;
}

/**
 * Create a minimal initial `index.yaml` for a new contract. Expects the
 * artifact files (examples.md, etc.) to already be present on disk so their
 * counts + hashes can be captured. Status is set to `pending_approval`;
 * the user freezes via `freezeContract` after review.
 */
export async function initializeContract(
  input: InitContractInput,
): Promise<ContractIndex> {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const hashes = await computeContractHashes(input.contractDir);
  const counts = await countArtifacts(input.contractDir);

  const isSecurity =
    SecurityCategorySet.has(input.category) ||
    input.tier === "critical_75";

  const initial: ContractIndex = {
    schema_version: 1,
    feature: {
      id: input.featureId,
      title: input.title,
      tier: input.tier,
      category: input.category,
      status: "pending_approval",
      security_sensitive: isSecurity,
    },
    approval: {
      approved_by: input.approvedBy,
      approved_at: timestamp,
      ...(input.prOrCommit !== undefined ? { pr_or_commit: input.prOrCommit } : {}),
    },
    source_docs: input.sourceDocs ?? [],
    artifacts: {
      examples: "examples.md",
      counterexamples: "counterexamples.md",
      invariants: "invariants.md",
      acceptance_tests: "acceptance.spec.ts",
      regression_tests: "regressions.spec.ts",
      api_contract: null,
    },
    counts,
    affected_modules: input.affectedModules,
    test_data: {
      seeded_users: input.seededUsers ?? [],
      requires_services: input.requiresServices ?? [],
    },
    hashes,
    version: 1,
    version_history: [
      {
        version: 1,
        date: timestamp.slice(0, 10),
        approved_by: input.approvedBy,
        reason: "Initial contract authoring",
        authoring_mode: "source_denied",
        baseline_reset_triggered: false,
      },
    ],
  };

  await writeIndexYaml({
    contractDir: input.contractDir,
    metadata: initial,
  });
  return initial;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function countArtifacts(
  contractDir: string,
): Promise<ContractIndex["counts"]> {
  return {
    examples: await countMarkdownSections(join(contractDir, "examples.md"), /^## /m),
    counterexamples: await countMarkdownSections(join(contractDir, "counterexamples.md"), /^## /m),
    invariants: await countNumberedLines(join(contractDir, "invariants.md")),
    acceptance_tests: await countTestCases(join(contractDir, "acceptance.spec.ts")),
    regression_tests: await countTestCases(join(contractDir, "regressions.spec.ts")),
  };
}

async function countMarkdownSections(
  path: string,
  pattern: RegExp,
): Promise<number> {
  const body = await fs.readFile(path, "utf8").catch(() => "");
  const globalPattern = new RegExp(pattern.source, "gm");
  return (body.match(globalPattern) ?? []).length;
}

async function countNumberedLines(path: string): Promise<number> {
  const body = await fs.readFile(path, "utf8").catch(() => "");
  return (body.match(/^\d+\.\s/gm) ?? []).length;
}

async function countTestCases(path: string): Promise<number> {
  const body = await fs.readFile(path, "utf8").catch(() => "");
  // Count top-level `test(` and `it(` calls. Good enough for a declared-count
  // heuristic; the contract-test-count gate verifies the final count against
  // Playwright's reported total.
  const testCount = (body.match(/\b(?:test|it)\s*\(/g) ?? []).length;
  return testCount;
}
