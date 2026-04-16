import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

describe('getDashboardMetrics — eq/inArray status filter assertions', () => {
  it('filters registrations and certificates by confirmed status', async () => {
    const tx = makeTxChain(Array(9).fill({ count: 1 }));
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));

    await getDashboardMetrics(EVENT_ID);

    expect(vi.mocked(eq)).toHaveBeenCalledWith(expect.anything(), 'confirmed');
  });

  it('filters issued certificates by issued status', async () => {
    const tx = makeTxChain(Array(9).fill({ count: 1 }));
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));

    await getDashboardMetrics(EVENT_ID);

    expect(vi.mocked(eq)).toHaveBeenCalledWith(expect.anything(), 'issued');
  });

  it('filters failed notifications by failed status', async () => {
    const tx = makeTxChain(Array(9).fill({ count: 1 }));
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));

    await getDashboardMetrics(EVENT_ID);

    expect(vi.mocked(eq)).toHaveBeenCalledWith(expect.anything(), 'failed');
  });

  it('filters red flags by unreviewed status', async () => {
    const tx = makeTxChain(Array(9).fill({ count: 1 }));
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));

    await getDashboardMetrics(EVENT_ID);

    expect(vi.mocked(eq)).toHaveBeenCalledWith(expect.anything(), 'unreviewed');
  });

  it('filters faculty invites with exactly sent and opened statuses', async () => {
    const tx = makeTxChain(Array(9).fill({ count: 1 }));
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));

    await getDashboardMetrics(EVENT_ID);

    expect(vi.mocked(inArray)).toHaveBeenCalledWith(expect.anything(), ['sent', 'opened']);
  });

  it('filters notification log with exactly sent, delivered, read statuses', async () => {
    const tx = makeTxChain(Array(9).fill({ count: 1 }));
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));

    await getDashboardMetrics(EVENT_ID);

    expect(vi.mocked(inArray)).toHaveBeenCalledWith(
      expect.anything(),
      ['sent', 'delivered', 'read'],
    );
  });
});

describe('getNeedsAttention — assertEventAccess, eq/inArray, label assertions', () => {
  it('calls assertEventAccess with requireWrite false', async () => {
    const tx = makeTxChain([{ count: 0 }, { count: 0 }, { count: 0 }]);
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));

    await getNeedsAttention(EVENT_ID);

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: false });
  });

  it('filters red flags by unreviewed status in getNeedsAttention', async () => {
    const tx = makeTxChain([{ count: 1 }, { count: 0 }, { count: 0 }]);
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));

    await getNeedsAttention(EVENT_ID);

    expect(vi.mocked(eq)).toHaveBeenCalledWith(expect.anything(), 'unreviewed');
  });

  it('filters failed notifications by failed status in getNeedsAttention', async () => {
    const tx = makeTxChain([{ count: 0 }, { count: 1 }, { count: 0 }]);
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));

    await getNeedsAttention(EVENT_ID);

    expect(vi.mocked(eq)).toHaveBeenCalledWith(expect.anything(), 'failed');
  });

  it('filters pending faculty with exactly sent and opened statuses', async () => {
    const tx = makeTxChain([{ count: 0 }, { count: 0 }, { count: 1 }]);
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));

    await getNeedsAttention(EVENT_ID);

    expect(vi.mocked(inArray)).toHaveBeenCalledWith(expect.anything(), ['sent', 'opened']);
  });

  it('red flags item has exact label "Red flags need review"', async () => {
    const tx = makeTxChain([{ count: 2 }, { count: 0 }, { count: 0 }]);
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));

    const items = await getNeedsAttention(EVENT_ID);

    const item = items.find((i) => i.type === 'red_flags')!;
    expect(item.label).toBe('Red flags need review');
  });

  it('failed notifications item has exact label "Failed notifications"', async () => {
    const tx = makeTxChain([{ count: 0 }, { count: 2 }, { count: 0 }]);
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));

    const items = await getNeedsAttention(EVENT_ID);

    const item = items.find((i) => i.type === 'failed_notifications')!;
    expect(item.label).toBe('Failed notifications');
  });

  it('pending faculty item has exact label "Faculty awaiting response"', async () => {
    const tx = makeTxChain([{ count: 0 }, { count: 0 }, { count: 2 }]);
    mockDb.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));

    const items = await getNeedsAttention(EVENT_ID);

    const item = items.find((i) => i.type === 'pending_faculty')!;
    expect(item.label).toBe('Faculty awaiting response');
  });
});
