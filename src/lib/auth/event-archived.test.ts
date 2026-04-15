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

import { assertEventAccess, EventArchivedError } from './event-access';

function mockSelectChain(results: unknown[]) {
  const limit = vi.fn().mockResolvedValue(results);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return { from, where, limit };
}

describe('cascade-037: new mutation on archived event blocked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assertEventAccess with requireWrite throws EventArchivedError for archived event', async () => {
    mockAuth.mockResolvedValue({
      userId: 'coord-1',
      has: ({ role }: { role: string }) => role === 'org:event_coordinator',
    });

    // First select: event_user_assignments (authorized)
    const assignmentChain = mockSelectChain([{ assignmentType: 'owner' }]);
    // Second select: events table (status = archived)
    const eventChain = mockSelectChain([{ status: 'archived' }]);

    mockDb.select
      .mockReturnValueOnce({ from: assignmentChain.from })
      .mockReturnValueOnce({ from: eventChain.from });

    await expect(
      assertEventAccess('event-archived', { requireWrite: true }),
    ).rejects.toThrow(EventArchivedError);
  });

  it('assertEventAccess allows writes on active (published) event', async () => {
    mockAuth.mockResolvedValue({
      userId: 'coord-1',
      has: ({ role }: { role: string }) => role === 'org:event_coordinator',
    });

    const assignmentChain = mockSelectChain([{ assignmentType: 'owner' }]);
    const eventChain = mockSelectChain([{ status: 'published' }]);

    mockDb.select
      .mockReturnValueOnce({ from: assignmentChain.from })
      .mockReturnValueOnce({ from: eventChain.from });

    const result = await assertEventAccess('event-active', { requireWrite: true });
    expect(result.userId).toBe('coord-1');
  });

  it('assertEventAccess skips archive check for read-only access (no requireWrite)', async () => {
    mockAuth.mockResolvedValue({
      userId: 'coord-1',
      has: ({ role }: { role: string }) => role === 'org:event_coordinator',
    });

    const assignmentChain = mockSelectChain([{ assignmentType: 'owner' }]);
    mockDb.select.mockReturnValueOnce({ from: assignmentChain.from });

    const result = await assertEventAccess('event-archived');
    expect(result.userId).toBe('coord-1');
    // Only one select call (assignment), no event status check
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('EventArchivedError has statusCode 400', () => {
    const err = new EventArchivedError();
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe('EventArchivedError');
  });
});
