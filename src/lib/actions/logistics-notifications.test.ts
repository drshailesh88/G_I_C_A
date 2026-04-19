import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAssertEventAccess, mockDb, mockResendNotification, mockRevalidatePath } = vi.hoisted(() => ({
  mockAssertEventAccess: vi.fn(),
  mockDb: {
    select: vi.fn(),
  },
  mockResendNotification: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/notifications/send', () => ({
  resendNotification: mockResendNotification,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

import { getLastLogisticsNotification, resendLogisticsNotification } from './logistics-notifications';

function chainedSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const RECORD_ID = '550e8400-e29b-41d4-a716-446655440001';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getLastLogisticsNotification', () => {
  it('forbids event coordinators from reading logistics notifications', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:event_coordinator' });

    await expect(getLastLogisticsNotification({
      eventId: EVENT_ID,
      recordId: RECORD_ID,
    })).rejects.toThrow('forbidden');
  });

  it('allows read-only users to read logistics notifications', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:read_only' });
    chainedSelect([{ id: 'log-1', channel: 'email', status: 'sent', queuedAt: new Date(), sentAt: new Date() }]);

    const result = await getLastLogisticsNotification({
      eventId: EVENT_ID,
      recordId: RECORD_ID,
    });

    expect(result?.id).toBe('log-1');
  });
});

describe('resendLogisticsNotification', () => {
  it('forbids event coordinators from resending logistics notifications', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:event_coordinator' });

    await expect(resendLogisticsNotification({
      eventId: EVENT_ID,
      recordId: RECORD_ID,
      channel: 'email',
    })).rejects.toThrow('forbidden');
  });
});
