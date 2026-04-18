import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const {
  mockDb,
  mockAssertEventAccess,
  mockWithEventScope,
} = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
  },
  mockAssertEventAccess: vi.fn(),
  mockWithEventScope: vi.fn().mockReturnValue('mocked-scope'),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));
vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: mockWithEventScope,
}));
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    eq: vi.fn(() => 'mocked-eq'),
    and: vi.fn(() => 'mocked-and'),
    count: vi.fn(),
    desc: vi.fn(),
    inArray: vi.fn(() => 'mocked-inarray'),
    isNull: vi.fn(() => 'mocked-isnull'),
    gte: vi.fn(),
    sql: actual.sql,
  };
});
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'user_123' }),
}));

import {
  getRecentNotifications,
  getNotificationUnreadCount,
  markAllNotificationsRead,
} from '@/lib/actions/dashboard';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';

// Helper to build a chainable select mock that resolves to `rows`.
function makeSelectChain(rows: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve);
  return chain;
}

function makeUpdateChain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.set = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(Promise.resolve());
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
});

// ── getRecentNotifications ────────────────────────────────────────────────────

describe('getRecentNotifications', () => {
  it('returns mapped items with isUnread=true for non-read statuses', async () => {
    const now = new Date();
    const itemsChain = makeSelectChain([
      {
        id: 'n1',
        renderedSubject: 'Travel itinerary sent',
        templateKeySnapshot: null,
        recipientEmail: 'priya@aiims.edu',
        recipientPhoneE164: null,
        channel: 'email',
        status: 'sent',
        queuedAt: now,
        readAt: null,
        personFullName: 'Dr. Priya Sharma',
      },
      {
        id: 'n2',
        renderedSubject: null,
        templateKeySnapshot: 'registration_confirmation',
        recipientEmail: null,
        recipientPhoneE164: '+919876543210',
        channel: 'whatsapp',
        status: 'read',
        queuedAt: now,
        readAt: now,
        personFullName: 'Dr. Vikram Patel',
      },
    ]);
    const countChain = makeSelectChain([{ count: 1 }]);

    mockDb.select
      .mockReturnValueOnce(itemsChain)
      .mockReturnValueOnce(countChain);

    const result = await getRecentNotifications(EVENT_ID);

    expect(result.unreadCount).toBe(1);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: 'n1',
      subject: 'Travel itinerary sent',
      recipientName: 'Dr. Priya Sharma',
      recipientContact: 'priya@aiims.edu',
      channel: 'email',
      status: 'sent',
      isUnread: true,
    });
    expect(result.items[1]).toMatchObject({
      id: 'n2',
      subject: 'registration confirmation',
      recipientName: 'Dr. Vikram Patel',
      recipientContact: '+919876543210',
      channel: 'whatsapp',
      status: 'read',
      isUnread: false,
    });
  });

  it('falls back to templateKeySnapshot when renderedSubject is null', async () => {
    const chain = makeSelectChain([
      {
        id: 'n3',
        renderedSubject: null,
        templateKeySnapshot: 'accommodation_update',
        recipientEmail: 'test@example.com',
        recipientPhoneE164: null,
        channel: 'email',
        status: 'delivered',
        queuedAt: new Date(),
        readAt: null,
        personFullName: 'Dr. Test',
      },
    ]);
    const countChain = makeSelectChain([{ count: 1 }]);
    mockDb.select.mockReturnValueOnce(chain).mockReturnValueOnce(countChain);

    const result = await getRecentNotifications(EVENT_ID);
    expect(result.items[0].subject).toBe('accommodation update');
  });

  it('falls back to "Notification" when both subject fields are null', async () => {
    const chain = makeSelectChain([
      {
        id: 'n4',
        renderedSubject: null,
        templateKeySnapshot: null,
        recipientEmail: null,
        recipientPhoneE164: null,
        channel: 'email',
        status: 'queued',
        queuedAt: new Date(),
        readAt: null,
        personFullName: null,
      },
    ]);
    const countChain = makeSelectChain([{ count: 1 }]);
    mockDb.select.mockReturnValueOnce(chain).mockReturnValueOnce(countChain);

    const result = await getRecentNotifications(EVENT_ID);
    expect(result.items[0].subject).toBe('Notification');
    expect(result.items[0].recipientName).toBe('Unknown');
    expect(result.items[0].recipientContact).toBeNull();
  });

  it('returns empty items and zero unread when no log entries exist', async () => {
    const chain = makeSelectChain([]);
    const countChain = makeSelectChain([{ count: 0 }]);
    mockDb.select.mockReturnValueOnce(chain).mockReturnValueOnce(countChain);

    const result = await getRecentNotifications(EVENT_ID);
    expect(result.items).toHaveLength(0);
    expect(result.unreadCount).toBe(0);
  });

  it('throws on invalid eventId', async () => {
    await expect(getRecentNotifications('not-a-uuid')).rejects.toThrow();
  });

  it('treats failed notifications with readAt set as read for drawer badges', async () => {
    const chain = makeSelectChain([
      {
        id: 'n5',
        renderedSubject: 'Manual resend failed',
        templateKeySnapshot: null,
        recipientEmail: 'ops@example.com',
        recipientPhoneE164: null,
        channel: 'email',
        status: 'failed',
        queuedAt: new Date(),
        readAt: new Date(),
        personFullName: 'Ops Team',
      },
    ]);
    const countChain = makeSelectChain([{ count: 0 }]);
    mockDb.select.mockReturnValueOnce(chain).mockReturnValueOnce(countChain);

    const result = await getRecentNotifications(EVENT_ID);
    expect(result.unreadCount).toBe(0);
    expect(result.items[0]).toMatchObject({
      status: 'failed',
      isUnread: false,
    });
  });
});

// ── getNotificationUnreadCount ────────────────────────────────────────────────

describe('getNotificationUnreadCount', () => {
  it('returns the unread count from the database', async () => {
    const chain = makeSelectChain([{ count: 7 }]);
    mockDb.select.mockReturnValueOnce(chain);

    const count = await getNotificationUnreadCount(EVENT_ID);
    expect(count).toBe(7);
  });

  it('returns 0 when count row is missing', async () => {
    const chain = makeSelectChain([]);
    mockDb.select.mockReturnValueOnce(chain);

    const count = await getNotificationUnreadCount(EVENT_ID);
    expect(count).toBe(0);
  });

  it('throws on invalid eventId', async () => {
    await expect(getNotificationUnreadCount('bad')).rejects.toThrow();
  });
});

// ── markAllNotificationsRead ──────────────────────────────────────────────────

describe('markAllNotificationsRead', () => {
  it('calls db.update with status=read', async () => {
    const chain = makeUpdateChain();
    mockDb.update = vi.fn().mockReturnValue(chain);

    await markAllNotificationsRead(EVENT_ID);

    expect(mockDb.update).toHaveBeenCalledOnce();
    const updateData = chain.set.mock.calls[0]?.[0];
    expect(updateData).toMatchObject({
      readAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    expect(updateData).not.toHaveProperty('status');
    expect(chain.where).toHaveBeenCalledOnce();
  });

  it('requires write access', async () => {
    mockAssertEventAccess.mockRejectedValueOnce(new Error('forbidden'));

    await expect(markAllNotificationsRead(EVENT_ID)).rejects.toThrow('forbidden');
  });

  it('throws on invalid eventId', async () => {
    await expect(markAllNotificationsRead('not-uuid')).rejects.toThrow();
  });
});
