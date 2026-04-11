/**
 * Mutation-killing tests Round 2 for whatsapp.ts
 *
 * Targets remaining survivors: provider string literals, optional chaining,
 * LogicalOperator ?? mutations, EqualityOperator, regex patterns,
 * ArrowFunction, ObjectLiteral in media message path.
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

describe('whatsapp — text message path', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.EVOLUTION_API_BASE_URL = 'https://evo.example.com';
    process.env.EVOLUTION_API_KEY = 'test-key';
    globalThis.fetch = vi.fn();
    mockGetSignedUrl.mockClear().mockResolvedValue('https://r2.example.com/signed-url');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns provider as evolution_api on success', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg-1' }, status: 'sent' }),
    });

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Hello',
    });

    expect(result.provider).toBe('evolution_api');
    expect(result.accepted).toBe(true);
    expect(result.providerMessageId).toBe('msg-1');
  });

  it('extracts providerMessageId from data.key.id', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-key-id' } }),
    });

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
    });

    expect(result.providerMessageId).toBe('wa-key-id');
  });

  it('falls back to data.messageId when key.id is missing', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'fallback-id' }),
    });

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
    });

    expect(result.providerMessageId).toBe('fallback-id');
  });

  it('returns null providerMessageId when no id in response', async () => {
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

  it('uses data.status for rawStatus when available', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'QUEUED', key: { id: 'msg-1' } }),
    });

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
    });

    expect(result.rawStatus).toBe('QUEUED');
  });

  it('defaults rawStatus to accepted when data.status is missing', async () => {
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

  it('returns provider as evolution_api on HTTP error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
    });

    expect(result.provider).toBe('evolution_api');
    expect(result.accepted).toBe(false);
    expect(result.rawStatus).toContain('HTTP 500');
    expect(result.providerMessageId).toBeNull();
  });

  it('strips leading + from phone number', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg-1' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.number).toBe('919876543210');
    expect(body.number).not.toContain('+');
  });

  it('sends correct headers with Content-Type and apikey', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg-1' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[1].headers).toEqual({
      'Content-Type': 'application/json',
      'apikey': 'test-key',
    });
  });

  it('sends to sendText endpoint', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg-1' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe('https://evo.example.com/message/sendText');
  });

  it('handles text().catch() on error response returning undefined', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockRejectedValue(new Error('body read failed')),
    });

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
    });

    expect(result.accepted).toBe(false);
    expect(result.rawStatus).toContain('503');
    // When text() throws, catch returns 'unknown'
    expect(result.rawStatus).toContain('unknown');
  });
});

describe('whatsapp — media message path exact values', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.EVOLUTION_API_BASE_URL = 'https://evo.example.com/';
    process.env.EVOLUTION_API_KEY = 'media-key';
    globalThis.fetch = vi.fn();
    mockGetSignedUrl.mockClear().mockResolvedValue('https://r2.example.com/signed-url');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns exact provider string in media success response', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'media-msg' }, status: 'sent' }),
    });

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Caption',
      mediaAttachments: [{
        fileName: 'doc.pdf',
        storageKey: 'uploads/doc.pdf',
        contentType: 'application/pdf',
      }],
    });

    expect(result.provider).toBe('evolution_api');
    expect(result.providerMessageId).toBe('media-msg');
    expect(result.rawStatus).toBe('sent');
    expect(result.accepted).toBe(true);
  });

  it('returns exact provider string in media error response', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'Unprocessable',
    });

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Caption',
      mediaAttachments: [{
        fileName: 'doc.pdf',
        storageKey: 'uploads/doc.pdf',
        contentType: 'application/pdf',
      }],
    });

    expect(result.provider).toBe('evolution_api');
    expect(result.accepted).toBe(false);
    expect(result.rawStatus).toContain('422');
  });

  it('sends correct headers in media request', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Caption',
      mediaAttachments: [{
        fileName: 'doc.pdf',
        storageKey: 'uploads/doc.pdf',
        contentType: 'application/pdf',
      }],
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[1].headers).toEqual({
      'Content-Type': 'application/json',
      'apikey': 'media-key',
    });
  });

  it('warns when multiple attachments provided (only first sent)', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Caption',
      mediaAttachments: [
        { fileName: 'a.pdf', storageKey: 'a', contentType: 'application/pdf' },
        { fileName: 'b.pdf', storageKey: 'b', contentType: 'application/pdf' },
      ],
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('2 attachments'),
    );
    consoleSpy.mockRestore();
  });

  it('does not warn when exactly one attachment', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Caption',
      mediaAttachments: [
        { fileName: 'a.pdf', storageKey: 'a', contentType: 'application/pdf' },
      ],
    });

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('strips trailing slash from base URL', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Hello',
    });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    // URL should not have double slash
    expect(fetchCall[0]).toBe('https://evo.example.com/message/sendText');
  });
});

describe('whatsapp — getConfig validation', () => {
  afterEach(() => {
    process.env.EVOLUTION_API_BASE_URL = 'https://evo.example.com';
    process.env.EVOLUTION_API_KEY = 'test-key';
  });

  it('throws when EVOLUTION_API_BASE_URL is not set', async () => {
    delete process.env.EVOLUTION_API_BASE_URL;
    process.env.EVOLUTION_API_KEY = 'test-key';

    await expect(
      evolutionWhatsAppProvider.sendText({
        eventId: 'evt-1',
        toPhoneE164: '+919876543210',
        body: 'Test',
      }),
    ).rejects.toThrow('EVOLUTION_API_BASE_URL');
  });

  it('throws when EVOLUTION_API_KEY is not set', async () => {
    process.env.EVOLUTION_API_BASE_URL = 'https://evo.example.com';
    delete process.env.EVOLUTION_API_KEY;

    await expect(
      evolutionWhatsAppProvider.sendText({
        eventId: 'evt-1',
        toPhoneE164: '+919876543210',
        body: 'Test',
      }),
    ).rejects.toThrow('EVOLUTION_API_KEY');
  });
});

describe('whatsapp — sanitizeFileName', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.EVOLUTION_API_BASE_URL = 'https://evo.example.com';
    process.env.EVOLUTION_API_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg' } }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('strips null bytes from filename', async () => {
    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
      mediaAttachments: [{
        fileName: 'file\0name.pdf',
        storageKey: 'uploads/file.pdf',
        contentType: 'application/pdf',
      }],
    });

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.fileName).toBe('filename.pdf');
    expect(body.fileName).not.toContain('\0');
  });

  it('extracts basename from path with slashes', async () => {
    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
      mediaAttachments: [{
        fileName: '/uploads/path/file.pdf',
        storageKey: 'uploads/file.pdf',
        contentType: 'application/pdf',
      }],
    });

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.fileName).toBe('file.pdf');
  });

  it('truncates filenames exceeding 255 chars', async () => {
    const longName = 'a'.repeat(300) + '.pdf';
    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
      mediaAttachments: [{
        fileName: longName,
        storageKey: 'uploads/file.pdf',
        contentType: 'application/pdf',
      }],
    });

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.fileName.length).toBeLessThanOrEqual(255);
  });

  it('returns attachment as default for empty filename after sanitization', async () => {
    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
      mediaAttachments: [{
        fileName: '...',
        storageKey: 'uploads/file.pdf',
        contentType: 'application/pdf',
      }],
    });

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.fileName).toBe('attachment');
  });
});

describe('whatsapp — validateAttachment', () => {
  beforeEach(() => {
    process.env.EVOLUTION_API_BASE_URL = 'https://evo.example.com';
    process.env.EVOLUTION_API_KEY = 'test-key';
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = globalThis.fetch;
  });

  it('throws on empty storageKey', async () => {
    await expect(
      evolutionWhatsAppProvider.sendText({
        eventId: 'evt-1',
        toPhoneE164: '+919876543210',
        body: 'Test',
        mediaAttachments: [{
          fileName: 'file.pdf',
          storageKey: '',
          contentType: 'application/pdf',
        }],
      }),
    ).rejects.toThrow('Invalid attachment storageKey');
  });

  it('throws on storageKey with null bytes', async () => {
    await expect(
      evolutionWhatsAppProvider.sendText({
        eventId: 'evt-1',
        toPhoneE164: '+919876543210',
        body: 'Test',
        mediaAttachments: [{
          fileName: 'file.pdf',
          storageKey: 'uploads/file\0.pdf',
          contentType: 'application/pdf',
        }],
      }),
    ).rejects.toThrow('Invalid attachment storageKey');
  });

  it('throws on missing fileName', async () => {
    await expect(
      evolutionWhatsAppProvider.sendText({
        eventId: 'evt-1',
        toPhoneE164: '+919876543210',
        body: 'Test',
        mediaAttachments: [{
          fileName: '',
          storageKey: 'uploads/file.pdf',
          contentType: 'application/pdf',
        }],
      }),
    ).rejects.toThrow('fileName is required');
  });
});

describe('whatsapp — getMediaType', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.EVOLUTION_API_BASE_URL = 'https://evo.example.com';
    process.env.EVOLUTION_API_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg' } }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends image mediatype for image content types', async () => {
    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Caption',
      mediaAttachments: [{
        fileName: 'photo.jpg',
        storageKey: 'uploads/photo.jpg',
        contentType: 'image/jpeg',
      }],
    });

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.mediatype).toBe('image');
  });

  it('sends document mediatype for non-image content types', async () => {
    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Caption',
      mediaAttachments: [{
        fileName: 'doc.pdf',
        storageKey: 'uploads/doc.pdf',
        contentType: 'application/pdf',
      }],
    });

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.mediatype).toBe('document');
  });

  it('sends document mediatype when contentType is undefined', async () => {
    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Caption',
      mediaAttachments: [{
        fileName: 'file.bin',
        storageKey: 'uploads/file.bin',
      } as any],
    });

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.mediatype).toBe('document');
  });
});
