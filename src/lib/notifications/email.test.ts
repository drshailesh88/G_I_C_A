import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the resend module before importing
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
import { Resend } from 'resend';

function getMockSend() {
  // Access the mock send function from the mocked module
  const instance = new Resend('test');
  return instance.emails.send as ReturnType<typeof vi.fn>;
}

describe('resendEmailProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-api-key';
    process.env.RESEND_FROM_EMAIL = 'test@gemindia.org';
  });

  it('should throw if RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(
      resendEmailProvider.send({
        eventId: 'evt-1',
        toEmail: 'user@example.com',
        subject: 'Test',
        htmlBody: '<p>Hello</p>',
      }),
    ).rejects.toThrow('RESEND_API_KEY');
  });

  it('should return accepted result on successful send', async () => {
    const mockSend = getMockSend();
    mockSend.mockResolvedValue({
      data: { id: 'msg-123' },
      error: null,
    });

    const result = await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Test Subject',
      htmlBody: '<p>Hello World</p>',
    });

    expect(result).toEqual({
      provider: 'resend',
      providerMessageId: 'msg-123',
      accepted: true,
      rawStatus: 'accepted',
    });
  });

  it('should return rejected result on Resend error', async () => {
    const mockSend = getMockSend();
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'Invalid recipient' },
    });

    const result = await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'bad@example.com',
      subject: 'Test',
      htmlBody: '<p>Hello</p>',
    });

    expect(result.accepted).toBe(false);
    expect(result.provider).toBe('resend');
    expect(result.rawStatus).toBe('Invalid recipient');
  });

  it('should use custom fromDisplayName when provided', async () => {
    const mockSend = getMockSend();
    mockSend.mockResolvedValue({ data: { id: 'msg-456' }, error: null });

    await resendEmailProvider.send({
      eventId: 'evt-1',
      toEmail: 'user@example.com',
      subject: 'Test',
      htmlBody: '<p>Hello</p>',
      fromDisplayName: 'Custom Sender',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Custom Sender <test@gemindia.org>',
      }),
    );
  });
});
