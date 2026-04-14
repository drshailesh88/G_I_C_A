/**
 * QA Controller — Type definitions and Zod schemas.
 *
 * Authoritative reference: docs/qa-pipeline-blueprint.md
 *   Part 2.2 — Service manifest
 *   Part 3.2 — Contract index.yaml
 *   Part 5.3 — Gate short-circuit / status rules
 *   Part 6.1 — Repair packet frontmatter
 *   Part 6.2 — state.json shape (S2 + B4)
 *   Part 8.1 — FixerProvider interface
 *   Part 8.2 — Provider manifest
 *   Part 10 — Anti-cheat patterns
 *   Appendix B — Tier lookup
 *
 * Every externally-sourced structure (state.json, manifests, parsed XML/JSON,
 * packet frontmatter) MUST be Zod-validated on read. Internal types used only
 * in function signatures may use inferred types directly.
 */
import { z } from "zod";

// ─── Shared primitives ────────────────────────────────────────────────────────

export const IsoDateTimeSchema = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "invalid ISO datetime");
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

export const FeatureIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
    "feature id must be kebab-case lowercase (e.g. auth-login)",
  );
export type FeatureId = z.infer<typeof FeatureIdSchema>;

export const RunIdSchema = z
  .string()
  .regex(/^run-[0-9a-zA-Z_-]+$/, "run id must match 'run-...'");
export type RunId = z.infer<typeof RunIdSchema>;

export const TierSchema = z.enum([
  "critical_75",
  "business_60",
  "ui_gates_only",
]);
export type Tier = z.infer<typeof TierSchema>;

export const TierFloors: Readonly<Record<Tier, number | null>> = Object.freeze({
  critical_75: 75,
  business_60: 60,
  ui_gates_only: null,
});

export const CategorySchema = z.enum([
  "auth",
  "payments",
  "user_data",
  "business_logic",
  "ui",
]);
export type Category = z.infer<typeof CategorySchema>;

/** Categories that force security_sensitive=true and require frozen contract
 * before inclusion in `qa run` (blueprint 12d). */
export const SecurityCategorySet: ReadonlySet<Category> = new Set([
  "auth",
  "payments",
  "user_data",
]);

export const ContractStatusSchema = z.enum([
  "draft",
  "pending_approval",
  "frozen",
  "versioning",
]);
export type ContractStatus = z.infer<typeof ContractStatusSchema>;

export const SeveritySchema = z.enum(["reject", "warn"]);
export type Severity = z.infer<typeof SeveritySchema>;

// ─── Tier configuration (.quality/policies/tiers.yaml) ────────────────────────

export const TierConfigSchema = z.object({
  schema_version: z.literal(1),
  tiers: z.object({
    critical_75: z.array(z.string()).default([]),
    business_60: z.array(z.string()).default([]),
    ui_gates_only: z.array(z.string()).default([]),
  }),
  // 6b.iii: strict — unclassified is a hard error. No fallback.
  unclassified_behavior: z.literal("fail_fast"),
});
export type TierConfig = z.infer<typeof TierConfigSchema>;

// ─── Contract index.yaml ──────────────────────────────────────────────────────

export const ContractApprovalSchema = z.object({
  approved_by: z.string().min(1),
  approved_at: IsoDateTimeSchema,
  pr_or_commit: z.string().optional(),
});

export const ContractArtifactsSchema = z.object({
  examples: z.string().default("examples.md"),
  counterexamples: z.string().default("counterexamples.md"),
  invariants: z.string().default("invariants.md"),
  acceptance_tests: z.string().default("acceptance.spec.ts"),
  regression_tests: z.string().default("regressions.spec.ts"),
  api_contract: z.string().nullable().optional(),
});

export const ContractCountsSchema = z.object({
  examples: z.number().int().nonnegative(),
  counterexamples: z.number().int().nonnegative(),
  invariants: z.number().int().nonnegative(),
  acceptance_tests: z.number().int().nonnegative(),
  regression_tests: z.number().int().nonnegative(),
});

export const ContractTestDataSchema = z.object({
  seeded_users: z.array(z.string()).default([]),
  requires_services: z.array(z.string()).default([]),
});

export const ContractVersionHistoryEntrySchema = z.object({
  version: z.number().int().positive(),
  date: z.string(),
  approved_by: z.string().min(1),
  reason: z.string().min(1),
  diff_summary: z.string().optional(),
  authoring_mode: z.enum(["source_denied", "normal"]).default("source_denied"),
  baseline_reset_triggered: z.boolean().default(false),
});

export const ContractIndexSchema = z
  .object({
    schema_version: z.literal(1),
    feature: z.object({
      id: FeatureIdSchema,
      title: z.string().min(1),
      tier: TierSchema,
      category: CategorySchema,
      status: ContractStatusSchema,
      security_sensitive: z.boolean(),
    }),
    approval: ContractApprovalSchema,
    source_docs: z.array(z.string()).default([]),
    artifacts: ContractArtifactsSchema,
    counts: ContractCountsSchema,
    affected_modules: z.array(z.string()).min(1),
    test_data: ContractTestDataSchema,
    // hashes keyed by artifact filename (as in artifacts) → "sha256:<hex>"
    hashes: z.record(
      z.string(),
      z.string().regex(/^sha256:[a-f0-9]{64}$/i),
    ),
    version: z.number().int().positive(),
    version_history: z.array(ContractVersionHistoryEntrySchema).min(1),
  })
  .superRefine((data, ctx) => {
    // 12b: security_sensitive auto-true for auth/payments/user_data.
    if (
      SecurityCategorySet.has(data.feature.category) &&
      !data.feature.security_sensitive
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "security_sensitive must be true when category ∈ {auth, payments, user_data}",
        path: ["feature", "security_sensitive"],
      });
    }
  });
export type ContractIndex = z.infer<typeof ContractIndexSchema>;

// ─── state.json (S2 + B4) ─────────────────────────────────────────────────────

export const FeatureStatusSchema = z.enum([
  "pending",
  "in_progress",
  "green",
  "blocked",
]);
export type FeatureStatus = z.infer<typeof FeatureStatusSchema>;

export const FeatureStateSchema = z.object({
  contract_version: z.number().int().positive().optional(),
  status: FeatureStatusSchema,
  last_green_run_id: z.string().optional(),
  last_green_at: IsoDateTimeSchema.optional(),
  attempts_this_session: z.number().int().nonnegative().default(0),
  plateau_buffer: z.array(z.string()).default([]),
  blocked_at: IsoDateTimeSchema.optional(),
  blocked_reason: z.string().optional(),
  blocked_signature: z.string().optional(),
});
export type FeatureState = z.infer<typeof FeatureStateSchema>;

export const ModuleBaselineSchema = z.object({
  tier: TierSchema,
  declared_in_contract: z.string().optional(),
  mutation_baseline: z.number().min(0).max(100),
  mutation_baseline_set_at: IsoDateTimeSchema,
  mutation_baseline_run_id: z.string().optional(),
  has_exceeded_floor: z.boolean(),
  test_coverage_baseline: z.number().min(0).max(100).optional(),
});
export type ModuleBaseline = z.infer<typeof ModuleBaselineSchema>;

export const BaselineResetEntrySchema = z.object({
  timestamp: IsoDateTimeSchema,
  module: z.string().min(1),
  old_baseline: z.number().min(0).max(100),
  new_baseline: z.number().min(0).max(100),
  reason: z.string().min(1),
  triggered_by: z.string().min(1),
  approved_by: z.string().min(1),
});
export type BaselineResetEntry = z.infer<typeof BaselineResetEntrySchema>;

export const TestCountHistorySchema = z.object({
  vitest_unit: z.array(z.number().int().nonnegative()).default([]),
  vitest_integration: z.array(z.number().int().nonnegative()).default([]),
  playwright: z.array(z.number().int().nonnegative()).default([]),
});
export type TestCountHistory = z.infer<typeof TestCountHistorySchema>;

export const RunRecordSchema = z.object({
  started_at: IsoDateTimeSchema,
  ended_at: IsoDateTimeSchema.optional(),
  features_attempted: z.array(z.string()).default([]),
  features_green: z.array(z.string()).default([]),
  features_blocked: z.array(z.string()).default([]),
  violations_count: z.number().int().nonnegative().default(0),
  baseline_full_mutation_score: z.number().min(0).max(100).optional(),
  final_full_mutation_score: z.number().min(0).max(100).optional(),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

export const StateJsonSchema = z.object({
  schema_version: z.literal(1),
  last_updated: IsoDateTimeSchema,
  last_run_id: z.string().optional(),
  features: z.record(FeatureIdSchema, FeatureStateSchema).default({}),
  modules: z.record(z.string(), ModuleBaselineSchema).default({}),
  baseline_reset_log: z.array(BaselineResetEntrySchema).default([]),
  test_count_history: TestCountHistorySchema.default({
    vitest_unit: [],
    vitest_integration: [],
    playwright: [],
  }),
  runs: z.record(z.string(), RunRecordSchema).default({}),
});
export type StateJson = z.infer<typeof StateJsonSchema>;

// ─── Service manifest (Part 2.2) ──────────────────────────────────────────────

export const ServiceManifestSchema = z.object({
  name: z.string().min(1),
  display_name: z.string().min(1),
  category_hint: CategorySchema.optional(),
  status: z.enum(["validated", "draft", "stub"]),
  detection: z.object({
    package_patterns: z.array(z.string()).default([]),
    env_patterns: z.array(z.string()).default([]),
  }),
  env_test_vars: z.object({
    required: z
      .array(
        z.object({
          name: z.string().min(1),
          description: z.string().optional(),
        }),
      )
      .default([]),
    optional: z
      .array(
        z.object({
          name: z.string().min(1),
          description: z.string().optional(),
        }),
      )
      .default([]),
  }),
  snippets: z
    .object({
      global_setup: z.string().optional(),
      mocks: z.array(z.string()).optional(),
      scripts: z
        .array(
          z.object({
            path: z.string().min(1),
            source: z.string().min(1),
          }),
        )
        .optional(),
      auto_install_dev_packages: z.array(z.string()).default([]),
      playwright_config_patches: z
        .array(
          z.object({
            path: z.string().min(1),
            value: z.string(),
          }),
        )
        .default([]),
    })
    .optional(),
  tier_hints: z
    .object({
      critical_75: z.array(z.string()).default([]),
      business_60: z.array(z.string()).default([]),
      ui_gates_only: z.array(z.string()).default([]),
    })
    .optional(),
  documentation_url: z.string().url().optional(),
  security_notes: z.string().optional(),
});
export type ServiceManifest = z.infer<typeof ServiceManifestSchema>;

// ─── Provider manifest (Part 8.2) ─────────────────────────────────────────────

export const ProviderManifestSchema = z.object({
  name: z.string().min(1),
  cli_binary: z.string().min(1),
  invocation: z.object({
    command: z.array(z.string()).min(1),
    prompt_delivery: z.enum([
      "stdin_from_packet_file",
      "file_reference",
      "inline",
    ]),
    working_directory: z
      .enum(["target_repo_root", "artifacts_dir"])
      .default("target_repo_root"),
  }),
  settings_file: z
    .object({
      path: z.string().min(1),
      qa_variant: z.string().min(1),
    })
    .optional(),
  capabilities: z.object({
    respects_permissions_deny: z.boolean(),
    supports_hooks: z.boolean(),
    supports_max_turns: z.boolean(),
    max_prompt_tokens: z.number().int().positive().optional(),
  }),
  sandboxing: z
    .object({
      recommended_wrapper: z.string().nullable().default(null),
      mandatory_for_locked_paths: z.boolean().default(false),
    })
    .optional(),
});
export type ProviderManifest = z.infer<typeof ProviderManifestSchema>;

// ─── Repair packet frontmatter (Part 6.1) ─────────────────────────────────────

export const FailedGateDetailSchema = z.object({
  gate: z.string().min(1),
  tests_failed: z.number().int().nonnegative().optional(),
  tests_total: z.number().int().nonnegative().optional(),
  first_failure: z
    .object({
      test: z.string(),
      expected: z.string().optional(),
      received: z.string().optional(),
    })
    .optional(),
  module_mutation_scores: z.record(z.string(), z.number()).optional(),
  surviving_mutants_count: z.number().int().nonnegative().optional(),
  message: z.string().optional(),
});
export type FailedGateDetail = z.infer<typeof FailedGateDetailSchema>;

export const RatchetTargetSchema = z.object({
  metric: z.string().min(1),
  must_be: z.string().min(1),
});
export type RatchetTarget = z.infer<typeof RatchetTargetSchema>;

export const HypothesisSchema = z.object({
  confidence: z.enum(["low", "medium", "high"]),
  summary: z.string().min(1),
  evidence: z.array(z.string()).default([]),
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;

export const PriorAttemptSchema = z.object({
  attempt: z.number().int().positive(),
  approach: z.string().min(1),
  result: z.string().min(1),
  // C4: immediate prior keeps full error output; older priors are one-line summaries
  error_output: z.string().optional(),
});
export type PriorAttempt = z.infer<typeof PriorAttemptSchema>;

export const ViolationHistoryEntrySchema = z.object({
  attempt: z.number().int().positive(),
  pattern_ids: z.array(z.string()).min(1),
  // Full diff included per C4 for violation-flagged attempts
  offending_diff: z.string(),
});
export type ViolationHistoryEntry = z.infer<typeof ViolationHistoryEntrySchema>;

export const RepairPacketFrontmatterSchema = z.object({
  packet_version: z.literal(1),
  run_id: RunIdSchema,
  feature_id: FeatureIdSchema,
  attempt_number: z.number().int().positive(),
  session_id: z.string().min(1),
  failed_gates: z.array(FailedGateDetailSchema).default([]),
  ratchet_targets: z.array(RatchetTargetSchema).default([]),
  allowed_edit_paths: z.array(z.string()).min(1),
  forbidden_edit_paths: z.array(z.string()).min(1),
  codebase_context: z.array(z.string()).default([]),
  hypothesis: HypothesisSchema.optional(),
  evidence_paths: z.array(z.string()).default([]),
  prior_attempts: z.array(PriorAttemptSchema).default([]),
  violation_history: z.array(ViolationHistoryEntrySchema).default([]),
  max_turns: z.number().int().positive().default(30),
});
export type RepairPacketFrontmatter = z.infer<
  typeof RepairPacketFrontmatterSchema
>;

/** A loaded repair packet with parsed frontmatter + raw markdown body. */
export interface RepairPacket {
  frontmatter: RepairPacketFrontmatter;
  body: string;
  path: string;
}

// ─── Fixer provider runtime interface (Part 8.1) ──────────────────────────────

export interface FixerResult {
  providerName: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  /** Derived from git diff, NOT from fixer self-report (blueprint principle). */
  filesEditedCount: number;
  fixerNotesPath?: string;
}

export interface FixerProvider {
  readonly name: string;
  isEnabled(): boolean;
  invoke(
    packet: RepairPacket,
    runId: RunId,
    attempt: number,
  ): Promise<FixerResult>;
}

// ─── Gate results (Part 5.3) ──────────────────────────────────────────────────

export const GateStatusSchema = z.enum(["pass", "fail", "error", "skipped"]);
export type GateStatus = z.infer<typeof GateStatusSchema>;

export interface GateResult {
  gateId: string;
  status: GateStatus;
  durationMs: number;
  /** Free-form details (test counts, scores, error messages). Controller
   * serializes to evidence files per gate. */
  details: Record<string, unknown>;
  artifacts: string[];
  /** True when failure is a hard short-circuit (contract-tampered, lock-tampered,
   * test-count-sanity, contract-test-count). Subsequent gates skip. */
  shortCircuit: boolean;
}

// ─── Parser results ───────────────────────────────────────────────────────────

export interface VitestFailureDetail {
  suite: string;
  test: string;
  error: string;
  stack?: string;
  file?: string;
}

export interface VitestResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  errors: number; // suite-level errors
  durationMs: number;
  failures: VitestFailureDetail[];
}

export interface PlaywrightFailureDetail {
  file: string;
  title: string;
  projectName: string;
  error: string;
  stack?: string;
  traceFile?: string;
  screenshotFile?: string;
  videoFile?: string;
}

export interface PlaywrightResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  durationMs: number;
  failures: PlaywrightFailureDetail[];
  /** File paths of every spec that produced a test result this run — used by
   * gate 14a (contract test count verification). */
  executedSpecFiles: string[];
}

export type StrykerMutantStatus =
  | "Killed"
  | "Survived"
  | "NoCoverage"
  | "Timeout"
  | "RuntimeError"
  | "CompileError"
  | "Skipped"
  | "Pending"
  | "Ignored";

export interface StrykerSurvivingMutant {
  id: string;
  mutatorName: string;
  line: number;
  column: number;
  replacement?: string;
}

export interface StrykerFileScore {
  filePath: string;
  killed: number;
  survived: number;
  timeout: number;
  noCoverage: number;
  runtimeErrors: number;
  compileErrors: number;
  skipped: number;
  pending: number;
  ignored: number;
  total: number;
  /** killed / (killed + survived + timeout). Excludes NoCoverage, RuntimeError,
   * CompileError, Skipped, Pending, Ignored from denominator. Returns null when
   * denominator is 0 (no mutants of scoreable status). */
  score: number | null;
  /** Whether this file's mutants were freshly measured this run vs carried
   * from incremental cache. Determined by cross-referencing incremental.json. */
  freshlyMeasured: boolean;
  tier?: Tier;
  topSurvivingMutants: StrykerSurvivingMutant[];
}

export interface StrykerResult {
  perFile: Map<string, StrykerFileScore>;
  overallScore: number | null;
  totalMutants: number;
  freshlyTested: number;
  cachedFromIncremental: number;
  /** Files present in mutation.json but not classified to any tier when a
   * TierConfig is provided. Surfacing this lets 6b.iii fail-fast fire
   * correctly. */
  unclassifiedFiles: string[];
}

// ─── Anti-cheat (Part 10) ─────────────────────────────────────────────────────

/** A single anti-cheat rule. Exactly one of `regex` / `computed` must be set.
 * Enforced by the AntiCheatPatternSchema refinement below. */
export interface AntiCheatPattern {
  id: string;
  severity: Severity;
  paths?: string[];
  regex?: RegExp;
  computed?: (
    diff: string,
    fileContents?: Map<string, { before: string; after: string }>,
  ) => boolean;
  description?: string;
  threshold?: string;
}

export const AntiCheatViolationSchema = z.object({
  pattern_id: z.string().min(1),
  severity: SeveritySchema,
  file: z.string().min(1),
  line: z.number().int().positive().optional(),
  matched_content: z.string().optional(),
  detected_at: IsoDateTimeSchema,
});
export type AntiCheatViolation = z.infer<typeof AntiCheatViolationSchema>;

// ─── Violations ledger entry (.quality/runs/<id>/violations.jsonl) ────────────

export const ViolationEntrySchema = z.object({
  run_id: RunIdSchema,
  feature_id: FeatureIdSchema,
  attempt: z.number().int().positive(),
  detected_at: IsoDateTimeSchema,
  provider: z.string().min(1),
  violations: z.array(AntiCheatViolationSchema).min(1),
  reverted_paths: z.array(z.string()).default([]),
});
export type ViolationEntry = z.infer<typeof ViolationEntrySchema>;

// ─── Session lock (L1) ────────────────────────────────────────────────────────

export const SessionLockSchema = z.object({
  pid: z.number().int().positive(),
  run_id: RunIdSchema,
  acquired_at: IsoDateTimeSchema,
  host: z.string().min(1),
  qa_controller_version: z.string().min(1),
});
export type SessionLock = z.infer<typeof SessionLockSchema>;

// ─── Termination taxonomy (blueprint Q5b) ─────────────────────────────────────

export type IterationOutcome =
  | "GREEN"
  | "IMPROVED_NOT_GREEN"
  | "REGRESSED"
  | "VIOLATION"
  | "BLOCKED";

// ─── Error hierarchy ──────────────────────────────────────────────────────────

/** Base error for all controller failures. Stack preserved; callers match on
 * instanceof. */
export class QaError extends Error {
  constructor(message: string, public readonly context?: unknown) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** The `.quality/state.json` file is unreadable, corrupted, or schema-drift
 * (schema_version !== 1). Controller aborts with clear message. */
export class StateCorruptionError extends QaError {}

/** A locked contract artifact's stored hash does not match its current disk
 * content. Session must abort; the oracle is untrustworthy. */
export class ContractTamperedError extends QaError {}

/** lock-manifest.json hash does not match live policy/config file hashes. */
export class LockTamperedError extends QaError {}

/** state.lock exists and the recorded PID is alive. Cannot run concurrently. */
export class ConcurrentRunError extends QaError {}

/** state.lock exists but PID is dead; R-2 recovery will clear it. Not fatal
 * on its own but signals the previous run crashed. */
export class StaleLockError extends QaError {}

/** User tree has uncommitted changes; R-2 requires a clean tree before any
 * run starts (blueprint 15c). */
export class DirtyWorkingTreeError extends QaError {}

/** Source file is not covered by any tiers.yaml glob. No fallback. */
export class UnclassifiedModuleError extends QaError {
  constructor(
    public readonly filePath: string,
    message = `unclassified module: ${filePath}`,
  ) {
    super(message, { filePath });
  }
}

/** Ratchet violation — attempted downward change without explicit reset. */
export class RatchetViolationError extends QaError {}

/** A parser's input file was missing, empty, or malformed. */
export class ParseError extends QaError {
  constructor(
    public readonly source: string,
    public readonly reason: string,
    message = `parse failed for ${source}: ${reason}`,
  ) {
    super(message, { source, reason });
  }
}
