/**
 * Provider Timeout Utility
 *
 * Wraps async operations with AbortController-based timeouts.
 * Used by email, WhatsApp, and R2 providers.
 */

export class ProviderTimeoutError extends Error {
  public readonly timeoutMs: number;

  constructor(providerName: string, timeoutMs: number) {
    super(`Request timed out after ${timeoutMs / 1000}s`);
    this.name = 'ProviderTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Execute a function with an AbortController timeout.
 * If the function does not resolve within `timeoutMs`, the AbortSignal is aborted
 * and a ProviderTimeoutError is thrown.
 *
 * The callback receives the AbortSignal so it can pass it to fetch() or SDK calls.
 */
export async function withTimeout<T>(
  providerName: string,
  timeoutMs: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new ProviderTimeoutError(providerName, timeoutMs));
    }, timeoutMs);
    // Ensure the timer doesn't prevent Node from exiting
    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }
  });

  try {
    return await Promise.race([fn(controller.signal), timeoutPromise]);
  } catch (error) {
    // Re-throw — ProviderTimeoutError from race, or original error from fn
    throw error;
  }
}

/** Configured timeouts per provider/operation */
export const PROVIDER_TIMEOUTS = {
  RESEND_EMAIL: 10_000,
  EVOLUTION_WHATSAPP: 15_000,
  R2_UPLOAD: 30_000,
  R2_SIGNED_URL: 5_000,
} as const;
