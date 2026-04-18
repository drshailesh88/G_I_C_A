import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));

import { getPublicProgramData } from '@/lib/actions/program';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440099';

function setupSelectSequence(...responses: unknown[][]) {
  let call = 0;
  mockDb.select.mockImplementation(() => {
    const rows = responses[Math.min(call++, responses.length - 1)];
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockImplementation(() =>
      Object.assign(Promise.resolve(rows), chain),
    );
    chain.orderBy = vi.fn().mockImplementation(() =>
      Object.assign(Promise.resolve(rows), chain),
    );
    chain.limit = vi.fn().mockResolvedValue(rows);
    return chain;
  });
}

function makeSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 's1',
    eventId: EVENT_ID,
    parentSessionId: null,
    title: 'Opening Keynote',
    description: null,
    sessionDate: new Date('2026-12-15T00:00:00Z'),
    startAtUtc: new Date('2026-12-15T03:30:00Z'), // 09:00 IST
    endAtUtc: new Date('2026-12-15T05:00:00Z'),   // 10:30 IST
    hallId: null,
    sessionType: 'keynote',
    track: null,
    isPublic: true,
    cmeCredits: null,
    sortOrder: 0,
    status: 'scheduled',
    ...overrides,
  };
}

function makeHall(id = 'h1', name = 'Auditorium') {
  return { id, name, sortOrder: 0 };
}

function makeAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sessionId: 's1',
    personId: 'p1',
    role: 'speaker',
    presentationTitle: null,
    fullName: 'Dr. Priya',
    designation: 'Cardiologist',
    sortOrder: 0,
    ...overrides,
  };
}

describe('getPublicProgramData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects non-UUID event IDs before querying', async () => {
    await expect(getPublicProgramData('not-a-uuid')).rejects.toThrow('Invalid event ID');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns hasPublishedVersion false when no program version exists', async () => {
    setupSelectSequence([]); // no versions
    const result = await getPublicProgramData(EVENT_ID);
    expect(result.hasPublishedVersion).toBe(false);
    expect(result.sessions).toEqual([]);
    expect(result.halls).toEqual([]);
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('returns hasPublishedVersion true when a program version exists', async () => {
    setupSelectSequence(
      [{ id: 'v1' }],   // versions
      [],               // sessions
      [],               // halls
    );
    const result = await getPublicProgramData(EVENT_ID);
    expect(result.hasPublishedVersion).toBe(true);
  });

  it('returns sessions with speaker names joined from people', async () => {
    const session = makeSession();
    const hall = makeHall();
    const assignment = makeAssignment();
    setupSelectSequence(
      [{ id: 'v1' }],
      [session],
      [hall],
      [assignment],
    );

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].title).toBe('Opening Keynote');
    expect(result.sessions[0].speakers).toHaveLength(1);
    expect(result.sessions[0].speakers[0].fullName).toBe('Dr. Priya');
    expect(result.sessions[0].speakers[0].role).toBe('speaker');
  });

  it('excludes assignments for sessions outside the public set', async () => {
    const session = makeSession({ id: 's1' });
    setupSelectSequence(
      [{ id: 'v1' }],
      [session],
      [],
      [
        makeAssignment({ sessionId: 's1' }),
        makeAssignment({ sessionId: 'private-session', personId: 'p2', fullName: 'Dr. Other' }),
      ],
    );

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions[0].speakers).toHaveLength(1);
    expect(result.sessions[0].speakers[0].fullName).toBe('Dr. Priya');
  });

  it('maps hallName from the halls list', async () => {
    const session = makeSession({ id: 's1', hallId: 'h1' });
    const hall = makeHall('h1', 'Hall A');
    setupSelectSequence(
      [{ id: 'v1' }],
      [session],
      [hall],
      [makeAssignment()],
    );

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions[0].hallName).toBe('Hall A');
  });

  it('sets hallName to null when session has no hallId', async () => {
    setupSelectSequence(
      [{ id: 'v1' }],
      [makeSession({ hallId: null })],
      [],
      [makeAssignment()],
    );

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions[0].hallName).toBeNull();
  });

  it('nests child sessions under their parent', async () => {
    const parent = makeSession({ id: 'parent-1', parentSessionId: null });
    const child = makeSession({ id: 'child-1', parentSessionId: 'parent-1', title: 'Sub-session' });
    setupSelectSequence(
      [{ id: 'v1' }],
      [parent, child],
      [],
      [],
    );

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].childSessions).toHaveLength(1);
    expect(result.sessions[0].childSessions[0].title).toBe('Sub-session');
  });

  it('returns sessions without assignments as empty speakers array', async () => {
    setupSelectSequence(
      [{ id: 'v1' }],
      [makeSession()],
      [],
      [],
    );

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions[0].speakers).toEqual([]);
  });

  it('returns halls list from DB', async () => {
    setupSelectSequence(
      [{ id: 'v1' }],
      [],
      [makeHall('h1', 'Auditorium'), makeHall('h2', 'Hall B')],
    );

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.halls).toHaveLength(2);
    expect(result.halls[0].name).toBe('Auditorium');
  });

  it('skips assignment query when no sessions are returned', async () => {
    setupSelectSequence(
      [{ id: 'v1' }],
      [],
      [],
    );

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions).toEqual([]);
    // Only 3 selects: versions + sessions + halls (no assignment query)
    expect(mockDb.select).toHaveBeenCalledTimes(3);
  });

  it('includes designation from people join', async () => {
    setupSelectSequence(
      [{ id: 'v1' }],
      [makeSession()],
      [],
      [makeAssignment({ designation: 'Prof. Cardiology' })],
    );

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions[0].speakers[0].designation).toBe('Prof. Cardiology');
  });
});
