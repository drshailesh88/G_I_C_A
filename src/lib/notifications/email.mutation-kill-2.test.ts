/**
 * Mutation-killing tests Round 2 for email.ts
 *
 * Targets: 15 survivors — sanitizeFileName, resolveAttachments,
 * fromAddress construction, error response exact values.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSend = vi.fn();
const { mockGetSignedUrl } = vi.hoisted(() => ({
  mockGetSignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/signed-url'),
}));

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

vi.mock('@/lib/certificates/storage', () => ({
  createR2Provider: vi.fn().mockReturnValue({
    getSignedUrl: mockGetSignedUrl,
  }),
}));

vi.mock('./timeout', () => ({
  withTimeout: vi.fn((_name: string, _ms: number, fn: Function) => fn()),
  PROVIDER_TIMEOUTS: {
    RESEND_EMAIL: 10000,
    R2_SIGNED_URL: 5000,
  },
}));

import { resendEmailProvider } from './email';

describe('email — provider exact values', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-resend-key';
    process.env.RESEND_FROM_EMAIL = 'test@gemindia.org';
    mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });
  });

  afterEach(() => {
    delete process.env.RESEND_FROM_EMAIL;
  });

  it('returns provider as resend on success', async () => {
    const result = await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Test',
      htmlBody: '<p>Hello</p>',
    });

    expect(result.provider).toBe('resend');
    expect(result.accepted).toBe(true);
    expect(result.rawStatus).toBe('accepted');
    expect(result.providerMessageId).toBe('email-123');
  });

  it('returns provider as resend on error', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'Rate limited' } });

    const result = await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Test',
      htmlBody: '<p>Hello</p>',
    });

    expect(result.provider).toBe('resend');
    expect(result.accepted).toBe(false);
    expect(result.rawStatus).toBe('Rate limited');
    expect(result.providerMessageId).toBeNull();
  });

  it('returns unknown_error rawStatus when error.message is missing', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: null } });

    const result = await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Test',
      htmlBody: '<p>Hello</p>',
    });

    expect(result.rawStatus).toBe('unknown_error');
  });

  it('returns null providerMessageId when data is null on success', async () => {
    mockSend.mockResolvedValue({ data: null, error: null });

    const result = await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Test',
      htmlBody: '<p>Hello</p>',
    });

    expect(result.providerMessageId).toBeNull();
    expect(result.accepted).toBe(true);
  });

  it('constructs from address with fromDisplayName', async () => {
    await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Test',
      htmlBody: '<p>Hello</p>',
      fromDisplayName: 'Custom Sender',
    });

    const sendCall = mockSend.mock.calls[0][0];
    expect(sendCall.from).toContain('Custom Sender');
    expect(sendCall.from).toContain('test@gemindia.org');
  });

  it('uses default from address when no fromDisplayName', async () => {
    await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Test',
      htmlBody: '<p>Hello</p>',
    });

    const sendCall = mockSend.mock.calls[0][0];
    expect(sendCall.from).toContain('GEM India');
    expect(sendCall.from).toContain('test@gemindia.org');
  });

  it('uses DEFAULT_FROM when RESEND_FROM_EMAIL is not set', async () => {
    delete process.env.RESEND_FROM_EMAIL;

    await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Test',
      htmlBody: '<p>Hello</p>',
    });

    const sendCall = mockSend.mock.calls[0][0];
    expect(sendCall.from).toBe('GEM India <noreply@gemindia.org>');
  });

  it('throws when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY;

    // Need to re-import to trigger getResendClient
    // The mock for Resend constructor still applies, but getResendClient checks env
    await expect(
      resendEmailProvider.send({
        eventId: 'evt-1',
        toEmail: 'user@example.com',
        subject: 'Test',
        htmlBody: '<p>Hello</p>',
      }),
    ).rejects.toThrow('RESEND_API_KEY');
  });
});

describe('email — sanitizeFileName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'test@gemindia.org';
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  });

  it('strips null bytes from filename', async () => {
    await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Test',
      htmlBody: '<p>Hello</p>',
      attachments: [{
        fileName: 'file\0name.pdf',
        storageKey: 'uploads/file.pdf',
        contentType: 'application/pdf',
      }],
    });

    const sendCall = mockSend.mock.calls[0][0];
    expect(sendCall.attachments[0].filename).toBe('filename.pdf');
  });

  it('extracts basename from paths', async () => {
    await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Test',
      htmlBody: '<p>Hello</p>',
      attachments: [{
        fileName: '/path/to/file.pdf',
        storageKey: 'uploads/file.pdf',
        contentType: 'application/pdf',
      }],
    });

    const sendCall = mockSend.mock.calls[0][0];
    expect(sendCall.attachments[0].filename).toBe('file.pdf');
  });

  it('removes path traversal sequences', async () => {
    await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Test',
      htmlBody: '<p>Hello</p>',
      attachments: [{
        fileName: '../../etc/passwd',
        storageKey: 'uploads/file',
        contentType: 'text/plain',
      }],
    });

    const sendCall = mockSend.mock.calls[0][0];
    expect(sendCall.attachments[0].filename).not.toContain('..');
  });

  it('strips leading dots', async () => {
    await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Test',
      htmlBody: '<p>Hello</p>',
      attachments: [{
        fileName: '...hidden',
        storageKey: 'uploads/file',
        contentType: 'text/plain',
      }],
    });

    const sendCall = mockSend.mock.calls[0][0];
    expect(sendCall.attachments[0].filename).not.toMatch(/^\./);
  });

  it('truncates filename longer than 255 chars', async () => {
    await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Test',
      htmlBody: '<p>Hello</p>',
      attachments: [{
        fileName: 'x'.repeat(300),
        storageKey: 'uploads/file',
        contentType: 'text/plain',
      }],
    });

    const sendCall = mockSend.mock.calls[0][0];
    expect(sendCall.attachments[0].filename.length).toBeLessThanOrEqual(255);
  });
});

describe('email — validateAttachment', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'test@gemindia.org';
  });

  it('throws on empty storageKey', async () => {
    await expect(
      resendEmailProvider.send({
        eventId: 'evt-1',
        toEmail: 'user@example.com',
        subject: 'Test',
        htmlBody: '<p>Hello</p>',
        attachments: [{
          fileName: 'file.pdf',
          storageKey: '',
          contentType: 'application/pdf',
        }],
      }),
    ).rejects.toThrow('Invalid attachment storageKey');
  });

  it('throws on storageKey containing null bytes', async () => {
    await expect(
      resendEmailProvider.send({
        eventId: 'evt-1',
        toEmail: 'user@example.com',
        subject: 'Test',
        htmlBody: '<p>Hello</p>',
        attachments: [{
          fileName: 'file.pdf',
          storageKey: 'uploads/\0file.pdf',
          contentType: 'application/pdf',
        }],
      }),
    ).rejects.toThrow('Invalid attachment storageKey');
  });

  it('throws on missing fileName', async () => {
    await expect(
      resendEmailProvider.send({
        eventId: 'evt-1',
        toEmail: 'user@example.com',
        subject: 'Test',
        htmlBody: '<p>Hello</p>',
        attachments: [{
          fileName: '',
          storageKey: 'uploads/file.pdf',
          contentType: 'application/pdf',
        }],
      }),
    ).rejects.toThrow('fileName is required');
  });
});
