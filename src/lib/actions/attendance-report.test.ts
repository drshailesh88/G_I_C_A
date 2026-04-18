import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockAssertEventAccess,
  mockWithEventScope,
  mockEq,
  mockAnd,
  mockCount,
  mockSql,
  mockIsNotNull,
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
  mockIsNotNull: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    eq: mockEq,
    and: mockAnd,
    count: mockCount,
    sql: mockSql,
    isNotNull: mockIsNotNull,
  };
});

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: mockWithEventScope,
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

import { getAttendanceReportData } from './attendance';

// ── Constants ────────────────────────────────────────────────────
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440001';
const SESSION_DATE = new Date('2026-04-18T05:30:00Z');
const START_AT = new Date('2026-04-18T08:00:00Z');
const END_AT = new Date('2026-04-18T09:00:00Z');

// ── Chain helper ─────────────────────────────────────────────────
function makeChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    groupBy: vi.fn().mockResolvedValue(rows),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(rows).then(resolve, reject),
    catch: (reject: (e: unknown) => void) => Promise.resolve(rows).catch(reject),
  };
  return chain;
}

function setSelectSequence(calls: unknown[][]) {
  let idx = 0;
  mockDb.select.mockImplementation(() => makeChain(calls[idx++] ?? []));
}

// ── Default happy-path sequence ───────────────────────────────────
// Query order inside getAttendanceReportData:
//   0 — confirmed registration count
//   1 — total attendance count
//   2 — by method
//   3 — by category
//   4 — by day
//   5 — by session
function defaultSequence() {
  setSelectSequence([
    [{ count: 3 }],
    [{ count: 2 }],
    [{ method: 'qr_scan', count: 2 }],
    [{ category: 'delegate', count: 2 }],
    [{ checkDate: '2026-04-18', count: 2 }],
    [{
      sessionId: SESSION_ID,
      title: 'Keynote',
      sessionDate: SESSION_DATE,
      startAtUtc: START_AT,
      endAtUtc: END_AT,
      count: 2,
    }],
  ]);
}

beforeEach(() => {
  vi.resetAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123' });
  mockEq.mockImplementation((l: unknown, r: unknown) => ({ kind: 'eq', l, r }));
  mockAnd.mockImplementation((...c: unknown[]) => ({ kind: 'and', c }));
  mockCount.mockReturnValue({ kind: 'count' });
  mockSql.mockImplementation(() => ({ kind: 'sql' }));
  mockIsNotNull.mockImplementation(() => ({ kind: 'isNotNull' }));
  mockWithEventScope.mockImplementation(() => ({ kind: 'scope' }));
  mockDb.transaction.mockImplementation(
    async (cb: (tx: typeof mockDb) => unknown, _opts: unknown) => cb(mockDb),
  );
});

// ── Tests ─────────────────────────────────────────────────────────
describe('getAttendanceReportData', () => {
  it('rejects malformed eventId without calling auth or database', async () => {
    await expect(getAttendanceReportData('not-a-uuid')).rejects.toThrow();
    expect(mockAssertEventAccess).not.toHaveBeenCalled();
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('propagates assertEventAccess rejection', async () => {
    mockAssertEventAccess.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(getAttendanceReportData(EVENT_ID)).rejects.toThrow('Forbidden');
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('runs all queries inside a repeatable read transaction', async () => {
    defaultSequence();
    await getAttendanceReportData(EVENT_ID);
    expect(mockDb.transaction).toHaveBeenCalledOnce();
    const [, opts] = mockDb.transaction.mock.calls[0] as [unknown, unknown];
    expect(opts).toEqual({ isolationLevel: 'repeatable read' });
  });

  it('returns totalRegistrations from confirmed registration count', async () => {
    defaultSequence();
    const data = await getAttendanceReportData(EVENT_ID);
    expect(data.overall.totalRegistrations).toBe(3);
  });

  it('returns totalCheckedIn from attendance records count', async () => {
    defaultSequence();
    const data = await getAttendanceReportData(EVENT_ID);
    expect(data.overall.totalCheckedIn).toBe(2);
  });

  it('calculates checkInRate as a rounded percentage of registrations', async () => {
    defaultSequence();
    const data = await getAttendanceReportData(EVENT_ID);
    // Math.round(2/3 * 100) = Math.round(66.666…) = 67
    expect(data.overall.checkInRate).toBe(67);
  });

  it('returns 0 checkInRate when totalRegistrations is 0 — no divide-by-zero', async () => {
    setSelectSequence([
      [{ count: 0 }],
      [{ count: 0 }],
      [],
      [],
      [],
      [],
    ]);
    const data = await getAttendanceReportData(EVENT_ID);
    expect(data.overall.checkInRate).toBe(0);
  });

  it('returns byMethod breakdown from the method-group query', async () => {
    defaultSequence();
    const data = await getAttendanceReportData(EVENT_ID);
    expect(data.overall.byMethod).toEqual([{ method: 'qr_scan', count: 2 }]);
  });

  it('filters null categories from byCategory', async () => {
    setSelectSequence([
      [{ count: 3 }],
      [{ count: 2 }],
      [],
      [{ category: null, count: 1 }, { category: 'delegate', count: 2 }],
      [],
      [],
    ]);
    const data = await getAttendanceReportData(EVENT_ID);
    expect(data.overall.byCategory).toEqual([{ category: 'delegate', count: 2 }]);
  });

  it('returns byDay rows with date string and percentage of total check-ins', async () => {
    defaultSequence();
    const data = await getAttendanceReportData(EVENT_ID);
    expect(data.byDay).toHaveLength(1);
    expect(data.byDay[0].date).toBe('2026-04-18');
    expect(data.byDay[0].count).toBe(2);
    expect(data.byDay[0].percentage).toBe(100); // 2/2 * 100
  });

  it('returns bySession rows with session metadata and percentage', async () => {
    defaultSequence();
    const data = await getAttendanceReportData(EVENT_ID);
    expect(data.bySession).toHaveLength(1);
    expect(data.bySession[0].sessionId).toBe(SESSION_ID);
    expect(data.bySession[0].title).toBe('Keynote');
    expect(data.bySession[0].sessionDate).toBe(SESSION_DATE.toISOString());
    expect(data.bySession[0].startAtUtc).toEqual(START_AT);
    expect(data.bySession[0].endAtUtc).toEqual(END_AT);
    expect(data.bySession[0].count).toBe(2);
    expect(data.bySession[0].percentage).toBe(100);
  });

  it('returns 0 percentages in byDay and bySession when totalCheckedIn is 0', async () => {
    setSelectSequence([
      [{ count: 5 }],
      [{ count: 0 }],
      [],
      [],
      [{ checkDate: '2026-04-18', count: 0 }],
      [{
        sessionId: SESSION_ID,
        title: 'Keynote',
        sessionDate: SESSION_DATE,
        startAtUtc: START_AT,
        endAtUtc: END_AT,
        count: 0,
      }],
    ]);
    const data = await getAttendanceReportData(EVENT_ID);
    expect(data.byDay[0].percentage).toBe(0);
    expect(data.bySession[0].percentage).toBe(0);
  });
});
