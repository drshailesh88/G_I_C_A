import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAssertEventAccess,
  mockListFailedLogs,
  mockGetLogById,
  mockRetryFailedNotification,
  mockResendNotification,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockAssertEventAccess: vi.fn(),
  mockListFailedLogs: vi.fn(),
  mockGetLogById: vi.fn(),
  mockRetryFailedNotification: vi.fn(),
  mockResendNotification: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

vi.mock('@/lib/notifications/log-queries', () => ({
  listFailedLogs: mockListFailedLogs,
  getLogById: mockGetLogById,
}));

vi.mock('@/lib/notifications/send', () => ({
  retryFailedNotification: mockRetryFailedNotification,
  resendNotification: mockResendNotification,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

import {
  getFailedNotifications,
  manualResend,
  retryNotification,
  getNotificationDetail,
} from './notifications';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const LOG_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('notifications.ts — mutation kill tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:event_coordinator' });
    mockListFailedLogs.mockResolvedValue([]);
    mockRetryFailedNotification.mockResolvedValue({ status: 'sent' });
    mockResendNotification.mockResolvedValue({ status: 'sent' });
    mockGetLogById.mockResolvedValue(null);
  });

  // ── Schema mutants: ids 2, 3, 4, 5, 8 ───────────────────────
  // Kills id 2 (ObjectLiteral: listFailedSchema→{}): non-UUID is rejected by actual schema
  it('getFailedNotifications rejects non-UUID eventId', async () => {
    await expect(
      getFailedNotifications({ eventId: 'not-a-uuid' }),
    ).rejects.toThrow();
  });

  // Kills id 3 (ArrayDeclaration: ['email','whatsapp']→[]) and id 4 ('email'→""):
  // 'email' is valid in original; mutant empty enum rejects it
  it('getFailedNotifications accepts channel=email', async () => {
    await expect(
      getFailedNotifications({ eventId: EVENT_ID, channel: 'email' }),
    ).resolves.toBeDefined();
  });

  // Kills id 5 ('whatsapp'→""): 'whatsapp' is valid in original
  it('getFailedNotifications accepts channel=whatsapp', async () => {
    await expect(
      getFailedNotifications({ eventId: EVENT_ID, channel: 'whatsapp' }),
    ).resolves.toBeDefined();
  });

  // Kills ids 3, 4, 5 from the other side: invalid channel must be rejected
  it('getFailedNotifications rejects channel=sms', async () => {
    await expect(
      getFailedNotifications({ eventId: EVENT_ID, channel: 'sms' as 'email' }),
    ).rejects.toThrow();
  });

  // Kills id 8 (MethodExpression: min(0)→max(0)): offset=1 passes min(0), fails max(0)
  it('getFailedNotifications accepts offset=1', async () => {
    await expect(
      getFailedNotifications({ eventId: EVENT_ID, offset: 1 }),
    ).resolves.toBeDefined();
  });

  // Also verify offset=0 is accepted (boundary)
  it('getFailedNotifications accepts offset=0', async () => {
    await expect(
      getFailedNotifications({ eventId: EVENT_ID, offset: 0 }),
    ).resolves.toBeDefined();
  });

  // ── listFailedLogs args: id 10 ───────────────────────────────
  // Kills id 10 (ObjectLiteral: {channel,...}→{}): assert all filters forwarded
  it('getFailedNotifications forwards all filter args to listFailedLogs', async () => {
    await getFailedNotifications({
      eventId: EVENT_ID,
      channel: 'email',
      templateKey: 'registration_confirmation',
      limit: 10,
      offset: 5,
    });

    expect(mockListFailedLogs).toHaveBeenCalledWith(EVENT_ID, {
      channel: 'email',
      templateKey: 'registration_confirmation',
      limit: 10,
      offset: 5,
    });
  });

  // ── retryNotification assertEventAccess requireWrite: ids 12, 13 ─
  // Kills id 12 (ObjectLiteral: {requireWrite:true}→{}) and id 13 (BooleanLiteral: true→false)
  it('retryNotification calls assertEventAccess with requireWrite:true', async () => {
    await retryNotification({ eventId: EVENT_ID, notificationLogId: LOG_ID });

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  // ── retryFailedNotification args: id 14 ─────────────────────
  // Kills id 14 (ObjectLiteral: {eventId,notificationLogId,initiatedByUserId}→{})
  it('retryNotification passes correct args to retryFailedNotification', async () => {
    await retryNotification({ eventId: EVENT_ID, notificationLogId: LOG_ID });

    expect(mockRetryFailedNotification).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      notificationLogId: LOG_ID,
      initiatedByUserId: 'user-1',
    });
  });

  // ── manualResend assertEventAccess requireWrite: ids 17, 18 ──
  // Kills id 17 (ObjectLiteral: {requireWrite:true}→{}) and id 18 (BooleanLiteral: true→false)
  it('manualResend calls assertEventAccess with requireWrite:true', async () => {
    await manualResend({ eventId: EVENT_ID, notificationLogId: LOG_ID });

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  // ── resendNotification args: id 19 ──────────────────────────
  // Kills id 19 (ObjectLiteral: {eventId,notificationLogId,initiatedByUserId}→{})
  it('manualResend passes correct args to resendNotification', async () => {
    await manualResend({ eventId: EVENT_ID, notificationLogId: LOG_ID });

    expect(mockResendNotification).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      notificationLogId: LOG_ID,
      initiatedByUserId: 'user-1',
    });
  });

  // ── getNotificationDetail: ids 21–26 (all NoCoverage) ───────

  // Kills id 21 (BlockStatement→{}) and id 22 (ObjectLiteral on inline schema→{}):
  // function must actually validate and return the log
  it('getNotificationDetail returns log when found', async () => {
    const log = { id: LOG_ID, eventId: EVENT_ID, status: 'failed', channel: 'email' };
    mockGetLogById.mockResolvedValue(log);

    const result = await getNotificationDetail({ eventId: EVENT_ID, notificationLogId: LOG_ID });

    expect(result).toEqual(log);
  });

  // Kills id 22 (ObjectLiteral on inline schema→{}): non-UUID should be rejected by actual schema
  it('getNotificationDetail rejects non-UUID eventId', async () => {
    await expect(
      getNotificationDetail({ eventId: 'bad-id', notificationLogId: LOG_ID }),
    ).rejects.toThrow();
  });

  // Kills id 23 (BooleanLiteral: !log→log), id 24 (ConditionalExpression→true),
  // id 25 (ConditionalExpression→false): null log must throw
  it('getNotificationDetail throws "Notification not found" when log is null', async () => {
    mockGetLogById.mockResolvedValue(null);

    await expect(
      getNotificationDetail({ eventId: EVENT_ID, notificationLogId: LOG_ID }),
    ).rejects.toThrow('Notification not found');
  });

  // Kills id 26 (StringLiteral: 'Notification not found'→""): error message must be exact
  it('getNotificationDetail error message is exactly "Notification not found"', async () => {
    mockGetLogById.mockResolvedValue(null);

    await expect(
      getNotificationDetail({ eventId: EVENT_ID, notificationLogId: LOG_ID }),
    ).rejects.toThrow('Notification not found');
  });

  // Kills id 25 (ConditionalExpression→false = never throw): non-null log must NOT throw
  it('getNotificationDetail does not throw when log exists', async () => {
    mockGetLogById.mockResolvedValue({ id: LOG_ID, eventId: EVENT_ID });

    await expect(
      getNotificationDetail({ eventId: EVENT_ID, notificationLogId: LOG_ID }),
    ).resolves.not.toThrow();
  });

  // Verifies getLogById is called with correct eventId scope (eventId isolation)
  it('getNotificationDetail calls getLogById with notificationLogId and eventId', async () => {
    mockGetLogById.mockResolvedValue({ id: LOG_ID, eventId: EVENT_ID });

    await getNotificationDetail({ eventId: EVENT_ID, notificationLogId: LOG_ID });

    expect(mockGetLogById).toHaveBeenCalledWith(LOG_ID, EVENT_ID);
  });
});
