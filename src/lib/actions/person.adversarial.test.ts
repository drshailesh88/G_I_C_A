import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockDb, mockRevalidatePath, mockWriteAudit } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockWriteAudit: vi.fn(),
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

vi.mock('@/lib/audit/write', () => ({
  writeAudit: mockWriteAudit,
}));

vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: vi.fn(),
}));

import { archivePerson, searchPeople } from './person';

const PERSON_ID = '770e8400-e29b-41d4-a716-446655440000';

function makeSearchRowsChain(rows: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.offset.mockResolvedValue(rows);

  return chain;
}

function makeCountChain(rows: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    from: vi.fn(),
    where: vi.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.where.mockResolvedValue(rows);

  return chain;
}

function makeUpdateChain(rows: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    set: vi.fn(),
    where: vi.fn(),
    returning: vi.fn(),
  };

  chain.set.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.returning.mockResolvedValue(rows);

  return chain;
}

describe('people adversarial coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      userId: 'coord-1',
      has: ({ role }: { role: string }) => role === 'org:event_coordinator',
    });
  });

  it('should not return people records that belong only to events outside the coordinator assignment set', async () => {
    mockDb.select
      .mockImplementationOnce(() => makeSearchRowsChain([
        {
          id: PERSON_ID,
          fullName: 'Dr. Outside Event',
          email: 'outside@example.com',
          phoneE164: '+919999999999',
        },
      ]))
      .mockImplementationOnce(() => makeCountChain([{ count: 1 }]));

    // BUG: searchPeople is global and does not scope by the coordinator's assigned eventIds.
    const result = await searchPeople({ page: 1, limit: 25, query: 'Outside' });

    expect(result.people).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('should forbid archiving a person without proving event ownership over that person record', async () => {
    mockDb.update.mockReturnValue(makeUpdateChain([
      { id: PERSON_ID, archivedAt: new Date('2026-04-20T10:00:00Z') },
    ]));

    // BUG: archivePerson performs a global people-table mutation with no event scoping at all.
    await expect(archivePerson(PERSON_ID)).rejects.toThrow('Forbidden');
    expect(mockWriteAudit).not.toHaveBeenCalled();
  });
});
