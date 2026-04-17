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

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

import {
  getEventAssignments,
  createEventAssignment,
  deactivateEventAssignment,
} from './event-assignments';
import { ROLES } from '@/lib/auth/roles';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const OTHER_EVENT_ID = '550e8400-e29b-41d4-a716-446655440002';
const USER_SA = 'user_superadmin';
const USER_COORD = 'user_coordinator';
const USER_OPS = 'user_ops';

function authAsSuperAdmin(userId = USER_SA) {
  mockAuth.mockResolvedValue({
    userId,
    orgId: 'org_test',
    has: ({ role }: { role: string }) => role === ROLES.SUPER_ADMIN,
  });
}

function authAsCoordinator() {
  mockAuth.mockResolvedValue({
    userId: USER_COORD,
    orgId: 'org_test',
    has: ({ role }: { role: string }) => role === ROLES.EVENT_COORDINATOR,
  });
}

// Chain helper for .select().from().where() (awaitable via .then)
function chainedSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    then: (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(onFulfilled, onRejected),
    catch: (onRejected: (reason: unknown) => unknown) =>
      Promise.resolve(rows).catch(onRejected),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

function chainedInsert() {
  const chain = {
    values: vi.fn().mockResolvedValue([]),
  };
  mockDb.insert.mockReturnValue(chain);
  return chain;
}

function chainedUpdate() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
  mockDb.update.mockReturnValue(chain);
  return chain;
}

const ASSIGNMENT_ROW = {
  id: 'assign-uuid-1',
  eventId: EVENT_ID,
  authUserId: USER_COORD,
  assignmentType: 'collaborator',
  isActive: true,
  assignedAt: new Date('2026-01-01'),
  assignedBy: USER_SA,
};

describe('Event Assignment Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getEventAssignments', () => {
    it('returns all assignments for the event', async () => {
      authAsSuperAdmin();
      chainedSelect([ASSIGNMENT_ROW]);

      const result = await getEventAssignments(EVENT_ID);

      expect(result).toHaveLength(1);
      expect(result[0].authUserId).toBe(USER_COORD);
      expect(result[0].eventId).toBe(EVENT_ID);
    });

    it('returns empty list when no assignments exist', async () => {
      authAsSuperAdmin();
      chainedSelect([]);

      const result = await getEventAssignments(EVENT_ID);

      expect(result).toHaveLength(0);
    });

    it('rejects non-super-admin', async () => {
      authAsCoordinator();

      await expect(getEventAssignments(EVENT_ID)).rejects.toThrow('Forbidden');
    });

    it('rejects unauthenticated user', async () => {
      mockAuth.mockResolvedValue({ userId: null, has: () => false });

      await expect(getEventAssignments(EVENT_ID)).rejects.toThrow('Not authenticated');
    });

    it('rejects non-UUID event ID', async () => {
      authAsSuperAdmin();

      await expect(getEventAssignments('not-a-uuid')).rejects.toThrow();
    });
  });

  describe('createEventAssignment — new assignment', () => {
    it('inserts a new assignment when none exists', async () => {
      authAsSuperAdmin();
      chainedSelect([]); // no existing assignment
      const insertChain = chainedInsert();

      const result = await createEventAssignment({
        eventId: EVENT_ID,
        authUserId: USER_COORD,
        assignmentType: 'collaborator',
      });

      expect(result.ok).toBe(true);
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: EVENT_ID,
          authUserId: USER_COORD,
          assignmentType: 'collaborator',
          assignedBy: USER_SA,
        }),
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/team`);
    });

    it('assigns an owner-type to a coordinator', async () => {
      authAsSuperAdmin();
      chainedSelect([]);
      const insertChain = chainedInsert();

      const result = await createEventAssignment({
        eventId: EVENT_ID,
        authUserId: USER_COORD,
        assignmentType: 'owner',
      });

      expect(result.ok).toBe(true);
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ assignmentType: 'owner' }),
      );
    });
  });

  describe('createEventAssignment — upsert (reactivate)', () => {
    it('reactivates and updates a deactivated assignment', async () => {
      authAsSuperAdmin();
      chainedSelect([{ id: 'existing-uuid' }]); // existing assignment found
      const updateChain = chainedUpdate();

      const result = await createEventAssignment({
        eventId: EVENT_ID,
        authUserId: USER_COORD,
        assignmentType: 'owner',
      });

      expect(result.ok).toBe(true);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          assignmentType: 'owner',
          assignedBy: USER_SA,
        }),
      );
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('createEventAssignment — validation', () => {
    it('returns error for invalid assignment type', async () => {
      authAsSuperAdmin();

      const result = await createEventAssignment({
        eventId: EVENT_ID,
        authUserId: USER_COORD,
        assignmentType: 'hacker' as 'owner',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeDefined();
    });

    it('returns error for empty authUserId', async () => {
      authAsSuperAdmin();

      const result = await createEventAssignment({
        eventId: EVENT_ID,
        authUserId: '',
        assignmentType: 'collaborator',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/User ID/i);
    });

    it('returns error for non-UUID eventId', async () => {
      authAsSuperAdmin();

      const result = await createEventAssignment({
        eventId: 'not-a-uuid',
        authUserId: USER_COORD,
        assignmentType: 'collaborator',
      });

      expect(result.ok).toBe(false);
    });

    it('rejects non-super-admin', async () => {
      authAsCoordinator();

      await expect(
        createEventAssignment({
          eventId: EVENT_ID,
          authUserId: USER_OPS,
          assignmentType: 'collaborator',
        }),
      ).rejects.toThrow('Forbidden');
    });
  });

  describe('deactivateEventAssignment', () => {
    it('sets isActive = false for the assignment', async () => {
      authAsSuperAdmin();
      const updateChain = chainedUpdate();

      const result = await deactivateEventAssignment({
        eventId: EVENT_ID,
        authUserId: USER_COORD,
      });

      expect(result.ok).toBe(true);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/team`);
    });

    it('rejects non-super-admin', async () => {
      authAsCoordinator();

      await expect(
        deactivateEventAssignment({
          eventId: EVENT_ID,
          authUserId: USER_COORD,
        }),
      ).rejects.toThrow('Forbidden');
    });

    it('returns error for empty authUserId', async () => {
      authAsSuperAdmin();

      const result = await deactivateEventAssignment({
        eventId: EVENT_ID,
        authUserId: '',
      });

      expect(result.ok).toBe(false);
    });

    it('rejects non-UUID eventId', async () => {
      authAsSuperAdmin();

      const result = await deactivateEventAssignment({
        eventId: 'bad-id',
        authUserId: USER_COORD,
      });

      expect(result.ok).toBe(false);
    });
  });

  describe('event isolation', () => {
    it('scopes getEventAssignments query to the given event ID', async () => {
      authAsSuperAdmin();
      const chain = chainedSelect([ASSIGNMENT_ROW]);

      await getEventAssignments(EVENT_ID);

      // withEventScope is called with the correct eventId — ensures isolation
      const { withEventScope } = await import('@/lib/db/with-event-scope');
      expect(withEventScope).toHaveBeenCalledWith(
        expect.anything(),
        EVENT_ID,
      );
    });

    it('does not accept OTHER_EVENT_ID as a valid scoped query for EVENT_ID', async () => {
      authAsSuperAdmin();
      chainedSelect([]);

      // Calling with a different event ID should trigger a separate scoped query
      await getEventAssignments(OTHER_EVENT_ID);

      const { withEventScope } = await import('@/lib/db/with-event-scope');
      expect(withEventScope).toHaveBeenCalledWith(
        expect.anything(),
        OTHER_EVENT_ID,
      );
    });
  });
});
