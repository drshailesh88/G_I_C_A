import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockDb } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/db/with-event-scope', () => ({
  withEventScope: vi.fn(),
}));

import { createEventAssignment } from './event-assignments';
import { ROLES } from '@/lib/auth/roles';

const EVENT_ID = '550e8400-e29b-41d4-a716-446655440001';

function authAsSuperAdmin() {
  mockAuth.mockResolvedValue({
    userId: 'user_superadmin',
    orgId: 'org_test',
    has: ({ role }: { role: string }) => role === ROLES.SUPER_ADMIN,
  });
}

function chainedSelect(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
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

describe('createEventAssignment adversarial coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject whitespace-only auth user ids', async () => {
    authAsSuperAdmin();
    chainedSelect([]);
    chainedInsert();

    // BUG: whitespace-only Clerk user ids pass validation and create an unusable event assignment.
    const result = await createEventAssignment({
      eventId: EVENT_ID,
      authUserId: '   ',
      assignmentType: 'collaborator',
    });

    expect(result.ok).toBe(false);
  });
});
