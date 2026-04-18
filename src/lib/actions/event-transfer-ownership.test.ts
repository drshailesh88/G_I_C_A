import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockDb, mockRevalidatePath, mockWithEventScope } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockRevalidatePath: vi.fn(),
  mockWithEventScope: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/db/with-event-scope', () => ({ withEventScope: mockWithEventScope }));
vi.mock('@/lib/auth/event-access', () => ({
  assertEventAccess: vi.fn(),
  getEventListContext: vi.fn(),
}));

import { transferEventOwnership } from './event';
import { ROLES } from '@/lib/auth/roles';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const ACTOR_ID = 'user_superadmin';
const NEW_OWNER_ID = 'user_new_owner';
const EXISTING_ROW_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function authAsSuperAdmin(userId = ACTOR_ID) {
  mockAuth.mockResolvedValue({
    userId,
    orgId: 'org_test',
    has: ({ role }: { role: string }) => role === ROLES.SUPER_ADMIN,
  });
}

function authAsCoordinator() {
  mockAuth.mockResolvedValue({
    userId: 'user_coord',
    orgId: 'org_test',
    has: ({ role }: { role: string }) => role === ROLES.EVENT_COORDINATOR,
  });
}

function mockUpdateChain() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  return { set, where };
}

function mockSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function mockInsertChain() {
  const values = vi.fn().mockResolvedValue([]);
  return { values };
}

// Insert path: db.update x2 (deactivate owner, event metadata), db.insert x1
function setupInsertPath() {
  const deactivateUpdate = mockUpdateChain();
  const eventMetaUpdate = mockUpdateChain();
  mockDb.update
    .mockReturnValueOnce(deactivateUpdate)
    .mockReturnValueOnce(eventMetaUpdate);
  mockDb.select.mockReturnValue(mockSelectChain([]));
  const insert = mockInsertChain();
  mockDb.insert.mockReturnValue(insert);
  return { deactivateUpdate, eventMetaUpdate, insert };
}

// Reactivate path: db.update x3 (deactivate owner, reactivate, event metadata), no insert
function setupReactivatePath() {
  const deactivateUpdate = mockUpdateChain();
  const reactivateUpdate = mockUpdateChain();
  const eventMetaUpdate = mockUpdateChain();
  mockDb.update
    .mockReturnValueOnce(deactivateUpdate)
    .mockReturnValueOnce(reactivateUpdate)
    .mockReturnValueOnce(eventMetaUpdate);
  mockDb.select.mockReturnValue(mockSelectChain([{ id: EXISTING_ROW_ID }]));
  return { deactivateUpdate, reactivateUpdate, eventMetaUpdate };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('transferEventOwnership — RBAC (spec req 1)', () => {
  it('rejects unauthenticated callers', async () => {
    mockAuth.mockResolvedValue({ userId: null, has: undefined });
    const result = await transferEventOwnership(EVENT_ID, NEW_OWNER_ID);
    expect(result).toEqual({ ok: false, error: 'Not authenticated' });
  });

  it('rejects non-super-admin (event coordinator)', async () => {
    authAsCoordinator();
    const result = await transferEventOwnership(EVENT_ID, NEW_OWNER_ID);
    expect(result).toEqual({
      ok: false,
      error: 'Forbidden: only Super Admin can transfer event ownership',
    });
  });

  it('allows super admin to proceed', async () => {
    authAsSuperAdmin();
    setupInsertPath();
    const result = await transferEventOwnership(EVENT_ID, NEW_OWNER_ID);
    expect(result.ok).toBe(true);
  });
});

describe('transferEventOwnership — input validation', () => {
  it('rejects a non-UUID eventId', async () => {
    authAsSuperAdmin();
    const result = await transferEventOwnership('not-a-uuid', NEW_OWNER_ID);
    expect(result).toEqual({ ok: false, error: 'Invalid event ID' });
  });

  it('rejects an empty newOwnerUserId', async () => {
    authAsSuperAdmin();
    const result = await transferEventOwnership(EVENT_ID, '');
    expect(result).toEqual({ ok: false, error: 'New owner user ID is required' });
  });

  it('rejects a whitespace-only newOwnerUserId', async () => {
    authAsSuperAdmin();
    const result = await transferEventOwnership(EVENT_ID, '   ');
    expect(result).toEqual({ ok: false, error: 'New owner user ID is required' });
  });
});

describe('transferEventOwnership — ownership mutations (spec req 2–5)', () => {
  it('deactivates the current active owner assignment (req 2)', async () => {
    authAsSuperAdmin();
    const { deactivateUpdate } = setupInsertPath();
    await transferEventOwnership(EVENT_ID, NEW_OWNER_ID);
    expect(deactivateUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
  });

  it('inserts a new owner assignment when new owner has no existing record (req 3)', async () => {
    authAsSuperAdmin();
    const { insert } = setupInsertPath();
    await transferEventOwnership(EVENT_ID, NEW_OWNER_ID);
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: EVENT_ID,
        authUserId: NEW_OWNER_ID,
        assignmentType: 'owner',
      }),
    );
  });

  it('reactivates an existing assignment for new owner when record exists (req 3)', async () => {
    authAsSuperAdmin();
    const { reactivateUpdate } = setupReactivatePath();
    await transferEventOwnership(EVENT_ID, NEW_OWNER_ID);
    expect(reactivateUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: true,
        assignmentType: 'owner',
        assignedBy: ACTOR_ID,
      }),
    );
  });

  it('updates event.updatedBy to the acting super admin (req 4)', async () => {
    authAsSuperAdmin();
    const { eventMetaUpdate } = setupInsertPath();
    await transferEventOwnership(EVENT_ID, NEW_OWNER_ID);
    expect(eventMetaUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({ updatedBy: ACTOR_ID }),
    );
  });

  it('only deactivates owner-type rows — does not touch collaborators (req 5)', async () => {
    authAsSuperAdmin();
    setupInsertPath();
    await transferEventOwnership(EVENT_ID, NEW_OWNER_ID);
    // Insert path: deactivate(owner) + eventMetadata = 2 updates only
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });

  it('revalidates the event team and workspace paths', async () => {
    authAsSuperAdmin();
    setupInsertPath();
    await transferEventOwnership(EVENT_ID, NEW_OWNER_ID);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}/team`);
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/events/${EVENT_ID}`);
  });

  it('scopes all assignment queries to the correct eventId (req: event-scoped)', async () => {
    authAsSuperAdmin();
    setupInsertPath();
    await transferEventOwnership(EVENT_ID, NEW_OWNER_ID);
    // withEventScope must be called with the correct eventId every time
    expect(mockWithEventScope.mock.calls.every((args) => args[1] === EVENT_ID)).toBe(true);
    expect(mockWithEventScope).toHaveBeenCalled();
  });
});
