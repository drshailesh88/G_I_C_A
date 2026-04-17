import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSignedUrl } = vi.hoisted(() => ({
  mockGetSignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/signed-url'),
}));

vi.mock('@/lib/certificates/storage', () => ({
  createR2Provider: vi.fn().mockReturnValue({
    getSignedUrl: mockGetSignedUrl,
  }),
}));

vi.mock('./timeout', () => ({
  withTimeout: vi.fn((_name: string, _ms: number, fn: Function) => fn(new AbortController().signal)),
  PROVIDER_TIMEOUTS: {
    EVOLUTION_WHATSAPP: 10_000,
    R2_SIGNED_URL: 5_000,
  },
}));

import { evolutionWhatsAppProvider } from './whatsapp';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_EVENT_ID = '550e8400-e29b-41d4-a716-446655440999';

describe('evolutionWhatsAppProvider — adversarial hardening', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EVOLUTION_API_BASE_URL = 'https://evo.example.com';
    process.env.EVOLUTION_API_KEY = 'test-evo-key';
    globalThis.fetch = vi.fn();
    mockGetSignedUrl.mockResolvedValue('https://r2.example.com/signed-url');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects attachment storage keys that point at another event', async () => {
    await expect(
      evolutionWhatsAppProvider.sendText({
        eventId: EVENT_ID,
        toPhoneE164: '+919876543210',
        body: 'Attached certificate',
        mediaAttachments: [
          {
            fileName: 'certificate.pdf',
            storageKey: `certificates/${OTHER_EVENT_ID}/delegate_attendance/cert-1.pdf`,
            contentType: 'application/pdf',
          },
        ],
      }),
    ).rejects.toThrow('Attachment storageKey is outside the active event scope');

    expect(mockGetSignedUrl).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
