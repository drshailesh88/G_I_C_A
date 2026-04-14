/**
 * Codex provider stub.
 *
 * Codex CLI has no path-scoped deny. Enabling it as the fixer requires
 * wrapping under a Seatbelt (macOS) or landlock (Linux) sandbox. Until
 * that's configured, isEnabled()=false and invoke() throws with an
 * actionable message.
 *
 * Blueprint status: scaffolded but `status: not_enabled` in providers.yaml.
 */
import type { FixerProvider, FixerResult, RepairPacket, RunId } from "../types.js";
import type { ProviderConstructorOptions } from "./base.js";

export const CODEX_PROVIDER_NAME = "codex";

export class CodexFixerProvider implements FixerProvider {
  readonly name = CODEX_PROVIDER_NAME;

  constructor(private readonly _opts: ProviderConstructorOptions) {}

  isEnabled(): boolean {
    return false;
  }

  async invoke(
    _packet: RepairPacket,
    _runId: RunId,
    _attempt: number,
  ): Promise<FixerResult> {
    throw new Error(
      "Codex provider not enabled. Enable in .quality/policies/providers.yaml " +
        "AND install a Seatbelt/landlock wrapper per blueprint decision 15a. " +
        "Codex has only coarse workspace-write modes — it will not respect " +
        "path-scoped locked surfaces without the wrapper.",
    );
  }
}

export function createCodexProvider(
  opts: ProviderConstructorOptions,
): FixerProvider {
  return new CodexFixerProvider(opts);
}
