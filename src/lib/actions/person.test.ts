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

import {
  createPerson, updatePerson, getPerson, searchPeople,
  archivePerson, restorePerson, anonymizePerson,
  ensureEventPerson, importPeopleBatch, getEventPeople,
} from './person';

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

describe('updatePerson', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  it('updates fullName', async () => {
    const person = { id: '550e8400-e29b-41d4-a716-446655440000', fullName: 'Updated Name' };
    const updateChain = chainedUpdate([person]);

    const result = await updatePerson({
      personId: '550e8400-e29b-41d4-a716-446655440000',
      fullName: 'Updated Name',
    });

    expect(result.fullName).toBe('Updated Name');
    expect(updateChain.set).toHaveBeenCalled();
  });

  it('throws when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    await expect(
      updatePerson({ personId: '550e8400-e29b-41d4-a716-446655440000', fullName: 'Test' }),
    ).rejects.toThrow('Unauthorized');
  });

  it('throws on invalid personId', async () => {
    await expect(
      updatePerson({ personId: 'bad-id', fullName: 'Test' }),
    ).rejects.toThrow();
  });

  it('throws when person not found', async () => {
    chainedUpdate([]);
    await expect(
      updatePerson({ personId: '550e8400-e29b-41d4-a716-446655440000', fullName: 'Test' }),
    ).rejects.toThrow('Person not found');
  });

  it('sets updatedBy to current user', async () => {
    const person = { id: '550e8400-e29b-41d4-a716-446655440000', fullName: 'Test' };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: '550e8400-e29b-41d4-a716-446655440000',
      fullName: 'Test',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.updatedBy).toBe('user_123');
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  it('revalidates both paths', async () => {
    chainedUpdate([{ id: '550e8400-e29b-41d4-a716-446655440000' }]);

    await updatePerson({
      personId: '550e8400-e29b-41d4-a716-446655440000',
      fullName: 'Test',
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith('/people');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/people/550e8400-e29b-41d4-a716-446655440000');
  });

  it('clears optional field when set to empty string', async () => {
    const person = { id: '550e8400-e29b-41d4-a716-446655440000', email: null };
    const updateChain = chainedUpdate([person]);

    await updatePerson({
      personId: '550e8400-e29b-41d4-a716-446655440000',
      email: '',
    });

    const setArg = updateChain.set.mock.calls[0][0];
    expect(setArg.email).toBeNull();
  });
});

describe('searchPeople', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  it('returns paginated results', async () => {
    // First call returns rows
    const selectChain1 = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([{ id: '1', fullName: 'Test' }]),
    };
    // Second call returns count
    const selectChain2 = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ count: 51 }]),
    };

    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? selectChain1 : selectChain2;
    });

    const result = await searchPeople({ page: 1, limit: 25 });

    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(3); // ceil(51/25)
    expect(result.total).toBe(51);
  });

  it('throws when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    await expect(searchPeople({})).rejects.toThrow('Unauthorized');
  });

  it('totalPages calculation — exact division', async () => {
    const selectChain1 = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([]),
    };
    const selectChain2 = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ count: 50 }]),
    };

    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? selectChain1 : selectChain2;
    });

    const result = await searchPeople({ page: 1, limit: 25 });
    expect(result.totalPages).toBe(2); // ceil(50/25)
  });
});

describe('importPeopleBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  it('imports valid rows and returns counts', async () => {
    // Each createPerson call: dedup select (no match) + insert
    const person = { id: 'p1', fullName: 'Test' };
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([person]),
      onConflictDoNothing: vi.fn(),
    };
    mockDb.select.mockReturnValue(selectChain);
    mockDb.insert.mockReturnValue(insertChain);

    const result = await importPeopleBatch([
      { rowNumber: 2, fullName: 'Test Person', email: 'test@example.com' },
    ]);

    expect(result.imported).toBe(1);
    expect(result.duplicates).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe('created');
  });

  it('tracks duplicates', async () => {
    const existing = { id: 'p1', fullName: 'Existing', email: 'test@example.com', phoneE164: null };
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([existing]),
    };
    mockDb.select.mockReturnValue(selectChain);

    const result = await importPeopleBatch([
      { rowNumber: 2, fullName: 'Test', email: 'test@example.com' },
    ]);

    expect(result.duplicates).toBe(1);
    expect(result.results[0].status).toBe('duplicate');
  });

  it('tracks errors', async () => {
    // Force createPerson to throw by providing invalid data (no email or phone)
    const result = await importPeopleBatch([
      { rowNumber: 2, fullName: 'Test' },
    ]);

    expect(result.errors).toBe(1);
    expect(result.results[0].status).toBe('error');
  });

  it('throws when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    await expect(importPeopleBatch([])).rejects.toThrow('Unauthorized');
  });

  it('revalidates /people after batch', async () => {
    // Empty batch still revalidates
    const result = await importPeopleBatch([]);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/people');
  });
});

describe('getEventPeople', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  it('returns linked people', async () => {
    const rows = [
      { id: 'p1', fullName: 'Dr. Rajesh', email: 'rajesh@example.com', phoneE164: '+919876543210' },
    ];
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(rows),
    };
    mockDb.select.mockReturnValue(selectChain);

    const result = await getEventPeople('event-1');
    expect(result).toEqual(rows);
  });

  it('throws when unauthenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });
    await expect(getEventPeople('event-1')).rejects.toThrow('Unauthorized');
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
