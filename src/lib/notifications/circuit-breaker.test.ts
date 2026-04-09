/**
 * Tests for Provider Timeout and Circuit Breaker (Req 8C-1)
 *
 * 12 tests covering:
 * - Timeout: 20s provider → timeout at configured time
 * - Circuit breaker: 5 failures → circuit opens
 * - Half-open: 60s → probe sent
 * - Success probe → circuit resets
 * - Parallel requests during open → immediate fail
 * - Integration with sendNotification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  OPEN_DURATION_MS,
  type CircuitBreakerService,
} from './circuit-breaker';

/**
 * In-memory Redis stub that mimics the subset of @upstash/redis used by circuit breaker.
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
    async set(key: string, value: unknown, opts?: { ex?: number }): Promise<'OK'> {
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
  };
}

describe('CircuitBreaker', () => {
  let redis: ReturnType<typeof createRedisStub>;
  let breaker: CircuitBreakerService;

  beforeEach(() => {
    redis = createRedisStub();
    // Cast the stub — it satisfies the subset of Redis methods used
    breaker = createCircuitBreaker(redis as unknown as import('@upstash/redis').Redis);
  });

  it('allows requests when circuit is closed (< 5 failures)', async () => {
    // Record 4 failures — still under threshold
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
    // Open the circuit
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await breaker.recordFailure('resend');
    }

    // Multiple parallel checks — all should fail immediately
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

  it('enters half-open state after 60s and allows a probe', async () => {
    // Open circuit
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await breaker.recordFailure('resend');
    }

    // Simulate time passage by directly modifying the stored openedAt
    const key = 'notif:circuit:resend';
    const stored = await redis.get<{ failures: number; openedAt: number }>(key);
    expect(stored).not.toBeNull();

    // Set openedAt to 61 seconds ago
    await redis.set(key, {
      failures: stored!.failures,
      openedAt: Date.now() - OPEN_DURATION_MS - 1000,
    }, { ex: 300 });

    const state = await breaker.checkCircuit('resend');
    expect(state).toBe('half-open');
  });

  it('resets circuit on successful probe (half-open → closed)', async () => {
    // Open circuit
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await breaker.recordFailure('resend');
    }

    // Record success (simulating successful probe)
    await breaker.recordSuccess('resend');

    const status = await breaker.getStatus('resend');
    expect(status.state).toBe('closed');
    expect(status.failures).toBe(0);
    expect(status.openedAt).toBeNull();
  });

  it('returns to open on failed probe (half-open → open)', async () => {
    // Open circuit
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await breaker.recordFailure('resend');
    }

    // Simulate half-open by setting openedAt in the past
    const key = 'notif:circuit:resend';
    await redis.set(key, {
      failures: FAILURE_THRESHOLD,
      openedAt: Date.now() - OPEN_DURATION_MS - 1000,
    }, { ex: 300 });

    // Verify it's half-open
    const halfOpenState = await breaker.checkCircuit('resend');
    expect(halfOpenState).toBe('half-open');

    // Probe fails — record another failure
    await breaker.recordFailure('resend');

    // Should be open again (failures now = THRESHOLD + 1, openedAt refreshed)
    await expect(breaker.checkCircuit('resend')).rejects.toThrow(CircuitOpenError);
  });

  it('tracks separate circuits per provider', async () => {
    // Open circuit for resend
    for (let i = 0; i < FAILURE_THRESHOLD; i++) {
      await breaker.recordFailure('resend');
    }

    // evolution_api should still be closed
    const state = await breaker.checkCircuit('evolution_api');
    expect(state).toBe('closed');

    // resend should be open
    await expect(breaker.checkCircuit('resend')).rejects.toThrow(CircuitOpenError);
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

import { sendNotification } from './send';
import type { NotificationServiceDeps } from './send';
import type {
  SendNotificationInput,
  EmailProvider,
  WhatsAppProvider,
  IdempotencyService,
} from './types';

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
    // Provider should NOT have been called
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
