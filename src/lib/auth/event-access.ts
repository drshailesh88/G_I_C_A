import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { eventUserAssignments, events } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { ROLES } from './roles';

export class EventNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = 'EVENT_NOT_FOUND';

  constructor() {
    super('Not found');
    this.name = 'EventNotFoundError';
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor() {
    super('forbidden');
    this.name = 'ForbiddenError';
  }
}

export class EventArchivedError extends Error {
  readonly statusCode = 400;
  constructor() {
    super('Event is archived — mutations are blocked');
    this.name = 'EventArchivedError';
  }
}

export type EventAccessResult = {
  authorized: boolean;
  userId: string;
  role: string | null;
};

function mapAssignmentTypeToRole(assignmentType: string | null | undefined): string | null {
  if (assignmentType === 'owner') return ROLES.EVENT_COORDINATOR;
  if (assignmentType === 'collaborator') return ROLES.READ_ONLY;
  return null;
}

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
  const { userId, role: clerkRole, isSuperAdmin } = await resolveClerkRole();

  if (!userId) {
    return { authorized: false, userId: '', role: null };
  }

  // Super Admin bypasses event-level assignment check
  if (isSuperAdmin) {
    return { authorized: true, userId, role: clerkRole };
  }

  // Fall back to per-event assignments when Clerk org roles are unavailable.
  const [assignment] = await db
    .select({
      assignmentType: eventUserAssignments.assignmentType,
    })
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
    return { authorized: false, userId, role: clerkRole };
  }

  const role = clerkRole ?? mapAssignmentTypeToRole(assignment.assignmentType);
  if (!role) {
    return { authorized: false, userId, role: null };
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
    throw new EventNotFoundError();
  }

  if (options?.requireWrite && (!result.role || !WRITE_ROLES.has(result.role as string))) {
    throw new ForbiddenError();
  }

  if (options?.requireWrite) {
    const [event] = await db
      .select({ status: events.status })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    if (event?.status === 'archived') {
      throw new EventArchivedError();
    }
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
  const resolved = await resolveClerkRole();
  if (!resolved.userId || resolved.role || resolved.isSuperAdmin) {
    return resolved;
  }

  const [assignment] = await db
    .select({
      assignmentType: eventUserAssignments.assignmentType,
    })
    .from(eventUserAssignments)
    .where(
      and(
        eq(eventUserAssignments.authUserId, resolved.userId),
        eq(eventUserAssignments.isActive, true),
      ),
    )
    .limit(1);

  return {
    ...resolved,
    role: mapAssignmentTypeToRole(assignment?.assignmentType),
  };
}
