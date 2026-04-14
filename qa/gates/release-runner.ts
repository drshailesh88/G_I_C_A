/**
 * Release gate orchestrator (blueprint Part 5.4).
 *
 * Parallelization groups:
 *   1. Stryker full           — alone first (heaviest)
 *   2-13. Everything else     — concurrent (Vitest full, Playwright full,
 *                               axe, visual, api-contract, migration-safety,
 *                               bundle-size, lighthouse, npm audit, license,
 *                               dependency-freshness)
 *   14. Contract hash verify  — alone last (integrity re-check after all
 *                               data-producing gates ran)
 *
 * Verdict:
 *   HARD   — contract hash fails (integrity breach)
 *   RED    — any of gates 1-5 (Stryker, Vitest, Playwright, a11y, visual)
 *            fail
 *   WARN   — any of gates 6-13 fail (non-blocking quality signals)
 *   GREEN  — everything passes
 *
 * Release gates that need config (routes, baseUrl, thresholds) are
 * configured via the input. Gates listed in `skipGates` are omitted
 * entirely — useful for local dev runs where not all tooling is installed.
 */
import {
  buildGateResult,
  defaultRunCommand,
  type GateConfig,
  type RunCommandFn,
} from "./base.js";
import {
  runContractHashVerify,
  CONTRACT_HASH_GATE_ID,
} from "./contract-hash-verify.js";
import { runVitestGate, VITEST_GATE_IDS } from "./vitest.js";
import { runPlaywrightFullGate, PLAYWRIGHT_FULL_GATE_ID } from "./playwright-full.js";
import { runStrykerFullGate, STRYKER_FULL_GATE_ID } from "./stryker-full.js";
import { runAxeAccessibilityGate, AXE_ACCESSIBILITY_GATE_ID } from "./axe-accessibility.js";
import { runVisualRegressionGate, VISUAL_REGRESSION_GATE_ID } from "./visual-regression.js";
import { runApiContractValidationGate, API_CONTRACT_VALIDATION_GATE_ID } from "./api-contract-validation.js";
import { runMigrationSafetyGate, MIGRATION_SAFETY_GATE_ID } from "./migration-safety.js";
import { runBundleSizeGate, BUNDLE_SIZE_GATE_ID } from "./bundle-size.js";
import { runLighthouseCiGate, LIGHTHOUSE_CI_GATE_ID } from "./lighthouse-ci.js";
import { runNpmAuditGate, NPM_AUDIT_GATE_ID } from "./npm-audit.js";
import { runLicenseComplianceGate, LICENSE_COMPLIANCE_GATE_ID } from "./license-compliance.js";
import { runDependencyFreshnessGate, DEPENDENCY_FRESHNESS_GATE_ID } from "./dependency-freshness.js";
import type { GateResult, TierConfig } from "../types.js";
import type { LighthouseThresholds } from "./lighthouse-ci.js";
import type { VisualViewport } from "./visual-regression.js";
import type { AxeImpactLevel } from "./axe-accessibility.js";
import type { FetchFn } from "./api-contract-validation.js";

export type ReleaseVerdict = "GREEN" | "WARN" | "RED" | "HARD";

export interface ReleaseRunnerInput {
  config: GateConfig;
  /** Subset of release-gate IDs to skip entirely (never invoked). */
  skipGates?: readonly string[];

  // Per-gate configuration
  tiers?: TierConfig;
  axe?: {
    routes: string[];
    baseUrl?: string;
    minSeverity?: AxeImpactLevel;
  };
  visual?: {
    routes: string[];
    viewports?: VisualViewport[];
    baseUrl?: string;
  };
  apiContract?: {
    baseUrl?: string;
    fetch?: FetchFn;
  };
  migrations?: {
    migrationsDir?: string;
  };
  bundleSize?: {
    buildDir?: string;
    thresholds?: Record<string, number>;
    totalMaxBytes?: number;
    defaultMaxBytes?: number;
  };
  lighthouse?: {
    thresholds?: LighthouseThresholds;
    configPath?: string;
  };
  license?: {
    forbidden?: string[];
    failOnUnknown?: boolean;
  };

  /** Override subprocess runner for all gates. */
  runCommand?: RunCommandFn;
}

export interface ReleaseResult {
  gateResults: GateResult[];
  verdict: ReleaseVerdict;
  verdictReason: string;
  failedGates: string[];
  warnGates: string[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

/**
 * Gate IDs classified by severity for the release verdict:
 *   - PRIMARY: failure → RED (blocking)
 *   - SECONDARY: failure → WARN (non-blocking)
 *   - INTEGRITY: failure → HARD (overrides everything)
 */
const PRIMARY_GATES: readonly string[] = [
  STRYKER_FULL_GATE_ID,
  VITEST_GATE_IDS.all,
  PLAYWRIGHT_FULL_GATE_ID,
  AXE_ACCESSIBILITY_GATE_ID,
  VISUAL_REGRESSION_GATE_ID,
];
const SECONDARY_GATES: readonly string[] = [
  API_CONTRACT_VALIDATION_GATE_ID,
  MIGRATION_SAFETY_GATE_ID,
  BUNDLE_SIZE_GATE_ID,
  LIGHTHOUSE_CI_GATE_ID,
  NPM_AUDIT_GATE_ID,
  LICENSE_COMPLIANCE_GATE_ID,
  DEPENDENCY_FRESHNESS_GATE_ID,
];
const INTEGRITY_GATES: readonly string[] = [CONTRACT_HASH_GATE_ID];

export async function runReleaseGates(
  input: ReleaseRunnerInput,
): Promise<ReleaseResult> {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const skip = new Set(input.skipGates ?? []);
  const runner =
    input.runCommand ?? input.config.runCommand ?? defaultRunCommand();
  const baseCfg: GateConfig = {
    ...input.config,
    runCommand: runner,
  };

  const gateResults: GateResult[] = [];

  // ── Group 1: Stryker full (alone, goes first because longest-running)
  if (!skip.has(STRYKER_FULL_GATE_ID)) {
    gateResults.push(
      await runStrykerFullGate({
        config: baseCfg,
        ...(input.tiers !== undefined ? { tiers: input.tiers } : {}),
      }),
    );
  }

  // ── Group 2: Concurrent gates (everything except integrity)
  const concurrent: Array<Promise<GateResult>> = [];

  if (!skip.has(VITEST_GATE_IDS.all)) {
    concurrent.push(
      runVitestGate({ ...baseCfg, mode: "all", extraArgs: ["--coverage"] }),
    );
  }
  if (!skip.has(PLAYWRIGHT_FULL_GATE_ID)) {
    concurrent.push(runPlaywrightFullGate(baseCfg));
  }
  if (input.axe && !skip.has(AXE_ACCESSIBILITY_GATE_ID)) {
    concurrent.push(
      runAxeAccessibilityGate({
        config: baseCfg,
        routes: input.axe.routes,
        ...(input.axe.baseUrl !== undefined ? { baseUrl: input.axe.baseUrl } : {}),
        ...(input.axe.minSeverity !== undefined
          ? { minSeverity: input.axe.minSeverity }
          : {}),
      }),
    );
  }
  if (input.visual && !skip.has(VISUAL_REGRESSION_GATE_ID)) {
    concurrent.push(
      runVisualRegressionGate({
        config: baseCfg,
        routes: input.visual.routes,
        ...(input.visual.viewports !== undefined
          ? { viewports: input.visual.viewports }
          : {}),
        ...(input.visual.baseUrl !== undefined ? { baseUrl: input.visual.baseUrl } : {}),
      }),
    );
  }
  if (!skip.has(API_CONTRACT_VALIDATION_GATE_ID)) {
    concurrent.push(
      runApiContractValidationGate({
        config: baseCfg,
        ...(input.apiContract?.baseUrl !== undefined ? { baseUrl: input.apiContract.baseUrl } : {}),
        ...(input.apiContract?.fetch !== undefined ? { fetch: input.apiContract.fetch } : {}),
      }),
    );
  }
  if (!skip.has(MIGRATION_SAFETY_GATE_ID)) {
    concurrent.push(
      runMigrationSafetyGate({
        config: baseCfg,
        ...(input.migrations?.migrationsDir !== undefined
          ? { migrationsDir: input.migrations.migrationsDir }
          : {}),
      }),
    );
  }
  if (!skip.has(BUNDLE_SIZE_GATE_ID)) {
    concurrent.push(
      runBundleSizeGate({
        config: baseCfg,
        ...(input.bundleSize?.buildDir !== undefined ? { buildDir: input.bundleSize.buildDir } : {}),
        ...(input.bundleSize?.thresholds !== undefined ? { thresholds: input.bundleSize.thresholds } : {}),
        ...(input.bundleSize?.totalMaxBytes !== undefined ? { totalMaxBytes: input.bundleSize.totalMaxBytes } : {}),
        ...(input.bundleSize?.defaultMaxBytes !== undefined ? { defaultMaxBytes: input.bundleSize.defaultMaxBytes } : {}),
      }),
    );
  }
  if (!skip.has(LIGHTHOUSE_CI_GATE_ID)) {
    concurrent.push(
      runLighthouseCiGate({
        config: baseCfg,
        ...(input.lighthouse?.thresholds !== undefined ? { thresholds: input.lighthouse.thresholds } : {}),
        ...(input.lighthouse?.configPath !== undefined ? { configPath: input.lighthouse.configPath } : {}),
      }),
    );
  }
  if (!skip.has(NPM_AUDIT_GATE_ID)) {
    concurrent.push(runNpmAuditGate(baseCfg));
  }
  if (!skip.has(LICENSE_COMPLIANCE_GATE_ID)) {
    concurrent.push(
      runLicenseComplianceGate({
        config: baseCfg,
        ...(input.license?.forbidden !== undefined ? { forbidden: input.license.forbidden } : {}),
        ...(input.license?.failOnUnknown !== undefined ? { failOnUnknown: input.license.failOnUnknown } : {}),
      }),
    );
  }
  if (!skip.has(DEPENDENCY_FRESHNESS_GATE_ID)) {
    concurrent.push(runDependencyFreshnessGate(baseCfg));
  }

  const concurrentResults = await Promise.all(concurrent);
  gateResults.push(...concurrentResults);

  // ── Group 3: Contract hash verify (alone, last)
  if (!skip.has(CONTRACT_HASH_GATE_ID)) {
    gateResults.push(await runContractHashVerify(baseCfg));
  }

  // ── Verdict
  const verdict = computeVerdict(gateResults);
  const failedGates = gateResults
    .filter((g) => g.status === "fail" || g.status === "error")
    .map((g) => g.gateId);
  const warnGates = gateResults
    .filter(
      (g) =>
        SECONDARY_GATES.includes(g.gateId) &&
        (g.status === "fail" || g.status === "error"),
    )
    .map((g) => g.gateId);

  const endedAt = new Date().toISOString();
  return {
    gateResults,
    verdict: verdict.verdict,
    verdictReason: verdict.reason,
    failedGates,
    warnGates,
    startedAt,
    endedAt,
    durationMs: Date.now() - start,
  };
}

function computeVerdict(
  gateResults: GateResult[],
): { verdict: ReleaseVerdict; reason: string } {
  // HARD beats RED beats WARN beats GREEN.
  const byId = new Map(gateResults.map((g) => [g.gateId, g]));

  for (const id of INTEGRITY_GATES) {
    const g = byId.get(id);
    if (g && (g.status === "fail" || g.status === "error")) {
      return {
        verdict: "HARD",
        reason: `integrity gate failed: ${id}`,
      };
    }
  }

  const primaryFailures = PRIMARY_GATES.filter((id) => {
    const g = byId.get(id);
    return g && (g.status === "fail" || g.status === "error");
  });
  if (primaryFailures.length > 0) {
    return {
      verdict: "RED",
      reason: `primary gate(s) failed: ${primaryFailures.join(", ")}`,
    };
  }

  const secondaryFailures = SECONDARY_GATES.filter((id) => {
    const g = byId.get(id);
    return g && (g.status === "fail" || g.status === "error");
  });
  if (secondaryFailures.length > 0) {
    return {
      verdict: "WARN",
      reason: `secondary gate(s) failed: ${secondaryFailures.join(", ")}`,
    };
  }

  return { verdict: "GREEN", reason: "all release gates passed" };
}
