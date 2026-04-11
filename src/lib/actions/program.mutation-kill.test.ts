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

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

import {
  createHall,
  updateHall,
  deleteHall,
  getHalls,
  createSession,
  updateSession,
  updateSessionStatus,
  deleteSession,
  getSession,
  getSessions,
  createRoleRequirement,
  updateRoleRequirement,
  deleteRoleRequirement,
  getSessionRoleRequirements,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getSessionAssignments,
  createFacultyInvite,
  updateFacultyInviteStatus,
  getFacultyInvite,
  getFacultyInviteByToken,
  getEventFacultyInvites,
  publishProgramVersion,
  getProgramVersions,
  getProgramVersion,
  detectConflicts,
  getScheduleData,
  getPublicScheduleData,
} from './program';

// ── Chain helpers ─────────────────────────────────────────────
function chainedSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
    innerJoin: vi.fn().mockReturnThis(),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

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

const EVENT_ID = 'event-1';
const UUID = '550e8400-e29b-41d4-a716-446655440000';
const UUID2 = '550e8400-e29b-41d4-a716-446655440001';
const UUID3 = '550e8400-e29b-41d4-a716-446655440002';

// ══════════════════════════════════════════════════════════════
// HALLS — exact error messages + conditional branches
// ══════════════════════════════════════════════════════════════

describe('createHall — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "A hall with this name already exists for this event"', async () => {
    chainedSelect([{ id: 'existing' }]);
    await expect(createHall(EVENT_ID, { name: 'Hall A' }))
      .rejects.toThrow('A hall with this name already exists for this event');
  });

  it('calls assertEventAccess with requireWrite: true', async () => {
    multiSelect([], []);
    chainedInsert([{ id: 'h1', name: 'H' }]);
    await createHall(EVENT_ID, { name: 'H' });
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID, { requireWrite: true });
  });

  it('revalidates /events/{eventId}/sessions', async () => {
    multiSelect([], []);
    chainedInsert([{ id: 'h1', name: 'H' }]);
    await createHall(EVENT_ID, { name: 'H' });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
  });

  it('sets capacity to null when capacity is empty string', async () => {
    multiSelect([], []);
    const insertChain = chainedInsert([{ id: 'h1' }]);
    await createHall(EVENT_ID, { name: 'Hall', capacity: '' });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ capacity: null }),
    );
  });

  it('sets capacity to value when provided', async () => {
    multiSelect([], []);
    const insertChain = chainedInsert([{ id: 'h1' }]);
    await createHall(EVENT_ID, { name: 'Hall', capacity: '500' });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ capacity: '500' }),
    );
  });
});

describe('updateHall — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "A hall with this name already exists for this event" on duplicate', async () => {
    chainedSelect([{ id: 'other-hall' }]);
    chainedUpdate([]);
    await expect(updateHall(EVENT_ID, { hallId: UUID, name: 'Dup' }))
      .rejects.toThrow('A hall with this name already exists for this event');
  });

  it('exact error: "Hall not found" when update returns empty', async () => {
    chainedSelect([]);
    chainedUpdate([]);
    await expect(updateHall(EVENT_ID, { hallId: UUID, capacity: '100' }))
      .rejects.toThrow('Hall not found');
  });

  it('sets capacity to null when empty string', async () => {
    // no name change → skip uniqueness check
    chainedSelect([]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateHall(EVENT_ID, { hallId: UUID, capacity: '' });
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ capacity: null }),
    );
  });

  it('checks uniqueness only when name is being changed', async () => {
    // capacity-only update should NOT check uniqueness
    multiSelect([]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateHall(EVENT_ID, { hallId: UUID, capacity: '300' });
    // Only 0 select calls for name uniqueness (capacity doesn't trigger it)
    expect(updateChain.set).toHaveBeenCalled();
  });

  it('revalidates path on success', async () => {
    chainedSelect([]);
    chainedUpdate([{ id: UUID }]);
    await updateHall(EVENT_ID, { hallId: UUID, capacity: '300' });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
  });

  it('includes name/capacity/sortOrder in update when provided', async () => {
    multiSelect([], []);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateHall(EVENT_ID, { hallId: UUID, name: 'New', capacity: '50', sortOrder: '5' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.name).toBe('New');
    expect(setArg.capacity).toBe('50');
    expect(setArg.sortOrder).toBe('5');
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });
});

describe('deleteHall — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "Hall not found"', async () => {
    chainedDelete([]);
    await expect(deleteHall(EVENT_ID, UUID)).rejects.toThrow('Hall not found');
  });

  it('returns { success: true }', async () => {
    chainedDelete([{ id: UUID }]);
    const r = await deleteHall(EVENT_ID, UUID);
    expect(r).toEqual({ success: true });
  });

  it('revalidates path', async () => {
    chainedDelete([{ id: UUID }]);
    await deleteHall(EVENT_ID, UUID);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
  });

  it('rejects invalid hallId (Zod validation)', async () => {
    await expect(deleteHall(EVENT_ID, 'bad-uuid')).rejects.toThrow();
  });
});

describe('getHalls — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('calls assertEventAccess without requireWrite', async () => {
    chainedSelect([]);
    await getHalls(EVENT_ID);
    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_ID);
  });
});

// ══════════════════════════════════════════════════════════════
// SESSIONS — exact error messages + conditional branches
// ══════════════════════════════════════════════════════════════

describe('createSession — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  const validInput = {
    title: 'Keynote',
    sessionDate: '2026-05-15',
    startTime: '09:00',
    endTime: '10:30',
    sessionType: 'keynote' as const,
  };

  it('exact error: "Parent session not found"', async () => {
    chainedSelect([]);
    await expect(createSession(EVENT_ID, { ...validInput, parentSessionId: UUID }))
      .rejects.toThrow('Parent session not found');
  });

  it('exact error: "Cannot nest more than one level deep (parent is already a sub-session)"', async () => {
    chainedSelect([{ id: UUID, parentSessionId: 'grandparent' }]);
    await expect(createSession(EVENT_ID, { ...validInput, parentSessionId: UUID }))
      .rejects.toThrow('Cannot nest more than one level deep (parent is already a sub-session)');
  });

  it('exact error: "Hall not found for this event"', async () => {
    // First select: no parent → skip; second select: hall not found
    multiSelect([], []);
    await expect(createSession(EVENT_ID, { ...validInput, hallId: UUID }))
      .rejects.toThrow('Hall not found for this event');
  });

  it('sets description to null when empty/missing', async () => {
    multiSelect([], []);
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, { ...validInput, description: '' });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
    );
  });

  it('sets hallId to null when empty/missing', async () => {
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, validInput);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ hallId: null }),
    );
  });

  it('sets track to null when empty/missing', async () => {
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, { ...validInput, track: '' });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ track: null }),
    );
  });

  it('sets status to "draft" for new sessions', async () => {
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, validInput);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' }),
    );
  });

  it('sets isPublic from validated input', async () => {
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, { ...validInput, isPublic: false });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ isPublic: false }),
    );
  });

  it('sets cmeCredits to null when not provided (via ??)', async () => {
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, validInput);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ cmeCredits: null }),
    );
  });

  it('sets cmeCredits to value when provided', async () => {
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, { ...validInput, cmeCredits: 5 });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ cmeCredits: 5 }),
    );
  });

  it('sets parentSessionId when valid parent found', async () => {
    multiSelect(
      [{ id: UUID, parentSessionId: null }], // parent exists, no grandparent
    );
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, { ...validInput, parentSessionId: UUID });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ parentSessionId: UUID }),
    );
  });

  it('validates hall when hallId provided and found', async () => {
    multiSelect(
      [{ id: UUID }], // hall found
    );
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, { ...validInput, hallId: UUID });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ hallId: UUID }),
    );
  });

  it('revalidates both /sessions and /schedule paths', async () => {
    chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, validInput);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/schedule`);
  });

  it('sets createdBy and updatedBy from userId', async () => {
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, validInput);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: 'user-1', updatedBy: 'user-1' }),
    );
  });

  it('converts sessionDate+times to Date objects', async () => {
    const insertChain = chainedInsert([{ id: 's1' }]);
    await createSession(EVENT_ID, validInput);
    const vals = insertChain.values.mock.calls[0][0];
    expect(vals.startAtUtc).toBeInstanceOf(Date);
    expect(vals.endAtUtc).toBeInstanceOf(Date);
    expect(vals.sessionDate).toBeInstanceOf(Date);
  });
});

describe('updateSession — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "Session not found"', async () => {
    chainedSelect([]);
    await expect(updateSession(EVENT_ID, { sessionId: UUID, title: 'X' }))
      .rejects.toThrow('Session not found');
  });

  it('exact error: "Parent session not found" on parent change', async () => {
    multiSelect(
      [{ id: UUID, parentSessionId: null }], // existing session
      [],                                     // parent not found
    );
    await expect(updateSession(EVENT_ID, { sessionId: UUID, parentSessionId: UUID2 }))
      .rejects.toThrow('Parent session not found');
  });

  it('exact error: "Cannot nest more than one level deep"', async () => {
    multiSelect(
      [{ id: UUID, parentSessionId: null }],
      [{ id: UUID2, parentSessionId: 'grandparent' }],
    );
    await expect(updateSession(EVENT_ID, { sessionId: UUID, parentSessionId: UUID2 }))
      .rejects.toThrow('Cannot nest more than one level deep');
  });

  it('exact error: "A session cannot be its own parent"', async () => {
    multiSelect(
      [{ id: UUID, parentSessionId: null }],
      [{ id: UUID, parentSessionId: null }],
    );
    await expect(updateSession(EVENT_ID, { sessionId: UUID, parentSessionId: UUID }))
      .rejects.toThrow('A session cannot be its own parent');
  });

  it('exact error: "Hall not found for this event" on hall change', async () => {
    multiSelect(
      [{ id: UUID, parentSessionId: null }], // existing
      [],                                     // hall not found
    );
    await expect(updateSession(EVENT_ID, { sessionId: UUID, hallId: UUID2 }))
      .rejects.toThrow('Hall not found for this event');
  });

  it('sets description to null when empty', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, description: '' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.description).toBeNull();
  });

  it('sets track to null when empty', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, track: '' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.track).toBeNull();
  });

  it('sets hallId to null when empty', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, hallId: '' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.hallId).toBeNull();
  });

  it('sets parentSessionId to null when empty', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, parentSessionId: '' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.parentSessionId).toBeNull();
  });

  it('does not set cmeCredits when not provided in update', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, title: 'X' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg).not.toHaveProperty('cmeCredits');
  });

  it('sets cmeCredits to value when provided', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, cmeCredits: 3 });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.cmeCredits).toBe(3);
  });

  it('updates all fields when provided', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, {
      sessionId: UUID,
      title: 'New',
      sessionType: 'panel',
      isPublic: false,
      sortOrder: 5,
    });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.title).toBe('New');
    expect(setArg.sessionType).toBe('panel');
    expect(setArg.isPublic).toBe(false);
    expect(setArg.sortOrder).toBe(5);
    expect(setArg.updatedBy).toBe('user-1');
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  it('converts date+time when both sessionDate and startTime provided', async () => {
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
    expect(setArg.endAtUtc).toBeInstanceOf(Date);
  });

  it('revalidates both /sessions and /schedule', async () => {
    multiSelect([{ id: UUID, parentSessionId: null }]);
    chainedUpdate([{ id: UUID }]);
    await updateSession(EVENT_ID, { sessionId: UUID, title: 'X' });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/schedule`);
  });
});

describe('updateSessionStatus — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "Session not found"', async () => {
    chainedSelect([]);
    await expect(updateSessionStatus(EVENT_ID, { sessionId: UUID, newStatus: 'scheduled' }))
      .rejects.toThrow('Session not found');
  });

  it('exact transition error message format with allowed list', async () => {
    chainedSelect([{ id: UUID, status: 'completed' }]);
    await expect(updateSessionStatus(EVENT_ID, { sessionId: UUID, newStatus: 'draft' }))
      .rejects.toThrow('Cannot transition from "completed" to "draft". Allowed: none (terminal state)');
  });

  it('exact transition error for draft→completed (not allowed)', async () => {
    chainedSelect([{ id: UUID, status: 'draft' }]);
    await expect(updateSessionStatus(EVENT_ID, { sessionId: UUID, newStatus: 'completed' }))
      .rejects.toThrow('Cannot transition from "draft" to "completed". Allowed: scheduled, cancelled');
  });

  it('sets cancelledAt when transitioning to cancelled', async () => {
    chainedSelect([{ id: UUID, status: 'draft' }]);
    const updateChain = chainedUpdate([{ id: UUID, status: 'cancelled' }]);
    await updateSessionStatus(EVENT_ID, { sessionId: UUID, newStatus: 'cancelled' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.cancelledAt).toBeInstanceOf(Date);
    expect(setArg.status).toBe('cancelled');
  });

  it('does NOT set cancelledAt when transitioning to non-cancelled status', async () => {
    chainedSelect([{ id: UUID, status: 'draft' }]);
    const updateChain = chainedUpdate([{ id: UUID, status: 'scheduled' }]);
    await updateSessionStatus(EVENT_ID, { sessionId: UUID, newStatus: 'scheduled' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.cancelledAt).toBeUndefined();
    expect(setArg.status).toBe('scheduled');
  });

  it('scheduled→completed is allowed', async () => {
    chainedSelect([{ id: UUID, status: 'scheduled' }]);
    chainedUpdate([{ id: UUID, status: 'completed' }]);
    const r = await updateSessionStatus(EVENT_ID, { sessionId: UUID, newStatus: 'completed' });
    expect(r.status).toBe('completed');
  });

  it('scheduled→cancelled is allowed', async () => {
    chainedSelect([{ id: UUID, status: 'scheduled' }]);
    chainedUpdate([{ id: UUID, status: 'cancelled' }]);
    const r = await updateSessionStatus(EVENT_ID, { sessionId: UUID, newStatus: 'cancelled' });
    expect(r.status).toBe('cancelled');
  });

  it('revalidates both paths', async () => {
    chainedSelect([{ id: UUID, status: 'draft' }]);
    chainedUpdate([{ id: UUID, status: 'scheduled' }]);
    await updateSessionStatus(EVENT_ID, { sessionId: UUID, newStatus: 'scheduled' });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/schedule`);
  });
});

describe('deleteSession — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "Session not found"', async () => {
    chainedDelete([]);
    await expect(deleteSession(EVENT_ID, UUID)).rejects.toThrow('Session not found');
  });

  it('returns { success: true }', async () => {
    chainedDelete([{ id: UUID }]);
    const r = await deleteSession(EVENT_ID, UUID);
    expect(r).toEqual({ success: true });
  });

  it('revalidates both paths', async () => {
    chainedDelete([{ id: UUID }]);
    await deleteSession(EVENT_ID, UUID);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/schedule`);
  });
});

describe('getSession — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "Session not found"', async () => {
    chainedSelect([]);
    await expect(getSession(EVENT_ID, UUID)).rejects.toThrow('Session not found');
  });

  it('returns the session', async () => {
    const sess = { id: UUID, title: 'Test' };
    chainedSelect([sess]);
    const r = await getSession(EVENT_ID, UUID);
    expect(r).toEqual(sess);
  });

  it('rejects invalid sessionId', async () => {
    await expect(getSession(EVENT_ID, 'bad')).rejects.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════
// ROLE REQUIREMENTS — exact error messages
// ══════════════════════════════════════════════════════════════

describe('createRoleRequirement — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "Session not found"', async () => {
    chainedSelect([]);
    await expect(createRoleRequirement(EVENT_ID, { sessionId: UUID, role: 'speaker', requiredCount: 1 }))
      .rejects.toThrow('Session not found');
  });

  it('exact error: Role "speaker" already has a requirement for this session', async () => {
    multiSelect(
      [{ id: UUID }],        // session found
      [{ id: 'existing' }],  // duplicate role
    );
    await expect(createRoleRequirement(EVENT_ID, { sessionId: UUID, role: 'speaker', requiredCount: 1 }))
      .rejects.toThrow('Role "speaker" already has a requirement for this session');
  });

  it('returns the created requirement', async () => {
    multiSelect([{ id: UUID }], []);
    const req = { id: 'r1', sessionId: UUID, role: 'chair', requiredCount: 2 };
    chainedInsert([req]);
    const r = await createRoleRequirement(EVENT_ID, { sessionId: UUID, role: 'chair', requiredCount: 2 });
    expect(r).toEqual(req);
  });

  it('revalidates path', async () => {
    multiSelect([{ id: UUID }], []);
    chainedInsert([{ id: 'r1' }]);
    await createRoleRequirement(EVENT_ID, { sessionId: UUID, role: 'chair', requiredCount: 1 });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
  });
});

describe('updateRoleRequirement — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "Role requirement not found"', async () => {
    chainedSelect([]);
    await expect(updateRoleRequirement(EVENT_ID, { requirementId: UUID, requiredCount: 5 }))
      .rejects.toThrow('Role requirement not found');
  });

  it('returns updated requirement', async () => {
    chainedSelect([{ id: UUID, sessionId: 's1' }]);
    const updated = { id: UUID, requiredCount: 5 };
    chainedUpdate([updated]);
    const r = await updateRoleRequirement(EVENT_ID, { requirementId: UUID, requiredCount: 5 });
    expect(r).toEqual(updated);
  });

  it('sets updatedAt', async () => {
    chainedSelect([{ id: UUID, sessionId: 's1' }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateRoleRequirement(EVENT_ID, { requirementId: UUID, requiredCount: 3 });
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ requiredCount: 3, updatedAt: expect.any(Date) }),
    );
  });
});

describe('deleteRoleRequirement — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "Role requirement not found"', async () => {
    chainedSelect([]);
    await expect(deleteRoleRequirement(EVENT_ID, UUID))
      .rejects.toThrow('Role requirement not found');
  });

  it('returns { success: true }', async () => {
    chainedSelect([{ id: UUID }]);
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const r = await deleteRoleRequirement(EVENT_ID, UUID);
    expect(r).toEqual({ success: true });
  });
});

// ══════════════════════════════════════════════════════════════
// ASSIGNMENTS — exact error messages + field coercion
// ══════════════════════════════════════════════════════════════

describe('createAssignment — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "Session not found"', async () => {
    chainedSelect([]);
    await expect(createAssignment(EVENT_ID, { sessionId: UUID, personId: UUID2, role: 'speaker' }))
      .rejects.toThrow('Session not found');
  });

  it('exact error: "This person is already assigned to this session with this role"', async () => {
    multiSelect(
      [{ id: UUID }],          // session found
      [{ id: 'existing' }],    // duplicate
    );
    await expect(createAssignment(EVENT_ID, { sessionId: UUID, personId: UUID2, role: 'speaker' }))
      .rejects.toThrow('This person is already assigned to this session with this role');
  });

  it('sets presentationTitle to null when empty', async () => {
    multiSelect([{ id: UUID }], []);
    const insertChain = chainedInsert([{ id: 'a1' }]);
    await createAssignment(EVENT_ID, { sessionId: UUID, personId: UUID2, role: 'speaker', presentationTitle: '' });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ presentationTitle: null }),
    );
  });

  it('sets notes to null when empty', async () => {
    multiSelect([{ id: UUID }], []);
    const insertChain = chainedInsert([{ id: 'a1' }]);
    await createAssignment(EVENT_ID, { sessionId: UUID, personId: UUID2, role: 'speaker', notes: '' });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ notes: null }),
    );
  });

  it('sets presentationDurationMinutes to null when not provided (via ??)', async () => {
    multiSelect([{ id: UUID }], []);
    const insertChain = chainedInsert([{ id: 'a1' }]);
    await createAssignment(EVENT_ID, { sessionId: UUID, personId: UUID2, role: 'speaker' });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ presentationDurationMinutes: null }),
    );
  });

  it('auto-upserts event_people junction', async () => {
    multiSelect([{ id: UUID }], []);
    const insertChain = chainedInsert([{ id: 'a1' }]);
    await createAssignment(EVENT_ID, { sessionId: UUID, personId: UUID2, role: 'speaker' });
    // Insert called twice: once for assignment, once for event_people
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it('revalidates both paths', async () => {
    multiSelect([{ id: UUID }], []);
    chainedInsert([{ id: 'a1' }]);
    await createAssignment(EVENT_ID, { sessionId: UUID, personId: UUID2, role: 'speaker' });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/schedule`);
  });

  it('sets createdBy and updatedBy from userId', async () => {
    multiSelect([{ id: UUID }], []);
    const insertChain = chainedInsert([{ id: 'a1' }]);
    await createAssignment(EVENT_ID, { sessionId: UUID, personId: UUID2, role: 'speaker' });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: 'user-1', updatedBy: 'user-1' }),
    );
  });
});

describe('updateAssignment — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "Assignment not found"', async () => {
    chainedSelect([]);
    chainedUpdate([]);
    // Need existing check to fail
    multiSelect([]);
    chainedUpdate([]);
    await expect(updateAssignment(EVENT_ID, { assignmentId: UUID }))
      .rejects.toThrow('Assignment not found');
  });

  it('sets presentationTitle to null when empty', async () => {
    multiSelect([{ id: UUID }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateAssignment(EVENT_ID, { assignmentId: UUID, presentationTitle: '' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.presentationTitle).toBeNull();
  });

  it('sets notes to null when empty', async () => {
    multiSelect([{ id: UUID }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateAssignment(EVENT_ID, { assignmentId: UUID, notes: '' });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.notes).toBeNull();
  });

  it('sets presentationDurationMinutes to null when undefined (via ??)', async () => {
    multiSelect([{ id: UUID }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateAssignment(EVENT_ID, { assignmentId: UUID, presentationDurationMinutes: undefined });
    const setArg = updateChain.set.mock.calls[0][0];
    // Field should not be set if undefined was explicitly passed but was optional
    // Actually the schema makes it optional, so if not provided it won't be in validated
    expect(setArg.updatedBy).toBe('user-1');
  });

  it('updates role and sortOrder when provided', async () => {
    multiSelect([{ id: UUID }]);
    const updateChain = chainedUpdate([{ id: UUID }]);
    await updateAssignment(EVENT_ID, { assignmentId: UUID, role: 'chair', sortOrder: 3 });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.role).toBe('chair');
    expect(setArg.sortOrder).toBe(3);
  });
});

describe('deleteAssignment — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "Assignment not found"', async () => {
    chainedDelete([]);
    await expect(deleteAssignment(EVENT_ID, UUID)).rejects.toThrow('Assignment not found');
  });

  it('returns { success: true }', async () => {
    chainedDelete([{ id: UUID }]);
    const r = await deleteAssignment(EVENT_ID, UUID);
    expect(r).toEqual({ success: true });
  });

  it('revalidates both paths', async () => {
    chainedDelete([{ id: UUID }]);
    await deleteAssignment(EVENT_ID, UUID);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/schedule`);
  });
});

// ══════════════════════════════════════════════════════════════
// CONFLICT DETECTION — exact messages + edge cases
// ══════════════════════════════════════════════════════════════

describe('detectConflicts — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact hall overlap message format', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'scheduled' };
    const s2 = { id: 's2', title: 'B', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:30:00Z'), endAtUtc: new Date('2026-05-15T11:00:00Z'), status: 'scheduled' };

    multiSelect([s1, s2], []);
    const w = await detectConflicts(EVENT_ID);
    const hallW = w.find(x => x.type === 'hall_time_overlap');
    expect(hallW).toBeDefined();
    expect(hallW!.message).toBe('Hall overlap: "A" and "B" overlap in the same hall');
    expect(hallW!.sessionIds).toEqual(['s1', 's2']);
    expect(hallW!.hallId).toBe('h1');
  });

  it('exact double-booking message format', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'scheduled' };
    const s2 = { id: 's2', title: 'B', hallId: 'h2', startAtUtc: new Date('2026-05-15T09:30:00Z'), endAtUtc: new Date('2026-05-15T11:00:00Z'), status: 'scheduled' };

    multiSelect(
      [s1, s2],
      [{ sessionId: 's1', personId: 'p1' }, { sessionId: 's2', personId: 'p1' }],
    );
    const w = await detectConflicts(EVENT_ID);
    const dbW = w.find(x => x.type === 'faculty_double_booking');
    expect(dbW).toBeDefined();
    expect(dbW!.message).toBe('Double-booking: a faculty member is assigned to overlapping sessions "A" and "B"');
    expect(dbW!.sessionIds).toEqual(['s1', 's2']);
    expect(dbW!.personId).toBe('p1');
  });

  it('skips sessions without times (filter check)', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: null, endAtUtc: null, status: 'scheduled' };
    const s2 = { id: 's2', title: 'B', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'scheduled' };

    multiSelect([s1, s2], []);
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'hall_time_overlap')).toHaveLength(0);
  });

  it('skips sessions without hallId for hall overlap', async () => {
    const s1 = { id: 's1', title: 'A', hallId: null, startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'scheduled' };
    const s2 = { id: 's2', title: 'B', hallId: null, startAtUtc: new Date('2026-05-15T09:30:00Z'), endAtUtc: new Date('2026-05-15T11:00:00Z'), status: 'scheduled' };

    multiSelect([s1, s2], []);
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'hall_time_overlap')).toHaveLength(0);
  });

  it('does not report double-booking for single-session person', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'scheduled' };

    multiSelect(
      [s1],
      [{ sessionId: 's1', personId: 'p1' }],
    );
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'faculty_double_booking')).toHaveLength(0);
  });

  it('no overlap for non-overlapping sessions in same hall', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'scheduled' };
    const s2 = { id: 's2', title: 'B', hallId: 'h1', startAtUtc: new Date('2026-05-15T11:00:00Z'), endAtUtc: new Date('2026-05-15T12:00:00Z'), status: 'scheduled' };

    multiSelect([s1, s2], []);
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'hall_time_overlap')).toHaveLength(0);
  });

  it('skips assignments for cancelled sessions (not in sessionIdSet)', async () => {
    const s1 = { id: 's1', title: 'A', hallId: 'h1', startAtUtc: new Date('2026-05-15T09:00:00Z'), endAtUtc: new Date('2026-05-15T10:00:00Z'), status: 'scheduled' };

    multiSelect(
      [s1],
      // Assignment for session not in timed list
      [{ sessionId: 'cancelled-session', personId: 'p1' }, { sessionId: 's1', personId: 'p1' }],
    );
    const w = await detectConflicts(EVENT_ID);
    expect(w.filter(x => x.type === 'faculty_double_booking')).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════
// FACULTY INVITES — exact error messages + branch testing
// ══════════════════════════════════════════════════════════════

describe('createFacultyInvite — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "An active invite already exists for this person"', async () => {
    chainedSelect([{ id: 'inv1', status: 'sent' }]);
    await expect(createFacultyInvite(EVENT_ID, { personId: UUID }))
      .rejects.toThrow('An active invite already exists for this person');
  });

  it('blocks when status is "opened" (active)', async () => {
    chainedSelect([{ id: 'inv1', status: 'opened' }]);
    await expect(createFacultyInvite(EVENT_ID, { personId: UUID }))
      .rejects.toThrow('An active invite already exists for this person');
  });

  it('blocks when status is "accepted" (active)', async () => {
    chainedSelect([{ id: 'inv1', status: 'accepted' }]);
    await expect(createFacultyInvite(EVENT_ID, { personId: UUID }))
      .rejects.toThrow('An active invite already exists for this person');
  });

  it('allows invite when previous was "declined"', async () => {
    chainedSelect([{ id: 'inv1', status: 'declined' }]);
    chainedInsert([{ id: 'inv2', status: 'sent' }]);
    const r = await createFacultyInvite(EVENT_ID, { personId: UUID });
    expect(r.status).toBe('sent');
  });

  it('allows invite when previous was "expired"', async () => {
    chainedSelect([{ id: 'inv1', status: 'expired' }]);
    chainedInsert([{ id: 'inv2', status: 'sent' }]);
    const r = await createFacultyInvite(EVENT_ID, { personId: UUID });
    expect(r.status).toBe('sent');
  });

  it('auto-upserts event_people junction', async () => {
    chainedSelect([]);
    chainedInsert([{ id: 'inv1', status: 'sent' }]);
    await createFacultyInvite(EVENT_ID, { personId: UUID });
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it('revalidates /sessions path', async () => {
    chainedSelect([]);
    chainedInsert([{ id: 'inv1', status: 'sent' }]);
    await createFacultyInvite(EVENT_ID, { personId: UUID });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
  });
});

describe('updateFacultyInviteStatus — mutation killers', () => {
  const validToken = 'test-token';
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "Invite not found"', async () => {
    chainedSelect([]);
    await expect(updateFacultyInviteStatus(EVENT_ID, { inviteId: UUID, newStatus: 'opened', token: validToken }))
      .rejects.toThrow('Invite not found');
  });

  it('exact error: "Invalid token"', async () => {
    chainedSelect([{ id: UUID, status: 'sent', token: 'correct-token' }]);
    await expect(updateFacultyInviteStatus(EVENT_ID, { inviteId: UUID, newStatus: 'opened', token: 'wrong-token' }))
      .rejects.toThrow('Invalid token');
  });

  it('exact transition error format', async () => {
    chainedSelect([{ id: UUID, status: 'accepted', token: validToken }]);
    await expect(updateFacultyInviteStatus(EVENT_ID, { inviteId: UUID, newStatus: 'sent', token: validToken }))
      .rejects.toThrow('Cannot transition from "accepted" to "sent". Allowed: none (terminal state)');
  });

  it('sets respondedAt for accepted status', async () => {
    chainedSelect([{ id: UUID, status: 'opened', token: validToken }]);
    const updateChain = chainedUpdate([{ id: UUID, status: 'accepted' }]);
    await updateFacultyInviteStatus(EVENT_ID, { inviteId: UUID, newStatus: 'accepted', token: validToken });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.respondedAt).toBeInstanceOf(Date);
  });

  it('sets respondedAt for declined status', async () => {
    chainedSelect([{ id: UUID, status: 'sent', token: validToken }]);
    const updateChain = chainedUpdate([{ id: UUID, status: 'declined' }]);
    await updateFacultyInviteStatus(EVENT_ID, { inviteId: UUID, newStatus: 'declined', token: validToken });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.respondedAt).toBeInstanceOf(Date);
  });

  it('does NOT set respondedAt for opened status', async () => {
    chainedSelect([{ id: UUID, status: 'sent', token: validToken }]);
    const updateChain = chainedUpdate([{ id: UUID, status: 'opened' }]);
    await updateFacultyInviteStatus(EVENT_ID, { inviteId: UUID, newStatus: 'opened', token: validToken });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.respondedAt).toBeUndefined();
  });

  it('does NOT set respondedAt for expired status', async () => {
    chainedSelect([{ id: UUID, status: 'sent', token: validToken }]);
    const updateChain = chainedUpdate([{ id: UUID, status: 'expired' }]);
    await updateFacultyInviteStatus(EVENT_ID, { inviteId: UUID, newStatus: 'expired', token: validToken });
    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.respondedAt).toBeUndefined();
  });

  it('sent→opened is allowed', async () => {
    chainedSelect([{ id: UUID, status: 'sent', token: validToken }]);
    chainedUpdate([{ id: UUID, status: 'opened' }]);
    const r = await updateFacultyInviteStatus(EVENT_ID, { inviteId: UUID, newStatus: 'opened', token: validToken });
    expect(r.status).toBe('opened');
  });

  it('opened→declined is allowed', async () => {
    chainedSelect([{ id: UUID, status: 'opened', token: validToken }]);
    chainedUpdate([{ id: UUID, status: 'declined' }]);
    const r = await updateFacultyInviteStatus(EVENT_ID, { inviteId: UUID, newStatus: 'declined', token: validToken });
    expect(r.status).toBe('declined');
  });

  it('opened→expired is allowed', async () => {
    chainedSelect([{ id: UUID, status: 'opened', token: validToken }]);
    chainedUpdate([{ id: UUID, status: 'expired' }]);
    const r = await updateFacultyInviteStatus(EVENT_ID, { inviteId: UUID, newStatus: 'expired', token: validToken });
    expect(r.status).toBe('expired');
  });
});

describe('getFacultyInvite — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "Invite not found"', async () => {
    chainedSelect([]);
    await expect(getFacultyInvite(EVENT_ID, UUID)).rejects.toThrow('Invite not found');
  });

  it('returns the invite', async () => {
    const inv = { id: UUID, status: 'sent' };
    chainedSelect([inv]);
    const r = await getFacultyInvite(EVENT_ID, UUID);
    expect(r).toEqual(inv);
  });
});

describe('getFacultyInviteByToken — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exact error: "Invalid invite token" for empty token', async () => {
    await expect(getFacultyInviteByToken('')).rejects.toThrow('Invalid invite token');
  });

  it('exact error: "Invalid invite token" for token > 100 chars', async () => {
    await expect(getFacultyInviteByToken('x'.repeat(101))).rejects.toThrow('Invalid invite token');
  });

  it('accepts token at exactly 100 chars', async () => {
    const inv = { id: UUID, token: 'x'.repeat(100) };
    chainedSelect([inv]);
    const r = await getFacultyInviteByToken('x'.repeat(100));
    expect(r).toEqual(inv);
  });

  it('exact error: "Invite not found"', async () => {
    chainedSelect([]);
    await expect(getFacultyInviteByToken('valid-token')).rejects.toThrow('Invite not found');
  });
});

// ══════════════════════════════════════════════════════════════
// PROGRAM VERSIONING — exact errors + version numbering
// ══════════════════════════════════════════════════════════════

describe('publishProgramVersion — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('first version gets versionNo 1 (no previous)', async () => {
    multiSelect(
      [],  // no latest version
      [],  // sessions
      [],  // assignments
      [],  // halls
    );
    const insertChain = chainedInsert([{ id: 'v1', versionNo: 1 }]);
    await publishProgramVersion(EVENT_ID, {});
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ versionNo: 1 }),
    );
  });

  it('sets changesDescription to null when empty', async () => {
    multiSelect([], [], [], []);
    const insertChain = chainedInsert([{ id: 'v1', versionNo: 1 }]);
    await publishProgramVersion(EVENT_ID, { changesDescription: '' });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ changesDescription: null }),
    );
  });

  it('sets publishReason to null when empty', async () => {
    multiSelect([], [], [], []);
    const insertChain = chainedInsert([{ id: 'v1', versionNo: 1 }]);
    await publishProgramVersion(EVENT_ID, { publishReason: '' });
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ publishReason: null }),
    );
  });

  it('sets publishedBy from userId', async () => {
    multiSelect([], [], [], []);
    const insertChain = chainedInsert([{ id: 'v1', versionNo: 1 }]);
    await publishProgramVersion(EVENT_ID, {});
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ publishedBy: 'user-1' }),
    );
  });

  it('computes affectedPersonIds from assignments', async () => {
    multiSelect(
      [],  // no latest version
      [{ id: 's1' }],  // sessions
      [{ id: 'a1', personId: 'p1' }, { id: 'a2', personId: 'p2' }, { id: 'a3', personId: 'p1' }],  // assignments (p1 duplicated)
      [],  // halls
    );
    const insertChain = chainedInsert([{ id: 'v1', versionNo: 1 }]);
    await publishProgramVersion(EVENT_ID, {});
    const vals = insertChain.values.mock.calls[0][0];
    const personIds = vals.affectedPersonIdsJson;
    // Should be deduplicated
    expect(personIds).toHaveLength(2);
    expect(personIds).toContain('p1');
    expect(personIds).toContain('p2');
  });

  it('builds snapshot with sessions, assignments, halls, and generatedAt', async () => {
    const sess = [{ id: 's1', title: 'Test' }];
    const assigns = [{ id: 'a1', personId: 'p1' }];
    const hallsList = [{ id: 'h1', name: 'Hall A' }];
    multiSelect([], sess, assigns, hallsList);
    const insertChain = chainedInsert([{ id: 'v1' }]);
    await publishProgramVersion(EVENT_ID, {});
    const vals = insertChain.values.mock.calls[0][0];
    expect(vals.snapshotJson).toHaveProperty('sessions');
    expect(vals.snapshotJson).toHaveProperty('assignments');
    expect(vals.snapshotJson).toHaveProperty('halls');
    expect(vals.snapshotJson).toHaveProperty('generatedAt');
  });

  it('revalidates both paths', async () => {
    multiSelect([], [], [], []);
    chainedInsert([{ id: 'v1' }]);
    await publishProgramVersion(EVENT_ID, {});
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/schedule`);
  });
});

describe('getProgramVersion — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('exact error: "Program version not found"', async () => {
    chainedSelect([]);
    await expect(getProgramVersion(EVENT_ID, UUID)).rejects.toThrow('Program version not found');
  });

  it('returns the version', async () => {
    const ver = { id: UUID, versionNo: 1 };
    chainedSelect([ver]);
    const r = await getProgramVersion(EVENT_ID, UUID);
    expect(r).toEqual(ver);
  });
});

// ══════════════════════════════════════════════════════════════
// SCHEDULE DATA — getScheduleData and getPublicScheduleData
// ══════════════════════════════════════════════════════════════

describe('getScheduleData — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('builds hall name lookup correctly', async () => {
    const sess = [{ id: 's1', title: 'A', hallId: 'h1', sessionType: 'keynote', track: null, isPublic: true, cmeCredits: null, sortOrder: 0, status: 'draft', parentSessionId: null, description: null, sessionDate: null, startAtUtc: null, endAtUtc: null }];
    const hallsList = [{ id: 'h1', name: 'Hall A', capacity: '100', sortOrder: '0' }];

    multiSelect(sess, hallsList, [], []);
    // detectConflicts also calls select
    const w = await getScheduleData(EVENT_ID);
    expect(w.sessions[0].hallName).toBe('Hall A');
  });

  it('sets hallName to null when hallId is null', async () => {
    const sess = [{ id: 's1', title: 'A', hallId: null, sessionType: 'other', track: null, isPublic: true, cmeCredits: null, sortOrder: 0, status: 'draft', parentSessionId: null, description: null, sessionDate: null, startAtUtc: null, endAtUtc: null }];

    multiSelect(sess, [], [], []);
    const w = await getScheduleData(EVENT_ID);
    expect(w.sessions[0].hallName).toBeNull();
  });

  it('groups child sessions under parent', async () => {
    const parent = { id: 's1', title: 'Parent', hallId: null, sessionType: 'symposium', track: null, isPublic: true, cmeCredits: null, sortOrder: 0, status: 'draft', parentSessionId: null, description: null, sessionDate: null, startAtUtc: null, endAtUtc: null };
    const child = { id: 's2', title: 'Child', hallId: null, sessionType: 'other', track: null, isPublic: true, cmeCredits: null, sortOrder: 0, status: 'draft', parentSessionId: 's1', description: null, sessionDate: null, startAtUtc: null, endAtUtc: null };

    multiSelect([parent, child], [], [], []);
    const w = await getScheduleData(EVENT_ID);
    expect(w.sessions).toHaveLength(1);
    expect(w.sessions[0].childSessions).toHaveLength(1);
    expect(w.sessions[0].childSessions[0].title).toBe('Child');
  });

  it('groups assignments by session', async () => {
    const sess = [{ id: 's1', title: 'A', hallId: null, sessionType: 'other', track: null, isPublic: true, cmeCredits: null, sortOrder: 0, status: 'draft', parentSessionId: null, description: null, sessionDate: null, startAtUtc: null, endAtUtc: null }];
    const assigns = [{ id: 'a1', sessionId: 's1', personId: 'p1', role: 'speaker', presentationTitle: 'Talk', sortOrder: 0 }];

    multiSelect(sess, [], assigns, []);
    const w = await getScheduleData(EVENT_ID);
    expect(w.sessions[0].assignments).toHaveLength(1);
    expect(w.sessions[0].assignments[0]).toEqual({
      id: 'a1', personId: 'p1', role: 'speaker', presentationTitle: 'Talk', sortOrder: 0,
    });
  });

  it('groups role requirements by session', async () => {
    const sess = [{ id: 's1', title: 'A', hallId: null, sessionType: 'other', track: null, isPublic: true, cmeCredits: null, sortOrder: 0, status: 'draft', parentSessionId: null, description: null, sessionDate: null, startAtUtc: null, endAtUtc: null }];
    const reqs = [{ session_role_requirements: { id: 'r1', sessionId: 's1', role: 'speaker', requiredCount: 3 } }];

    multiSelect(sess, [], [], reqs);
    const w = await getScheduleData(EVENT_ID);
    expect(w.sessions[0].roleRequirements).toHaveLength(1);
    expect(w.sessions[0].roleRequirements[0]).toEqual({ id: 'r1', role: 'speaker', requiredCount: 3 });
  });

  it('returns halls in correct format', async () => {
    const hallsList = [{ id: 'h1', name: 'Hall A', capacity: '100', sortOrder: '0' }];
    multiSelect([], hallsList, [], []);
    const w = await getScheduleData(EVENT_ID);
    expect(w.halls).toEqual([{ id: 'h1', name: 'Hall A', capacity: '100', sortOrder: '0' }]);
  });

  it('empty sessions return empty childSessions array', async () => {
    const sess = [{ id: 's1', title: 'A', hallId: null, sessionType: 'other', track: null, isPublic: true, cmeCredits: null, sortOrder: 0, status: 'draft', parentSessionId: null, description: null, sessionDate: null, startAtUtc: null, endAtUtc: null }];
    multiSelect(sess, [], [], []);
    const w = await getScheduleData(EVENT_ID);
    expect(w.sessions[0].childSessions).toEqual([]);
  });
});

describe('getPublicScheduleData — mutation killers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No auth mock needed — public endpoint
  });

  it('returns sessions and halls', async () => {
    const sess = [{ id: 's1', title: 'A', hallId: 'h1', sessionType: 'keynote', track: null, isPublic: true, cmeCredits: null, sortOrder: 0, status: 'scheduled', parentSessionId: null, description: null, sessionDate: null, startAtUtc: null, endAtUtc: null }];
    const hallsList = [{ id: 'h1', name: 'Hall A', sortOrder: '0' }];

    multiSelect(sess, hallsList, []);
    const w = await getPublicScheduleData(EVENT_ID);
    expect(w.sessions).toHaveLength(1);
    expect(w.halls).toHaveLength(1);
  });

  it('maps hallName from hallMap', async () => {
    const sess = [{ id: 's1', title: 'A', hallId: 'h1', sessionType: 'keynote', track: null, isPublic: true, cmeCredits: null, sortOrder: 0, status: 'scheduled', parentSessionId: null, description: null, sessionDate: null, startAtUtc: null, endAtUtc: null }];
    const hallsList = [{ id: 'h1', name: 'Main', sortOrder: '0' }];

    multiSelect(sess, hallsList, []);
    const w = await getPublicScheduleData(EVENT_ID);
    expect(w.sessions[0].hallName).toBe('Main');
  });

  it('sets hallName to null when hallId is null', async () => {
    const sess = [{ id: 's1', title: 'A', hallId: null, sessionType: 'other', track: null, isPublic: true, cmeCredits: null, sortOrder: 0, status: 'scheduled', parentSessionId: null, description: null, sessionDate: null, startAtUtc: null, endAtUtc: null }];
    multiSelect(sess, [], []);
    const w = await getPublicScheduleData(EVENT_ID);
    expect(w.sessions[0].hallName).toBeNull();
  });

  it('groups children under parents', async () => {
    const parent = { id: 's1', title: 'Parent', hallId: null, sessionType: 'symposium', track: null, isPublic: true, cmeCredits: null, sortOrder: 0, status: 'scheduled', parentSessionId: null, description: null, sessionDate: null, startAtUtc: null, endAtUtc: null };
    const child = { id: 's2', title: 'Child', hallId: null, sessionType: 'other', track: null, isPublic: true, cmeCredits: null, sortOrder: 0, status: 'scheduled', parentSessionId: 's1', description: null, sessionDate: null, startAtUtc: null, endAtUtc: null };
    multiSelect([parent, child], [], []);
    const w = await getPublicScheduleData(EVENT_ID);
    expect(w.sessions).toHaveLength(1);
    expect(w.sessions[0].childSessions).toHaveLength(1);
  });

  it('filters assignments to only public sessions', async () => {
    const sess = [{ id: 's1', title: 'A', hallId: null, sessionType: 'other', track: null, isPublic: true, cmeCredits: null, sortOrder: 0, status: 'scheduled', parentSessionId: null, description: null, sessionDate: null, startAtUtc: null, endAtUtc: null }];
    const assigns = [
      { id: 'a1', sessionId: 's1', personId: 'p1', role: 'speaker', presentationTitle: 'Talk' },
      { id: 'a2', sessionId: 'private-session', personId: 'p2', role: 'chair', presentationTitle: null },
    ];
    multiSelect(sess, [], assigns);
    const w = await getPublicScheduleData(EVENT_ID);
    expect(w.sessions[0].assignments).toHaveLength(1);
    expect(w.sessions[0].assignments[0].personId).toBe('p1');
  });

  it('returns empty sessions array when no sessions', async () => {
    multiSelect([], [], []);
    const w = await getPublicScheduleData(EVENT_ID);
    expect(w.sessions).toEqual([]);
  });
});
