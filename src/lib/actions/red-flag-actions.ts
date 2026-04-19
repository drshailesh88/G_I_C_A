'use server';

import { assertEventAccess } from '@/lib/auth/event-access';
import { reviewRedFlag, resolveRedFlag } from '@/lib/cascade/red-flags';
import { ROLES } from '@/lib/auth/roles';

const RED_FLAG_WRITE_ROLES = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.OPS,
]);

function assertRedFlagWriteRole(role: string | null | undefined) {
  if (!role) {
    return;
  }

  if (!RED_FLAG_WRITE_ROLES.has(role)) {
    throw new Error('Forbidden');
  }
}

export async function reviewFlag(eventId: string, flagId: string) {
  const { userId, role } = await assertEventAccess(eventId, { requireWrite: true });
  assertRedFlagWriteRole(role);
  return reviewRedFlag(eventId, flagId, userId);
}

export async function resolveFlag(eventId: string, flagId: string, resolutionNote?: string) {
  const { userId, role } = await assertEventAccess(eventId, { requireWrite: true });
  assertRedFlagWriteRole(role);
  return resolveRedFlag(eventId, flagId, userId, resolutionNote);
}
