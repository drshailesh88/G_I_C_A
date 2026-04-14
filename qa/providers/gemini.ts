/**
 * Gemini provider stub.
 *
 * Same rationale as Codex: no native path-scoped deny. Requires Seatbelt or
 * equivalent wrapper before it can be trusted as the fixer.
 */
import type { FixerProvider, FixerResult, RepairPacket, RunId } from "../types.js";
import type { ProviderConstructorOptions } from "./base.js";

export const GEMINI_PROVIDER_NAME = "gemini";

export class GeminiFixerProvider implements FixerProvider {
  readonly name = GEMINI_PROVIDER_NAME;

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
      "Gemini provider not enabled. Enable in .quality/policies/providers.yaml " +
        "AND install a Seatbelt/landlock wrapper per blueprint decision 15a. " +
        "Gemini CLI lacks path-scoped deny; without the wrapper locked surfaces " +
        "are unprotected.",
    );
  }
}

export function createGeminiProvider(
  opts: ProviderConstructorOptions,
): FixerProvider {
  return new GeminiFixerProvider(opts);
}
