/**
 * Mutation-killing tests for idempotency.ts
 *
 * Targets: 6 survivors — ObjectLiteral on Redis SET options,
 * StringLiteral on key prefix, BooleanLiteral on return,
 * ConditionalExpression on null check.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('redisIdempotencyService', () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('throws when UPSTASH_REDIS_REST_URL is missing', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';

    const { redisIdempotencyService } = await import('./idempotency');
    await expect(
      redisIdempotencyService.checkAndSet('test-key'),
    ).rejects.toThrow('UPSTASH_REDIS_REST_URL');
  });

  it('throws when UPSTASH_REDIS_REST_TOKEN is missing', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const { redisIdempotencyService } = await import('./idempotency');
    await expect(
      redisIdempotencyService.checkAndSet('test-key'),
    ).rejects.toThrow('UPSTASH_REDIS_REST_TOKEN');
  });
});

describe('createIdempotencyService', () => {
  it('returns true (duplicate) when SET NX returns null', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue(null), // key already exists
    } as any;

    const { createIdempotencyService } = await import('./idempotency');
    const svc = createIdempotencyService(mockRedis);

    const result = await svc.checkAndSet('key-1');
    expect(result).toBe(true); // is duplicate
  });

  it('returns false (not duplicate) when SET NX returns OK', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'), // key was set (new)
    } as any;

    const { createIdempotencyService } = await import('./idempotency');
    const svc = createIdempotencyService(mockRedis);

    const result = await svc.checkAndSet('key-2');
    expect(result).toBe(false); // not a duplicate
  });

  it('uses correct key prefix', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
    } as any;

    const { createIdempotencyService } = await import('./idempotency');
    const svc = createIdempotencyService(mockRedis);

    await svc.checkAndSet('my-key');

    expect(mockRedis.set).toHaveBeenCalledWith(
      'notif:idem:my-key',
      '1',
      expect.objectContaining({ nx: true }),
    );
  });

  it('passes correct SET options (nx, ex)', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
    } as any;

    const { createIdempotencyService } = await import('./idempotency');
    const svc = createIdempotencyService(mockRedis);

    await svc.checkAndSet('my-key');

    // Default TTL is 7 days = 604800 seconds
    expect(mockRedis.set).toHaveBeenCalledWith(
      'notif:idem:my-key',
      '1',
      { nx: true, ex: 604800 },
    );
  });

  it('accepts custom TTL', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
    } as any;

    const { createIdempotencyService } = await import('./idempotency');
    const svc = createIdempotencyService(mockRedis);

    await svc.checkAndSet('my-key', 3600);

    expect(mockRedis.set).toHaveBeenCalledWith(
      'notif:idem:my-key',
      '1',
      { nx: true, ex: 3600 },
    );
  });

  it('sets value to string 1', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
    } as any;

    const { createIdempotencyService } = await import('./idempotency');
    const svc = createIdempotencyService(mockRedis);

    await svc.checkAndSet('key');

    const setValue = mockRedis.set.mock.calls[0][1];
    expect(setValue).toBe('1');
  });
});
