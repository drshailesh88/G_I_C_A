/**
 * Tests for Provider Timeout and Circuit Breaker (Req 8C-1)
 *
 * Covers:
 * - Timeout: provider within limit, provider exceeds limit, signal propagation
 * - Circuit breaker: closed, open after 5 failures, half-open probe, reset on success
 * - Probe race: only one concurrent caller gets half-open
 * - Atomic increments: concurrent failures don't lose counts
 * - Integration: sendNotification, resendNotification, retryFailedNotification with breaker
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── 1. Timeout utility tests ─────────────────────────────────

import { withTimeout, ProviderTimeoutError, PROVIDER_TIMEOUTS } from './timeout';

describe('withTimeout', () => {
  it('resolves when provider responds within timeout', async () => {
    const result = await withTimeout('test', 1000, async () => 'ok');
    expect(result).toBe('ok');
  });

  it('throws ProviderTimeoutError when provider exceeds timeout', async () => {
    await expect(
      withTimeout('resend', 50, async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return 'late';
      }),
    ).rejects.toThrow(ProviderTimeoutError);

    try {
      await withTimeout('resend', 50, async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderTimeoutError);
      expect((error as ProviderTimeoutError).message).toBe('Request timed out after 0.05s');
      expect((error as ProviderTimeoutError).timeoutMs).toBe(50);
    }
  });

  it('clears timer on success so AbortSignal stays clean', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;

      await withTimeout('test', 50, async (receivedSignal) => {
        signal = receivedSignal;
        return 'ok';
      });

      // Advance past the timeout — signal should NOT fire since timer was cleared
      await vi.advanceTimersByTimeAsync(100);
      expect(signal!.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes AbortSignal to the callback for fetch integration', async () => {
    let receivedSignal: AbortSignal | undefined;

    await withTimeout('test', 1000, async (signal) => {
      receivedSignal = signal;
      return 'ok';
    });

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal!.aborted).toBe(false);
  });

  it('preserves non-timeout errors from the provider', async () => {
    await expect(
      withTimeout('test', 1000, async () => {
        throw new Error('API key invalid');
      }),
    ).rejects.toThrow('API key invalid');
  });
});

describe('PROVIDER_TIMEOUTS constants', () => {
  it('has correct timeout values for all providers', () => {
    expect(PROVIDER_TIMEOUTS.RESEND_EMAIL).toBe(10_000);
    expect(PROVIDER_TIMEOUTS.EVOLUTION_WHATSAPP).toBe(15_000);
    expect(PROVIDER_TIMEOUTS.R2_UPLOAD).toBe(30_000);
    expect(PROVIDER_TIMEOUTS.R2_SIGNED_URL).toBe(5_000);
  });
});

// ── 2. Circuit breaker tests ─────────────────────────────────

import {
  createCircuitBreaker,
  CircuitOpenError,
  FAILURE_THRESHOLD,
  InvalidCircuitProviderError,
  OPEN_DURATION_MS,
  type CircuitBreakerService,
} from './circuit-breaker';

/**
 * In-memory Redis stub supporting get, set (with NX), del, incr, expire.
 */
function createRedisStub() {
  const store = new Map<string, { value: string; expiresAt?: number }>();

  return {
    store,
    async get<T>(key: string): Promise<T | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return JSON.parse(entry.value) as T;
    },
    async set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean }): Promise<'OK' | null> {
      if (opts?.nx) {
        const existing = store.get(key);
        if (existing && (!existing.expiresAt || Date.now() <= existing.expiresAt)) {
          return null; // Key exists — NX fails
        }
      }
      const entry: { value: string; expiresAt?: number } = {
        value: JSON.stringify(value),
      };
      if (opts?.ex) {
        entry.expiresAt = Date.now() + opts.ex * 1000;
      }
      store.set(key, entry);
      return 'OK';
    },
    async del(key: string): Promise<number> {
      return store.delete(key) ? 1 : 0;
    },
    async incr(key: string): Promise<number> {
      const entry = store.get(key);
      let current = 0;
      if (entry) {
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
          store.delete(key);
        } else {
          current = JSON.parse(entry.value) as number;
        }
      }
      const next = current + 1;
      const existing = store.get(key);
      store.set(key, {
        value: JSON.stringify(next),
        expiresAt: existing?.expiresAt,
      });
      return next;
    },
    async expire(key: string, seconds: number): Promise<0 | 1> {
      const entry = store.get(key);
      if (!entry) return 0;
      entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },
  };
}

describe('CircuitBreaker', () => {
  let redis: ReturnType<typeof createRedisStub>;
  let breaker: CircuitBreakerService;

  beforeEach(() => {
    redis = createRedisStub();
    breaker = createCircuitBreaker(redis as unknown as import('@upstash/redis').Redis);
  });

  it('allows requests when circuit is closed (< 5 failures)', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) {
      await breaker.recordFailure('resend');
    }
    const state = await breaker.checkCircuit('resend');
    expect(state).toBe('closed');
  });

  it('opens circuit after 5 consecutive failures', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await breaker.recordFailure('resend');
    }

    await expect(breaker.checkCircuit('resend')).rejects.toThrow(CircuitOpenError);

    const status = await breaker.getStatus('resend');
    expect(status.state).toBe('open');
    expect(status.failures).toBe(FAILURE_THRESHOLD);
    expect(status.openedAt).not.toBeNull();
  });

  it('rejects immediately with CircuitOpenError when circuit is open', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await breaker.recordFailure('resend');
    }

    const results = await Promise.allSettled([
      breaker.checkCircuit('resend'),
      breaker.checkCircuit('resend'),
      breaker.checkCircuit('resend'),
    ]);

    for (const result of results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(CircuitOpenError);
      }
    }
  });

  it('enters half-open state after 60s and allows exactly one probe', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await breaker.recordFailure('resend');
    }

    // Set openedAt to 61 seconds ago
    await redis.set('notif:circuit:resend:opened', Date.now() - OPEN_DURATION_MS - 1000, { ex: 300 });

    // Three concurrent checks — only one should get half-open
    const results = await Promise.allSettled([
      breaker.checkCircuit('resend'),
      breaker.checkCircuit('resend'),
      breaker.checkCircuit('resend'),
    ]);

    const halfOpenResults = results.filter(
      (r) => r.status === 'fulfilled' && r.value === 'half-open',
    );
    const openErrors = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof CircuitOpenError,
    );

    expect(halfOpenResults).toHaveLength(1);
    expect(openErrors).toHaveLength(2);
  });

  it('resets circuit on successful probe (half-open → closed)', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await breaker.recordFailure('resend');
    }

    await breaker.recordSuccess('resend');

    const status = await breaker.getStatus('resend');
    expect(status.state).toBe('closed');
    expect(status.failures).toBe(0);
    expect(status.openedAt).toBeNull();
  });

  it('returns to open on failed probe (half-open → open)', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await breaker.recordFailure('resend');
    }

    // Simulate half-open by setting openedAt in the past
    await redis.set('notif:circuit:resend:opened', Date.now() - OPEN_DURATION_MS - 1000, { ex: 300 });

    // Probe fails — record another failure (refreshes openedAt to now)
    await breaker.recordFailure('resend');

    // Should be open again
    await expect(breaker.checkCircuit('resend')).rejects.toThrow(CircuitOpenError);
  });

  it('tracks separate circuits per provider', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await breaker.recordFailure('resend');
    }

    const state = await breaker.checkCircuit('evolution_api');
    expect(state).toBe('closed');

    await expect(breaker.checkCircuit('resend')).rejects.toThrow(CircuitOpenError);
  });

  it('handles concurrent failure increments atomically', async () => {
    // Record 2 failures concurrently — both should be counted
    await Promise.all([
      breaker.recordFailure('resend'),
      breaker.recordFailure('resend'),
    ]);

    const status = await breaker.getStatus('resend');
    expect(status.failures).toBe(2);
  });

  it('rejects whitespace-padded provider names instead of treating them as a separate circuit namespace', async () => {
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await breaker.recordFailure('resend');
    }

    await expect(breaker.checkCircuit('resend ')).rejects.toThrow(InvalidCircuitProviderError);
    expect(redis.store.has('notif:circuit:resend :failures')).toBe(false);
    expect(redis.store.has('notif:circuit:resend :opened')).toBe(false);
    expect(redis.store.has('notif:circuit:resend :probe')).toBe(false);
  });

  it('rejects oversized unknown provider names before creating Redis keys', async () => {
    const oversizedProvider = `resend${'x'.repeat(10_000)}`;

    await expect(breaker.recordFailure(oversizedProvider)).rejects.toThrow(InvalidCircuitProviderError);
    expect(redis.store.size).toBe(0);
  });
});

// ── 3. Integration with sendNotification ─────────────────────

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({ notificationTemplates: {}, notificationLog: {} }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn(), isNull: vi.fn(), desc: vi.fn() }));
vi.mock('./template-renderer', () => ({
  renderTemplate: vi.fn(),
  resolveTemplate: vi.fn(),
  interpolate: vi.fn(),
  validateRequiredVariables: vi.fn(),
}));
vi.mock('./log-queries', () => ({
  createLogEntry: vi.fn(),
  updateLogStatus: vi.fn(),
  getLogById: vi.fn(),
  listFailedLogs: vi.fn(),
  markAsRetrying: vi.fn(),
}));
vi.mock('./email', () => ({
  resendEmailProvider: { send: vi.fn() },
}));
vi.mock('./whatsapp', () => ({
  evolutionWhatsAppProvider: { sendText: vi.fn() },
}));
vi.mock('./idempotency', () => ({
  redisIdempotencyService: { checkAndSet: vi.fn() },
}));

import { markAsRetrying } from './log-queries';
import { sendNotification, resendNotification, retryFailedNotification } from './send';
import type { NotificationServiceDeps } from './send';
import type {
  SendNotificationInput,
  EmailProvider,
  WhatsAppProvider,
  IdempotencyService,
} from './types';

const mockedMarkAsRetrying = vi.mocked(markAsRetrying);

beforeEach(() => {
  vi.clearAllMocks();
  mockedMarkAsRetrying.mockResolvedValue({} as Awaited<ReturnType<typeof markAsRetrying>>);
});

function createMockDeps(overrides?: Partial<NotificationServiceDeps>): NotificationServiceDeps {
  const mockEmailProvider: EmailProvider = {
    send: vi.fn().mockResolvedValue({
      provider: 'resend',
      providerMessageId: 'email-msg-123',
      accepted: true,
      rawStatus: 'accepted',
    }),
  };

  const mockWhatsAppProvider: WhatsAppProvider = {
    sendText: vi.fn().mockResolvedValue({
      provider: 'evolution_api',
      providerMessageId: 'wa-msg-456',
      accepted: true,
      rawStatus: 'accepted',
    }),
  };

  const mockIdempotency: IdempotencyService = {
    checkAndSet: vi.fn().mockResolvedValue(false),
  };

  const mockRenderTemplate = vi.fn().mockResolvedValue({
    templateId: 'tpl-1',
    templateVersionNo: 1,
    subject: 'Test Subject',
    body: '<p>Test Body</p>',
    variables: { recipientName: 'John' },
  });

  const mockCreateLogEntry = vi.fn().mockResolvedValue({
    id: 'log-1',
    eventId: 'evt-1',
    status: 'queued',
  });

  const mockUpdateLogStatus = vi.fn().mockResolvedValue(undefined);
  const mockGetLogById = vi.fn();

  return {
    emailProvider: mockEmailProvider,
    whatsAppProvider: mockWhatsAppProvider,
    idempotencyService: mockIdempotency,
    circuitBreaker: null,
    renderTemplateFn: mockRenderTemplate,
    createLogEntryFn: mockCreateLogEntry,
    updateLogStatusFn: mockUpdateLogStatus,
    getLogByIdFn: mockGetLogById,
    ...overrides,
  };
}

function createBaseInput(overrides?: Partial<SendNotificationInput>): SendNotificationInput {
  return {
    eventId: 'evt-1',
    personId: 'person-1',
    channel: 'email',
    templateKey: 'registration_confirmation',
    triggerType: 'registration.created',
    sendMode: 'automatic',
    idempotencyKey: 'test-key-1',
    variables: {
      recipientEmail: 'test@example.com',
      recipientName: 'John',
    },
    ...overrides,
  };
}

function createStoredLog(overrides?: Record<string, unknown>) {
  return {
    id: 'log-original',
    eventId: 'evt-1',
    personId: 'person-1',
    templateId: 'tpl-1',
    templateKeySnapshot: 'registration_confirmation',
    templateVersionNo: 1,
    channel: 'email',
    provider: 'resend',
    triggerType: 'registration.created',
    triggerEntityType: null,
    triggerEntityId: null,
    sendMode: 'automatic',
    idempotencyKey: 'original-key',
    recipientEmail: 'test@example.com',
    recipientPhoneE164: null,
    renderedSubject: 'Stored subject',
    renderedBody: '<p>Stored body</p>',
    renderedVariablesJson: { recipientName: 'John' },
    attachmentManifestJson: null,
    status: 'sent',
    initiatedByUserId: 'user-1',
    ...overrides,
  };
}

describe('sendNotification with circuit breaker', () => {
  it('fails immediately with CIRCUIT_OPEN when circuit is open', async () => {
    const mockBreaker: CircuitBreakerService = {
      checkCircuit: vi.fn().mockRejectedValue(new CircuitOpenError('resend')),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      getStatus: vi.fn(),
    };

    const deps = createMockDeps({ circuitBreaker: mockBreaker });
    const result = await sendNotification(createBaseInput(), deps);

    expect(result.status).toBe('failed');
    expect(deps.updateLogStatusFn).toHaveBeenCalledWith(
      'log-1',
      'evt-1',
      expect.objectContaining({
        status: 'failed',
        lastErrorCode: 'CIRCUIT_OPEN',
      }),
    );
    expect(deps.emailProvider.send).not.toHaveBeenCalled();
  });

  it('records failure in circuit breaker on PROVIDER_TIMEOUT', async () => {
    const mockBreaker: CircuitBreakerService = {
      checkCircuit: vi.fn().mockResolvedValue('closed'),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      getStatus: vi.fn(),
    };

    const deps = createMockDeps({
      circuitBreaker: mockBreaker,
      emailProvider: {
        send: vi.fn().mockRejectedValue(new ProviderTimeoutError('resend', 10_000)),
      },
    });

    const result = await sendNotification(createBaseInput(), deps);

    expect(result.status).toBe('failed');
    expect(mockBreaker.recordFailure).toHaveBeenCalledWith('resend');
    expect(deps.updateLogStatusFn).toHaveBeenCalledWith(
      'log-1',
      'evt-1',
      expect.objectContaining({
        lastErrorCode: 'PROVIDER_TIMEOUT',
        lastErrorMessage: 'Request timed out after 10s',
      }),
    );
  });

  it('records success in circuit breaker on accepted send', async () => {
    const mockBreaker: CircuitBreakerService = {
      checkCircuit: vi.fn().mockResolvedValue('closed'),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      getStatus: vi.fn(),
    };

    const deps = createMockDeps({ circuitBreaker: mockBreaker });
    const result = await sendNotification(createBaseInput(), deps);

    expect(result.status).toBe('sent');
    expect(mockBreaker.recordSuccess).toHaveBeenCalledWith('resend');
    expect(mockBreaker.recordFailure).not.toHaveBeenCalled();
  });

  it('records failure in circuit breaker on provider rejection', async () => {
    const mockBreaker: CircuitBreakerService = {
      checkCircuit: vi.fn().mockResolvedValue('closed'),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      getStatus: vi.fn(),
    };

    const deps = createMockDeps({
      circuitBreaker: mockBreaker,
      emailProvider: {
        send: vi.fn().mockResolvedValue({
          provider: 'resend',
          providerMessageId: null,
          accepted: false,
          rawStatus: 'rate_limited',
        }),
      },
    });

    const result = await sendNotification(createBaseInput(), deps);

    expect(result.status).toBe('failed');
    expect(mockBreaker.recordFailure).toHaveBeenCalledWith('resend');
  });
});

describe('resendNotification with circuit breaker', () => {
  it('checks circuit breaker before resend and blocks if open', async () => {
    const mockBreaker: CircuitBreakerService = {
      checkCircuit: vi.fn().mockRejectedValue(new CircuitOpenError('resend')),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      getStatus: vi.fn(),
    };

    const deps = createMockDeps({ circuitBreaker: mockBreaker });
    deps.getLogByIdFn = vi.fn().mockResolvedValue(createStoredLog());

    const result = await resendNotification({
      eventId: 'evt-1',
      notificationLogId: 'log-original',
      initiatedByUserId: 'user-2',
    }, deps);

    expect(result.status).toBe('failed');
    expect(mockBreaker.checkCircuit).toHaveBeenCalledWith('resend');
    expect(deps.emailProvider.send).not.toHaveBeenCalled();
  });
});

describe('retryFailedNotification with circuit breaker', () => {
  it('checks circuit breaker and records success on successful retry', async () => {
    const mockBreaker: CircuitBreakerService = {
      checkCircuit: vi.fn().mockResolvedValue('closed'),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      getStatus: vi.fn(),
    };

    const deps = createMockDeps({ circuitBreaker: mockBreaker });
    deps.getLogByIdFn = vi.fn().mockResolvedValue(createStoredLog({ status: 'failed' }));

    await retryFailedNotification({
      eventId: 'evt-1',
      notificationLogId: 'log-original',
      initiatedByUserId: 'user-2',
    }, deps);

    expect(mockBreaker.checkCircuit).toHaveBeenCalledWith('resend');
    expect(mockBreaker.recordSuccess).toHaveBeenCalledWith('resend');
  });
});
