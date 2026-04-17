import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockRevalidatePath, mockAssertEventAccess } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockAssertEventAccess: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));

import {
  updateHall, createSession, updateSession,
  createAssignment, updateAssignment,
  createFacultyInvite,
  publishProgramVersion,
  detectConflicts,
  getScheduleData, getPublicScheduleData,
} from './program';

function chainedInsert(rows: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  };
  mockDb.insert.mockReturnValue(chain);
  return chain;
}

function chainedUpdate(rows: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.update.mockReturnValue(chain);
  return chain;
}

function multiSelect(...responses: unknown[][]) {
  let callCount = 0;
  mockDb.select.mockImplementation(() => {
    callCount++;
    const idx = Math.min(callCount - 1, responses.length - 1);
    const rows = responses[idx];
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockImplementation(() => Object.assign(Promise.resolve(rows), chain));
    chain.limit = vi.fn().mockResolvedValue(rows);
    chain.orderBy = vi.fn().mockImplementation(() => Object.assign(Promise.resolve(rows), chain));
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    return chain;
  });
}

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440099';
const UUID = '550e8400-e29b-41d4-a716-446655440000';
const UUID2 = '550e8400-e29b-41d4-a716-446655440001';

// ══════════════════════════════════════════════════════════════
// CONFLICT DETECTION — sort order + arithmetic operators
// ══════════════════════════════════════════════════════════════

describe('detectConflicts — sort correctness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('hall overlap detected when sessions given in reverse chronological order', async () => {
    // Later session first in array — sort must handle this
    const s1 = { id: 's1', title: 'Later', hallId: 'h1', startAtUtc: new Date('2026-05-15T10:00:00Z'), endAtUtc: new Date('2026-05-15T11:30:00Z'), status: 'ok' };
    const s2 = { id: 's2', title: 'Earlier', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:30:00Z'), status: 'ok' };
    multiSelect([s1, s2], []);
    const w = await detectConflicts(EVENT_ID);
    const hallOverlaps = w.filter(x => x.type === 'hall_time_overlap');
    expect(hallOverlaps).toHaveLength(1);
    // The earlier session should be "a" and later should be "b" in the message
    expect(hallOverlaps[0].message).toContain('Earlier');
    expect(hallOverlaps[0].message).toContain('Later');
  });

  it('faculty double-booking detected when assignments given in reverse order', async () => {
    const s1 = { id: 's1', title: 'Later', hallId: 'h1', startAtUtc: new Date('2026-05-15T10:00:00Z'), endAtUtc: new Date('2026-05-15T11:30:00Z'), status: 'ok' };
    const s2 = { id: 's2', title: 'Earlier', hallId: 'h2', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:30:00Z'), status: 'ok' };
    multiSelect(
      [s1, s2],
      [{ sessionId: 's1', personId: 'p1' }, { sessionId: 's2', personId: 'p1' }],
    );
    const w = await detectConflicts(EVENT_ID);
    const db = w.filter(x => x.type === 'faculty_double_booking');
    expect(db).toHaveLength(1);
  });

  it('sessions with same start time overlap if one ends after other starts', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'ok' };
    const s2 = { id: 's2', title: 'B', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'ok' };
    multiSelect([s1, s2], []);
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'hall_time_overlap')).toHaveLength(1);
  });

  it('faculty sessions with same start time DO double-book', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'ok' };
    const s2 = { id: 's2', title: 'B', hallId: 'h2', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'ok' };
    multiSelect(
      [s1, s2],
      [{ sessionId: 's1', personId: 'p1' }, { sessionId: 's2', personId: 'p1' }],
    );
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'faculty_double_booking')).toHaveLength(1);
  });

  it('filters out sessions without startAtUtc from overlap detection', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: null, status: 'ok' };
    const s2 = { id: 's2', title: 'B', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'ok' };
    multiSelect([s1, s2], []);
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'hall_time_overlap')).toHaveLength(0);
  });

  it('filters out sessions without endAtUtc from overlap detection', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: null, endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'ok' };
    const s2 = { id: 's2', title: 'B', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'ok' };
    multiSelect([s1, s2], []);
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'hall_time_overlap')).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════
// SCHEDULE DATA — empty array defaults (?? [])
// ══════════════════════════════════════════════════════════════

describe('getScheduleData — empty defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  const mkSession = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 's1', title: 'A', hallId: null, sessionType: 'other', track: null,
    isPublic: true, cmeCredits: null, sortOrder: 0, status: 'draft',
    parentSessionId: null, description: null, sessionDate: null,
    startAtUtc: null, endAtUtc: null,
    ...overrides,
  });

  it('session with no assignments gets empty assignments array', async () => {
    multiSelect([mkSession()], [], [], []);
    const w = await getScheduleData(EVENT_ID);
    expect(w.sessions[0].assignments).toEqual([]);
  });

  it('session with no requirements gets empty roleRequirements array', async () => {
    multiSelect([mkSession()], [], [], []);
    const w = await getScheduleData(EVENT_ID);
    expect(w.sessions[0].roleRequirements).toEqual([]);
  });

  it('parent with no children gets empty childSessions array', async () => {
    multiSelect([mkSession()], [], [], []);
    const w = await getScheduleData(EVENT_ID);
    expect(w.sessions[0].childSessions).toEqual([]);
  });

  it('session with hallId but hallId not in hallMap gets null hallName', async () => {
    multiSelect([mkSession({ hallId: 'unknown-hall' })], [], [], []);
    const w = await getScheduleData(EVENT_ID);
    expect(w.sessions[0].hallName).toBeNull();
  });

  it('multiple assignments grouped correctly by session', async () => {
    const s1 = mkSession({ id: 's1' });
    const s2 = mkSession({ id: 's2' });
    const assigns = [
      { id: 'a1', sessionId: 's1', personId: 'p1', role: 'speaker', presentationTitle: null, sortOrder: 0 },
      { id: 'a2', sessionId: 's2', personId: 'p2', role: 'chair', presentationTitle: null, sortOrder: 0 },
      { id: 'a3', sessionId: 's1', personId: 'p3', role: 'moderator', presentationTitle: 'Talk', sortOrder: 1 },
    ];
    multiSelect([s1, s2], [], assigns, []);
    const w = await getScheduleData(EVENT_ID);
    const sess1 = w.sessions.find(s => s.id === 's1');
    const sess2 = w.sessions.find(s => s.id === 's2');
    expect(sess1!.assignments).toHaveLength(2);
    expect(sess2!.assignments).toHaveLength(1);
  });

  it('multiple requirements grouped correctly by session', async () => {
    const s1 = mkSession({ id: 's1' });
    const reqs = [
      { session_role_requirements: { id: 'r1', sessionId: 's1', role: 'speaker', requiredCount: 3 } },
      { session_role_requirements: { id: 'r2', sessionId: 's1', role: 'chair', requiredCount: 1 } },
    ];
    multiSelect([s1], [], [], reqs);
    const w = await getScheduleData(EVENT_ID);
    expect(w.sessions[0].roleRequirements).toHaveLength(2);
  });
});

describe('getPublicScheduleData — empty defaults and grouping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mkSession = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 's1', title: 'A', hallId: null, sessionType: 'other', track: null,
    isPublic: true, cmeCredits: null, sortOrder: 0, status: 'scheduled',
    parentSessionId: null, description: null, sessionDate: null,
    startAtUtc: null, endAtUtc: null,
    ...overrides,
  });

  it('session with no assignments gets empty assignments array', async () => {
    multiSelect([mkSession()], [], []);
    const w = await getPublicScheduleData(EVENT_ID);
    expect(w.sessions[0].assignments).toEqual([]);
  });

  it('session with hallId not in hallMap gets null hallName', async () => {
    multiSelect([mkSession({ hallId: 'unknown' })], [], []);
    const w = await getPublicScheduleData(EVENT_ID);
    expect(w.sessions[0].hallName).toBeNull();
  });

  it('parent with no children gets empty childSessions array', async () => {
    multiSelect([mkSession()], [], []);
    const w = await getPublicScheduleData(EVENT_ID);
    expect(w.sessions[0].childSessions).toEqual([]);
  });

  it('multiple assignments grouped correctly per session', async () => {
    const s1 = mkSession({ id: 's1' });
    const s2 = mkSession({ id: 's2' });
    const assigns = [
      { id: 'a1', sessionId: 's1', personId: 'p1', role: 'speaker', presentationTitle: 'Talk' },
      { id: 'a2', sessionId: 's1', personId: 'p2', role: 'chair', presentationTitle: null },
    ];
    multiSelect([s1, s2], [], assigns);
    const w = await getPublicScheduleData(EVENT_ID);
    const sess1 = w.sessions.find(s => s.id === 's1');
    const sess2 = w.sessions.find(s => s.id === 's2');
    expect(sess1!.assignments).toHaveLength(2);
    expect(sess2!.assignments).toEqual([]);
  });

  it('no assignments fetched when no sessions exist', async () => {
    multiSelect([], [], []);
    const w = await getPublicScheduleData(EVENT_ID);
    expect(w.sessions).toEqual([]);
    // When sessionIds.length === 0, no assignment query should happen
    // (the ternary returns [])
  });

  it('assignment for non-public session is filtered out', async () => {
    const s1 = mkSession({ id: 's1' });
    const assigns = [
      { id: 'a1', sessionId: 's1', personId: 'p1', role: 'speaker', presentationTitle: null },
      { id: 'a2', sessionId: 'private-s', personId: 'p2', role: 'chair', presentationTitle: null },
    ];
    multiSelect([s1], [], assigns);
    const w = await getPublicScheduleData(EVENT_ID);
    expect(w.sessions[0].assignments).toHaveLength(1);
    expect(w.sessions[0].assignments[0].personId).toBe('p1');
  });
});

// ══════════════════════════════════════════════════════════════
// PROGRAM VERSIONING — diff computation (NoCoverage zone)
// ══════════════════════════════════════════════════════════════

describe('publishProgramVersion — with previous version (diff path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('computes changesSummaryJson when previous version exists', async () => {
    const prevSnapshot = {
      sessions: [{ id: 'old-s1', title: 'Old Session' }],
      assignments: [{ id: 'a1' }],
    };

    multiSelect(
      [{ versionNo: 2 }],                          // latest version exists
      [{ id: 'new-s1' }, { id: 'new-s2' }],        // current sessions
      [{ id: 'a1', personId: 'p1' }],               // current assignments
      [{ id: 'h1', name: 'Hall' }],                 // halls
      [{ snapshotJson: prevSnapshot }],              // previous version snapshot
      [{ id: 'prev-ver-id' }],                      // baseVersionId lookup
    );
    const insertChain = chainedInsert([{ id: 'v3', versionNo: 3 }]);
    await publishProgramVersion(EVENT_ID, { changesDescription: 'Updated' });
    const vals = insertChain.values.mock.calls[0][0];

    expect(vals.versionNo).toBe(3);
    expect(vals.changesSummaryJson).toBeDefined();
    expect(vals.changesSummaryJson).toHaveProperty('added_sessions');
    expect(vals.changesSummaryJson).toHaveProperty('removed_sessions');
    expect(vals.changesSummaryJson).toHaveProperty('total_sessions');
    expect(vals.changesSummaryJson).toHaveProperty('total_assignments');
    expect(vals.changesSummaryJson.total_sessions).toBe(2);
    expect(vals.changesSummaryJson.total_assignments).toBe(1);
    // old-s1 was removed (not in current), new-s1/new-s2 are new
    expect(vals.changesSummaryJson.removed_sessions).toContain('old-s1');
    expect(vals.changesSummaryJson.added_sessions).toContain('new-s1');
    expect(vals.changesSummaryJson.added_sessions).toContain('new-s2');
  });

  it('no changesSummaryJson when no previous version', async () => {
    multiSelect([], [], [], []);
    const insertChain = chainedInsert([{ id: 'v1', versionNo: 1 }]);
    await publishProgramVersion(EVENT_ID, {});
    const vals = insertChain.values.mock.calls[0][0];
    // changesSummaryJson should be null (no previous to diff against)
    expect(vals.changesSummaryJson).toBeNull();
  });

  it('sessions that exist in both prev and current are NOT in added/removed', async () => {
    const prevSnapshot = {
      sessions: [{ id: 'shared-s1', title: 'Shared' }],
    };
    multiSelect(
      [{ versionNo: 1 }],
      [{ id: 'shared-s1' }],
      [],
      [],
      [{ snapshotJson: prevSnapshot }],
      [{ id: 'prev-id' }],
    );
    const insertChain = chainedInsert([{ id: 'v2' }]);
    await publishProgramVersion(EVENT_ID, {});
    const vals = insertChain.values.mock.calls[0][0];
    expect(vals.changesSummaryJson.added_sessions).not.toContain('shared-s1');
    expect(vals.changesSummaryJson.removed_sessions).not.toContain('shared-s1');
  });

  it('handles previous version with empty sessions array', async () => {
    const prevSnapshot = { sessions: [] };
    multiSelect(
      [{ versionNo: 1 }],
      [{ id: 'new-s1' }],
      [],
      [],
      [{ snapshotJson: prevSnapshot }],
      [{ id: 'prev-id' }],
    );
    const insertChain = chainedInsert([{ id: 'v2' }]);
    await publishProgramVersion(EVENT_ID, {});
    const vals = insertChain.values.mock.calls[0][0];
    expect(vals.changesSummaryJson.added_sessions).toContain('new-s1');
    expect(vals.changesSummaryJson.removed_sessions).toEqual([]);
  });

  it('handles previous version without sessions key (uses ?? [])', async () => {
    const prevSnapshot = {};  // no sessions key
    multiSelect(
      [{ versionNo: 1 }],
      [{ id: 'new-s1' }],
      [],
      [],
      [{ snapshotJson: prevSnapshot }],
      [{ id: 'prev-id' }],
    );
    const insertChain = chainedInsert([{ id: 'v2' }]);
    await publishProgramVersion(EVENT_ID, {});
    const vals = insertChain.values.mock.calls[0][0];
    expect(vals.changesSummaryJson.added_sessions).toContain('new-s1');
  });
});

// ══════════════════════════════════════════════════════════════
// UPDATEHALL — name uniqueness check branch
// ══════════════════════════════════════════════════════════════

describe('updateHall — name change branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('skips uniqueness check when only sortOrder updated (no name)', async () => {
    multiSelect([]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateHall(EVENT_ID, { hallId: UUID, sortOrder: '5' });
    // Should only call select 0 times for uniqueness — goes straight to update
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.sortOrder).toBe('5');
  });

  it('performs uniqueness check when name is provided', async () => {
    multiSelect([], []);
    chainedUpdate([{ id: UUID }]);
    await updateHall(EVENT_ID, { hallId: UUID, name: 'New Name' });
    // Should call select for uniqueness
    expect(mockDb.select).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════
// CREATESESSION — hall validation branch
// ══════════════════════════════════════════════════════════════

describe('createSession — branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  const base = {
    title: 'T',
    sessionDate: '2026-05-15',
    startTime: '09:00',
    endTime: '10:00',
  };

  it('no parent check when parentSessionId not provided', async () => {
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, base);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ parentSessionId: null }),
    );
  });

  it('no hall check when hallId not provided', async () => {
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, base);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ hallId: null }),
    );
    // Only insert call, no select for hall lookup
  });
});

// ══════════════════════════════════════════════════════════════
// UPDATESESSION — parentSessionId/hallId clearing
// ══════════════════════════════════════════════════════════════

describe('updateSession — clearing optional fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('setting hallId to empty string clears it to null (no hall lookup)', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, hallId: '' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.hallId).toBeNull();
    // Should NOT do a hall lookup (empty string is falsy)
  });

  it('setting parentSessionId to empty string clears it to null (no parent lookup)', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, parentSessionId: '' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.parentSessionId).toBeNull();
  });

  it('valid hall found → set hallId to provided value', async () => {
    multiSelect(
      [{ id: UUID, parentSessionId: null }],
      [{ id: UUID2 }],  // hall found
    );
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, hallId: UUID2 });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.hallId).toBe(UUID2);
  });

  it('valid parent found → set parentSessionId to provided value', async () => {
    multiSelect(
      [{ id: UUID, parentSessionId: null }],
      [{ id: UUID2, parentSessionId: null }],  // parent found, no grandparent
    );
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, parentSessionId: UUID2 });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.parentSessionId).toBe(UUID2);
  });
});

// ══════════════════════════════════════════════════════════════
// ASSIGNMENT — presentationDurationMinutes via ??
// ══════════════════════════════════════════════════════════════

describe('createAssignment — presentationDurationMinutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('sets presentationDurationMinutes to value when provided', async () => {
    multiSelect([{ id: UUID }], [{ id: UUID2 }], []);
    const insertChain = chainedInsert([{ id: 'a1' }]);
    await createAssignment(EVENT_ID, { sessionId: UUID, personId: UUID2, role: 'speaker', presentationDurationMinutes: 15 });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ presentationDurationMinutes: 15 }),
    );
  });

  it('sets presentationTitle to value when provided', async () => {
    multiSelect([{ id: UUID }], [{ id: UUID2 }], []);
    const insertChain = chainedInsert([{ id: 'a1' }]);
    await createAssignment(EVENT_ID, { sessionId: UUID, personId: UUID2, role: 'speaker', presentationTitle: 'My Talk' });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ presentationTitle: 'My Talk' }),
    );
  });

  it('sets notes to value when provided', async () => {
    multiSelect([{ id: UUID }], [{ id: UUID2 }], []);
    const insertChain = chainedInsert([{ id: 'a1' }]);
    await createAssignment(EVENT_ID, { sessionId: UUID, personId: UUID2, role: 'speaker', notes: 'Important' });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'Important' }),
    );
  });
});

// ══════════════════════════════════════════════════════════════
// FACULTY INVITE — status check combinations
// ══════════════════════════════════════════════════════════════

describe('createFacultyInvite — active status combinations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('no existing invite → creates successfully', async () => {
    multiSelect([{ id: UUID }], []);
    chainedInsert([{ id: 'inv1', status: 'sent' }]);
    const r = await createFacultyInvite(EVENT_ID, { personId: UUID });
    expect(r.status).toBe('sent');
  });

  it('existing "sent" invite blocks new invite', async () => {
    multiSelect([{ id: UUID }], [{ id: 'inv1', status: 'sent' }]);
    await expect(createFacultyInvite(EVENT_ID, { personId: UUID }))
      .rejects.toThrow('An active invite already exists');
  });

  it('existing "opened" invite blocks new invite', async () => {
    multiSelect([{ id: UUID }], [{ id: 'inv1', status: 'opened' }]);
    await expect(createFacultyInvite(EVENT_ID, { personId: UUID }))
      .rejects.toThrow('An active invite already exists');
  });

  it('existing "accepted" invite blocks new invite', async () => {
    multiSelect([{ id: UUID }], [{ id: 'inv1', status: 'accepted' }]);
    await expect(createFacultyInvite(EVENT_ID, { personId: UUID }))
      .rejects.toThrow('An active invite already exists');
  });

  it('existing "expired" invite allows new invite', async () => {
    multiSelect([{ id: UUID }], [{ id: 'inv1', status: 'expired' }]);
    chainedInsert([{ id: 'inv2', status: 'sent' }]);
    const r = await createFacultyInvite(EVENT_ID, { personId: UUID });
    expect(r.status).toBe('sent');
  });

  it('existing "declined" invite allows new invite', async () => {
    multiSelect([{ id: UUID }], [{ id: 'inv1', status: 'declined' }]);
    chainedInsert([{ id: 'inv2', status: 'sent' }]);
    const r = await createFacultyInvite(EVENT_ID, { personId: UUID });
    expect(r.status).toBe('sent');
  });
});
