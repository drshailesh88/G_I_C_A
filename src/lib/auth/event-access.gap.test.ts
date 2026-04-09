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

function mockAssignmentQuery(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  mockDb.select.mockReturnValue({ from });
  return { from, where, limit };
}

describe('checkEventAccess — gap tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ops without assignment denied', async () => {
    mockAuth.mockResolvedValue({
      userId: 'ops-2',
      has: ({ role }: { role: string }) => role === 'org:ops',
    });
    mockAssignmentQuery([]);

    const result = await checkEventAccess('event-1');
    expect(result.authorized).toBe(false);
  });

  it('read-only with assignment authorized for read', async () => {
    mockAuth.mockResolvedValue({
      userId: 'readonly-1',
      has: ({ role }: { role: string }) => role === 'org:read_only',
    });
    mockAssignmentQuery([{ id: 'a1', eventId: 'event-1', authUserId: 'readonly-1', isActive: true }]);

    const result = await checkEventAccess('event-1');
    expect(result.authorized).toBe(true);
    expect(result.role).toBe('org:read_only');
  });

  it('super admin does not query event_user_assignments', async () => {
    mockAuth.mockResolvedValue({
      userId: 'admin-1',
      has: ({ role }: { role: string }) => role === 'org:super_admin',
    });

    await checkEventAccess('event-1');
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

describe('assertEventAccess — gap tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ops allowed for write operations', async () => {
    mockAuth.mockResolvedValue({
      userId: 'ops-1',
      has: ({ role }: { role: string }) => role === 'org:ops',
    });
    mockAssignmentQuery([{ id: 'a1', eventId: 'event-1', authUserId: 'ops-1', isActive: true }]);

    const result = await assertEventAccess('event-1', { requireWrite: true });
    expect(result.userId).toBe('ops-1');
  });

  it('super admin allowed for write operations', async () => {
    mockAuth.mockResolvedValue({
      userId: 'admin-1',
      has: ({ role }: { role: string }) => role === 'org:super_admin',
    });

    const result = await assertEventAccess('event-1', { requireWrite: true });
    expect(result.userId).toBe('admin-1');
  });
});
