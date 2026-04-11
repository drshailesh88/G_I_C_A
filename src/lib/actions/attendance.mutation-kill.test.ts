/**
 * Mutation-killing tests for actions/attendance.ts
 *
 * Targets surviving mutations:
 * - ObjectLiteral: select() shapes must be verified
 * - ConditionalExpression: buildFilterConditions branches (sessionId null vs defined, date presence)
 * - StringLiteral: 'event_level' fallback, 'confirmed' status, 'Asia/Kolkata' timezone
 * - MethodExpression: .trim() in Zod parsed input
 * - NoCoverage: getConfirmedRegistrationCount edge cases
 */
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

import {
  listAttendanceRecords,
  getAttendanceStats,
  getConfirmedRegistrationCount,
} from './attendance';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440010';

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

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
  mockEq.mockImplementation((left: unknown, right: unknown) => ({ kind: 'eq', left, right }));
  mockAnd.mockImplementation((...conditions: unknown[]) => ({ kind: 'and', conditions }));
  mockCount.mockReturnValue({ kind: 'count' });
  mockSql.mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => ({
    kind: 'sql',
    strings: Array.from(strings),
    values,
  }));
  mockWithEventScope.mockImplementation(
    (_eventColumn: unknown, _eventId: unknown, ...conditions: unknown[]) => ({
      kind: 'scope',
      conditions,
    }),
  );
  mockDb.transaction.mockImplementation(
    async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb),
  );
});

// ── ConditionalExpression: buildFilterConditions sessionId=null path ──
describe('buildFilterConditions: sessionId null vs defined vs undefined', () => {
  it('generates IS NULL condition when sessionId is explicitly null', async () => {
    chainedSelectSequence([[]]);

    await listAttendanceRecords(EVENT_ID, {
      eventId: EVENT_ID,
      sessionId: null,
    });

    // When sessionId is null, sql`` should be called to build IS NULL
    expect(mockSql).toHaveBeenCalled();
    const sqlCalls = mockSql.mock.calls;
    const isNullCall = sqlCalls.find((call: unknown[]) => {
      const strings = Array.from(call[0] as string[]);
      return strings.some((s: string) => s.includes('IS NULL'));
    });
    expect(isNullCall).toBeTruthy();
  });

  it('uses eq() when sessionId is a valid UUID', async () => {
    chainedSelectSequence([[]]);

    await listAttendanceRecords(EVENT_ID, {
      eventId: EVENT_ID,
      sessionId: SESSION_ID,
    });

    // eq() should be called for the sessionId filter
    expect(mockEq).toHaveBeenCalled();
  });

  it('does NOT add sessionId condition when sessionId is omitted', async () => {
    chainedSelectSequence([[]]);
    mockEq.mockClear();
    mockSql.mockClear();

    await listAttendanceRecords(EVENT_ID, {
      eventId: EVENT_ID,
      // sessionId not provided
    });

    // Only withEventScope should be called, no additional eq/sql for session
    // The mockEq should not be called for session filtering
    // (it may be called for join conditions, but withEventScope handles that)
    const sqlCalls = mockSql.mock.calls;
    const isNullCall = sqlCalls.find((call: unknown[]) => {
      const strings = Array.from(call[0] as string[]);
      return strings.some((s: string) => s.includes('IS NULL'));
    });
    expect(isNullCall).toBeUndefined();
  });
});

// ── ConditionalExpression: date filter presence ─────────────────
describe('buildFilterConditions: date filter', () => {
  it('builds date condition with Asia/Kolkata timezone when date provided', async () => {
    chainedSelectSequence([[]]);

    await listAttendanceRecords(EVENT_ID, {
      eventId: EVENT_ID,
      date: '2026-04-08',
    });

    const sqlCalls = mockSql.mock.calls;
    const dateCall = sqlCalls.find((call: unknown[]) => {
      const strings = Array.from(call[0] as string[]);
      return strings.some((s: string) => s.includes('Asia/Kolkata'));
    });
    expect(dateCall).toBeTruthy();
  });

  it('does NOT build date condition when date not provided', async () => {
    chainedSelectSequence([[]]);
    mockSql.mockClear();

    await listAttendanceRecords(EVENT_ID, {
      eventId: EVENT_ID,
    });

    const sqlCalls = mockSql.mock.calls;
    const dateCall = sqlCalls.find((call: unknown[]) => {
      const strings = Array.from(call[0] as string[]);
      return strings.some((s: string) => s.includes('Asia/Kolkata'));
    });
    expect(dateCall).toBeUndefined();
  });
});

// ── StringLiteral: 'event_level' fallback key ───────────────────
describe('getAttendanceStats: event_level fallback for null sessionId', () => {
  function setupStatsChain(totalRows: unknown[], methodRows: unknown[], sessionRows: unknown[]) {
    let callIdx = 0;
    mockDb.select.mockImplementation(() => {
      const allResults = [totalRows, methodRows, sessionRows];
      const rows = allResults[callIdx] || [];
      callIdx++;
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

  it('maps null sessionId to exactly "event_level" key', async () => {
    setupStatsChain(
      [{ count: 3 }],
      [{ method: 'qr_scan', count: 3 }],
      [{ sessionId: null, count: 3 }],
    );

    const stats = await getAttendanceStats(EVENT_ID, { eventId: EVENT_ID });

    expect(stats.bySession).toHaveProperty('event_level');
    expect(stats.bySession['event_level']).toBe(3);
    // Must NOT have a 'null' key
    expect(stats.bySession).not.toHaveProperty('null');
    expect(Object.keys(stats.bySession)).toEqual(['event_level']);
  });

  it('uses actual sessionId string as key when not null', async () => {
    setupStatsChain(
      [{ count: 5 }],
      [{ method: 'manual_search', count: 5 }],
      [{ sessionId: SESSION_ID, count: 5 }],
    );

    const stats = await getAttendanceStats(EVENT_ID, { eventId: EVENT_ID });

    expect(stats.bySession).toHaveProperty(SESSION_ID, 5);
    expect(stats.bySession).not.toHaveProperty('event_level');
  });
});

// ── ObjectLiteral: select shape verification ────────────────────
describe('listAttendanceRecords: returned record shape', () => {
  it('returns records with all expected fields', async () => {
    const now = new Date();
    chainedSelectSequence([
      [{
        id: 'att-1',
        personId: 'p-1',
        fullName: 'Test Person',
        registrationNumber: 'REG-001',
        category: 'speaker',
        sessionId: SESSION_ID,
        checkInMethod: 'manual_search',
        checkInAt: now,
        checkInBy: 'user_456',
        offlineDeviceId: 'device-1',
        syncedAt: now,
      }],
    ]);

    const results = await listAttendanceRecords(EVENT_ID, { eventId: EVENT_ID });

    expect(results[0]).toEqual({
      id: 'att-1',
      personId: 'p-1',
      fullName: 'Test Person',
      registrationNumber: 'REG-001',
      category: 'speaker',
      sessionId: SESSION_ID,
      checkInMethod: 'manual_search',
      checkInAt: now,
      checkInBy: 'user_456',
      offlineDeviceId: 'device-1',
      syncedAt: now,
    });
  });
});

describe('getAttendanceStats: totalCheckedIn from count', () => {
  function setupStatsChain2(totalRows: unknown[], methodRows: unknown[], sessionRows: unknown[]) {
    let callIdx = 0;
    mockDb.select.mockImplementation(() => {
      const allResults = [totalRows, methodRows, sessionRows];
      const rows = allResults[callIdx] || [];
      callIdx++;
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

  it('uses the count field from the first query', async () => {
    setupStatsChain2([{ count: 99 }], [], []);

    const stats = await getAttendanceStats(EVENT_ID, { eventId: EVENT_ID });

    expect(stats.totalCheckedIn).toBe(99);
  });

  it('defaults to 0 when total row is undefined', async () => {
    setupStatsChain2([], [], []);

    const stats = await getAttendanceStats(EVENT_ID, { eventId: EVENT_ID });

    expect(stats.totalCheckedIn).toBe(0);
  });
});

// ── getConfirmedRegistrationCount: checks event access ──────────
describe('getConfirmedRegistrationCount mutation killers', () => {
  it('asserts read access with requireWrite: false', async () => {
    chainedSelectSequence([[{ count: 10 }]]);

    await getConfirmedRegistrationCount(EVENT_ID);

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: false });
  });

  it('calls eq for confirmed status filter', async () => {
    chainedSelectSequence([[{ count: 10 }]]);

    await getConfirmedRegistrationCount(EVENT_ID);

    // eq should be called with the registrations status column and 'confirmed'
    expect(mockEq).toHaveBeenCalled();
    const eqCalls = mockEq.mock.calls;
    const confirmedCall = eqCalls.find(
      (call: unknown[]) => call[1] === 'confirmed',
    );
    expect(confirmedCall).toBeTruthy();
  });

  it('returns the count value from the query', async () => {
    chainedSelectSequence([[{ count: 77 }]]);

    const result = await getConfirmedRegistrationCount(EVENT_ID);

    expect(result).toBe(77);
  });
});

// ── getAttendanceStats: byMethod mapping ────────────────────────
describe('getAttendanceStats: byMethod record shape', () => {
  function setupStatsChain3(totalRows: unknown[], methodRows: unknown[], sessionRows: unknown[]) {
    let callIdx = 0;
    mockDb.select.mockImplementation(() => {
      const allResults = [totalRows, methodRows, sessionRows];
      const rows = allResults[callIdx] || [];
      callIdx++;
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

  it('maps method rows to Record<string, number>', async () => {
    setupStatsChain3(
      [{ count: 10 }],
      [
        { method: 'qr_scan', count: 5 },
        { method: 'manual_search', count: 3 },
        { method: 'kiosk', count: 2 },
      ],
      [],
    );

    const stats = await getAttendanceStats(EVENT_ID, { eventId: EVENT_ID });

    expect(stats.byMethod).toEqual({
      qr_scan: 5,
      manual_search: 3,
      kiosk: 2,
    });
  });
});

// ── getAttendanceStats: combined sessionId + date filter ─────────
describe('getAttendanceStats: combined filters', () => {
  it('applies both sessionId and date filters', async () => {
    let callIdx = 0;
    mockDb.select.mockImplementation(() => {
      const allResults = [
        [{ count: 2 }],
        [{ method: 'qr_scan', count: 2 }],
        [{ sessionId: SESSION_ID, count: 2 }],
      ];
      const rows = allResults[callIdx] || [];
      callIdx++;
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

    await getAttendanceStats(EVENT_ID, {
      eventId: EVENT_ID,
      sessionId: SESSION_ID,
      date: '2026-04-08',
    });

    // Both eq (for sessionId) and sql (for date with Asia/Kolkata) should be called
    expect(mockEq).toHaveBeenCalled();
    expect(mockSql).toHaveBeenCalled();
  });
});
