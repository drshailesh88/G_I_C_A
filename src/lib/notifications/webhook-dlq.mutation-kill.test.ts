/**
 * Mutation-killing tests for webhook-dlq.ts
 *
 * Targets: 23 NoCoverage + 21 Survived = 44 mutations.
 * Tests DLQ push/pop/size with mocked Redis.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockLpush, mockExpire, mockRpop, mockLlen } = vi.hoisted(() => ({
  mockLpush: vi.fn().mockResolvedValue(1),
  mockExpire: vi.fn().mockResolvedValue(true),
  mockRpop: vi.fn(),
  mockLlen: vi.fn().mockResolvedValue(5),
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    lpush: mockLpush,
    expire: mockExpire,
    rpop: mockRpop,
    llen: mockLlen,
  })),
}));

import { pushToDlq, popFromDlq, getDlqSize, type DlqEntry } from './webhook-dlq';

const sampleEntry: DlqEntry = {
  provider: 'resend',
  channel: 'email',
  rawPayload: { type: 'email.bounced', data: { email_id: 'msg-1' } },
  failedAt: '2026-01-01T00:00:00Z',
  errorMessage: 'DB connection failed',
};

beforeEach(() => {
  // Don't use vi.clearAllMocks() — it clears the Redis constructor mock implementation
  mockLpush.mockClear().mockResolvedValue(1);
  mockExpire.mockClear().mockResolvedValue(true);
  mockRpop.mockClear().mockResolvedValue(null);
  mockLlen.mockClear().mockResolvedValue(5);
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
});

afterEach(() => {
  // Don't use vi.restoreAllMocks() — it undoes the Redis constructor mock
});

describe('pushToDlq', () => {
  it('returns false when Redis is not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await pushToDlq(sampleEntry);

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Redis not configured'),
      expect.any(String),
    );
    consoleSpy.mockRestore();
  });

  it('pushes entry to Redis list and sets TTL', async () => {
    const result = await pushToDlq(sampleEntry);

    expect(result).toBe(true);
    expect(mockLpush).toHaveBeenCalledWith('webhook:dlq', JSON.stringify(sampleEntry));
    expect(mockExpire).toHaveBeenCalledWith('webhook:dlq', 7 * 24 * 60 * 60);
  });

  it('returns false and logs error on Redis failure', async () => {
    mockLpush.mockRejectedValueOnce(new Error('Redis down'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await pushToDlq(sampleEntry);

    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to push to DLQ'),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it('returns false when only URL is set but token is missing', async () => {
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await pushToDlq(sampleEntry);

    expect(result).toBe(false);
    consoleSpy.mockRestore();
  });
});

describe('popFromDlq', () => {
  it('returns empty array when Redis is not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const result = await popFromDlq();

    expect(result).toEqual([]);
  });

  it('pops up to count entries from the queue', async () => {
    const entry1 = JSON.stringify(sampleEntry);
    const entry2 = JSON.stringify({ ...sampleEntry, provider: 'evolution_api' });
    mockRpop
      .mockResolvedValueOnce(entry1)
      .mockResolvedValueOnce(entry2)
      .mockResolvedValueOnce(null);

    const result = await popFromDlq(5);

    expect(result).toHaveLength(2);
    expect(result[0].provider).toBe('resend');
    expect(result[1].provider).toBe('evolution_api');
  });

  it('handles already-parsed objects from Redis', async () => {
    // Upstash Redis sometimes returns parsed objects directly
    mockRpop
      .mockResolvedValueOnce(sampleEntry)
      .mockResolvedValueOnce(null);

    const result = await popFromDlq();

    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe('resend');
  });

  it('respects default count of 10', async () => {
    // Fill with 10 entries then null
    for (let i = 0; i < 10; i++) {
      mockRpop.mockResolvedValueOnce(JSON.stringify(sampleEntry));
    }
    mockRpop.mockResolvedValueOnce(null);

    const result = await popFromDlq();

    expect(result).toHaveLength(10);
    expect(mockRpop).toHaveBeenCalledTimes(10);
  });

  it('returns empty array on Redis error', async () => {
    mockRpop.mockRejectedValue(new Error('Redis down'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await popFromDlq();

    expect(result).toEqual([]);
    consoleSpy.mockRestore();
  });

  it('stops early when rpop returns null', async () => {
    mockRpop
      .mockResolvedValueOnce(JSON.stringify(sampleEntry))
      .mockResolvedValueOnce(null);

    const result = await popFromDlq(5);

    expect(result).toHaveLength(1);
    expect(mockRpop).toHaveBeenCalledTimes(2);
  });
});

describe('getDlqSize', () => {
  it('returns 0 when Redis is not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const result = await getDlqSize();

    expect(result).toBe(0);
  });

  it('returns the list length from Redis', async () => {
    mockLlen.mockResolvedValueOnce(42);

    const result = await getDlqSize();

    expect(result).toBe(42);
  });

  it('returns 0 on Redis error', async () => {
    mockLlen.mockRejectedValueOnce(new Error('Redis down'));

    const result = await getDlqSize();

    expect(result).toBe(0);
  });
});
