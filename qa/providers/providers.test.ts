import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  buildFixerPrompt,
  countFilesEdited,
  loadProvider,
  readProvidersPolicy,
  resolveFixerNotesPath,
} from "./base.js";
import { ClaudeFixerProvider } from "./claude.js";
import { CodexFixerProvider } from "./codex.js";
import { GeminiFixerProvider } from "./gemini.js";
import type { CommandOutcome, RunCommandFn } from "../gates/base.js";
import type { RepairPacket } from "../types.js";

let root: string;
let policiesDir: string;
beforeEach(async () => {
  root = join(tmpdir(), `providers-${randomBytes(6).toString("hex")}`);
  policiesDir = join(root, ".quality", "policies");
  await fs.mkdir(policiesDir, { recursive: true });
});
afterEach(async () => {
  try {
    await fs.rm(root, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

function fakeRunner(responses: CommandOutcome | CommandOutcome[]): RunCommandFn {
  const arr = Array.isArray(responses) ? responses : [responses];
  let i = 0;
  return async () => arr[Math.min(i++, arr.length - 1)]!;
}

function samplePacket(): RepairPacket {
  return {
    path: join(root, ".quality/runs/run-1/packets/auth-login-1.md"),
    frontmatter: {
      packet_version: 1,
      run_id: "run-1",
      feature_id: "auth-login",
      attempt_number: 1,
      session_id: "s",
      failed_gates: [],
      ratchet_targets: [],
      allowed_edit_paths: ["src/auth/**"],
      forbidden_edit_paths: [".quality/**"],
      codebase_context: [],
      evidence_paths: [],
      prior_attempts: [],
      violation_history: [],
      max_turns: 30,
    },
    body: "task body",
  };
}

// ─── readProvidersPolicy ─────────────────────────────────────────────────────

describe("readProvidersPolicy", () => {
  test("returns default when file missing", async () => {
    const policy = await readProvidersPolicy(policiesDir);
    expect(policy.active_fixer).toBe("claude");
    expect(policy.enabled).toContain("claude");
    expect(policy.disabled).toContain("codex");
  });

  test("parses custom providers.yaml", async () => {
    await fs.writeFile(
      join(policiesDir, "providers.yaml"),
      yaml.dump({
        schema_version: 1,
        active_fixer: "claude",
        enabled: ["claude", "codex"],
        disabled: ["gemini"],
        max_turns: 20,
      }),
    );
    const policy = await readProvidersPolicy(policiesDir);
    expect(policy.max_turns).toBe(20);
    expect(policy.enabled).toEqual(["claude", "codex"]);
  });

  test("rejects schema drift", async () => {
    await fs.writeFile(
      join(policiesDir, "providers.yaml"),
      yaml.dump({ schema_version: 2, active_fixer: "claude" }),
    );
    await expect(readProvidersPolicy(policiesDir)).rejects.toThrow();
  });
});

// ─── loadProvider factory ───────────────────────────────────────────────────

describe("loadProvider", () => {
  test("returns ClaudeFixerProvider by default", async () => {
    const provider = await loadProvider(policiesDir, { workingDir: root });
    expect(provider.name).toBe("claude");
    expect(provider.isEnabled()).toBe(true);
    expect(provider).toBeInstanceOf(ClaudeFixerProvider);
  });

  test("returns CodexFixerProvider when forced", async () => {
    const provider = await loadProvider(policiesDir, {
      workingDir: root,
      forceName: "codex",
    });
    expect(provider.name).toBe("codex");
    expect(provider.isEnabled()).toBe(false);
    expect(provider).toBeInstanceOf(CodexFixerProvider);
  });

  test("returns GeminiFixerProvider when forced", async () => {
    const provider = await loadProvider(policiesDir, {
      workingDir: root,
      forceName: "gemini",
    });
    expect(provider.name).toBe("gemini");
    expect(provider.isEnabled()).toBe(false);
    expect(provider).toBeInstanceOf(GeminiFixerProvider);
  });

  test("throws on unknown provider name", async () => {
    await expect(
      loadProvider(policiesDir, { workingDir: root, forceName: "llama" }),
    ).rejects.toThrow(/unknown fixer provider/);
  });
});

// ─── Claude provider invoke ───────────────────────────────────────────────────

describe("ClaudeFixerProvider.invoke", () => {
  test("runs claude CLI with --print and --max-turns", async () => {
    let capturedArgs: string[] | undefined;
    let capturedCwd: string | undefined;
    const runner: RunCommandFn = async (_cmd, args, options) => {
      if (!capturedArgs) {
        capturedArgs = args;
        capturedCwd = options?.cwd;
        return {
          exitCode: 0,
          stdout: "done",
          stderr: "",
          durationMs: 100,
          timedOut: false,
        };
      }
      // Second call is git diff
      return {
        exitCode: 0,
        stdout: "src/auth/login.ts\nsrc/auth/session.ts",
        stderr: "",
        durationMs: 10,
        timedOut: false,
      };
    };
    const provider = new ClaudeFixerProvider({
      workingDir: root,
      maxTurns: 30,
      runCommand: runner,
    });
    const packet = samplePacket();
    const result = await provider.invoke(packet, "run-1", 1);
    expect(capturedArgs?.[0]).toBe("--print");
    expect(capturedArgs).toContain("--max-turns");
    expect(capturedArgs?.[capturedArgs.indexOf("--max-turns") + 1]).toBe("30");
    expect(capturedCwd).toBe(root);
    expect(result.providerName).toBe("claude");
    expect(result.exitCode).toBe(0);
    expect(result.filesEditedCount).toBe(2);
  });

  test("filesEditedCount derived from git diff, NOT from fixer stdout", async () => {
    const runner: RunCommandFn = fakeRunner([
      {
        exitCode: 0,
        stdout: "I edited 100 files (fake claim!)",
        stderr: "",
        durationMs: 100,
        timedOut: false,
      },
      // git diff returns actual edits
      {
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 10,
        timedOut: false,
      },
    ]);
    const provider = new ClaudeFixerProvider({
      workingDir: root,
      maxTurns: 30,
      runCommand: runner,
    });
    const result = await provider.invoke(samplePacket(), "run-1", 1);
    expect(result.filesEditedCount).toBe(0);
  });

  test("detects fixer-notes.md if written", async () => {
    const packet = samplePacket();
    const runArtifactsDir = join(root, ".quality/runs/run-1");
    const notesPath = join(runArtifactsDir, "fixer-notes", "auth-login-1.md");
    // Pre-write notes to simulate a well-behaved fixer.
    await fs.mkdir(join(notesPath, ".."), { recursive: true });
    await fs.writeFile(notesPath, "my approach");

    const runner: RunCommandFn = fakeRunner([
      { exitCode: 0, stdout: "", stderr: "", durationMs: 100, timedOut: false },
      { exitCode: 0, stdout: "src/x.ts", stderr: "", durationMs: 10, timedOut: false },
    ]);
    const provider = new ClaudeFixerProvider({
      workingDir: root,
      maxTurns: 30,
      runCommand: runner,
    });
    const result = await provider.invoke(packet, "run-1", 1);
    expect(result.fixerNotesPath).toBe(notesPath);
  });

  test("packet-specified max_turns overrides provider default", async () => {
    let capturedArgs: string[] | undefined;
    const runner: RunCommandFn = async (_cmd, args) => {
      if (!capturedArgs) capturedArgs = args;
      return { exitCode: 0, stdout: "", stderr: "", durationMs: 10, timedOut: false };
    };
    const provider = new ClaudeFixerProvider({
      workingDir: root,
      maxTurns: 30,
      runCommand: runner,
    });
    const packet = samplePacket();
    packet.frontmatter.max_turns = 5;
    await provider.invoke(packet, "run-1", 1);
    const maxTurnsIdx = capturedArgs!.indexOf("--max-turns");
    expect(capturedArgs![maxTurnsIdx + 1]).toBe("5");
  });
});

// ─── Codex / Gemini disabled ─────────────────────────────────────────────────

describe("CodexFixerProvider (disabled)", () => {
  test("isEnabled returns false", () => {
    const provider = new CodexFixerProvider({ workingDir: root, maxTurns: 30 });
    expect(provider.isEnabled()).toBe(false);
    expect(provider.name).toBe("codex");
  });

  test("invoke throws actionable error", async () => {
    const provider = new CodexFixerProvider({ workingDir: root, maxTurns: 30 });
    await expect(
      provider.invoke(samplePacket(), "run-1", 1),
    ).rejects.toThrow(/Codex provider not enabled/);
  });
});

describe("GeminiFixerProvider (disabled)", () => {
  test("isEnabled returns false + invoke throws", async () => {
    const provider = new GeminiFixerProvider({ workingDir: root, maxTurns: 30 });
    expect(provider.isEnabled()).toBe(false);
    await expect(
      provider.invoke(samplePacket(), "run-1", 1),
    ).rejects.toThrow(/Gemini provider not enabled/);
  });
});

// ─── Helper functions ────────────────────────────────────────────────────────

describe("countFilesEdited", () => {
  test("counts non-empty lines from git diff", async () => {
    const runner: RunCommandFn = fakeRunner({
      exitCode: 0,
      stdout: "a.ts\nb.ts\n\n  \nc.ts",
      stderr: "",
      durationMs: 5,
      timedOut: false,
    });
    const count = await countFilesEdited({ runCommand: runner, workingDir: root });
    expect(count).toBe(3);
  });

  test("returns 0 on git failure", async () => {
    const runner: RunCommandFn = fakeRunner({
      exitCode: 128,
      stdout: "",
      stderr: "not a git repo",
      durationMs: 5,
      timedOut: false,
    });
    const count = await countFilesEdited({ runCommand: runner, workingDir: root });
    expect(count).toBe(0);
  });
});

describe("buildFixerPrompt / resolveFixerNotesPath", () => {
  test("prompt references packet path + allowed paths", () => {
    const prompt = buildFixerPrompt(
      "/repo/.quality/runs/run-1/packets/auth-login-3.md",
      "auth-login",
      3,
      "/repo/.quality/runs/run-1",
    );
    expect(prompt).toContain("packets/auth-login-3.md");
    expect(prompt).toContain("forbidden_edit_paths");
    expect(prompt).toContain("allowed_edit_paths");
    expect(prompt).toContain("fixer-notes/auth-login-3.md");
  });

  test("resolveFixerNotesPath matches blueprint layout", () => {
    const p = resolveFixerNotesPath("/repo/.quality/runs/run-1", "auth-login", 3);
    expect(p).toBe("/repo/.quality/runs/run-1/fixer-notes/auth-login-3.md");
  });
});
