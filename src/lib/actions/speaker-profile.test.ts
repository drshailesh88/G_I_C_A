import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

import { getPublicSpeakers } from './speaker-profile';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440099';

function multiSelect(...responses: unknown[][]) {
  let callCount = 0;
  mockDb.select.mockImplementation(() => {
    callCount++;
    const rows = responses[Math.min(callCount - 1, responses.length - 1)];
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockImplementation(() => Object.assign(Promise.resolve(rows), chain));
    chain.orderBy = vi.fn().mockImplementation(() => Object.assign(Promise.resolve(rows), chain));
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    return chain;
  });
}

describe('getPublicSpeakers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects non-UUID event IDs before querying the database', async () => {
    await expect(getPublicSpeakers('not-a-uuid')).rejects.toThrow('Invalid event ID');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns empty array when no public sessions exist', async () => {
    multiSelect([]);
    const result = await getPublicSpeakers(EVENT_ID);
    expect(result).toEqual([]);
    // Only 1 select call — returns early before halls and assignments queries
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('groups multiple sessions under the same speaker by personId', async () => {
    const sess = [
      { id: 's1', title: 'Session A', sessionDate: null, startAtUtc: null, endAtUtc: null, hallId: null },
      { id: 's2', title: 'Session B', sessionDate: null, startAtUtc: null, endAtUtc: null, hallId: null },
    ];
    const hallsList: unknown[] = [];
    const assignments = [
      { personId: 'p1', sessionId: 's1', role: 'speaker', fullName: 'Dr. Priya', designation: 'Cardiologist', organization: 'AIIMS', bio: 'Bio text', photoStorageKey: null },
      { personId: 'p1', sessionId: 's2', role: 'chair', fullName: 'Dr. Priya', designation: 'Cardiologist', organization: 'AIIMS', bio: 'Bio text', photoStorageKey: null },
    ];
    multiSelect(sess, hallsList, assignments);

    const result = await getPublicSpeakers(EVENT_ID);
    expect(result).toHaveLength(1);
    expect(result[0].personId).toBe('p1');
    expect(result[0].sessions).toHaveLength(2);
    expect(result[0].sessions.map(s => s.sessionId)).toContain('s1');
    expect(result[0].sessions.map(s => s.sessionId)).toContain('s2');
  });

  it('excludes assignments for sessions not in the public session set', async () => {
    const sess = [
      { id: 's1', title: 'Session A', sessionDate: null, startAtUtc: null, endAtUtc: null, hallId: null },
    ];
    const hallsList: unknown[] = [];
    const assignments = [
      { personId: 'p1', sessionId: 's1', role: 'speaker', fullName: 'Dr. Priya', designation: null, organization: null, bio: null, photoStorageKey: null },
      { personId: 'p2', sessionId: 'private-session', role: 'chair', fullName: 'Dr. Raj', designation: null, organization: null, bio: null, photoStorageKey: null },
    ];
    multiSelect(sess, hallsList, assignments);

    const result = await getPublicSpeakers(EVENT_ID);
    expect(result).toHaveLength(1);
    expect(result[0].personId).toBe('p1');
  });

  it('maps hallName from hall data for each speaker session', async () => {
    const sess = [
      { id: 's1', title: 'Session A', sessionDate: null, startAtUtc: null, endAtUtc: null, hallId: 'h1' },
    ];
    const hallsList = [{ id: 'h1', name: 'Hall A' }];
    const assignments = [
      { personId: 'p1', sessionId: 's1', role: 'speaker', fullName: 'Dr. X', designation: null, organization: null, bio: null, photoStorageKey: null },
    ];
    multiSelect(sess, hallsList, assignments);

    const result = await getPublicSpeakers(EVENT_ID);
    expect(result[0].sessions[0].hallName).toBe('Hall A');
  });

  it('sets hallName to null when session has no hallId', async () => {
    const sess = [
      { id: 's1', title: 'Session A', sessionDate: null, startAtUtc: null, endAtUtc: null, hallId: null },
    ];
    const hallsList: unknown[] = [];
    const assignments = [
      { personId: 'p1', sessionId: 's1', role: 'speaker', fullName: 'Dr. X', designation: null, organization: null, bio: null, photoStorageKey: null },
    ];
    multiSelect(sess, hallsList, assignments);

    const result = await getPublicSpeakers(EVENT_ID);
    expect(result[0].sessions[0].hallName).toBeNull();
  });

  it('preserves nullable bio and photoStorageKey fields on the speaker', async () => {
    const sess = [
      { id: 's1', title: 'Session A', sessionDate: null, startAtUtc: null, endAtUtc: null, hallId: null },
    ];
    const hallsList: unknown[] = [];
    const assignments = [
      { personId: 'p1', sessionId: 's1', role: 'speaker', fullName: 'Dr. Priya', designation: 'Cardiologist', organization: 'AIIMS', bio: 'A leading cardiologist.', photoStorageKey: 'photos/p1.jpg' },
    ];
    multiSelect(sess, hallsList, assignments);

    const result = await getPublicSpeakers(EVENT_ID);
    expect(result[0].fullName).toBe('Dr. Priya');
    expect(result[0].designation).toBe('Cardiologist');
    expect(result[0].organization).toBe('AIIMS');
    expect(result[0].bio).toBe('A leading cardiologist.');
    expect(result[0].photoStorageKey).toBe('photos/p1.jpg');
  });

  it('returns separate entries for different personIds', async () => {
    const sess = [
      { id: 's1', title: 'Session A', sessionDate: null, startAtUtc: null, endAtUtc: null, hallId: null },
      { id: 's2', title: 'Session B', sessionDate: null, startAtUtc: null, endAtUtc: null, hallId: null },
    ];
    const hallsList: unknown[] = [];
    const assignments = [
      { personId: 'p1', sessionId: 's1', role: 'speaker', fullName: 'Dr. Priya', designation: null, organization: null, bio: null, photoStorageKey: null },
      { personId: 'p2', sessionId: 's2', role: 'chair', fullName: 'Dr. Raj', designation: null, organization: null, bio: null, photoStorageKey: null },
    ];
    multiSelect(sess, hallsList, assignments);

    const result = await getPublicSpeakers(EVENT_ID);
    expect(result).toHaveLength(2);
    expect(result.map(s => s.personId)).toContain('p1');
    expect(result.map(s => s.personId)).toContain('p2');
  });

  it('returns empty array when sessions exist but no assignments', async () => {
    const sess = [
      { id: 's1', title: 'Session A', sessionDate: null, startAtUtc: null, endAtUtc: null, hallId: null },
    ];
    const hallsList: unknown[] = [];
    const assignments: unknown[] = [];
    multiSelect(sess, hallsList, assignments);

    const result = await getPublicSpeakers(EVENT_ID);
    expect(result).toEqual([]);
  });
});
