import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB-dependent modules to avoid requiring DATABASE_URL in tests
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

const mockedMarkAsRetrying = vi.mocked(markAsRetrying);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: markAsRetrying succeeds (returns the row)
  mockedMarkAsRetrying.mockResolvedValue({} as Awaited<ReturnType<typeof markAsRetrying>>);
});

// ── Shared mocks ──────────────────────────────────────────────

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
    checkAndSet: vi.fn().mockResolvedValue(false), // not duplicate by default
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
      emailSenderName: '',
      emailFooterText: '',
      whatsappPrefix: '',
    },
  });

  const mockLogRow = createStoredLog();

  const mockCreateLogEntry = vi.fn().mockResolvedValue(mockLogRow);
  const mockUpdateLogStatus = vi.fn().mockResolvedValue({ ...mockLogRow, status: 'sent' });
  const mockGetLogById = vi.fn().mockResolvedValue(mockLogRow);

  return {
    emailProvider: mockEmailProvider,
    whatsAppProvider: mockWhatsAppProvider,
    idempotencyService: mockIdempotency,
    renderTemplateFn: mockRenderTemplate,
    createLogEntryFn: mockCreateLogEntry,
    updateLogStatusFn: mockUpdateLogStatus,
    getLogByIdFn: mockGetLogById,
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
    triggerEntityType: 'registration',
    triggerEntityId: 'reg-1',
    sendMode: 'automatic',
    idempotencyKey: 'idem-1',
    recipientEmail: 'user@example.com',
    recipientPhoneE164: null,
    renderedSubject: 'Test Subject',
    renderedBody: '<p>Hello World</p>',
    renderedVariablesJson: { name: 'Test' },
    attachmentManifestJson: null,
    status: 'queued',
    attempts: 1,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastAttemptAt: null,
    queuedAt: new Date(),
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    providerMessageId: null,
    providerConversationId: null,
    isResend: false,
    resendOfId: null,
    initiatedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe('sendNotification', () => {
  it('should complete the full email send flow', async () => {
    const deps = createMockDeps();
    const input = createEmailInput();

    const result = await sendNotification(input, deps);

    // Idempotency was checked
    expect(deps.idempotencyService.checkAndSet).toHaveBeenCalledWith('idem-key-1');

    // Template was rendered
    expect(deps.renderTemplateFn).toHaveBeenCalledWith({
      eventId: 'evt-1',
      channel: 'email',
      templateKey: 'registration_confirmation',
      variables: input.variables,
    });

    // Log was created
    expect(deps.createLogEntryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-1',
        personId: 'person-1',
        channel: 'email',
        provider: 'resend',
        status: 'queued',
      }),
    );

    // Email provider was called
    expect(deps.emailProvider.send).toHaveBeenCalled();

    // Log was updated with success
    expect(deps.updateLogStatusFn).toHaveBeenCalledWith(
      'log-1',
      'evt-1',
      expect.objectContaining({ status: 'sent' }),
    );

    // Result
    expect(result.notificationLogId).toBe('log-1');
    expect(result.status).toBe('sent');
    expect(result.provider).toBe('resend');
  });

  it('should complete the full WhatsApp send flow', async () => {
    const deps = createMockDeps();
    const input = createEmailInput({
      channel: 'whatsapp',
      variables: {
        recipientPhoneE164: '+919876543210',
        name: 'Test',
      },
    });

    const result = await sendNotification(input, deps);

    expect(deps.whatsAppProvider.sendText).toHaveBeenCalled();
    expect(result.status).toBe('sent');
    expect(result.provider).toBe('evolution_api');
  });

  it('should return early on duplicate idempotency key but still create audit log', async () => {
    const deps = createMockDeps({
      idempotencyService: {
        checkAndSet: vi.fn().mockResolvedValue(true), // duplicate
      },
    });
    const input = createEmailInput();

    const result = await sendNotification(input, deps);

    // FIX #1: Log row is created BEFORE idempotency check (audit trail)
    // but template is rendered and provider is NOT called
    expect(deps.renderTemplateFn).toHaveBeenCalled();
    expect(deps.createLogEntryFn).toHaveBeenCalled();
    expect(deps.emailProvider.send).not.toHaveBeenCalled();
    expect(result.status).toBe('sent');
    // Log row should be updated with duplicate detection marker
    expect(deps.updateLogStatusFn).toHaveBeenCalledWith(
      expect.any(String),
      input.eventId,
      expect.objectContaining({ status: 'sent', lastErrorCode: 'IDEMPOTENCY_DUPLICATE' }),
    );
  });

  it('should handle provider exception gracefully', async () => {
    const deps = createMockDeps({
      emailProvider: {
        send: vi.fn().mockRejectedValue(new Error('Connection timeout')),
      },
    });
    const input = createEmailInput();

    const result = await sendNotification(input, deps);

    expect(result.status).toBe('failed');
    expect(deps.updateLogStatusFn).toHaveBeenCalledWith(
      'log-1',
      'evt-1',
      expect.objectContaining({
        status: 'failed',
        lastErrorCode: 'PROVIDER_EXCEPTION',
        lastErrorMessage: 'Connection timeout',
      }),
    );
  });

  it('should handle provider rejection (accepted=false)', async () => {
    const deps = createMockDeps({
      emailProvider: {
        send: vi.fn().mockResolvedValue({
          provider: 'resend',
          providerMessageId: null,
          accepted: false,
          rawStatus: 'Invalid email address',
        }),
      },
    });
    const input = createEmailInput();

    const result = await sendNotification(input, deps);

    expect(result.status).toBe('failed');
    expect(deps.updateLogStatusFn).toHaveBeenCalledWith(
      'log-1',
      'evt-1',
      expect.objectContaining({
        status: 'failed',
        lastErrorCode: 'PROVIDER_REJECTED',
      }),
    );
  });

  it('should record failed log on template render error instead of throwing', async () => {
    // FIX #7: Template errors create a failed log row for audit trail
    const deps = createMockDeps({
      renderTemplateFn: vi.fn().mockRejectedValueOnce(new Error('template render failed')),
    });
    const input = createEmailInput();

    const result = await sendNotification(input, deps);

    expect(result.status).toBe('failed');
    expect(result.notificationLogId).toBeTruthy();
    // Provider should NOT be called
    expect(deps.emailProvider.send).not.toHaveBeenCalled();
    // A failed log entry should be created
    expect(deps.createLogEntryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        renderedBody: expect.stringContaining('RENDER_FAILED'),
      }),
    );
  });
});

describe('resendNotification', () => {
  it('should create a new send from an existing log', async () => {
    const deps = createMockDeps();

    const result = await resendNotification(
      {
        eventId: 'evt-1',
        notificationLogId: 'log-1',
        initiatedByUserId: 'user-1',
      },
      deps,
    );

    // Should have fetched the original log
    expect(deps.getLogByIdFn).toHaveBeenCalledWith('log-1', 'evt-1');

    // Should have created a new log entry with isResend=true
    expect(deps.createLogEntryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        isResend: true,
        resendOfId: 'log-1',
        initiatedByUserId: 'user-1',
      }),
    );

    expect(result.status).toBe('sent');
  });

  it('should preserve attachment manifests and resend attachments on resend attempts', async () => {
    const attachments = [
      {
        fileName: 'travel-itinerary.pdf',
        storageKey: 'uploads/evt-1/travel-itinerary.pdf',
        contentType: 'application/pdf',
      },
    ];
    const deps = createMockDeps({
      getLogByIdFn: vi.fn().mockResolvedValue(
        createStoredLog({
          attachmentManifestJson: attachments,
        }),
      ),
    });

    await resendNotification(
      {
        eventId: 'evt-1',
        notificationLogId: 'log-1',
        initiatedByUserId: 'user-1',
      },
      deps,
    );

    expect(deps.createLogEntryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentManifestJson: attachments,
      }),
    );
    expect(deps.emailProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments,
      }),
    );
  });

  it('should throw if original log not found', async () => {
    const deps = createMockDeps({
      getLogByIdFn: vi.fn().mockResolvedValue(null),
    });

    await expect(
      resendNotification(
        { eventId: 'evt-1', notificationLogId: 'nonexistent', initiatedByUserId: 'user-1' },
        deps,
      ),
    ).rejects.toThrow('not found');
  });
});

describe('retryFailedNotification', () => {
  it('should retry a failed notification', async () => {
    const deps = createMockDeps({
      getLogByIdFn: vi.fn().mockResolvedValue({
        id: 'log-1',
        eventId: 'evt-1',
        personId: 'person-1',
        status: 'failed',
        channel: 'email',
        provider: 'resend',
        sendMode: 'automatic',
        recipientEmail: 'user@example.com',
        recipientPhoneE164: null,
        renderedSubject: 'Test',
        renderedBody: '<p>Hello</p>',
        renderedVariablesJson: {},
        templateId: 'tpl-1',
        templateKeySnapshot: 'registration_confirmation',
        templateVersionNo: 1,
        triggerType: 'registration.created',
        triggerEntityType: 'registration',
        triggerEntityId: 'reg-1',
        idempotencyKey: 'old-key',
      }),
    });

    const result = await retryFailedNotification(
      { eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'user-1' },
      deps,
    );

    // FIX #8: Should have used atomic markAsRetrying instead of updateLogStatus
    expect(mockedMarkAsRetrying).toHaveBeenCalledWith('log-1', 'evt-1');

    expect(result.status).toBe('sent');
  });

  it('should use a fresh idempotency key for retry', async () => {
    const deps = createMockDeps({
      getLogByIdFn: vi.fn().mockResolvedValue(
        createStoredLog({ status: 'failed' }),
      ),
    });

    await retryFailedNotification(
      { eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'user-1' },
      deps,
    );

    // Retry creates a new log entry with a unique idempotency key
    expect(deps.createLogEntryFn).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^retry:log-1:/),
      }),
    );
  });

  it('should throw if notification is not in failed status', async () => {
    const deps = createMockDeps({
      getLogByIdFn: vi.fn().mockResolvedValue({
        id: 'log-1',
        eventId: 'evt-1',
        status: 'sent',
      }),
    });

    await expect(
      retryFailedNotification(
        { eventId: 'evt-1', notificationLogId: 'log-1', initiatedByUserId: 'user-1' },
        deps,
      ),
    ).rejects.toThrow('expected "failed"');
  });

  it('should throw if log not found', async () => {
    const deps = createMockDeps({
      getLogByIdFn: vi.fn().mockResolvedValue(null),
    });

    await expect(
      retryFailedNotification(
        { eventId: 'evt-1', notificationLogId: 'nonexistent', initiatedByUserId: 'user-1' },
        deps,
      ),
    ).rejects.toThrow('not found');
  });
});
