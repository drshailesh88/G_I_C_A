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
} from './notifications';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const LOG_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('notifications actions — adversarial review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({
      userId: 'user-1',
      role: 'org:event_coordinator',
    });
    mockListFailedLogs.mockResolvedValue([]);
    mockRetryFailedNotification.mockResolvedValue({
      notificationLogId: LOG_ID,
      provider: 'resend',
      providerMessageId: 'msg_123',
      status: 'sent',
    });
    mockResendNotification.mockResolvedValue({
      notificationLogId: LOG_ID,
      provider: 'resend',
      providerMessageId: 'msg_456',
      status: 'sent',
    });
  });

  it('getFailedNotifications should allow read-only users to view failed logs', async () => {
    mockAssertEventAccess.mockImplementation(
      async (_eventId: string, options?: { requireWrite?: boolean }) => {
        if (options?.requireWrite) {
          throw new Error('Forbidden: read-only users cannot perform write operations');
        }

        return {
          userId: 'reader-1',
          role: 'org:read_only',
        };
      },
    );

    mockListFailedLogs.mockResolvedValue([{ id: LOG_ID, eventId: EVENT_ID }]);

    await expect(
      getFailedNotifications({
        eventId: EVENT_ID,
        limit: 50,
        offset: 0,
      }),
    ).resolves.toEqual([{ id: LOG_ID, eventId: EVENT_ID }]);
  });

  it('retryNotification should revalidate the failed notifications page after a retry', async () => {
    await retryNotification({
      eventId: EVENT_ID,
      notificationLogId: LOG_ID,
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/events/${EVENT_ID}/communications/failed`,
    );
  });

  it('manualResend should revalidate the failed notifications page after a resend', async () => {
    await manualResend({
      eventId: EVENT_ID,
      notificationLogId: LOG_ID,
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/events/${EVENT_ID}/communications/failed`,
    );
  });
});
