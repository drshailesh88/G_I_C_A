/**
 * Claude Code provider (blueprint Part 8.2).
 *
 * Invokes `claude --print --max-turns N` from the target repo's working
 * directory so `.claude/settings.json` (Layer 1 permissions.deny) activates
 * automatically. The prompt references the packet file path so Claude reads
 * the structured instructions itself.
 *
 * filesEditedCount is derived from `git diff --name-only HEAD` AFTER the
 * invocation, never from the fixer's self-report. This is the Decision #2
 * principle: the controller owns truth.
 */
import { dirname } from "node:path";
import { promises as fs } from "node:fs";
import type { FixerProvider, FixerResult, RepairPacket, RunId } from "../types.js";
import {
  defaultRunCommand,
  type RunCommandFn,
} from "../gates/base.js";
import {
  buildFixerPrompt,
  finalizeFixerResult,
  resolveFixerNotesPath,
  type ProviderConstructorOptions,
} from "./base.js";

export const CLAUDE_PROVIDER_NAME = "claude";

export class ClaudeFixerProvider implements FixerProvider {
  readonly name = CLAUDE_PROVIDER_NAME;

  constructor(private readonly opts: ProviderConstructorOptions) {}

  isEnabled(): boolean {
    return true;
  }

  async invoke(
    packet: RepairPacket,
    runId: RunId,
    attempt: number,
  ): Promise<FixerResult> {
    const runCommand: RunCommandFn =
      this.opts.runCommand ?? defaultRunCommand();

    // The packet file lives under .quality/runs/<runId>/packets/...
    // runArtifactsDir is the run's root: go up one from packets/
    const runArtifactsDir = dirname(dirname(packet.path));
    const featureId = packet.frontmatter.feature_id;
    const fixerNotesPath = resolveFixerNotesPath(
      runArtifactsDir,
      featureId,
      attempt,
    );

    // Ensure fixer-notes directory exists so the fixer can write into it.
    await fs.mkdir(dirname(fixerNotesPath), { recursive: true });

    const prompt = buildFixerPrompt(
      packet.path,
      featureId,
      attempt,
      runArtifactsDir,
    );

    const outcome = await runCommand(
      "claude",
      [
        "--print",
        "--max-turns",
        String(packet.frontmatter.max_turns ?? this.opts.maxTurns),
        prompt,
      ],
      {
        cwd: this.opts.workingDir,
        timeout: 30 * 60 * 1000, // 30 minute safety net for long fixes
      },
    );

    return finalizeFixerResult({
      providerName: CLAUDE_PROVIDER_NAME,
      outcome,
      runCommand,
      workingDir: this.opts.workingDir,
      fixerNotesPath,
    });
  }
}

export function createClaudeProvider(
  opts: ProviderConstructorOptions,
): FixerProvider {
  return new ClaudeFixerProvider(opts);
}
