/**
 * Mutation-killing tests for email.ts
 *
 * Targets: 16 Survived — sanitizeFileName, validateAttachment,
 * resolveAttachments, fromAddress construction, default FROM.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockResendSend, mockGetSignedUrl } = vi.hoisted(() => ({
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
  PROVIDER_TIMEOUTS: { RESEND_EMAIL: 10000, R2_SIGNED_URL: 5000 },
}));

import { resendEmailProvider } from './email';

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-api-key';
  delete process.env.RESEND_FROM_EMAIL;
  mockResendSend.mockClear().mockResolvedValue({ data: { id: 'email-123' }, error: null });
  mockGetSignedUrl.mockClear().mockResolvedValue('https://r2.example.com/signed-url');
});

describe('resendEmailProvider — from address construction', () => {
  it('uses DEFAULT_FROM when no RESEND_FROM_EMAIL and no fromDisplayName', async () => {
    const result = await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Test',
      htmlBody: '<p>Hello</p>',
    });

    expect(result.accepted).toBe(true);
    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.from).toBe('GEM India <noreply@gemindia.org>');
  });

  it('uses RESEND_FROM_EMAIL with GEM India prefix when set', async () => {
    process.env.RESEND_FROM_EMAIL = 'custom@gem.org';
    await resendEmailProvider.send({
      eventId: 'evt-1', toEmail: 'u@x.com', subject: 'S', htmlBody: 'B',
    });

    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.from).toBe('GEM India <custom@gem.org>');
  });

  it('uses fromDisplayName with RESEND_FROM_EMAIL', async () => {
    process.env.RESEND_FROM_EMAIL = 'custom@gem.org';
    await resendEmailProvider.send({
      eventId: 'evt-1', toEmail: 'u@x.com', subject: 'S', htmlBody: 'B',
      fromDisplayName: 'Conference Team',
    });

    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.from).toBe('Conference Team <custom@gem.org>');
  });

  it('uses fromDisplayName with default email when RESEND_FROM_EMAIL not set', async () => {
    await resendEmailProvider.send({
      eventId: 'evt-1', toEmail: 'u@x.com', subject: 'S', htmlBody: 'B',
      fromDisplayName: 'Custom Name',
    });

    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.from).toContain('Custom Name');
    expect(callArgs.from).toContain('noreply@gemindia.org');
  });
});

describe('resendEmailProvider — error handling', () => {
  it('throws when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(resendEmailProvider.send({
      eventId: 'e', toEmail: 'u@x.com', subject: 'S', htmlBody: 'B',
    })).rejects.toThrow('RESEND_API_KEY');
  });

  it('returns rawStatus from error message', async () => {
    mockResendSend.mockResolvedValueOnce({ data: null, error: { message: 'Rate limited' } });
    const result = await resendEmailProvider.send({
      eventId: 'e', toEmail: 'u@x.com', subject: 'S', htmlBody: 'B',
    });
    expect(result.accepted).toBe(false);
    expect(result.rawStatus).toBe('Rate limited');
    expect(result.providerMessageId).toBeNull();
  });

  it('uses unknown_error when error has no message', async () => {
    mockResendSend.mockResolvedValueOnce({ data: null, error: {} });
    const result = await resendEmailProvider.send({
      eventId: 'e', toEmail: 'u@x.com', subject: 'S', htmlBody: 'B',
    });
    expect(result.rawStatus).toBe('unknown_error');
  });

  it('returns providerMessageId from data.id', async () => {
    mockResendSend.mockResolvedValueOnce({ data: { id: 'resend-msg-999' }, error: null });
    const result = await resendEmailProvider.send({
      eventId: 'e', toEmail: 'u@x.com', subject: 'S', htmlBody: 'B',
    });
    expect(result.providerMessageId).toBe('resend-msg-999');
    expect(result.provider).toBe('resend');
    expect(result.rawStatus).toBe('accepted');
  });

  it('returns null providerMessageId when data is null', async () => {
    mockResendSend.mockResolvedValueOnce({ data: null, error: null });
    const result = await resendEmailProvider.send({
      eventId: 'e', toEmail: 'u@x.com', subject: 'S', htmlBody: 'B',
    });
    expect(result.providerMessageId).toBeNull();
  });
});

describe('resendEmailProvider — attachments', () => {
  it('resolves attachments via R2 signed URLs', async () => {
    await resendEmailProvider.send({
      eventId: 'e', toEmail: 'u@x.com', subject: 'S', htmlBody: 'B',
      attachments: [{ fileName: 'doc.pdf', storageKey: 'uploads/doc.pdf', contentType: 'application/pdf' }],
    });

    expect(mockGetSignedUrl).toHaveBeenCalledWith('uploads/doc.pdf', 900);
    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.attachments).toEqual([{
      filename: 'doc.pdf',
      path: 'https://r2.example.com/signed-url',
    }]);
  });

  it('sanitizes attachment filenames — strips path traversal', async () => {
    await resendEmailProvider.send({
      eventId: 'e', toEmail: 'u@x.com', subject: 'S', htmlBody: 'B',
      attachments: [{ fileName: '../../etc/passwd', storageKey: 'uploads/x.pdf' }],
    });

    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.attachments[0].filename).not.toContain('..');
  });

  it('validates storageKey — rejects null bytes', async () => {
    await expect(resendEmailProvider.send({
      eventId: 'e', toEmail: 'u@x.com', subject: 'S', htmlBody: 'B',
      attachments: [{ fileName: 'x.pdf', storageKey: 'uploads/x\0.pdf' }],
    })).rejects.toThrow('Invalid attachment storageKey');
  });

  it('validates fileName — rejects empty', async () => {
    await expect(resendEmailProvider.send({
      eventId: 'e', toEmail: 'u@x.com', subject: 'S', htmlBody: 'B',
      attachments: [{ fileName: '', storageKey: 'uploads/x.pdf' }],
    })).rejects.toThrow('fileName is required');
  });

  it('does not include attachments when none provided', async () => {
    await resendEmailProvider.send({
      eventId: 'e', toEmail: 'u@x.com', subject: 'S', htmlBody: 'B',
    });

    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('attachments');
  });

  it('passes metadata as headers', async () => {
    await resendEmailProvider.send({
      eventId: 'e', toEmail: 'u@x.com', subject: 'S', htmlBody: 'B',
      metadata: { 'X-Custom': 'value' },
    });

    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.headers).toEqual({ 'X-Custom': 'value' });
  });
});
