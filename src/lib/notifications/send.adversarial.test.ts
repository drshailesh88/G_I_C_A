import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBeginLogAttempt,
  mockUpsertLogEntry,
  mockCreateLogEntry,
  mockUpdateLogStatus,
  mockGetLogById,
  mockMarkAsRetrying,
  mockRenderTemplate,
  mockEmailSend,
  mockWhatsAppSend,
  mockCheckAndSet,
  mockIsChannelEnabled,
} = vi.hoisted(() => ({
  mockBeginLogAttempt: vi.fn(),
  mockUpsertLogEntry: vi.fn(),
  mockCreateLogEntry: vi.fn(),
  mockUpdateLogStatus: vi.fn(),
  mockGetLogById: vi.fn(),
  mockMarkAsRetrying: vi.fn(),
  mockRenderTemplate: vi.fn(),
  mockEmailSend: vi.fn(),
  mockWhatsAppSend: vi.fn(),
  mockCheckAndSet: vi.fn(),
  mockIsChannelEnabled: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({ notificationLog: {} }));
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn(),
}));
vi.mock('./log-queries', () => ({
  beginLogAttempt: mockBeginLogAttempt,
  upsertLogEntry: mockUpsertLogEntry,
  createLogEntry: mockCreateLogEntry,
  updateLogStatus: mockUpdateLogStatus,
  getLogById: mockGetLogById,
  markAsRetrying: mockMarkAsRetrying,
}));
vi.mock('./template-renderer', () => ({
  renderTemplate: mockRenderTemplate,
}));
vi.mock('./email', () => ({
  resendEmailProvider: { send: mockEmailSend },
}));
vi.mock('./whatsapp', () => ({
  evolutionWhatsAppProvider: { sendText: mockWhatsAppSend },
}));
vi.mock('./idempotency', () => ({
  buildIdempotencyKey: vi.fn(() => 'normalized-idempotency-key'),
  redisIdempotencyService: { checkAndSet: mockCheckAndSet },
}));
vi.mock('@/lib/flags', () => ({
  isChannelEnabled: mockIsChannelEnabled,
}));
vi.mock('@/lib/sentry', () => ({
  captureNotificationError: vi.fn(),
}));

import { sendNotification } from './send';

describe('sendNotification default hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateLogEntry.mockResolvedValue({
      id: 'log-1',
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'queued',
    });
    mockUpdateLogStatus.mockResolvedValue(null);
    mockGetLogById.mockResolvedValue(null);
    mockMarkAsRetrying.mockResolvedValue({});
    mockRenderTemplate.mockResolvedValue({
      templateId: 'tpl-1',
      templateVersionNo: 1,
      subject: 'Subject',
      body: '<p>Hello</p>',
      variables: { recipientEmail: 'user@example.com' },
      brandingVars: { emailSenderName: 'GEM India' },
    });
    mockEmailSend.mockResolvedValue({
      provider: 'resend',
      providerMessageId: 'msg-1',
      accepted: true,
      rawStatus: 'accepted',
    });
    mockWhatsAppSend.mockResolvedValue({
      provider: 'evolution_api',
      providerMessageId: 'wa-1',
      accepted: true,
      rawStatus: 'accepted',
    });
    mockCheckAndSet.mockResolvedValue(false);
    mockIsChannelEnabled.mockResolvedValue(true);
  });

  it('fails closed before provider send when beginLogAttempt detects a cross-event idempotency conflict', async () => {
    mockBeginLogAttempt.mockRejectedValueOnce(
      new Error('Notification idempotency key is already reserved by another event'),
    );

    await expect(
      sendNotification({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        personId: '550e8400-e29b-41d4-a716-446655440001',
        channel: 'email',
        templateKey: 'registration_confirmation',
        triggerType: 'registration.created',
        triggerEntityType: 'registration',
        triggerEntityId: '550e8400-e29b-41d4-a716-446655440002',
        sendMode: 'automatic',
        idempotencyKey: 'shared-cross-event-key',
        variables: {
          recipientEmail: 'user@example.com',
        },
      }),
    ).rejects.toThrow('Notification idempotency key is already reserved by another event');

    expect(mockBeginLogAttempt).toHaveBeenCalledTimes(1);
    expect(mockEmailSend).not.toHaveBeenCalled();
    expect(mockUpdateLogStatus).not.toHaveBeenCalled();
  });

  it('uses the hardened upsert path for render failures before any provider send', async () => {
    mockRenderTemplate.mockRejectedValueOnce(new Error('Template render exploded'));
    mockUpsertLogEntry.mockRejectedValueOnce(
      new Error('Notification idempotency key is already reserved by another event'),
    );

    await expect(
      sendNotification({
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        personId: '550e8400-e29b-41d4-a716-446655440001',
        channel: 'email',
        templateKey: 'registration_confirmation',
        triggerType: 'registration.created',
        triggerEntityType: 'registration',
        triggerEntityId: '550e8400-e29b-41d4-a716-446655440002',
        sendMode: 'automatic',
        idempotencyKey: 'shared-cross-event-key',
        variables: {
          recipientEmail: 'user@example.com',
        },
      }),
    ).rejects.toThrow('Notification idempotency key is already reserved by another event');

    expect(mockUpsertLogEntry).toHaveBeenCalledTimes(1);
    expect(mockBeginLogAttempt).not.toHaveBeenCalled();
    expect(mockEmailSend).not.toHaveBeenCalled();
  });
});
