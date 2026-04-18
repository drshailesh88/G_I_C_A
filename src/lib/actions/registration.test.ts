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

vi.mock('./person', () => ({
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

import { registerForEvent, updateRegistrationStatus, getEventRegistrations } from './registration';

const EVENT_UUID = '550e8400-e29b-41d4-a716-446655440099';

// Chain helpers
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

describe('registerForEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRegistrationOpen.mockResolvedValue(true);
  });

  it('creates registration for published event', async () => {
    const event = {
      id: 'event-1',
      slug: 'gem-2026',
      status: 'published',
      registrationSettings: {},
    };

    // Call sequence: get event → check existing reg → count for seq → insert person → insert reg → insert event_people
    // We need to mock multiple select calls
    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const makeChain = (resolveValue: unknown) => {
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockImplementation(() => {
          // If there's no .limit() call after .where(), resolve directly
          return Object.assign(Promise.resolve(resolveValue), chain);
        });
        chain.innerJoin = vi.fn().mockReturnValue(chain);
        chain.orderBy = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockResolvedValue(resolveValue);
        return chain;
      };

      if (selectCallCount === 1) {
        return makeChain([event]);
      } else if (selectCallCount === 2) {
        return makeChain([]);
      } else {
        return makeChain([{ count: 0 }]);
      }
    });

    mockFindDuplicatePerson.mockResolvedValue(null);

    const newPerson = { id: 'person-new', fullName: 'Test' };
    const newReg = {
      id: 'reg-1',
      registrationNumber: 'GEM2026-DEL-00001',
      qrCodeToken: 'abc123',
      status: 'confirmed',
    };

    let insertCallCount = 0;
    mockDb.insert.mockImplementation(() => {
      insertCallCount++;
      const chain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn(),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      };

      if (insertCallCount === 1) {
        // Insert person
        chain.returning.mockResolvedValue([newPerson]);
      } else if (insertCallCount === 2) {
        // Insert registration
        chain.returning.mockResolvedValue([newReg]);
      }

      return chain;
    });

    const result = await registerForEvent('event-1', {
      fullName: 'Dr. Rajesh Kumar',
      email: 'rajesh@example.com',
      phone: '+919876543210',
    });

    expect(result.registrationNumber).toBeTruthy();
    expect(result.qrCodeToken).toBeTruthy();
    expect(result.status).toBe('confirmed');
  });

  it('throws for unpublished event', async () => {
    const event = { id: 'event-1', status: 'draft', registrationSettings: {} };
    chainedSelect([event]);

    await expect(
      registerForEvent('event-1', {
        fullName: 'Test',
        email: 'test@example.com',
        phone: '+919876543210',
      }),
    ).rejects.toThrow('Event is not accepting registrations');
  });

  it('throws when event not found', async () => {
    chainedSelect([]);

    await expect(
      registerForEvent('event-1', {
        fullName: 'Test',
        email: 'test@example.com',
        phone: '+919876543210',
      }),
    ).rejects.toThrow('Event not found');
  });

  it('uses approvalRequired from registration settings UI to create pending registrations', async () => {
    const event = {
      id: 'event-1',
      slug: 'gem-2026',
      status: 'published',
      registrationSettings: { approvalRequired: true },
    };

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const makeChain = (resolveValue: unknown) => {
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockImplementation(() => Object.assign(Promise.resolve(resolveValue), chain));
        chain.innerJoin = vi.fn().mockReturnValue(chain);
        chain.orderBy = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockResolvedValue(resolveValue);
        return chain;
      };

      if (selectCallCount === 1) return makeChain([event]);
      if (selectCallCount === 2) return makeChain([]);
      return makeChain([{ count: 0 }]);
    });

    mockFindDuplicatePerson.mockResolvedValue(null);

    const newPerson = { id: 'person-new', fullName: 'Test' };
    const newReg = {
      id: 'reg-1',
      registrationNumber: 'GEM2026-DEL-00001',
      qrCodeToken: 'abc123',
      status: 'pending',
    };

    let insertCallCount = 0;
    mockDb.insert.mockImplementation(() => {
      insertCallCount++;
      const chain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn(),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      };

      if (insertCallCount === 1) {
        chain.returning.mockResolvedValue([newPerson]);
      } else if (insertCallCount === 2) {
        chain.returning.mockResolvedValue([newReg]);
      }

      return chain;
    });

    const result = await registerForEvent('event-1', {
      fullName: 'Dr. Rajesh Kumar',
      email: 'rajesh@example.com',
      phone: '+919876543210',
    });

    expect(result.status).toBe('pending');
  });

  it('uses waitlistEnabled from registration settings UI when capacity is full', async () => {
    const event = {
      id: 'event-1',
      slug: 'gem-2026',
      status: 'published',
      registrationSettings: { maxCapacity: 1, waitlistEnabled: true },
    };

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const makeChain = (resolveValue: unknown) => {
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockImplementation(() => Object.assign(Promise.resolve(resolveValue), chain));
        chain.innerJoin = vi.fn().mockReturnValue(chain);
        chain.orderBy = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockResolvedValue(resolveValue);
        return chain;
      };

      if (selectCallCount === 1) return makeChain([event]);
      if (selectCallCount === 2) return makeChain([{ count: 1 }]);
      if (selectCallCount === 3) return makeChain([]);
      if (selectCallCount === 4) return makeChain([{ count: 1 }]);
      return makeChain([{ count: 1 }]);
    });

    mockFindDuplicatePerson.mockResolvedValue({ id: 'existing-person-id' });

    let insertCallCount = 0;
    mockDb.insert.mockImplementation(() => {
      insertCallCount++;
      const chain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn(),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      };

      if (insertCallCount === 1) {
        chain.returning.mockResolvedValue([{
          id: 'reg-1',
          registrationNumber: 'GEM2026-DEL-00002',
          qrCodeToken: 'abc123',
          status: 'waitlisted',
        }]);
      }

      return chain;
    });

    const result = await registerForEvent('event-1', {
      fullName: 'Dr. Rajesh Kumar',
      email: 'rajesh@example.com',
      phone: '+919876543210',
    });

    expect(result.status).toBe('waitlisted');
  });

  it('rejects registrations after the saved cutoff date has passed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T00:00:00.000Z'));

    const event = {
      id: 'event-1',
      slug: 'gem-2026',
      status: 'published',
      registrationSettings: { cutoffDate: '2026-05-01' },
    };

    chainedSelect([event]);

    await expect(
      registerForEvent('event-1', {
        fullName: 'Test',
        email: 'test@example.com',
        phone: '+919876543210',
      }),
    ).rejects.toThrow('Registration is currently closed for this event');

    vi.useRealTimers();
  });

  it('dedupe matches existing person by email — reuses id, does not create duplicate', async () => {
    const event = {
      id: 'event-1',
      slug: 'gem-2026',
      status: 'published',
      registrationSettings: {},
    };

    const existingPerson = { id: 'existing-person-id', fullName: 'Existing User', email: 'rajesh@example.com', phoneE164: '+919876543210' };

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      const makeChain = (resolveValue: unknown) => {
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain.from = vi.fn().mockReturnValue(chain);
        chain.where = vi.fn().mockImplementation(() => {
          return Object.assign(Promise.resolve(resolveValue), chain);
        });
        chain.innerJoin = vi.fn().mockReturnValue(chain);
        chain.orderBy = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockResolvedValue(resolveValue);
        return chain;
      };

      if (selectCallCount === 1) {
        return makeChain([event]);
      } else if (selectCallCount === 2) {
        return makeChain([]);
      } else {
        return makeChain([{ count: 0 }]);
      }
    });

    mockFindDuplicatePerson.mockResolvedValue(existingPerson);

    const newReg = {
      id: 'reg-1',
      registrationNumber: 'GEM2026-DEL-00001',
      qrCodeToken: 'abc123',
      status: 'confirmed',
    };

    let insertCallCount = 0;
    mockDb.insert.mockImplementation(() => {
      insertCallCount++;
      const chain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn(),
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      };

      if (insertCallCount === 1) {
        chain.returning.mockResolvedValue([newReg]);
      }

      return chain;
    });

    const result = await registerForEvent('event-1', {
      fullName: 'Dr. Rajesh Kumar',
      email: 'rajesh@example.com',
      phone: '+919876543210',
    });

    expect(mockFindDuplicatePerson).toHaveBeenCalledWith('rajesh@example.com', '+919876543210');
    expect(result.registrationId).toBe('reg-1');
    // The first insert should be the registration, NOT a person insert (person was deduped)
    const firstInsertValues = mockDb.insert.mock.calls[0];
    // If person was deduped, the insert call count should be 2 (registration + event_people), not 3
    expect(insertCallCount).toBeLessThanOrEqual(2);
  });

  it('rejects invalid input', async () => {
    await expect(
      registerForEvent('event-1', { fullName: '' }),
    ).rejects.toThrow();
  });

  it('fails closed when the registration flag backend errors', async () => {
    mockIsRegistrationOpen.mockRejectedValue(new Error('redis unavailable'));

    await expect(
      registerForEvent('event-1', {
        fullName: 'Test',
        email: 'test@example.com',
        phone: '+919876543210',
      }),
    ).rejects.toThrow('Registration is temporarily unavailable');

    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

describe('updateRegistrationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'admin-1' });
    mockAssertEventAccess.mockResolvedValue({ userId: 'admin-1' });
  });

  it('transitions pending → confirmed', async () => {
    const reg = { id: 'reg-1', eventId: EVENT_UUID, status: 'pending' };
    chainedSelect([reg]);

    const updated = { ...reg, status: 'confirmed' };
    chainedUpdate([updated]);

    const result = await updateRegistrationStatus({
      eventId: EVENT_UUID,
      registrationId: '550e8400-e29b-41d4-a716-446655440000',
      newStatus: 'confirmed',
    });

    expect(result.status).toBe('confirmed');
  });

  it('blocks invalid transition (declined → confirmed)', async () => {
    const reg = { id: '550e8400-e29b-41d4-a716-446655440001', eventId: EVENT_UUID, status: 'declined' };
    chainedSelect([reg]);

    await expect(
      updateRegistrationStatus({
        eventId: EVENT_UUID,
        registrationId: '550e8400-e29b-41d4-a716-446655440001',
        newStatus: 'confirmed',
      }),
    ).rejects.toThrow('Cannot transition');
  });

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    await expect(
      updateRegistrationStatus({
        eventId: EVENT_UUID,
        registrationId: '550e8400-e29b-41d4-a716-446655440002',
        newStatus: 'confirmed',
      }),
    ).rejects.toThrow('Unauthorized');
  });

  it('throws when registration not found', async () => {
    chainedSelect([]);

    await expect(
      updateRegistrationStatus({
        eventId: EVENT_UUID,
        registrationId: '550e8400-e29b-41d4-a716-446655440000',
        newStatus: 'confirmed',
      }),
    ).rejects.toThrow('Registration not found');
  });

  it('blocks org:ops from changing registration status before reading the row', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'ops-1', role: 'org:ops' });

    await expect(
      updateRegistrationStatus({
        eventId: EVENT_UUID,
        registrationId: '550e8400-e29b-41d4-a716-446655440000',
        newStatus: 'confirmed',
      }),
    ).rejects.toThrow('Forbidden');

    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('rejects stale status updates after the registration changes concurrently', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'admin-1', role: 'org:event_coordinator' });

    const reg = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      eventId: EVENT_UUID,
      status: 'pending',
      updatedAt: new Date('2026-04-17T09:30:00.000Z'),
    };
    chainedSelect([reg]);
    chainedUpdate([]);

    await expect(
      updateRegistrationStatus({
        eventId: EVENT_UUID,
        registrationId: reg.id,
        newStatus: 'confirmed',
      }),
    ).rejects.toThrow('Registration was modified by another request. Please refresh and try again.');

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe('getEventRegistrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'admin-1' });
    mockAssertEventAccess.mockResolvedValue({ userId: 'admin-1' });
  });

  it('returns registrations for an event', async () => {
    const regs = [
      { id: 'reg-1', registrationNumber: 'GEM-DEL-00001', status: 'confirmed', personName: 'Test' },
    ];
    chainedSelect(regs);

    const result = await getEventRegistrations('event-1');
    expect(result).toHaveLength(1);
  });

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    await expect(getEventRegistrations('event-1')).rejects.toThrow('Unauthorized');
  });

  it('blocks org:ops from reading registration PII', async () => {
    mockAssertEventAccess.mockResolvedValue({ userId: 'ops-1', role: 'org:ops' });

    await expect(getEventRegistrations('event-1')).rejects.toThrow('Forbidden');
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});
