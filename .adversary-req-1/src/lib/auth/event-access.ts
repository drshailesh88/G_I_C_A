'use server';

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { eventUserAssignments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { ROLES } from './roles';

export type EventAccessResult = {
  authorized: boolean;
  userId: string;
  role: string | null;
};

/**
 * Resolve the current user's Clerk org role from the auth session.
 * Returns the first matching role from the Clerk org membership.
 */
async function resolveClerkRole(): Promise<{
  userId: string;
  role: string | null;
  isSuperAdmin: boolean;
}> {
  const session = await auth();
  const userId = session.userId;
  if (!userId) {
    return { userId: '', role: null, isSuperAdmin: false };
  }

  // Check roles via has() — Clerk org role check
  const isSuperAdmin = session.has?.({ role: ROLES.SUPER_ADMIN }) ?? false;
  const isCoordinator = session.has?.({ role: ROLES.EVENT_COORDINATOR }) ?? false;
  const isOps = session.has?.({ role: ROLES.OPS }) ?? false;
  const isReadOnly = session.has?.({ role: ROLES.READ_ONLY }) ?? false;

  let role: string | null = null;
  if (isSuperAdmin) role = ROLES.SUPER_ADMIN;
  else if (isCoordinator) role = ROLES.EVENT_COORDINATOR;
  else if (isOps) role = ROLES.OPS;
  else if (isReadOnly) role = ROLES.READ_ONLY;

  return { userId, role, isSuperAdmin };
}

/**
 * Check if the current user has access to a specific event.
 * Super Admin bypasses — sees all events.
 * Other roles: must have an active row in event_user_assignments.
 */
export async function checkEventAccess(eventId: string): Promise<EventAccessResult> {
  const { userId, role, isSuperAdmin } = await resolveClerkRole();

  if (!userId) {
    return { authorized: false, userId: '', role: null };
  }

  // No recognized Clerk role → deny access regardless of assignment
  if (!role) {
    return { authorized: false, userId, role: null };
  }

  // Super Admin bypasses event-level assignment check
  if (isSuperAdmin) {
    return { authorized: true, userId, role };
  }

  // All other roles: check event_user_assignments
  const [assignment] = await db
    .select()
    .from(eventUserAssignments)
    .where(
      and(
        eq(eventUserAssignments.eventId, eventId),
        eq(eventUserAssignments.authUserId, userId),
        eq(eventUserAssignments.isActive, true),
      ),
    )
    .limit(1);

  if (!assignment) {
    return { authorized: false, userId, role };
  }

  return { authorized: true, userId, role };
}

/** Roles that can perform write operations */
const WRITE_ROLES: ReadonlySet<string> = new Set([ROLES.SUPER_ADMIN, ROLES.EVENT_COORDINATOR, ROLES.OPS]);

/**
 * Assert event access — throws if unauthorized.
 * Use in server actions and API routes before any data access.
 * Pass requireWrite: true for mutations to block read-only users.
 */
export async function assertEventAccess(
  eventId: string,
  options?: { requireWrite?: boolean },
): Promise<{ userId: string; role: string | null }> {
  const result = await checkEventAccess(eventId);
  if (!result.authorized) {
    throw new Error('Forbidden: you do not have access to this event');
  }

  if (options?.requireWrite && (!result.role || !WRITE_ROLES.has(result.role as string))) {
    throw new Error('Forbidden: read-only users cannot perform write operations');
  }

  return { userId: result.userId, role: result.role };
}

/**
 * Get the current user's auth context for event listing.
 * Returns isSuperAdmin flag so callers can decide query strategy.
 */
export async function getEventListContext(): Promise<{
  userId: string;
  role: string | null;
  isSuperAdmin: boolean;
}> {
  return resolveClerkRole();
}
