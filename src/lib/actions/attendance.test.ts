import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockAssertEventAccess,
  mockWithEventScope,
  mockEq,
  mockAnd,
  mockCount,
  mockSql,
} = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
  mockAssertEventAccess: vi.fn(),
  mockWithEventScope: vi.fn(),
  mockEq: vi.fn(),
  mockAnd: vi.fn(),
  mockCount: vi.fn(),
  mockSql: vi.fn(),
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
    and: mockAnd,
    count: mockCount,
    sql: mockSql,
  };
});

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: mockWithEventScope,
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

import { listAttendanceRecords, getAttendanceStats } from './attendance';

// ── Chain helpers ─────────────────────────────────────────────
let selectCallCount = 0;
function chainedSelectSequence(calls: unknown[][]) {
  selectCallCount = 0;
  mockDb.select.mockImplementation(() => {
    const rows = calls[selectCallCount] || [];
    selectCallCount++;
    const chain: any = {
      from: vi.fn().mockImplementation(() => chain),
      innerJoin: vi.fn().mockImplementation(() => chain),
      leftJoin: vi.fn().mockImplementation(() => chain),
      where: vi.fn().mockImplementation(() => chain),
      orderBy: vi.fn().mockImplementation(() => chain),
      groupBy: vi.fn().mockResolvedValue(rows),
      limit: vi.fn().mockResolvedValue(rows),
      then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
    };
    return chain;
  });
}

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440001';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440010';

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
  mockEq.mockImplementation((left, right) => ({ kind: 'eq', left, right }));
  mockAnd.mockImplementation((...conditions) => ({ kind: 'and', conditions }));
  mockCount.mockReturnValue({ kind: 'count' });
  mockSql.mockImplementation((strings: TemplateStringsArray, ...values: any[]) => ({
    kind: 'sql',
    strings: Array.from(strings),
    values,
  }));
  mockWithEventScope.mockImplementation((_eventColumn, _eventId, ...conditions) => ({
    kind: 'scope',
    conditions,
  }));
  mockDb.transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
});

// ── listAttendanceRecords ───────────────────────────────────
describe('listAttendanceRecords', () => {
  it('returns attendance records for an event', async () => {
    const now = new Date();
    chainedSelectSequence([
      [
        {
          id: 'att-1',
          personId: PERSON_ID,
          fullName: 'Dr. Sharma',
          registrationNumber: 'GEM-DEL-00001',
          category: 'delegate',
          sessionId: null,
          checkInMethod: 'qr_scan',
          checkInAt: now,
          checkInBy: 'user_123',
          offlineDeviceId: null,
          syncedAt: null,
        },
      ],
    ]);

    const results = await listAttendanceRecords(EVENT_ID, { eventId: EVENT_ID });

    expect(results).toHaveLength(1);
    expect(results[0].fullName).toBe('Dr. Sharma');
    expect(results[0].checkInMethod).toBe('qr_scan');
  });

  it('allows read-only access (requireWrite: false)', async () => {
    chainedSelectSequence([[]]);

    await listAttendanceRecords(EVENT_ID, { eventId: EVENT_ID });

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: false });
  });

  it('filters by sessionId when provided', async () => {
    chainedSelectSequence([[]]);

    await listAttendanceRecords(EVENT_ID, {
      eventId: EVENT_ID,
      sessionId: SESSION_ID,
    });

    expect(mockEq).toHaveBeenCalled();
    expect(mockWithEventScope).toHaveBeenCalled();
  });

  it('filters by date when provided', async () => {
    chainedSelectSequence([[]]);

    await listAttendanceRecords(EVENT_ID, {
      eventId: EVENT_ID,
      date: '2026-04-08',
    });

    expect(mockSql).toHaveBeenCalled();
    expect(mockWithEventScope).toHaveBeenCalled();
  });

  it('uses IST date boundaries when filtering by date', async () => {
    chainedSelectSequence([[]]);

    await listAttendanceRecords(EVENT_ID, {
      eventId: EVENT_ID,
      date: '2026-04-08',
    });

    const [templateStrings] = mockSql.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(Array.from(templateStrings).join('')).toContain('Asia/Kolkata');
  });

  it('validates input with Zod', async () => {
    await expect(
      listAttendanceRecords(EVENT_ID, {
        eventId: 'not-a-uuid',
      }),
    ).rejects.toThrow();
  });

  it('rejects invalid date format', async () => {
    await expect(
      listAttendanceRecords(EVENT_ID, {
        eventId: EVENT_ID,
        date: 'not-a-date',
      }),
    ).rejects.toThrow();
  });

  it('uses withEventScope for event scoping', async () => {
    chainedSelectSequence([[]]);

    await listAttendanceRecords(EVENT_ID, { eventId: EVENT_ID });

    expect(mockWithEventScope).toHaveBeenCalled();
    const firstCallArgs = mockWithEventScope.mock.calls[0];
    expect(firstCallArgs[1]).toBe(EVENT_ID);
  });

  it('returns empty array when no records', async () => {
    chainedSelectSequence([[]]);

    const results = await listAttendanceRecords(EVENT_ID, { eventId: EVENT_ID });

    expect(results).toHaveLength(0);
  });
});

// ── getAttendanceStats ──────────────────────────────────────
describe('getAttendanceStats', () => {
  it('returns total, by-method, and by-session stats', async () => {
    chainedSelectSequence([
      // Total count
      [{ count: 42 }],
      // By method
      [
        { method: 'qr_scan', count: 30 },
        { method: 'manual_search', count: 12 },
      ],
      // By session
      [
        { sessionId: SESSION_ID, count: 20 },
        { sessionId: null, count: 22 },
      ],
    ]);

    const stats = await getAttendanceStats(EVENT_ID, { eventId: EVENT_ID });

    expect(stats.totalCheckedIn).toBe(42);
    expect(stats.byMethod).toEqual({ qr_scan: 30, manual_search: 12 });
    expect(stats.bySession).toEqual({ [SESSION_ID]: 20, event_level: 22 });
  });

  it('maps null sessionId to "event_level" key', async () => {
    chainedSelectSequence([
      [{ count: 5 }],
      [{ method: 'qr_scan', count: 5 }],
      [{ sessionId: null, count: 5 }],
    ]);

    const stats = await getAttendanceStats(EVENT_ID, { eventId: EVENT_ID });

    expect(stats.bySession).toHaveProperty('event_level', 5);
  });

  it('returns zero stats when no records', async () => {
    chainedSelectSequence([
      [{ count: 0 }],
      [],
      [],
    ]);

    const stats = await getAttendanceStats(EVENT_ID, { eventId: EVENT_ID });

    expect(stats.totalCheckedIn).toBe(0);
    expect(stats.byMethod).toEqual({});
    expect(stats.bySession).toEqual({});
  });

  it('allows read-only access', async () => {
    chainedSelectSequence([[{ count: 0 }], [], []]);

    await getAttendanceStats(EVENT_ID, { eventId: EVENT_ID });

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: false });
  });

  it('validates input with Zod', async () => {
    await expect(
      getAttendanceStats(EVENT_ID, { eventId: 'bad' }),
    ).rejects.toThrow();
  });

  it('handles missing total row gracefully', async () => {
    chainedSelectSequence([
      [], // no total row
      [],
      [],
    ]);

    const stats = await getAttendanceStats(EVENT_ID, { eventId: EVENT_ID });

    expect(stats.totalCheckedIn).toBe(0);
  });

  it('filters stats by sessionId when provided', async () => {
    chainedSelectSequence([[{ count: 10 }], [{ method: 'qr_scan', count: 10 }], [{ sessionId: SESSION_ID, count: 10 }]]);

    await getAttendanceStats(EVENT_ID, {
      eventId: EVENT_ID,
      sessionId: SESSION_ID,
    });

    expect(mockEq).toHaveBeenCalled();
  });

  it('filters stats by date when provided', async () => {
    chainedSelectSequence([[{ count: 5 }], [{ method: 'manual_search', count: 5 }], [{ sessionId: null, count: 5 }]]);

    await getAttendanceStats(EVENT_ID, {
      eventId: EVENT_ID,
      date: '2026-04-08',
    });

    expect(mockSql).toHaveBeenCalled();
  });

  it('uses IST date boundaries when filtering stats by date', async () => {
    chainedSelectSequence([[{ count: 5 }], [{ method: 'manual_search', count: 5 }], [{ sessionId: null, count: 5 }]]);

    await getAttendanceStats(EVENT_ID, {
      eventId: EVENT_ID,
      date: '2026-04-08',
    });

    const [templateStrings] = mockSql.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(Array.from(templateStrings).join('')).toContain('Asia/Kolkata');
  });

  it('computes all stats inside one transaction to avoid torn reads', async () => {
    mockDb.transaction.mockImplementation(async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb));
    chainedSelectSequence([
      [{ count: 5 }],
      [{ method: 'qr_scan', count: 3 }, { method: 'manual_search', count: 2 }],
      [{ sessionId: SESSION_ID, count: 5 }],
    ]);

    await getAttendanceStats(EVENT_ID, { eventId: EVENT_ID });

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });
});
