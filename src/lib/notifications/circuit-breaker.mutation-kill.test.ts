/**
 * Mutation-killing tests for circuit-breaker.ts
 *
 * Targets: 29 survivors — getDefaultCircuitBreaker lazy init, getStatus
 * state transitions, key prefixes, ConditionalExpression, BlockStatement,
 * BooleanLiteral, EqualityOperator mutations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('CircuitOpenError', () => {
  it('has correct error name and message containing provider', async () => {
    const { CircuitOpenError } = await import('./circuit-breaker');
    const err = new CircuitOpenError('resend');
    expect(err.name).toBe('CircuitOpenError');
    expect(err.message).toContain('resend');
    expect(err.message).toContain('Circuit breaker is open');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('createCircuitBreaker — checkCircuit', () => {
  it('returns closed when failures are below threshold', async () => {
    const mockRedis = {
      get: vi.fn().mockResolvedValue(2),
      set: vi.fn(),
      del: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
    } as any;

    const { createCircuitBreaker } = await import('./circuit-breaker');
    const breaker = createCircuitBreaker(mockRedis);
    const state = await breaker.checkCircuit('resend');
    expect(state).toBe('closed');
  });

  it('returns closed when failures key is null (no failures)', async () => {
    const mockRedis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      del: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
    } as any;

    const { createCircuitBreaker } = await import('./circuit-breaker');
    const breaker = createCircuitBreaker(mockRedis);
    const state = await breaker.checkCircuit('resend');
    expect(state).toBe('closed');
    // Verify it read the correct key
    expect(mockRedis.get).toHaveBeenCalledWith('notif:circuit:resend:failures');
  });

  it('throws CircuitOpenError when at threshold and cooldown not elapsed', async () => {
    const mockRedis = {
      get: vi.fn()
        .mockResolvedValueOnce(5) // failures at threshold
        .mockResolvedValueOnce(Date.now()), // opened just now
      set: vi.fn(),
      del: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
    } as any;

    const { createCircuitBreaker, CircuitOpenError } = await import('./circuit-breaker');
    const breaker = createCircuitBreaker(mockRedis);
    await expect(breaker.checkCircuit('resend')).rejects.toThrow(CircuitOpenError);
  });

  it('throws CircuitOpenError when opened timestamp is null', async () => {
    const mockRedis = {
      get: vi.fn()
        .mockResolvedValueOnce(10) // failures well above threshold
        .mockResolvedValueOnce(null), // no opened timestamp
      set: vi.fn(),
      del: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
    } as any;

    const { createCircuitBreaker, CircuitOpenError } = await import('./circuit-breaker');
    const breaker = createCircuitBreaker(mockRedis);
    await expect(breaker.checkCircuit('resend')).rejects.toThrow(CircuitOpenError);
  });

  it('returns half-open when cooldown has elapsed and probe claim succeeds', async () => {
    const mockRedis = {
      get: vi.fn()
        .mockResolvedValueOnce(5) // failures at threshold
        .mockResolvedValueOnce(Date.now() - 120_000), // opened 2 min ago (> 60s)
      set: vi.fn().mockResolvedValue('OK'), // probe claim succeeds
      del: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
    } as any;

    const { createCircuitBreaker } = await import('./circuit-breaker');
    const breaker = createCircuitBreaker(mockRedis);
    const state = await breaker.checkCircuit('resend');
    expect(state).toBe('half-open');

    // Verify probe key was set with NX
    expect(mockRedis.set).toHaveBeenCalledWith(
      'notif:circuit:resend:probe',
      '1',
      { nx: true, ex: 60 },
    );
  });

  it('throws CircuitOpenError when cooldown elapsed but probe claim fails', async () => {
    const mockRedis = {
      get: vi.fn()
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(Date.now() - 120_000),
      set: vi.fn().mockResolvedValue(null), // probe already claimed
      del: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
    } as any;

    const { createCircuitBreaker, CircuitOpenError } = await import('./circuit-breaker');
    const breaker = createCircuitBreaker(mockRedis);
    await expect(breaker.checkCircuit('resend')).rejects.toThrow(CircuitOpenError);
  });
});

describe('createCircuitBreaker — recordSuccess', () => {
  it('deletes all three keys for the provider', async () => {
    const mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn().mockResolvedValue(1),
      incr: vi.fn(),
      expire: vi.fn(),
    } as any;

    const { createCircuitBreaker } = await import('./circuit-breaker');
    const breaker = createCircuitBreaker(mockRedis);
    await breaker.recordSuccess('resend');

    expect(mockRedis.del).toHaveBeenCalledWith('notif:circuit:resend:failures');
    expect(mockRedis.del).toHaveBeenCalledWith('notif:circuit:resend:opened');
    expect(mockRedis.del).toHaveBeenCalledWith('notif:circuit:resend:probe');
  });
});

describe('createCircuitBreaker — recordFailure', () => {
  it('increments failures key and sets TTL', async () => {
    const mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      incr: vi.fn().mockResolvedValue(3),
      expire: vi.fn(),
    } as any;

    const { createCircuitBreaker } = await import('./circuit-breaker');
    const breaker = createCircuitBreaker(mockRedis);
    await breaker.recordFailure('resend');

    expect(mockRedis.incr).toHaveBeenCalledWith('notif:circuit:resend:failures');
    expect(mockRedis.expire).toHaveBeenCalledWith('notif:circuit:resend:failures', 300);
    // Below threshold — should NOT set opened key
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('sets opened timestamp and clears probe when hitting threshold', async () => {
    const mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      incr: vi.fn().mockResolvedValue(5), // exactly at threshold
      expire: vi.fn(),
    } as any;

    const { createCircuitBreaker } = await import('./circuit-breaker');
    const breaker = createCircuitBreaker(mockRedis);
    await breaker.recordFailure('resend');

    // Should set opened key with TTL
    expect(mockRedis.set).toHaveBeenCalledWith(
      'notif:circuit:resend:opened',
      expect.any(Number),
      { ex: 300 },
    );
    // Should clear probe key
    expect(mockRedis.del).toHaveBeenCalledWith('notif:circuit:resend:probe');
  });

  it('sets opened timestamp when above threshold too', async () => {
    const mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      incr: vi.fn().mockResolvedValue(8), // above threshold
      expire: vi.fn(),
    } as any;

    const { createCircuitBreaker } = await import('./circuit-breaker');
    const breaker = createCircuitBreaker(mockRedis);
    await breaker.recordFailure('resend');

    expect(mockRedis.set).toHaveBeenCalled();
    expect(mockRedis.del).toHaveBeenCalledWith('notif:circuit:resend:probe');
  });
});

describe('createCircuitBreaker — getStatus', () => {
  it('returns closed state when failures below threshold', async () => {
    const mockRedis = {
      get: vi.fn()
        .mockResolvedValueOnce(3) // failures
        .mockResolvedValueOnce(null), // opened
      set: vi.fn(),
      del: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
    } as any;

    const { createCircuitBreaker } = await import('./circuit-breaker');
    const breaker = createCircuitBreaker(mockRedis);
    const status = await breaker.getStatus('resend');

    expect(status).toEqual({
      state: 'closed',
      failures: 3,
      openedAt: null,
    });
  });

  it('returns open state when at threshold and cooldown not elapsed', async () => {
    const now = Date.now();
    const mockRedis = {
      get: vi.fn()
        .mockResolvedValueOnce(5) // failures at threshold
        .mockResolvedValueOnce(now), // opened just now
      set: vi.fn(),
      del: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
    } as any;

    const { createCircuitBreaker } = await import('./circuit-breaker');
    const breaker = createCircuitBreaker(mockRedis);
    const status = await breaker.getStatus('resend');

    expect(status.state).toBe('open');
    expect(status.failures).toBe(5);
    expect(status.openedAt).toBe(now);
  });

  it('returns half-open state when at threshold and cooldown elapsed', async () => {
    const oldTime = Date.now() - 120_000; // 2 min ago
    const mockRedis = {
      get: vi.fn()
        .mockResolvedValueOnce(7) // failures above threshold
        .mockResolvedValueOnce(oldTime), // opened long ago
      set: vi.fn(),
      del: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
    } as any;

    const { createCircuitBreaker } = await import('./circuit-breaker');
    const breaker = createCircuitBreaker(mockRedis);
    const status = await breaker.getStatus('resend');

    expect(status.state).toBe('half-open');
    expect(status.failures).toBe(7);
    expect(status.openedAt).toBe(oldTime);
  });

  it('returns open when opened is null and failures >= threshold', async () => {
    const mockRedis = {
      get: vi.fn()
        .mockResolvedValueOnce(5) // failures at threshold
        .mockResolvedValueOnce(null), // no opened key
      set: vi.fn(),
      del: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
    } as any;

    const { createCircuitBreaker } = await import('./circuit-breaker');
    const breaker = createCircuitBreaker(mockRedis);
    const status = await breaker.getStatus('resend');

    expect(status.state).toBe('open');
    expect(status.failures).toBe(5);
    expect(status.openedAt).toBeNull();
  });

  it('returns closed with zero failures when redis key is null', async () => {
    const mockRedis = {
      get: vi.fn()
        .mockResolvedValueOnce(null) // no failures key
        .mockResolvedValueOnce(null), // no opened key
      set: vi.fn(),
      del: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
    } as any;

    const { createCircuitBreaker } = await import('./circuit-breaker');
    const breaker = createCircuitBreaker(mockRedis);
    const status = await breaker.getStatus('resend');

    expect(status).toEqual({
      state: 'closed',
      failures: 0,
      openedAt: null,
    });
  });
});

describe('getDefaultCircuitBreaker — lazy init', () => {
  afterEach(() => {
    // Reset singleton
    vi.resetModules();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('throws when UPSTASH_REDIS_REST_URL is missing', async () => {
    process.env.UPSTASH_REDIS_REST_TOKEN = 'some-token';
    delete process.env.UPSTASH_REDIS_REST_URL;

    const { getDefaultCircuitBreaker, resetDefaultCircuitBreaker } = await import('./circuit-breaker');
    resetDefaultCircuitBreaker();

    expect(() => getDefaultCircuitBreaker()).toThrow(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set',
    );
  });

  it('throws when UPSTASH_REDIS_REST_TOKEN is missing', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com';
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const { getDefaultCircuitBreaker, resetDefaultCircuitBreaker } = await import('./circuit-breaker');
    resetDefaultCircuitBreaker();

    expect(() => getDefaultCircuitBreaker()).toThrow(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set',
    );
  });

  it('throws when both URL and token are missing', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const { getDefaultCircuitBreaker, resetDefaultCircuitBreaker } = await import('./circuit-breaker');
    resetDefaultCircuitBreaker();

    expect(() => getDefaultCircuitBreaker()).toThrow(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set',
    );
  });
});

describe('resetDefaultCircuitBreaker', () => {
  it('clears the singleton so next call re-creates', async () => {
    const { resetDefaultCircuitBreaker, getDefaultCircuitBreaker } = await import('./circuit-breaker');
    resetDefaultCircuitBreaker();
    // After reset, calling without env vars should throw
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(() => getDefaultCircuitBreaker()).toThrow();
  });
});

describe('FAILURE_THRESHOLD and OPEN_DURATION_MS exports', () => {
  it('exports the expected threshold and duration values', async () => {
    const { FAILURE_THRESHOLD, OPEN_DURATION_MS } = await import('./circuit-breaker');
    expect(FAILURE_THRESHOLD).toBe(5);
    expect(OPEN_DURATION_MS).toBe(60_000);
  });
});
