/**
 * Mutation-killing tests Round 3 for send.ts
 *
 * Targets: 49 Survived — exact value assertions on ALL three
 * createLogEntry code paths and sendNotificationFromLog.
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

import { markAsRetrying } from './log-queries';
import { sendNotification, resendNotification, retryFailedNotification } from './send';
import type { NotificationServiceDeps } from './send';
import { ProviderTimeoutError } from './timeout';

const mockedMarkAsRetrying = vi.mocked(markAsRetrying);

beforeEach(() => {
  vi.clearAllMocks();
  mockedMarkAsRetrying.mockResolvedValue({} as any);
});

function deps(overrides?: Partial<NotificationServiceDeps>): NotificationServiceDeps {
  return {
    emailProvider: { send: vi.fn().mockResolvedValue({ provider: 'resend', providerMessageId: 'msg-1', accepted: true, rawStatus: 'accepted' }) },
    whatsAppProvider: { sendText: vi.fn().mockResolvedValue({ provider: 'evolution_api', providerMessageId: 'wa-1', accepted: true, rawStatus: 'accepted' }) },
    idempotencyService: { checkAndSet: vi.fn().mockResolvedValue(false) },
    renderTemplateFn: vi.fn().mockResolvedValue({ templateId: 'tpl-1', templateVersionNo: 1, subject: 'Subj', body: '<p>Body</p>', variables: { name: 'T' }, brandingVars: { logoUrl: '', headerImageUrl: '', primaryColor: '#1E40AF', secondaryColor: '#9333EA', emailSenderName: '', emailFooterText: '', whatsappPrefix: '' } }),
    createLogEntryFn: vi.fn().mockResolvedValue({ id: 'log-1', eventId: 'evt-1', status: 'queued' }),
    updateLogStatusFn: vi.fn().mockResolvedValue({ status: 'sent' }),
    getLogByIdFn: vi.fn().mockResolvedValue({ id: 'log-1', eventId: 'evt-1', personId: 'p-1', templateId: 'tpl-1', templateKeySnapshot: 'key', templateVersionNo: 1, channel: 'email', provider: 'resend', triggerType: 'reg.created', triggerEntityType: 'registration', triggerEntityId: 'reg-1', sendMode: 'automatic', recipientEmail: 'user@ex.com', recipientPhoneE164: null, renderedSubject: 'Subj', renderedBody: '<p>B</p>', renderedVariablesJson: {}, attachmentManifestJson: null, status: 'queued' }),
    ...overrides,
  };
}

describe('sendNotification — render error path exact values', () => {
  it('records exact email recipient fields in failed log on render error', async () => {
    const d = deps({ renderTemplateFn: vi.fn().mockRejectedValue(new Error('Template missing')) });
    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'reg.created', triggerEntityType: 'registration', triggerEntityId: 'reg-1',
      sendMode: 'automatic', idempotencyKey: 'idem-1',
      variables: { recipientEmail: 'test@x.com', name: 'Test' },
      initiatedByUserId: 'user-1',
    }, d);

    const logCall = (d.createLogEntryFn as any).mock.calls[0][0];
    // Exact field assertions to kill LogicalOperator ?? null mutations
    expect(logCall.triggerEntityType).toBe('registration');
    expect(logCall.triggerEntityId).toBe('reg-1');
    expect(logCall.recipientEmail).toBe('test@x.com');
    expect(logCall.recipientPhoneE164).toBeNull();
    expect(logCall.initiatedByUserId).toBe('user-1');
    expect(logCall.renderedBody).toContain('[RENDER_FAILED]');
    expect(logCall.renderedBody).toContain('Template missing');
    expect(logCall.status).toBe('failed');
    expect(logCall.renderedSubject).toBeNull();
    expect(logCall.templateId).toBeNull();
    expect(logCall.templateVersionNo).toBeNull();
  });

  it('records whatsapp recipient in failed log on render error', async () => {
    const d = deps({ renderTemplateFn: vi.fn().mockRejectedValue(new Error('Bad')) });
    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'whatsapp', templateKey: 'key',
      triggerType: null as any, sendMode: 'manual', idempotencyKey: 'idem-2',
      variables: { recipientPhoneE164: '+919876543210', name: 'T' },
    }, d);

    const logCall = (d.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.recipientEmail).toBeNull();
    expect(logCall.recipientPhoneE164).toBe('+919876543210');
    expect(logCall.provider).toBe('evolution_api');
    expect(logCall.initiatedByUserId).toBeNull();
    expect(logCall.triggerEntityType).toBeNull();
    expect(logCall.triggerEntityId).toBeNull();
  });

  it('handles non-Error thrown during render', async () => {
    const d = deps({ renderTemplateFn: vi.fn().mockRejectedValue('string error') });
    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'x', sendMode: 'manual', idempotencyKey: 'idem-3',
      variables: { recipientEmail: 'e@x.com' },
    }, d);

    const logCall = (d.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.renderedBody).toContain('string error');
  });
});

describe('sendNotification — normal path exact field values', () => {
  it('populates queued log with all rendered template data', async () => {
    const d = deps();
    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'registration_confirmation',
      triggerType: 'reg.created', triggerEntityType: 'registration', triggerEntityId: 'reg-1',
      sendMode: 'automatic', idempotencyKey: 'idem-1',
      variables: { recipientEmail: 'user@ex.com', name: 'T' },
      attachments: [{ fileName: 'f.pdf', storageKey: 'k', contentType: 'application/pdf' }],
      initiatedByUserId: 'admin-1',
    }, d);

    // The QUEUED log entry (second call, after render succeeds)
    const logCalls = (d.createLogEntryFn as any).mock.calls;
    const queuedLog = logCalls[0][0];
    expect(queuedLog.templateId).toBe('tpl-1');
    expect(queuedLog.templateVersionNo).toBe(1);
    expect(queuedLog.renderedSubject).toBe('Subj');
    expect(queuedLog.renderedBody).toBe('<p>Body</p>');
    expect(queuedLog.renderedVariablesJson).toEqual({ name: 'T' });
    expect(queuedLog.recipientEmail).toBe('user@ex.com');
    expect(queuedLog.recipientPhoneE164).toBeNull();
    expect(queuedLog.triggerEntityType).toBe('registration');
    expect(queuedLog.triggerEntityId).toBe('reg-1');
    expect(queuedLog.attachmentManifestJson).toEqual([{ fileName: 'f.pdf', storageKey: 'k', contentType: 'application/pdf' }]);
    expect(queuedLog.initiatedByUserId).toBe('admin-1');
    expect(queuedLog.status).toBe('queued');
  });

  it('sends email with correct subject from rendered template', async () => {
    const d = deps();
    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'x', sendMode: 'manual', idempotencyKey: 'k',
      variables: { recipientEmail: 'e@x.com' },
    }, d);

    expect(d.emailProvider.send).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Subj',
      htmlBody: '<p>Body</p>',
      toEmail: 'e@x.com',
    }));
  });
});

describe('sendNotification — update log on provider rejection with rawStatus fallback', () => {
  it('uses rawStatus when provider gives one', async () => {
    const d = deps({
      emailProvider: { send: vi.fn().mockResolvedValue({ provider: 'resend', providerMessageId: null, accepted: false, rawStatus: 'Invalid email' }) },
    });
    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'x', sendMode: 'manual', idempotencyKey: 'k',
      variables: { recipientEmail: 'bad@x.com' },
    }, d);

    expect(d.updateLogStatusFn).toHaveBeenCalledWith('log-1', 'evt-1', expect.objectContaining({
      lastErrorMessage: 'Invalid email',
    }));
  });

  it('uses fallback message when rawStatus is null', async () => {
    const d = deps({
      emailProvider: { send: vi.fn().mockResolvedValue({ provider: 'resend', providerMessageId: null, accepted: false, rawStatus: null }) },
    });
    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'x', sendMode: 'manual', idempotencyKey: 'k',
      variables: { recipientEmail: 'bad@x.com' },
    }, d);

    expect(d.updateLogStatusFn).toHaveBeenCalledWith('log-1', 'evt-1', expect.objectContaining({
      lastErrorMessage: expect.stringContaining('rejected'),
    }));
  });
});

describe('sendNotification — idempotency duplicate exact log update', () => {
  it('updates log with exact IDEMPOTENCY_DUPLICATE message', async () => {
    const d = deps({ idempotencyService: { checkAndSet: vi.fn().mockResolvedValue(true) } });
    await sendNotification({
      eventId: 'evt-1', personId: 'p-1', channel: 'email', templateKey: 'key',
      triggerType: 'x', sendMode: 'manual', idempotencyKey: 'k',
      variables: { recipientEmail: 'e@x.com' },
    }, d);

    expect(d.updateLogStatusFn).toHaveBeenCalledWith('log-1', 'evt-1', expect.objectContaining({
      lastErrorCode: 'IDEMPOTENCY_DUPLICATE',
      lastErrorMessage: expect.stringContaining('Duplicate'),
    }));
  });
});

describe('sendNotificationFromLog — resend path rawStatus fallback', () => {
  it('uses rawStatus on rejection in resend path', async () => {
    const d = deps({
      emailProvider: { send: vi.fn().mockResolvedValue({ provider: 'resend', providerMessageId: null, accepted: false, rawStatus: 'Blocked' }) },
    });
    await resendNotification({ eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'u-1' }, d);

    expect(d.updateLogStatusFn).toHaveBeenCalledWith(expect.any(String), 'evt-1', expect.objectContaining({
      lastErrorMessage: 'Blocked',
    }));
  });

  it('uses fallback message on null rawStatus in resend path', async () => {
    const d = deps({
      emailProvider: { send: vi.fn().mockResolvedValue({ provider: 'resend', providerMessageId: null, accepted: false, rawStatus: null }) },
    });
    await resendNotification({ eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'u-1' }, d);

    expect(d.updateLogStatusFn).toHaveBeenCalledWith(expect.any(String), 'evt-1', expect.objectContaining({
      lastErrorMessage: expect.stringContaining('rejected'),
    }));
  });

  it('sets isResend=false for retry path', async () => {
    const d = deps({ getLogByIdFn: vi.fn().mockResolvedValue({ id: 'log-1', eventId: 'evt-1', personId: 'p-1', status: 'failed', channel: 'email', provider: 'resend', sendMode: 'manual', recipientEmail: 'e@x.com', recipientPhoneE164: null, renderedSubject: 'S', renderedBody: 'B', renderedVariablesJson: {}, templateId: 'tpl-1', templateKeySnapshot: 'key', templateVersionNo: 1, triggerType: null, triggerEntityType: null, triggerEntityId: null, attachmentManifestJson: null }) });
    await retryFailedNotification({ eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'u-1' }, d);

    expect(d.createLogEntryFn).toHaveBeenCalledWith(expect.objectContaining({
      isResend: false,
      resendOfId: 'log-1',
    }));
  });
});
