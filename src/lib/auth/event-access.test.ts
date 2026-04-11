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

import { checkEventAccess, assertEventAccess, getEventListContext } from './event-access';

function mockAssignmentQuery(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mockDb.select.mockReturnValue({ from });
  return { from, where, limit };
}

describe('checkEventAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unauthorized when no userId in session', async () => {
    mockAuth.mockResolvedValue({ userId: null, has: () => false });

    const result = await checkEventAccess('event-1');
    expect(result.authorized).toBe(false);
  });

  it('super admin bypasses event assignment check', async () => {
    mockAuth.mockResolvedValue({
      userId: 'admin-1',
      has: ({ role }: { role: string }) => role === 'org:super_admin',
    });

    const result = await checkEventAccess('event-1');
    expect(result.authorized).toBe(true);
    expect(result.role).toBe('org:super_admin');
    // Should NOT query event_user_assignments
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('event coordinator with assignment is authorized', async () => {
    mockAuth.mockResolvedValue({
      userId: 'coord-1',
      has: ({ role }: { role: string }) => role === 'org:event_coordinator',
    });
    mockAssignmentQuery([{ id: 'a1', eventId: 'event-1', authUserId: 'coord-1', isActive: true }]);

    const result = await checkEventAccess('event-1');
    expect(result.authorized).toBe(true);
    expect(result.role).toBe('org:event_coordinator');
  });

  it('event coordinator without assignment is denied', async () => {
    mockAuth.mockResolvedValue({
      userId: 'coord-2',
      has: ({ role }: { role: string }) => role === 'org:event_coordinator',
    });
    mockAssignmentQuery([]);

    const result = await checkEventAccess('event-1');
    expect(result.authorized).toBe(false);
  });

  it('ops role with assignment is authorized', async () => {
    mockAuth.mockResolvedValue({
      userId: 'ops-1',
      has: ({ role }: { role: string }) => role === 'org:ops',
    });
    mockAssignmentQuery([{ id: 'a2', eventId: 'event-1', authUserId: 'ops-1', isActive: true }]);

    const result = await checkEventAccess('event-1');
    expect(result.authorized).toBe(true);
    expect(result.role).toBe('org:ops');
  });

  it('read-only role without assignment is denied', async () => {
    mockAuth.mockResolvedValue({
      userId: 'readonly-1',
      has: ({ role }: { role: string }) => role === 'org:read_only',
    });
    mockAssignmentQuery([]);

    const result = await checkEventAccess('event-1');
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

    const result = await checkEventAccess('event-1');
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

    const result = await checkEventAccess('event-1');
    expect(result.authorized).toBe(true);
    expect(result.role).toBe('org:read_only');
  });
});

describe('assertEventAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when access is denied', async () => {
    mockAuth.mockResolvedValue({
      userId: 'coord-2',
      has: ({ role }: { role: string }) => role === 'org:event_coordinator',
    });
    mockAssignmentQuery([]);

    await expect(assertEventAccess('event-1')).rejects.toThrow(/forbidden/i);
  });

  it('returns userId and role when access is granted', async () => {
    mockAuth.mockResolvedValue({
      userId: 'admin-1',
      has: ({ role }: { role: string }) => role === 'org:super_admin',
    });

    const result = await assertEventAccess('event-1');
    expect(result.userId).toBe('admin-1');
    expect(result.role).toBe('org:super_admin');
  });

  // Codex Bug #2: read-only users should be blocked from write operations
  it('throws for read-only users when requireWrite is true', async () => {
    mockAuth.mockResolvedValue({
      userId: 'readonly-1',
      has: ({ role }: { role: string }) => role === 'org:read_only',
    });
    mockAssignmentQuery([{ id: 'a4', eventId: 'event-1', authUserId: 'readonly-1', isActive: true }]);

    await expect(assertEventAccess('event-1', { requireWrite: true })).rejects.toThrow(/read-only|forbidden/i);
  });

  it('allows coordinator for write operations', async () => {
    mockAuth.mockResolvedValue({
      userId: 'coord-1',
      has: ({ role }: { role: string }) => role === 'org:event_coordinator',
    });
    mockAssignmentQuery([{ id: 'a5', eventId: 'event-1', authUserId: 'coord-1', isActive: true }]);

    const result = await assertEventAccess('event-1', { requireWrite: true });
    expect(result.userId).toBe('coord-1');
  });

  it('allows assigned owners without Clerk roles to write via fallback role', async () => {
    mockAuth.mockResolvedValue({
      userId: 'owner-without-role',
      has: () => false,
    });
    mockAssignmentQuery([{ assignmentType: 'owner' }]);

    const result = await assertEventAccess('event-1', { requireWrite: true });
    expect(result.userId).toBe('owner-without-role');
    expect(result.role).toBe('org:event_coordinator');
  });

  it('blocks assigned collaborators without Clerk roles from writes', async () => {
    mockAuth.mockResolvedValue({
      userId: 'collaborator-without-role',
      has: () => false,
    });
    mockAssignmentQuery([{ assignmentType: 'collaborator' }]);

    await expect(assertEventAccess('event-1', { requireWrite: true })).rejects.toThrow(/read-only|forbidden/i);
  });
});

describe('getEventListContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
