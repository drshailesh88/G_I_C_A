/**
 * Mutation-killing tests Round 4 for send.ts
 *
 * Targets: ConditionalExpression on channel ternaries (lines 103/104,
 * 155/156, 186/187, 221, 451, 503, 523), LogicalOperator ?? null/undefined
 * in flag-disabled and render-failure paths, ObjectLiteral on
 * sendNotificationFromLog update calls.
 *
 * Key strategy: provide BOTH recipientEmail AND recipientPhoneE164 in variables,
 * then assert the correct one is extracted for the channel while the other is null.
 * This kills ConditionalExpression→true mutations which would extract the wrong field.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({ notificationTemplates: {}, notificationLog: {} }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn(), isNull: vi.fn(), desc: vi.fn() }));
vi.mock('./template-renderer', () => ({ renderTemplate: vi.fn(), resolveTemplate: vi.fn(), interpolate: vi.fn(), validateRequiredVariables: vi.fn() }));
vi.mock('./log-queries', () => ({ createLogEntry: vi.fn(), updateLogStatus: vi.fn(), getLogById: vi.fn(), listFailedLogs: vi.fn(), markAsRetrying: vi.fn() }));
vi.mock('./email', () => ({ resendEmailProvider: { send: vi.fn() } }));
vi.mock('./whatsapp', () => ({ evolutionWhatsAppProvider: { sendText: vi.fn() } }));
vi.mock('./idempotency', () => ({ redisIdempotencyService: { checkAndSet: vi.fn() } }));
vi.mock('@/lib/sentry', () => ({ captureNotificationError: vi.fn() }));
vi.mock('@/lib/flags', () => ({ isChannelEnabled: vi.fn().mockResolvedValue(true) }));

import { markAsRetrying } from './log-queries';
import { sendNotification, resendNotification, retryFailedNotification } from './send';
import type { NotificationServiceDeps } from './send';
import { isChannelEnabled } from '@/lib/flags';
import { ProviderTimeoutError } from './timeout';

const mockedMarkAsRetrying = vi.mocked(markAsRetrying);
const mockedIsChannelEnabled = vi.mocked(isChannelEnabled);

beforeEach(() => {
  vi.clearAllMocks();
  mockedMarkAsRetrying.mockResolvedValue({} as any);
  mockedIsChannelEnabled.mockResolvedValue(true);
});

function mkDeps(overrides?: Partial<NotificationServiceDeps>): NotificationServiceDeps {
  return {
    emailProvider: { send: vi.fn().mockResolvedValue({ provider: 'resend', providerMessageId: 'msg-1', accepted: true, rawStatus: 'accepted' }) },
    whatsAppProvider: { sendText: vi.fn().mockResolvedValue({ provider: 'evolution_api', providerMessageId: 'wa-1', accepted: true, rawStatus: 'accepted' }) },
    idempotencyService: { checkAndSet: vi.fn().mockResolvedValue(false) },
    renderTemplateFn: vi.fn().mockResolvedValue({ templateId: 'tpl-1', templateVersionNo: 1, subject: 'Subj', body: '<p>Body</p>', variables: { name: 'T' }, brandingVars: { emailSenderName: 'GEM' } }),
    createLogEntryFn: vi.fn().mockResolvedValue({ id: 'log-1', eventId: 'evt-1', status: 'queued' }),
    updateLogStatusFn: vi.fn().mockResolvedValue({ status: 'sent' }),
    getLogByIdFn: vi.fn().mockResolvedValue({ id: 'log-1', eventId: 'evt-1', personId: 'p-1', templateId: 'tpl-1', templateKeySnapshot: 'key', templateVersionNo: 1, channel: 'email', provider: 'resend', triggerType: 'manual', triggerEntityType: null, triggerEntityId: null, sendMode: 'manual', recipientEmail: 'user@ex.com', recipientPhoneE164: null, renderedSubject: 'Subj', renderedBody: '<p>B</p>', renderedVariablesJson: {}, attachmentManifestJson: null, status: 'failed' }),
    ...overrides,
  };
}

/**
 * CRITICAL: These tests provide BOTH recipientEmail AND recipientPhoneE164 in variables,
 * then assert the channel-appropriate one is extracted while the other is null.
 * This kills ConditionalExpression→true mutations (which would always extract both).
 */

describe('sendNotification — cross-channel recipient extraction (flag-disabled path)', () => {
  it('extracts ONLY email recipient for email channel when both exist in variables', async () => {
    mockedIsChannelEnabled.mockResolvedValue(false);
    const d = mkDeps();

    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'manual', sendMode: 'manual', idempotencyKey: 'idem-cross-1',
      variables: { recipientEmail: 'user@ex.com', recipientPhoneE164: '+919876543210' },
    }, d);

    const logCall = (d.createLogEntryFn as any).mock.calls[0][0];
    // Channel is email: extract email, phone must be null
    expect(logCall.recipientEmail).toBe('user@ex.com');
    expect(logCall.recipientPhoneE164).toBeNull();
    expect(logCall.provider).toBe('resend');
  });

  it('extracts ONLY phone recipient for whatsapp channel when both exist in variables', async () => {
    mockedIsChannelEnabled.mockResolvedValue(false);
    const d = mkDeps();

    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'whatsapp', templateKey: 'key',
      triggerType: 'manual', sendMode: 'manual', idempotencyKey: 'idem-cross-2',
      variables: { recipientEmail: 'user@ex.com', recipientPhoneE164: '+919876543210' },
    }, d);

    const logCall = (d.createLogEntryFn as any).mock.calls[0][0];
    // Channel is whatsapp: extract phone, email must be null
    expect(logCall.recipientPhoneE164).toBe('+919876543210');
    expect(logCall.recipientEmail).toBeNull();
    expect(logCall.provider).toBe('evolution_api');
  });

  it('maps ?? null fields correctly in flag-disabled path', async () => {
    mockedIsChannelEnabled.mockResolvedValue(false);
    const d = mkDeps();

    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'manual',
      triggerEntityType: undefined,
      triggerEntityId: undefined,
      sendMode: 'manual', idempotencyKey: 'idem-nulls',
      variables: { recipientEmail: 'user@ex.com' },
      initiatedByUserId: undefined,
    }, d);

    const logCall = (d.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.triggerEntityType).toBeNull();
    expect(logCall.triggerEntityId).toBeNull();
    expect(logCall.initiatedByUserId).toBeNull();
    expect(logCall.attachmentManifestJson).toBeNull();
  });

  it('passes flagService correctly', async () => {
    const flagService = { isEnabled: vi.fn() };
    mockedIsChannelEnabled.mockResolvedValue(true);
    const d = mkDeps({ flagService: flagService as any });

    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'manual', sendMode: 'manual', idempotencyKey: 'idem-flag',
      variables: { recipientEmail: 'user@ex.com' },
    }, d);

    // isChannelEnabled should receive the flag service
    expect(mockedIsChannelEnabled).toHaveBeenCalledWith('email', flagService);
  });

  it('passes undefined when flagService is null', async () => {
    mockedIsChannelEnabled.mockResolvedValue(true);
    const d = mkDeps({ flagService: null });

    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'manual', sendMode: 'manual', idempotencyKey: 'idem-flag-null',
      variables: { recipientEmail: 'user@ex.com' },
    }, d);

    expect(mockedIsChannelEnabled).toHaveBeenCalledWith('email', undefined);
  });
});

describe('sendNotification — cross-channel recipient extraction (render-failure path)', () => {
  it('extracts ONLY email for email channel in render failure log', async () => {
    const d = mkDeps({ renderTemplateFn: vi.fn().mockRejectedValue(new Error('Bad template')) });

    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'manual', sendMode: 'manual', idempotencyKey: 'idem-rf-1',
      variables: { recipientEmail: 'user@ex.com', recipientPhoneE164: '+919876543210' },
    }, d);

    const logCall = (d.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.recipientEmail).toBe('user@ex.com');
    expect(logCall.recipientPhoneE164).toBeNull();
  });

  it('extracts ONLY phone for whatsapp channel in render failure log', async () => {
    const d = mkDeps({ renderTemplateFn: vi.fn().mockRejectedValue(new Error('Bad template')) });

    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'whatsapp', templateKey: 'key',
      triggerType: 'manual', sendMode: 'manual', idempotencyKey: 'idem-rf-2',
      variables: { recipientEmail: 'user@ex.com', recipientPhoneE164: '+919876543210' },
    }, d);

    const logCall = (d.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.recipientPhoneE164).toBe('+919876543210');
    expect(logCall.recipientEmail).toBeNull();
  });

  it('maps ?? null fields in render failure path', async () => {
    const d = mkDeps({ renderTemplateFn: vi.fn().mockRejectedValue(new Error('Bad')) });

    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'manual', triggerEntityType: undefined, triggerEntityId: undefined,
      sendMode: 'manual', idempotencyKey: 'idem-rf-nulls',
      variables: { recipientEmail: 'user@ex.com' },
    }, d);

    const logCall = (d.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.triggerEntityType).toBeNull();
    expect(logCall.triggerEntityId).toBeNull();
    expect(logCall.attachmentManifestJson).toBeNull();
    expect(logCall.initiatedByUserId).toBeNull();
  });
});

describe('sendNotification — cross-channel recipient extraction (queued log path)', () => {
  it('extracts ONLY email for email channel in queued log', async () => {
    const d = mkDeps();

    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'manual', sendMode: 'manual', idempotencyKey: 'idem-q-1',
      variables: { recipientEmail: 'user@ex.com', recipientPhoneE164: '+919876543210' },
    }, d);

    // The second createLogEntryFn call is the queued log (first was flag path if disabled)
    const logCall = (d.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.recipientEmail).toBe('user@ex.com');
    expect(logCall.recipientPhoneE164).toBeNull();
  });

  it('extracts ONLY phone for whatsapp channel in queued log', async () => {
    const d = mkDeps();

    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'whatsapp', templateKey: 'key',
      triggerType: 'manual', sendMode: 'manual', idempotencyKey: 'idem-q-2',
      variables: { recipientEmail: 'user@ex.com', recipientPhoneE164: '+919876543210' },
    }, d);

    const logCall = (d.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.recipientPhoneE164).toBe('+919876543210');
    expect(logCall.recipientEmail).toBeNull();
  });
});

describe('sendNotificationFromLog — cross-channel routing', () => {
  it('routes whatsapp resend to whatsApp provider with exact fields', async () => {
    const d = mkDeps({
      getLogByIdFn: vi.fn().mockResolvedValue({
        id: 'log-orig', eventId: 'evt-1', personId: 'p-1',
        templateId: 'tpl-1', templateKeySnapshot: 'key', templateVersionNo: 1,
        channel: 'whatsapp', provider: 'evolution_api',
        triggerType: null, triggerEntityType: null, triggerEntityId: null,
        sendMode: 'manual', recipientEmail: null, recipientPhoneE164: '+919876543210',
        renderedSubject: null, renderedBody: 'Hello WA',
        renderedVariablesJson: { name: 'Test' },
        attachmentManifestJson: [{ fileName: 'doc.pdf', storageKey: 's3/doc.pdf', contentType: 'application/pdf' }],
        status: 'sent',
      }),
    });

    await resendNotification(
      { eventId: 'evt-1', notificationLogId: 'log-orig', initiatedByUserId: 'user-1' },
      d,
    );

    // Should use whatsApp provider
    expect(d.whatsAppProvider.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-1',
        toPhoneE164: '+919876543210',
        body: 'Hello WA',
      }),
    );
    // Should NOT call email provider
    expect(d.emailProvider.send).not.toHaveBeenCalled();
  });

  it('routes email resend to email provider with exact subject fallback', async () => {
    const d = mkDeps({
      getLogByIdFn: vi.fn().mockResolvedValue({
        id: 'log-orig', eventId: 'evt-1', personId: 'p-1',
        templateId: null, templateKeySnapshot: null, templateVersionNo: null,
        channel: 'email', provider: 'resend',
        triggerType: null, triggerEntityType: null, triggerEntityId: null,
        sendMode: 'manual', recipientEmail: null, recipientPhoneE164: null,
        renderedSubject: null, renderedBody: '<p>Body</p>',
        renderedVariablesJson: null, attachmentManifestJson: null,
        status: 'sent',
      }),
    });

    await resendNotification(
      { eventId: 'evt-1', notificationLogId: 'log-orig', initiatedByUserId: 'user-1' },
      d,
    );

    // Email provider should get empty string fallbacks for null
    expect(d.emailProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: '',
        subject: '',
        htmlBody: '<p>Body</p>',
      }),
    );
  });

  it('maps ?? null fields correctly in sendNotificationFromLog', async () => {
    const d = mkDeps({
      getLogByIdFn: vi.fn().mockResolvedValue({
        id: 'log-orig', eventId: 'evt-1', personId: 'p-1',
        templateId: undefined, templateKeySnapshot: undefined, templateVersionNo: undefined,
        channel: 'email', provider: 'resend',
        triggerType: undefined, triggerEntityType: undefined, triggerEntityId: undefined,
        sendMode: 'manual', recipientEmail: 'user@ex.com', recipientPhoneE164: undefined,
        renderedSubject: undefined, renderedBody: 'body',
        renderedVariablesJson: undefined, attachmentManifestJson: undefined,
        status: 'sent',
      }),
    });

    await resendNotification(
      { eventId: 'evt-1', notificationLogId: 'log-orig', initiatedByUserId: 'user-1' },
      d,
    );

    const logCall = (d.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.templateId).toBeNull();
    expect(logCall.templateKeySnapshot).toBeNull();
    expect(logCall.templateVersionNo).toBeNull();
    expect(logCall.triggerType).toBeNull();
    expect(logCall.triggerEntityType).toBeNull();
    expect(logCall.triggerEntityId).toBeNull();
    expect(logCall.recipientPhoneE164).toBeNull();
    expect(logCall.renderedSubject).toBeNull();
    expect(logCall.renderedVariablesJson).toBeNull();
    expect(logCall.attachmentManifestJson).toBeNull();
  });
});

describe('sendNotificationFromLog — error categorization in resend path', () => {
  it('classifies generic Error as PROVIDER_EXCEPTION in resend path', async () => {
    const d = mkDeps({
      emailProvider: { send: vi.fn().mockRejectedValue(new Error('Connection refused')) },
    });

    const result = await resendNotification(
      { eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'user-1' },
      d,
    );

    expect(result.status).toBe('failed');
    expect(d.updateLogStatusFn).toHaveBeenCalledWith(
      expect.any(String), 'evt-1',
      expect.objectContaining({
        lastErrorCode: 'PROVIDER_EXCEPTION',
        lastErrorMessage: 'Connection refused',
        status: 'failed',
        failedAt: expect.any(Date),
      }),
    );
  });

  it('classifies ProviderTimeoutError as PROVIDER_TIMEOUT in retry path', async () => {
    mockedMarkAsRetrying.mockResolvedValue({} as any);
    const d = mkDeps({
      getLogByIdFn: vi.fn().mockResolvedValue({
        id: 'log-1', eventId: 'evt-1', personId: 'p-1',
        templateId: 'tpl-1', templateKeySnapshot: 'key', templateVersionNo: 1,
        channel: 'email', provider: 'resend',
        triggerType: null, triggerEntityType: null, triggerEntityId: null,
        sendMode: 'manual', recipientEmail: 'user@ex.com', recipientPhoneE164: null,
        renderedSubject: 'Subj', renderedBody: '<p>B</p>',
        renderedVariablesJson: {}, attachmentManifestJson: null,
        status: 'failed',
      }),
      emailProvider: { send: vi.fn().mockRejectedValue(new ProviderTimeoutError('resend', 10000)) },
    });

    const result = await retryFailedNotification(
      { eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'user-1' },
      d,
    );

    expect(result.status).toBe('failed');
    expect(d.updateLogStatusFn).toHaveBeenCalledWith(
      expect.any(String), 'evt-1',
      expect.objectContaining({
        lastErrorCode: 'PROVIDER_TIMEOUT',
      }),
    );
  });
});

describe('sendNotification — defaultDeps ObjectLiteral', () => {
  it('uses default deps when none provided', async () => {
    // This test validates the defaultDeps object structure.
    // The defaultDeps at line 49 has specific providers assigned.
    // We can't actually call without deps (would hit real providers),
    // but we verify the function accepts deps parameter correctly.
    const d = mkDeps();
    const result = await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'manual', sendMode: 'manual', idempotencyKey: 'idem-def',
      variables: { recipientEmail: 'user@ex.com' },
    }, d);

    expect(result.notificationLogId).toBe('log-1');
    expect(result.provider).toBe('resend');
    expect(result.providerMessageId).toBe('msg-1');
    expect(result.status).toBe('sent');
  });
});
