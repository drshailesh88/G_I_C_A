/**
 * run-one-attempt — executes ONE repair attempt for a single feature.
 *
 * Steps (blueprint Part 5.2 + task spec):
 *   (a) git commit checkpoint
 *   (b) build repair packet via packet-builder
 *   (c) invoke fixer provider (fresh session, narrow scope)
 *   (d) collect git diff vs checkpoint; run diff audit
 *   (e) if diff-audit violations → revert touched files, return VIOLATION
 *   (f) run fast-repair gates 1..14 in order, short-circuiting on hard fails
 *   (g) judge the bundle → GREEN | IMPROVED_NOT_GREEN | REGRESSED | BLOCKED
 *   (h) return AttemptResult with evidence + signatures for the caller
 *
 * The caller (feature-loop) is responsible for:
 *   - Applying state.json mutation measurements (on GREEN/IMPROVED_NOT_GREEN)
 *   - git reset --hard to preAttemptCommit (on REGRESSED)
 *   - Plateau bookkeeping (attempt counter + signature buffer)
 *   - Aggregating AttemptResults into a FeatureResult
 */
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  buildGateResult,
  defaultRunCommand,
  writeEvidence,
  type GateConfig,
  type RunCommandFn,
} from "./gates/base.js";
import { runContractHashVerify } from "./gates/contract-hash-verify.js";
import { runLockManifestVerify } from "./gates/lock-manifest-verify.js";
import { runTscGate } from "./gates/tsc.js";
import { runEslintGate } from "./gates/eslint.js";
import { runKnipGate } from "./gates/knip.js";
import { runVitestGate, type VitestMode } from "./gates/vitest.js";
import { runPlaywrightTargetedGate } from "./gates/playwright-targeted.js";
import { runContractTestCountGate } from "./gates/contract-test-count.js";
import { runTestCountSanityGate } from "./gates/test-count-sanity.js";
import {
  runStrykerIncrementalGate,
} from "./gates/stryker-incremental.js";
import { runTierFloorGate } from "./gates/tier-floor.js";
import { runRatchetGate } from "./gates/ratchet.js";
import { runDiffAudit, type DiffAuditResult } from "./diff-audit/diff-audit.js";
import {
  buildRepairPacket,
  type BuildPacketResult,
} from "./packet-builder.js";
import { parseStrykerReport } from "./parsers/stryker-json.js";
import { computePlateauSignature, judgeIteration, type JudgeReasoning } from "./judge.js";
import {
  findingToViolation,
} from "./diff-audit/regex-patterns.js";
import type {
  AntiCheatViolation,
  ContractIndex,
  FixerProvider,
  FixerResult,
  GateResult,
  IterationOutcome,
  PriorAttempt,
  RepairPacket,
  RunId,
  StateJson,
  StrykerResult,
  TierConfig,
  ViolationHistoryEntry,
} from "./types.js";

const ISO_NOW = (): string => new Date().toISOString();

// ─── Input / Output ───────────────────────────────────────────────────────────

export interface RunOneAttemptInput {
  runId: RunId;
  attemptNumber: number;
  sessionId: string;
  workingDir: string;
  runArtifactsDir: string;
  contract: ContractIndex;
  contractDir: string;
  state: StateJson;
  tiers: TierConfig;
  provider: FixerProvider;
  priorAttempts: PriorAttempt[];
  violationHistory: ViolationHistoryEntry[];
  runCommand?: RunCommandFn;
  getDirectDeps?: (file: string) => Promise<string[]>;
  getReverseDeps?: (files: string[]) => Promise<string[]>;
  /** Optional: override the list of locked globs to revert on VIOLATION.
   * Default: forbidden_edit_paths from the packet. */
  lockedRevertGlobs?: string[];
}

export interface AttemptResult {
  outcome: IterationOutcome;
  judgeReasoning: JudgeReasoning;
  gateResults: GateResult[];
  diffAuditResult: DiffAuditResult;
  packet: BuildPacketResult;
  fixerResult: FixerResult;
  plateauSignature: string;
  preAttemptCommit: string;
  violations: AntiCheatViolation[];
  /** Files the fixer edited this iteration (per `git diff --name-only HEAD`). */
  changedPaths: string[];
  /** Paths reverted on VIOLATION (empty otherwise). */
  revertedPaths: string[];
  startedAt: string;
  endedAt: string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runOneAttempt(
  input: RunOneAttemptInput,
): Promise<AttemptResult> {
  const startedAt = ISO_NOW();
  const runCommand = input.runCommand ?? defaultRunCommand();

  // (a) Checkpoint
  const preAttemptCommit = await createCheckpoint(runCommand, input);

  // (b) Packet
  const packet = await buildRepairPacket({
    runId: input.runId,
    attemptNumber: input.attemptNumber,
    sessionId: input.sessionId,
    workingDir: input.workingDir,
    runArtifactsDir: input.runArtifactsDir,
    contract: input.contract,
    contractDir: input.contractDir,
    state: input.state,
    failedGates: [], // building the packet BEFORE the fixer runs; no prior gates this iter
    priorAttempts: input.priorAttempts,
    violationHistory: input.violationHistory,
    ...(input.getDirectDeps !== undefined
      ? { getDirectDeps: input.getDirectDeps }
      : {}),
  });

  const repairPacket: RepairPacket = {
    path: packet.packetPath,
    frontmatter: packet.frontmatter,
    body: packet.bodyMarkdown,
  };

  // (c) Invoke fixer
  const fixerResult = await input.provider.invoke(
    repairPacket,
    input.runId,
    input.attemptNumber,
  );

  // (d) Collect diff + run audit
  const changedPaths = await gitDiffFileList(runCommand, input.workingDir);
  const diffText = await gitDiffText(runCommand, input.workingDir);
  const diffAuditResult = await runDiffAudit({
    diff: diffText,
    ...(input.getDirectDeps !== undefined
      ? {
          gitFileReader: async (path: string) => ({
            before: await gitShowPrior(runCommand, input.workingDir, path),
            after: await readFileOrEmpty(resolve(input.workingDir, path)),
          }),
        }
      : {
          gitFileReader: async (path: string) => ({
            before: await gitShowPrior(runCommand, input.workingDir, path),
            after: await readFileOrEmpty(resolve(input.workingDir, path)),
          }),
        }),
  });

  // Persist diff audit evidence
  await writeEvidence(
    join(input.runArtifactsDir, "evidence"),
    "diff-audit",
    `attempt-${input.attemptNumber}.json`,
    JSON.stringify(
      {
        violations: diffAuditResult.violations,
        warnings: diffAuditResult.warnings,
        changedFiles: diffAuditResult.changedFiles,
      },
      null,
      2,
    ),
  );
  await writeEvidence(
    join(input.runArtifactsDir, "evidence"),
    "diff-audit",
    `attempt-${input.attemptNumber}.diff`,
    diffText,
  );

  // (e) Violation short-circuit
  if (diffAuditResult.violations.length > 0) {
    const violations = diffAuditResult.violations.map((v) =>
      findingToViolation(
        {
          patternId: v.patternId,
          severity: v.severity,
          file: v.file,
          ...(v.line !== undefined ? { line: v.line } : {}),
          ...(v.message !== undefined ? { matchedContent: v.message } : {}),
        },
        ISO_NOW(),
      ),
    );
    const revertedPaths = await revertViolatingPaths(
      runCommand,
      input.workingDir,
      diffAuditResult.violations.map((v) => v.file),
      packet.frontmatter.forbidden_edit_paths,
    );
    const reasoning: JudgeReasoning = {
      outcome: "VIOLATION",
      reason: `diff audit: ${diffAuditResult.violations.length} reject-level violation(s)`,
      signals: diffAuditResult.violations
        .slice(0, 3)
        .map((v) => `${v.patternId} in ${v.file}`),
    };
    const plateauSignature = computePlateauSignature({
      gateResults: [],
      diffAudit: diffAuditResult,
      state: input.state,
    });
    return {
      outcome: "VIOLATION",
      judgeReasoning: reasoning,
      gateResults: [],
      diffAuditResult,
      packet,
      fixerResult,
      plateauSignature,
      preAttemptCommit,
      violations,
      changedPaths,
      revertedPaths,
      startedAt,
      endedAt: ISO_NOW(),
    };
  }

  // (f) Fast-repair gates 1..14 (minus #10 diff-audit which ran above)
  const evidenceDir = join(input.runArtifactsDir, "evidence");
  const baseCfg: GateConfig = {
    runId: input.runId,
    workingDir: input.workingDir,
    evidenceDir,
    ...(input.runCommand !== undefined ? { runCommand: input.runCommand } : {}),
    contractDir: input.contractDir,
    featureId: input.contract.feature.id,
  };

  const gateResults: GateResult[] = [];
  const pushAndShortCircuit = (g: GateResult): boolean => {
    gateResults.push(g);
    return g.shortCircuit && (g.status === "fail" || g.status === "error");
  };

  // Gate 1
  if (pushAndShortCircuit(await runContractHashVerify(baseCfg))) {
    return assembleEarlyExit(
      input,
      fixerResult,
      packet,
      diffAuditResult,
      gateResults,
      preAttemptCommit,
      changedPaths,
      startedAt,
    );
  }
  // Gate 2
  if (pushAndShortCircuit(await runLockManifestVerify(baseCfg))) {
    return assembleEarlyExit(
      input,
      fixerResult,
      packet,
      diffAuditResult,
      gateResults,
      preAttemptCommit,
      changedPaths,
      startedAt,
    );
  }

  // Gates 3-5 (static)
  gateResults.push(await runTscGate(baseCfg));
  gateResults.push(await runEslintGate(baseCfg));
  gateResults.push(await runKnipGate(baseCfg));

  // Gates 6-7 (Vitest unit + integration)
  gateResults.push(await runVitestGate({ ...baseCfg, mode: "unit" }));
  gateResults.push(await runVitestGate({ ...baseCfg, mode: "integration" }));
  // Gate 8 (Playwright targeted)
  const playwrightGate = await runPlaywrightTargetedGate(baseCfg);
  gateResults.push(playwrightGate);

  // Gate 9 (contract test count) — needs Playwright result
  const playwrightDetails = playwrightGate.details as {
    total?: number;
    passed?: number;
    failed?: number;
    skipped?: number;
    flaky?: number;
    executedSpecFiles?: string[];
    failures?: unknown[];
  };
  const playwrightResult = {
    total: playwrightDetails.total ?? 0,
    passed: playwrightDetails.passed ?? 0,
    failed: playwrightDetails.failed ?? 0,
    skipped: playwrightDetails.skipped ?? 0,
    flaky: playwrightDetails.flaky ?? 0,
    durationMs: 0,
    failures: [],
    executedSpecFiles: playwrightDetails.executedSpecFiles ?? [],
  };
  const ctcGate = await runContractTestCountGate({
    config: baseCfg,
    playwrightResult,
    contract: input.contract,
  });
  if (pushAndShortCircuit(ctcGate)) {
    return assembleEarlyExit(
      input,
      fixerResult,
      packet,
      diffAuditResult,
      gateResults,
      preAttemptCommit,
      changedPaths,
      startedAt,
    );
  }

  // Gate 11 (test count sanity) — needs Vitest + Playwright counts.
  const unitGate = gateResults.find((g) => g.gateId === "vitest-unit");
  const integrationGate = gateResults.find(
    (g) => g.gateId === "vitest-integration",
  );
  const unitTotal =
    unitGate && (unitGate.details as { total?: number }).total
      ? ((unitGate.details as { total?: number }).total as number)
      : 0;
  const integrationTotal =
    integrationGate && (integrationGate.details as { total?: number }).total
      ? ((integrationGate.details as { total?: number }).total as number)
      : 0;
  const tcsGate = await runTestCountSanityGate({
    config: baseCfg,
    state: input.state,
    sample: {
      vitest_unit: unitTotal,
      vitest_integration: integrationTotal,
      playwright: playwrightResult.total,
    },
  });
  if (pushAndShortCircuit(tcsGate)) {
    return assembleEarlyExit(
      input,
      fixerResult,
      packet,
      diffAuditResult,
      gateResults,
      preAttemptCommit,
      changedPaths,
      startedAt,
    );
  }

  // Gate 12 (Stryker incremental)
  const strykerGate = await runStrykerIncrementalGate({
    config: baseCfg,
    contract: input.contract,
    changedPaths,
    tiers: input.tiers,
    ...(input.getReverseDeps !== undefined
      ? { getReverseDeps: input.getReverseDeps }
      : {}),
  });
  gateResults.push(strykerGate);

  // Gates 13-14 (tier-floor + ratchet) need the parsed StrykerResult
  let strykerResult: StrykerResult | undefined;
  if (strykerGate.status === "pass" || strykerGate.status === "fail") {
    const details = strykerGate.details as {
      mutationJsonPath?: string;
      incrementalJsonPath?: string;
    };
    if (details.mutationJsonPath) {
      try {
        const hasIncremental =
          details.incrementalJsonPath !== undefined &&
          (await pathExists(details.incrementalJsonPath));
        strykerResult = await parseStrykerReport(details.mutationJsonPath, {
          tiers: input.tiers,
          ...(hasIncremental && details.incrementalJsonPath
            ? { incrementalPath: details.incrementalJsonPath }
            : {}),
        });
      } catch {
        // Parser error already surfaced by stryker gate; skip downstream.
      }
    }
  }

  if (strykerResult) {
    gateResults.push(
      await runTierFloorGate({
        config: baseCfg,
        strykerResult,
        tiers: input.tiers,
        state: input.state,
      }),
    );
    gateResults.push(
      await runRatchetGate({
        config: baseCfg,
        strykerResult,
        state: input.state,
      }),
    );
  } else {
    // No Stryker result available (skipped or parse error). Record placeholder
    // gates so the judge knows they ran.
    gateResults.push(
      buildGateResult({
        gateId: "tier-floor",
        status: "skipped",
        durationMs: 0,
        details: { reason: "no stryker result available" },
      }),
    );
    gateResults.push(
      buildGateResult({
        gateId: "ratchet",
        status: "skipped",
        durationMs: 0,
        details: { reason: "no stryker result available" },
      }),
    );
  }

  // (g) Judge
  const reasoning = judgeIteration({
    gateResults,
    diffAudit: diffAuditResult,
    state: input.state,
  });
  const plateauSignature = computePlateauSignature({
    gateResults,
    diffAudit: diffAuditResult,
    state: input.state,
  });

  return {
    outcome: reasoning.outcome,
    judgeReasoning: reasoning,
    gateResults,
    diffAuditResult,
    packet,
    fixerResult,
    plateauSignature,
    preAttemptCommit,
    violations: [],
    changedPaths,
    revertedPaths: [],
    startedAt,
    endedAt: ISO_NOW(),
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function createCheckpoint(
  runCommand: RunCommandFn,
  input: RunOneAttemptInput,
): Promise<string> {
  // Stage everything (including untracked) and commit with a checkpoint
  // message. If the tree is clean (nothing to commit), get the current HEAD
  // instead.
  await runCommand("git", ["add", "-A"], { cwd: input.workingDir });
  const statusOutcome = await runCommand(
    "git",
    ["status", "--porcelain"],
    { cwd: input.workingDir },
  );
  const dirty = statusOutcome.stdout.trim().length > 0;
  if (dirty) {
    const message = `qa checkpoint: ${input.contract.feature.id} attempt ${input.attemptNumber} (run ${input.runId})`;
    await runCommand("git", ["commit", "-m", message], {
      cwd: input.workingDir,
      env: { ...process.env, QA_CONTROLLER_COMMIT: "1" },
    });
  }
  const headOutcome = await runCommand("git", ["rev-parse", "HEAD"], {
    cwd: input.workingDir,
  });
  return headOutcome.stdout.trim();
}

async function gitDiffFileList(
  runCommand: RunCommandFn,
  cwd: string,
): Promise<string[]> {
  const outcome = await runCommand("git", ["diff", "--name-only", "HEAD"], {
    cwd,
  });
  return outcome.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function gitDiffText(
  runCommand: RunCommandFn,
  cwd: string,
): Promise<string> {
  const outcome = await runCommand("git", ["diff", "HEAD"], { cwd });
  return outcome.stdout;
}

async function gitShowPrior(
  runCommand: RunCommandFn,
  cwd: string,
  path: string,
): Promise<string> {
  const outcome = await runCommand("git", ["show", `HEAD:${path}`], { cwd });
  if (outcome.exitCode !== 0) return "";
  return outcome.stdout;
}

async function readFileOrEmpty(path: string): Promise<string> {
  try {
    return await fs.readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Revert files listed in violations, plus any file under forbidden_edit_paths
 * globs that was touched. Uses `git checkout HEAD -- <path>` per path.
 * Returns the list of paths it reverted.
 */
async function revertViolatingPaths(
  runCommand: RunCommandFn,
  cwd: string,
  violatingFiles: string[],
  forbiddenGlobs: string[],
): Promise<string[]> {
  const toRevert = new Set<string>();
  for (const f of violatingFiles) toRevert.add(f);
  for (const glob of forbiddenGlobs) toRevert.add(glob);

  const reverted: string[] = [];
  for (const target of toRevert) {
    const outcome = await runCommand(
      "git",
      ["checkout", "HEAD", "--", target],
      { cwd, env: { ...process.env, QA_CONTROLLER_COMMIT: "1" } },
    );
    if (outcome.exitCode === 0) reverted.push(target);
  }
  return reverted;
}

function assembleEarlyExit(
  input: RunOneAttemptInput,
  fixerResult: FixerResult,
  packet: BuildPacketResult,
  diffAuditResult: DiffAuditResult,
  gateResults: GateResult[],
  preAttemptCommit: string,
  changedPaths: string[],
  startedAt: string,
): AttemptResult {
  const reasoning = judgeIteration({
    gateResults,
    diffAudit: diffAuditResult,
    state: input.state,
  });
  const plateauSignature = computePlateauSignature({
    gateResults,
    diffAudit: diffAuditResult,
    state: input.state,
  });
  return {
    outcome: reasoning.outcome,
    judgeReasoning: reasoning,
    gateResults,
    diffAuditResult,
    packet,
    fixerResult,
    plateauSignature,
    preAttemptCommit,
    violations: [],
    changedPaths,
    revertedPaths: [],
    startedAt,
    endedAt: ISO_NOW(),
  };
}

// Ensure unused dirname import doesn't trip the linter when tests evolve.
void dirname;
