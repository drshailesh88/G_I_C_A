import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAuth,
  mockDb,
  mockRevalidatePath,
  mockFindDuplicatePerson,
  mockAssertEventAccess,
  mockIsRegistrationOpen,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  mockRevalidatePath: vi.fn(),
  mockFindDuplicatePerson: vi.fn(),
  mockAssertEventAccess: vi.fn(),
  mockIsRegistrationOpen: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('./person', () => ({ findDuplicatePerson: mockFindDuplicatePerson }));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: vi.fn() }));
vi.mock('@/lib/auth/event-access', () => ({ assertEventAccess: mockAssertEventAccess }));
vi.mock('@/lib/flags', () => ({ isRegistrationOpen: mockIsRegistrationOpen }));

import { registerForEvent, updateRegistrationStatus } from './registration';

const EVENT_UUID = '550e8400-e29b-41d4-a716-446655440099';
const REG_UUID = '550e8400-e29b-41d4-a716-446655440000';

const publishedEvent = {
  id: 'event-1',
  slug: 'gem-2026',
  status: 'published',
  registrationSettings: {},
};

const baseInput = {
  fullName: 'Dr. Rajesh Kumar',
  email: 'rajesh@example.com',
  phone: '+919876543210',
};

const baseReg = {
  id: 'reg-1',
  registrationNumber: 'GEM2026-DEL-00001',
  qrCodeToken: 'abc123',
  status: 'confirmed',
  category: 'delegate',
};

/**
 * Build a select mock that cycles through sequences.
 * resetAllMocks is required before calling this.
 */
function makeSelectSequence(...sequences: unknown[][]) {
  let callCount = 0;
  mockDb.select.mockImplementation(() => {
    const rows = sequences[callCount] ?? sequences[sequences.length - 1];
    callCount++;
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockImplementation(() =>
      Object.assign(Promise.resolve(rows), chain),
    );
    chain.innerJoin = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockResolvedValue(rows);
    chain.limit = vi.fn().mockResolvedValue(rows);
    return chain;
  });
}

/**
 * Build an insert mock that captures .values() args.
 * Cycles through returnValues arrays per call.
 */
function makeInsertSequence(...returnValues: unknown[][]) {
  let callCount = 0;
  const valuesCalls: unknown[] = [];
  mockDb.insert.mockImplementation(() => {
    const rows = returnValues[callCount] ?? returnValues[returnValues.length - 1];
    callCount++;
    const chain = {
      values: vi.fn().mockImplementation((v: unknown) => {
        valuesCalls.push(v);
        return chain;
      }),
      returning: vi.fn().mockResolvedValue(rows),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    };
    return chain;
  });
  return { getValuesCalls: () => valuesCalls };
}

// No-capacity helper: event + empty existingReg + totalRegs count
function setupNoCapacity(
  overrides: { event?: object; totalRegs?: number } = {},
) {
  const event = overrides.event ?? publishedEvent;
  const totalRegs = overrides.totalRegs ?? 0;
  makeSelectSequence([event], [], [{ count: totalRegs }]);
}

// ── registerForEvent — person insert values ───────────────────────

describe('registerForEvent — person insert values', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsRegistrationOpen.mockResolvedValue(true);
    mockFindDuplicatePerson.mockResolvedValue(null);
  });

  it('inserts person with tags:[] — kills L93 ArrayDeclaration', async () => {
    setupNoCapacity();
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', baseInput);

    expect((getValuesCalls()[0] as Record<string, unknown>).tags).toEqual([]);
  });

  it('inserts person with createdBy/updatedBy system:registration — kills L94/L95', async () => {
    setupNoCapacity();
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', baseInput);

    const pv = getValuesCalls()[0] as Record<string, unknown>;
    expect(pv.createdBy).toBe('system:registration');
    expect(pv.updatedBy).toBe('system:registration');
  });

  it('inserts person with null designation when absent — kills L89 ConditionalExpression/LogicalOperator', async () => {
    setupNoCapacity();
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', baseInput);

    expect((getValuesCalls()[0] as Record<string, unknown>).designation).toBeNull();
  });

  it('inserts person with actual designation when provided — kills L89 &&→||', async () => {
    setupNoCapacity();
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', { ...baseInput, designation: 'Cardiologist' });

    expect((getValuesCalls()[0] as Record<string, unknown>).designation).toBe('Cardiologist');
  });

  it('inserts person with null specialty when absent — kills L90', async () => {
    setupNoCapacity();
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', baseInput);

    expect((getValuesCalls()[0] as Record<string, unknown>).specialty).toBeNull();
  });

  it('inserts person with actual specialty when provided — kills L90 &&→||', async () => {
    setupNoCapacity();
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', { ...baseInput, specialty: 'Oncology' });

    expect((getValuesCalls()[0] as Record<string, unknown>).specialty).toBe('Oncology');
  });

  it('inserts person with null organization when absent — kills L91', async () => {
    setupNoCapacity();
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', baseInput);

    expect((getValuesCalls()[0] as Record<string, unknown>).organization).toBeNull();
  });

  it('inserts person with actual organization when provided — kills L91 &&→||', async () => {
    setupNoCapacity();
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', { ...baseInput, organization: 'AIIMS Delhi' });

    expect((getValuesCalls()[0] as Record<string, unknown>).organization).toBe('AIIMS Delhi');
  });

  it('inserts person with null city when absent — kills L92', async () => {
    setupNoCapacity();
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', baseInput);

    expect((getValuesCalls()[0] as Record<string, unknown>).city).toBeNull();
  });

  it('inserts person with actual city when provided — kills L92 &&→||', async () => {
    setupNoCapacity();
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', { ...baseInput, city: 'Mumbai' });

    expect((getValuesCalls()[0] as Record<string, unknown>).city).toBe('Mumbai');
  });
});

// ── registerForEvent — existingPerson branch ─────────────────────

describe('registerForEvent — existingPerson branch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsRegistrationOpen.mockResolvedValue(true);
  });

  it('skips person insert and uses existing id — kills L80 BlockStatement', async () => {
    mockFindDuplicatePerson.mockResolvedValue({ id: 'existing-person-id' });
    setupNoCapacity();

    const valuesCalls: unknown[] = [];
    let insertCount = 0;
    mockDb.insert.mockImplementation(() => {
      insertCount++;
      const chain = {
        values: vi.fn().mockImplementation((v: unknown) => {
          valuesCalls.push(v);
          return chain;
        }),
        returning: vi.fn().mockResolvedValue([baseReg]),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      };
      return chain;
    });

    await registerForEvent('event-1', baseInput);

    // 2 inserts only: registration + event_people (NOT a person insert)
    expect(insertCount).toBe(2);
    expect(valuesCalls[0]).toMatchObject({ personId: 'existing-person-id' });
  });
});

// ── registerForEvent — initial status ────────────────────────────

describe('registerForEvent — initial status', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsRegistrationOpen.mockResolvedValue(true);
    mockFindDuplicatePerson.mockResolvedValue(null);
  });

  it('inserts with status confirmed when no requiresApproval — kills L113 StringLiteral "" and L115→true', async () => {
    // Kills L113 (initialStatus='' instead of 'confirmed') AND L115→true (always pending)
    setupNoCapacity();

    const valuesCalls: unknown[] = [];
    let insertCall = 0;
    mockDb.insert.mockImplementation(() => {
      insertCall++;
      const chain = {
        values: vi.fn().mockImplementation((v: unknown) => {
          valuesCalls.push(v);
          return chain;
        }),
        returning: vi.fn().mockResolvedValue(
          insertCall === 1 ? [{ id: 'p1' }] : [{ ...baseReg, status: 'confirmed' }],
        ),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      };
      return chain;
    });

    const result = await registerForEvent('event-1', baseInput);

    // Assert BOTH the insert arg AND the return value
    expect((valuesCalls[1] as Record<string, unknown>).status).toBe('confirmed');
    expect(result.status).toBe('confirmed');
  });

  it('inserts with status pending when requiresApproval:true — kills L115→false/L116', async () => {
    const approvalEvent = {
      ...publishedEvent,
      registrationSettings: { requiresApproval: true },
    };
    setupNoCapacity({ event: approvalEvent });

    const valuesCalls: unknown[] = [];
    let insertCall = 0;
    mockDb.insert.mockImplementation(() => {
      insertCall++;
      const chain = {
        values: vi.fn().mockImplementation((v: unknown) => {
          valuesCalls.push(v);
          return chain;
        }),
        returning: vi.fn().mockResolvedValue(
          insertCall === 1 ? [{ id: 'p1' }] : [{ ...baseReg, status: 'pending' }],
        ),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      };
      return chain;
    });

    const result = await registerForEvent('event-1', baseInput);

    expect((valuesCalls[1] as Record<string, unknown>).status).toBe('pending');
    expect(result.status).toBe('pending');
  });
});

// ── registerForEvent — capacity enforcement ───────────────────────

describe('registerForEvent — capacity enforcement', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsRegistrationOpen.mockResolvedValue(true);
    mockFindDuplicatePerson.mockResolvedValue(null);
  });

  it('throws when capacity full and waitlist disabled — kills L65 ConditionalExpression→false', async () => {
    const capacityEvent = {
      ...publishedEvent,
      registrationSettings: { maxCapacity: 2, enableWaitlist: false },
    };
    // Full sequence so mutation (→false) allows the function to resolve fully
    makeSelectSequence(
      [capacityEvent],
      [{ count: 2 }],
      [],
      [{ count: 2 }],
      [{ count: 0 }],
    );
    makeInsertSequence([{ id: 'p1' }], [baseReg]);

    // Explicit try/catch so we catch the case where function resolves (mutation effect)
    let resolvedUnexpectedly = false;
    try {
      await registerForEvent('event-1', baseInput);
      resolvedUnexpectedly = true;
    } catch (e) {
      expect((e as Error).message).toBe('Event has reached maximum capacity');
    }
    expect(resolvedUnexpectedly).toBe(false);
  });

  it('does not throw when count < maxCapacity — complementary path for L65', async () => {
    const capacityEvent = {
      ...publishedEvent,
      registrationSettings: { maxCapacity: 5, enableWaitlist: false },
    };
    // count=2, max=5 → not full → should proceed normally
    makeSelectSequence([capacityEvent], [{ count: 2 }], [], [{ count: 2 }], [{ count: 2 }]);
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    const result = await registerForEvent('event-1', baseInput);

    expect(result.status).toBe('confirmed');
    expect(getValuesCalls()[1]).toMatchObject({ status: 'confirmed' });
  });

  it('sets waitlisted when count >= maxCapacity and enableWaitlist:true — kills L132/L133', async () => {
    const waitlistEvent = {
      ...publishedEvent,
      registrationSettings: { maxCapacity: 3, enableWaitlist: true },
    };
    const waitlistedReg = { ...baseReg, status: 'waitlisted' };

    // event, first capacity (under → no throw), existingReg (none),
    // second capacity (at max → waitlist), totalRegs count
    makeSelectSequence(
      [waitlistEvent],
      [{ count: 1 }],
      [],
      [{ count: 3 }],
      [{ count: 5 }],
    );

    const valuesCalls: unknown[] = [];
    let insertCall = 0;
    mockDb.insert.mockImplementation(() => {
      insertCall++;
      const chain = {
        values: vi.fn().mockImplementation((v: unknown) => {
          valuesCalls.push(v);
          return chain;
        }),
        returning: vi.fn().mockResolvedValue(
          insertCall === 1 ? [{ id: 'p1' }] : [waitlistedReg],
        ),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      };
      return chain;
    });

    const result = await registerForEvent('event-1', baseInput);

    expect(result.status).toBe('waitlisted');
    // Assert the INSERTED status is 'waitlisted' — kills ConditionalExpression→false
    expect((valuesCalls[1] as Record<string, unknown>).status).toBe('waitlisted');
  });

  it('count === maxCapacity triggers waitlist (>= not >) — kills L132 EqualityOperator', async () => {
    const waitlistEvent = {
      ...publishedEvent,
      registrationSettings: { maxCapacity: 5, enableWaitlist: true },
    };
    const waitlistedReg = { ...baseReg, status: 'waitlisted' };

    // Second capacity check exactly at capacity=5
    makeSelectSequence(
      [waitlistEvent],
      [{ count: 4 }],
      [],
      [{ count: 5 }],
      [{ count: 5 }],
    );

    const valuesCalls: unknown[] = [];
    let insertCall = 0;
    mockDb.insert.mockImplementation(() => {
      insertCall++;
      const chain = {
        values: vi.fn().mockImplementation((v: unknown) => {
          valuesCalls.push(v);
          return chain;
        }),
        returning: vi.fn().mockResolvedValue(
          insertCall === 1 ? [{ id: 'p1' }] : [waitlistedReg],
        ),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      };
      return chain;
    });

    const result = await registerForEvent('event-1', baseInput);
    expect(result.status).toBe('waitlisted');
    expect((valuesCalls[1] as Record<string, unknown>).status).toBe('waitlisted');
  });

  it('does NOT waitlist when count < maxCapacity — kills L132 ConditionalExpression→true', async () => {
    const waitlistEvent = {
      ...publishedEvent,
      registrationSettings: { maxCapacity: 10, enableWaitlist: true },
    };

    // count=3 < maxCapacity=10 → should NOT waitlist even though enableWaitlist=true
    makeSelectSequence(
      [waitlistEvent],
      [{ count: 2 }], // first capacity check: under max, no throw
      [],             // existingReg: none
      [{ count: 3 }], // second capacity check: count=3 < max=10 → NOT waitlisted
      [{ count: 3 }], // totalRegs count
    );

    const valuesCalls: unknown[] = [];
    let insertCall = 0;
    mockDb.insert.mockImplementation(() => {
      insertCall++;
      const chain = {
        values: vi.fn().mockImplementation((v: unknown) => {
          valuesCalls.push(v);
          return chain;
        }),
        returning: vi.fn().mockResolvedValue(
          insertCall === 1 ? [{ id: 'p1' }] : [{ ...baseReg, status: 'confirmed' }],
        ),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      };
      return chain;
    });

    await registerForEvent('event-1', baseInput);

    // With mutation L132→true, status would be 'waitlisted'; must be 'confirmed'
    expect((valuesCalls[1] as Record<string, unknown>).status).not.toBe('waitlisted');
    expect((valuesCalls[1] as Record<string, unknown>).status).toBe('confirmed');
  });

  it('does NOT waitlist when enableWaitlist is false — kills L132 LogicalOperator ||→&&', async () => {
    const noWaitlistEvent = {
      ...publishedEvent,
      registrationSettings: { maxCapacity: 10, enableWaitlist: false },
    };

    // count=5 < max=10, enableWaitlist=false → never waitlisted
    makeSelectSequence(
      [noWaitlistEvent],
      [{ count: 4 }],
      [],
      [{ count: 5 }],
      [{ count: 5 }],
    );

    const valuesCalls: unknown[] = [];
    let insertCall = 0;
    mockDb.insert.mockImplementation(() => {
      insertCall++;
      const chain = {
        values: vi.fn().mockImplementation((v: unknown) => {
          valuesCalls.push(v);
          return chain;
        }),
        returning: vi.fn().mockResolvedValue(
          insertCall === 1 ? [{ id: 'p1' }] : [{ ...baseReg, status: 'confirmed' }],
        ),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      };
      return chain;
    });

    await registerForEvent('event-1', baseInput);

    // With mutation ||→&& (or || enableWaitlist), this would be 'waitlisted'
    expect((valuesCalls[1] as Record<string, unknown>).status).toBe('confirmed');
  });
});

// ── registerForEvent — registration insert values ─────────────────

describe('registerForEvent — registration insert values', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsRegistrationOpen.mockResolvedValue(true);
    mockFindDuplicatePerson.mockResolvedValue(null);
  });

  it('inserts registration with category:delegate — kills L157 StringLiteral ""', async () => {
    setupNoCapacity();
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', baseInput);

    expect((getValuesCalls()[1] as Record<string, unknown>).category).toBe('delegate');
  });

  it('inserts registration with createdBy/updatedBy system:registration — kills L162/L163', async () => {
    setupNoCapacity();
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', baseInput);

    const rv = getValuesCalls()[1] as Record<string, unknown>;
    expect(rv.createdBy).toBe('system:registration');
    expect(rv.updatedBy).toBe('system:registration');
  });

  it('inserts registration with provided age — kills L158 LogicalOperator &&→??', async () => {
    setupNoCapacity();
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', { ...baseInput, age: 42 });

    expect((getValuesCalls()[1] as Record<string, unknown>).age).toBe(42);
  });

  it('inserts registration with null age when absent — kills L158 LogicalOperator', async () => {
    setupNoCapacity();
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', baseInput);

    expect((getValuesCalls()[1] as Record<string, unknown>).age).toBeNull();
  });

  it('registrationNumber contains DEL (delegate) — kills L145 StringLiteral ""', async () => {
    setupNoCapacity({ totalRegs: 4 }); // seq=5
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', baseInput);

    const regNum = (getValuesCalls()[1] as Record<string, unknown>).registrationNumber as string;
    expect(regNum).toMatch(/DEL/);
  });

  it('registrationNumber uses count+1 sequence — kills L146 ArithmeticOperator -1', async () => {
    setupNoCapacity({ totalRegs: 9 }); // seq=10 (9+1), not 8 (9-1)
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', baseInput);

    const regNum = (getValuesCalls()[1] as Record<string, unknown>).registrationNumber as string;
    expect(regNum).toMatch(/00010/);
  });

  it('inserts event_people with source:registration — kills L170 StringLiteral ""', async () => {
    setupNoCapacity();
    const { getValuesCalls } = makeInsertSequence([{ id: 'p1' }], [baseReg]);

    await registerForEvent('event-1', baseInput);

    // Third insert is event_people
    expect((getValuesCalls()[2] as Record<string, unknown>).source).toBe('registration');
  });
});

// ── updateRegistrationStatus — mutation-kill tests ────────────────

describe('updateRegistrationStatus — mutation-kill tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.mockResolvedValue({ userId: 'admin-1' });
    mockAssertEventAccess.mockResolvedValue(undefined);
  });

  function chainedSelect(rows: unknown[]) {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(rows),
    };
    mockDb.select.mockReturnValue(chain);
    return chain;
  }

  it('terminal-state error contains "none (terminal state)" — kills L204 StringLiteral/ConditionalExpression/LogicalOperator', async () => {
    // cancelled is a terminal state: allowed=[]
    chainedSelect([{ id: REG_UUID, eventId: EVENT_UUID, status: 'cancelled' }]);

    await expect(
      updateRegistrationStatus({ eventId: EVENT_UUID, registrationId: REG_UUID, newStatus: 'confirmed' }),
    ).rejects.toThrow('none (terminal state)');
  });

  it('non-terminal error lists statuses with comma-space — kills L204:93 StringLiteral "" on join separator', async () => {
    // waitlisted → pending is invalid; allowed=['confirmed','declined','cancelled'] → joined with ', '
    chainedSelect([{ id: REG_UUID, eventId: EVENT_UUID, status: 'waitlisted' }]);

    await expect(
      updateRegistrationStatus({ eventId: EVENT_UUID, registrationId: REG_UUID, newStatus: 'pending' }),
    ).rejects.toThrow('confirmed, declined');
  });

  it('sets cancelledAt when transitioning to cancelled — kills L214 ConditionalExpression→false', async () => {
    chainedSelect([{ id: REG_UUID, eventId: EVENT_UUID, status: 'confirmed' }]);

    const setCapture: unknown[] = [];
    mockDb.update.mockReturnValue({
      set: vi.fn().mockImplementation((v: unknown) => { setCapture.push(v); return { where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([{ status: 'cancelled' }]) }; }),
    });

    await updateRegistrationStatus({ eventId: EVENT_UUID, registrationId: REG_UUID, newStatus: 'cancelled' });

    expect((setCapture[0] as Record<string, unknown>).cancelledAt).toBeInstanceOf(Date);
  });

  it('does NOT set cancelledAt for non-cancelled transition — kills L214 ConditionalExpression→true', async () => {
    chainedSelect([{ id: REG_UUID, eventId: EVENT_UUID, status: 'pending' }]);

    const setCapture: unknown[] = [];
    mockDb.update.mockReturnValue({
      set: vi.fn().mockImplementation((v: unknown) => { setCapture.push(v); return { where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([{ status: 'confirmed' }]) }; }),
    });

    await updateRegistrationStatus({ eventId: EVENT_UUID, registrationId: REG_UUID, newStatus: 'confirmed' });

    expect((setCapture[0] as Record<string, unknown>).cancelledAt).toBeUndefined();
  });

  it('revalidates exact registrations path — kills L224 StringLiteral ``', async () => {
    chainedSelect([{ id: REG_UUID, eventId: EVENT_UUID, status: 'pending' }]);
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ status: 'confirmed' }]),
    });

    await updateRegistrationStatus({ eventId: EVENT_UUID, registrationId: REG_UUID, newStatus: 'confirmed' });

    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_UUID}/registrations`);
  });

  it('assertEventAccess called with { requireWrite: true } — kills ObjectLiteral/BooleanLiteral mutants', async () => {
    chainedSelect([{ id: REG_UUID, eventId: EVENT_UUID, status: 'pending' }]);
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ status: 'confirmed' }]),
    });

    await updateRegistrationStatus({ eventId: EVENT_UUID, registrationId: REG_UUID, newStatus: 'confirmed' });

    expect(mockAssertEventAccess).toHaveBeenCalledWith(EVENT_UUID, { requireWrite: true });
  });
});
