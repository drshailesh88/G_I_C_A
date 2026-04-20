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

function chainResolving(rows: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockImplementation(() =>
    Object.assign(Promise.resolve(rows), chain),
  );
  chain.orderBy = vi.fn().mockImplementation(() =>
    Object.assign(Promise.resolve(rows), chain),
  );
  chain.limit = vi.fn().mockResolvedValue(rows);
  return chain;
}

function setupSelectSequence(...responses: unknown[][]) {
  let call = 0;
  mockDb.select.mockImplementation(() =>
    chainResolving(responses[Math.min(call++, responses.length - 1)] ?? []),
  );
}

function makeSnapshotSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 's1',
    eventId: EVENT_ID,
    parentSessionId: null,
    title: 'Opening Keynote',
    description: null,
    sessionDate: '2026-12-15T00:00:00.000Z',
    startAtUtc: '2026-12-15T03:30:00.000Z', // 09:00 IST
    endAtUtc: '2026-12-15T05:00:00.000Z',   // 10:30 IST
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

function makeAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sessionId: 's1',
    personId: 'p1',
    role: 'speaker',
    presentationTitle: null,
    sortOrder: 0,
    ...overrides,
  };
}

function makeHall(id = 'h1', name = 'Auditorium') {
  return { id, name, sortOrder: 0 };
}

function versionRow(snapshot: Record<string, unknown>) {
  return [{ id: 'v1', status: 'published', snapshotJson: snapshot }];
}

describe('getPublicProgramData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects non-UUID event IDs before querying', async () => {
    await expect(getPublicProgramData('not-a-uuid')).rejects.toThrow('Invalid event ID');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns hasPublishedVersion=false when no program version exists', async () => {
    setupSelectSequence([]); // no versions
    const result = await getPublicProgramData(EVENT_ID);
    expect(result.hasPublishedVersion).toBe(false);
    expect(result.sessions).toEqual([]);
    expect(result.halls).toEqual([]);
    // Only the version-existence query was made; no live session/hall queries.
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('returns sessions and halls hydrated from the published snapshot', async () => {
    const snapshot = {
      sessions: [makeSnapshotSession()],
      assignments: [makeAssignment()],
      halls: [makeHall()],
    };
    setupSelectSequence(
      versionRow(snapshot),
      [{ id: 'p1', fullName: 'Dr. Priya', designation: 'Cardiologist' }],
    );
    const result = await getPublicProgramData(EVENT_ID);

    expect(result.hasPublishedVersion).toBe(true);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].title).toBe('Opening Keynote');
    expect(result.sessions[0].speakers).toHaveLength(1);
    expect(result.sessions[0].speakers[0].fullName).toBe('Dr. Priya');
    expect(result.sessions[0].speakers[0].role).toBe('speaker');
    expect(result.halls).toHaveLength(1);
  });

  it('does not leak draft (isPublic=false) sessions even if they exist on live tables', async () => {
    // Snapshot only contains a public session. A draft session that exists
    // in the live sessions table must NOT appear in the public route.
    const snapshot = {
      sessions: [makeSnapshotSession({ id: 'public-1', isPublic: true })],
      assignments: [],
      halls: [],
    };
    setupSelectSequence(versionRow(snapshot));

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].id).toBe('public-1');
  });

  it('excludes non-public and cancelled sessions from the snapshot', async () => {
    const snapshot = {
      sessions: [
        makeSnapshotSession({ id: 'public-1', isPublic: true }),
        makeSnapshotSession({ id: 'private-1', isPublic: false }),
        makeSnapshotSession({ id: 'cancelled-1', isPublic: true, status: 'cancelled' }),
      ],
      assignments: [],
      halls: [],
    };
    setupSelectSequence(versionRow(snapshot));

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions.map(s => s.id)).toEqual(['public-1']);
  });

  it('only joins assignments belonging to public sessions', async () => {
    const snapshot = {
      sessions: [makeSnapshotSession({ id: 's-public', isPublic: true })],
      assignments: [
        makeAssignment({ sessionId: 's-public', personId: 'p1' }),
        makeAssignment({ sessionId: 's-private', personId: 'p2' }),
      ],
      halls: [],
    };
    setupSelectSequence(
      versionRow(snapshot),
      [{ id: 'p1', fullName: 'Dr. Priya', designation: null }],
    );

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions[0].speakers).toHaveLength(1);
    expect(result.sessions[0].speakers[0].fullName).toBe('Dr. Priya');
  });

  it('maps hallName from the snapshot halls list', async () => {
    const snapshot = {
      sessions: [makeSnapshotSession({ hallId: 'h1' })],
      assignments: [makeAssignment()],
      halls: [makeHall('h1', 'Hall A')],
    };
    setupSelectSequence(
      versionRow(snapshot),
      [{ id: 'p1', fullName: 'Dr. Priya', designation: null }],
    );

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions[0].hallName).toBe('Hall A');
  });

  it('sets hallName to null when session has no hallId', async () => {
    const snapshot = {
      sessions: [makeSnapshotSession({ hallId: null })],
      assignments: [makeAssignment()],
      halls: [],
    };
    setupSelectSequence(
      versionRow(snapshot),
      [{ id: 'p1', fullName: 'Dr. Priya', designation: null }],
    );

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions[0].hallName).toBeNull();
  });

  it('nests child sessions under their parent', async () => {
    const snapshot = {
      sessions: [
        makeSnapshotSession({ id: 'parent-1', parentSessionId: null }),
        makeSnapshotSession({ id: 'child-1', parentSessionId: 'parent-1', title: 'Sub-session' }),
      ],
      assignments: [],
      halls: [],
    };
    setupSelectSequence(versionRow(snapshot));

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].childSessions).toHaveLength(1);
    expect(result.sessions[0].childSessions[0].title).toBe('Sub-session');
  });

  it('returns sessions without assignments as empty speakers array', async () => {
    const snapshot = {
      sessions: [makeSnapshotSession()],
      assignments: [],
      halls: [],
    };
    setupSelectSequence(versionRow(snapshot));

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions[0].speakers).toEqual([]);
  });

  it('returns halls list sorted by sortOrder from snapshot', async () => {
    const snapshot = {
      sessions: [],
      assignments: [],
      halls: [makeHall('h2', 'Hall B'), makeHall('h1', 'Auditorium')].map((h, i) => ({ ...h, sortOrder: i === 0 ? 1 : 0 })),
    };
    setupSelectSequence(versionRow(snapshot));

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.halls).toHaveLength(2);
    expect(result.halls[0].name).toBe('Auditorium');
  });

  it('skips the people query when no public sessions have assignments', async () => {
    const snapshot = {
      sessions: [makeSnapshotSession({ isPublic: false })],
      assignments: [makeAssignment()],
      halls: [],
    };
    setupSelectSequence(versionRow(snapshot));

    await getPublicProgramData(EVENT_ID);
    // Only the version query — no follow-on people lookup.
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('includes designation from people lookup', async () => {
    const snapshot = {
      sessions: [makeSnapshotSession()],
      assignments: [makeAssignment()],
      halls: [],
    };
    setupSelectSequence(
      versionRow(snapshot),
      [{ id: 'p1', fullName: 'Dr. Priya', designation: 'Prof. Cardiology' }],
    );

    const result = await getPublicProgramData(EVENT_ID);
    expect(result.sessions[0].speakers[0].designation).toBe('Prof. Cardiology');
  });
});
