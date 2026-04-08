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
  createAssignment,
  createFacultyInvite,
  updateFacultyInviteStatus,
  publishProgramVersion,
  detectConflicts,
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

const EVENT_ID = 'event-1';

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
        selectCallCount === 1 ? [{ id: sessionId }] : [],
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
        selectCallCount === 1 ? [{ id: sessionId }] : [{ id: 'existing-assign' }],
      );
      chain.innerJoin = vi.fn().mockReturnValue(chain);
      return chain;
    });

    await expect(
      createAssignment(EVENT_ID, { sessionId, personId, role: 'speaker' }),
    ).rejects.toThrow('already assigned');
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
    // No existing invite
    chainedSelect([]);

    const newInvite = { id: 'invite-1', eventId: EVENT_ID, personId, token: 'abc', status: 'sent' };
    chainedInsert([newInvite]);

    const result = await createFacultyInvite(EVENT_ID, { personId });
    expect(result).toEqual(newInvite);
  });

  it('throws if active invite already exists', async () => {
    chainedSelect([{ id: 'existing-invite', status: 'sent' }]);

    await expect(
      createFacultyInvite(EVENT_ID, { personId }),
    ).rejects.toThrow('active invite already exists');
  });

  it('allows new invite if previous was expired', async () => {
    chainedSelect([{ id: 'old-invite', status: 'expired' }]);

    const newInvite = { id: 'invite-2', eventId: EVENT_ID, personId, status: 'sent' };
    chainedInsert([newInvite]);

    const result = await createFacultyInvite(EVENT_ID, { personId });
    expect(result.status).toBe('sent');
  });
});

describe('updateFacultyInviteStatus', () => {
  const inviteId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('transitions sent → opened', async () => {
    chainedSelect([{ id: inviteId, status: 'sent' }]);

    const updated = { id: inviteId, status: 'opened' };
    chainedUpdate([updated]);

    const result = await updateFacultyInviteStatus(EVENT_ID, {
      inviteId,
      newStatus: 'opened',
    });
    expect(result.status).toBe('opened');
  });

  it('transitions opened → accepted', async () => {
    chainedSelect([{ id: inviteId, status: 'opened' }]);

    const updated = { id: inviteId, status: 'accepted' };
    chainedUpdate([updated]);

    const result = await updateFacultyInviteStatus(EVENT_ID, {
      inviteId,
      newStatus: 'accepted',
    });
    expect(result.status).toBe('accepted');
  });

  it('blocks invalid transition (accepted → sent)', async () => {
    chainedSelect([{ id: inviteId, status: 'accepted' }]);

    await expect(
      updateFacultyInviteStatus(EVENT_ID, { inviteId, newStatus: 'sent' }),
    ).rejects.toThrow('Cannot transition');
  });

  it('throws when invite not found', async () => {
    chainedSelect([]);

    await expect(
      updateFacultyInviteStatus(EVENT_ID, { inviteId, newStatus: 'opened' }),
    ).rejects.toThrow('Invite not found');
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
