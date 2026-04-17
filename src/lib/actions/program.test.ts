import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockDb, mockRevalidatePath, mockAssertEventAccess } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
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
  auth: mockAuth,
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
    const rows = responses[Math.min(callCount - 1, responses.length - 1)];
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

// ══════════════════════════════════════════════════════════════
// HALLS
// ══════════════════════════════════════════════════════════════

describe('createHall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('creates hall with valid input', async () => {
    const newHall = { id: 'hall-1', eventId: EVENT_ID, name: 'Hall A', capacity: '500', sortOrder: '0' };

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(selectCallCount === 1 ? [] : []);
      chain.orderBy = vi.fn().mockResolvedValue([]);
      return chain;
    });

    chainedInsert([newHall]);

    const result = await createHall(EVENT_ID, { name: 'Hall A', capacity: '500' });
    expect(result).toEqual(newHall);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/sessions`);
  });

  it('throws on duplicate hall name', async () => {
    chainedSelect([{ id: 'existing-hall' }]);

    await expect(
      createHall(EVENT_ID, { name: 'Hall A' }),
    ).rejects.toThrow('A hall with this name already exists');
  });

  it('rejects empty name', async () => {
    await expect(
      createHall(EVENT_ID, { name: '' }),
    ).rejects.toThrow();
  });
});

describe('updateHall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('updates hall capacity', async () => {
    // First select: uniqueness check returns empty
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue([]);
      return chain;
    });

    const updated = { id: '550e8400-e29b-41d4-a716-446655440000', capacity: '300' };
    chainedUpdate([updated]);

    const result = await updateHall(EVENT_ID, {
      hallId: '550e8400-e29b-41d4-a716-446655440000',
      capacity: '300',
    });
    expect(result).toEqual(updated);
  });

  it('throws when hall not found', async () => {
    chainedSelect([]);
    chainedUpdate([]);

    await expect(
      updateHall(EVENT_ID, {
        hallId: '550e8400-e29b-41d4-a716-446655440000',
        capacity: '300',
      }),
    ).rejects.toThrow('Hall not found');
  });
});

describe('deleteHall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('deletes existing hall', async () => {
    chainedDelete([{ id: 'hall-1' }]);

    const result = await deleteHall(EVENT_ID, '550e8400-e29b-41d4-a716-446655440000');
    expect(result).toEqual({ success: true });
  });

  it('throws when hall not found', async () => {
    chainedDelete([]);

    await expect(
      deleteHall(EVENT_ID, '550e8400-e29b-41d4-a716-446655440000'),
    ).rejects.toThrow('Hall not found');
  });
});

// ══════════════════════════════════════════════════════════════
// SESSIONS
// ══════════════════════════════════════════════════════════════

describe('createSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  const validInput = {
    title: 'Keynote: AI in Medicine',
    sessionDate: '2026-05-15',
    startTime: '09:00',
    endTime: '10:30',
    sessionType: 'keynote' as const,
  };

  it('creates session with valid input', async () => {
    const newSession = { id: 'session-1', ...validInput };
    chainedInsert([newSession]);

    const result = await createSession(EVENT_ID, validInput);
    expect(result).toEqual(newSession);
  });

  it('validates parent session one-level-only', async () => {
    const parentId = '550e8400-e29b-41d4-a716-446655440000';

    // Parent already has a parent → should reject
    chainedSelect([{ id: parentId, parentSessionId: 'some-grandparent' }]);

    await expect(
      createSession(EVENT_ID, { ...validInput, parentSessionId: parentId }),
    ).rejects.toThrow('Cannot nest more than one level deep');
  });

  it('validates parent session exists', async () => {
    const parentId = '550e8400-e29b-41d4-a716-446655440000';
    chainedSelect([]);

    await expect(
      createSession(EVENT_ID, { ...validInput, parentSessionId: parentId }),
    ).rejects.toThrow('Parent session not found');
  });

  it('rejects invalid input', async () => {
    await expect(
      createSession(EVENT_ID, { title: '' }),
    ).rejects.toThrow();
  });
});

describe('updateSessionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('transitions draft → scheduled', async () => {
    const session = { id: '550e8400-e29b-41d4-a716-446655440000', status: 'draft' };
    chainedSelect([session]);

    const updated = { ...session, status: 'scheduled' };
    chainedUpdate([updated]);

    const result = await updateSessionStatus(EVENT_ID, {
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      newStatus: 'scheduled',
    });
    expect(result.status).toBe('scheduled');
  });

  it('blocks invalid transition (completed → draft)', async () => {
    const session = { id: '550e8400-e29b-41d4-a716-446655440000', status: 'completed' };
    chainedSelect([session]);

    await expect(
      updateSessionStatus(EVENT_ID, {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        newStatus: 'draft',
      }),
    ).rejects.toThrow('Cannot transition');
  });

  it('throws when session not found', async () => {
    chainedSelect([]);

    await expect(
      updateSessionStatus(EVENT_ID, {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        newStatus: 'scheduled',
      }),
    ).rejects.toThrow('Session not found');
  });
});

describe('deleteSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('deletes existing session', async () => {
    chainedDelete([{ id: 'session-1' }]);

    const result = await deleteSession(EVENT_ID, '550e8400-e29b-41d4-a716-446655440000');
    expect(result).toEqual({ success: true });
  });

  it('throws when session not found', async () => {
    chainedDelete([]);

    await expect(
      deleteSession(EVENT_ID, '550e8400-e29b-41d4-a716-446655440000'),
    ).rejects.toThrow('Session not found');
  });
});

// ══════════════════════════════════════════════════════════════
// ROLE REQUIREMENTS
// ══════════════════════════════════════════════════════════════

describe('createRoleRequirement', () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('creates role requirement', async () => {
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(
        selectCallCount === 1 ? [{ id: sessionId }] : [],
      );
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      return chain;
    });

    const newReq = { id: 'req-1', sessionId, role: 'speaker', requiredCount: 3 };
    chainedInsert([newReq]);

    const result = await createRoleRequirement(EVENT_ID, {
      sessionId,
      role: 'speaker',
      requiredCount: 3,
    });
    expect(result).toEqual(newReq);
  });

  it('rejects duplicate role for same session', async () => {
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(
        selectCallCount === 1 ? [{ id: sessionId }] : [{ id: 'existing-req' }],
      );
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      return chain;
    });

    await expect(
      createRoleRequirement(EVENT_ID, { sessionId, role: 'speaker', requiredCount: 2 }),
    ).rejects.toThrow('already has a requirement');
  });
});

// ══════════════════════════════════════════════════════════════
// ASSIGNMENTS
// ══════════════════════════════════════════════════════════════

describe('createAssignment', () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440000';
  const personId = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('creates assignment with valid input', async () => {
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(
        selectCallCount === 1
          ? [{ id: sessionId }]
          : selectCallCount === 2
            ? [{ id: personId }]
            : [],
      );
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      return chain;
    });

    const newAssignment = { id: 'assign-1', sessionId, personId, role: 'speaker' };
    chainedInsert([newAssignment]);

    const result = await createAssignment(EVENT_ID, {
      sessionId,
      personId,
      role: 'speaker',
    });
    expect(result).toEqual(newAssignment);
  });

  it('rejects duplicate assignment', async () => {
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(
        selectCallCount === 1
          ? [{ id: sessionId }]
          : selectCallCount === 2
            ? [{ id: personId }]
            : [{ id: 'existing-assign' }],
      );
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      return chain;
    });

    await expect(
      createAssignment(EVENT_ID, { sessionId, personId, role: 'speaker' }),
    ).rejects.toThrow('already assigned');
  });

  it('rejects archived or anonymized people', async () => {
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(
        selectCallCount === 1 ? [{ id: sessionId }] : [],
      );
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      return chain;
    });

    await expect(
      createAssignment(EVENT_ID, { sessionId, personId, role: 'speaker' }),
    ).rejects.toThrow('Person not found');
  });
});

// ══════════════════════════════════════════════════════════════
// CONFLICT DETECTION
// ══════════════════════════════════════════════════════════════

describe('detectConflicts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('detects hall time overlap', async () => {
    const hallId = 'hall-1';
    const sessionA = {
      id: 'session-a',
      title: 'Session A',
      hallId,
      startAtUtc: new Date('2026-05-15T09:00:00Z'),
      endAtUtc: new Date('2026-05-15T10:30:00Z'),
      status: 'scheduled',
    };
    const sessionB = {
      id: 'session-b',
      title: 'Session B',
      hallId,
      startAtUtc: new Date('2026-05-15T10:00:00Z'),
      endAtUtc: new Date('2026-05-15T11:30:00Z'),
      status: 'scheduled',
    };

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockImplementation(() => {
        return Object.assign(Promise.resolve(
          selectCallCount === 1 ? [sessionA, sessionB] : [],
        ), chain);
      });
      chain.limit = vi.fn().mockResolvedValue(
        selectCallCount === 1 ? [sessionA, sessionB] : [],
      );
      chain.orderBy = vi.fn().mockResolvedValue(
        selectCallCount === 1 ? [sessionA, sessionB] : [],
      );
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      return chain;
    });

    const warnings = await detectConflicts(EVENT_ID);
    expect(warnings.some(w => w.type === 'hall_time_overlap')).toBe(true);
  });

  it('detects faculty double-booking', async () => {
    const personId = 'person-1';
    const sessionA = {
      id: 'session-a',
      title: 'Session A',
      hallId: 'hall-1',
      startAtUtc: new Date('2026-05-15T09:00:00Z'),
      endAtUtc: new Date('2026-05-15T10:30:00Z'),
      status: 'scheduled',
    };
    const sessionB = {
      id: 'session-b',
      title: 'Session B',
      hallId: 'hall-2',
      startAtUtc: new Date('2026-05-15T10:00:00Z'),
      endAtUtc: new Date('2026-05-15T11:30:00Z'),
      status: 'scheduled',
    };

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockImplementation(() => {
        if (selectCallCount === 1) {
          return Object.assign(Promise.resolve([sessionA, sessionB]), chain);
        }
        return Object.assign(
          Promise.resolve([
            { sessionId: 'session-a', personId },
            { sessionId: 'session-b', personId },
          ]),
          chain,
        );
      });
      chain.limit = vi.fn().mockResolvedValue([sessionA, sessionB]);
      chain.orderBy = vi.fn().mockResolvedValue([sessionA, sessionB]);
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      return chain;
    });

    const warnings = await detectConflicts(EVENT_ID);
    expect(warnings.some(w => w.type === 'faculty_double_booking')).toBe(true);
  });

  it('no conflicts for adjacent sessions', async () => {
    const hallId = 'hall-1';
    const sessionA = {
      id: 'session-a',
      title: 'Session A',
      hallId,
      startAtUtc: new Date('2026-05-15T09:00:00Z'),
      endAtUtc: new Date('2026-05-15T10:00:00Z'),
      status: 'scheduled',
    };
    const sessionB = {
      id: 'session-b',
      title: 'Session B',
      hallId,
      startAtUtc: new Date('2026-05-15T10:00:00Z'),
      endAtUtc: new Date('2026-05-15T11:00:00Z'),
      status: 'scheduled',
    };

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockImplementation(() => {
        return Object.assign(Promise.resolve(
          selectCallCount === 1 ? [sessionA, sessionB] : [],
        ), chain);
      });
      chain.limit = vi.fn().mockResolvedValue(
        selectCallCount === 1 ? [sessionA, sessionB] : [],
      );
      chain.orderBy = vi.fn().mockResolvedValue(
        selectCallCount === 1 ? [sessionA, sessionB] : [],
      );
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      return chain;
    });

    const warnings = await detectConflicts(EVENT_ID);
    // Adjacent = no overlap (A ends at 10:00, B starts at 10:00)
    expect(warnings.filter(w => w.type === 'hall_time_overlap')).toHaveLength(0);
  });

  it('returns empty array when no sessions', async () => {
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockImplementation(() => {
        return Object.assign(Promise.resolve([]), chain);
      });
      chain.limit = vi.fn().mockResolvedValue([]);
      chain.orderBy = vi.fn().mockResolvedValue([]);
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      return chain;
    });

    const warnings = await detectConflicts(EVENT_ID);
    expect(warnings).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════
// FACULTY INVITES
// ══════════════════════════════════════════════════════════════

describe('createFacultyInvite', () => {
  const personId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('creates invite for new person', async () => {
    multiSelect([{ id: personId }], []);

    const newInvite = { id: 'invite-1', eventId: EVENT_ID, personId, token: 'abc', status: 'sent' };
    chainedInsert([newInvite]);

    const result = await createFacultyInvite(EVENT_ID, { personId });
    expect(result).toEqual(newInvite);
  });

  it('throws if active invite already exists', async () => {
    multiSelect([{ id: personId }], [{ id: 'existing-invite', status: 'sent' }]);

    await expect(
      createFacultyInvite(EVENT_ID, { personId }),
    ).rejects.toThrow('active invite already exists');
  });

  it('allows new invite if previous was expired', async () => {
    multiSelect([{ id: personId }], [{ id: 'old-invite', status: 'expired' }]);

    const newInvite = { id: 'invite-2', eventId: EVENT_ID, personId, status: 'sent' };
    chainedInsert([newInvite]);

    const result = await createFacultyInvite(EVENT_ID, { personId });
    expect(result.status).toBe('sent');
  });

  it('rejects archived or anonymized people', async () => {
    chainedSelect([]);

    await expect(
      createFacultyInvite(EVENT_ID, { personId }),
    ).rejects.toThrow('Person not found');
  });
});

describe('updateFacultyInviteStatus', () => {
  const inviteId = '550e8400-e29b-41d4-a716-446655440000';
  const validToken = 'test-token-abc123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('transitions sent → opened', async () => {
    chainedSelect([{ id: inviteId, status: 'sent', token: validToken }]);

    const updated = { id: inviteId, status: 'opened' };
    chainedUpdate([updated]);

    const result = await updateFacultyInviteStatus(EVENT_ID, {
      inviteId,
      newStatus: 'opened',
      token: validToken,
    });
    expect(result.status).toBe('opened');
  });

  it('transitions opened → accepted', async () => {
    chainedSelect([{ id: inviteId, status: 'opened', token: validToken }]);

    const updated = { id: inviteId, status: 'accepted' };
    chainedUpdate([updated]);

    const result = await updateFacultyInviteStatus(EVENT_ID, {
      inviteId,
      newStatus: 'accepted',
      token: validToken,
    });
    expect(result.status).toBe('accepted');
  });

  it('blocks invalid transition (accepted → sent)', async () => {
    chainedSelect([{ id: inviteId, status: 'accepted', token: validToken }]);

    await expect(
      updateFacultyInviteStatus(EVENT_ID, { inviteId, newStatus: 'sent', token: validToken }),
    ).rejects.toThrow('Cannot transition');
  });

  it('throws when invite not found', async () => {
    chainedSelect([]);

    await expect(
      updateFacultyInviteStatus(EVENT_ID, { inviteId, newStatus: 'opened', token: validToken }),
    ).rejects.toThrow('Invite not found');
  });

  it('rejects invalid token', async () => {
    chainedSelect([{ id: inviteId, status: 'sent', token: validToken }]);

    await expect(
      updateFacultyInviteStatus(EVENT_ID, { inviteId, newStatus: 'opened', token: 'wrong-token' }),
    ).rejects.toThrow('Invalid token');
  });

  it('blocks stale concurrent status updates', async () => {
    chainedSelect([{
      id: inviteId,
      status: 'sent',
      token: validToken,
      updatedAt: new Date('2026-05-15T09:00:00Z'),
    }]);
    chainedUpdate([]);

    await expect(
      updateFacultyInviteStatus(EVENT_ID, {
        inviteId,
        newStatus: 'accepted',
        token: validToken,
      }),
    ).rejects.toThrow('stale conflict');
  });
});

// ══════════════════════════════════════════════════════════════
// PROGRAM VERSIONING
// ══════════════════════════════════════════════════════════════

describe('publishProgramVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('creates first version (v1)', async () => {
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockImplementation(() => {
        // For Promise.all — 3 parallel selects after the first (latest version)
        return Object.assign(Promise.resolve([]), chain);
      });
      chain.limit = vi.fn().mockResolvedValue([]);
      chain.orderBy = vi.fn().mockReturnValue(chain);
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      return chain;
    });

    const version = { id: 'ver-1', versionNo: 1, eventId: EVENT_ID };
    chainedInsert([version]);

    const result = await publishProgramVersion(EVENT_ID, {
      changesDescription: 'Initial program',
    });
    expect(result).toEqual(version);
  });
});

// ══════════════════════════════════════════════════════════════
// GAP TESTS — updateSession
// ══════════════════════════════════════════════════════════════

describe('updateSession', () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('updates session title', async () => {
    // Select: existing session
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(
        selectCallCount === 1 ? [{ id: sessionId, parentSessionId: null }] : [],
      );
      return chain;
    });

    const updated = { id: sessionId, title: 'Updated Title' };
    chainedUpdate([updated]);

    const result = await updateSession(EVENT_ID, { sessionId, title: 'Updated Title' });
    expect(result).toEqual(updated);
  });

  it('throws when session not found', async () => {
    chainedSelect([]);

    await expect(
      updateSession(EVENT_ID, { sessionId, title: 'X' }),
    ).rejects.toThrow('Session not found');
  });

  it('rejects self-referencing parent', async () => {
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(
        selectCallCount === 1
          ? [{ id: sessionId, parentSessionId: null }] // existing session
          : [{ id: sessionId, parentSessionId: null }], // parent lookup returns self
      );
      return chain;
    });

    await expect(
      updateSession(EVENT_ID, { sessionId, parentSessionId: sessionId }),
    ).rejects.toThrow('cannot be its own parent');
  });

  it('enforces one-level hierarchy on parent change', async () => {
    const newParentId = '550e8400-e29b-41d4-a716-446655440001';

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(
        selectCallCount === 1
          ? [{ id: sessionId, parentSessionId: null }] // existing session
          : [{ id: newParentId, parentSessionId: 'some-grandparent' }], // parent already has parent
      );
      return chain;
    });

    await expect(
      updateSession(EVENT_ID, { sessionId, parentSessionId: newParentId }),
    ).rejects.toThrow('Cannot nest more than one level deep');
  });

  it('validates hall exists on update', async () => {
    const badHallId = '550e8400-e29b-41d4-a716-446655440002';

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(
        selectCallCount === 1
          ? [{ id: sessionId, parentSessionId: null }] // existing session
          : [], // hall not found
      );
      return chain;
    });

    await expect(
      updateSession(EVENT_ID, { sessionId, hallId: badHallId }),
    ).rejects.toThrow('Hall not found');
  });
});

// ══════════════════════════════════════════════════════════════
// GAP TESTS — Read actions
// ══════════════════════════════════════════════════════════════

describe('getSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('returns session by ID', async () => {
    const session = { id: '550e8400-e29b-41d4-a716-446655440000', title: 'Test' };
    chainedSelect([session]);

    const result = await getSession(EVENT_ID, '550e8400-e29b-41d4-a716-446655440000');
    expect(result).toEqual(session);
  });

  it('throws when not found', async () => {
    chainedSelect([]);

    await expect(
      getSession(EVENT_ID, '550e8400-e29b-41d4-a716-446655440000'),
    ).rejects.toThrow('Session not found');
  });
});

describe('getSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('returns ordered session list', async () => {
    const sessions = [
      { id: 's1', title: 'First', sortOrder: 0 },
      { id: 's2', title: 'Second', sortOrder: 1 },
    ];
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(sessions),
    };
    mockDb.select.mockReturnValue(chain);

    const result = await getSessions(EVENT_ID);
    expect(result).toEqual(sessions);
    expect(result).toHaveLength(2);
  });
});

describe('getHalls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('returns ordered hall list', async () => {
    const hallList = [
      { id: 'h1', name: 'Hall A', sortOrder: '0' },
      { id: 'h2', name: 'Hall B', sortOrder: '1' },
    ];
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(hallList),
    };
    mockDb.select.mockReturnValue(chain);

    const result = await getHalls(EVENT_ID);
    expect(result).toEqual(hallList);
  });
});

// ══════════════════════════════════════════════════════════════
// GAP TESTS — Role Requirements (update + delete)
// ══════════════════════════════════════════════════════════════

describe('updateRoleRequirement', () => {
  const requirementId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('updates requirement count', async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: requirementId, sessionId: 's1' }]),
      innerJoin: vi.fn().mockReturnThis(),
    };
    mockDb.select.mockReturnValue(chain);

    const updated = { id: requirementId, requiredCount: 5 };
    chainedUpdate([updated]);

    const result = await updateRoleRequirement(EVENT_ID, {
      requirementId,
      requiredCount: 5,
    });
    expect(result).toEqual(updated);
  });

  it('throws when requirement not found', async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      innerJoin: vi.fn().mockReturnThis(),
    };
    mockDb.select.mockReturnValue(chain);

    await expect(
      updateRoleRequirement(EVENT_ID, { requirementId, requiredCount: 3 }),
    ).rejects.toThrow('Role requirement not found');
  });
});

describe('deleteRoleRequirement', () => {
  const requirementId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('deletes requirement with ownership check', async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: requirementId }]),
      innerJoin: vi.fn().mockReturnThis(),
    };
    mockDb.select.mockReturnValue(chain);

    const deleteChain = {
      where: vi.fn().mockResolvedValue(undefined),
    };
    mockDb.delete.mockReturnValue(deleteChain);

    const result = await deleteRoleRequirement(EVENT_ID, requirementId);
    expect(result).toEqual({ success: true });
  });

  it('throws when requirement not found', async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
      innerJoin: vi.fn().mockReturnThis(),
    };
    mockDb.select.mockReturnValue(chain);

    await expect(
      deleteRoleRequirement(EVENT_ID, requirementId),
    ).rejects.toThrow('Role requirement not found');
  });
});

describe('getSessionRoleRequirements', () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('returns requirements for session', async () => {
    const reqs = [{ id: 'r1', role: 'speaker', requiredCount: 2 }];
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(reqs),
      innerJoin: vi.fn().mockReturnThis(),
    };
    mockDb.select.mockReturnValue(chain);

    const result = await getSessionRoleRequirements(EVENT_ID, sessionId);
    expect(result).toEqual(reqs);
  });
});

// ══════════════════════════════════════════════════════════════
// GAP TESTS — Assignments (update + delete + list)
// ══════════════════════════════════════════════════════════════

describe('updateAssignment', () => {
  const assignmentId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('updates assignment fields', async () => {
    chainedSelect([{ id: assignmentId, role: 'speaker' }]);

    const updated = { id: assignmentId, role: 'chair', presentationTitle: 'New Title' };
    chainedUpdate([updated]);

    const result = await updateAssignment(EVENT_ID, {
      assignmentId,
      role: 'chair',
      presentationTitle: 'New Title',
    });
    expect(result).toEqual(updated);
  });

  it('throws when assignment not found', async () => {
    chainedSelect([]);

    await expect(
      updateAssignment(EVENT_ID, { assignmentId, role: 'chair' }),
    ).rejects.toThrow('Assignment not found');
  });
});

describe('deleteAssignment', () => {
  const assignmentId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('deletes existing assignment', async () => {
    chainedDelete([{ id: assignmentId }]);

    const result = await deleteAssignment(EVENT_ID, assignmentId);
    expect(result).toEqual({ success: true });
  });

  it('throws when assignment not found', async () => {
    chainedDelete([]);

    await expect(
      deleteAssignment(EVENT_ID, assignmentId),
    ).rejects.toThrow('Assignment not found');
  });
});

describe('getSessionAssignments', () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('returns assignments ordered by sortOrder', async () => {
    const assignments = [
      { id: 'a1', role: 'chair', sortOrder: 0 },
      { id: 'a2', role: 'speaker', sortOrder: 1 },
    ];
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(assignments),
    };
    mockDb.select.mockReturnValue(chain);

    const result = await getSessionAssignments(EVENT_ID, sessionId);
    expect(result).toEqual(assignments);
  });
});

// ══════════════════════════════════════════════════════════════
// GAP TESTS — Faculty Invite reads
// ══════════════════════════════════════════════════════════════

describe('getFacultyInvite', () => {
  const inviteId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('returns invite by ID', async () => {
    const invite = { id: inviteId, status: 'sent' };
    chainedSelect([invite]);

    const result = await getFacultyInvite(EVENT_ID, inviteId);
    expect(result).toEqual(invite);
  });

  it('throws when not found', async () => {
    chainedSelect([]);

    await expect(
      getFacultyInvite(EVENT_ID, inviteId),
    ).rejects.toThrow('Invite not found');
  });
});

describe('getFacultyInviteByToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns invite by token (no auth needed)', async () => {
    const invite = { id: 'inv-1', token: 'valid-token', status: 'sent' };
    chainedSelect([invite]);

    const result = await getFacultyInviteByToken('valid-token');
    expect(result).toEqual(invite);
    expect(mockAssertEventAccess).not.toHaveBeenCalled();
  });

  it('throws when invite not found', async () => {
    chainedSelect([]);

    await expect(
      getFacultyInviteByToken('nonexistent-token'),
    ).rejects.toThrow('Invite not found');
  });

  it('rejects empty token', async () => {
    await expect(
      getFacultyInviteByToken(''),
    ).rejects.toThrow('Invalid invite token');
  });

  it('rejects excessively long token', async () => {
    await expect(
      getFacultyInviteByToken('x'.repeat(101)),
    ).rejects.toThrow('Invalid invite token');
  });
});

describe('getEventFacultyInvites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('returns all invites for event', async () => {
    const invites = [
      { id: 'i1', status: 'sent' },
      { id: 'i2', status: 'accepted' },
    ];
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(invites),
    };
    mockDb.select.mockReturnValue(chain);

    const result = await getEventFacultyInvites(EVENT_ID);
    expect(result).toEqual(invites);
  });
});

// ══════════════════════════════════════════════════════════════
// GAP TESTS — Program Version reads
// ══════════════════════════════════════════════════════════════

describe('getProgramVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('returns versions ordered by versionNo desc', async () => {
    const versions = [
      { id: 'v2', versionNo: 2 },
      { id: 'v1', versionNo: 1 },
    ];
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(versions),
    };
    mockDb.select.mockReturnValue(chain);

    const result = await getProgramVersions(EVENT_ID);
    expect(result).toEqual(versions);
  });
});

describe('getProgramVersion', () => {
  const versionId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('returns specific version', async () => {
    const version = { id: versionId, versionNo: 1 };
    chainedSelect([version]);

    const result = await getProgramVersion(EVENT_ID, versionId);
    expect(result).toEqual(version);
  });

  it('throws when not found', async () => {
    chainedSelect([]);

    await expect(
      getProgramVersion(EVENT_ID, versionId),
    ).rejects.toThrow('Program version not found');
  });
});

// ══════════════════════════════════════════════════════════════
// GAP TESTS — Session cancellation sets cancelledAt
// ══════════════════════════════════════════════════════════════

describe('updateSessionStatus (cancelledAt)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('sets cancelledAt when transitioning to cancelled', async () => {
    const sessionId = '550e8400-e29b-41d4-a716-446655440000';
    const session = { id: sessionId, status: 'draft' };
    chainedSelect([session]);

    const updatedSession = { id: sessionId, status: 'cancelled', cancelledAt: new Date() };
    const updateChain = chainedUpdate([updatedSession]);

    await updateSessionStatus(EVENT_ID, { sessionId, newStatus: 'cancelled' });

    // Verify set() was called with cancelledAt
    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.status).toBe('cancelled');
    expect(setCall.cancelledAt).toBeInstanceOf(Date);
  });

  it('does not set cancelledAt for non-cancel transitions', async () => {
    const sessionId = '550e8400-e29b-41d4-a716-446655440000';
    const session = { id: sessionId, status: 'draft' };
    chainedSelect([session]);

    const updatedSession = { id: sessionId, status: 'scheduled' };
    const updateChain = chainedUpdate([updatedSession]);

    await updateSessionStatus(EVENT_ID, { sessionId, newStatus: 'scheduled' });

    const setCall = updateChain.set.mock.calls[0][0];
    expect(setCall.status).toBe('scheduled');
    expect(setCall.cancelledAt).toBeUndefined();
  });

  it('blocks stale concurrent status transitions', async () => {
    const sessionId = '550e8400-e29b-41d4-a716-446655440000';
    const session = {
      id: sessionId,
      status: 'scheduled',
      updatedAt: new Date('2026-05-15T09:00:00Z'),
    };
    chainedSelect([session]);
    chainedUpdate([]);

    await expect(
      updateSessionStatus(EVENT_ID, { sessionId, newStatus: 'completed' }),
    ).rejects.toThrow('stale conflict');
  });
});

describe('program action hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects org:ops writes for program actions', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:ops' });

    await expect(
      createHall(EVENT_ID, { name: 'Hall A' }),
    ).rejects.toThrow('Forbidden');
  });

  it('rejects org:ops reads for protected program actions', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1', role: 'org:ops' });

    await expect(getSessions(EVENT_ID)).rejects.toThrow('Forbidden');
  });

  it('rejects malformed event IDs before auth or database access', async () => {
    await expect(getSessions('not-a-uuid')).rejects.toThrow('Invalid event ID');
    expect(mockAssertEventAccess).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects malformed event IDs in public schedule reads before database access', async () => {
    await expect(getPublicScheduleData('not-a-uuid')).rejects.toThrow('Invalid event ID');
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('blocks stale concurrent session edits', async () => {
    mockAssertEventAccess.mockResolvedValue({
      userId: 'user-1',
      role: 'org:event_coordinator',
    });
    chainedSelect([{
      id: '550e8400-e29b-41d4-a716-446655440000',
      parentSessionId: null,
      updatedAt: new Date('2026-05-15T09:00:00Z'),
    }]);
    chainedUpdate([]);

    await expect(
      updateSession(EVENT_ID, {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Updated title',
      }),
    ).rejects.toThrow('stale conflict');
  });
});
