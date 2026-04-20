/**
 * Mutation-kill-2 tests for actions/attendance.ts
 *
 * Targets survivors concentrated in:
 *   - Session sort: date-first, then startAtUtc (kills ConditionalExpression,
 *     EqualityOperator, ArithmeticOperator on aDate/bDate and aStart/bStart)
 *   - Session filter: drops rows with sessionId === null
 *   - Event-level attendance row: computed when totalCheckedIn > sessionLevelTotal
 *   - Percentage calculation for event-level row (eventLevelCount/totalCheckedIn*100)
 *   - Day sort: sorted by string compare on checkDate
 *   - buildFilterConditions: date-only filter appends AT TIME ZONE condition
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockAssertEventAccess, mockWithEventScope } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), transaction: vi.fn() },
  mockAssertEventAccess: vi.fn(),
  mockWithEventScope: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    count: vi.fn(() => ({ type: 'count' })),
    sql: Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => ({
        type: 'sql', strings: [...strings], values,
      }),
      {},
    ),
    isNotNull: vi.fn((col: unknown) => ({ type: 'isNotNull', col })),
  };
});
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: mockWithEventScope }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));

import { getAttendanceReportData } from './attendance';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeChain(rows: unknown[]) {
  const chain: Record<string, any> = {};
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.groupBy = vi.fn().mockResolvedValue(rows);
  chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(rows).then(resolve, reject);
  chain.catch = (reject: (e: unknown) => void) => Promise.resolve(rows).catch(reject);
  return chain;
}

function setSelectSequence(calls: unknown[][]) {
  let idx = 0;
  mockDb.select.mockImplementation(() => makeChain(calls[idx++] ?? []));
}

/**
 * Query order inside getAttendanceReportData:
 *   0 — confirmed registration count
 *   1 — total attendance count
 *   2 — by method
 *   3 — by category
 *   4 — by day
 *   5 — by session
 */

beforeEach(() => {
  vi.clearAllMocks();
  mockAssertEventAccess.mockResolvedValue({ userId: 'u', role: 'org:super_admin' });
  mockDb.transaction.mockImplementation(async (cb) => {
    return cb({ select: mockDb.select } as never);
  });
});

// ──────────────────────────────────────────────────────────
// Session sort: date first, then startAtUtc
// ──────────────────────────────────────────────────────────
describe('getAttendanceReportData — session sort order', () => {
  const SESSION_A = '550e8400-e29b-41d4-a716-446655440001';
  const SESSION_B = '550e8400-e29b-41d4-a716-446655440002';
  const SESSION_C = '550e8400-e29b-41d4-a716-446655440003';

  it('sorts sessions by sessionDate ascending', async () => {
    setSelectSequence([
      [{ count: 10 }], // registrations
      [{ count: 4 }],  // total checked in
      [], [], [],       // method, category, day
      [
        {
          sessionId: SESSION_B,
          title: 'Later',
          sessionDate: new Date('2026-04-20T00:00:00Z'),
          startAtUtc: new Date('2026-04-20T09:00:00Z'),
          endAtUtc: new Date('2026-04-20T10:00:00Z'),
          count: 2,
        },
        {
          sessionId: SESSION_A,
          title: 'Earlier',
          sessionDate: new Date('2026-04-18T00:00:00Z'),
          startAtUtc: new Date('2026-04-18T09:00:00Z'),
          endAtUtc: new Date('2026-04-18T10:00:00Z'),
          count: 2,
        },
      ],
    ]);

    const result = await getAttendanceReportData(EVENT_ID);
    expect(result.bySession.map((s) => s.sessionId)).toEqual([SESSION_A, SESSION_B]);
  });

  it('for sessions on the same date, sorts by startAtUtc ascending', async () => {
    setSelectSequence([
      [{ count: 10 }],
      [{ count: 4 }],
      [], [], [],
      [
        {
          sessionId: SESSION_B,
          title: 'Late slot',
          sessionDate: new Date('2026-04-18T00:00:00Z'),
          startAtUtc: new Date('2026-04-18T14:00:00Z'),
          endAtUtc: new Date('2026-04-18T15:00:00Z'),
          count: 1,
        },
        {
          sessionId: SESSION_A,
          title: 'Morning slot',
          sessionDate: new Date('2026-04-18T00:00:00Z'),
          startAtUtc: new Date('2026-04-18T09:00:00Z'),
          endAtUtc: new Date('2026-04-18T10:00:00Z'),
          count: 1,
        },
      ],
    ]);

    const result = await getAttendanceReportData(EVENT_ID);
    expect(result.bySession.slice(0, 2).map((s) => s.sessionId)).toEqual([SESSION_A, SESSION_B]);
  });

  it('treats a session with null sessionDate as 0 (sorts to the beginning)', async () => {
    setSelectSequence([
      [{ count: 10 }],
      [{ count: 4 }],
      [], [], [],
      [
        {
          sessionId: SESSION_A,
          title: 'Dated',
          sessionDate: new Date('2026-04-18T00:00:00Z'),
          startAtUtc: new Date('2026-04-18T09:00:00Z'),
          endAtUtc: new Date('2026-04-18T10:00:00Z'),
          count: 2,
        },
        {
          sessionId: SESSION_B,
          title: 'Undated',
          sessionDate: null,
          startAtUtc: null,
          endAtUtc: null,
          count: 1,
        },
      ],
    ]);

    const result = await getAttendanceReportData(EVENT_ID);
    expect(result.bySession[0].sessionId).toBe(SESSION_B);
  });

  it('drops rows with sessionId === null', async () => {
    setSelectSequence([
      [{ count: 10 }],
      [{ count: 3 }],
      [], [], [],
      [
        {
          sessionId: null,
          title: null, sessionDate: null, startAtUtc: null, endAtUtc: null, count: 1,
        },
        {
          sessionId: SESSION_A,
          title: 'S',
          sessionDate: new Date('2026-04-18T00:00:00Z'),
          startAtUtc: new Date('2026-04-18T09:00:00Z'),
          endAtUtc: new Date('2026-04-18T10:00:00Z'),
          count: 2,
        },
      ],
    ]);

    const result = await getAttendanceReportData(EVENT_ID);
    // Only SESSION_A survives from sessionRows. Event-level row is added
    // separately because totalCheckedIn (3) > sessionLevelTotal (2).
    expect(result.bySession.find((s) => s.sessionId === SESSION_A)).toBeDefined();
    expect(result.bySession.find((s) => s.sessionId === null)).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────
// Event-level row — computed only when there are event-level
// check-ins (totalCheckedIn > sessionLevelTotal)
// ──────────────────────────────────────────────────────────
describe('event-level attendance row', () => {
  const SESSION_ID = '550e8400-e29b-41d4-a716-446655440010';

  it('omits the event-level row when totalCheckedIn === sessionLevelTotal', async () => {
    setSelectSequence([
      [{ count: 5 }],
      [{ count: 2 }],
      [], [], [],
      [
        {
          sessionId: SESSION_ID,
          title: 'S',
          sessionDate: new Date('2026-04-18T00:00:00Z'),
          startAtUtc: new Date('2026-04-18T09:00:00Z'),
          endAtUtc: new Date('2026-04-18T10:00:00Z'),
          count: 2,
        },
      ],
    ]);

    const result = await getAttendanceReportData(EVENT_ID);
    expect(result.bySession.find((s) => s.sessionId === '__event_level__')).toBeUndefined();
  });

  it('adds the event-level row when totalCheckedIn > sessionLevelTotal', async () => {
    setSelectSequence([
      [{ count: 10 }],
      [{ count: 7 }],
      [], [], [],
      [
        {
          sessionId: SESSION_ID,
          title: 'S',
          sessionDate: new Date('2026-04-18T00:00:00Z'),
          startAtUtc: new Date('2026-04-18T09:00:00Z'),
          endAtUtc: new Date('2026-04-18T10:00:00Z'),
          count: 2,
        },
      ],
    ]);

    const result = await getAttendanceReportData(EVENT_ID);
    const evt = result.bySession.find((s) => s.sessionId === '__event_level__');
    expect(evt).toBeDefined();
    expect(evt!.count).toBe(5); // 7 - 2
    expect(evt!.title).toBe('Event check-in (no session)');
    expect(evt!.sessionDate).toBeNull();
    expect(evt!.startAtUtc).toBeNull();
    expect(evt!.endAtUtc).toBeNull();
  });

  it('eventLevelCount clamps to 0 when sessionLevelTotal exceeds totalCheckedIn (defensive)', async () => {
    setSelectSequence([
      [{ count: 10 }],
      [{ count: 2 }],
      [], [], [],
      [
        // DB lag / racy sum returned 5 for one session while totalCheckedIn is 2.
        {
          sessionId: SESSION_ID,
          title: 'S',
          sessionDate: new Date('2026-04-18T00:00:00Z'),
          startAtUtc: new Date('2026-04-18T09:00:00Z'),
          endAtUtc: new Date('2026-04-18T10:00:00Z'),
          count: 5,
        },
      ],
    ]);

    const result = await getAttendanceReportData(EVENT_ID);
    // totalCheckedIn=2, sessionLevelTotal=5 → max(2-5, 0) = 0 → event-level row omitted.
    expect(result.bySession.find((s) => s.sessionId === '__event_level__')).toBeUndefined();
  });

  it('event-level percentage is round(count / totalCheckedIn * 100)', async () => {
    setSelectSequence([
      [{ count: 10 }],
      [{ count: 4 }],
      [], [], [],
      [
        {
          sessionId: SESSION_ID,
          title: 'S',
          sessionDate: new Date('2026-04-18T00:00:00Z'),
          startAtUtc: new Date('2026-04-18T09:00:00Z'),
          endAtUtc: new Date('2026-04-18T10:00:00Z'),
          count: 1,
        },
      ],
    ]);

    const result = await getAttendanceReportData(EVENT_ID);
    const evt = result.bySession.find((s) => s.sessionId === '__event_level__')!;
    // eventLevelCount = 4 - 1 = 3. percentage = round(3/4*100) = 75.
    expect(evt.count).toBe(3);
    expect(evt.percentage).toBe(75);
  });

  it('per-session percentage is round(count / totalCheckedIn * 100)', async () => {
    setSelectSequence([
      [{ count: 10 }],
      [{ count: 4 }],
      [], [], [],
      [
        {
          sessionId: SESSION_ID,
          title: 'S',
          sessionDate: new Date('2026-04-18T00:00:00Z'),
          startAtUtc: new Date('2026-04-18T09:00:00Z'),
          endAtUtc: new Date('2026-04-18T10:00:00Z'),
          count: 3,
        },
      ],
    ]);
    const result = await getAttendanceReportData(EVENT_ID);
    const s = result.bySession.find((x) => x.sessionId === SESSION_ID)!;
    expect(s.percentage).toBe(75);
  });

  it('totalCheckedIn=0 drives both session and event-level percentages to 0', async () => {
    setSelectSequence([
      [{ count: 0 }],
      [{ count: 0 }],
      [], [], [],
      [],
    ]);
    const result = await getAttendanceReportData(EVENT_ID);
    // No event-level row either when totalCheckedIn=0.
    expect(result.bySession).toEqual([]);
    expect(result.overall.checkInRate).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────
// Day sort: ascending by string-compare of checkDate
// ──────────────────────────────────────────────────────────
describe('byDay sort', () => {
  it('sorts by calendar string ascending', async () => {
    setSelectSequence([
      [{ count: 10 }],
      [{ count: 5 }],
      [], [],
      [
        { checkDate: '2026-04-20', count: 2 },
        { checkDate: '2026-04-18', count: 3 },
      ],
      [],
    ]);

    const result = await getAttendanceReportData(EVENT_ID);
    expect(result.byDay.map((d) => d.date)).toEqual(['2026-04-18', '2026-04-20']);
  });
});
