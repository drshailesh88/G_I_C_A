/**
 * Provider abstraction (blueprint Part 8).
 *
 * Re-exports the Phase 1 `FixerProvider` / `FixerResult` types, adds a
 * Zod schema for `.quality/policies/providers.yaml`, and exposes a
 * `loadProvider(name, policiesDir, options)` factory that returns the
 * appropriate implementation based on the policy file.
 *
 * Providers are instantiated lazily — the factory checks `enabled` and
 * constructs the matching class. Disabled providers throw a clear error on
 * invoke(). New providers are added by dropping a new implementation file
 * + registering it in the PROVIDERS registry below.
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import yaml from "js-yaml";
import type { RunCommandFn } from "../gates/base.js";
import { createClaudeProvider } from "./claude.js";
import { createCodexProvider } from "./codex.js";
import { createGeminiProvider } from "./gemini.js";
import type { FixerProvider, FixerResult, RepairPacket, RunId } from "../types.js";

export type { FixerProvider, FixerResult, RepairPacket };

// ─── providers.yaml policy ────────────────────────────────────────────────────

export const ProvidersPolicySchema = z.object({
  schema_version: z.literal(1),
  active_fixer: z.string().min(1),
  enabled: z.array(z.string().min(1)).default([]),
  disabled: z.array(z.string().min(1)).default([]),
  max_turns: z.number().int().positive().default(30),
});
export type ProvidersPolicy = z.infer<typeof ProvidersPolicySchema>;

const DEFAULT_POLICY: ProvidersPolicy = {
  schema_version: 1,
  active_fixer: "claude",
  enabled: ["claude"],
  disabled: ["codex", "gemini"],
  max_turns: 30,
};

/** Read and validate providers.yaml. Returns a default policy if the file
 * is missing — a convenience for early-setup flows. */
export async function readProvidersPolicy(
  policiesDir: string,
): Promise<ProvidersPolicy> {
  const path = join(policiesDir, "providers.yaml");
  let raw: string;
  try {
    raw = await fs.readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_POLICY;
    throw err;
  }
  const parsed = yaml.load(raw);
  return ProvidersPolicySchema.parse(parsed);
}

// ─── Provider factory ─────────────────────────────────────────────────────────

export interface LoadProviderOptions {
  workingDir: string;
  runCommand?: RunCommandFn;
  /** Override policy read — used by tests. */
  policyOverride?: ProvidersPolicy;
  /** Force a specific provider regardless of policy.active_fixer. */
  forceName?: string;
}

export interface ProviderConstructor {
  (opts: {
    workingDir: string;
    maxTurns: number;
    runCommand?: RunCommandFn;
  }): FixerProvider;
}

export const PROVIDER_REGISTRY: Readonly<Record<string, ProviderConstructor>> = {
  claude: createClaudeProvider,
  codex: createCodexProvider,
  gemini: createGeminiProvider,
};

export async function loadProvider(
  policiesDir: string,
  options: LoadProviderOptions,
): Promise<FixerProvider> {
  const policy = options.policyOverride ?? (await readProvidersPolicy(policiesDir));
  const name = options.forceName ?? policy.active_fixer;

  if (policy.disabled.includes(name) && !policy.enabled.includes(name)) {
    // The active provider is disabled — construct it anyway so invoke()
    // throws the clear message, but flag via isEnabled=false.
  }
  const constructor = PROVIDER_REGISTRY[name];
  if (!constructor) {
    throw new Error(
      `unknown fixer provider: ${name}. Known: ${Object.keys(PROVIDER_REGISTRY).join(", ")}`,
    );
  }
  return constructor({
    workingDir: options.workingDir,
    maxTurns: policy.max_turns,
    ...(options.runCommand !== undefined ? { runCommand: options.runCommand } : {}),
  });
}

// ─── Shared helpers for provider implementations ──────────────────────────────

export interface ProviderConstructorOptions {
  workingDir: string;
  maxTurns: number;
  runCommand?: RunCommandFn;
}

export interface GitDiffFilesInput {
  runCommand: RunCommandFn;
  workingDir: string;
}

/** Count the files with uncommitted changes after a fixer invocation.
 * Controller determines whether to trust the fixer's edits via this count
 * + controller-run diff audit. Providers NEVER self-report edit count. */
export async function countFilesEdited(
  input: GitDiffFilesInput,
): Promise<number> {
  const outcome = await input.runCommand("git", ["diff", "--name-only", "HEAD"], {
    cwd: input.workingDir,
  });
  if (outcome.exitCode !== 0) return 0;
  return outcome.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

export function buildFixerPrompt(
  packetPath: string,
  feature: string,
  attempt: number,
  runArtifactsDir: string,
): string {
  return [
    "You are a fixer agent for the QA control plane.",
    "",
    `Read the repair packet at \`${packetPath}\` and execute the repair task.`,
    "",
    "Follow EVERY rule in the packet. In particular:",
    "- Do not edit any path in `forbidden_edit_paths`.",
    "- Do not weaken, skip, or delete tests.",
    "- Stay within `allowed_edit_paths`.",
    "- Do not narrate success — only the controller decides pass/fail.",
    "",
    `When done, write your approach summary to \`${join(runArtifactsDir, "fixer-notes", `${feature}-${attempt}.md`)}\`. Keep it under 500 words.`,
  ].join("\n");
}

export function resolveFixerNotesPath(
  runArtifactsDir: string,
  feature: string,
  attempt: number,
): string {
  return join(runArtifactsDir, "fixer-notes", `${feature}-${attempt}.md`);
}

/** Helper to build a FixerResult from a CommandOutcome + post-invocation
 * git state. Used by every enabled provider so edit-count semantics stay
 * identical across models. */
export async function finalizeFixerResult(input: {
  providerName: string;
  outcome: { exitCode: number; stdout: string; stderr: string; durationMs: number };
  runCommand: RunCommandFn;
  workingDir: string;
  fixerNotesPath?: string;
}): Promise<FixerResult> {
  const filesEditedCount = await countFilesEdited({
    runCommand: input.runCommand,
    workingDir: input.workingDir,
  });
  let notesExists = false;
  if (input.fixerNotesPath) {
    try {
      await fs.access(input.fixerNotesPath);
      notesExists = true;
    } catch {
      /* notes optional */
    }
  }
  return {
    providerName: input.providerName,
    exitCode: input.outcome.exitCode,
    stdout: input.outcome.stdout,
    stderr: input.outcome.stderr,
    durationMs: input.outcome.durationMs,
    filesEditedCount,
    ...(notesExists && input.fixerNotesPath
      ? { fixerNotesPath: input.fixerNotesPath }
      : {}),
  };
}

// ─── Invoke input (shared across providers) ──────────────────────────────────

export interface FixerInvokeContext {
  packet: RepairPacket;
  runId: RunId;
  attempt: number;
  runArtifactsDir: string;
}
