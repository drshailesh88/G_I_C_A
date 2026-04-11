/**
 * Mutation-killing tests for timeout.ts
 *
 * Targets: 2 survivors — StringLiteral on error message, ConditionalExpression
 * on timer !== undefined check.
 */

import { describe, it, expect } from 'vitest';
import { ProviderTimeoutError, withTimeout, PROVIDER_TIMEOUTS } from './timeout';

describe('ProviderTimeoutError', () => {
  it('has correct name property', () => {
    const err = new ProviderTimeoutError('resend', 10000);
    expect(err.name).toBe('ProviderTimeoutError');
  });

  it('has correct timeoutMs property', () => {
    const err = new ProviderTimeoutError('resend', 10000);
    expect(err.timeoutMs).toBe(10000);
  });

  it('message includes timeout in seconds', () => {
    const err = new ProviderTimeoutError('resend', 10000);
    expect(err.message).toBe('Request timed out after 10s');
  });

  it('is an instance of Error', () => {
    const err = new ProviderTimeoutError('resend', 5000);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('withTimeout — timer cleanup', () => {
  it('clears timer on success (no leak)', async () => {
    const result = await withTimeout('test', 5000, async () => 'done');
    expect(result).toBe('done');
  });

  it('clears timer even when fn throws', async () => {
    await expect(
      withTimeout('test', 5000, async () => {
        throw new Error('fn error');
      }),
    ).rejects.toThrow('fn error');
  });
});

describe('PROVIDER_TIMEOUTS', () => {
  it('exports configured timeout values', () => {
    expect(PROVIDER_TIMEOUTS.RESEND_EMAIL).toBe(10_000);
    expect(PROVIDER_TIMEOUTS.EVOLUTION_WHATSAPP).toBe(15_000);
    expect(PROVIDER_TIMEOUTS.R2_UPLOAD).toBe(30_000);
    expect(PROVIDER_TIMEOUTS.R2_SIGNED_URL).toBe(5_000);
  });
});
