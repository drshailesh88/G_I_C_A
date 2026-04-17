import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockDb } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

import { checkEventAccess, assertEventAccess } from './event-access';

const EVENT_ID_1 = '11111111-1111-4111-8111-111111111111';

function mockAssignmentQuery(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mockDb.select.mockReturnValue({ from });
  return { from, where, limit };
}

function mockSelectChain(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return { from, where, limit };
}

describe('checkEventAccess — gap tests', () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockDb.select.mockReset();
  });

  it('ops without assignment denied', async () => {
    mockAuth.mockResolvedValue({
      userId: 'ops-2',
      has: ({ role }: { role: string }) => role === 'org:ops',
    });
    mockAssignmentQuery([]);

    const result = await checkEventAccess(EVENT_ID_1);
    expect(result.authorized).toBe(false);
  });

  it('read-only with assignment authorized for read', async () => {
    mockAuth.mockResolvedValue({
      userId: 'readonly-1',
      has: ({ role }: { role: string }) => role === 'org:read_only',
    });
    mockAssignmentQuery([{ id: 'a1', eventId: EVENT_ID_1, authUserId: 'readonly-1', isActive: true }]);

    const result = await checkEventAccess(EVENT_ID_1);
    expect(result.authorized).toBe(true);
    expect(result.role).toBe('org:read_only');
  });

  it('owner assignment authorizes users even when Clerk returns no org role', async () => {
    mockAuth.mockResolvedValue({
      userId: 'owner-1',
      has: () => false,
    });
    mockAssignmentQuery([{ assignmentType: 'owner' }]);

    const result = await checkEventAccess(EVENT_ID_1);
    expect(result.authorized).toBe(true);
    expect(result.role).toBe('org:event_coordinator');
  });

  it('super admin validates event existence without querying assignments', async () => {
    mockAuth.mockResolvedValue({
      userId: 'admin-1',
      has: ({ role }: { role: string }) => role === 'org:super_admin',
    });

    const eventChain = mockSelectChain([{ status: 'published' }]);
    mockDb.select.mockReturnValueOnce({ from: eventChain.from });

    await checkEventAccess(EVENT_ID_1);
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });
});

describe('assertEventAccess — gap tests', () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockDb.select.mockReset();
  });

  it('ops allowed for write operations', async () => {
    mockAuth.mockResolvedValue({
      userId: 'ops-1',
      has: ({ role }: { role: string }) => role === 'org:ops',
    });
    const assignmentChain = mockSelectChain([{ id: 'a1', eventId: EVENT_ID_1, authUserId: 'ops-1', isActive: true }]);
    const eventChain = mockSelectChain([{ status: 'published' }]);
    mockDb.select
      .mockReturnValueOnce({ from: assignmentChain.from })
      .mockReturnValueOnce({ from: eventChain.from });

    const result = await assertEventAccess(EVENT_ID_1, { requireWrite: true });
    expect(result.userId).toBe('ops-1');
  });

  it('super admin allowed for write operations', async () => {
    mockAuth.mockResolvedValue({
      userId: 'admin-1',
      has: ({ role }: { role: string }) => role === 'org:super_admin',
    });

    const eventChain = mockSelectChain([{ status: 'published' }]);
    mockDb.select.mockReturnValueOnce({ from: eventChain.from });

    const result = await assertEventAccess(EVENT_ID_1, { requireWrite: true });
    expect(result.userId).toBe('admin-1');
  });

  it('collaborator fallback role is denied for write operations', async () => {
    mockAuth.mockResolvedValue({
      userId: 'collaborator-1',
      has: () => false,
    });
    mockAssignmentQuery([{ assignmentType: 'collaborator' }]);

    await expect(assertEventAccess(EVENT_ID_1, { requireWrite: true })).rejects.toThrow(/read-only|forbidden/i);
  });
});
