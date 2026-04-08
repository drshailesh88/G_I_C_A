import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockDb, mockRevalidatePath } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
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

import { createPerson, getPerson, archivePerson, restorePerson, anonymizePerson, ensureEventPerson } from './person';

// Helper to chain select/insert/update queries
function chainedSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
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

describe('createPerson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  it('creates a person with valid data', async () => {
    const person = {
      id: 'person-1',
      fullName: 'Dr. Rajesh Kumar',
      email: 'rajesh@example.com',
      phoneE164: null,
    };

    // First call: dedup check (no match)
    const selectChain = chainedSelect([]);
    // Second call: insert
    const insertChain = chainedInsert([person]);

    // After dedup check returns [], the insert is called
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    const result = await createPerson({
      fullName: 'Dr. Rajesh Kumar',
      email: 'rajesh@example.com',
    });

    expect(result.duplicate).toBe(false);
    expect(result.person).toEqual(person);
  });

  it('throws when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    await expect(
      createPerson({ fullName: 'Test', email: 'test@example.com' }),
    ).rejects.toThrow('Unauthorized');
  });

  it('returns duplicate when email matches existing person', async () => {
    const existing = {
      id: 'existing-1',
      fullName: 'Existing Person',
      email: 'rajesh@example.com',
      phoneE164: null,
    };

    chainedSelect([existing]);

    const result = await createPerson({
      fullName: 'Dr. Rajesh Kumar',
      email: 'rajesh@example.com',
    });

    expect(result.duplicate).toBe(true);
    expect(result.existingPerson).toEqual(existing);
  });

  it('rejects when neither email nor phone provided', async () => {
    await expect(
      createPerson({ fullName: 'Test Person' }),
    ).rejects.toThrow();
  });
});

describe('getPerson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns person by ID', async () => {
    const person = { id: '550e8400-e29b-41d4-a716-446655440000', fullName: 'Test' };
    chainedSelect([person]);

    const result = await getPerson('550e8400-e29b-41d4-a716-446655440000');
    expect(result).toEqual(person);
  });

  it('throws on invalid UUID', async () => {
    await expect(getPerson('not-a-uuid')).rejects.toThrow('Invalid person ID');
  });

  it('throws when person not found', async () => {
    chainedSelect([]);
    await expect(
      getPerson('550e8400-e29b-41d4-a716-446655440000'),
    ).rejects.toThrow('Person not found');
  });
});

describe('archivePerson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  it('soft deletes a person', async () => {
    const person = { id: '550e8400-e29b-41d4-a716-446655440000', archivedAt: new Date() };
    chainedUpdate([person]);

    const result = await archivePerson('550e8400-e29b-41d4-a716-446655440000');
    expect(result.archivedAt).toBeTruthy();
  });

  it('throws when person already archived', async () => {
    chainedUpdate([]);
    await expect(
      archivePerson('550e8400-e29b-41d4-a716-446655440000'),
    ).rejects.toThrow('Person not found or already archived');
  });
});

describe('restorePerson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  it('restores an archived person', async () => {
    const person = { id: '550e8400-e29b-41d4-a716-446655440000', archivedAt: null };
    chainedUpdate([person]);

    const result = await restorePerson('550e8400-e29b-41d4-a716-446655440000');
    expect(result.archivedAt).toBeNull();
  });
});

describe('anonymizePerson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  it('anonymizes a person irreversibly', async () => {
    const person = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      fullName: '[ANONYMIZED]',
      email: null,
      phoneE164: null,
      anonymizedAt: new Date(),
    };
    chainedUpdate([person]);

    const result = await anonymizePerson('550e8400-e29b-41d4-a716-446655440000');
    expect(result.fullName).toBe('[ANONYMIZED]');
    expect(result.email).toBeNull();
    expect(result.anonymizedAt).toBeTruthy();
  });
});

describe('ensureEventPerson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts event-person link with conflict ignore', async () => {
    const insertChain = chainedInsert([]);

    await ensureEventPerson('event-1', 'person-1', 'registration');

    expect(mockDb.insert).toHaveBeenCalled();
    expect(insertChain.onConflictDoNothing).toHaveBeenCalled();
  });
});
