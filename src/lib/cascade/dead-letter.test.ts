/**
 * Dead-Letter Handler Tests — cascade-030
 *
 * Spec: On final failure (exhausted retries) or non-retriable error:
 *   (a) notification_log.status='failed' with last_error
 *   (b) Sentry event kind='cascade-dispatch-failure'
 *   (c) red_flags row flag_type='system_dispatch_failure'
 * No end-user notification about the failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdateLogStatus = vi.fn();
const mockCaptureError = vi.fn();
const mockUpsertRedFlag = vi.fn();

vi.mock('@/lib/notifications/log-queries', () => ({
  updateLogStatus: (...args: unknown[]) => mockUpdateLogStatus(...args),
}));

vi.mock('@/lib/sentry', () => ({
  captureError: (...args: unknown[]) => mockCaptureError(...args),
}));

vi.mock('@/lib/cascade/red-flags', () => ({
  upsertRedFlag: (...args: unknown[]) => mockUpsertRedFlag(...args),
}));

import { handleDeadLetter } from './dead-letter';

describe('handleDeadLetter', () => {
  const baseInput = {
    eventId: 'evt-111',
    cascadeEvent: 'conference/travel.updated',
    payload: { travelRecordId: 'tr-1', personId: 'p-1' },
    attempts: 3,
    channel: 'email',
    triggerId: 'trig-1',
    lastError: { code: 'PROVIDER_TIMEOUT', message: 'Timed out' },
    targetEntityType: 'notification_log' as const,
    targetEntityId: 'log-222',
    notificationLogId: 'log-222',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockUpdateLogStatus.mockResolvedValue({ id: 'log-222', status: 'failed' });
    mockUpsertRedFlag.mockResolvedValue({ flag: { id: 'flag-1' }, action: 'created' });
  });

  it('final-failure path emits all 3 signals', async () => {
    await handleDeadLetter(baseInput);

    // (a) notification_log marked failed with error info
    expect(mockUpdateLogStatus).toHaveBeenCalledOnce();
    expect(mockUpdateLogStatus).toHaveBeenCalledWith(
      'log-222',
      'evt-111',
      expect.objectContaining({
        status: 'failed',
        lastErrorCode: 'PROVIDER_TIMEOUT',
        lastErrorMessage: 'Timed out',
      }),
    );

    // (b) Sentry event with kind='cascade-dispatch-failure'
    expect(mockCaptureError).toHaveBeenCalledOnce();
    const [sentryErr, sentryOpts] = mockCaptureError.mock.calls[0];
    expect(sentryErr).toBeInstanceOf(Error);
    expect(sentryOpts.tags).toEqual(
      expect.objectContaining({ kind: 'cascade-dispatch-failure' }),
    );
    expect(sentryOpts.extra).toEqual(
      expect.objectContaining({
        cascadeEvent: 'conference/travel.updated',
        attempts: 3,
        channel: 'email',
        triggerId: 'trig-1',
      }),
    );

    // (c) red_flags row with system_dispatch_failure
    expect(mockUpsertRedFlag).toHaveBeenCalledOnce();
    expect(mockUpsertRedFlag).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-111',
        flagType: 'system_dispatch_failure',
        targetEntityType: 'notification_log',
        targetEntityId: 'log-222',
      }),
    );
  });

  it('CE16 — no user-facing failure notification sent', async () => {
    const sendNotification = vi.fn();
    vi.doMock('@/lib/notifications/send', () => ({
      sendNotification,
    }));

    await handleDeadLetter(baseInput);

    expect(sendNotification).not.toHaveBeenCalled();
  });
});
