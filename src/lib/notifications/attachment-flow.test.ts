/**
 * Attachment Flow Tests — Req 6A-3
 *
 * Verifies that email and WhatsApp adapters handle AttachmentDescriptor[]
 * by generating R2 signed URLs and passing them to the providers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock R2 storage provider
const mockGetSignedUrl = vi.fn().mockResolvedValue('https://r2.example.com/signed/cert.pdf?token=abc');
vi.mock('@/lib/certificates/storage', () => ({
  createR2Provider: () => ({
    getSignedUrl: mockGetSignedUrl,
  }),
}));

// Mock resend
vi.mock('resend', () => {
  const mockSend = vi.fn();
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: { send: mockSend },
    })),
    __mockSend: mockSend,
  };
});

import { resendEmailProvider } from './email';
import { evolutionWhatsAppProvider } from './whatsapp';
import { Resend } from 'resend';

function getMockSend() {
  const instance = new Resend('test');
  return instance.emails.send as ReturnType<typeof vi.fn>;
}

describe('Email attachment flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-api-key';
    process.env.RESEND_FROM_EMAIL = 'test@gemindia.org';
  });

  it('sends email with attachment using R2 signed URL', async () => {
    const mockSend = getMockSend();
    mockSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null });

    const result = await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Your Certificate',
      htmlBody: '<p>Attached is your certificate</p>',
      attachments: [
        {
          fileName: 'certificate.pdf',
          storageKey: 'certificates/evt-1/delegate_attendance/cert-1.pdf',
          contentType: 'application/pdf',
        },
      ],
    });

    expect(result.accepted).toBe(true);
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      'certificates/evt-1/delegate_attendance/cert-1.pdf',
      900, // 15 minutes
    );
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          {
            filename: 'certificate.pdf',
            path: 'https://r2.example.com/signed/cert.pdf?token=abc',
          },
        ],
      }),
    );
  });

  it('sends email without attachments when none provided', async () => {
    const mockSend = getMockSend();
    mockSend.mockResolvedValue({ data: { id: 'msg-2' }, error: null });

    await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'No Attachment',
      htmlBody: '<p>Hello</p>',
    });

    expect(mockGetSignedUrl).not.toHaveBeenCalled();
    // Verify no attachments key in the Resend call
    const callArgs = mockSend.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('attachments');
  });

  it('sends email without attachments when empty array provided', async () => {
    const mockSend = getMockSend();
    mockSend.mockResolvedValue({ data: { id: 'msg-3' }, error: null });

    await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Empty Attachments',
      htmlBody: '<p>Hello</p>',
      attachments: [],
    });

    expect(mockGetSignedUrl).not.toHaveBeenCalled();
    const callArgs = mockSend.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('attachments');
  });

  it('sends email with multiple attachments', async () => {
    const mockSend = getMockSend();
    mockSend.mockResolvedValue({ data: { id: 'msg-4' }, error: null });
    mockGetSignedUrl
      .mockResolvedValueOnce('https://r2.example.com/signed/cert1.pdf')
      .mockResolvedValueOnce('https://r2.example.com/signed/cert2.pdf');

    await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Two Certs',
      htmlBody: '<p>Two certificates attached</p>',
      attachments: [
        { fileName: 'cert1.pdf', storageKey: 'certs/1.pdf', contentType: 'application/pdf' },
        { fileName: 'cert2.pdf', storageKey: 'certs/2.pdf', contentType: 'application/pdf' },
      ],
    });

    expect(mockGetSignedUrl).toHaveBeenCalledTimes(2);
    const callArgs = mockSend.mock.calls[0][0];
    expect(callArgs.attachments).toHaveLength(2);
  });

  it('propagates R2 signed URL error to caller', async () => {
    mockGetSignedUrl.mockRejectedValueOnce(new Error('R2 unavailable'));

    await expect(
      resendEmailProvider.send({
        eventId: 'evt-1',
        toEmail: 'user@example.com',
        subject: 'Broken Attachment',
        htmlBody: '<p>Hello</p>',
        attachments: [
          { fileName: 'cert.pdf', storageKey: 'bad/key.pdf' },
        ],
      }),
    ).rejects.toThrow('R2 unavailable');
  });
});

describe('WhatsApp attachment flow', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EVOLUTION_API_BASE_URL = 'https://evo.example.com';
    process.env.EVOLUTION_API_KEY = 'test-evo-key';
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends media message with PDF attachment', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-msg-1' }, status: 'sent' }),
    });
    mockGetSignedUrl.mockResolvedValueOnce('https://r2.example.com/signed/ticket.pdf');

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Your travel ticket',
      mediaAttachments: [
        {
          fileName: 'ticket.pdf',
          storageKey: 'travel/evt-1/ticket.pdf',
          contentType: 'application/pdf',
        },
      ],
    });

    expect(result.accepted).toBe(true);
    expect(mockGetSignedUrl).toHaveBeenCalledWith('travel/evt-1/ticket.pdf', 900);

    // Should call sendMedia endpoint, not sendText
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://evo.example.com/message/sendMedia',
      expect.anything(),
    );

    const callBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(callBody.mediatype).toBe('document');
    expect(callBody.media).toBe('https://r2.example.com/signed/ticket.pdf');
    expect(callBody.fileName).toBe('ticket.pdf');
    expect(callBody.caption).toBe('Your travel ticket');
  });

  it('sends image attachment with correct media type', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-msg-2' } }),
    });
    mockGetSignedUrl.mockResolvedValueOnce('https://r2.example.com/signed/badge.png');

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Your badge',
      mediaAttachments: [
        {
          fileName: 'badge.png',
          storageKey: 'badges/badge.png',
          contentType: 'image/png',
        },
      ],
    });

    const callBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(callBody.mediatype).toBe('image');
  });

  it('sends text message when no attachments', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-msg-3' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Plain text message',
    });

    expect(mockGetSignedUrl).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://evo.example.com/message/sendText',
      expect.anything(),
    );
  });

  it('handles media send failure gracefully', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 413,
      text: async () => 'File too large',
    });
    mockGetSignedUrl.mockResolvedValueOnce('https://r2.example.com/signed/big.pdf');

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Big file',
      mediaAttachments: [
        { fileName: 'big.pdf', storageKey: 'files/big.pdf', contentType: 'application/pdf' },
      ],
    });

    expect(result.accepted).toBe(false);
    expect(result.rawStatus).toContain('413');
  });

  it('propagates R2 error for media attachments', async () => {
    mockGetSignedUrl.mockRejectedValueOnce(new Error('R2 timeout'));

    await expect(
      evolutionWhatsAppProvider.sendText({
        eventId: 'evt-1',
        toPhoneE164: '+919876543210',
        body: 'Broken',
        mediaAttachments: [
          { fileName: 'cert.pdf', storageKey: 'bad/key.pdf' },
        ],
      }),
    ).rejects.toThrow('R2 timeout');
  });

  it('defaults to document mediatype when contentType is undefined', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-msg-5' } }),
    });
    mockGetSignedUrl.mockResolvedValueOnce('https://r2.example.com/signed/file');

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Unknown file',
      mediaAttachments: [
        { fileName: 'unknown.bin', storageKey: 'files/unknown.bin' },
      ],
    });

    const callBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(callBody.mediatype).toBe('document');
  });
});
