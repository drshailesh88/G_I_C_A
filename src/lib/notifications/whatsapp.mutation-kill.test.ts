/**
 * Mutation-killing tests for whatsapp.ts
 *
 * Targets: 40 Survived mutations (media message path, sanitizeFileName,
 * validateAttachment, getMediaType, response parsing).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
    EVOLUTION_WHATSAPP: 15000,
    R2_SIGNED_URL: 5000,
  },
}));

import { evolutionWhatsAppProvider } from './whatsapp';

describe('evolutionWhatsAppProvider — media messages', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.EVOLUTION_API_BASE_URL = 'https://evo.example.com';
    process.env.EVOLUTION_API_KEY = 'test-evo-key';
    globalThis.fetch = vi.fn();
    mockGetSignedUrl.mockClear().mockResolvedValue('https://r2.example.com/signed-url');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends media message when attachments provided', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-msg-media' }, status: 'sent' }),
    });

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Here is your document',
      mediaAttachments: [
        {
          fileName: 'travel-itinerary.pdf',
          storageKey: 'uploads/evt-1/travel-itinerary.pdf',
          contentType: 'application/pdf',
        },
      ],
    });

    expect(result.accepted).toBe(true);
    expect(result.providerMessageId).toBe('wa-msg-media');

    // Verify sendMedia endpoint was called (not sendText)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://evo.example.com/message/sendMedia',
      expect.objectContaining({
        method: 'POST',
      }),
    );

    const callBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(callBody.number).toBe('919876543210');
    expect(callBody.mediatype).toBe('document');
    expect(callBody.media).toBe('https://r2.example.com/signed-url');
    expect(callBody.caption).toBe('Here is your document');
    expect(callBody.fileName).toBe('travel-itinerary.pdf');
  });

  it('detects image content type', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-img' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Photo',
      mediaAttachments: [
        {
          fileName: 'photo.jpg',
          storageKey: 'uploads/photo.jpg',
          contentType: 'image/jpeg',
        },
      ],
    });

    const callBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(callBody.mediatype).toBe('image');
  });

  it('defaults to document for unknown content types', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-doc' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'File',
      mediaAttachments: [
        {
          fileName: 'data.csv',
          storageKey: 'uploads/data.csv',
          contentType: 'text/csv',
        },
      ],
    });

    const callBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(callBody.mediatype).toBe('document');
  });

  it('defaults to document when contentType is undefined', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-doc' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'File',
      mediaAttachments: [
        { fileName: 'file.bin', storageKey: 'uploads/file.bin' },
      ],
    });

    const callBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(callBody.mediatype).toBe('document');
  });

  it('warns when multiple attachments provided (only first sent)', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-1' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Files',
      mediaAttachments: [
        { fileName: 'a.pdf', storageKey: 'uploads/a.pdf', contentType: 'application/pdf' },
        { fileName: 'b.pdf', storageKey: 'uploads/b.pdf', contentType: 'application/pdf' },
      ],
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('2 attachments'),
    );
    consoleSpy.mockRestore();
  });

  it('throws on invalid attachment storageKey (null bytes)', async () => {
    await expect(
      evolutionWhatsAppProvider.sendText({
        eventId: 'evt-1',
        toPhoneE164: '+919876543210',
        body: 'Bad',
        mediaAttachments: [
          { fileName: 'evil.pdf', storageKey: 'uploads/evil\0.pdf' },
        ],
      }),
    ).rejects.toThrow('Invalid attachment storageKey');
  });

  it('throws on empty attachment storageKey', async () => {
    await expect(
      evolutionWhatsAppProvider.sendText({
        eventId: 'evt-1',
        toPhoneE164: '+919876543210',
        body: 'Bad',
        mediaAttachments: [
          { fileName: 'file.pdf', storageKey: '' },
        ],
      }),
    ).rejects.toThrow('Invalid attachment storageKey');
  });

  it('throws on missing attachment fileName', async () => {
    await expect(
      evolutionWhatsAppProvider.sendText({
        eventId: 'evt-1',
        toPhoneE164: '+919876543210',
        body: 'Bad',
        mediaAttachments: [
          { fileName: '', storageKey: 'uploads/file.pdf' },
        ],
      }),
    ).rejects.toThrow('Attachment fileName is required');
  });

  it('sanitizes filename: strips path traversal', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-1' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Doc',
      mediaAttachments: [
        { fileName: '../../etc/passwd', storageKey: 'uploads/file.pdf' },
      ],
    });

    const callBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(callBody.fileName).not.toContain('..');
    expect(callBody.fileName).not.toContain('/');
  });

  it('sanitizes filename: strips null bytes', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-1' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Doc',
      mediaAttachments: [
        { fileName: 'file\0.pdf', storageKey: 'uploads/file.pdf' },
      ],
    });

    const callBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(callBody.fileName).not.toContain('\0');
  });

  it('sanitizes filename: strips leading dots', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-1' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Doc',
      mediaAttachments: [
        { fileName: '...hidden.pdf', storageKey: 'uploads/file.pdf' },
      ],
    });

    const callBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(callBody.fileName).not.toMatch(/^\./);
  });

  it('sanitizes filename: enforces max 255 chars', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-1' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Doc',
      mediaAttachments: [
        { fileName: 'a'.repeat(300) + '.pdf', storageKey: 'uploads/file.pdf' },
      ],
    });

    const callBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(callBody.fileName.length).toBeLessThanOrEqual(255);
  });

  it('sanitizes filename: returns "attachment" for empty after sanitization', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-1' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Doc',
      mediaAttachments: [
        { fileName: '...', storageKey: 'uploads/file.pdf' },
      ],
    });

    const callBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(callBody.fileName).toBe('attachment');
  });

  it('handles HTTP error in media message', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 413,
      text: async () => 'File too large',
    });

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Doc',
      mediaAttachments: [
        { fileName: 'big.pdf', storageKey: 'uploads/big.pdf', contentType: 'application/pdf' },
      ],
    });

    expect(result.accepted).toBe(false);
    expect(result.rawStatus).toContain('413');
  });

  it('falls back to messageId when key.id is missing in response', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'alt-msg-id' }),
    });

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
    });

    expect(result.providerMessageId).toBe('alt-msg-id');
  });

  it('returns null messageId when neither key.id nor messageId present', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
    });

    expect(result.providerMessageId).toBeNull();
  });

  it('uses "accepted" as fallback rawStatus when status missing', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg-1' } }),
    });

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
    });

    expect(result.rawStatus).toBe('accepted');
  });

  it('handles error.text() failure gracefully', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => { throw new Error('stream error'); },
    });

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
    });

    expect(result.accepted).toBe(false);
    expect(result.rawStatus).toContain('unknown');
  });
});
