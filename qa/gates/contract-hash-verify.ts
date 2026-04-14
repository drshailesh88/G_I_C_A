/**
 * Gate 1 — Contract hash verification.
 *
 * For every `.quality/contracts/<feature>/index.yaml`:
 *   - Parse via ContractIndexSchema (Phase 1 types).
 *   - For each filename listed in `hashes`, recompute SHA256 of the artifact
 *     on disk and compare to the stored value.
 *   - Any mismatch → CONTRACT_TAMPERED failure, shortCircuit=true.
 *
 * Blueprint: Part 3.2 + Part 5.3 gate #1 + blueprint principle "tamper
 * detection as backstop, prevention via permissions.deny".
 */
import { promises as fs } from "node:fs";
import { join, relative, resolve } from "node:path";
import yaml from "js-yaml";
import {
  ContractIndexSchema,
  type ContractIndex,
} from "../types.js";
import {
  buildGateResult,
  computeFileHash,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import type { GateResult } from "../types.js";

export const CONTRACT_HASH_GATE_ID = "contract-hash-verify";

export interface ContractHashMismatch {
  contractFeature: string;
  artifact: string;
  expected: string;
  actual: string;
  absolutePath: string;
}

export interface ContractHashMissingArtifact {
  contractFeature: string;
  artifact: string;
  absolutePath: string;
  reason: string;
}

export interface ContractHashDetails {
  contractsChecked: number;
  artifactsChecked: number;
  mismatches: ContractHashMismatch[];
  missingArtifacts: ContractHashMissingArtifact[];
  invalidContracts: Array<{ path: string; reason: string }>;
}

export async function runContractHashVerify(
  config: GateConfig,
): Promise<GateResult> {
  const start = Date.now();
  const contractsRoot = join(config.workingDir, ".quality", "contracts");

  const details: ContractHashDetails = {
    contractsChecked: 0,
    artifactsChecked: 0,
    mismatches: [],
    missingArtifacts: [],
    invalidContracts: [],
  };

  const contractDirs = await listContractDirs(contractsRoot);
  for (const dir of contractDirs) {
    const indexPath = join(dir, "index.yaml");
    let contract: ContractIndex;
    try {
      contract = await readAndValidateContract(indexPath);
    } catch (err) {
      details.invalidContracts.push({
        path: relative(config.workingDir, indexPath),
        reason: (err as Error).message,
      });
      continue;
    }
    details.contractsChecked++;

    for (const [filename, storedHash] of Object.entries(contract.hashes)) {
      details.artifactsChecked++;
      const artifactPath = resolve(dir, filename);

      try {
        const actualHash = await computeFileHash(artifactPath);
        if (actualHash !== storedHash) {
          details.mismatches.push({
            contractFeature: contract.feature.id,
            artifact: filename,
            expected: storedHash,
            actual: actualHash,
            absolutePath: artifactPath,
          });
        }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        details.missingArtifacts.push({
          contractFeature: contract.feature.id,
          artifact: filename,
          absolutePath: artifactPath,
          reason: code === "ENOENT" ? "file not found" : String(err),
        });
      }
    }
  }

  const evidencePath = await writeEvidence(
    config.evidenceDir,
    CONTRACT_HASH_GATE_ID,
    "report.json",
    JSON.stringify(details, null, 2),
  );

  const hasFailure =
    details.mismatches.length > 0 ||
    details.missingArtifacts.length > 0 ||
    details.invalidContracts.length > 0;

  return buildGateResult({
    gateId: CONTRACT_HASH_GATE_ID,
    status: hasFailure ? "fail" : "pass",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [evidencePath],
    shortCircuit: hasFailure,
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function listContractDirs(contractsRoot: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(contractsRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => join(contractsRoot, e.name));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function readAndValidateContract(indexPath: string): Promise<ContractIndex> {
  const raw = await fs.readFile(indexPath, "utf8");
  if (raw.trim() === "") {
    throw new Error(`empty index.yaml at ${indexPath}`);
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new Error(`YAML parse failed: ${(err as Error).message}`);
  }
  const result = ContractIndexSchema.safeParse(parsed);
  if (!result.success) {
    const msg = result.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new Error(`schema validation failed: ${msg}`);
  }
  return result.data;
}
