import { describe, test, expect } from "vitest";
import { z } from "zod";
import {
  AntiCheatViolationSchema,
  BaselineResetEntrySchema,
  CategorySchema,
  ContractIndexSchema,
  ContractStatusSchema,
  ContractTamperedError,
  DirtyWorkingTreeError,
  FailedGateDetailSchema,
  FeatureIdSchema,
  FeatureStateSchema,
  FeatureStatusSchema,
  HypothesisSchema,
  IsoDateTimeSchema,
  ModuleBaselineSchema,
  ParseError,
  PriorAttemptSchema,
  ProviderManifestSchema,
  QaError,
  RatchetTargetSchema,
  RatchetViolationError,
  RepairPacketFrontmatterSchema,
  RunIdSchema,
  RunRecordSchema,
  SecurityCategorySet,
  ServiceManifestSchema,
  SessionLockSchema,
  SeveritySchema,
  StateCorruptionError,
  StateJsonSchema,
  TestCountHistorySchema,
  TierConfigSchema,
  TierFloors,
  TierSchema,
  UnclassifiedModuleError,
  ViolationEntrySchema,
  ViolationHistoryEntrySchema,
} from "./types.js";

describe("primitive schemas", () => {
  test("FeatureIdSchema accepts kebab-case lowercase", () => {
    expect(FeatureIdSchema.parse("auth-login")).toBe("auth-login");
    expect(FeatureIdSchema.parse("a")).toBe("a");
    expect(FeatureIdSchema.parse("feature-1")).toBe("feature-1");
    expect(FeatureIdSchema.parse("a1-b2-c3")).toBe("a1-b2-c3");
  });

  test("FeatureIdSchema rejects invalid formats", () => {
    expect(() => FeatureIdSchema.parse("Auth-Login")).toThrow();
    expect(() => FeatureIdSchema.parse("auth_login")).toThrow();
    expect(() => FeatureIdSchema.parse("-auth")).toThrow();
    expect(() => FeatureIdSchema.parse("auth-")).toThrow();
    expect(() => FeatureIdSchema.parse("1auth")).toThrow();
    expect(() => FeatureIdSchema.parse("")).toThrow();
  });

  test("RunIdSchema accepts expected patterns", () => {
    expect(RunIdSchema.parse("run-2026-04-14-001")).toBe("run-2026-04-14-001");
    expect(
      RunIdSchema.parse("run-2026-04-14T21-30-00Z-001"),
    ).toMatch(/^run-/);
  });

  test("RunIdSchema rejects non-run prefixes", () => {
    expect(() => RunIdSchema.parse("2026-04-14")).toThrow();
    expect(() => RunIdSchema.parse("session-1")).toThrow();
  });

  test("IsoDateTimeSchema accepts parseable date strings", () => {
    expect(IsoDateTimeSchema.parse("2026-04-14T22:00:00Z")).toBe(
      "2026-04-14T22:00:00Z",
    );
    expect(IsoDateTimeSchema.parse("2026-04-14T22:00:00.123Z")).toMatch(/Z$/);
  });

  test("IsoDateTimeSchema rejects garbage", () => {
    expect(() => IsoDateTimeSchema.parse("not a date")).toThrow();
    expect(() => IsoDateTimeSchema.parse("")).toThrow();
  });

  test("TierSchema has exactly three values", () => {
    expect(TierSchema.options).toEqual([
      "critical_75",
      "business_60",
      "ui_gates_only",
    ]);
  });

  test("TierFloors table matches blueprint Appendix B", () => {
    expect(TierFloors.critical_75).toBe(75);
    expect(TierFloors.business_60).toBe(60);
    expect(TierFloors.ui_gates_only).toBeNull();
  });

  test("CategorySchema has exactly five values", () => {
    expect(CategorySchema.options).toEqual([
      "auth",
      "payments",
      "user_data",
      "business_logic",
      "ui",
    ]);
  });

  test("SecurityCategorySet is the 3 high-risk categories", () => {
    expect(SecurityCategorySet.has("auth")).toBe(true);
    expect(SecurityCategorySet.has("payments")).toBe(true);
    expect(SecurityCategorySet.has("user_data")).toBe(true);
    expect(SecurityCategorySet.has("business_logic")).toBe(false);
    expect(SecurityCategorySet.has("ui")).toBe(false);
  });

  test("ContractStatusSchema values", () => {
    expect(ContractStatusSchema.options).toEqual([
      "draft",
      "pending_approval",
      "frozen",
      "versioning",
    ]);
  });

  test("SeveritySchema has reject and warn", () => {
    expect(SeveritySchema.options).toEqual(["reject", "warn"]);
  });
});

describe("TierConfigSchema", () => {
  test("accepts fail_fast only for unclassified_behavior (6b.iii)", () => {
    const valid = {
      schema_version: 1 as const,
      tiers: {
        critical_75: ["src/auth/**"],
        business_60: ["src/lib/**"],
        ui_gates_only: ["src/components/**"],
      },
      unclassified_behavior: "fail_fast" as const,
    };
    expect(TierConfigSchema.parse(valid)).toEqual(valid);
  });

  test("rejects any other unclassified_behavior value", () => {
    const bad = {
      schema_version: 1,
      tiers: { critical_75: [], business_60: [], ui_gates_only: [] },
      unclassified_behavior: "default_to_business_60",
    };
    expect(() => TierConfigSchema.parse(bad)).toThrow();
  });

  test("fills default [] for missing tier keys", () => {
    const result = TierConfigSchema.parse({
      schema_version: 1,
      tiers: {},
      unclassified_behavior: "fail_fast",
    });
    expect(result.tiers.critical_75).toEqual([]);
    expect(result.tiers.business_60).toEqual([]);
    expect(result.tiers.ui_gates_only).toEqual([]);
  });
});

describe("ContractIndexSchema", () => {
  const validFixture = {
    schema_version: 1 as const,
    feature: {
      id: "auth-login",
      title: "User login",
      tier: "critical_75" as const,
      category: "auth" as const,
      status: "frozen" as const,
      security_sensitive: true,
    },
    approval: {
      approved_by: "shailesh",
      approved_at: "2026-04-14T22:00:00Z",
      pr_or_commit: "b6166e5",
    },
    source_docs: [".planning/PRD.md"],
    artifacts: {
      examples: "examples.md",
      counterexamples: "counterexamples.md",
      invariants: "invariants.md",
      acceptance_tests: "acceptance.spec.ts",
      regression_tests: "regressions.spec.ts",
      api_contract: null,
    },
    counts: {
      examples: 8,
      counterexamples: 4,
      invariants: 5,
      acceptance_tests: 12,
      regression_tests: 0,
    },
    affected_modules: ["src/auth/**"],
    test_data: {
      seeded_users: ["test_user"],
      requires_services: ["clerk"],
    },
    hashes: {
      "examples.md":
        "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    },
    version: 1,
    version_history: [
      {
        version: 1,
        date: "2026-04-14",
        approved_by: "shailesh",
        reason: "initial",
        authoring_mode: "source_denied" as const,
        baseline_reset_triggered: false,
      },
    ],
  };

  test("accepts a complete valid contract index", () => {
    const result = ContractIndexSchema.parse(validFixture);
    expect(result.feature.id).toBe("auth-login");
  });

  test("rejects security_sensitive=false when category ∈ {auth, payments, user_data}", () => {
    const bad = {
      ...validFixture,
      feature: { ...validFixture.feature, security_sensitive: false },
    };
    expect(() => ContractIndexSchema.parse(bad)).toThrow(
      /security_sensitive must be true/,
    );
  });

  test("allows security_sensitive=false for business_logic and ui", () => {
    const business = {
      ...validFixture,
      feature: {
        ...validFixture.feature,
        category: "business_logic" as const,
        security_sensitive: false,
      },
    };
    expect(() => ContractIndexSchema.parse(business)).not.toThrow();

    const ui = {
      ...validFixture,
      feature: {
        ...validFixture.feature,
        category: "ui" as const,
        security_sensitive: false,
      },
    };
    expect(() => ContractIndexSchema.parse(ui)).not.toThrow();
  });

  test("requires at least one affected_module", () => {
    const bad = { ...validFixture, affected_modules: [] };
    expect(() => ContractIndexSchema.parse(bad)).toThrow();
  });

  test("rejects malformed sha256 hash", () => {
    const bad = {
      ...validFixture,
      hashes: { "examples.md": "sha256:too-short" },
    };
    expect(() => ContractIndexSchema.parse(bad)).toThrow();
  });

  test("rejects sha1 or unlabeled hash", () => {
    const bad = {
      ...validFixture,
      hashes: { "examples.md": "abcdef0123456789abcdef0123456789abcdef01" },
    };
    expect(() => ContractIndexSchema.parse(bad)).toThrow();
  });

  test("requires at least one version_history entry", () => {
    const bad = { ...validFixture, version_history: [] };
    expect(() => ContractIndexSchema.parse(bad)).toThrow();
  });
});

describe("StateJsonSchema", () => {
  test("accepts minimal state", () => {
    const parsed = StateJsonSchema.parse({
      schema_version: 1,
      last_updated: "2026-04-14T22:00:00Z",
    });
    expect(parsed.features).toEqual({});
    expect(parsed.modules).toEqual({});
    expect(parsed.baseline_reset_log).toEqual([]);
    expect(parsed.runs).toEqual({});
    expect(parsed.test_count_history).toEqual({
      vitest_unit: [],
      vitest_integration: [],
      playwright: [],
    });
  });

  test("accepts rich state with features, modules, runs", () => {
    const state = {
      schema_version: 1 as const,
      last_updated: "2026-04-14T22:00:00Z",
      last_run_id: "run-2026-04-14-001",
      features: {
        "auth-login": {
          status: "green" as const,
          last_green_run_id: "run-2026-04-14-001",
          last_green_at: "2026-04-14T22:00:00Z",
          attempts_this_session: 2,
          plateau_buffer: [],
        },
      },
      modules: {
        "src/auth/login.ts": {
          tier: "critical_75" as const,
          mutation_baseline: 81,
          mutation_baseline_set_at: "2026-04-14T22:00:00Z",
          has_exceeded_floor: true,
        },
      },
      baseline_reset_log: [],
      test_count_history: {
        vitest_unit: [245, 247],
        vitest_integration: [89],
        playwright: [47, 59],
      },
      runs: {},
    };
    const parsed = StateJsonSchema.parse(state);
    expect(parsed.features["auth-login"]?.status).toBe("green");
    expect(parsed.modules["src/auth/login.ts"]?.mutation_baseline).toBe(81);
  });

  test("rejects schema_version drift", () => {
    expect(() =>
      StateJsonSchema.parse({ schema_version: 2, last_updated: "2026-04-14T22:00:00Z" }),
    ).toThrow();
  });

  test("rejects mutation_baseline > 100", () => {
    const bad = {
      schema_version: 1,
      last_updated: "2026-04-14T22:00:00Z",
      modules: {
        "src/foo.ts": {
          tier: "critical_75",
          mutation_baseline: 150,
          mutation_baseline_set_at: "2026-04-14T22:00:00Z",
          has_exceeded_floor: true,
        },
      },
    };
    expect(() => StateJsonSchema.parse(bad)).toThrow();
  });
});

describe("FeatureStateSchema and FeatureStatusSchema", () => {
  test("FeatureStatusSchema values", () => {
    expect(FeatureStatusSchema.options).toEqual([
      "pending",
      "in_progress",
      "green",
      "blocked",
    ]);
  });

  test("minimal feature state", () => {
    const parsed = FeatureStateSchema.parse({ status: "pending" });
    expect(parsed.attempts_this_session).toBe(0);
    expect(parsed.plateau_buffer).toEqual([]);
  });

  test("blocked state requires reason + signature", () => {
    const blocked = FeatureStateSchema.parse({
      status: "blocked",
      blocked_at: "2026-04-14T22:30:00Z",
      blocked_reason: "plateau",
      blocked_signature: "hash-abc",
      attempts_this_session: 10,
      plateau_buffer: ["s1", "s1", "s1"],
    });
    expect(blocked.status).toBe("blocked");
  });
});

describe("ModuleBaselineSchema", () => {
  test("accepts valid baseline", () => {
    const parsed = ModuleBaselineSchema.parse({
      tier: "critical_75",
      mutation_baseline: 81,
      mutation_baseline_set_at: "2026-04-14T22:00:00Z",
      has_exceeded_floor: true,
    });
    expect(parsed.tier).toBe("critical_75");
  });

  test("rejects negative mutation_baseline", () => {
    expect(() =>
      ModuleBaselineSchema.parse({
        tier: "business_60",
        mutation_baseline: -5,
        mutation_baseline_set_at: "2026-04-14T22:00:00Z",
        has_exceeded_floor: false,
      }),
    ).toThrow();
  });
});

describe("BaselineResetEntrySchema", () => {
  test("requires non-empty reason and approved_by", () => {
    expect(() =>
      BaselineResetEntrySchema.parse({
        timestamp: "2026-04-14T22:00:00Z",
        module: "src/foo.ts",
        old_baseline: 80,
        new_baseline: 60,
        reason: "",
        triggered_by: "qa-baseline-reset",
        approved_by: "shailesh",
      }),
    ).toThrow();
  });

  test("accepts complete audit entry", () => {
    const entry = BaselineResetEntrySchema.parse({
      timestamp: "2026-04-14T22:00:00Z",
      module: "src/lib/payments/refund.ts",
      old_baseline: 72,
      new_baseline: 58,
      reason: "Large refactor per PRD v2",
      triggered_by: "qa-baseline-reset command",
      approved_by: "shailesh",
    });
    expect(entry.module).toBe("src/lib/payments/refund.ts");
  });
});

describe("TestCountHistorySchema", () => {
  test("fills defaults when keys missing", () => {
    const parsed = TestCountHistorySchema.parse({});
    expect(parsed.vitest_unit).toEqual([]);
    expect(parsed.vitest_integration).toEqual([]);
    expect(parsed.playwright).toEqual([]);
  });

  test("rejects negative counts", () => {
    expect(() =>
      TestCountHistorySchema.parse({
        vitest_unit: [-1],
        vitest_integration: [],
        playwright: [],
      }),
    ).toThrow();
  });
});

describe("RunRecordSchema", () => {
  test("minimal record uses defaults", () => {
    const parsed = RunRecordSchema.parse({ started_at: "2026-04-14T22:00:00Z" });
    expect(parsed.features_attempted).toEqual([]);
    expect(parsed.violations_count).toBe(0);
  });
});

describe("ServiceManifestSchema", () => {
  test("accepts the canonical clerk manifest", () => {
    const manifest = {
      name: "clerk",
      display_name: "Clerk (Authentication)",
      category_hint: "auth" as const,
      status: "validated" as const,
      detection: {
        package_patterns: ["@clerk/nextjs", "@clerk/testing"],
        env_patterns: ["CLERK_*", "NEXT_PUBLIC_CLERK_*"],
      },
      env_test_vars: {
        required: [
          { name: "CLERK_SECRET_KEY", description: "secret" },
          { name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" },
        ],
        optional: [],
      },
      snippets: {
        global_setup: "snippets/global-setup/clerk.ts",
        auto_install_dev_packages: ["@clerk/testing"],
        playwright_config_patches: [
          { path: "globalSetup", value: "./tests/global-setup.ts" },
        ],
      },
      tier_hints: {
        critical_75: ["src/**/auth/**", "middleware.ts"],
        business_60: [],
        ui_gates_only: [],
      },
      documentation_url: "https://clerk.com/docs",
      security_notes: "gitignore playwright/.clerk/user.json",
    };
    const parsed = ServiceManifestSchema.parse(manifest);
    expect(parsed.name).toBe("clerk");
  });

  test("rejects unknown status values", () => {
    const bad = {
      name: "x",
      display_name: "X",
      status: "totally-fine",
      detection: { package_patterns: [], env_patterns: [] },
      env_test_vars: { required: [], optional: [] },
    };
    expect(() => ServiceManifestSchema.parse(bad)).toThrow();
  });
});

describe("ProviderManifestSchema", () => {
  test("claude manifest accepted", () => {
    const claude = {
      name: "claude",
      cli_binary: "claude",
      invocation: {
        command: ["claude", "--print", "--max-turns", "30"],
        prompt_delivery: "file_reference" as const,
        working_directory: "target_repo_root" as const,
      },
      settings_file: {
        path: ".claude/settings.json",
        qa_variant: "settings-qa.json",
      },
      capabilities: {
        respects_permissions_deny: true,
        supports_hooks: true,
        supports_max_turns: true,
        max_prompt_tokens: 200000,
      },
      sandboxing: {
        recommended_wrapper: null,
        mandatory_for_locked_paths: false,
      },
    };
    expect(ProviderManifestSchema.parse(claude).name).toBe("claude");
  });

  test("codex manifest with sandbox required accepted", () => {
    const codex = {
      name: "codex",
      cli_binary: "codex",
      invocation: {
        command: ["codex", "exec", "--file", "${packet_file}"],
        prompt_delivery: "file_reference" as const,
      },
      capabilities: {
        respects_permissions_deny: false,
        supports_hooks: false,
        supports_max_turns: false,
      },
      sandboxing: {
        recommended_wrapper: "claude-sandbox",
        mandatory_for_locked_paths: true,
      },
    };
    const parsed = ProviderManifestSchema.parse(codex);
    expect(parsed.sandboxing?.mandatory_for_locked_paths).toBe(true);
  });
});

describe("RepairPacketFrontmatterSchema", () => {
  const baseFrontmatter = {
    packet_version: 1 as const,
    run_id: "run-2026-04-14-001",
    feature_id: "auth-login",
    attempt_number: 3,
    session_id: "session-001",
    failed_gates: [],
    ratchet_targets: [],
    allowed_edit_paths: ["src/auth/**"],
    forbidden_edit_paths: [".quality/**"],
    codebase_context: [],
    evidence_paths: [],
    prior_attempts: [],
    violation_history: [],
  };

  test("minimal packet accepted", () => {
    const parsed = RepairPacketFrontmatterSchema.parse(baseFrontmatter);
    expect(parsed.max_turns).toBe(30);
  });

  test("requires non-empty allowed_edit_paths", () => {
    const bad = { ...baseFrontmatter, allowed_edit_paths: [] };
    expect(() => RepairPacketFrontmatterSchema.parse(bad)).toThrow();
  });

  test("requires non-empty forbidden_edit_paths", () => {
    const bad = { ...baseFrontmatter, forbidden_edit_paths: [] };
    expect(() => RepairPacketFrontmatterSchema.parse(bad)).toThrow();
  });

  test("hypothesis optional but validates when provided", () => {
    const withHypothesis = {
      ...baseFrontmatter,
      hypothesis: {
        confidence: "medium" as const,
        summary: "reason undefined when token expired",
        evidence: ["src/auth/login.ts:42"],
      },
    };
    expect(() => RepairPacketFrontmatterSchema.parse(withHypothesis)).not.toThrow();
  });

  test("rejects invalid hypothesis confidence", () => {
    const bad = {
      ...baseFrontmatter,
      hypothesis: {
        confidence: "certain",
        summary: "x",
        evidence: [],
      },
    };
    expect(() => RepairPacketFrontmatterSchema.parse(bad)).toThrow();
  });

  test("violation_history full-diff entries accepted", () => {
    const withViolation = {
      ...baseFrontmatter,
      violation_history: [
        {
          attempt: 2,
          pattern_ids: ["SKIP_ADDED"],
          offending_diff: "+++ b/x.test.ts\n+it.skip('fail', ...)",
        },
      ],
    };
    expect(() =>
      RepairPacketFrontmatterSchema.parse(withViolation),
    ).not.toThrow();
  });
});

describe("AntiCheatViolationSchema and ViolationEntrySchema", () => {
  test("violation entry requires at least one pattern match", () => {
    const bad = {
      run_id: "run-x",
      feature_id: "auth-login",
      attempt: 1,
      detected_at: "2026-04-14T22:00:00Z",
      provider: "claude",
      violations: [],
      reverted_paths: [],
    };
    expect(() => ViolationEntrySchema.parse(bad)).toThrow();
  });

  test("valid violation entry round-trips", () => {
    const entry = {
      run_id: "run-2026-04-14-001",
      feature_id: "auth-login",
      attempt: 1,
      detected_at: "2026-04-14T22:00:00Z",
      provider: "claude",
      violations: [
        {
          pattern_id: "SKIP_ADDED",
          severity: "reject" as const,
          file: "tests/unit/auth.test.ts",
          line: 42,
          detected_at: "2026-04-14T22:00:00Z",
        },
      ],
      reverted_paths: ["tests/unit/auth.test.ts"],
    };
    const parsed = ViolationEntrySchema.parse(entry);
    expect(parsed.violations).toHaveLength(1);
    expect(parsed.violations[0]?.severity).toBe("reject");
  });
});

describe("SessionLockSchema", () => {
  test("valid lock", () => {
    const parsed = SessionLockSchema.parse({
      pid: 12345,
      run_id: "run-2026-04-14-001",
      acquired_at: "2026-04-14T22:00:00Z",
      host: "my-mac",
      qa_controller_version: "0.1.0",
    });
    expect(parsed.pid).toBe(12345);
  });

  test("rejects non-positive PID", () => {
    expect(() =>
      SessionLockSchema.parse({
        pid: 0,
        run_id: "run-x",
        acquired_at: "2026-04-14T22:00:00Z",
        host: "h",
        qa_controller_version: "0.1.0",
      }),
    ).toThrow();
  });
});

describe("FailedGateDetailSchema, RatchetTargetSchema, HypothesisSchema", () => {
  test("FailedGateDetail minimal", () => {
    expect(() =>
      FailedGateDetailSchema.parse({ gate: "vitest-unit" }),
    ).not.toThrow();
  });

  test("FailedGateDetail with module scores", () => {
    const parsed = FailedGateDetailSchema.parse({
      gate: "stryker-incremental",
      module_mutation_scores: { "src/auth/login.ts": 54 },
      surviving_mutants_count: 11,
    });
    expect(parsed.module_mutation_scores?.["src/auth/login.ts"]).toBe(54);
  });

  test("RatchetTarget requires both fields", () => {
    expect(() =>
      RatchetTargetSchema.parse({ metric: "", must_be: ">= 75" }),
    ).toThrow();
    expect(() =>
      RatchetTargetSchema.parse({ metric: "x", must_be: "" }),
    ).toThrow();
  });

  test("Hypothesis accepts all three confidence levels", () => {
    for (const c of ["low", "medium", "high"] as const) {
      expect(() =>
        HypothesisSchema.parse({ confidence: c, summary: "s" }),
      ).not.toThrow();
    }
  });
});

describe("PriorAttemptSchema", () => {
  test("one-line summary variant (older priors)", () => {
    const parsed = PriorAttemptSchema.parse({
      attempt: 1,
      approach: "added null check",
      result: "still failed",
    });
    expect(parsed.error_output).toBeUndefined();
  });

  test("full error output variant (immediate prior)", () => {
    const parsed = PriorAttemptSchema.parse({
      attempt: 2,
      approach: "async rewrite",
      result: "regressed, reverted",
      error_output: "FAIL tests/...\nStack trace here",
    });
    expect(parsed.error_output).toContain("FAIL");
  });
});

describe("ViolationHistoryEntrySchema", () => {
  test("requires at least one pattern_id", () => {
    expect(() =>
      ViolationHistoryEntrySchema.parse({
        attempt: 1,
        pattern_ids: [],
        offending_diff: "diff",
      }),
    ).toThrow();
  });
});

describe("error hierarchy", () => {
  test("QaError base class", () => {
    const e = new QaError("x", { foo: 1 });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("QaError");
    expect(e.context).toEqual({ foo: 1 });
  });

  test("all subclasses are QaError instances", () => {
    const subclasses = [
      new StateCorruptionError("s"),
      new ContractTamperedError("c"),
      new DirtyWorkingTreeError("d"),
      new RatchetViolationError("r"),
      new UnclassifiedModuleError("src/foo.ts"),
      new ParseError("mutation.json", "missing"),
    ];
    for (const e of subclasses) {
      expect(e).toBeInstanceOf(QaError);
      expect(e).toBeInstanceOf(Error);
    }
  });

  test("UnclassifiedModuleError includes file path", () => {
    const e = new UnclassifiedModuleError("src/unknown.ts");
    expect(e.filePath).toBe("src/unknown.ts");
    expect(e.message).toContain("src/unknown.ts");
  });

  test("ParseError includes source and reason", () => {
    const e = new ParseError("vitest.xml", "malformed XML");
    expect(e.source).toBe("vitest.xml");
    expect(e.reason).toBe("malformed XML");
    expect(e.message).toContain("vitest.xml");
    expect(e.message).toContain("malformed XML");
  });

  test("different subclasses are distinguishable", () => {
    const a = new ContractTamperedError("x");
    const b = new StateCorruptionError("x");
    expect(a).not.toBeInstanceOf(StateCorruptionError);
    expect(b).not.toBeInstanceOf(ContractTamperedError);
  });
});

describe("schema composition — a representative end-to-end fixture", () => {
  test("state with reset log and test count history round-trips", () => {
    const state = {
      schema_version: 1 as const,
      last_updated: "2026-04-14T22:45:00Z",
      last_run_id: "run-2026-04-14-001",
      features: {},
      modules: {
        "src/auth/login.ts": {
          tier: "critical_75" as const,
          declared_in_contract: "auth-login",
          mutation_baseline: 81,
          mutation_baseline_set_at: "2026-04-14T22:00:00Z",
          mutation_baseline_run_id: "run-2026-04-14-001",
          has_exceeded_floor: true,
          test_coverage_baseline: 94,
        },
      },
      baseline_reset_log: [
        {
          timestamp: "2026-04-10T14:00:00Z",
          module: "src/lib/payments/refund.ts",
          old_baseline: 72,
          new_baseline: 58,
          reason: "refactor per PRD v2",
          triggered_by: "qa-baseline-reset",
          approved_by: "shailesh",
        },
      ],
      test_count_history: {
        vitest_unit: [245, 247, 247, 247],
        vitest_integration: [89, 89, 91, 91],
        playwright: [47, 47, 59, 59],
      },
      runs: {
        "run-2026-04-14-001": {
          started_at: "2026-04-14T21:30:00Z",
          ended_at: "2026-04-14T22:45:00Z",
          features_attempted: ["auth-login"],
          features_green: ["auth-login"],
          features_blocked: [],
          violations_count: 0,
          baseline_full_mutation_score: 74,
          final_full_mutation_score: 78,
        },
      },
    };
    const parsed = StateJsonSchema.parse(state);
    const reparsed = StateJsonSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed).toEqual(parsed);
  });
});
