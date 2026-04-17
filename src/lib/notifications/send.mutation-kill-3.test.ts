/**
 * Mutation-killing tests Round 3 for send.ts
 *
 * Targets remaining survivors: feature flag path exact values,
 * sendNotificationFromLog attachment handling, circuit breaker
 * interactions in both paths, provider rejection messages.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({ notificationTemplates: {}, notificationLog: {} }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn(), isNull: vi.fn(), desc: vi.fn() }));
vi.mock('./template-renderer', () => ({ renderTemplate: vi.fn(), resolveTemplate: vi.fn(), interpolate: vi.fn(), validateRequiredVariables: vi.fn() }));
vi.mock('./log-queries', () => ({ beginLogAttempt: vi.fn(), createLogEntry: vi.fn(), updateLogStatus: vi.fn(), getLogById: vi.fn(), listFailedLogs: vi.fn(), markAsRetrying: vi.fn(), upsertLogEntry: vi.fn() }));
vi.mock('./email', () => ({ resendEmailProvider: { send: vi.fn() } }));
vi.mock('./whatsapp', () => ({ evolutionWhatsAppProvider: { sendText: vi.fn() } }));
vi.mock('./idempotency', () => ({ redisIdempotencyService: { checkAndSet: vi.fn() } }));
vi.mock('@/lib/sentry', () => ({ captureNotificationError: vi.fn() }));
vi.mock('@/lib/flags', () => ({
  isChannelEnabled: vi.fn().mockResolvedValue(true),
}));

import { markAsRetrying } from './log-queries';
import { sendNotification, resendNotification, retryFailedNotification } from './send';
import type { NotificationServiceDeps } from './send';
import { isChannelEnabled } from '@/lib/flags';

const mockedMarkAsRetrying = vi.mocked(markAsRetrying);
const mockedIsChannelEnabled = vi.mocked(isChannelEnabled);

beforeEach(() => {
  vi.clearAllMocks();
  mockedMarkAsRetrying.mockResolvedValue({} as any);
  mockedIsChannelEnabled.mockResolvedValue(true);
});

function deps(overrides?: Partial<NotificationServiceDeps>): NotificationServiceDeps {
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

describe('sendNotification — feature flag disabled path', () => {
  it('creates skip log with CHANNEL_DISABLED body and sent status', async () => {
    mockedIsChannelEnabled.mockResolvedValue(false);
    const d = deps();

    const result = await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'manual', sendMode: 'manual', idempotencyKey: 'idem-ff',
      variables: { recipientEmail: 'user@ex.com' },
    }, d);

    expect(result.status).toBe('sent');
    expect(result.providerMessageId).toBeNull();

    const logCall = (d.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.status).toBe('sent');
    expect(logCall.renderedBody).toContain('[CHANNEL_DISABLED]');
    expect(logCall.renderedBody).toContain('email');
    expect(logCall.provider).toBe('resend');
    expect(logCall.channel).toBe('email');
  });

  it('creates skip log with WhatsApp channel disabled', async () => {
    mockedIsChannelEnabled.mockResolvedValue(false);
    const d = deps();

    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'whatsapp', templateKey: 'key',
      triggerType: 'manual', sendMode: 'manual', idempotencyKey: 'idem-ff-wa',
      variables: { recipientPhoneE164: '+919876543210' },
    }, d);

    const logCall = (d.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.provider).toBe('evolution_api');
    expect(logCall.recipientPhoneE164).toBe('+919876543210');
    expect(logCall.recipientEmail).toBeNull();
    expect(logCall.renderedBody).toContain('whatsapp');
  });

  it('proceeds when flag check throws (best-effort)', async () => {
    mockedIsChannelEnabled.mockRejectedValue(new Error('Redis down'));
    const d = deps();

    const result = await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'manual', sendMode: 'manual', idempotencyKey: 'idem-redis-down',
      variables: { recipientEmail: 'user@ex.com' },
    }, d);

    // Should proceed to send — flag check is best-effort
    expect(result.status).toBe('sent');
    expect(d.renderTemplateFn).toHaveBeenCalled();
  });
});

describe('sendNotification — idempotency duplicate path', () => {
  it('returns IDEMPOTENCY_DUPLICATE on duplicate send', async () => {
    const d = deps({
      idempotencyService: { checkAndSet: vi.fn().mockResolvedValue(true) },
    });

    const result = await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'manual', sendMode: 'manual', idempotencyKey: 'dup-key',
      variables: { recipientEmail: 'user@ex.com' },
    }, d);

    expect(result.status).toBe('sent');
    expect(d.updateLogStatusFn).toHaveBeenCalledWith(
      'log-1', 'evt-1',
      expect.objectContaining({
        status: 'sent',
        lastErrorCode: 'IDEMPOTENCY_DUPLICATE',
        lastErrorMessage: expect.stringContaining('Duplicate'),
      }),
    );
  });
});

describe('sendNotification — provider rejection update', () => {
  it('records PROVIDER_REJECTED with rawStatus from provider', async () => {
    const d = deps({
      emailProvider: { send: vi.fn().mockResolvedValue({
        provider: 'resend',
        providerMessageId: null,
        accepted: false,
        rawStatus: 'Mailbox does not exist',
      }) },
    });

    const result = await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'manual', sendMode: 'manual', idempotencyKey: 'idem-rej',
      variables: { recipientEmail: 'user@ex.com' },
    }, d);

    expect(result.status).toBe('failed');
    expect(d.updateLogStatusFn).toHaveBeenCalledWith(
      'log-1', 'evt-1',
      expect.objectContaining({
        lastErrorCode: 'PROVIDER_REJECTED',
        lastErrorMessage: 'Mailbox does not exist',
        failedAt: expect.any(Date),
      }),
    );
  });

  it('uses default message when rawStatus is null/undefined', async () => {
    const d = deps({
      emailProvider: { send: vi.fn().mockResolvedValue({
        provider: 'resend',
        providerMessageId: null,
        accepted: false,
        rawStatus: null,
      }) },
    });

    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'manual', sendMode: 'manual', idempotencyKey: 'idem-null',
      variables: { recipientEmail: 'user@ex.com' },
    }, d);

    expect(d.updateLogStatusFn).toHaveBeenCalledWith(
      'log-1', 'evt-1',
      expect.objectContaining({
        lastErrorMessage: 'Provider rejected the message',
      }),
    );
  });

  it('records sentAt on successful send', async () => {
    const d = deps();

    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'manual', sendMode: 'manual', idempotencyKey: 'idem-ok',
      variables: { recipientEmail: 'user@ex.com' },
    }, d);

    expect(d.updateLogStatusFn).toHaveBeenCalledWith(
      'log-1', 'evt-1',
      expect.objectContaining({
        status: 'sent',
        sentAt: expect.any(Date),
      }),
    );
  });
});

describe('sendNotificationFromLog — resend with attachments', () => {
  it('passes attachments to email provider on resend', async () => {
    const attachments = [{ fileName: 'doc.pdf', storageKey: 'uploads/doc.pdf', contentType: 'application/pdf' }];
    const d = deps({
      getLogByIdFn: vi.fn().mockResolvedValue({
        id: 'log-orig', eventId: 'evt-1', personId: 'p-1',
        templateId: 'tpl-1', templateKeySnapshot: 'key', templateVersionNo: 1,
        channel: 'email', provider: 'resend',
        triggerType: 'manual', triggerEntityType: null, triggerEntityId: null,
        sendMode: 'manual', recipientEmail: 'user@ex.com', recipientPhoneE164: null,
        renderedSubject: 'Subj', renderedBody: '<p>Body</p>',
        renderedVariablesJson: {}, attachmentManifestJson: attachments,
        status: 'sent',
      }),
    });

    await resendNotification(
      { eventId: 'evt-1', notificationLogId: 'log-orig', initiatedByUserId: 'user-1' },
      d,
    );

    expect(d.emailProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments,
      }),
    );
  });

  it('passes email fields with ?? fallback on resend', async () => {
    const d = deps({
      getLogByIdFn: vi.fn().mockResolvedValue({
        id: 'log-orig', eventId: 'evt-1', personId: 'p-1',
        templateId: null, templateKeySnapshot: null, templateVersionNo: null,
        channel: 'email', provider: 'resend',
        triggerType: null, triggerEntityType: null, triggerEntityId: null,
        sendMode: 'manual', recipientEmail: null, recipientPhoneE164: null,
        renderedSubject: null, renderedBody: '<p>B</p>',
        renderedVariablesJson: null, attachmentManifestJson: null,
        status: 'sent',
      }),
    });

    await resendNotification(
      { eventId: 'evt-1', notificationLogId: 'log-orig', initiatedByUserId: 'user-1' },
      d,
    );

    // Email provider should get empty strings for null fields
    expect(d.emailProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: '',
        subject: '',
        htmlBody: '<p>B</p>',
      }),
    );
  });
});

describe('retryFailedNotification — preconditions', () => {
  it('throws when notification is not in failed status', async () => {
    const d = deps({
      getLogByIdFn: vi.fn().mockResolvedValue({
        id: 'log-1', eventId: 'evt-1', status: 'sent',
      }),
    });

    await expect(
      retryFailedNotification(
        { eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'user-1' },
        d,
      ),
    ).rejects.toThrow('status is "sent", expected "failed"');
  });

  it('throws when notification not found', async () => {
    const d = deps({
      getLogByIdFn: vi.fn().mockResolvedValue(null),
    });

    await expect(
      retryFailedNotification(
        { eventId: 'evt-1', notificationLogId: 'log-missing', initiatedByUserId: 'user-1' },
        d,
      ),
    ).rejects.toThrow('not found');
  });
});

describe('resendNotification — preconditions', () => {
  it('throws when notification not found', async () => {
    const d = deps({
      getLogByIdFn: vi.fn().mockResolvedValue(null),
    });

    await expect(
      resendNotification(
        { eventId: 'evt-1', notificationLogId: 'log-missing', initiatedByUserId: 'user-1' },
        d,
      ),
    ).rejects.toThrow('not found');
  });
});

describe('sendNotificationFromLog — provider rejection default message', () => {
  it('uses default message on null rawStatus in resend path', async () => {
    const d = deps({
      emailProvider: { send: vi.fn().mockResolvedValue({
        provider: 'resend',
        providerMessageId: null,
        accepted: false,
        rawStatus: null,
      }) },
      getLogByIdFn: vi.fn().mockResolvedValue({
        id: 'log-1', eventId: 'evt-1', personId: 'p-1',
        templateId: 'tpl-1', templateKeySnapshot: 'key', templateVersionNo: 1,
        channel: 'email', provider: 'resend',
        triggerType: null, triggerEntityType: null, triggerEntityId: null,
        sendMode: 'manual', recipientEmail: 'user@ex.com', recipientPhoneE164: null,
        renderedSubject: 'Subj', renderedBody: '<p>B</p>',
        renderedVariablesJson: {}, attachmentManifestJson: null,
        status: 'sent',
      }),
    });

    await resendNotification(
      { eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'user-1' },
      d,
    );

    expect(d.updateLogStatusFn).toHaveBeenCalledWith(
      expect.any(String), 'evt-1',
      expect.objectContaining({
        lastErrorMessage: 'Provider rejected',
      }),
    );
  });
});
