/**
 * Repair packet builder (blueprint Part 6.1, F4 format).
 *
 * Generates `.quality/runs/<run-id>/packets/<feature>-<attempt>.md` with YAML
 * frontmatter (machine-parseable) and a markdown body (AI-friendly).
 *
 * Inputs:
 *   - Feature contract (already validated ContractIndex)
 *   - Failed GateResults from the current attempt (if any)
 *   - DiffAuditResult from the current attempt (if any — used to build
 *     violation history)
 *   - Current StateJson for ratchet baseline comparisons
 *   - Prior-attempt summaries (caller assembles — C4 graduated fidelity)
 *
 * Computes:
 *   - codebase_context: getDirectDeps() of each failing source file, union
 *     deduped, depth 1.
 *   - hypothesis: pattern matching on failing gate errors → {confidence,
 *     summary, evidence}. Heuristics only; never binding.
 *   - ratchet_targets: tier floor for every module in contract scope that
 *     has a baseline, plus Playwright pass for the feature.
 *   - allowed_edit_paths: contract.affected_modules + common test helpers.
 *   - forbidden_edit_paths: the standard locked set.
 */
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import yaml from "js-yaml";
import {
  FailedGateDetailSchema,
  RepairPacketFrontmatterSchema,
  TierFloors,
  type ContractIndex,
  type FailedGateDetail,
  type GateResult,
  type Hypothesis,
  type PriorAttempt,
  type RatchetTarget,
  type RepairPacketFrontmatter,
  type RunId,
  type StateJson,
  type ViolationHistoryEntry,
} from "./types.js";
import type { DiffAuditResult } from "./diff-audit/diff-audit.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PacketBuilderInput {
  runId: RunId;
  attemptNumber: number;
  sessionId: string;
  workingDir: string;
  runArtifactsDir: string;
  contract: ContractIndex;
  contractDir: string;
  state: StateJson;
  /** Gate results whose status is 'fail' or 'error'. Passed results are
   * allowed but will be ignored. */
  failedGates: GateResult[];
  /** The attempt-1 through attempt-N-1 history, already C4-fidelity formatted
   * by the feature-loop caller. Most-recent LAST. */
  priorAttempts: PriorAttempt[];
  violationHistory: ViolationHistoryEntry[];
  /** Files changed by the most recent fixer invocation — used to refine
   * codebase_context. */
  changedPaths?: string[];
  /** Injectable for tests / Phase 5. Default: no-op returns []. */
  getDirectDeps?: (file: string) => Promise<string[]>;
  /** Max turns budget passed to the fixer provider. Default: 30. */
  maxTurns?: number;
}

export interface BuildPacketResult {
  packetPath: string;
  frontmatter: RepairPacketFrontmatter;
  bodyMarkdown: string;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export async function buildRepairPacket(
  input: PacketBuilderInput,
): Promise<BuildPacketResult> {
  const failedGates = input.failedGates.filter(
    (g) => g.status === "fail" || g.status === "error",
  );
  const mappedFailedGates = failedGates.map(gateResultToFailedGateDetail);
  const ratchetTargets = buildRatchetTargets(
    input.contract,
    input.state,
  );
  const codebaseContext = await buildCodebaseContext(
    failedGates,
    input.changedPaths ?? [],
    input.getDirectDeps,
  );
  const hypothesis = buildHypothesis(failedGates);
  const evidencePaths = collectEvidencePaths(failedGates);

  const frontmatter: RepairPacketFrontmatter =
    RepairPacketFrontmatterSchema.parse({
      packet_version: 1,
      run_id: input.runId,
      feature_id: input.contract.feature.id,
      attempt_number: input.attemptNumber,
      session_id: input.sessionId,
      failed_gates: mappedFailedGates,
      ratchet_targets: ratchetTargets,
      allowed_edit_paths: buildAllowedEditPaths(input.contract),
      forbidden_edit_paths: buildForbiddenEditPaths(),
      codebase_context: codebaseContext,
      ...(hypothesis ? { hypothesis } : {}),
      evidence_paths: evidencePaths,
      prior_attempts: input.priorAttempts,
      violation_history: input.violationHistory,
      max_turns: input.maxTurns ?? 30,
    });

  const bodyMarkdown = renderBody(input, frontmatter, failedGates);

  const packetPath = join(
    input.runArtifactsDir,
    "packets",
    `${input.contract.feature.id}-${input.attemptNumber}.md`,
  );
  const content = `---\n${yaml.dump(frontmatter, {
    lineWidth: 120,
    noRefs: true,
  })}---\n\n${bodyMarkdown}`;

  await fs.mkdir(dirname(packetPath), { recursive: true });
  await fs.writeFile(packetPath, content, "utf8");

  return { packetPath, frontmatter, bodyMarkdown };
}

// ─── Parse an existing packet ─────────────────────────────────────────────────

/**
 * Load a packet previously written by buildRepairPacket. Useful for
 * controller + provider layers that receive just the path. Validates the
 * frontmatter via Zod.
 */
export async function loadRepairPacket(
  path: string,
): Promise<BuildPacketResult> {
  const raw = await fs.readFile(path, "utf8");
  if (!raw.startsWith("---")) {
    throw new Error(`invalid packet at ${path}: missing YAML frontmatter`);
  }
  const endIdx = raw.indexOf("\n---", 4);
  if (endIdx === -1) {
    throw new Error(`invalid packet at ${path}: unterminated frontmatter`);
  }
  const frontmatterRaw = raw.slice(4, endIdx).trim();
  const bodyMarkdown = raw.slice(endIdx + 4).replace(/^\n+/, "");

  const parsed = yaml.load(frontmatterRaw);
  const frontmatter = RepairPacketFrontmatterSchema.parse(parsed);
  return { packetPath: path, frontmatter, bodyMarkdown };
}

// ─── Gate → FailedGateDetail mapping ──────────────────────────────────────────

function gateResultToFailedGateDetail(g: GateResult): FailedGateDetail {
  const details = g.details as Record<string, unknown>;
  const base: FailedGateDetail = FailedGateDetailSchema.parse({
    gate: g.gateId,
    ...(typeof details.failed === "number" ? { tests_failed: details.failed } : {}),
    ...(typeof details.total === "number" ? { tests_total: details.total } : {}),
    ...(mapFirstFailure(details)
      ? { first_failure: mapFirstFailure(details) }
      : {}),
    ...(g.gateId === "stryker-incremental" && Array.isArray(details.perFileSummary)
      ? {
          module_mutation_scores: Object.fromEntries(
            (details.perFileSummary as Array<{ filePath: string; score: number | null }>)
              .filter((m) => m.score !== null)
              .map((m) => [m.filePath, m.score as number]),
          ),
          surviving_mutants_count: (details.perFileSummary as Array<{ survived: number }>)
            .reduce((sum, m) => sum + m.survived, 0),
        }
      : {}),
    ...(g.gateId === "tier-floor" && typeof details.regressionsBelowFloor === "number"
      ? {
          message: `${details.regressionsBelowFloor} modules regressed below tier floor`,
        }
      : {}),
    ...(g.gateId === "ratchet" && typeof details.regressedCount === "number"
      ? {
          message: `ratchet: ${details.regressedCount} regressed, ${details.improvedCount ?? 0} improved`,
        }
      : {}),
    ...(g.status === "error" && typeof details.parseError === "string"
      ? { message: `error: ${details.parseError}` }
      : {}),
  });
  return base;
}

function mapFirstFailure(details: Record<string, unknown>): FailedGateDetail["first_failure"] | undefined {
  const failures = details.failures;
  if (!Array.isArray(failures) || failures.length === 0) return undefined;
  const f = failures[0] as Record<string, unknown>;
  return {
    test: `${f.suite ?? f.file ?? "?"}: ${f.test ?? f.title ?? "?"}`,
    ...(typeof f.error === "string" ? { expected: undefined, received: f.error } : {}),
  };
}

// ─── Ratchet targets ──────────────────────────────────────────────────────────

function buildRatchetTargets(
  contract: ContractIndex,
  state: StateJson,
): RatchetTarget[] {
  const targets: RatchetTarget[] = [];
  for (const modulePath of Object.keys(state.modules)) {
    const baseline = state.modules[modulePath];
    if (!baseline) continue;
    const floor = TierFloors[baseline.tier];
    if (floor === null) continue;
    // Only include modules within contract scope.
    if (!isInContractScope(modulePath, contract.affected_modules)) continue;
    targets.push({
      metric: `mutation_score.${modulePath}`,
      must_be: `>= ${floor}`,
    });
  }
  // Always include a Playwright targeted assertion for the feature.
  targets.push({
    metric: `playwright.${contract.feature.id}.acceptance`,
    must_be: "all_pass",
  });
  return targets;
}

function isInContractScope(filePath: string, scope: string[]): boolean {
  for (const glob of scope) {
    const regex = globToRegex(glob);
    if (regex.test(filePath)) return true;
  }
  return false;
}

function globToRegex(glob: string): RegExp {
  let pattern = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        pattern += ".*";
        i++;
      } else {
        pattern += "[^/]*";
      }
    } else if (c === "?") {
      pattern += "[^/]";
    } else if (/[.+^${}()|[\]\\]/.test(c as string)) {
      pattern += `\\${c}`;
    } else {
      pattern += c;
    }
  }
  return new RegExp(`^${pattern}$`);
}

// ─── Edit path sets ───────────────────────────────────────────────────────────

function buildAllowedEditPaths(contract: ContractIndex): string[] {
  const paths = new Set<string>(contract.affected_modules);
  paths.add("tests/unit/**");
  paths.add("tests/integration/**");
  paths.add("tests/helpers/**");
  return [...paths];
}

function buildForbiddenEditPaths(): string[] {
  return [
    ".quality/**",
    "vitest.config.ts",
    "vitest.config.mjs",
    "playwright.config.ts",
    "stryker.conf.mjs",
    "stryker.conf.json",
    "tsconfig.json",
    "eslint.config.mjs",
    "tests/contracts/**",
    "tests/e2e/**",
    "e2e/**",
    "**/__snapshots__/**",
    "**/*-snapshots/**",
    ".claude/settings.json",
    ".claude/hooks/**",
  ];
}

// ─── Codebase context ─────────────────────────────────────────────────────────

async function buildCodebaseContext(
  failedGates: GateResult[],
  changedPaths: string[],
  getDirectDeps?: (file: string) => Promise<string[]>,
): Promise<string[]> {
  const failingSourceFiles = new Set<string>();
  for (const gate of failedGates) {
    const details = gate.details as { failures?: Array<{ file?: string }> };
    for (const f of details.failures ?? []) {
      if (typeof f.file === "string" && isSourceOrTest(f.file)) {
        failingSourceFiles.add(f.file);
      }
    }
  }
  for (const p of changedPaths) {
    if (isSourceOrTest(p)) failingSourceFiles.add(p);
  }

  const context = new Set<string>(failingSourceFiles);
  if (getDirectDeps) {
    for (const file of failingSourceFiles) {
      try {
        const deps = await getDirectDeps(file);
        for (const d of deps) context.add(d);
      } catch {
        // swallow — codebase_context is advisory
      }
    }
  }

  return [...context].sort();
}

function isSourceOrTest(path: string): boolean {
  return (
    path.startsWith("src/") ||
    path.startsWith("app/") ||
    path.startsWith("lib/") ||
    path.startsWith("components/") ||
    path.startsWith("pages/") ||
    path.startsWith("tests/") ||
    path.startsWith("e2e/")
  );
}

// ─── Hypothesis ───────────────────────────────────────────────────────────────

function buildHypothesis(failedGates: GateResult[]): Hypothesis | undefined {
  const signals: string[] = [];
  let confidence: Hypothesis["confidence"] = "low";
  let summary = "";

  const vitestGate = failedGates.find(
    (g) => g.gateId === "vitest-unit" || g.gateId === "vitest-integration",
  );
  if (vitestGate) {
    const details = vitestGate.details as {
      failures?: Array<{ error?: string; suite?: string; test?: string }>;
    };
    const firstError = details.failures?.[0]?.error ?? "";
    if (
      /Cannot read (propert(?:y|ies)[\s'"\w]*\s+of\s+)?(undefined|null)/i.test(
        firstError,
      )
    ) {
      confidence = "medium";
      summary = "Test error suggests a missing null/undefined guard on a property access. Trace the property chain and add an explicit check.";
      signals.push(`vitest: "${firstError.slice(0, 120)}"`);
    } else if (/Timeout|timed out|exceeded.*ms/i.test(firstError)) {
      confidence = "medium";
      summary = "Test timed out — check for a pending promise, missing await, or unhandled async path.";
      signals.push(`vitest: "${firstError.slice(0, 120)}"`);
    } else if (/Type\s+['"]\w+['"]\s+is not assignable/i.test(firstError)) {
      confidence = "low";
      summary = "TypeScript type mismatch surfaced by tsc or inline assertion. Narrow the type or adjust the public shape.";
      signals.push(`vitest: "${firstError.slice(0, 120)}"`);
    } else if (/expected\b.*received|Expected\b.*Received/i.test(firstError)) {
      confidence = "medium";
      summary = "Assertion mismatch: the function returns something other than the expected value. Inspect the code path for early returns and branch conditions.";
      signals.push(`vitest: "${firstError.slice(0, 120)}"`);
    } else if (firstError) {
      confidence = "low";
      summary = "Test failure detected. See evidence for full stack trace.";
      signals.push(`vitest: "${firstError.slice(0, 120)}"`);
    }
  }

  const playwrightGate = failedGates.find((g) => g.gateId === "playwright-targeted");
  if (playwrightGate && !summary) {
    const details = playwrightGate.details as {
      failures?: Array<{ error?: string }>;
    };
    const firstError = details.failures?.[0]?.error ?? "";
    if (/selector.*not found|locator.*resolv/i.test(firstError)) {
      confidence = "medium";
      summary = "E2E selector failed — the DOM is either missing the expected element or a data-testid drifted. Use /playbook:wire-selectors.";
    } else if (/timeout/i.test(firstError)) {
      confidence = "medium";
      summary = "E2E action timed out — check for blocking network call, missing mock, or unawaited navigation.";
    } else if (firstError) {
      confidence = "low";
      summary = "E2E failure detected. See trace/screenshot for context.";
    }
    if (firstError) signals.push(`playwright: "${firstError.slice(0, 120)}"`);
  }

  const strykerGate = failedGates.find((g) => g.gateId === "stryker-incremental");
  if (strykerGate && !summary) {
    const details = strykerGate.details as {
      perFileSummary?: Array<{ filePath: string; survived: number; score: number | null }>;
    };
    const worst = (details.perFileSummary ?? []).slice().sort((a, b) => b.survived - a.survived)[0];
    if (worst && worst.survived > 0) {
      confidence = "medium";
      summary = `Surviving mutants cluster in ${worst.filePath} (${worst.survived} survived). Test the boundary conditions + off-by-one cases in that module.`;
      signals.push(`stryker: ${worst.filePath} has ${worst.survived} surviving mutants`);
    }
  }

  const ratchetGate = failedGates.find((g) => g.gateId === "ratchet");
  if (ratchetGate && !summary) {
    const details = ratchetGate.details as {
      modules?: Array<{ filePath: string; delta: string; deltaValue: number | null }>;
    };
    const regressed = (details.modules ?? []).filter((m) => m.delta === "REGRESSED");
    if (regressed.length > 0) {
      confidence = "medium";
      summary = `Mutation score regressed on ${regressed.length} module(s) — recent changes likely weakened existing tests. Inspect removed/modified assertions.`;
      for (const m of regressed.slice(0, 3)) {
        signals.push(`ratchet: ${m.filePath} delta ${m.deltaValue ?? "?"}`);
      }
    }
  }

  if (!summary) return undefined;
  return { confidence, summary, evidence: signals };
}

// ─── Evidence paths ───────────────────────────────────────────────────────────

function collectEvidencePaths(failedGates: GateResult[]): string[] {
  const paths = new Set<string>();
  for (const gate of failedGates) {
    for (const art of gate.artifacts) paths.add(art);
  }
  return [...paths].sort();
}

// ─── Body rendering ───────────────────────────────────────────────────────────

function renderBody(
  input: PacketBuilderInput,
  frontmatter: RepairPacketFrontmatter,
  failedGates: GateResult[],
): string {
  const lines: string[] = [];

  const taskSummary = buildTaskSummary(input, failedGates);
  lines.push(`## Task`);
  lines.push("");
  lines.push(taskSummary);
  lines.push("");

  if (frontmatter.hypothesis) {
    lines.push(`## Working Hypothesis (confidence: ${frontmatter.hypothesis.confidence})`);
    lines.push("");
    lines.push(frontmatter.hypothesis.summary);
    if (frontmatter.hypothesis.evidence.length > 0) {
      lines.push("");
      lines.push("Signals:");
      for (const e of frontmatter.hypothesis.evidence) {
        lines.push(`- ${e}`);
      }
    }
    lines.push("");
  }

  if (failedGates.length > 0) {
    lines.push(`## Failing Gates`);
    lines.push("");
    for (const gate of failedGates) {
      lines.push(`### ${gate.gateId}`);
      const summary = summarizeGateFailure(gate);
      if (summary) {
        lines.push("");
        lines.push(summary);
      }
      lines.push("");
    }
  }

  lines.push(`## Rules (non-negotiable)`);
  lines.push("");
  for (const rule of REPAIR_RULES) {
    lines.push(`- ${rule}`);
  }
  lines.push("");

  if (input.priorAttempts.length > 0) {
    lines.push(`## Previous Attempts (chronological)`);
    lines.push("");
    for (const p of input.priorAttempts) {
      lines.push(`**Attempt ${p.attempt}:** ${p.approach} — _${p.result}_`);
      if (p.error_output) {
        lines.push("");
        lines.push("```");
        lines.push(p.error_output.slice(0, 2000));
        lines.push("```");
      }
      lines.push("");
    }
  }

  if (input.violationHistory.length > 0) {
    lines.push(`## Cheating Attempts Rejected Previously`);
    lines.push("");
    for (const v of input.violationHistory) {
      lines.push(`**Attempt ${v.attempt}** flagged [${v.pattern_ids.join(", ")}].`);
      lines.push("Do NOT repeat this approach:");
      lines.push("");
      lines.push("```diff");
      lines.push(v.offending_diff.slice(0, 2000));
      lines.push("```");
      lines.push("");
    }
  }

  if (frontmatter.evidence_paths.length > 0) {
    lines.push(`## Evidence`);
    lines.push("");
    for (const path of frontmatter.evidence_paths) {
      lines.push(`- \`${path}\``);
    }
    lines.push("");
  }

  lines.push(`---`);
  lines.push(
    `When done, write a brief approach summary to \`${input.runArtifactsDir}/fixer-notes/${frontmatter.feature_id}-${frontmatter.attempt_number}.md\`.`,
  );
  lines.push("");

  return lines.join("\n");
}

const REPAIR_RULES: readonly string[] = [
  "Do NOT edit any path listed in `forbidden_edit_paths` (see frontmatter).",
  "Do NOT add `.skip`, `.only`, `test.todo`, or `describe.skip` to any test file.",
  "Do NOT weaken assertions (removing `expect()` calls, replacing specific matchers with `toBeTruthy()`).",
  "Do NOT widen coverage exclusions or lower mutation thresholds.",
  "Do NOT use `mockReturnValue(X)` where `X` matches an assertion value in the same test.",
  "Do NOT introduce `if/else` branching inside test bodies.",
  "Stay within `allowed_edit_paths` (see frontmatter).",
  "Fix the root cause — do not hardcode return values to satisfy failing tests.",
];

function buildTaskSummary(
  input: PacketBuilderInput,
  failedGates: GateResult[],
): string {
  if (failedGates.length === 0) {
    return `Repair feature **${input.contract.feature.title}** (\`${input.contract.feature.id}\`). No gates failed — improve mutation resilience on modules listed in \`affected_modules\`.`;
  }
  const names = failedGates.map((g) => g.gateId).join(", ");
  return `Repair feature **${input.contract.feature.title}** (\`${input.contract.feature.id}\`). Failing gates: ${names}. Goal: bring every gate to \`pass\` without touching locked surfaces.`;
}

function summarizeGateFailure(gate: GateResult): string {
  const details = gate.details as Record<string, unknown>;
  const lines: string[] = [];

  if (typeof details.failed === "number" && typeof details.total === "number") {
    lines.push(`- ${details.failed} of ${details.total} tests failed`);
  }
  if (Array.isArray(details.failures) && details.failures.length > 0) {
    lines.push("- Top failures:");
    for (const f of (details.failures as Array<Record<string, unknown>>).slice(0, 3)) {
      lines.push(
        `  - \`${f.suite ?? f.file ?? "?"}\` › ${f.test ?? f.title ?? "?"}: ${String(f.error ?? "").slice(0, 240)}`,
      );
    }
  }
  if (typeof details.errorCount === "number") {
    lines.push(`- ${details.errorCount} errors reported`);
  }
  if (typeof details.warningCount === "number" && details.warningCount > 0) {
    lines.push(`- ${details.warningCount} warnings reported`);
  }
  if (gate.gateId === "stryker-incremental" && Array.isArray(details.perFileSummary)) {
    lines.push("- Modules with surviving mutants:");
    for (const m of (details.perFileSummary as Array<{
      filePath: string;
      survived: number;
      score: number | null;
    }>).slice(0, 5)) {
      if (m.survived > 0) {
        lines.push(`  - \`${m.filePath}\`: ${m.survived} surviving, score ${m.score ?? "?"}`);
      }
    }
  }
  if (gate.gateId === "ratchet" && typeof details.overall === "string") {
    lines.push(`- Ratchet overall: **${details.overall}**`);
    if (typeof details.regressedCount === "number") {
      lines.push(`- Regressed: ${details.regressedCount}, improved: ${details.improvedCount ?? 0}`);
    }
  }
  if (gate.gateId === "tier-floor" && typeof details.regressionsBelowFloor === "number") {
    lines.push(`- ${details.regressionsBelowFloor} modules regressed below tier floor`);
    if (Array.isArray(details.modules)) {
      for (const m of (details.modules as Array<{ filePath: string; verdict: string; score: number | null; floor: number | null }>).filter(
        (mm) => mm.verdict === "regression_below_floor",
      )) {
        lines.push(`  - \`${m.filePath}\`: ${m.score}/${m.floor}`);
      }
    }
  }
  if (typeof details.parseError === "string") {
    lines.push(`- Error: ${details.parseError}`);
  }

  return lines.join("\n");
}
