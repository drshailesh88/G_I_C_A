import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockResendSend,
  mockGetSignedUrl,
} = vi.hoisted(() => ({
  mockResendSend: vi.fn(),
  mockGetSignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/signed-url'),
}));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockResendSend },
  })),
}));

vi.mock('@/lib/certificates/storage', () => ({
  createR2Provider: vi.fn().mockReturnValue({
    getSignedUrl: mockGetSignedUrl,
  }),
}));

vi.mock('./timeout', () => ({
  withTimeout: vi.fn((_name: string, _ms: number, fn: Function) => fn(new AbortController().signal)),
  PROVIDER_TIMEOUTS: {
    RESEND_EMAIL: 10_000,
    R2_SIGNED_URL: 5_000,
  },
}));

import { resendEmailProvider } from './email';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_EVENT_ID = '550e8400-e29b-41d4-a716-446655440999';

describe('resendEmailProvider — adversarial hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-api-key';
    process.env.RESEND_FROM_EMAIL = 'notifications@gemindia.org';
    mockResendSend.mockResolvedValue({ data: { id: 'msg-123' }, error: null });
    mockGetSignedUrl.mockResolvedValue('https://r2.example.com/signed-url');
  });

  it('rejects attachment storage keys that point at another event', async () => {
    await expect(
      resendEmailProvider.send({
        eventId: EVENT_ID,
        toEmail: 'delegate@example.com',
        subject: 'Certificate ready',
        htmlBody: '<p>Attached</p>',
        attachments: [
          {
            fileName: 'certificate.pdf',
            storageKey: `certificates/${OTHER_EVENT_ID}/delegate_attendance/cert-1.pdf`,
            contentType: 'application/pdf',
          },
        ],
      }),
    ).rejects.toThrow('Attachment storageKey is outside the active event scope');

    expect(mockGetSignedUrl).not.toHaveBeenCalled();
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('rejects newline injection in fromDisplayName before calling Resend', async () => {
    await expect(
      resendEmailProvider.send({
        eventId: EVENT_ID,
        toEmail: 'delegate@example.com',
        subject: 'Hello',
        htmlBody: '<p>Hello</p>',
        fromDisplayName: 'GEM India\r\nBcc: attacker@example.com',
      }),
    ).rejects.toThrow('Invalid from display name');

    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('rejects reserved metadata headers that can override message routing', async () => {
    await expect(
      resendEmailProvider.send({
        eventId: EVENT_ID,
        toEmail: 'delegate@example.com',
        subject: 'Hello',
        htmlBody: '<p>Hello</p>',
        metadata: {
          bcc: 'attacker@example.com',
        },
      }),
    ).rejects.toThrow('Invalid custom email header');

    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('rejects control characters in custom metadata header values', async () => {
    await expect(
      resendEmailProvider.send({
        eventId: EVENT_ID,
        toEmail: 'delegate@example.com',
        subject: 'Hello',
        htmlBody: '<p>Hello</p>',
        metadata: {
          'x-trigger-id': 'travel-1\r\nbcc: attacker@example.com',
        },
      }),
    ).rejects.toThrow('Invalid custom email header');

    expect(mockResendSend).not.toHaveBeenCalled();
  });
});
