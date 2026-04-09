import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockAssertEventAccess,
  mockWithEventScope,
  mockEq,
  mockCount,
} = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
  mockAssertEventAccess: vi.fn(),
  mockWithEventScope: vi.fn(),
  mockEq: vi.fn(),
  mockCount: vi.fn().mockReturnValue('count_agg'),
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
    eq: mockEq,
    count: mockCount,
  };
});

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: mockWithEventScope,
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

import { getConfirmedRegistrationCount } from './attendance';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:read_only' });
  mockEq.mockImplementation((left, right) => ({ kind: 'eq', left, right }));
  mockWithEventScope.mockImplementation((_eventColumn, _eventId, condition) => condition);
});

function chainedSelect(rows: unknown[]) {
  const chain: any = {
    from: vi.fn().mockImplementation(() => chain),
    where: vi.fn().mockImplementation(() => chain),
    limit: vi.fn().mockResolvedValue(rows),
    innerJoin: vi.fn().mockImplementation(() => chain),
    leftJoin: vi.fn().mockImplementation(() => chain),
    orderBy: vi.fn().mockResolvedValue(rows),
    groupBy: vi.fn().mockResolvedValue(rows),
    then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

// ── Gap: getConfirmedRegistrationCount ─────────────────────────
describe('getConfirmedRegistrationCount', () => {
  it('returns count of confirmed registrations', async () => {
    chainedSelect([{ count: 42 }]);

    const result = await getConfirmedRegistrationCount(EVENT_ID);

    expect(result).toBe(42);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: false });
  });

  it('returns 0 when no confirmed registrations exist', async () => {
    chainedSelect([{ count: 0 }]);

    const result = await getConfirmedRegistrationCount(EVENT_ID);

    expect(result).toBe(0);
  });

  it('returns 0 when query returns no rows', async () => {
    chainedSelect([]);

    const result = await getConfirmedRegistrationCount(EVENT_ID);

    expect(result).toBe(0);
  });

  it('uses withEventScope for event isolation', async () => {
    chainedSelect([{ count: 10 }]);

    await getConfirmedRegistrationCount(EVENT_ID);

    expect(mockWithEventScope).toHaveBeenCalled();
  });

  it('filters by confirmed status', async () => {
    chainedSelect([{ count: 5 }]);

    await getConfirmedRegistrationCount(EVENT_ID);

    expect(mockEq).toHaveBeenCalled();
  });
});
