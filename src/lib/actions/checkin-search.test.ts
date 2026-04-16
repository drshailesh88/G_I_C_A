import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDb,
  mockAssertEventAccess,
  mockWithEventScope,
  mockEq,
  mockAnd,
  mockOr,
  mockIlike,
  mockIsNull,
} = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
  },
  mockAssertEventAccess: vi.fn(),
  mockWithEventScope: vi.fn(),
  mockEq: vi.fn(),
  mockAnd: vi.fn(),
  mockOr: vi.fn(),
  mockIlike: vi.fn(),
  mockIsNull: vi.fn(),
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
    or: mockOr,
    ilike: mockIlike,
    isNull: mockIsNull,
  };
});

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: mockWithEventScope,
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

import { searchRegistrationsForCheckIn } from './checkin-search';

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
      where: vi.fn().mockImplementation(() => chain),
      orderBy: vi.fn().mockImplementation(() => chain),
      limit: vi.fn().mockResolvedValue(rows),
      then: (resolve: (val: unknown) => void) => Promise.resolve(rows).then(resolve),
    };
    return chain;
  });
}

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440001';
const REG_ID = '550e8400-e29b-41d4-a716-446655440002';

beforeEach(() => {
  vi.clearAllMocks();
  selectCallCount = 0;
  mockAssertEventAccess.mockResolvedValue({ userId: 'user_123', role: 'org:super_admin' });
  mockEq.mockImplementation((left, right) => ({ kind: 'eq', left, right }));
  mockAnd.mockImplementation((...conditions) => ({ kind: 'and', conditions }));
  mockOr.mockImplementation((...conditions) => ({ kind: 'or', conditions }));
  mockIlike.mockImplementation((column, pattern) => ({ kind: 'ilike', column, pattern }));
  mockIsNull.mockImplementation((column) => ({ kind: 'isNull', column }));
  mockWithEventScope.mockImplementation((_eventColumn, _eventId, condition) => condition);
});

describe('searchRegistrationsForCheckIn', () => {
  it('returns matching registrations with check-in status', async () => {
    chainedSelectSequence([
      // First select: registration + person join
      [
        {
          registrationId: REG_ID,
          personId: PERSON_ID,
          fullName: 'Dr. Sharma',
          email: 'sharma@example.com',
          phoneE164: '+919876543210',
          registrationNumber: 'GEM-DEL-00001',
          category: 'delegate',
          status: 'confirmed',
        },
      ],
      // Second select: attendance check
      [],
    ]);

    const results = await searchRegistrationsForCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      query: 'Sharma',
    });

    expect(results).toHaveLength(1);
    expect(results[0].fullName).toBe('Dr. Sharma');
    expect(results[0].alreadyCheckedIn).toBe(false);
  });

  it('marks already checked-in registrations', async () => {
    chainedSelectSequence([
      [
        {
          registrationId: REG_ID,
          personId: PERSON_ID,
          fullName: 'Dr. Sharma',
          email: 'sharma@example.com',
          phoneE164: '+919876543210',
          registrationNumber: 'GEM-DEL-00001',
          category: 'delegate',
          status: 'confirmed',
        },
      ],
      // attendance found
      [{ personId: PERSON_ID }],
    ]);

    const results = await searchRegistrationsForCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      query: 'Sharma',
    });

    expect(results).toHaveLength(1);
    expect(results[0].alreadyCheckedIn).toBe(true);
  });

  it('returns empty array when no matches', async () => {
    chainedSelectSequence([[], []]);

    const results = await searchRegistrationsForCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      query: 'Nonexistent',
    });

    expect(results).toHaveLength(0);
  });

  it('requires write access', async () => {
    mockAssertEventAccess.mockRejectedValue(new Error('Forbidden'));

    await expect(
      searchRegistrationsForCheckIn(EVENT_ID, {
        eventId: EVENT_ID,
        query: 'Sharma',
      }),
    ).rejects.toThrow('Forbidden');
  });

  it('validates input with Zod', async () => {
    await expect(
      searchRegistrationsForCheckIn(EVENT_ID, {
        eventId: 'not-a-uuid',
        query: '',
      }),
    ).rejects.toThrow();
  });

  it('escapes SQL LIKE wildcards in search query', async () => {
    chainedSelectSequence([[], []]);

    await searchRegistrationsForCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      query: '100%_match',
    });

    // ilike should be called with escaped wildcards
    const ilikeCallPatterns = mockIlike.mock.calls.map((c: any[]) => c[1]);
    expect(ilikeCallPatterns.some((p: string) => p.includes('\\%') && p.includes('\\_'))).toBe(true);
  });

  it('escapes backslashes before wrapping the query in ILIKE wildcards', async () => {
    chainedSelectSequence([[], []]);

    await searchRegistrationsForCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      query: 'Sharma\\',
    });

    const ilikeCallPatterns = mockIlike.mock.calls.map((c: any[]) => c[1]);

    expect(ilikeCallPatterns).toContain('%Sharma\\\\%');
  });

  it('searches by registration number', async () => {
    chainedSelectSequence([
      [
        {
          registrationId: REG_ID,
          personId: PERSON_ID,
          fullName: 'Dr. Sharma',
          email: 'sharma@example.com',
          phoneE164: '+919876543210',
          registrationNumber: 'GEM-DEL-00001',
          category: 'delegate',
          status: 'confirmed',
        },
      ],
      [],
    ]);

    const results = await searchRegistrationsForCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      query: 'GEM-DEL-00001',
    });

    expect(results).toHaveLength(1);
    expect(results[0].registrationNumber).toBe('GEM-DEL-00001');
    // Should call ilike for registration number search
    expect(mockIlike).toHaveBeenCalled();
  });

  it('skips attendance lookup when no results found', async () => {
    chainedSelectSequence([[]]);

    const results = await searchRegistrationsForCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      query: 'Nobody',
    });

    expect(results).toHaveLength(0);
    // Only one select call for the main query, no attendance lookup
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('handles multiple results with mixed check-in status', async () => {
    const PERSON_ID_2 = '550e8400-e29b-41d4-a716-446655440009';
    chainedSelectSequence([
      [
        {
          registrationId: REG_ID,
          personId: PERSON_ID,
          fullName: 'Dr. Sharma',
          email: 'sharma@example.com',
          phoneE164: '+919876543210',
          registrationNumber: 'GEM-DEL-00001',
          category: 'delegate',
          status: 'confirmed',
        },
        {
          registrationId: '550e8400-e29b-41d4-a716-446655440003',
          personId: PERSON_ID_2,
          fullName: 'Dr. Sharmila',
          email: 'sharmila@example.com',
          phoneE164: '+919876543211',
          registrationNumber: 'GEM-DEL-00002',
          category: 'faculty',
          status: 'confirmed',
        },
      ],
      // Only first person is checked in
      [{ personId: PERSON_ID }],
    ]);

    const results = await searchRegistrationsForCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      query: 'Shar',
    });

    expect(results).toHaveLength(2);
    expect(results[0].alreadyCheckedIn).toBe(true);
    expect(results[1].alreadyCheckedIn).toBe(false);
  });

  it('uses withEventScope for event-scoped queries', async () => {
    chainedSelectSequence([[], []]);

    await searchRegistrationsForCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      query: 'test',
    });

    expect(mockWithEventScope).toHaveBeenCalled();
  });

  it('calls assertEventAccess with requireWrite: true', async () => {
    chainedSelectSequence([[], []]);

    await searchRegistrationsForCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      query: 'Sharma',
    });

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('wraps escaped query in % for ilike on all three text fields', async () => {
    chainedSelectSequence([[], []]);

    await searchRegistrationsForCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      query: 'Gupta',
    });

    const patterns = mockIlike.mock.calls.map((c: unknown[]) => c[1] as string);
    expect(patterns).toHaveLength(3);
    expect(patterns.every((p) => p === '%Gupta%')).toBe(true);
  });

  it('uses eq (not isNull) for session condition when sessionId is provided', async () => {
    const SESSION_ID = '550e8400-e29b-41d4-a716-446655440010';
    chainedSelectSequence([
      [
        {
          registrationId: REG_ID,
          personId: PERSON_ID,
          fullName: 'Dr. Sharma',
          email: 'sharma@example.com',
          phoneE164: '+919876543210',
          registrationNumber: 'GEM-DEL-00001',
          category: 'delegate',
          status: 'confirmed',
        },
      ],
      [],
    ]);

    await searchRegistrationsForCheckIn(
      EVENT_ID,
      { eventId: EVENT_ID, query: 'Sharma' },
      SESSION_ID,
    );

    expect(mockIsNull).not.toHaveBeenCalled();
    const eqCalls = mockEq.mock.calls as unknown[][];
    const sessionEq = eqCalls.find((c) => c[1] === SESSION_ID);
    expect(sessionEq).toBeDefined();
  });

  it('uses isNull for session condition when sessionId is null', async () => {
    chainedSelectSequence([
      [
        {
          registrationId: REG_ID,
          personId: PERSON_ID,
          fullName: 'Dr. Sharma',
          email: 'sharma@example.com',
          phoneE164: '+919876543210',
          registrationNumber: 'GEM-DEL-00001',
          category: 'delegate',
          status: 'confirmed',
        },
      ],
      [],
    ]);

    await searchRegistrationsForCheckIn(
      EVENT_ID,
      { eventId: EVENT_ID, query: 'Sharma' },
      null,
    );

    expect(mockIsNull).toHaveBeenCalledOnce();
  });

  it('uses actual personIds from rows in attendance lookup eq calls', async () => {
    chainedSelectSequence([
      [
        {
          registrationId: REG_ID,
          personId: PERSON_ID,
          fullName: 'Dr. Sharma',
          email: 'sharma@example.com',
          phoneE164: '+919876543210',
          registrationNumber: 'GEM-DEL-00001',
          category: 'delegate',
          status: 'confirmed',
        },
      ],
      [],
    ]);

    await searchRegistrationsForCheckIn(EVENT_ID, {
      eventId: EVENT_ID,
      query: 'Sharma',
    });

    const eqCalls = mockEq.mock.calls as unknown[][];
    const personEq = eqCalls.find((c) => c[1] === PERSON_ID);
    expect(personEq).toBeDefined();
  });
});
