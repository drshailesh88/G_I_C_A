/**
 * Gap Tests for Communications Module
 *
 * Covers checkpoints from spec-001 through spec-011 that are NOT covered
 * by existing test files. All tests are unit-level with mocks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────

const { mockCaptureNotificationError, mockIsChannelEnabled } = vi.hoisted(() => ({
  mockCaptureNotificationError: vi.fn(),
  mockIsChannelEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({
  notificationTemplates: {},
  notificationLog: {},
  events: {},
}));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  desc: vi.fn(),
}));

vi.mock('@/lib/sentry', () => ({
  captureNotificationError: mockCaptureNotificationError,
}));

vi.mock('@/lib/flags', () => ({
  isChannelEnabled: (...args: unknown[]) => mockIsChannelEnabled(...args),
}));

vi.mock('./template-renderer', () => ({
  renderTemplate: vi.fn(),
  resolveTemplate: vi.fn(),
  interpolate: vi.fn(),
  validateRequiredVariables: vi.fn(),
}));
vi.mock('./log-queries', () => ({
  beginLogAttempt: vi.fn(),
  createLogEntry: vi.fn(),
  updateLogStatus: vi.fn(),
  getLogById: vi.fn(),
  listFailedLogs: vi.fn(),
  markAsRetrying: vi.fn(),
  upsertLogEntry: vi.fn(),
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
import {
  sendNotification,
  resendNotification,
  retryFailedNotification,
} from './send';
import type { NotificationServiceDeps } from './send';
import type {
  SendNotificationInput,
  EmailProvider,
  WhatsAppProvider,
  IdempotencyService,
} from './types';
import { ProviderTimeoutError } from './timeout';

const mockedMarkAsRetrying = vi.mocked(markAsRetrying);

beforeEach(() => {
  vi.clearAllMocks();
  mockIsChannelEnabled.mockResolvedValue(true);
  mockCaptureNotificationError.mockImplementation(() => {});
  mockedMarkAsRetrying.mockResolvedValue({} as Awaited<ReturnType<typeof markAsRetrying>>);
});

// ── Shared mock helpers ──────────────────────────────────────

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
    body: '<p>Hello World</p>',
    variables: { name: 'Test' },
    brandingVars: {
      logoUrl: '',
      headerImageUrl: '',
      primaryColor: '#1E40AF',
      secondaryColor: '#9333EA',
      emailSenderName: 'GEM India',
      emailFooterText: '',
      whatsappPrefix: '',
    },
  });

  const mockLogRow = createStoredLog();

  return {
    emailProvider: mockEmailProvider,
    whatsAppProvider: mockWhatsAppProvider,
    idempotencyService: mockIdempotency,
    renderTemplateFn: mockRenderTemplate,
    createLogEntryFn: vi.fn().mockResolvedValue(mockLogRow),
    updateLogStatusFn: vi.fn().mockResolvedValue({ ...mockLogRow, status: 'sent' }),
    getLogByIdFn: vi.fn().mockResolvedValue(mockLogRow),
    ...overrides,
  };
}

function createEmailInput(overrides?: Partial<SendNotificationInput>): SendNotificationInput {
  return {
    eventId: 'evt-1',
    personId: 'person-1',
    channel: 'email',
    templateKey: 'registration_confirmation',
    triggerType: 'registration.created',
    sendMode: 'automatic',
    idempotencyKey: 'idem-key-1',
    variables: { recipientEmail: 'user@example.com', name: 'Test' },
    ...overrides,
  };
}

function createStoredLog(overrides?: Record<string, unknown>) {
  return {
    id: 'log-1',
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
    idempotencyKey: 'idem-1',
    recipientEmail: 'user@example.com',
    recipientPhoneE164: null,
    renderedSubject: 'Test Subject',
    renderedBody: '<p>Hello World</p>',
    renderedVariablesJson: { name: 'Test' },
    attachmentManifestJson: null,
    status: 'queued',
    initiatedByUserId: null,
    isResend: false,
    resendOfId: null,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// SPEC-001 GAPS: Feature Flags & Sentry Capture
// ═══════════════════════════════════════════════════════════════

describe('spec-001: feature flag gate', () => {
  it('channel disabled skips send and creates audit log with CHANNEL_DISABLED', async () => {
    mockIsChannelEnabled.mockResolvedValue(false);
    const deps = createMockDeps();
    const input = createEmailInput();

    const result = await sendNotification(input, deps);

    expect(deps.emailProvider.send).not.toHaveBeenCalled();
    expect(deps.createLogEntryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        renderedBody: expect.stringContaining('CHANNEL_DISABLED'),
        status: 'sent', // intentional skip, not failure
      }),
    );
    expect(result.status).toBe('sent');
  });

  it('channel disabled for whatsapp creates audit log', async () => {
    mockIsChannelEnabled.mockResolvedValue(false);
    const deps = createMockDeps();
    const input = createEmailInput({
      channel: 'whatsapp',
      variables: { recipientPhoneE164: '+919876543210' },
    });

    const result = await sendNotification(input, deps);

    expect(deps.whatsAppProvider.sendText).not.toHaveBeenCalled();
    expect(result.status).toBe('sent');
  });

  it('flag check best-effort — Redis error does not block send', async () => {
    mockIsChannelEnabled.mockRejectedValue(new Error('Redis connection refused'));
    const deps = createMockDeps();
    const input = createEmailInput();

    const result = await sendNotification(input, deps);

    // Send should proceed despite flag check failure
    expect(deps.emailProvider.send).toHaveBeenCalled();
    expect(result.status).toBe('sent');
  });
});

describe('spec-001: Sentry capture', () => {
  it('captures to Sentry on template render failure', async () => {
    const deps = createMockDeps({
      renderTemplateFn: vi.fn().mockRejectedValue(new Error('Bad template')),
    });
    const input = createEmailInput();

    await sendNotification(input, deps);

    expect(mockCaptureNotificationError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        channel: 'email',
        eventId: 'evt-1',
        personId: 'person-1',
        errorCode: 'RENDER_FAILED',
      }),
    );
  });

  it('captures to Sentry on provider exception', async () => {
    const deps = createMockDeps({
      emailProvider: {
        send: vi.fn().mockRejectedValue(new Error('Network error')),
      },
    });
    const input = createEmailInput();

    await sendNotification(input, deps);

    expect(mockCaptureNotificationError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        channel: 'email',
        errorCode: 'PROVIDER_EXCEPTION',
      }),
    );
  });

  it('captures to Sentry on provider timeout', async () => {
    const deps = createMockDeps({
      emailProvider: {
        send: vi.fn().mockRejectedValue(new ProviderTimeoutError('resend', 10_000)),
      },
    });
    const input = createEmailInput();

    await sendNotification(input, deps);

    expect(mockCaptureNotificationError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        errorCode: 'PROVIDER_TIMEOUT',
      }),
    );
  });
});

describe('spec-001: template render ordering', () => {
  it('renderTemplate is called before createLogEntry in normal flow', async () => {
    const callOrder: string[] = [];
    const deps = createMockDeps({
      renderTemplateFn: vi.fn().mockImplementation(async () => {
        callOrder.push('render');
        return {
          templateId: 'tpl-1',
          templateVersionNo: 1,
          subject: 'Test',
          body: '<p>Test</p>',
          variables: {},
          brandingVars: {
            logoUrl: '', headerImageUrl: '', primaryColor: '#000',
            secondaryColor: '#000', emailSenderName: '', emailFooterText: '',
            whatsappPrefix: '',
          },
        };
      }),
      createLogEntryFn: vi.fn().mockImplementation(async () => {
        callOrder.push('createLog');
        return createStoredLog();
      }),
    });
    const input = createEmailInput();

    await sendNotification(input, deps);

    expect(callOrder.indexOf('render')).toBeLessThan(callOrder.indexOf('createLog'));
  });
});

// ═══════════════════════════════════════════════════════════════
// SPEC-002 GAPS: Resend key format, concurrent retry, stored content
// ═══════════════════════════════════════════════════════════════

describe('spec-002: resend idempotency key format', () => {
  it('resend key starts with "resend:" and includes timestamp', async () => {
    const deps = createMockDeps();

    await resendNotification(
      { eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'user-1' },
      deps,
    );

    expect(deps.createLogEntryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^resend:log-1:\d+$/),
      }),
    );
  });
});

describe('spec-002: concurrent retry prevention', () => {
  it('second concurrent retry throws "already in progress"', async () => {
    // markAsRetrying returns null (CAS failed — another retry claimed it)
    mockedMarkAsRetrying.mockResolvedValue(null);

    const deps = createMockDeps({
      getLogByIdFn: vi.fn().mockResolvedValue(createStoredLog({ status: 'failed' })),
    });

    await expect(
      retryFailedNotification(
        { eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'user-1' },
        deps,
      ),
    ).rejects.toThrow('already in progress');
  });
});

describe('spec-002: retry uses stored content', () => {
  it('retry reuses stored rendered body, does not re-render', async () => {
    const storedLog = createStoredLog({
      status: 'failed',
      renderedBody: '<p>Original stored body</p>',
      renderedSubject: 'Original Subject',
    });
    const deps = createMockDeps({
      getLogByIdFn: vi.fn().mockResolvedValue(storedLog),
    });

    await retryFailedNotification(
      { eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'user-1' },
      deps,
    );

    // renderTemplateFn should NOT be called — retry uses stored content
    expect(deps.renderTemplateFn).not.toHaveBeenCalled();
    // The new log should have the stored body
    expect(deps.createLogEntryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        renderedBody: '<p>Original stored body</p>',
        renderedSubject: 'Original Subject',
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// SPEC-005 GAPS: Template utils edge cases
// ═══════════════════════════════════════════════════════════════

import { interpolate, resolvePath, validateRequiredVariables } from './template-utils';

describe('spec-005: template interpolation edge cases', () => {
  it('null variable becomes empty string', () => {
    expect(interpolate('Hello {{name}}', { name: null })).toBe('Hello ');
  });

  it('undefined variable becomes empty string', () => {
    expect(interpolate('Hello {{name}}', {})).toBe('Hello ');
  });

  it('__proto__ access returns undefined (prototype chain blocked)', () => {
    const result = resolvePath({ normal: 'ok' }, '__proto__');
    expect(result).toBeUndefined();
  });

  it('constructor access returns undefined (prototype chain blocked)', () => {
    const result = resolvePath({ normal: 'ok' }, 'constructor');
    expect(result).toBeUndefined();
  });

  it('all required present returns empty array', () => {
    const missing = validateRequiredVariables(
      ['name', 'email'],
      { name: 'John', email: 'john@test.com' },
    );
    expect(missing).toEqual([]);
  });

  it('missing required returns list of missing names', () => {
    const missing = validateRequiredVariables(
      ['name', 'email', 'phone'],
      { name: 'John' },
    );
    expect(missing).toEqual(['email', 'phone']);
  });
});

// ═══════════════════════════════════════════════════════════════
// SPEC-006 GAPS: System template seeds completeness
// ═══════════════════════════════════════════════════════════════

import { SYSTEM_TEMPLATE_SEEDS, getSystemTemplateKeys, getSeedsForKey } from './system-templates';

describe('spec-006: system template seed completeness', () => {
  it('has all 12 unique template keys', () => {
    const keys = getSystemTemplateKeys();
    expect(keys.length).toBe(12);
    expect(keys).toContain('registration_confirmation');
    expect(keys).toContain('registration_cancelled');
    expect(keys).toContain('faculty_invitation');
    expect(keys).toContain('faculty_reminder');
    expect(keys).toContain('program_update');
    expect(keys).toContain('travel_update');
    expect(keys).toContain('travel_cancelled');
    expect(keys).toContain('accommodation_details');
    expect(keys).toContain('accommodation_update');
    expect(keys).toContain('accommodation_cancelled');
    expect(keys).toContain('certificate_ready');
    expect(keys).toContain('event_reminder');
  });

  it('has exactly 24 seeds (12 keys x 2 channels)', () => {
    expect(SYSTEM_TEMPLATE_SEEDS.length).toBe(24);
  });

  it('getSeedsForKey returns empty for unknown key', () => {
    expect(getSeedsForKey('nonexistent_key')).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// SPEC-007 GAPS: Evolution status additional mappings
// ═══════════════════════════════════════════════════════════════

import { parseEvolutionWebhook, parseResendWebhook, isStatusForward } from './webhook-parsers';

describe('spec-007: Evolution API parser additional mappings', () => {
  it('status 0 (ERROR) maps to failed', () => {
    const result = parseEvolutionWebhook({
      event: 'messages.update',
      data: { key: { id: 'msg-1' }, update: { status: 0 } },
    });
    expect(result?.eventType).toBe('failed');
  });

  it('status 1 (PENDING) maps to sending', () => {
    const result = parseEvolutionWebhook({
      event: 'messages.update',
      data: { key: { id: 'msg-1' }, update: { status: 1 } },
    });
    expect(result?.eventType).toBe('sending');
  });

  it('status 5 (PLAYED) maps to read', () => {
    const result = parseEvolutionWebhook({
      event: 'messages.update',
      data: { key: { id: 'msg-1' }, update: { status: 5 } },
    });
    expect(result?.eventType).toBe('read');
  });
});

describe('spec-007: status progression - failed overrides', () => {
  it('failed can override delivered', () => {
    expect(isStatusForward('delivered', 'failed')).toBe(true);
  });

  it('failed can override read', () => {
    expect(isStatusForward('read', 'failed')).toBe(true);
  });

  it('failed can override sent', () => {
    expect(isStatusForward('sent', 'failed')).toBe(true);
  });
});

describe('spec-007: Resend parser - email.delivery_delayed', () => {
  it('email.delivery_delayed maps to sending', () => {
    const result = parseResendWebhook({
      type: 'email.delivery_delayed',
      data: { email_id: 'msg-1', created_at: '2026-04-08T10:00:00Z' },
    });
    expect(result?.eventType).toBe('sending');
  });
});

// ═══════════════════════════════════════════════════════════════
// SPEC-008 GAPS: Webhook auth multi-signature & timing-safe
// ═══════════════════════════════════════════════════════════════

import { verifyResendSignature, verifyEvolutionSignature } from './webhook-auth';
import { createHmac } from 'crypto';

describe('spec-008: Resend multi-signature support', () => {
  it('accepts when one of multiple v1 signatures is valid', () => {
    const secret = 'whsec_' + Buffer.from('test-secret-32-bytes-long-here!').toString('base64');
    const originalSecret = process.env.RESEND_WEBHOOK_SECRET;
    const nowSeconds = 1234567890;
    process.env.RESEND_WEBHOOK_SECRET = secret;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowSeconds * 1000));

    try {
      const svixId = 'msg_123';
      const svixTimestamp = String(nowSeconds);
      const payload = '{"test":"data"}';

      const secretBytes = Buffer.from(secret.slice(6), 'base64');
      const signatureContent = `${svixId}.${svixTimestamp}.${payload}`;
      const validSig = createHmac('sha256', secretBytes)
        .update(signatureContent)
        .digest('base64');

      // Multi-signature header: one invalid, one valid
      const multiSig = `v1,invalidbase64garbage v1,${validSig}`;

      const result = verifyResendSignature({
        payload,
        svixId,
        svixTimestamp,
        svixSignature: multiSig,
      });
      expect(result).toBe(true);
    } finally {
      vi.useRealTimers();
      process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    }
  });
});

describe('spec-008: Evolution timing-safe comparison', () => {
  it('rejects tokens of different length without throwing', () => {
    const originalSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
    process.env.EVOLUTION_WEBHOOK_SECRET = 'correct-secret';

    try {
      // Short token
      expect(verifyEvolutionSignature({ authorizationHeader: 'Bearer x' })).toBe(false);
      // Long token
      expect(
        verifyEvolutionSignature({ authorizationHeader: 'Bearer ' + 'x'.repeat(100) }),
      ).toBe(false);
    } finally {
      process.env.EVOLUTION_WEBHOOK_SECRET = originalSecret;
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SPEC-008 GAPS: DLQ interface
// ═══════════════════════════════════════════════════════════════

import { pushToDlq, popFromDlq, getDlqSize, type DlqEntry } from './webhook-dlq';

describe('spec-008: DLQ when Redis not configured', () => {
  it('pushToDlq returns false when Redis not configured', async () => {
    const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
    const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    try {
      const result = await pushToDlq({
        provider: 'resend',
        channel: 'email',
        rawPayload: {},
        failedAt: new Date().toISOString(),
        errorMessage: 'test error',
      });
      expect(result).toBe(false);
    } finally {
      if (originalUrl) process.env.UPSTASH_REDIS_REST_URL = originalUrl;
      if (originalToken) process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    }
  });

  it('popFromDlq returns empty array when Redis not configured', async () => {
    const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;

    try {
      const entries = await popFromDlq(10);
      expect(entries).toEqual([]);
    } finally {
      if (originalUrl) process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    }
  });

  it('getDlqSize returns 0 when Redis not configured', async () => {
    const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;

    try {
      const size = await getDlqSize();
      expect(size).toBe(0);
    } finally {
      if (originalUrl) process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    }
  });
});
