/**
 * Registration Flow — Gap Coverage Tests
 * Covers: CP-01 through CP-09 from spec-01-registration-flow.md
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockDb, mockRevalidatePath, mockFindDuplicatePerson, mockAssertEventAccess, mockIsRegistrationOpen } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockFindDuplicatePerson: vi.fn(),
  mockAssertEventAccess: vi.fn(),
  mockIsRegistrationOpen: vi.fn(),
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

vi.mock('@/lib/actions/person', () => ({
  findDuplicatePerson: mockFindDuplicatePerson,
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: mockAssertEventAccess,
}));

vi.mock('@/lib/flags', () => ({
  isRegistrationOpen: mockIsRegistrationOpen,
}));

import { registerForEvent, getRegistrationPublic } from '@/lib/actions/registration';

const validInput = {
  fullName: 'Dr. Rajesh Kumar',
  email: 'rajesh@example.com',
  phone: '+919876543210',
};

// ── Helpers ─────────────────────────────────────────────────

function mockSelectSequence(calls: unknown[][]) {
  let callIdx = 0;
  mockDb.select.mockImplementation(() => {
    const rows = calls[callIdx] ?? [];
    callIdx++;
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockImplementation(() => Object.assign(Promise.resolve(rows), chain));
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue(rows);
    return chain;
  });
}

function mockInsertSequence(calls: unknown[][]) {
  let callIdx = 0;
  mockDb.insert.mockImplementation(() => {
    const rows = calls[callIdx] ?? [];
    callIdx++;
    const chain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(rows),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    };
    return chain;
  });
}

const publishedEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'event-1',
  slug: 'gem-2026',
  status: 'published',
  registrationSettings: {},
  ...overrides,
});

// ── CP-01: Feature flag closed rejects registration ─────────
describe('CP-01: Feature flag closed rejects registration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when registration_open flag is false', async () => {
    mockIsRegistrationOpen.mockResolvedValue(false);

    await expect(registerForEvent('event-1', validInput)).rejects.toThrow(
      'Registration is currently closed for this event',
    );
  });
});

// ── CP-02: Capacity full without waitlist rejects ───────────
describe('CP-02: Capacity full without waitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRegistrationOpen.mockResolvedValue(true);
  });

  it('throws when capacity reached and no waitlist', async () => {
    const event = publishedEvent({
      registrationSettings: { maxCapacity: 10, enableWaitlist: false },
    });

    // select 1: event, select 2: capacity count
    mockSelectSequence([
      [event],
      [{ count: 10 }],
    ]);

    await expect(registerForEvent('event-1', validInput)).rejects.toThrow(
      'Event has reached maximum capacity',
    );
  });
});

// ── CP-03: Capacity full with waitlist → waitlisted ─────────
describe('CP-03: Capacity full with waitlist auto-waitlists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRegistrationOpen.mockResolvedValue(true);
    mockFindDuplicatePerson.mockResolvedValue(null);
  });

  it('creates registration with status waitlisted when over capacity', async () => {
    const event = publishedEvent({
      registrationSettings: { maxCapacity: 5, enableWaitlist: true },
    });

    // select 1: event
    // select 2: capacity check (not over yet — allows past first gate)
    // select 3: existing reg check → none
    // select 4: capacity recheck for status determination
    // select 5: total count for reg number
    mockSelectSequence([
      [event],
      [{ count: 4 }],
      [],
      [{ count: 5 }],
      [{ count: 10 }],
    ]);

    const newPerson = { id: 'person-new' };
    const newReg = {
      id: 'reg-1',
      registrationNumber: 'GEM2026-DEL-00011',
      qrCodeToken: 'abc123',
      status: 'waitlisted',
    };

    mockInsertSequence([
      [newPerson],
      [newReg],
    ]);

    const result = await registerForEvent('event-1', validInput);
    expect(result.status).toBe('waitlisted');
  });
});

// ── CP-04: requiresApproval → pending ───────────────────────
describe('CP-04: requiresApproval sets status to pending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRegistrationOpen.mockResolvedValue(true);
    mockFindDuplicatePerson.mockResolvedValue(null);
  });

  it('creates registration with pending status when approval required', async () => {
    const event = publishedEvent({
      registrationSettings: { requiresApproval: true },
    });

    mockSelectSequence([
      [event],
      [],
      [{ count: 0 }],
    ]);

    const newPerson = { id: 'person-new' };
    const newReg = {
      id: 'reg-1',
      registrationNumber: 'GEM2026-DEL-00001',
      qrCodeToken: 'abc123',
      status: 'pending',
    };

    mockInsertSequence([
      [newPerson],
      [newReg],
    ]);

    const result = await registerForEvent('event-1', validInput);
    expect(result.status).toBe('pending');
  });
});

// ── CP-05: Duplicate registration rejected ──────────────────
describe('CP-05: Duplicate registration rejected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRegistrationOpen.mockResolvedValue(true);
    mockFindDuplicatePerson.mockResolvedValue({ id: 'person-1' });
  });

  it('throws when person already registered for event', async () => {
    const event = publishedEvent();

    // select 1: event
    // select 2: existing registration found
    mockSelectSequence([
      [event],
      [{ id: 'existing-reg', personId: 'person-1', status: 'confirmed' }],
    ]);

    await expect(registerForEvent('event-1', validInput)).rejects.toThrow(
      'You are already registered for this event',
    );
  });
});

// ── CP-06: Person deduplication reuses existing person ──────
describe('CP-06: Person dedup reuses existing person', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRegistrationOpen.mockResolvedValue(true);
    mockFindDuplicatePerson.mockResolvedValue({ id: 'existing-person-123' });
  });

  it('does not insert a new person when duplicate found', async () => {
    const event = publishedEvent();

    // select 1: event
    // select 2: no existing reg for this event
    // select 3: total count for reg number
    mockSelectSequence([
      [event],
      [],
      [{ count: 5 }],
    ]);

    const newReg = {
      id: 'reg-1',
      registrationNumber: 'GEM2026-DEL-00006',
      qrCodeToken: 'abc123',
      status: 'confirmed',
    };

    // Only one insert call (registration), not two (no person insert)
    mockInsertSequence([
      [newReg],
    ]);

    const result = await registerForEvent('event-1', validInput);
    expect(result.registrationId).toBe('reg-1');
    // The first insert should be for the registration, not a person
    expect(mockDb.insert).toHaveBeenCalledTimes(2); // reg + eventPeople
  });
});

// ── CP-07: getRegistrationPublic returns non-sensitive fields ─
describe('CP-07: getRegistrationPublic returns correct fields', () => {
  it('returns id, registrationNumber, status, qrCodeToken, category', async () => {
    const reg = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      registrationNumber: 'GEM2026-DEL-00001',
      status: 'confirmed',
      qrCodeToken: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef',
      category: 'delegate',
    };

    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockImplementation(() => Object.assign(Promise.resolve([reg]), chain));
    chain.limit = vi.fn().mockResolvedValue([reg]);
    mockDb.select.mockReturnValue(chain);

    const result = await getRegistrationPublic('550e8400-e29b-41d4-a716-446655440000');

    expect(result).toEqual(reg);
    expect(Object.keys(result)).toEqual(
      expect.arrayContaining(['id', 'registrationNumber', 'status', 'qrCodeToken', 'category']),
    );
  });
});

// ── CP-08: getRegistrationPublic rejects invalid UUID ───────
describe('CP-08: getRegistrationPublic rejects invalid UUID', () => {
  it('throws for non-UUID string', async () => {
    await expect(getRegistrationPublic('not-a-uuid')).rejects.toThrow();
  });
});

// ── CP-09: getRegistrationPublic throws for missing registration
describe('CP-09: getRegistrationPublic throws when not found', () => {
  it('throws Registration not found', async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockImplementation(() => Object.assign(Promise.resolve([]), chain));
    chain.limit = vi.fn().mockResolvedValue([]);
    mockDb.select.mockReturnValue(chain);

    await expect(
      getRegistrationPublic('550e8400-e29b-41d4-a716-446655440000'),
    ).rejects.toThrow('Registration not found');
  });
});
