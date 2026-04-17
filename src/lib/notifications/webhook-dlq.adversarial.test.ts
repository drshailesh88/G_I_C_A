import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLpush, mockExpire, mockRpop, mockLlen } = vi.hoisted(() => ({
  mockLpush: vi.fn().mockResolvedValue(1),
  mockExpire: vi.fn().mockResolvedValue(true),
  mockRpop: vi.fn(),
  mockLlen: vi.fn().mockResolvedValue(0),
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    lpush: mockLpush,
    expire: mockExpire,
    rpop: mockRpop,
    llen: mockLlen,
  })),
}));

import { popFromDlq, pushToDlq, type DlqEntry } from './webhook-dlq';

const sampleEntry: DlqEntry = {
  provider: 'resend',
  channel: 'email',
  rawPayload: { type: 'email.bounced', data: { email_id: 'msg-1' } },
  failedAt: '2026-01-01T00:00:00.000Z',
  errorMessage: 'DB connection failed',
};

beforeEach(() => {
  mockLpush.mockClear().mockResolvedValue(1);
  mockExpire.mockClear().mockResolvedValue(true);
  mockRpop.mockClear().mockResolvedValue(null);
  mockLlen.mockClear().mockResolvedValue(0);
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
});

describe('webhook-dlq adversarial hardening', () => {
  it('rejects malformed providers before poisoning the DLQ', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await pushToDlq({
      ...sampleEntry,
      provider: 'resend ' as DlqEntry['provider'],
    });

    expect(result).toBe(false);
    expect(mockLpush).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Refusing to push malformed DLQ entry'),
    );
  });

  it('skips malformed popped entries instead of discarding already-popped valid ones', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockRpop
      .mockResolvedValueOnce(JSON.stringify(sampleEntry))
      .mockResolvedValueOnce('{not-json')
      .mockResolvedValueOnce({
        ...sampleEntry,
        provider: 'evolution_api',
        channel: 'whatsapp',
      })
      .mockResolvedValueOnce(null);

    const result = await popFromDlq(5);

    expect(result).toEqual([
      sampleEntry,
      {
        ...sampleEntry,
        provider: 'evolution_api',
        channel: 'whatsapp',
      },
    ]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Dropping malformed DLQ entry during pop'),
    );
  });

  it('caps dequeue batch size to prevent oversized Redis drains', async () => {
    mockRpop.mockResolvedValue(JSON.stringify(sampleEntry));

    const result = await popFromDlq(1_000);

    expect(result).toHaveLength(100);
    expect(mockRpop).toHaveBeenCalledTimes(100);
  });
});
