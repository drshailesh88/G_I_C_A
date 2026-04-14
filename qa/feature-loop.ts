/**
 * feature-loop — per-feature iteration controller (blueprint Part 5.2).
 *
 * Manages:
 *   - Attempt counter (cap: 10 per safety cap, configurable)
 *   - Plateau detection (P2): last 3 signatures identical → BLOCKED
 *   - State transitions:
 *       GREEN              → commit iteration, mark green, break
 *       IMPROVED_NOT_GREEN → commit iteration (new baseline), continue
 *       REGRESSED          → git reset --hard to preAttemptCommit, continue
 *       VIOLATION          → log violation entry, continue
 *       BLOCKED            → save evidence, break
 *
 * On GREEN and IMPROVED_NOT_GREEN, the loop applies mutation measurements
 * to the in-memory state so the next iteration sees updated baselines.
 * The controller commits state.json at session end.
 *
 * Returns a FeatureLoopResult with the full attempt trail + an aggregated
 * prior-attempt summary the caller passes to the next iteration's packet.
 */
import { dirname, join } from "node:path";
import { promises as fs } from "node:fs";
import {
  defaultRunCommand,
  type RunCommandFn,
} from "./gates/base.js";
import { runOneAttempt, type AttemptResult } from "./run-one-attempt.js";
import {
  applyMutationMeasurement,
  markFeatureBlocked,
  markFeatureGreen,
  incrementFeatureAttempt,
  resetFeatureAttempts,
} from "./state-manager.js";
import { parseStrykerReport } from "./parsers/stryker-json.js";
import type {
  ContractIndex,
  FeatureId,
  FixerProvider,
  GateResult,
  IterationOutcome,
  PriorAttempt,
  RunId,
  StateJson,
  StrykerFileScore,
  TierConfig,
  ViolationEntry,
  ViolationHistoryEntry,
} from "./types.js";

const ISO_NOW = (): string => new Date().toISOString();

// ─── Input / Output ───────────────────────────────────────────────────────────

export interface FeatureLoopInput {
  runId: RunId;
  sessionId: string;
  featureId: FeatureId;
  contract: ContractIndex;
  contractDir: string;
  state: StateJson;
  tiers: TierConfig;
  workingDir: string;
  runArtifactsDir: string;
  provider: FixerProvider;
  /** Safety cap per blueprint Part 5.2 — default 10. */
  maxAttempts?: number;
  /** Plateau detection buffer size — default 3. */
  plateauWindow?: number;
  runCommand?: RunCommandFn;
  getDirectDeps?: (file: string) => Promise<string[]>;
  getReverseDeps?: (files: string[]) => Promise<string[]>;
}

export type FeatureLoopFinalOutcome = "GREEN" | "BLOCKED";

export interface FeatureLoopResult {
  featureId: FeatureId;
  finalOutcome: FeatureLoopFinalOutcome;
  attempts: AttemptResult[];
  violationEntries: ViolationEntry[];
  /** Updated state (mutations applied from successful iterations). Callers
   * must persist this to state.json at session end. */
  state: StateJson;
  plateauBuffer: string[];
  priorAttemptSummaries: PriorAttempt[];
  startedAt: string;
  endedAt: string;
  blockedReason?: string;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runFeatureLoop(
  input: FeatureLoopInput,
): Promise<FeatureLoopResult> {
  const startedAt = ISO_NOW();
  const runCommand = input.runCommand ?? defaultRunCommand();
  const maxAttempts = input.maxAttempts ?? 10;
  const plateauWindow = input.plateauWindow ?? 3;

  let state = resetFeatureAttempts(input.state, input.featureId, startedAt);
  const attempts: AttemptResult[] = [];
  const violationEntries: ViolationEntry[] = [];
  const priorSummaries: PriorAttempt[] = [];
  const plateauBuffer: string[] = [];

  let finalOutcome: FeatureLoopFinalOutcome = "BLOCKED";
  let blockedReason: string | undefined = "attempts exhausted";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // The packet builder needs the C4 graduated view: older summaries first,
    // most recent is full-detail. Immediately-previous attempt gets error_output.
    const priorsForPacket = buildPriorsForPacket(priorSummaries);
    // Violation history is injected so the fixer can see what it already
    // tried and got rejected for.
    const violationHistory = buildViolationHistory(attempts);

    const attemptResult = await runOneAttempt({
      runId: input.runId,
      attemptNumber: attempt,
      sessionId: input.sessionId,
      workingDir: input.workingDir,
      runArtifactsDir: input.runArtifactsDir,
      contract: input.contract,
      contractDir: input.contractDir,
      state,
      tiers: input.tiers,
      provider: input.provider,
      priorAttempts: priorsForPacket,
      violationHistory,
      runCommand,
      ...(input.getDirectDeps !== undefined
        ? { getDirectDeps: input.getDirectDeps }
        : {}),
      ...(input.getReverseDeps !== undefined
        ? { getReverseDeps: input.getReverseDeps }
        : {}),
    });
    attempts.push(attemptResult);

    // Track plateau signature (always — even for GREEN, we record for audit).
    plateauBuffer.push(attemptResult.plateauSignature);
    state = incrementFeatureAttempt(
      state,
      input.featureId,
      attemptResult.plateauSignature,
      attemptResult.endedAt,
    );

    // Record this attempt into the summary pool for future iterations.
    const priorForNext: PriorAttempt = {
      attempt,
      approach: summarizeAttemptApproach(attemptResult),
      result: attemptResult.judgeReasoning.reason,
      ...(extractPrimaryErrorOutput(attemptResult) !== undefined
        ? { error_output: extractPrimaryErrorOutput(attemptResult) as string }
        : {}),
    };
    priorSummaries.push(priorForNext);

    // Dispatch on outcome.
    switch (attemptResult.outcome) {
      case "GREEN": {
        state = await applyMutationUpdates(
          state,
          attemptResult,
          input,
        );
        state = markFeatureGreen(
          state,
          input.featureId,
          input.runId,
          attemptResult.endedAt,
        );
        await commitIteration(runCommand, input.workingDir, {
          featureId: input.featureId,
          attempt,
          runId: input.runId,
          label: "green",
        });
        finalOutcome = "GREEN";
        blockedReason = undefined;
        return finalize(
          finalOutcome,
          attempts,
          violationEntries,
          state,
          plateauBuffer,
          priorSummaries,
          startedAt,
          blockedReason,
          input.featureId,
        );
      }

      case "IMPROVED_NOT_GREEN": {
        state = await applyMutationUpdates(
          state,
          attemptResult,
          input,
        );
        await commitIteration(runCommand, input.workingDir, {
          featureId: input.featureId,
          attempt,
          runId: input.runId,
          label: "progress",
        });
        break;
      }

      case "REGRESSED": {
        await runCommand(
          "git",
          ["reset", "--hard", attemptResult.preAttemptCommit],
          {
            cwd: input.workingDir,
            env: { ...process.env, QA_CONTROLLER_COMMIT: "1" },
          },
        );
        break;
      }

      case "VIOLATION": {
        if (attemptResult.violations.length > 0) {
          violationEntries.push({
            run_id: input.runId,
            feature_id: input.featureId,
            attempt,
            detected_at: attemptResult.endedAt,
            provider: attemptResult.fixerResult.providerName,
            violations: attemptResult.violations,
            reverted_paths: attemptResult.revertedPaths,
          });
        }
        // After revert, make sure the working tree returns to preAttemptCommit
        // for anything that slipped past revertViolatingPaths.
        await runCommand(
          "git",
          ["reset", "--hard", attemptResult.preAttemptCommit],
          {
            cwd: input.workingDir,
            env: { ...process.env, QA_CONTROLLER_COMMIT: "1" },
          },
        );
        break;
      }

      case "BLOCKED": {
        finalOutcome = "BLOCKED";
        blockedReason = attemptResult.judgeReasoning.reason;
        state = markFeatureBlocked(state, input.featureId, {
          reason: blockedReason,
          signature: attemptResult.plateauSignature,
          timestamp: attemptResult.endedAt,
        });
        await saveBlockedEvidence(input.runArtifactsDir, input.featureId, {
          attempt,
          blockedReason,
          attemptResult,
        });
        return finalize(
          finalOutcome,
          attempts,
          violationEntries,
          state,
          plateauBuffer,
          priorSummaries,
          startedAt,
          blockedReason,
          input.featureId,
        );
      }
    }

    // Plateau detection — last N signatures identical?
    if (plateauBuffer.length >= plateauWindow) {
      const recent = plateauBuffer.slice(-plateauWindow);
      const first = recent[0];
      const allSame = first !== undefined && recent.every((s) => s === first);
      if (allSame) {
        finalOutcome = "BLOCKED";
        blockedReason = `plateau: ${plateauWindow} consecutive identical signatures (${first.slice(0, 12)})`;
        state = markFeatureBlocked(state, input.featureId, {
          reason: blockedReason,
          signature: first,
          timestamp: attemptResult.endedAt,
        });
        await saveBlockedEvidence(input.runArtifactsDir, input.featureId, {
          attempt,
          blockedReason,
          attemptResult,
        });
        return finalize(
          finalOutcome,
          attempts,
          violationEntries,
          state,
          plateauBuffer,
          priorSummaries,
          startedAt,
          blockedReason,
          input.featureId,
        );
      }
    }
  }

  // Hit safety cap without GREEN.
  state = markFeatureBlocked(state, input.featureId, {
    reason: blockedReason ?? "max attempts reached",
    signature: plateauBuffer[plateauBuffer.length - 1] ?? "",
    timestamp: ISO_NOW(),
  });
  return finalize(
    "BLOCKED",
    attempts,
    violationEntries,
    state,
    plateauBuffer,
    priorSummaries,
    startedAt,
    blockedReason,
    input.featureId,
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function finalize(
  finalOutcome: FeatureLoopFinalOutcome,
  attempts: AttemptResult[],
  violationEntries: ViolationEntry[],
  state: StateJson,
  plateauBuffer: string[],
  priorSummaries: PriorAttempt[],
  startedAt: string,
  blockedReason: string | undefined,
  featureId: FeatureId,
): FeatureLoopResult {
  return {
    featureId,
    finalOutcome,
    attempts,
    violationEntries,
    state,
    plateauBuffer,
    priorAttemptSummaries: priorSummaries,
    startedAt,
    endedAt: ISO_NOW(),
    ...(blockedReason !== undefined ? { blockedReason } : {}),
  };
}

function buildPriorsForPacket(full: PriorAttempt[]): PriorAttempt[] {
  // C4 graduated fidelity: all get summary; most-recent gets error_output
  // already (we set it at entry time). For OLDER entries strip error_output.
  if (full.length === 0) return [];
  return full.map((p, idx) => {
    if (idx === full.length - 1) return p; // most recent retains detail
    const { error_output: _omit, ...rest } = p;
    void _omit;
    return rest;
  });
}

function buildViolationHistory(attempts: AttemptResult[]): ViolationHistoryEntry[] {
  const result: ViolationHistoryEntry[] = [];
  for (const a of attempts) {
    if (a.outcome !== "VIOLATION" || a.violations.length === 0) continue;
    const patternIds = Array.from(
      new Set(a.violations.map((v) => v.pattern_id)),
    );
    result.push({
      attempt: a.packet.frontmatter.attempt_number,
      pattern_ids: patternIds,
      offending_diff: a.diffAuditResult.changedFiles.join("\n"),
    });
  }
  return result;
}

function summarizeAttemptApproach(result: AttemptResult): string {
  const provider = result.fixerResult.providerName;
  const files = result.changedPaths.length;
  const outcome = result.outcome;
  return `${provider} edited ${files} file(s); outcome=${outcome}`;
}

function extractPrimaryErrorOutput(result: AttemptResult): string | undefined {
  for (const g of result.gateResults) {
    if (g.status !== "fail" && g.status !== "error") continue;
    const details = g.details as { failures?: Array<{ error?: string }> };
    if (details.failures && details.failures.length > 0) {
      return details.failures
        .slice(0, 3)
        .map((f) => f.error ?? "")
        .filter((s) => s.length > 0)
        .join("\n---\n");
    }
  }
  return undefined;
}

async function commitIteration(
  runCommand: RunCommandFn,
  cwd: string,
  input: {
    featureId: string;
    attempt: number;
    runId: RunId;
    label: "progress" | "green";
  },
): Promise<void> {
  const status = await runCommand("git", ["status", "--porcelain"], { cwd });
  if (status.stdout.trim().length === 0) return;
  await runCommand("git", ["add", "-A"], { cwd });
  const message = `qa ${input.label}: ${input.featureId} attempt ${input.attempt} (run ${input.runId})`;
  await runCommand("git", ["commit", "-m", message], {
    cwd,
    env: { ...process.env, QA_CONTROLLER_COMMIT: "1" },
  });
}

async function applyMutationUpdates(
  state: StateJson,
  attemptResult: AttemptResult,
  input: FeatureLoopInput,
): Promise<StateJson> {
  // Parse the stryker result one more time to apply measurements per-module.
  // The ratchet gate already confirmed no regressions for us; this just
  // advances the baseline.
  const strykerGate = attemptResult.gateResults.find(
    (g: GateResult) => g.gateId === "stryker-incremental",
  );
  if (!strykerGate) return state;
  const details = strykerGate.details as {
    mutationJsonPath?: string;
    incrementalJsonPath?: string;
  };
  if (!details.mutationJsonPath) return state;

  let stryker;
  try {
    stryker = await parseStrykerReport(details.mutationJsonPath, {
      tiers: input.tiers,
      ...(details.incrementalJsonPath
        ? { incrementalPath: details.incrementalJsonPath }
        : {}),
    });
  } catch {
    return state;
  }

  let current = state;
  for (const [filePath, score] of stryker.perFile.entries()) {
    if (score.score === null) continue;
    if (!score.freshlyMeasured) continue;
    const tier = score.tier;
    if (!tier) continue; // unclassified — handled by 6b.iii elsewhere
    try {
      current = applyMutationMeasurement({
        state: current,
        modulePath: filePath,
        newScore: score.score,
        tier,
        runId: input.runId,
        timestamp: attemptResult.endedAt,
      }).state;
    } catch {
      // Ratchet violation shouldn't reach here (judge caught it). Swallow so
      // we don't crash the loop on an edge case.
    }
  }
  // Avoid unused parameter warning when StrykerFileScore type changes.
  void ({} as StrykerFileScore);
  return current;
}

async function saveBlockedEvidence(
  runArtifactsDir: string,
  featureId: FeatureId,
  info: {
    attempt: number;
    blockedReason: string;
    attemptResult: AttemptResult;
  },
): Promise<void> {
  const dir = join(runArtifactsDir, "blocked", featureId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    join(dir, "reason.md"),
    [
      `# BLOCKED: ${featureId}`,
      ``,
      `**Attempt:** ${info.attempt}`,
      `**Reason:** ${info.blockedReason}`,
      `**Plateau signature:** ${info.attemptResult.plateauSignature}`,
      ``,
      `## Last attempt details`,
      ``,
      `- Outcome: ${info.attemptResult.outcome}`,
      `- Gates run: ${info.attemptResult.gateResults.length}`,
      `- Fixer exit code: ${info.attemptResult.fixerResult.exitCode}`,
      `- Files edited: ${info.attemptResult.fixerResult.filesEditedCount}`,
      ``,
      `## Judge reasoning`,
      ``,
      `${info.attemptResult.judgeReasoning.reason}`,
      ``,
      `## Signals`,
      ``,
      ...info.attemptResult.judgeReasoning.signals.map((s) => `- ${s}`),
    ].join("\n"),
  );
}

// Silence unused-import tripper in some TS configurations.
void dirname;
