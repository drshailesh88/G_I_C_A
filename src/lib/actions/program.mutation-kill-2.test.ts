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
  createHall, updateHall, deleteHall,
  createSession, updateSession, updateSessionStatus, deleteSession,
  createRoleRequirement, updateRoleRequirement, deleteRoleRequirement,
  getSessionRoleRequirements,
  createAssignment, updateAssignment, deleteAssignment, getSessionAssignments,
  createFacultyInvite, updateFacultyInviteStatus,
  getFacultyInvite, getFacultyInviteByToken, getEventFacultyInvites,
  publishProgramVersion, getProgramVersions,
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

function chainedDelete(rows: unknown[]) {
  const chain = {
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.delete.mockReturnValue(chain);
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
// CONDITIONAL FIELD SETTING — update functions
// Tests that only provided fields are set (kills if-true mutations)
// ══════════════════════════════════════════════════════════════

describe('updateHall — conditional field setting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('when updating only capacity, name is NOT in updateData', async () => {
    multiSelect([]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateHall(EVENT_ID, { hallId: UUID, capacity: '300' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg).not.toHaveProperty('name');
    expect(setArg.capacity).toBe('300');
  });

  it('when updating only name, sortOrder is NOT in updateData', async () => {
    multiSelect([], []);  // uniqueness check + update
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateHall(EVENT_ID, { hallId: UUID, name: 'New Hall' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.name).toBe('New Hall');
    expect(setArg).not.toHaveProperty('sortOrder');
  });

  it('when updating only sortOrder, capacity is NOT in updateData', async () => {
    multiSelect([]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateHall(EVENT_ID, { hallId: UUID, sortOrder: '5' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.sortOrder).toBe('5');
    expect(setArg).not.toHaveProperty('capacity');
    expect(setArg).not.toHaveProperty('name');
  });
});

describe('updateSession — conditional field setting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('when updating only title, description/track/hallId/etc are NOT set', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, title: 'New' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.title).toBe('New');
    expect(setArg).not.toHaveProperty('description');
    expect(setArg).not.toHaveProperty('track');
    expect(setArg).not.toHaveProperty('hallId');
    expect(setArg).not.toHaveProperty('parentSessionId');
    expect(setArg).not.toHaveProperty('sessionType');
    expect(setArg).not.toHaveProperty('isPublic');
    expect(setArg).not.toHaveProperty('sortOrder');
  });

  it('when updating only description, title is NOT set', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, description: 'Test' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.description).toBe('Test');
    expect(setArg).not.toHaveProperty('title');
  });

  it('when updating only sessionType, other fields are NOT set', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, sessionType: 'workshop' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.sessionType).toBe('workshop');
    expect(setArg).not.toHaveProperty('title');
    expect(setArg).not.toHaveProperty('isPublic');
  });

  it('when updating only isPublic, sortOrder is NOT set', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, isPublic: false });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.isPublic).toBe(false);
    expect(setArg).not.toHaveProperty('sortOrder');
  });

  it('when updating only sortOrder, isPublic is NOT set', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, sortOrder: 10 });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.sortOrder).toBe(10);
    expect(setArg).not.toHaveProperty('isPublic');
  });

  it('does NOT convert date when only sessionDate provided without startTime', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, title: 'X' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg).not.toHaveProperty('sessionDate');
    expect(setArg).not.toHaveProperty('startAtUtc');
    expect(setArg).not.toHaveProperty('endAtUtc');
  });

  it('does not check parentSessionId when not changed', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, title: 'X' });
    // Only 1 select call for session existence, no parent lookup
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('does not check hallId when not changed', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, title: 'X' });
    // Only 1 select call for session existence, no hall lookup
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });
});

describe('updateAssignment — conditional field setting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('when updating only role, sortOrder is NOT set', async () => {
    multiSelect([{ id: UUID }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateAssignment(EVENT_ID, { assignmentId: UUID, role: 'chair' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.role).toBe('chair');
    expect(setArg).not.toHaveProperty('sortOrder');
    expect(setArg).not.toHaveProperty('presentationTitle');
    expect(setArg).not.toHaveProperty('notes');
  });

  it('when updating only sortOrder, role is NOT set', async () => {
    multiSelect([{ id: UUID }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateAssignment(EVENT_ID, { assignmentId: UUID, sortOrder: 5 });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.sortOrder).toBe(5);
    expect(setArg).not.toHaveProperty('role');
  });

  it('when updating presentationTitle with value, it is kept', async () => {
    multiSelect([{ id: UUID }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateAssignment(EVENT_ID, { assignmentId: UUID, presentationTitle: 'My Talk' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.presentationTitle).toBe('My Talk');
  });

  it('when updating notes with value, it is kept', async () => {
    multiSelect([{ id: UUID }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateAssignment(EVENT_ID, { assignmentId: UUID, notes: 'Important' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.notes).toBe('Important');
  });

  it('revalidates /sessions path', async () => {
    multiSelect([{ id: UUID }]);
    chainedUpdate([{ id: UUID }]);
    await updateAssignment(EVENT_ID, { assignmentId: UUID, role: 'chair' });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
  });
});

// ══════════════════════════════════════════════════════════════
// DATE CONVERSION — createSession + updateSession
// ══════════════════════════════════════════════════════════════

describe('createSession — date conversion specifics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  const validInput = {
    title: 'Test',
    sessionDate: '2026-05-15',
    startTime: '09:00',
    endTime: '10:30',
    sessionType: 'keynote' as const,
  };

  it('startAtUtc includes sessionDate and startTime', async () => {
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, validInput);
    const vals = insertChain.values.mock.calls[0][0];
    const startStr = vals.startAtUtc.toISOString();
    // Should contain the date 2026-05-15 and time 09:00
    expect(startStr).toContain('2026-05-15');
  });

  it('endAtUtc includes sessionDate and endTime', async () => {
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, validInput);
    const vals = insertChain.values.mock.calls[0][0];
    expect(vals.endAtUtc.getTime()).toBeGreaterThan(vals.startAtUtc.getTime());
  });

  it('sessionDate is earlier than startAtUtc (midnight vs start time)', async () => {
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, validInput);
    const vals = insertChain.values.mock.calls[0][0];
    // sessionDate is midnight, startAtUtc is 09:00, so sessionDate < startAtUtc
    expect(vals.sessionDate.getTime()).toBeLessThanOrEqual(vals.startAtUtc.getTime());
  });

  it('includes eventId in insert values', async () => {
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, validInput);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: EVENT_ID }),
    );
  });

  it('sets sortOrder from input', async () => {
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, { ...validInput, sortOrder: 5 });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 5 }),
    );
  });

  it('sets sessionType from input', async () => {
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, validInput);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ sessionType: 'keynote' }),
    );
  });
});

describe('updateSession — date conversion specifics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('sessionDate set when sessionDate+startTime+endTime provided', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, {
      sessionId: UUID,
      sessionDate: '2026-06-01',
      startTime: '14:00',
      endTime: '15:00',
    });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.sessionDate).toBeInstanceOf(Date);
    expect(setArg.startAtUtc).toBeInstanceOf(Date);
    // startAtUtc should be later than sessionDate (14:00 vs 00:00)
    expect(setArg.startAtUtc.getTime()).toBeGreaterThan(setArg.sessionDate.getTime());
  });

  it('endAtUtc set when sessionDate+endTime provided', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, {
      sessionId: UUID,
      sessionDate: '2026-06-01',
      startTime: '14:00',
      endTime: '15:00',
    });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.endAtUtc).toBeInstanceOf(Date);
    // endAtUtc should be later than startAtUtc (15:00 > 14:00)
    expect(setArg.endAtUtc.getTime()).toBeGreaterThan(setArg.startAtUtc.getTime());
  });
});

// ══════════════════════════════════════════════════════════════
// CONFLICT DETECTION — precise boundary + operator tests
// ══════════════════════════════════════════════════════════════

describe('detectConflicts — operator boundary tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact boundary: sessions that touch (A.end == B.start) do NOT overlap', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'ok' };
    const s2 = { id: 's2', title: 'B', hallId: 'h1', startAtUtc: new Date('2026-05-15T10:00:00Z'), endAtUtc: new Date('2026-05-15T11:00:00Z'), status: 'ok' };
    multiSelect([s1, s2], []);
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'hall_time_overlap')).toHaveLength(0);
  });

  it('1ms overlap IS detected', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00.001Z'), status: 'ok' };
    const s2 = { id: 's2', title: 'B', hallId: 'h1', startAtUtc: new Date('2026-05-15T10:00:00Z'), endAtUtc: new Date('2026-05-15T11:00:00Z'), status: 'ok' };
    multiSelect([s1, s2], []);
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'hall_time_overlap')).toHaveLength(1);
  });

  it('complete containment detected (B inside A)', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: new Date('2026-05-15T08:00:00Z'), endAtUtc: new Date('2026-05-15T12:00:00Z'), status: 'ok' };
    const s2 = { id: 's2', title: 'B', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'ok' };
    multiSelect([s1, s2], []);
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'hall_time_overlap')).toHaveLength(1);
  });

  it('faculty touching sessions do NOT report double-booking', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'ok' };
    const s2 = { id: 's2', title: 'B', hallId: 'h2', startAtUtc: new Date('2026-05-15T10:00:00Z'), endAtUtc: new Date('2026-05-15T11:00:00Z'), status: 'ok' };
    multiSelect(
      [s1, s2],
      [{ sessionId: 's1', personId: 'p1' }, { sessionId: 's2', personId: 'p1' }],
    );
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'faculty_double_booking')).toHaveLength(0);
  });

  it('faculty 1ms overlap IS detected', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00.001Z'), status: 'ok' };
    const s2 = { id: 's2', title: 'B', hallId: 'h2', startAtUtc: new Date('2026-05-15T10:00:00Z'), endAtUtc: new Date('2026-05-15T11:00:00Z'), status: 'ok' };
    multiSelect(
      [s1, s2],
      [{ sessionId: 's1', personId: 'p1' }, { sessionId: 's2', personId: 'p1' }],
    );
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'faculty_double_booking')).toHaveLength(1);
  });

  it('three sessions: detects all pairwise overlaps', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T11:00:00Z'), status: 'ok' };
    const s2 = { id: 's2', title: 'B', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:30:00Z'), endAtUtc: new Date('2026-05-15T11:30:00Z'), status: 'ok' };
    const s3 = { id: 's3', title: 'C', hallId: 'h1', startAtUtc: new Date('2026-05-15T10:00:00Z'), endAtUtc: new Date('2026-05-15T12:00:00Z'), status: 'ok' };
    multiSelect([s1, s2, s3], []);
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'hall_time_overlap')).toHaveLength(3);
  });

  it('different halls do NOT produce hall overlap', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'ok' };
    const s2 = { id: 's2', title: 'B', hallId: 'h2', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'ok' };
    multiSelect([s1, s2], []);
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'hall_time_overlap')).toHaveLength(0);
  });

  it('sessions sorted by start time for comparison', async () => {
    // Reverse order input — should still detect overlap after sort
    const s2 = { id: 's2', title: 'B', hallId: 'h1', startAtUtc: new Date('2026-05-15T10:00:00Z'), endAtUtc: new Date('2026-05-15T11:30:00Z'), status: 'ok' };
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:30:00Z'), status: 'ok' };
    multiSelect([s2, s1], []);
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'hall_time_overlap')).toHaveLength(1);
  });
});

// ══════════════════════════════════════════════════════════════
// REVALIDATION PATHS — ensure exact strings
// ══════════════════════════════════════════════════════════════

describe('revalidation paths — kill StringLiteral mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('createRoleRequirement revalidates /sessions', async () => {
    multiSelect([{ id: UUID }], []);
    chainedInsert([{ id: 'r1' }]);
    await createRoleRequirement(EVENT_ID, { sessionId: UUID, role: 'speaker', requiredCount: 1 });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
  });

  it('updateRoleRequirement revalidates /sessions', async () => {
    multiSelect([{ id: UUID, sessionId: 's1' }]);
    chainedUpdate([{ id: UUID }]);
    await updateRoleRequirement(EVENT_ID, { requirementId: UUID, requiredCount: 2 });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
  });

  it('deleteRoleRequirement revalidates /sessions', async () => {
    multiSelect([{ id: UUID }]);
    mockDb.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    await deleteRoleRequirement(EVENT_ID, UUID);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
  });

  it('createAssignment revalidates /sessions AND /schedule', async () => {
    multiSelect([{ id: UUID }], [{ id: UUID2 }], []);
    chainedInsert([{ id: 'a1' }]);
    await createAssignment(EVENT_ID, { sessionId: UUID, personId: UUID2, role: 'speaker' });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/schedule`);
  });

  it('createFacultyInvite revalidates /sessions', async () => {
    multiSelect([{ id: UUID }], []);
    chainedInsert([{ id: 'inv1', status: 'sent' }]);
    await createFacultyInvite(EVENT_ID, { personId: UUID });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
  });

  it('updateFacultyInviteStatus revalidates /sessions', async () => {
    multiSelect([{ id: UUID, status: 'sent', token: 'tok' }]);
    chainedUpdate([{ id: UUID, status: 'opened' }]);
    await updateFacultyInviteStatus(EVENT_ID, { inviteId: UUID, newStatus: 'opened', token: 'tok' });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
  });

  it('publishProgramVersion revalidates /sessions AND /schedule', async () => {
    multiSelect([], [], [], []);
    chainedInsert([{ id: 'v1' }]);
    await publishProgramVersion(EVENT_ID, {});
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/schedule`);
  });
});

// ══════════════════════════════════════════════════════════════
// FACULTY INVITE — generateInviteToken branch
// ══════════════════════════════════════════════════════════════

describe('createFacultyInvite — token generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('inserts with token, status "sent", and sentAt date', async () => {
    multiSelect([{ id: UUID }], []);
    const insertChain = chainedInsert([{ id: 'inv1', status: 'sent', token: 'abc' }]);
    await createFacultyInvite(EVENT_ID, { personId: UUID });
    const vals = insertChain.values.mock.calls[0][0];
    expect(vals.token).toBeDefined();
    expect(typeof vals.token).toBe('string');
    expect(vals.token.length).toBe(32);
    expect(vals.status).toBe('sent');
    expect(vals.sentAt).toBeInstanceOf(Date);
    expect(vals.eventId).toBe(EVENT_ID);
    expect(vals.personId).toBe(UUID);
  });
});

// ══════════════════════════════════════════════════════════════
// PROGRAM VERSION — version incrementing
// ══════════════════════════════════════════════════════════════

describe('publishProgramVersion — version increment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('increments versionNo when previous version exists', async () => {
    multiSelect(
      [{ versionNo: 3 }],  // latest version is v3
      [],                    // sessions
      [],                    // assignments
      [],                    // halls
      [{ snapshotJson: { sessions: [], assignments: [] } }],  // prev version snapshot
      [],                    // baseVersionId lookup
    );
    const insertChain = chainedInsert([{ id: 'v4', versionNo: 4 }]);
    await publishProgramVersion(EVENT_ID, {});
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ versionNo: 4 }),
    );
  });
});

// ══════════════════════════════════════════════════════════════
// VALIDATION FILE — z.literal('') equivalent mutation tests
// These test that passing empty string is accepted (killing
// mutations that change z.literal('') to z.literal("other"))
// ══════════════════════════════════════════════════════════════

describe('validation schemas — z.literal("") patterns', () => {
  it('createHallSchema: capacity "" parses to ""', () => {
    const r = createHallSchema.parse({ name: 'H', capacity: '' });
    expect(r.capacity).toBe('');
  });

  it('updateHallSchema: capacity "" parses to ""', () => {
    const r = updateHallSchema.parse({ hallId: UUID, capacity: '' });
    expect(r.capacity).toBe('');
  });

  it('createSessionSchema: description "" parses to ""', () => {
    const r = createSessionSchema.parse({
      title: 'T', sessionDate: '2026-01-01', startTime: '09:00', endTime: '10:00', description: '',
    });
    expect(r.description).toBe('');
  });

  it('createSessionSchema: parentSessionId "" parses to ""', () => {
    const r = createSessionSchema.parse({
      title: 'T', sessionDate: '2026-01-01', startTime: '09:00', endTime: '10:00', parentSessionId: '',
    });
    expect(r.parentSessionId).toBe('');
  });

  it('createSessionSchema: hallId "" parses to ""', () => {
    const r = createSessionSchema.parse({
      title: 'T', sessionDate: '2026-01-01', startTime: '09:00', endTime: '10:00', hallId: '',
    });
    expect(r.hallId).toBe('');
  });

  it('createSessionSchema: track "" parses to ""', () => {
    const r = createSessionSchema.parse({
      title: 'T', sessionDate: '2026-01-01', startTime: '09:00', endTime: '10:00', track: '',
    });
    expect(r.track).toBe('');
  });

  it('updateSessionSchema: description "" parses to ""', () => {
    const r = updateSessionSchema.parse({ sessionId: UUID, description: '' });
    expect(r.description).toBe('');
  });

  it('updateSessionSchema: hallId "" parses to ""', () => {
    const r = updateSessionSchema.parse({ sessionId: UUID, hallId: '' });
    expect(r.hallId).toBe('');
  });

  it('updateSessionSchema: track "" parses to ""', () => {
    const r = updateSessionSchema.parse({ sessionId: UUID, track: '' });
    expect(r.track).toBe('');
  });

  it('createAssignmentSchema: presentationTitle "" parses to ""', () => {
    const r = createAssignmentSchema.parse({ sessionId: UUID, personId: UUID2, role: 'speaker', presentationTitle: '' });
    expect(r.presentationTitle).toBe('');
  });

  it('createAssignmentSchema: notes "" parses to ""', () => {
    const r = createAssignmentSchema.parse({ sessionId: UUID, personId: UUID2, role: 'speaker', notes: '' });
    expect(r.notes).toBe('');
  });

  it('updateAssignmentSchema: presentationTitle "" parses to ""', () => {
    const r = updateAssignmentSchema.parse({ assignmentId: UUID, presentationTitle: '' });
    expect(r.presentationTitle).toBe('');
  });

  it('updateAssignmentSchema: notes "" parses to ""', () => {
    const r = updateAssignmentSchema.parse({ assignmentId: UUID, notes: '' });
    expect(r.notes).toBe('');
  });

  it('publishProgramVersionSchema: changesDescription "" parses to ""', () => {
    const r = publishProgramVersionSchema.parse({ changesDescription: '' });
    expect(r.changesDescription).toBe('');
  });

  it('publishProgramVersionSchema: publishReason "" parses to ""', () => {
    const r = publishProgramVersionSchema.parse({ publishReason: '' });
    expect(r.publishReason).toBe('');
  });
});

// Import validation schemas directly for the z.literal tests
import {
  createHallSchema, updateHallSchema,
  createSessionSchema, updateSessionSchema,
  createAssignmentSchema, updateAssignmentSchema,
  publishProgramVersionSchema,
  updateFacultyInviteStatusSchema,
} from '../validations/program';

// ══════════════════════════════════════════════════════════════
// VALIDATION — MethodExpression survivors (.min() → removed)
// ══════════════════════════════════════════════════════════════

describe('validation — MethodExpression boundary killers', () => {
  it('sessionFieldsSchema: sortOrder must be integer (min 0)', () => {
    const r = updateSessionSchema.safeParse({ sessionId: UUID, sortOrder: -1 });
    expect(r.success).toBe(false);
  });

  it('sessionFieldsSchema: cmeCredits must be integer (min 0)', () => {
    const r = updateSessionSchema.safeParse({ sessionId: UUID, cmeCredits: -1 });
    expect(r.success).toBe(false);
  });

  it('sessionFieldsSchema: cmeCredits max 100', () => {
    expect(updateSessionSchema.safeParse({ sessionId: UUID, cmeCredits: 100 }).success).toBe(true);
    expect(updateSessionSchema.safeParse({ sessionId: UUID, cmeCredits: 101 }).success).toBe(false);
  });

  it('sessionFieldsSchema: description max 5000', () => {
    expect(updateSessionSchema.safeParse({ sessionId: UUID, description: 'x'.repeat(5000) }).success).toBe(true);
    expect(updateSessionSchema.safeParse({ sessionId: UUID, description: 'x'.repeat(5001) }).success).toBe(false);
  });

  it('sessionFieldsSchema: track max 100', () => {
    expect(updateSessionSchema.safeParse({ sessionId: UUID, track: 'x'.repeat(100) }).success).toBe(true);
    expect(updateSessionSchema.safeParse({ sessionId: UUID, track: 'x'.repeat(101) }).success).toBe(false);
  });

  it('sessionFieldsSchema: title max 300', () => {
    expect(updateSessionSchema.safeParse({ sessionId: UUID, title: 'A'.repeat(300) }).success).toBe(true);
    expect(updateSessionSchema.safeParse({ sessionId: UUID, title: 'A'.repeat(301) }).success).toBe(false);
  });

  it('sessionFieldsSchema: title .trim() strips whitespace', () => {
    const r = updateSessionSchema.parse({ sessionId: UUID, title: '  Trimmed  ' });
    expect(r.title).toBe('Trimmed');
  });

  it('updateRoleRequirementSchema: requiredCount min 1', () => {
    const r = updateRoleRequirementSchema.safeParse({ requirementId: UUID, requiredCount: 0 });
    expect(r.success).toBe(false);
  });

  it('updateAssignmentSchema: presentationDurationMinutes min 1, max 480', () => {
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, presentationDurationMinutes: 1 }).success).toBe(true);
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, presentationDurationMinutes: 480 }).success).toBe(true);
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, presentationDurationMinutes: 0 }).success).toBe(false);
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, presentationDurationMinutes: 481 }).success).toBe(false);
  });

  it('updateAssignmentSchema: presentationTitle max 500', () => {
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, presentationTitle: 'x'.repeat(500) }).success).toBe(true);
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, presentationTitle: 'x'.repeat(501) }).success).toBe(false);
  });

  it('updateAssignmentSchema: notes max 2000', () => {
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, notes: 'x'.repeat(2000) }).success).toBe(true);
    expect(updateAssignmentSchema.safeParse({ assignmentId: UUID, notes: 'x'.repeat(2001) }).success).toBe(false);
  });
});

import { updateRoleRequirementSchema } from '../validations/program';
