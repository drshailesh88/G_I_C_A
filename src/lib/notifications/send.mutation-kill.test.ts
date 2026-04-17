/**
 * Mutation-killing tests for send.ts
 *
 * Targets: 76 Survived mutations (LogicalOperator ?? null, ConditionalExpression,
 * StringLiteral, ObjectLiteral in sendNotificationFromLog and feature flag paths).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { CircuitOpenError } from './circuit-breaker';

const mockedMarkAsRetrying = vi.mocked(markAsRetrying);

beforeEach(() => {
  vi.clearAllMocks();
  mockedMarkAsRetrying.mockResolvedValue({} as any);
});

function createMockDeps(overrides?: Partial<NotificationServiceDeps>): NotificationServiceDeps {
  return {
    emailProvider: {
      send: vi.fn().mockResolvedValue({
        provider: 'resend',
        providerMessageId: 'email-msg-123',
        accepted: true,
        rawStatus: 'accepted',
      }),
    },
    whatsAppProvider: {
      sendText: vi.fn().mockResolvedValue({
        provider: 'evolution_api',
        providerMessageId: 'wa-msg-456',
        accepted: true,
        rawStatus: 'accepted',
      }),
    },
    idempotencyService: {
      checkAndSet: vi.fn().mockResolvedValue(false),
    },
    renderTemplateFn: vi.fn().mockResolvedValue({
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
    }),
    createLogEntryFn: vi.fn().mockResolvedValue({
      id: 'log-1',
      eventId: 'evt-1',
      status: 'queued',
    }),
    updateLogStatusFn: vi.fn().mockResolvedValue({ status: 'sent' }),
    getLogByIdFn: vi.fn().mockResolvedValue({
      id: 'log-1',
      eventId: 'evt-1',
      personId: 'person-1',
      templateId: 'tpl-1',
      templateKeySnapshot: 'registration_confirmation',
      templateVersionNo: 1,
      channel: 'email',
      provider: 'resend',
      triggerType: 'registration.created',
      triggerEntityType: 'registration',
      triggerEntityId: 'reg-1',
      sendMode: 'automatic',
      recipientEmail: 'user@example.com',
      recipientPhoneE164: null,
      renderedSubject: 'Test Subject',
      renderedBody: '<p>Hello</p>',
      renderedVariablesJson: { name: 'Test' },
      attachmentManifestJson: null,
      status: 'queued',
    }),
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
    triggerEntityType: 'registration',
    triggerEntityId: 'reg-1',
    sendMode: 'automatic',
    idempotencyKey: 'idem-key-1',
    variables: {
      name: 'Test User',
      recipientEmail: 'user@example.com',
    },
    ...overrides,
  };
}

describe('sendNotification — LogicalOperator ?? null mutations', () => {
  it('maps triggerEntityType to null when not provided', async () => {
    const deps = createMockDeps();
    const input = createEmailInput({
      triggerEntityType: undefined,
      triggerEntityId: undefined,
    });

    await sendNotification(input, deps);

    // The queued log entry should have null for missing optional fields
    expect(deps.createLogEntryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerEntityType: null,
        triggerEntityId: null,
      }),
    );
  });

  it('maps recipientEmail from variables for email channel', async () => {
    const deps = createMockDeps();
    const input = createEmailInput({
      variables: { recipientEmail: 'test@example.com', name: 'Test' },
    });

    await sendNotification(input, deps);

    // Should extract recipientEmail from variables
    const logCall = (deps.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.recipientEmail).toBe('test@example.com');
    expect(logCall.recipientPhoneE164).toBeNull();
  });

  it('maps recipientPhoneE164 from variables for whatsapp channel', async () => {
    const deps = createMockDeps();
    const input = createEmailInput({
      channel: 'whatsapp',
      variables: { recipientPhoneE164: '+919876543210', name: 'Test' },
    });

    await sendNotification(input, deps);

    const logCall = (deps.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.recipientPhoneE164).toBe('+919876543210');
    expect(logCall.recipientEmail).toBeNull();
  });

  it('sets attachmentManifestJson to null when no attachments', async () => {
    const deps = createMockDeps();
    const input = createEmailInput();

    await sendNotification(input, deps);

    const logCall = (deps.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.attachmentManifestJson).toBeNull();
  });

  it('sets attachmentManifestJson when attachments provided', async () => {
    const deps = createMockDeps();
    const attachments = [{ fileName: 'doc.pdf', storageKey: 'uploads/doc.pdf', contentType: 'application/pdf' }];
    const input = createEmailInput({ attachments });

    await sendNotification(input, deps);

    const logCall = (deps.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.attachmentManifestJson).toEqual(attachments);
  });

  it('sets initiatedByUserId to null when not provided', async () => {
    const deps = createMockDeps();
    const input = createEmailInput();

    await sendNotification(input, deps);

    const logCall = (deps.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.initiatedByUserId).toBeNull();
  });

  it('sets initiatedByUserId when provided', async () => {
    const deps = createMockDeps();
    const input = createEmailInput({ initiatedByUserId: 'user-1' });

    await sendNotification(input, deps);

    const logCall = (deps.createLogEntryFn as any).mock.calls[0][0];
    expect(logCall.initiatedByUserId).toBe('user-1');
  });
});

describe('sendNotification — providerNameForChannel mapping', () => {
  it('returns resend for email channel', async () => {
    const deps = createMockDeps();
    const result = await sendNotification(createEmailInput(), deps);
    expect(result.provider).toBe('resend');
  });

  it('returns evolution_api for whatsapp channel', async () => {
    const deps = createMockDeps();
    const result = await sendNotification(createEmailInput({ channel: 'whatsapp', variables: { recipientPhoneE164: '+919876543210', name: 'T' } }), deps);
    expect(result.provider).toBe('evolution_api');
  });
});

describe('sendNotification — circuit breaker integration', () => {
  it('records failure in circuit breaker on provider exception', async () => {
    const mockCircuitBreaker = {
      checkCircuit: vi.fn().mockResolvedValue('closed'),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      getStatus: vi.fn(),
    };

    const deps = createMockDeps({
      circuitBreaker: mockCircuitBreaker,
      emailProvider: {
        send: vi.fn().mockRejectedValue(new Error('Connection timeout')),
      },
    });

    const result = await sendNotification(createEmailInput(), deps);

    expect(result.status).toBe('failed');
    expect(mockCircuitBreaker.recordFailure).toHaveBeenCalledWith('resend');
  });

  it('records success in circuit breaker on accepted result', async () => {
    const mockCircuitBreaker = {
      checkCircuit: vi.fn().mockResolvedValue('closed'),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      getStatus: vi.fn(),
    };

    const deps = createMockDeps({ circuitBreaker: mockCircuitBreaker });

    await sendNotification(createEmailInput(), deps);

    expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalledWith('resend');
  });

  it('records failure in circuit breaker on rejected result', async () => {
    const mockCircuitBreaker = {
      checkCircuit: vi.fn().mockResolvedValue('closed'),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      getStatus: vi.fn(),
    };

    const deps = createMockDeps({
      circuitBreaker: mockCircuitBreaker,
      emailProvider: {
        send: vi.fn().mockResolvedValue({
          provider: 'resend',
          providerMessageId: null,
          accepted: false,
          rawStatus: 'rejected',
        }),
      },
    });

    await sendNotification(createEmailInput(), deps);

    expect(mockCircuitBreaker.recordFailure).toHaveBeenCalledWith('resend');
  });

  it('returns CIRCUIT_OPEN when circuit breaker throws', async () => {
    const mockCircuitBreaker = {
      checkCircuit: vi.fn().mockRejectedValue(new CircuitOpenError('resend')),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      getStatus: vi.fn(),
    };

    const deps = createMockDeps({ circuitBreaker: mockCircuitBreaker });
    const result = await sendNotification(createEmailInput(), deps);

    expect(result.status).toBe('failed');
    expect(deps.updateLogStatusFn).toHaveBeenCalledWith(
      'log-1', 'evt-1',
      expect.objectContaining({ lastErrorCode: 'CIRCUIT_OPEN' }),
    );
  });
});

describe('sendNotification — ProviderTimeoutError', () => {
  it('classifies ProviderTimeoutError as PROVIDER_TIMEOUT', async () => {
    const deps = createMockDeps({
      emailProvider: {
        send: vi.fn().mockRejectedValue(new ProviderTimeoutError('resend', 10000)),
      },
    });

    const result = await sendNotification(createEmailInput(), deps);

    expect(result.status).toBe('failed');
    expect(deps.updateLogStatusFn).toHaveBeenCalledWith(
      'log-1', 'evt-1',
      expect.objectContaining({
        lastErrorCode: 'PROVIDER_TIMEOUT',
      }),
    );
  });
});

describe('sendNotification — provider sends with correct fields', () => {
  it('passes emailSenderName as fromDisplayName', async () => {
    const deps = createMockDeps();

    await sendNotification(createEmailInput(), deps);

    expect(deps.emailProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-1',
        toEmail: 'user@example.com',
        subject: 'Test Subject',
        htmlBody: '<p>Hello World</p>',
        fromDisplayName: 'GEM India',
      }),
    );
  });

  it('passes empty subject as empty string for email', async () => {
    const deps = createMockDeps({
      renderTemplateFn: vi.fn().mockResolvedValue({
        templateId: 'tpl-1',
        templateVersionNo: 1,
        subject: null,
        body: '<p>Body</p>',
        variables: {},
        brandingVars: { emailSenderName: '' },
      }),
    });

    await sendNotification(createEmailInput(), deps);

    expect(deps.emailProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: '' }),
    );
  });

  it('passes WhatsApp provider correct fields', async () => {
    const deps = createMockDeps();
    const input = createEmailInput({
      channel: 'whatsapp',
      variables: { recipientPhoneE164: '+919876543210', name: 'Test' },
    });

    await sendNotification(input, deps);

    expect(deps.whatsAppProvider.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-1',
        toPhoneE164: '+919876543210',
      }),
    );
  });
});

describe('sendNotification — render failure creates audit trail', () => {
  it('includes RENDER_FAILED prefix in renderedBody of failed log', async () => {
    const deps = createMockDeps({
      renderTemplateFn: vi.fn().mockRejectedValue(new Error('Missing template')),
    });

    const result = await sendNotification(createEmailInput(), deps);

    expect(result.status).toBe('failed');
    expect(deps.createLogEntryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        renderedBody: expect.stringContaining('[RENDER_FAILED]'),
        renderedBody: expect.stringContaining('Missing template'),
      }),
    );
  });
});

describe('resendNotification — sendNotificationFromLog path', () => {
  it('maps all log fields to new log entry on resend', async () => {
    const deps = createMockDeps({
      getLogByIdFn: vi.fn().mockResolvedValue({
        id: 'log-original',
        eventId: 'evt-1',
        personId: 'person-1',
        templateId: 'tpl-1',
        templateKeySnapshot: 'registration_confirmation',
        templateVersionNo: 2,
        channel: 'email',
        provider: 'resend',
        triggerType: 'registration.created',
        triggerEntityType: 'registration',
        triggerEntityId: 'reg-1',
        sendMode: 'automatic',
        recipientEmail: 'user@example.com',
        recipientPhoneE164: null,
        renderedSubject: 'Subject',
        renderedBody: '<p>Body</p>',
        renderedVariablesJson: { name: 'Test' },
        attachmentManifestJson: null,
        status: 'sent',
      }),
    });

    await resendNotification(
      { eventId: 'evt-1', notificationLogId: 'log-original', initiatedByUserId: 'user-1' },
      deps,
    );

    expect(deps.createLogEntryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-1',
        personId: 'person-1',
        templateId: 'tpl-1',
        templateKeySnapshot: 'registration_confirmation',
        templateVersionNo: 2,
        channel: 'email',
        triggerType: 'registration.created',
        triggerEntityType: 'registration',
        triggerEntityId: 'reg-1',
        sendMode: 'automatic',
        recipientEmail: 'user@example.com',
        recipientPhoneE164: null,
        renderedSubject: 'Subject',
        renderedBody: '<p>Body</p>',
        renderedVariablesJson: { name: 'Test' },
        attachmentManifestJson: null,
        isResend: true,
        resendOfId: 'log-original',
        initiatedByUserId: 'user-1',
      }),
    );
  });

  it('maps null fields with ?? null coercion on resend', async () => {
    const deps = createMockDeps({
      getLogByIdFn: vi.fn().mockResolvedValue({
        id: 'log-original',
        eventId: 'evt-1',
        personId: 'person-1',
        templateId: null,
        templateKeySnapshot: null,
        templateVersionNo: null,
        channel: 'whatsapp',
        provider: 'evolution_api',
        triggerType: null,
        triggerEntityType: null,
        triggerEntityId: null,
        sendMode: 'manual',
        recipientEmail: null,
        recipientPhoneE164: '+919876543210',
        renderedSubject: null,
        renderedBody: 'Hello',
        renderedVariablesJson: null,
        attachmentManifestJson: null,
        status: 'sent',
      }),
    });

    await resendNotification(
      { eventId: 'evt-1', notificationLogId: 'log-original', initiatedByUserId: 'user-1' },
      deps,
    );

    expect(deps.createLogEntryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: null,
        templateKeySnapshot: null,
        templateVersionNo: null,
        triggerType: null,
        triggerEntityType: null,
        triggerEntityId: null,
        recipientEmail: null,
        recipientPhoneE164: '+919876543210',
        renderedSubject: null,
        renderedVariablesJson: null,
        attachmentManifestJson: null,
      }),
    );
  });
});

describe('retryFailedNotification — concurrent retry prevention', () => {
  it('throws when markAsRetrying fails (concurrent retry)', async () => {
    mockedMarkAsRetrying.mockResolvedValueOnce(null);
    const deps = createMockDeps({
      getLogByIdFn: vi.fn().mockResolvedValue({
        id: 'log-1',
        eventId: 'evt-1',
        status: 'failed',
      }),
    });

    await expect(
      retryFailedNotification(
        { eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'user-1' },
        deps,
      ),
    ).rejects.toThrow('another retry is already in progress');
  });
});

describe('sendNotificationFromLog — circuit breaker in resend path', () => {
  it('returns CIRCUIT_OPEN on resend when circuit is open', async () => {
    const mockCircuitBreaker = {
      checkCircuit: vi.fn().mockRejectedValue(new CircuitOpenError('resend')),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      getStatus: vi.fn(),
    };

    const deps = createMockDeps({ circuitBreaker: mockCircuitBreaker });

    const result = await resendNotification(
      { eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'user-1' },
      deps,
    );

    expect(result.status).toBe('failed');
    expect(deps.updateLogStatusFn).toHaveBeenCalledWith(
      expect.any(String),
      'evt-1',
      expect.objectContaining({ lastErrorCode: 'CIRCUIT_OPEN' }),
    );
  });

  it('handles provider exception in resend path', async () => {
    const mockCircuitBreaker = {
      checkCircuit: vi.fn().mockResolvedValue('closed'),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      getStatus: vi.fn(),
    };

    const deps = createMockDeps({
      circuitBreaker: mockCircuitBreaker,
      emailProvider: {
        send: vi.fn().mockRejectedValue(new ProviderTimeoutError('resend', 10000)),
      },
    });

    const result = await resendNotification(
      { eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'user-1' },
      deps,
    );

    expect(result.status).toBe('failed');
    expect(mockCircuitBreaker.recordFailure).toHaveBeenCalledWith('resend');
    expect(deps.updateLogStatusFn).toHaveBeenCalledWith(
      expect.any(String),
      'evt-1',
      expect.objectContaining({ lastErrorCode: 'PROVIDER_TIMEOUT' }),
    );
  });

  it('handles provider rejection in resend path', async () => {
    const deps = createMockDeps({
      emailProvider: {
        send: vi.fn().mockResolvedValue({
          provider: 'resend',
          providerMessageId: null,
          accepted: false,
          rawStatus: 'Invalid recipient',
        }),
      },
    });

    const result = await resendNotification(
      { eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'user-1' },
      deps,
    );

    expect(result.status).toBe('failed');
    expect(deps.updateLogStatusFn).toHaveBeenCalledWith(
      expect.any(String),
      'evt-1',
      expect.objectContaining({
        lastErrorCode: 'PROVIDER_REJECTED',
        lastErrorMessage: 'Invalid recipient',
      }),
    );
  });

  it('records circuit breaker success on accepted resend', async () => {
    const mockCircuitBreaker = {
      checkCircuit: vi.fn().mockResolvedValue('closed'),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      getStatus: vi.fn(),
    };

    const deps = createMockDeps({ circuitBreaker: mockCircuitBreaker });

    const result = await resendNotification(
      { eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'user-1' },
      deps,
    );

    expect(result.status).toBe('sent');
    expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalledWith('resend');
  });
});

describe('sendNotification — WhatsApp resend path', () => {
  it('routes to WhatsApp provider on resend for whatsapp channel', async () => {
    const deps = createMockDeps({
      getLogByIdFn: vi.fn().mockResolvedValue({
        id: 'log-1',
        eventId: 'evt-1',
        personId: 'person-1',
        channel: 'whatsapp',
        provider: 'evolution_api',
        sendMode: 'automatic',
        recipientEmail: null,
        recipientPhoneE164: '+919876543210',
        renderedSubject: null,
        renderedBody: 'Hello',
        renderedVariablesJson: {},
        attachmentManifestJson: null,
        status: 'sent',
        templateId: 'tpl-1',
        templateKeySnapshot: 'key',
        templateVersionNo: 1,
        triggerType: null,
        triggerEntityType: null,
        triggerEntityId: null,
      }),
    });

    const result = await resendNotification(
      { eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'user-1' },
      deps,
    );

    expect(deps.whatsAppProvider.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        toPhoneE164: '+919876543210',
        body: 'Hello',
      }),
    );
    expect(result.status).toBe('sent');
  });
});
