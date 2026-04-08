import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockDb, mockRevalidatePath, mockFindDuplicatePerson } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockFindDuplicatePerson: vi.fn(),
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

import { registerForEvent, updateRegistrationStatus, getEventRegistrations } from './registration';

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

  it('rejects invalid input', async () => {
    await expect(
      registerForEvent('event-1', { fullName: '' }),
    ).rejects.toThrow();
  });
});

describe('updateRegistrationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'admin-1' });
  });

  it('transitions pending → confirmed', async () => {
    const reg = { id: 'reg-1', eventId: 'event-1', status: 'pending' };
    chainedSelect([reg]);

    const updated = { ...reg, status: 'confirmed' };
    chainedUpdate([updated]);

    const result = await updateRegistrationStatus({
      registrationId: '550e8400-e29b-41d4-a716-446655440000',
      newStatus: 'confirmed',
    });

    expect(result.status).toBe('confirmed');
  });

  it('blocks invalid transition (declined → confirmed)', async () => {
    const reg = { id: '550e8400-e29b-41d4-a716-446655440001', eventId: 'event-1', status: 'declined' };
    chainedSelect([reg]);

    await expect(
      updateRegistrationStatus({
        registrationId: '550e8400-e29b-41d4-a716-446655440001',
        newStatus: 'confirmed',
      }),
    ).rejects.toThrow('Cannot transition');
  });

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    await expect(
      updateRegistrationStatus({
        registrationId: '550e8400-e29b-41d4-a716-446655440002',
        newStatus: 'confirmed',
      }),
    ).rejects.toThrow('Unauthorized');
  });

  it('throws when registration not found', async () => {
    chainedSelect([]);

    await expect(
      updateRegistrationStatus({
        registrationId: '550e8400-e29b-41d4-a716-446655440000',
        newStatus: 'confirmed',
      }),
    ).rejects.toThrow('Registration not found');
  });
});

describe('getEventRegistrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'admin-1' });
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
});
