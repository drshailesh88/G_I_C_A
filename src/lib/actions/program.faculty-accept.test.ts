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

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));

// Deterministic token generation for tests
vi.mock('@/lib/validations/registration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validations/registration')>();
  return {
    ...actual,
    generateQrToken: vi.fn().mockReturnValue('qr-token-deterministic'),
  };
});

import { updateFacultyInviteStatus } from './program';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440099';
const INVITE_ID = '550e8400-e29b-41d4-a716-446655440000';
const PERSON_ID = '550e8400-e29b-41d4-a716-446655440001';
const VALID_TOKEN = 'test-token-fa004';

function makeInvite(status: string) {
  return {
    id: INVITE_ID,
    eventId: EVENT_ID,
    personId: PERSON_ID,
    status,
    token: VALID_TOKEN,
    updatedAt: new Date('2026-04-17T10:00:00Z'),
  };
}

function makeEvent() {
  return { id: EVENT_ID, slug: 'gem2026-del' };
}

function makeRegistration(status = 'confirmed') {
  return {
    id: 'reg-001',
    eventId: EVENT_ID,
    personId: PERSON_ID,
    status,
    registrationNumber: 'GEM2026DEL-FAC-00001',
  };
}

// Sets up sequential db.select() calls
function setupSelectSequence(...responses: unknown[][]) {
  let call = 0;
  mockDb.select.mockImplementation(() => {
    const rows = responses[Math.min(call++, responses.length - 1)];
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockImplementation(() =>
      Object.assign(Promise.resolve(rows), chain),
    );
    chain.limit = vi.fn().mockResolvedValue(rows);
    chain.orderBy = vi.fn().mockResolvedValue(rows);
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    return chain;
  });
}

function setupUpdateOnce(rows: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.update.mockReturnValueOnce(chain);
  return chain;
}

function setupInsertOnce(rows: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  };
  mockDb.insert.mockReturnValueOnce(chain);
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────

describe('updateFacultyInviteStatus — accept creates registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertEventAccess.mockResolvedValue({ userId: 'user-1' });
  });

  it('creates a confirmed faculty registration on first-time acceptance', async () => {
    // Selects: invite, event, existing reg (none), reg count
    setupSelectSequence(
      [makeInvite('opened')],
      [makeEvent()],
      [],
      [{ count: 5 }],
    );
    // Updates: invite status
    setupUpdateOnce([{ ...makeInvite('accepted'), status: 'accepted' }]);
    // Inserts: new registration, event_people upsert
    const insertChain = setupInsertOnce([makeRegistration('confirmed')]);
    setupInsertOnce([]);

    const result = await updateFacultyInviteStatus(EVENT_ID, {
      inviteId: INVITE_ID,
      newStatus: 'accepted',
      token: VALID_TOKEN,
    });

    expect(result.status).toBe('accepted');
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: EVENT_ID,
        personId: PERSON_ID,
        category: 'faculty',
        status: 'confirmed',
        createdBy: 'system:faculty-accept',
      }),
    );
  });

  it('confirms a pending registration on acceptance (no duplicate created)', async () => {
    const pendingReg = makeRegistration('pending');
    // Selects: invite, event, existing pending reg
    setupSelectSequence(
      [makeInvite('opened')],
      [makeEvent()],
      [pendingReg],
    );
    // Updates: invite, then registration (pending -> confirmed)
    setupUpdateOnce([{ ...makeInvite('accepted'), status: 'accepted' }]);
    const regUpdateChain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ ...pendingReg, status: 'confirmed' }]),
    };
    mockDb.update.mockReturnValueOnce(regUpdateChain);
    // Insert: event_people upsert only (no registration insert)
    setupInsertOnce([]);

    const result = await updateFacultyInviteStatus(EVENT_ID, {
      inviteId: INVITE_ID,
      newStatus: 'accepted',
      token: VALID_TOKEN,
    });

    expect(result.status).toBe('accepted');
    expect(regUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'confirmed' }),
    );
    // No new registration row inserted
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  it('preserves an existing confirmed registration without inserting a duplicate', async () => {
    const confirmedReg = makeRegistration('confirmed');
    // Selects: invite, event, existing confirmed reg
    setupSelectSequence(
      [makeInvite('opened')],
      [makeEvent()],
      [confirmedReg],
    );
    setupUpdateOnce([{ ...makeInvite('accepted'), status: 'accepted' }]);
    // Insert: only event_people upsert
    setupInsertOnce([]);

    const result = await updateFacultyInviteStatus(EVENT_ID, {
      inviteId: INVITE_ID,
      newStatus: 'accepted',
      token: VALID_TOKEN,
    });

    expect(result.status).toBe('accepted');
    // Exactly one insert (event_people), no registration insert
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  it('does NOT create a registration for non-accept transitions', async () => {
    setupSelectSequence([makeInvite('sent')]);
    setupUpdateOnce([{ ...makeInvite('opened'), status: 'opened' }]);

    await updateFacultyInviteStatus(EVENT_ID, {
      inviteId: INVITE_ID,
      newStatus: 'opened',
      token: VALID_TOKEN,
    });

    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('does NOT create a registration on declined transition', async () => {
    setupSelectSequence([makeInvite('opened')]);
    setupUpdateOnce([{ ...makeInvite('declined'), status: 'declined' }]);

    await updateFacultyInviteStatus(EVENT_ID, {
      inviteId: INVITE_ID,
      newStatus: 'declined',
      token: VALID_TOKEN,
    });

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('rejects invalid token — no registration created', async () => {
    setupSelectSequence([makeInvite('sent')]);

    await expect(
      updateFacultyInviteStatus(EVENT_ID, {
        inviteId: INVITE_ID,
        newStatus: 'accepted',
        token: 'wrong-token',
      }),
    ).rejects.toThrow('Invalid token');

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('rejects expired invite — no registration created', async () => {
    setupSelectSequence([makeInvite('expired')]);

    await expect(
      updateFacultyInviteStatus(EVENT_ID, {
        inviteId: INVITE_ID,
        newStatus: 'accepted',
        token: VALID_TOKEN,
      }),
    ).rejects.toThrow('Cannot transition');

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('generates a registration number scoped to event slug', async () => {
    setupSelectSequence(
      [makeInvite('opened')],
      [makeEvent()],
      [],
      [{ count: 0 }],
    );
    setupUpdateOnce([{ ...makeInvite('accepted'), status: 'accepted' }]);
    const insertChain = setupInsertOnce([makeRegistration('confirmed')]);
    setupInsertOnce([]);

    await updateFacultyInviteStatus(EVENT_ID, {
      inviteId: INVITE_ID,
      newStatus: 'accepted',
      token: VALID_TOKEN,
    });

    const insertArg = insertChain.values.mock.calls[0][0];
    // slug 'gem2026-del' -> prefix 'GEM2026D' (8-char limit), category FAC, seq 00001
    expect(insertArg.registrationNumber).toMatch(/^GEM2026D-FAC-/);
    expect(insertArg.registrationNumber).toMatch(/00001$/);
  });
});
