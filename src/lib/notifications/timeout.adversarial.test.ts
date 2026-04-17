import { describe, expect, it, vi } from 'vitest';

import { withTimeout } from './timeout';

describe('withTimeout adversarial hardening', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648, 1.5])(
    'rejects malformed timeout value %s before invoking the provider callback',
    async (timeoutMs) => {
      const providerCall = vi.fn(async () => 'ok');

      await expect(withTimeout('resend', timeoutMs, providerCall)).rejects.toThrow(
        /Invalid timeout for provider "resend"/,
      );
      expect(providerCall).not.toHaveBeenCalled();
    },
  );

  it('still allows the maximum supported timer value', async () => {
    await expect(withTimeout('resend', 2_147_483_647, async () => 'ok')).resolves.toBe('ok');
  });
});
