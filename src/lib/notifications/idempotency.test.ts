import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @upstash/redis
const mockSet = vi.fn();
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    set: mockSet,
  })),
}));

import { redisIdempotencyService, createIdempotencyService } from './idempotency';

describe('redisIdempotencyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  });

  it('should throw if env vars are not set', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    await expect(
      redisIdempotencyService.checkAndSet('test-key'),
    ).rejects.toThrow('UPSTASH_REDIS_REST_URL');
  });

  it('should return false for a new key (SET NX returns OK)', async () => {
    mockSet.mockResolvedValue('OK');

    const isDuplicate = await redisIdempotencyService.checkAndSet('new-key');

    expect(isDuplicate).toBe(false);
    expect(mockSet).toHaveBeenCalledWith(
      'notif:idem:new-key',
      '1',
      { nx: true, ex: 7 * 24 * 60 * 60 },
    );
  });

  it('should return true for an existing key (SET NX returns null)', async () => {
    mockSet.mockResolvedValue(null);

    const isDuplicate = await redisIdempotencyService.checkAndSet('existing-key');

    expect(isDuplicate).toBe(true);
  });

  it('should use custom TTL when provided', async () => {
    mockSet.mockResolvedValue('OK');

    await redisIdempotencyService.checkAndSet('key', 3600);

    expect(mockSet).toHaveBeenCalledWith(
      'notif:idem:key',
      '1',
      { nx: true, ex: 3600 },
    );
  });
});

describe('createIdempotencyService', () => {
  it('should create a service with injected Redis client', async () => {
    const mockRedis = { set: vi.fn().mockResolvedValue('OK') } as any;
    const svc = createIdempotencyService(mockRedis);

    const result = await svc.checkAndSet('test');
    expect(result).toBe(false);
    expect(mockRedis.set).toHaveBeenCalled();
  });
});
