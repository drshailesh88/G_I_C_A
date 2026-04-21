import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { eventUserAssignments, events } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { eventIdSchema } from '@/lib/validations/event';
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
  eventStatus?: string | null;
};

function mapAssignmentTypeToRole(assignmentType: string | null | undefined): string | null {
  if (assignmentType === 'owner') return ROLES.EVENT_COORDINATOR;
  if (assignmentType === 'collaborator') return ROLES.READ_ONLY;
  return null;
}

const VALID_ROLE_VALUES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
  ROLES.OPS,
  ROLES.READ_ONLY,
]);

/**
 * Normalize an appRole value read from user publicMetadata into a
 * canonical ROLES value (e.g. "super_admin" -> "org:super_admin").
 * Returns null when the value is missing or not a recognized role.
 */
function normalizeAppRole(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const prefixed = raw.startsWith('org:') ? raw : `org:${raw}`;
  return VALID_ROLE_VALUES.has(prefixed) ? prefixed : null;
}

/**
 * Resolve the current user's app role from the Clerk session.
 * The Clerk dashboard is configured to include `user.public_metadata` in the
 * session token under the `metadata` claim; the app role is stored there
 * under `appRole`.
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

  const claims = (session as { sessionClaims?: Record<string, unknown> }).sessionClaims;
  const metadata = claims?.metadata as { appRole?: unknown } | undefined;
  const rawAppRole = metadata?.appRole;

  const role = normalizeAppRole(rawAppRole);
  const isSuperAdmin = role === ROLES.SUPER_ADMIN;

  return { userId, role, isSuperAdmin };
}

function isValidEventId(eventId: string): boolean {
  return eventIdSchema.safeParse(eventId).success;
}

async function getEventStatus(eventId: string): Promise<string | null> {
  const [event] = await db
    .select({ status: events.status })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  return event?.status ?? null;
}

/**
 * Check if the current user has access to a specific event.
 * Super Admin bypasses — sees all events.
 * Other roles: must have an active row in event_user_assignments.
 */
export async function checkEventAccess(eventId: string): Promise<EventAccessResult> {
  if (!isValidEventId(eventId)) {
    return { authorized: false, userId: '', role: null };
  }

  const { userId, role: clerkRole, isSuperAdmin } = await resolveClerkRole();

  if (!userId) {
    return { authorized: false, userId: '', role: null };
  }

  // Super Admin bypasses event-level assignment checks, but the target event
  // still needs to exist so downstream callers don't operate on phantom scopes.
  if (isSuperAdmin) {
    const eventStatus = await getEventStatus(eventId);
    if (!eventStatus) {
      return { authorized: false, userId, role: clerkRole };
    }

    return { authorized: true, userId, role: clerkRole, eventStatus };
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

/** Roles allowed to read event-management surfaces (people, registration, branding, exports) — excludes Ops. */
const EVENT_MANAGEMENT_READ_ROLES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
  ROLES.READ_ONLY,
]);

/** Roles allowed to mutate event-management surfaces — excludes Ops and Read-only. */
const EVENT_MANAGEMENT_WRITE_ROLES: ReadonlySet<string> = new Set([
  ROLES.SUPER_ADMIN,
  ROLES.EVENT_COORDINATOR,
]);

/**
 * Post-assertion guard for event-management surfaces (registration, branding,
 * exports, people-detail) where Ops must be blocked even though Ops has
 * generic event write access. Call this immediately after assertEventAccess.
 */
export function assertEventManagementRole(
  role: string | null | undefined,
  options?: { requireWrite?: boolean },
): void {
  const roleSet = options?.requireWrite ? EVENT_MANAGEMENT_WRITE_ROLES : EVENT_MANAGEMENT_READ_ROLES;
  if (!role || !roleSet.has(role)) {
    throw new Error('Forbidden');
  }
}

/**
 * Assert event access — throws if unauthorized.
 * Use in server actions and API routes before any data access.
 * Pass requireWrite: true for mutations to block read-only users.
 * Pass surface: 'event_management' for non-logistics surfaces to block Ops.
 */
export async function assertEventAccess(
  eventId: string,
  options?: { requireWrite?: boolean; surface?: 'event_management' },
): Promise<{ userId: string; role: string | null }> {
  const result = await checkEventAccess(eventId);
  if (!result.authorized) {
    throw new EventNotFoundError();
  }

  if (options?.surface === 'event_management') {
    const roleSet = options.requireWrite ? EVENT_MANAGEMENT_WRITE_ROLES : EVENT_MANAGEMENT_READ_ROLES;
    if (!result.role || !roleSet.has(result.role as string)) {
      throw new ForbiddenError();
    }
  } else if (options?.requireWrite && (!result.role || !WRITE_ROLES.has(result.role as string))) {
    throw new ForbiddenError();
  }

  if (options?.requireWrite) {
    const eventStatus = result.eventStatus ?? await getEventStatus(eventId);
    if (!eventStatus) {
      throw new EventNotFoundError();
    }

    if (eventStatus === 'archived') {
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
