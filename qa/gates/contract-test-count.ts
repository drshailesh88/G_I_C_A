/**
 * Gate 9 — Contract test count verification (blueprint 14a addition).
 *
 * Compares the number of acceptance tests declared in the contract's
 * index.yaml (`counts.acceptance_tests`) against the number of tests actually
 * executed by the playwright-targeted gate. Any mismatch is a HARD failure
 * (short-circuit) signalling a contract test was deleted, renamed, or
 * silently disabled.
 *
 * Pure logic — no subprocess. Consumes the PlaywrightResult returned by the
 * upstream gate.
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import {
  buildGateResult,
  writeEvidence,
  type GateConfig,
} from "./base.js";
import {
  ContractIndexSchema,
  type ContractIndex,
  type GateResult,
  type PlaywrightResult,
} from "../types.js";

export const CONTRACT_TEST_COUNT_GATE_ID = "contract-test-count";

export interface ContractTestCountDetails {
  featureId: string;
  declaredCount: number;
  executedCount: number;
  mismatchDelta: number;
  specFile: string;
  executedSpecFiles: string[];
  missingFromRun: boolean;
  loadError?: string;
}

export interface ContractTestCountInput {
  config: GateConfig;
  playwrightResult: PlaywrightResult;
  /** Optional: pre-loaded contract. When absent the gate reads the contract
   * from config.contractDir/index.yaml. */
  contract?: ContractIndex;
}

export async function runContractTestCountGate(
  input: ContractTestCountInput,
): Promise<GateResult> {
  const start = Date.now();
  const { config, playwrightResult } = input;

  if (!config.contractDir) {
    return buildGateResult({
      gateId: CONTRACT_TEST_COUNT_GATE_ID,
      status: "error",
      durationMs: Date.now() - start,
      details: {
        loadError: "contractDir is required for contract-test-count gate",
      },
      shortCircuit: false,
    });
  }

  let contract = input.contract;
  if (!contract) {
    try {
      contract = await readContract(join(config.contractDir, "index.yaml"));
    } catch (err) {
      return buildGateResult({
        gateId: CONTRACT_TEST_COUNT_GATE_ID,
        status: "error",
        durationMs: Date.now() - start,
        details: {
          loadError: (err as Error).message,
        },
        shortCircuit: false,
      });
    }
  }

  const specFile = join(
    config.contractDir,
    contract.artifacts.acceptance_tests,
  );
  const declaredCount = contract.counts.acceptance_tests;
  const executedCount = playwrightResult.total;

  // Sanity: did the acceptance spec actually run? Compare executedSpecFiles.
  const expectedSpecBasename = contract.artifacts.acceptance_tests;
  const missingFromRun = !playwrightResult.executedSpecFiles.some((p) =>
    p.endsWith(expectedSpecBasename) ||
    p === specFile ||
    p.endsWith("/" + expectedSpecBasename),
  );

  const details: ContractTestCountDetails = {
    featureId: contract.feature.id,
    declaredCount,
    executedCount,
    mismatchDelta: executedCount - declaredCount,
    specFile,
    executedSpecFiles: playwrightResult.executedSpecFiles,
    missingFromRun,
  };

  const evidencePath = await writeEvidence(
    config.evidenceDir,
    CONTRACT_TEST_COUNT_GATE_ID,
    "report.json",
    JSON.stringify(details, null, 2),
  );

  const mismatch = declaredCount !== executedCount;
  const fail = mismatch || missingFromRun;

  return buildGateResult({
    gateId: CONTRACT_TEST_COUNT_GATE_ID,
    status: fail ? "fail" : "pass",
    durationMs: Date.now() - start,
    details: details as unknown as Record<string, unknown>,
    artifacts: [evidencePath],
    // HARD short-circuit — test deletion / silent disable signal.
    shortCircuit: fail,
  });
}

async function readContract(indexPath: string): Promise<ContractIndex> {
  const raw = await fs.readFile(indexPath, "utf8");
  if (raw.trim() === "") throw new Error(`empty index.yaml at ${indexPath}`);
  const parsed = yaml.load(raw);
  const result = ContractIndexSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `contract schema invalid: ${result.error.issues[0]?.message ?? "unknown"}`,
    );
  }
  return result.data;
}
