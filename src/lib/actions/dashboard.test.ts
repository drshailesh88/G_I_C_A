import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockAssertEventAccess,
  mockWithEventScope,
} = vi.hoisted(() => ({
  mockDb: {
    transaction: vi.fn(),
  },
  mockAssertEventAccess: vi.fn(),
  mockWithEventScope: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn().mockResolvedValue({ userId: 'user_123' }),
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    eq: vi.fn(),
    and: vi.fn(),
    count: vi.fn(),
    gte: vi.fn(),
    inArray: vi.fn(),
  };
});

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: mockWithEventScope,
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

import { getDashboardMetrics, getNeedsAttention } from './dashboard';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeTxChain(results: Array<{ count: number }>) {
  let callIndex = 0;
  return {
    select: vi.fn(() => {
      const row = results[callIndex] ?? { count: 0 };
      callIndex++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.groupBy = vi.fn().mockReturnValue(chain);
      chain.then = (resolve: (val: unknown) => void) => Promise.resolve([row]).then(resolve);
      return chain;
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123' });
});

describe('7C-1: getDashboardMetrics', () => {
  it('returns all metric categories with correct counts', async () => {
    const tx = makeTxChain([
      { count: 42 },  // registrations total
      { count: 5 },   // registrations today
      { count: 12 },  // faculty confirmed
      { count: 8 },   // faculty invited
      { count: 30 },  // certificates issued
      { count: 42 },  // certificates eligible
      { count: 100 }, // notifications sent
      { count: 3 },   // notifications failed
      { count: 7 },   // red flags pending
    ]);
    mockDb.transaction.mockImplementation((fn) => fn(tx));

    const metrics = await getDashboardMetrics(EVENT_ID);

    expect(metrics.registrations.total).toBe(42);
    expect(metrics.registrations.today).toBe(5);
    expect(metrics.faculty.confirmed).toBe(12);
    expect(metrics.faculty.invited).toBe(8);
    expect(metrics.certificates.issued).toBe(30);
    expect(metrics.certificates.eligible).toBe(42);
    expect(metrics.notifications.sent).toBe(100);
    expect(metrics.notifications.failed).toBe(3);
    expect(metrics.redFlags.pending).toBe(7);
  });

  it('enforces event access check before querying', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Unauthorized'));

    await expect(getDashboardMetrics(EVENT_ID)).rejects.toThrow('Unauthorized');
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: false });
  });

  it('returns zeroes when event has no data', async () => {
    const tx = makeTxChain([
      { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 },
      { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 },
      { count: 0 },
    ]);
    mockDb.transaction.mockImplementation((fn) => fn(tx));

    const metrics = await getDashboardMetrics(EVENT_ID);

    expect(metrics.registrations.total).toBe(0);
    expect(metrics.faculty.confirmed).toBe(0);
    expect(metrics.certificates.issued).toBe(0);
    expect(metrics.notifications.sent).toBe(0);
    expect(metrics.redFlags.pending).toBe(0);
  });

  it('uses a single transaction for all queries (no N+1)', async () => {
    const tx = makeTxChain([
      { count: 1 }, { count: 1 }, { count: 1 }, { count: 1 },
      { count: 1 }, { count: 1 }, { count: 1 }, { count: 1 },
      { count: 1 },
    ]);
    mockDb.transaction.mockImplementation((fn) => fn(tx));

    await getDashboardMetrics(EVENT_ID);

    // Should call transaction exactly once
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    // Should make 9 select calls (one per metric)
    expect(tx.select).toHaveBeenCalledTimes(9);
  });
});

describe('7C-1: getNeedsAttention', () => {
  it('returns red flags item when there are unreviewed flags', async () => {
    const tx = makeTxChain([
      { count: 5 },  // red flags
      { count: 0 },  // failed notifications
      { count: 0 },  // pending faculty
    ]);
    mockDb.transaction.mockImplementation((fn) => fn(tx));

    const items = await getNeedsAttention(EVENT_ID);

    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('red_flags');
    expect(items[0].count).toBe(5);
    expect(items[0].href).toContain(EVENT_ID);
  });

  it('returns empty array when nothing needs attention', async () => {
    const tx = makeTxChain([
      { count: 0 }, { count: 0 }, { count: 0 },
    ]);
    mockDb.transaction.mockImplementation((fn) => fn(tx));

    const items = await getNeedsAttention(EVENT_ID);

    expect(items).toHaveLength(0);
  });

  it('returns multiple attention items when several issues exist', async () => {
    const tx = makeTxChain([
      { count: 3 },  // red flags
      { count: 2 },  // failed notifications
      { count: 4 },  // pending faculty
    ]);
    mockDb.transaction.mockImplementation((fn) => fn(tx));

    const items = await getNeedsAttention(EVENT_ID);

    expect(items).toHaveLength(3);
    const types = items.map(i => i.type);
    expect(types).toContain('red_flags');
    expect(types).toContain('failed_notifications');
    expect(types).toContain('pending_faculty');
  });

  it('enforces event access check', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));

    await expect(getNeedsAttention(EVENT_ID)).rejects.toThrow('Forbidden');
  });

  it('includes correct hrefs scoped to eventId', async () => {
    const tx = makeTxChain([
      { count: 1 },  // red flags
      { count: 1 },  // failed notifications
      { count: 1 },  // pending faculty
    ]);
    mockDb.transaction.mockImplementation((fn) => fn(tx));

    const items = await getNeedsAttention(EVENT_ID);

    const redFlagsItem = items.find(i => i.type === 'red_flags')!;
    expect(redFlagsItem.href).toBe(`/events/${EVENT_ID}/red-flags`);

    const failedItem = items.find(i => i.type === 'failed_notifications')!;
    expect(failedItem.href).toBe(`/events/${EVENT_ID}/communications?status=failed`);

    const facultyItem = items.find(i => i.type === 'pending_faculty')!;
    expect(facultyItem.href).toBe(`/events/${EVENT_ID}/program?tab=invites`);
  });
});
