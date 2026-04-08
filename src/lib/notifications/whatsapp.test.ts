import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { evolutionWhatsAppProvider } from './whatsapp';

describe('evolutionWhatsAppProvider', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.EVOLUTION_API_BASE_URL = 'https://evo.example.com';
    process.env.EVOLUTION_API_KEY = 'test-evo-key';
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should throw if EVOLUTION_API_BASE_URL is not set', async () => {
    delete process.env.EVOLUTION_API_BASE_URL;
    await expect(
      evolutionWhatsAppProvider.sendText({
        eventId: 'evt-1',
        toPhoneE164: '+919876543210',
        body: 'Hello',
      }),
    ).rejects.toThrow('EVOLUTION_API_BASE_URL');
  });

  it('should throw if EVOLUTION_API_KEY is not set', async () => {
    delete process.env.EVOLUTION_API_KEY;
    await expect(
      evolutionWhatsAppProvider.sendText({
        eventId: 'evt-1',
        toPhoneE164: '+919876543210',
        body: 'Hello',
      }),
    ).rejects.toThrow('EVOLUTION_API_KEY');
  });

  it('should return accepted result on success', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-msg-123' }, status: 'sent' }),
    });

    const result = await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Hello from GEM India',
    });

    expect(result).toEqual({
      provider: 'evolution_api',
      providerMessageId: 'wa-msg-123',
      providerConversationId: null,
      accepted: true,
      rawStatus: 'sent',
    });

    // Verify fetch was called correctly
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://evo.example.com/message/sendText',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'apikey': 'test-evo-key',
        }),
      }),
    );
  });

  it('should strip leading + from phone number', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'wa-msg-456' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
    });

    const callBody = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(callBody.number).toBe('919876543210');
  });

  it('should return failed result on HTTP error', async () => {
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

    expect(result.accepted).toBe(false);
    expect(result.provider).toBe('evolution_api');
    expect(result.rawStatus).toContain('500');
  });

  it('should strip trailing slash from base URL', async () => {
    process.env.EVOLUTION_API_BASE_URL = 'https://evo.example.com/';
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg-1' } }),
    });

    await evolutionWhatsAppProvider.sendText({
      eventId: 'evt-1',
      toPhoneE164: '+919876543210',
      body: 'Test',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://evo.example.com/message/sendText',
      expect.anything(),
    );
  });
});
