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

import { checkEventAccess, assertEventAccess, getEventListContext, EventNotFoundError, ForbiddenError } from './event-access';

const EVENT_ID_1 = '11111111-1111-4111-8111-111111111111';
const EVENT_ID_2 = '22222222-2222-4222-8222-222222222222';
const EVENT_ID_3 = '33333333-3333-4333-8333-333333333333';

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

describe('checkEventAccess', () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockDb.select.mockReset();
  });

  it('returns unauthorized when no userId in session', async () => {
    mockAuth.mockResolvedValue({ userId: null, has: () => false });

    const result = await checkEventAccess(EVENT_ID_1);
    expect(result.authorized).toBe(false);
  });

  it('rejects malformed event IDs before auth or database access', async () => {
    const result = await checkEventAccess('not-a-uuid');

    expect(result).toEqual({
      authorized: false,
      userId: '',
      role: null,
    });
    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('super admin bypasses event assignment check', async () => {
    mockAuth.mockResolvedValue({
      userId: 'admin-1',
      has: ({ role }: { role: string }) => role === 'org:super_admin',
    });

    const eventChain = mockSelectChain([{ status: 'published' }]);
    mockDb.select.mockReturnValueOnce({ from: eventChain.from });

    const result = await checkEventAccess(EVENT_ID_1);
    expect(result.authorized).toBe(true);
    expect(result.role).toBe('org:super_admin');
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('super admin is denied when the event does not exist', async () => {
    mockAuth.mockResolvedValue({
      userId: 'admin-1',
      has: ({ role }: { role: string }) => role === 'org:super_admin',
    });

    const eventChain = mockSelectChain([]);
    mockDb.select.mockReturnValueOnce({ from: eventChain.from });

    const result = await checkEventAccess('5f31c4fc-e70a-4b09-b432-57b7d92bb4eb');
    expect(result).toEqual({
      authorized: false,
      userId: 'admin-1',
      role: 'org:super_admin',
    });
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('event coordinator with assignment is authorized', async () => {
    mockAuth.mockResolvedValue({
      userId: 'coord-1',
      has: ({ role }: { role: string }) => role === 'org:event_coordinator',
    });
    mockAssignmentQuery([{ id: 'a1', eventId: EVENT_ID_1, authUserId: 'coord-1', isActive: true }]);

    const result = await checkEventAccess(EVENT_ID_1);
    expect(result.authorized).toBe(true);
    expect(result.role).toBe('org:event_coordinator');
  });

  it('event coordinator without assignment is denied', async () => {
    mockAuth.mockResolvedValue({
      userId: 'coord-2',
      has: ({ role }: { role: string }) => role === 'org:event_coordinator',
    });
    mockAssignmentQuery([]);

    const result = await checkEventAccess(EVENT_ID_1);
    expect(result.authorized).toBe(false);
  });

  it('ops role with assignment is authorized', async () => {
    mockAuth.mockResolvedValue({
      userId: 'ops-1',
      has: ({ role }: { role: string }) => role === 'org:ops',
    });
    mockAssignmentQuery([{ id: 'a2', eventId: EVENT_ID_1, authUserId: 'ops-1', isActive: true }]);

    const result = await checkEventAccess(EVENT_ID_1);
    expect(result.authorized).toBe(true);
    expect(result.role).toBe('org:ops');
  });

  it('read-only role without assignment is denied', async () => {
    mockAuth.mockResolvedValue({
      userId: 'readonly-1',
      has: ({ role }: { role: string }) => role === 'org:read_only',
    });
    mockAssignmentQuery([]);

    const result = await checkEventAccess(EVENT_ID_1);
    expect(result.authorized).toBe(false);
  });

  it('falls back to event coordinator for assigned owners without a Clerk role', async () => {
    mockAuth.mockResolvedValue({
      userId: 'owner-without-role',
      has: () => false,
    });
    mockAssignmentQuery([
      {
        assignmentType: 'owner',
      },
    ]);

    const result = await checkEventAccess(EVENT_ID_1);
    expect(result.authorized).toBe(true);
    expect(result.role).toBe('org:event_coordinator');
  });

  it('falls back to read-only for assigned collaborators without a Clerk role', async () => {
    mockAuth.mockResolvedValue({
      userId: 'collaborator-without-role',
      has: () => false,
    });
    mockAssignmentQuery([
      {
        assignmentType: 'collaborator',
      },
    ]);

    const result = await checkEventAccess(EVENT_ID_1);
    expect(result.authorized).toBe(true);
    expect(result.role).toBe('org:read_only');
  });
});

describe('assertEventAccess', () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockDb.select.mockReset();
  });

  it('throws EventNotFoundError when access is denied (no assignment)', async () => {
    mockAuth.mockResolvedValue({
      userId: 'coord-2',
      has: ({ role }: { role: string }) => role === 'org:event_coordinator',
    });
    mockAssignmentQuery([]);

    await expect(assertEventAccess(EVENT_ID_1)).rejects.toThrow(EventNotFoundError);
  });

  it('throws EventNotFoundError for malformed event IDs before auth or database access', async () => {
    await expect(assertEventAccess('not-a-uuid')).rejects.toThrow(EventNotFoundError);

    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('coord_A → event B returns 404 signal (NotFoundError)', async () => {
    mockAuth.mockResolvedValue({
      userId: 'coord-A',
      has: ({ role }: { role: string }) => role === 'org:event_coordinator',
    });
    mockAssignmentQuery([]);

    try {
      await assertEventAccess(EVENT_ID_2);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EventNotFoundError);
      expect((err as EventNotFoundError).message).not.toContain(EVENT_ID_2);
    }
  });

  it('returns userId and role when access is granted', async () => {
    mockAuth.mockResolvedValue({
      userId: 'admin-1',
      has: ({ role }: { role: string }) => role === 'org:super_admin',
    });

    const eventChain = mockSelectChain([{ status: 'published' }]);
    mockDb.select.mockReturnValueOnce({ from: eventChain.from });

    const result = await assertEventAccess(EVENT_ID_1);
    expect(result.userId).toBe('admin-1');
    expect(result.role).toBe('org:super_admin');
  });

  // Codex Bug #2: read-only users should be blocked from write operations
  it('throws for read-only users when requireWrite is true', async () => {
    mockAuth.mockResolvedValue({
      userId: 'readonly-1',
      has: ({ role }: { role: string }) => role === 'org:read_only',
    });
    mockAssignmentQuery([{ id: 'a4', eventId: EVENT_ID_1, authUserId: 'readonly-1', isActive: true }]);

    await expect(assertEventAccess(EVENT_ID_1, { requireWrite: true })).rejects.toThrow(/read-only|forbidden/i);
  });

  it('read_only + requireWrite → ForbiddenError carrying 403', async () => {
    mockAuth.mockResolvedValue({
      userId: 'readonly-A',
      has: ({ role }: { role: string }) => role === 'org:read_only',
    });
    mockAssignmentQuery([{ id: 'a-ro', eventId: EVENT_ID_2, authUserId: 'readonly-A', isActive: true }]);

    try {
      await assertEventAccess(EVENT_ID_2, { requireWrite: true });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as ForbiddenError).statusCode).toBe(403);
    }
  });

  it('allows coordinator for write operations', async () => {
    mockAuth.mockResolvedValue({
      userId: 'coord-1',
      has: ({ role }: { role: string }) => role === 'org:event_coordinator',
    });
    const assignmentChain = mockSelectChain([{ id: 'a5', eventId: EVENT_ID_1, authUserId: 'coord-1', isActive: true }]);
    const eventChain = mockSelectChain([{ status: 'published' }]);
    mockDb.select
      .mockReturnValueOnce({ from: assignmentChain.from })
      .mockReturnValueOnce({ from: eventChain.from });

    const result = await assertEventAccess(EVENT_ID_1, { requireWrite: true });
    expect(result.userId).toBe('coord-1');
  });

  it('super admin crosses events freely (no EventNotFoundError)', async () => {
    mockAuth.mockResolvedValue({
      userId: 'admin-1',
      has: ({ role }: { role: string }) => role === 'org:super_admin',
    });

    const eventChain = mockSelectChain([{ status: 'published' }]);
    mockDb.select.mockReturnValueOnce({ from: eventChain.from });

    const result = await assertEventAccess(EVENT_ID_2);
    expect(result.userId).toBe('admin-1');
    expect(result.role).toBe('org:super_admin');
  });

  it('super bypasses assignment check but still requires the event to exist', async () => {
    mockAuth.mockResolvedValue({
      userId: 'super-1',
      has: ({ role }: { role: string }) => role === 'org:super_admin',
    });

    const eventChain = mockSelectChain([]);
    mockDb.select.mockReturnValueOnce({ from: eventChain.from });

    await expect(assertEventAccess('c2764ee2-dc57-4332-b6d5-7f96c32be9ea')).rejects.toThrow(EventNotFoundError);
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('allows assigned owners without Clerk roles to write via fallback role', async () => {
    mockAuth.mockResolvedValue({
      userId: 'owner-without-role',
      has: () => false,
    });
    const assignmentChain = mockSelectChain([{ assignmentType: 'owner' }]);
    const eventChain = mockSelectChain([{ status: 'published' }]);
    mockDb.select
      .mockReturnValueOnce({ from: assignmentChain.from })
      .mockReturnValueOnce({ from: eventChain.from });

    const result = await assertEventAccess(EVENT_ID_1, { requireWrite: true });
    expect(result.userId).toBe('owner-without-role');
    expect(result.role).toBe('org:event_coordinator');
  });

  it('blocks assigned collaborators without Clerk roles from writes', async () => {
    mockAuth.mockResolvedValue({
      userId: 'collaborator-without-role',
      has: () => false,
    });
    mockAssignmentQuery([{ assignmentType: 'collaborator' }]);

    await expect(assertEventAccess(EVENT_ID_1, { requireWrite: true })).rejects.toThrow(/read-only|forbidden/i);
  });
});

describe('getEventListContext', () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockDb.select.mockReset();
  });

  it('returns isSuperAdmin true for super admin', async () => {
    mockAuth.mockResolvedValue({
      userId: 'admin-1',
      has: ({ role }: { role: string }) => role === 'org:super_admin',
    });

    const ctx = await getEventListContext();
    expect(ctx.isSuperAdmin).toBe(true);
    expect(ctx.userId).toBe('admin-1');
  });

  it('returns isSuperAdmin false for coordinator', async () => {
    mockAuth.mockResolvedValue({
      userId: 'coord-1',
      has: ({ role }: { role: string }) => role === 'org:event_coordinator',
    });

    const ctx = await getEventListContext();
    expect(ctx.isSuperAdmin).toBe(false);
    expect(ctx.role).toBe('org:event_coordinator');
  });

  it('falls back to assigned owner role for event lists without Clerk org roles', async () => {
    mockAuth.mockResolvedValue({
      userId: 'owner-without-role',
      has: () => false,
    });
    mockAssignmentQuery([{ assignmentType: 'owner' }]);

    const ctx = await getEventListContext();
    expect(ctx.isSuperAdmin).toBe(false);
    expect(ctx.role).toBe('org:event_coordinator');
  });
});
